import "dotenv/config";
import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { db } from "./db.js";
import { registerIntegrationRoutes } from "./integrations.js";
import { registerInspirationRoutes } from "./inspiration.js";
import { registerPlanningRoutes } from "./planning.js";

initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID });
const app = Fastify({ logger: true, trustProxy: true });
if (!process.env.APP_ORIGIN) throw new Error("APP_ORIGIN must be set to the trusted frontend origin");
await app.register(cors, {
  origin: process.env.APP_ORIGIN,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Authorization", "Content-Type"],
});

async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const match = request.headers.authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) return reply.code(401).send({ error: "unauthorized" });
  try {
    const identity = await getAuth().verifyIdToken(match[1]);
    (request as FastifyRequest & { userId: string }).userId = identity.uid;
    await db.user.upsert({ where: { id: identity.uid }, create: { id: identity.uid }, update: {} });
  } catch {
    return reply.code(401).send({ error: "invalid_token" });
  }
}

await registerIntegrationRoutes(app, requireAuth);
await registerInspirationRoutes(app, requireAuth);
await registerPlanningRoutes(app, requireAuth);
app.get("/health", async () => ({ ok: true }));

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: "0.0.0.0" });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await app.close();
    await db.$disconnect();
    process.exit(0);
  });
}
