import type { EncryptedEntryEnvelope, MemoryForm } from "@/lib/contracts";
import { ApiRouteError } from "./http";

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface VaultMetadataInput {
  formatVersion: 1;
  kdf: "PBKDF2-SHA-256";
  iterations: number;
  salt: string;
  wrapAlgorithm: "AES-256-GCM";
  wrapIv: string;
  wrappedKey: string;
}

export interface CompletionInput {
  id: string;
  memoryForm: MemoryForm;
  growthUnits: 1 | 2 | 4 | 6;
  seed: number;
}

export function requireObject(
  value: unknown,
  message = "The request body must be an object.",
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiRouteError(400, "invalid_request", message);
  }
  return value as Record<string, unknown>;
}

export function parseVaultMetadata(value: unknown): VaultMetadataInput {
  const input = requireObject(value);
  if (
    input.formatVersion !== 1 ||
    input.kdf !== "PBKDF2-SHA-256" ||
    input.wrapAlgorithm !== "AES-256-GCM" ||
    !Number.isInteger(input.iterations) ||
    Number(input.iterations) < 600_000 ||
    Number(input.iterations) > 2_000_000 ||
    !isBase64Bytes(input.salt, 16, 64) ||
    !isBase64Bytes(input.wrapIv, 12, 12) ||
    !isBase64Bytes(input.wrappedKey, 48, 80)
  ) {
    throw new ApiRouteError(
      400,
      "invalid_vault",
      "The encrypted vault metadata is invalid.",
    );
  }
  return {
    formatVersion: 1,
    kdf: "PBKDF2-SHA-256",
    iterations: Number(input.iterations),
    salt: String(input.salt),
    wrapAlgorithm: "AES-256-GCM",
    wrapIv: String(input.wrapIv),
    wrappedKey: String(input.wrappedKey),
  };
}

export function parseEnvelope(value: unknown): EncryptedEntryEnvelope {
  const input = requireObject(value, "An encrypted envelope is required.");
  if (
    !isUuid(input.id) ||
    (input.state !== "draft" && input.state !== "complete") ||
    input.envelopeVersion !== 1 ||
    !isBase64Bytes(input.iv, 12, 12) ||
    !isBase64Bytes(input.ciphertext, 17, 400 * 1024) ||
    !isPositiveInteger(input.revision) ||
    !isSafeTimestamp(input.clientCreatedAt) ||
    !isSafeTimestamp(input.clientUpdatedAt) ||
    (input.completedAt !== undefined && !isSafeTimestamp(input.completedAt)) ||
    (input.localDay !== undefined &&
      (typeof input.localDay !== "string" ||
        !LOCAL_DAY_PATTERN.test(input.localDay)))
  ) {
    throw new ApiRouteError(
      400,
      "invalid_envelope",
      "The encrypted entry envelope is invalid.",
    );
  }
  if (
    input.state === "complete" &&
    (input.completedAt === undefined || input.localDay === undefined)
  ) {
    throw new ApiRouteError(
      400,
      "invalid_envelope",
      "A completed envelope requires completion metadata.",
    );
  }
  return {
    id: input.id as string,
    state: input.state,
    envelopeVersion: 1,
    iv: input.iv as string,
    ciphertext: input.ciphertext as string,
    revision: input.revision as number,
    clientCreatedAt: input.clientCreatedAt as number,
    clientUpdatedAt: input.clientUpdatedAt as number,
    ...(input.completedAt === undefined
      ? {}
      : { completedAt: input.completedAt as number }),
    ...(input.localDay === undefined
      ? {}
      : { localDay: input.localDay as string }),
  };
}

export function parseCompletion(value: unknown): CompletionInput {
  const input = requireObject(value, "Completion metadata is required.");
  const expectedUnits: Record<MemoryForm, 1 | 2 | 4 | 6> = {
    leaf: 1,
    bud: 2,
    blossom: 4,
    "luminous-blossom": 6,
  };
  if (
    !isUuid(input.id) ||
    !(
      input.memoryForm === "leaf" ||
      input.memoryForm === "bud" ||
      input.memoryForm === "blossom" ||
      input.memoryForm === "luminous-blossom"
    ) ||
    input.growthUnits !== expectedUnits[input.memoryForm] ||
    !Number.isInteger(input.seed) ||
    Number(input.seed) < 0 ||
    Number(input.seed) > 0x7fffffff
  ) {
    throw new ApiRouteError(
      400,
      "invalid_completion",
      "The growth completion metadata is invalid.",
    );
  }
  return {
    id: input.id as string,
    memoryForm: input.memoryForm,
    growthUnits: input.growthUnits as 1 | 2 | 4 | 6,
    seed: input.seed as number,
  };
}

export function parseExpectedRevision(value: unknown): number {
  if (!isPositiveInteger(value)) {
    throw new ApiRouteError(
      400,
      "invalid_revision",
      "A positive expectedRevision is required.",
    );
  }
  return value as number;
}

export function parseUuid(value: unknown, name = "id"): string {
  if (!isUuid(value)) {
    throw new ApiRouteError(400, "invalid_id", `The ${name} is invalid.`);
  }
  return value as string;
}

export function parseLimit(value: string | null, fallback = 50): number {
  if (value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new ApiRouteError(
      400,
      "invalid_limit",
      "The page limit must be between 1 and 100.",
    );
  }
  return parsed;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isPositiveInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1
  );
}

function isSafeTimestamp(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 8_640_000_000_000_000
  );
}

function isBase64Bytes(
  value: unknown,
  minBytes: number,
  maxBytes: number,
): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > Math.ceil(maxBytes / 3) * 4 ||
    !BASE64_PATTERN.test(value)
  ) {
    return false;
  }
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const bytes = Math.floor((value.length * 3) / 4) - padding;
  return bytes >= minBytes && bytes <= maxBytes;
}
