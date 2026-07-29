import type {
  EncryptedEntryEnvelope,
  JournalEntryPayloadV1,
} from "@/lib/contracts";
import {
  base64ToBytes,
  bytesToBase64,
  copyArrayBuffer,
  wipeBytes,
} from "./encoding";

export const MAX_DECRYPTED_ENTRY_BYTES = 256 * 1024;

export interface EnvelopeMetadata {
  id: string;
  state: "draft" | "complete";
  revision: number;
  clientCreatedAt: number;
  clientUpdatedAt: number;
  completedAt?: number;
  localDay?: string;
}

export async function encryptEntryPayload(
  vaultKey: CryptoKey,
  accountId: string,
  payload: JournalEntryPayloadV1,
  metadata: EnvelopeMetadata,
): Promise<EncryptedEntryEnvelope> {
  assertVaultKey(vaultKey);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  if (plaintext.byteLength > MAX_DECRYPTED_ENTRY_BYTES) {
    wipeBytes(plaintext);
    throw new Error("This journal entry is too large.");
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = entryAad(accountId, metadata.id, metadata.revision);
  try {
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: copyArrayBuffer(iv),
        additionalData: copyArrayBuffer(aad),
        tagLength: 128,
      },
      vaultKey,
      copyArrayBuffer(plaintext),
    );
    return {
      id: metadata.id,
      state: metadata.state,
      envelopeVersion: 1,
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
      revision: metadata.revision,
      clientCreatedAt: metadata.clientCreatedAt,
      clientUpdatedAt: metadata.clientUpdatedAt,
      ...(metadata.completedAt === undefined
        ? {}
        : { completedAt: metadata.completedAt }),
      ...(metadata.localDay === undefined
        ? {}
        : { localDay: metadata.localDay }),
    };
  } finally {
    wipeBytes(plaintext);
    wipeBytes(iv);
    wipeBytes(aad);
  }
}

export async function decryptEntryPayload(
  vaultKey: CryptoKey,
  accountId: string,
  envelope: EncryptedEntryEnvelope,
): Promise<JournalEntryPayloadV1> {
  assertVaultKey(vaultKey);
  if (envelope.envelopeVersion !== 1) {
    throw new Error("Unsupported entry envelope.");
  }
  const iv = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  const aad = entryAad(accountId, envelope.id, envelope.revision);
  let plaintext: Uint8Array | null = null;
  try {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: copyArrayBuffer(iv),
        additionalData: copyArrayBuffer(aad),
        tagLength: 128,
      },
      vaultKey,
      copyArrayBuffer(ciphertext),
    );
    plaintext = new Uint8Array(decrypted);
    if (plaintext.byteLength > MAX_DECRYPTED_ENTRY_BYTES) {
      throw new Error("The decrypted entry is too large.");
    }
    const parsed: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(plaintext),
    );
    if (!isJournalPayloadV1(parsed)) {
      throw new Error("The journal entry format is invalid.");
    }
    return parsed;
  } catch {
    throw new Error("This entry could not be decrypted.");
  } finally {
    wipeBytes(iv);
    wipeBytes(ciphertext);
    wipeBytes(aad);
    if (plaintext) wipeBytes(plaintext);
  }
}

function entryAad(
  accountId: string,
  entryId: string,
  revision: number,
): Uint8Array {
  return new TextEncoder().encode(
    `SeedJournal|entry|1|${accountId}|${entryId}|${revision}`,
  );
}

function assertVaultKey(key: CryptoKey): void {
  if (
    key.type !== "secret" ||
    key.extractable ||
    key.algorithm.name !== "AES-GCM" ||
    !key.usages.includes("encrypt") ||
    !key.usages.includes("decrypt")
  ) {
    throw new Error("An unlocked Seed Journal vault key is required.");
  }
}

function isJournalPayloadV1(value: unknown): value is JournalEntryPayloadV1 {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<JournalEntryPayloadV1>;
  return (
    payload.version === 1 &&
    (payload.kind === "entry" || payload.kind === "revisit") &&
    typeof payload.title === "string" &&
    typeof payload.body === "string" &&
    Array.isArray(payload.threads) &&
    Array.isArray(payload.tags) &&
    typeof payload.seedInsight === "string" &&
    Boolean(payload.prompt) &&
    typeof payload.prompt?.id === "string" &&
    payload.prompt.libraryVersion === "1" &&
    typeof payload.prompt.renderedText === "string"
  );
}
