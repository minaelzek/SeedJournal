import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accountDataKeys } from "@/db/schema";
import {
  base64ToBytes,
  bytesToBase64,
  copyArrayBuffer,
  wipeBytes,
} from "@/lib/crypto/encoding";
import { allowDevAuth } from "./dev-auth";
import { loadMasterWrapKey } from "./wrap-key";

const KEY_AAD = new TextEncoder().encode("SeedJournal|account-key|1");

function workerEnv(): { ACCOUNT_WRAP_KEY?: string } {
  return env as unknown as { ACCOUNT_WRAP_KEY?: string };
}

function masterWrapKey(): Promise<CryptoKey> {
  return loadMasterWrapKey(workerEnv().ACCOUNT_WRAP_KEY, allowDevAuth());
}

export async function ensureAccountDataKey(accountId: string): Promise<string> {
  const existing = await unwrapAccountDataKey(accountId);
  if (existing) return existing;

  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  try {
    const wrappingKey = await masterWrapKey();
    const wrapped = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: copyArrayBuffer(wrapIv),
        additionalData: copyArrayBuffer(KEY_AAD),
        tagLength: 128,
      },
      wrappingKey,
      copyArrayBuffer(rawKey),
    );
    const now = Date.now();
    const db = getDb();
    await db
      .insert(accountDataKeys)
      .values({
        accountId,
        wrapAlgorithm: "AES-256-GCM",
        wrapIv: bytesToBase64(wrapIv),
        wrappedKey: bytesToBase64(new Uint8Array(wrapped)),
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: accountDataKeys.accountId });
    const stored = await unwrapAccountDataKey(accountId);
    if (!stored) throw new Error("Account data key could not be created.");
    return stored;
  } finally {
    wipeBytes(rawKey);
    wipeBytes(wrapIv);
  }
}

export async function unwrapAccountDataKey(
  accountId: string,
): Promise<string | null> {
  const db = getDb();
  const record = await db.query.accountDataKeys.findFirst({
    where: eq(accountDataKeys.accountId, accountId),
  });
  if (!record) return null;
  const iv = base64ToBytes(record.wrapIv);
  const wrapped = base64ToBytes(record.wrappedKey);
  let raw: Uint8Array | null = null;
  try {
    const wrappingKey = await masterWrapKey();
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: copyArrayBuffer(iv),
        additionalData: copyArrayBuffer(KEY_AAD),
        tagLength: 128,
      },
      wrappingKey,
      copyArrayBuffer(wrapped),
    );
    raw = new Uint8Array(decrypted);
    if (raw.byteLength !== 32) throw new Error("Invalid account data key.");
    return bytesToBase64(raw);
  } finally {
    wipeBytes(iv);
    wipeBytes(wrapped);
    if (raw) wipeBytes(raw);
  }
}
