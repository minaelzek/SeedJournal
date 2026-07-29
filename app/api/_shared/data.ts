import type { EncryptedEntryEnvelope, TreeGrowthEvent } from "@/lib/contracts";
import type { Entry, GrowthEvent, Vault } from "@/db/schema";
import type { VaultMetadataInput } from "./validation";

export function serializeVault(vault: Vault): VaultMetadataInput & {
  revision: number;
  updatedAt: number;
} {
  return {
    formatVersion: 1,
    kdf: "PBKDF2-SHA-256",
    iterations: vault.iterations,
    salt: vault.salt,
    wrapAlgorithm: "AES-256-GCM",
    wrapIv: vault.wrapIv,
    wrappedKey: vault.wrappedKey,
    revision: vault.revision,
    updatedAt: vault.updatedAt,
  };
}

export function serializeEnvelope(entry: Entry): EncryptedEntryEnvelope {
  return {
    id: entry.id,
    state: entry.state,
    envelopeVersion: 1,
    iv: entry.iv,
    ciphertext: entry.ciphertext,
    revision: entry.revision,
    clientCreatedAt: entry.clientCreatedAt,
    clientUpdatedAt: entry.clientUpdatedAt,
    ...(entry.completedAt === null
      ? {}
      : { completedAt: entry.completedAt }),
    ...(entry.localDay === null ? {} : { localDay: entry.localDay }),
  };
}

export function serializeGrowthEvent(event: GrowthEvent): TreeGrowthEvent {
  return {
    id: event.id,
    sequence: event.sequence,
    entryId: event.entryId,
    occurredAt: event.occurredAt,
    localDate: event.localDate,
    kind: event.kind,
    growthUnits: event.growthUnits as TreeGrowthEvent["growthUnits"],
    seed: event.seed,
  };
}

export function encodeEntryCursor(updatedAt: number, id: string): string {
  return base64UrlEncode(JSON.stringify([updatedAt, id]));
}

export function decodeEntryCursor(
  value: string | null,
): { updatedAt: number; id: string } | null {
  if (!value) return null;
  try {
    const decoded: unknown = JSON.parse(base64UrlDecode(value));
    if (
      !Array.isArray(decoded) ||
      decoded.length !== 2 ||
      !Number.isSafeInteger(decoded[0]) ||
      typeof decoded[1] !== "string"
    ) {
      return null;
    }
    return { updatedAt: decoded[0] as number, id: decoded[1] };
  } catch {
    return null;
  }
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function base64UrlDecode(value: string): string {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) =>
    character.charCodeAt(0),
  );
  return new TextDecoder().decode(bytes);
}
