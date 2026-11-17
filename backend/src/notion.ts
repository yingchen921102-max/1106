import { db } from "./db.js";
import { open } from "./vault.js";
import { withProviderRetry } from "./retry.js";

const VERSION = "2022-06-28";
const API = "https://api.notion.com/v1";

async function notionRequest(token: string, path: string, init: RequestInit = {}) {
  return withProviderRetry(async () => {
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": VERSION, "Content-Type": "application/json", ...init.headers },
    });
    const body = await response.json().catch(() => ({})) as any;
    if (!response.ok) {
      const error = new Error(`Notion ${response.status}: ${body.message ?? "request failed"}`) as Error & { status: number; headers: Headers };
      error.status = response.status;
      error.headers = response.headers;
      throw error;
    }
    return body;
  });
}

async function getTokenAndDatabase(userId: string) {
  const link = await db.integration.findUnique({ where: { userId_provider: { userId, provider: "NOTION" } } });
  if (!link?.accessTokenCiphertext || !link.accessTokenNonce || !link.notionDatabaseId) throw new Error("Choose a Notion database before syncing");
  return {
    token: open(link.accessTokenCiphertext, link.accessTokenNonce),
    databaseId: link.notionDatabaseId,
    completionType: link.notionCompletionPropertyType ?? "status",
  };
}

async function findPageBySyncKey(token: string, databaseId: string, syncKey: string) {
  const result = await notionRequest(token, `/databases/${databaseId}/query`, {
    method: "POST", body: JSON.stringify({ filter: { property: "App Sync Key", rich_text: { equals: syncKey } }, page_size: 1 }),
  });
  return result.results?.[0]?.id as string | undefined;
}

export async function upsertHabitOccurrenceInNotion(input: {
  userId: string; syncKey: string; habitName: string; frequency: string; expectedHours: number;
  status: "待開始" | "已完成" | "跳過"; executionDate: string;
}) {
  const { token, databaseId, completionType } = await getTokenAndDatabase(input.userId);
  const existingId = await findPageBySyncKey(token, databaseId, input.syncKey);
  const properties = {
    "習慣名稱": { title: [{ text: { content: input.habitName } }] },
    "執行頻率": { select: { name: input.frequency } },
    "預計累積時數": { number: input.expectedHours },
    "完成狀態": completionType === "checkbox"
      ? { checkbox: input.status === "已完成" }
      : { status: { name: input.status } },
    "執行日期": { date: { start: input.executionDate } },
    "App Sync Key": { rich_text: [{ text: { content: input.syncKey } }] },
  };
  if (existingId) return notionRequest(token, `/pages/${existingId}`, { method: "PATCH", body: JSON.stringify({ properties }) });
  return notionRequest(token, "/pages", { method: "POST", body: JSON.stringify({ parent: { database_id: databaseId }, properties }) });
}

// Optional webhook/update path: validate the Notion signature before calling this, then map only status fields.
export async function updateOccurrenceStatusInNotion(userId: string, pageId: string, status: "待開始" | "已完成" | "跳過") {
  const { token, completionType } = await getTokenAndDatabase(userId);
  const value = completionType === "checkbox" ? { checkbox: status === "已完成" } : { status: { name: status } };
  return notionRequest(token, `/pages/${pageId}`, { method: "PATCH", body: JSON.stringify({ properties: { "完成狀態": value } }) });
}

export async function validateNotionDatabase(userId: string, databaseId: string) {
  const link = await db.integration.findUnique({ where: { userId_provider: { userId, provider: "NOTION" } } });
  if (!link?.accessTokenCiphertext || !link.accessTokenNonce) throw new Error("Notion is not connected");
  const token = open(link.accessTokenCiphertext, link.accessTokenNonce);
  const database = await notionRequest(token, `/databases/${databaseId}`);
  const properties = database.properties ?? {};
  const expected: Record<string, string[]> = {
    "習慣名稱": ["title"], "執行頻率": ["select"], "預計累積時數": ["number"],
    "完成狀態": ["status", "checkbox"], "執行日期": ["date"], "App Sync Key": ["rich_text"],
  };
  const errors = Object.entries(expected).flatMap(([name, types]) => {
    if (!properties[name]) return [`缺少欄位：${name}`];
    if (!types.includes(properties[name].type)) return [`${name} 欄位必須為 ${types.join(" 或 ")}`];
    return [];
  });
  if (errors.length) throw new Error(`Notion 資料庫欄位不符：${errors.join("；")}`);
  return {
    id: database.id,
    title: database.title?.map((part: any) => part.plain_text).join("") ?? "",
    completionType: properties["完成狀態"].type as string,
  };
}
