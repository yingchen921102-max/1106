import { Queue } from "bullmq";
import IORedis from "ioredis";

export const redis = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
export const syncQueue = new Queue("integration-sync", { connection: redis });

export async function enqueueSync(input: {
  outboxId: string; provider: "GOOGLE" | "NOTION"; userId: string; action: string; payload: Record<string, unknown>;
}) {
  await syncQueue.add(`${input.provider}:${input.action}`, input, {
    jobId: input.outboxId,
    attempts: 8,
    backoff: { type: "exponential", delay: 2_000 },
    removeOnComplete: { age: 7 * 24 * 3600 },
    removeOnFail: false,
  });
}
