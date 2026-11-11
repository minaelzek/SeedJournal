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

const KEY_AAD = new TextEncoder().encode("SeedJournal|account-key|1");
const DEV_WRAP_MATERIAL = "seed-journal-dev-wrap-key-do-not-use-in-production";

function workerEnv(): { ACCOUNT_WRAP_KEY?: string } {
  return env as unknown as { ACCOUNT_WRAP_KEY?: string };
}

async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    copyArrayBuffer(raw),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function masterWrapKey(): Promise<CryptoKey> {
  const configured = workerEnv().ACCOUNT_WRAP_KEY?.trim();
  if (configured) {
    const raw = base64ToBytes(configured);
    try {
      if (raw.byteLength !== 32) {
        throw new Error("ACCOUNT_WRAP_KEY must be 32 bytes of standard base64.");
      }
      return await importAesKey(raw);
    } finally {
      wipeBytes(raw);
    }
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("ACCOUNT_WRAP_KEY is required in production.");
  }
  const material = new TextEncoder().encode(DEV_WRAP_MATERIAL);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", material));
  try {
    return await importAesKey(digest);
  } finally {
    wipeBytes(digest);
  }
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
