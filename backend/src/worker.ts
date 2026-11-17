import "dotenv/config";
import { Worker, Job } from "bullmq";
import { db } from "./db.js";
import { redis } from "./queue.js";
import { calendarOccurrenceId, insertOneOffHabitEvent, insertWeeklyHabitSeries, markGoogleEventDone, markCalendarOccurrenceDone } from "./calendar.js";
import { upsertHabitOccurrenceInNotion } from "./notion.js";
import { isPermanentProviderError } from "./retry.js";

type SyncJob = {
  outboxId: string;
  provider: "GOOGLE" | "NOTION";
  userId: string;
  action: string;
  payload: Record<string, any>;
};

async function processSync(job: Job<SyncJob>) {
  const data = job.data;
  await db.syncOutbox.update({ where: { id: data.outboxId }, data: { status: "PROCESSING", attempts: { increment: 1 } } });
  try {
    let external: any;
    if (data.provider === "GOOGLE" && data.action === "create-weekly-series") {
      external = await insertWeeklyHabitSeries({ ...data.payload, start: new Date(data.payload.start), end: new Date(data.payload.end), userId: data.userId });
    } else if (data.provider === "GOOGLE" && data.action === "create-one-off-event") {
      external = await insertOneOffHabitEvent({ ...data.payload, start: new Date(data.payload.start), end: new Date(data.payload.end), userId: data.userId });
    } else if (data.provider === "GOOGLE" && data.action === "complete-one-off-event") {
      external = await markGoogleEventDone({ ...data.payload, eventId: calendarOccurrenceId(data.userId, data.payload.habitId, data.payload.occurrenceDate), userId: data.userId });
    } else if (data.provider === "GOOGLE" && data.action === "complete-occurrence") {
      external = await markCalendarOccurrenceDone({ ...data.payload, userId: data.userId });
    } else if (data.provider === "NOTION" && data.action === "upsert-occurrence") {
      external = await upsertHabitOccurrenceInNotion({ ...data.payload, userId: data.userId });
      if (data.payload.occurrenceId) await db.scheduleOccurrence.update({ where: { id: data.payload.occurrenceId }, data: { notionPageId: external.id } });
    } else {
      throw new Error(`Unsupported sync operation: ${data.provider}/${data.action}`);
    }
    await db.syncOutbox.update({ where: { id: data.outboxId }, data: { status: "SUCCEEDED", lastError: null } });
    return external;
  } catch (error) {
    const permanent = isPermanentProviderError(error);
    await db.syncOutbox.update({ where: { id: data.outboxId }, data: {
      status: permanent ? "FAILED" : "RETRYING",
      lastError: error instanceof Error ? error.message.slice(0, 2000) : "Unknown sync failure",
    } });
    if (permanent) return { failed: true, reason: error instanceof Error ? error.message : "Provider rejected the request" };
    throw error; // BullMQ applies durable exponential backoff; failed jobs remain inspectable.
  }
}

const worker = new Worker<SyncJob>("integration-sync", processSync, {
  connection: redis,
  concurrency: 4,
  // Conservative shared provider limit; production can shard by provider/user connection.
  limiter: { max: 3, duration: 1000 },
});

worker.on("failed", async (job, error) => {
  if (!job) return;
  const exhausted = job.attemptsMade >= Number(job.opts.attempts ?? 1);
  await db.syncOutbox.update({ where: { id: job.data.outboxId }, data: {
    status: exhausted ? "FAILED" : "RETRYING",
    lastError: error.message.slice(0, 2000),
  } });
});

worker.on("error", (error) => console.error("Sync worker error", error));

async function shutdown() {
  await worker.close();
  await redis.quit();
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
