import {
  base64ToBytes,
  copyArrayBuffer,
  wipeBytes,
} from "@/lib/crypto/encoding";

export const DEV_WRAP_MATERIAL =
  "seed-journal-dev-wrap-key-do-not-use-in-production";

export class WrapKeyConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WrapKeyConfigurationError";
  }
}

export async function developmentWrapKeyBytes(): Promise<Uint8Array> {
  const material = new TextEncoder().encode(DEV_WRAP_MATERIAL);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", material));
}

export async function loadMasterWrapKey(
  configured: string | undefined,
  devAllowed: boolean,
): Promise<CryptoKey> {
  const trimmed = configured?.trim();
  if (trimmed) {
    let raw: Uint8Array;
    try {
      raw = base64ToBytes(trimmed);
    } catch {
      throw new WrapKeyConfigurationError(
        "ACCOUNT_WRAP_KEY must be 32 bytes of standard base64.",
      );
    }
    const devKey = await developmentWrapKeyBytes();
    try {
      if (raw.byteLength !== 32) {
        throw new WrapKeyConfigurationError(
          "ACCOUNT_WRAP_KEY must be 32 bytes of standard base64.",
        );
      }
      if (!devAllowed && sameBytes(raw, devKey)) {
        throw new WrapKeyConfigurationError(
          "ACCOUNT_WRAP_KEY must not be the development wrap key.",
        );
      }
      return await importAesKey(raw);
    } finally {
      wipeBytes(raw);
      wipeBytes(devKey);
    }
  }

  if (!devAllowed) {
    throw new WrapKeyConfigurationError(
      "ACCOUNT_WRAP_KEY is required in production.",
    );
  }

  const devKey = await developmentWrapKeyBytes();
  try {
    return await importAesKey(devKey);
  } finally {
    wipeBytes(devKey);
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
}

function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    copyArrayBuffer(raw),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
