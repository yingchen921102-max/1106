import { Prisma, SyncOutbox } from "@prisma/client";
import { db } from "./db.js";
import { enqueueSync } from "./queue.js";

type OutboxInput = {
  userId: string;
  provider: "GOOGLE" | "NOTION";
  action: string;
  idempotencyKey: string;
  payload: Prisma.InputJsonObject;
};

export async function persistProviderSync(tx: Prisma.TransactionClient, input: OutboxInput) {
  return tx.syncOutbox.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: {
      userId: input.userId, provider: input.provider, action: input.action,
      idempotencyKey: input.idempotencyKey, payload: input.payload,
    },
    update: {},
  });
}

export async function dispatchProviderSync(row: SyncOutbox) {
  if (row.status !== "SUCCEEDED" && row.status !== "FAILED") {
    await enqueueSync({
      outboxId: row.id, provider: row.provider, userId: row.userId, action: row.action,
      payload: row.payload as Record<string, unknown>,
    });
  }
  return row;
}

// Convenience for standalone syncs. For a habit update, call persistProviderSync inside the same
// Prisma transaction as the habit change, then call dispatchProviderSync after commit.
export async function enqueueProviderSync(input: OutboxInput) {
  const row = await persistProviderSync(db, input);
  return dispatchProviderSync(row);
}
