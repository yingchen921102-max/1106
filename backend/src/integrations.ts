import { createHash, randomBytes } from "node:crypto";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { google } from "googleapis";
import { db } from "./db.js";
import { open, seal } from "./vault.js";
import { withProviderRetry } from "./retry.js";
import { validateNotionDatabase } from "./notion.js";
import { enqueueProviderSync } from "./outbox.js";
import { calendarSeriesId } from "./calendar.js";

const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const notionVersion = "2022-06-28";
type AuthRequest = FastifyRequest & { userId: string };
const appBaseUrl = () => (process.env.APP_BASE_URL || process.env.APP_ORIGIN || "").replace(/\/+$/, "");

function googleOAuth() {
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
}

async function createState(userId: string, provider: "GOOGLE" | "NOTION") {
  const state = randomBytes(32).toString("base64url");
  await db.oAuthState.create({ data: { stateHash: createHash("sha256").update(state).digest("hex"), userId, provider, expiresAt: new Date(Date.now() + 10 * 60_000) } });
  return state;
}

async function consumeState(state: string, provider: "GOOGLE" | "NOTION") {
  const stateHash = createHash("sha256").update(state).digest("hex");
  const row = await db.oAuthState.findUnique({ where: { stateHash } });
  if (!row || row.provider !== provider || row.expiresAt < new Date()) throw new Error("OAuth state is invalid or expired");
  await db.oAuthState.delete({ where: { stateHash } });
  return row.userId;
}

async function saveIntegration(userId: string, provider: "GOOGLE" | "NOTION", values: {
  accessToken: string; refreshToken?: string; expiresAt?: Date; scopes?: string[]; accountId?: string;
}) {
  const access = seal(values.accessToken);
  const refresh = values.refreshToken ? seal(values.refreshToken) : undefined;
  await db.integration.upsert({
    where: { userId_provider: { userId, provider } },
    create: {
      userId, provider, providerAccountId: values.accountId, accessTokenCiphertext: access.ciphertext,
      accessTokenNonce: access.nonce, refreshTokenCiphertext: refresh?.ciphertext, refreshTokenNonce: refresh?.nonce,
      tokenKeyVersion: access.keyVersion, accessTokenExpiresAt: values.expiresAt, grantedScopes: values.scopes ?? [],
    },
    update: {
      providerAccountId: values.accountId, accessTokenCiphertext: access.ciphertext, accessTokenNonce: access.nonce,
      ...(refresh ? { refreshTokenCiphertext: refresh.ciphertext, refreshTokenNonce: refresh.nonce } : {}),
      tokenKeyVersion: access.keyVersion, accessTokenExpiresAt: values.expiresAt, grantedScopes: values.scopes ?? [],
    },
  });
}

export async function registerIntegrationRoutes(app: FastifyInstance, requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>) {
  app.get("/integrations/google/authorize-url", { preHandler: requireAuth }, async (request: AuthRequest) => {
    const state = await createState(request.userId, "GOOGLE");
    const authorizationUrl = googleOAuth().generateAuthUrl({ access_type: "offline", include_granted_scopes: true, prompt: "consent", scope: [GOOGLE_SCOPE], state });
    return { authorizationUrl };
  });

  app.get("/integrations/google/start", { preHandler: requireAuth }, async (request: AuthRequest, reply) => {
    const state = await createState(request.userId, "GOOGLE");
    const url = googleOAuth().generateAuthUrl({ access_type: "offline", include_granted_scopes: true, prompt: "consent", scope: [GOOGLE_SCOPE], state });
    return reply.redirect(url);
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>("/integrations/google/callback", async (request, reply) => {
    if (request.query.error || !request.query.code || !request.query.state) return reply.code(400).send("Google 授權未完成");
    try {
      const userId = await consumeState(request.query.state, "GOOGLE");
      const client = googleOAuth();
      const { tokens } = await client.getToken(request.query.code);
      if (!tokens.access_token) throw new Error("Google did not return an access token");
      if (!tokens.scope?.split(" ").includes(GOOGLE_SCOPE)) throw new Error("Google Calendar permission was not granted");
      await saveIntegration(userId, "GOOGLE", {
        accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? undefined,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
        scopes: tokens.scope?.split(" ") ?? [GOOGLE_SCOPE],
      });
      return reply.redirect(`${appBaseUrl()}/?integration=google-connected`);
    } catch (error) {
      request.log.error(error);
      return reply.code(400).send("Google 授權失敗，請重新連結。");
    }
  });

  app.get("/integrations/notion/authorize-url", { preHandler: requireAuth }, async (request: AuthRequest) => {
    const state = await createState(request.userId, "NOTION");
    const url = new URL("https://api.notion.com/v1/oauth/authorize");
    url.searchParams.set("client_id", process.env.NOTION_CLIENT_ID!);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("owner", "user");
    url.searchParams.set("redirect_uri", process.env.NOTION_REDIRECT_URI!);
    url.searchParams.set("state", state);
    return { authorizationUrl: url.toString() };
  });

  app.get("/integrations/notion/start", { preHandler: requireAuth }, async (request: AuthRequest, reply) => {
    const state = await createState(request.userId, "NOTION");
    const url = new URL("https://api.notion.com/v1/oauth/authorize");
    url.searchParams.set("client_id", process.env.NOTION_CLIENT_ID!);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("owner", "user");
    url.searchParams.set("redirect_uri", process.env.NOTION_REDIRECT_URI!);
    url.searchParams.set("state", state);
    return reply.redirect(url.toString());
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>("/integrations/notion/callback", async (request, reply) => {
    if (request.query.error || !request.query.code || !request.query.state) return reply.code(400).send("Notion 授權未完成");
    try {
      const userId = await consumeState(request.query.state, "NOTION");
      const basic = Buffer.from(`${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`).toString("base64");
      const response = await fetch("https://api.notion.com/v1/oauth/token", {
        method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json", "Notion-Version": notionVersion },
        body: JSON.stringify({ grant_type: "authorization_code", code: request.query.code, redirect_uri: process.env.NOTION_REDIRECT_URI }),
      });
      const token = await response.json() as any;
      if (!response.ok || !token.access_token) throw new Error(`Notion token exchange failed (${response.status})`);
      await saveIntegration(userId, "NOTION", { accessToken: token.access_token, accountId: token.workspace_id });
      return reply.redirect(`${appBaseUrl()}/?integration=notion-connected`);
    } catch (error) {
      request.log.error(error);
      return reply.code(400).send("Notion 授權失敗，請重新連結。");
    }
  });

  app.get("/integrations/notion/databases", { preHandler: requireAuth }, async (request: AuthRequest, reply) => {
    const integration = await db.integration.findUnique({ where: { userId_provider: { userId: request.userId, provider: "NOTION" } } });
    if (!integration?.accessTokenCiphertext || !integration.accessTokenNonce) return reply.code(409).send({ error: "notion_not_connected" });
    const token = open(integration.accessTokenCiphertext, integration.accessTokenNonce);
    const data = await withProviderRetry(async () => {
      const response = await fetch("https://api.notion.com/v1/search", {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Notion-Version": notionVersion },
        body: JSON.stringify({ filter: { property: "object", value: "database" }, page_size: 100 }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as any;
        const error = new Error(`Notion ${response.status}: ${body.message ?? "search failed"}`) as Error & { status: number; headers: Headers };
        error.status = response.status; error.headers = response.headers; throw error;
      }
      return response.json() as Promise<any>;
    });
    return (data.results ?? []).map((item: any) => ({ id: item.id, title: item.title?.map((part: any) => part.plain_text).join("") ?? "未命名資料庫" }));
  });

  app.put<{ Body: { databaseId: string } }>("/integrations/notion/database", { preHandler: requireAuth }, async (request: AuthRequest, reply) => {
    const { databaseId } = request.body;
    if (!/^[0-9a-f-]{32,36}$/i.test(databaseId)) return reply.code(400).send({ error: "invalid_database_id" });
    try {
      const database = await validateNotionDatabase(request.userId, databaseId);
      const result = await db.integration.updateMany({
        where: { userId: request.userId, provider: "NOTION" },
        data: { notionDatabaseId: databaseId, notionCompletionPropertyType: database.completionType },
      });
      if (!result.count) return reply.code(409).send({ error: "notion_not_connected" });
      return { connected: true, databaseTitle: database.title };
    } catch (error) {
      return reply.code(422).send({ error: "notion_database_schema_invalid", message: error instanceof Error ? error.message : "驗證資料庫失敗" });
    }
  });

  app.post<{ Body: {
    habitId: string; name: string; cycleUnit: "week" | "month"; start?: string; end?: string;
    timeZone: string; durationMinutes: number; intervalWeeks?: number; weekdays?: number[];
    occurrences?: Array<{ date: string; start: string; end: string }>;
  } }>("/integrations/google/schedules", { preHandler: requireAuth }, async (request: AuthRequest, reply) => {
    const body = request.body;
    const linked = await db.integration.findUnique({ where: { userId_provider: { userId: request.userId, provider: "GOOGLE" } } });
    if (!linked?.refreshTokenCiphertext && !linked?.accessTokenCiphertext) return reply.code(409).send({ error: "google_not_connected" });
    if (!body?.habitId || !body.name || !body.timeZone || !Number.isFinite(body.durationMinutes) || body.durationMinutes < 1) return reply.code(400).send({ error: "invalid_schedule" });
    if (body.cycleUnit !== "week" && body.cycleUnit !== "month") return reply.code(400).send({ error: "invalid_cycle_unit" });
    const queued: string[] = [];
    if (body.cycleUnit === "month") {
      if (!Array.isArray(body.occurrences) || !body.occurrences.length) return reply.code(400).send({ error: "monthly_occurrences_required" });
      for (const occurrence of body.occurrences) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(occurrence.date) || Number.isNaN(Date.parse(occurrence.start)) || Number.isNaN(Date.parse(occurrence.end))) return reply.code(400).send({ error: "invalid_occurrence" });
        const payload = { habitId: body.habitId, name: body.name, occurrenceDate: occurrence.date, start: occurrence.start, end: occurrence.end, timeZone: body.timeZone };
        const revision = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 12);
        const row = await enqueueProviderSync({ userId: request.userId, provider: "GOOGLE", action: "create-one-off-event", idempotencyKey: `google:${request.userId}:${body.habitId}:${occurrence.date}:${revision}`, payload });
        queued.push(row.id);
      }
    } else {
      if (!body.start || !body.end || Number.isNaN(Date.parse(body.start)) || Number.isNaN(Date.parse(body.end)) || !Array.isArray(body.weekdays) || !body.weekdays.length || body.weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) return reply.code(400).send({ error: "invalid_weekly_schedule" });
      const payload = { habitId: body.habitId, name: body.name, start: body.start, end: body.end, timeZone: body.timeZone, durationMinutes: body.durationMinutes, intervalWeeks: body.intervalWeeks || 1, weekdays: body.weekdays };
      const revision = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 12);
      const row = await enqueueProviderSync({ userId: request.userId, provider: "GOOGLE", action: "create-weekly-series", idempotencyKey: `google:${request.userId}:${body.habitId}:series:${revision}`, payload });
      queued.push(row.id);
    }
    return reply.code(202).send({ queued: queued.length, syncIds: queued });
  });

  app.post<{ Body: {
    syncKey: string; habitName: string; frequency: string; expectedHours: number;
    status: "待開始" | "已完成" | "跳過"; executionDate: string;
  } }>("/integrations/notion/occurrences", { preHandler: requireAuth }, async (request: AuthRequest, reply) => {
    const body = request.body;
    const linked = await db.integration.findUnique({ where: { userId_provider: { userId: request.userId, provider: "NOTION" } } });
    if (!linked?.accessTokenCiphertext || !linked.notionDatabaseId) return reply.code(409).send({ error: "notion_not_ready" });
    if (!body?.syncKey || !body.habitName || !/^\d{4}-\d{2}-\d{2}$/.test(body.executionDate) || !Number.isFinite(body.expectedHours)) return reply.code(400).send({ error: "invalid_occurrence" });
    const row = await enqueueProviderSync({
      userId: request.userId, provider: "NOTION", action: "upsert-occurrence",
      idempotencyKey: `notion:${request.userId}:${body.syncKey}:${body.status}`,
      payload: { ...body },
    });
    return reply.code(202).send({ queued: true, syncId: row.id });
  });

  app.post<{ Body: {
    habitId: string; cycleUnit: "week" | "month"; occurrenceDate: string;
    occurrenceStart: string; occurrenceEnd: string; timeZone?: string;
  } }>("/integrations/google/occurrences/complete", { preHandler: requireAuth }, async (request: AuthRequest, reply) => {
    const body = request.body;
    if (!body?.habitId || !/^\d{4}-\d{2}-\d{2}$/.test(body.occurrenceDate)) return reply.code(400).send({ error: "invalid_occurrence" });
    let action: string;
    let payload: Record<string, unknown>;
    if (body.cycleUnit === "month") {
      action = "complete-one-off-event";
      payload = { habitId: body.habitId, occurrenceDate: body.occurrenceDate };
    } else {
      if (Number.isNaN(Date.parse(body.occurrenceStart)) || Number.isNaN(Date.parse(body.occurrenceEnd))) return reply.code(400).send({ error: "invalid_occurrence_time" });
      action = "complete-occurrence";
      payload = { seriesId: calendarSeriesId(request.userId, body.habitId), occurrenceStart: body.occurrenceStart, occurrenceEnd: body.occurrenceEnd };
    }
    const row = await enqueueProviderSync({ userId: request.userId, provider: "GOOGLE", action, idempotencyKey: `google:${request.userId}:${body.habitId}:${body.occurrenceDate}:done`, payload });
    return reply.code(202).send({ queued: true, syncId: row.id });
  });

  app.get("/integrations/status", { preHandler: requireAuth }, async (request: AuthRequest) => {
    const rows = await db.integration.findMany({ where: { userId: request.userId }, select: {
      provider: true, connectedAt: true, updatedAt: true, grantedScopes: true,
      notionDatabaseId: true, calendarId: true,
    } });
    const pending = await db.syncOutbox.groupBy({ by: ["provider", "status"], where: { userId: request.userId }, _count: { _all: true } });
    return {
      integrations: rows.map((row) => ({ ...row, connected: true })),
      sync: pending.map((row) => ({ provider: row.provider, status: row.status, count: row._count._all })),
    };
  });
}

export async function googleCalendarForUser(userId: string) {
  const integration = await db.integration.findUnique({ where: { userId_provider: { userId, provider: "GOOGLE" } } });
  if (!integration?.accessTokenCiphertext || !integration.accessTokenNonce) throw new Error("Google Calendar is not connected");
  const client = googleOAuth();
  client.setCredentials({
    access_token: open(integration.accessTokenCiphertext, integration.accessTokenNonce),
    refresh_token: integration.refreshTokenCiphertext && integration.refreshTokenNonce
      ? open(integration.refreshTokenCiphertext, integration.refreshTokenNonce) : undefined,
    expiry_date: integration.accessTokenExpiresAt?.getTime(),
  });
  client.on("tokens", async (tokens) => {
    if (!tokens.access_token) return;
    const access = seal(tokens.access_token);
    const refresh = tokens.refresh_token ? seal(tokens.refresh_token) : undefined;
    await db.integration.update({ where: { id: integration.id }, data: {
      accessTokenCiphertext: access.ciphertext, accessTokenNonce: access.nonce,
      ...(refresh ? { refreshTokenCiphertext: refresh.ciphertext, refreshTokenNonce: refresh.nonce } : {}),
      tokenKeyVersion: access.keyVersion, accessTokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
    } });
  });
  return { calendar: google.calendar({ version: "v3", auth: client }), calendarId: integration.calendarId };
}
