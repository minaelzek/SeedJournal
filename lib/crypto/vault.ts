import {
  base64ToBytes,
  bytesToBase64,
  copyArrayBuffer,
  wipeBytes,
} from "./encoding";

export const VAULT_KDF_ITERATIONS = 600_000;
export const MINIMUM_PASSPHRASE_LENGTH = 12;

export interface ClientVaultMetadata {
  formatVersion: 1;
  kdf: "PBKDF2-SHA-256";
  iterations: number;
  salt: string;
  wrapAlgorithm: "AES-256-GCM";
  wrapIv: string;
  wrappedKey: string;
}

export interface CreatedVault {
  metadata: ClientVaultMetadata;
  vaultKey: CryptoKey;
}

const VAULT_AAD = new TextEncoder().encode("SeedJournal|vault|1");

export async function createVault(passphrase: string): Promise<CreatedVault> {
  const normalized = normalizePassphrase(passphrase);
  const rawVaultKey = crypto.getRandomValues(new Uint8Array(32));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  try {
    const wrappingKey = await deriveWrappingKey(
      normalized,
      salt,
      VAULT_KDF_ITERATIONS,
    );
    const wrappedKey = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: copyArrayBuffer(wrapIv),
        additionalData: copyArrayBuffer(VAULT_AAD),
        tagLength: 128,
      },
      wrappingKey,
      copyArrayBuffer(rawVaultKey),
    );
    const vaultKey = await importVaultKey(rawVaultKey);
    return {
      vaultKey,
      metadata: {
        formatVersion: 1,
        kdf: "PBKDF2-SHA-256",
        iterations: VAULT_KDF_ITERATIONS,
        salt: bytesToBase64(salt),
        wrapAlgorithm: "AES-256-GCM",
        wrapIv: bytesToBase64(wrapIv),
        wrappedKey: bytesToBase64(new Uint8Array(wrappedKey)),
      },
    };
  } finally {
    wipeBytes(rawVaultKey);
    wipeBytes(salt);
    wipeBytes(wrapIv);
  }
}

export async function wrapRawKey(
  rawKeyBase64: string,
  passphrase: string,
): Promise<ClientVaultMetadata> {
  const normalized = normalizePassphrase(passphrase);
  const rawVaultKey = base64ToBytes(rawKeyBase64);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  try {
    if (rawVaultKey.byteLength !== 32) {
      throw new Error("Invalid vault key.");
    }
    const wrappingKey = await deriveWrappingKey(
      normalized,
      salt,
      VAULT_KDF_ITERATIONS,
    );
    const wrappedKey = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: copyArrayBuffer(wrapIv),
        additionalData: copyArrayBuffer(VAULT_AAD),
        tagLength: 128,
      },
      wrappingKey,
      copyArrayBuffer(rawVaultKey),
    );
    return {
      formatVersion: 1,
      kdf: "PBKDF2-SHA-256",
      iterations: VAULT_KDF_ITERATIONS,
      salt: bytesToBase64(salt),
      wrapAlgorithm: "AES-256-GCM",
      wrapIv: bytesToBase64(wrapIv),
      wrappedKey: bytesToBase64(new Uint8Array(wrappedKey)),
    };
  } finally {
    wipeBytes(rawVaultKey);
    wipeBytes(salt);
    wipeBytes(wrapIv);
  }
}

export async function unlockVault(
  metadata: ClientVaultMetadata,
  passphrase: string,
): Promise<CryptoKey> {
  validateVaultMetadata(metadata);
  const normalized = normalizePassphrase(passphrase);
  const salt = base64ToBytes(metadata.salt);
  const iv = base64ToBytes(metadata.wrapIv);
  const wrappedKey = base64ToBytes(metadata.wrappedKey);
  let rawVaultKey: Uint8Array | null = null;
  try {
    const wrappingKey = await deriveWrappingKey(
      normalized,
      salt,
      metadata.iterations,
    );
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: copyArrayBuffer(iv),
        additionalData: copyArrayBuffer(VAULT_AAD),
        tagLength: 128,
      },
      wrappingKey,
      copyArrayBuffer(wrappedKey),
    );
    rawVaultKey = new Uint8Array(decrypted);
    if (rawVaultKey.byteLength !== 32) throw new Error("Invalid vault key.");
    return await importVaultKey(rawVaultKey);
  } catch {
    throw new Error("The journal passphrase is incorrect or the vault is damaged.");
  } finally {
    wipeBytes(salt);
    wipeBytes(iv);
    wipeBytes(wrappedKey);
    if (rawVaultKey) wipeBytes(rawVaultKey);
  }
}

export async function rewrapVault(
  metadata: ClientVaultMetadata,
  oldPassphrase: string,
  newPassphrase: string,
): Promise<CreatedVault> {
  validateVaultMetadata(metadata);
  const oldNormalized = normalizePassphrase(oldPassphrase);
  const newNormalized = normalizePassphrase(newPassphrase);
  const oldSalt = base64ToBytes(metadata.salt);
  const oldIv = base64ToBytes(metadata.wrapIv);
  const wrappedKey = base64ToBytes(metadata.wrappedKey);
  const newSalt = crypto.getRandomValues(new Uint8Array(16));
  const newIv = crypto.getRandomValues(new Uint8Array(12));
  let rawVaultKey: Uint8Array | null = null;
  try {
    const oldWrappingKey = await deriveWrappingKey(
      oldNormalized,
      oldSalt,
      metadata.iterations,
    );
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: copyArrayBuffer(oldIv),
        additionalData: copyArrayBuffer(VAULT_AAD),
        tagLength: 128,
      },
      oldWrappingKey,
      copyArrayBuffer(wrappedKey),
    );
    rawVaultKey = new Uint8Array(decrypted);
    if (rawVaultKey.byteLength !== 32) throw new Error("Invalid vault key.");

    const newWrappingKey = await deriveWrappingKey(
      newNormalized,
      newSalt,
      VAULT_KDF_ITERATIONS,
    );
    const newlyWrapped = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: copyArrayBuffer(newIv),
        additionalData: copyArrayBuffer(VAULT_AAD),
        tagLength: 128,
      },
      newWrappingKey,
      copyArrayBuffer(rawVaultKey),
    );
    return {
      vaultKey: await importVaultKey(rawVaultKey),
      metadata: {
        formatVersion: 1,
        kdf: "PBKDF2-SHA-256",
        iterations: VAULT_KDF_ITERATIONS,
        salt: bytesToBase64(newSalt),
        wrapAlgorithm: "AES-256-GCM",
        wrapIv: bytesToBase64(newIv),
        wrappedKey: bytesToBase64(new Uint8Array(newlyWrapped)),
      },
    };
  } catch {
    throw new Error(
      "The current passphrase is incorrect or the vault is damaged.",
    );
  } finally {
    wipeBytes(oldSalt);
    wipeBytes(oldIv);
    wipeBytes(wrappedKey);
    wipeBytes(newSalt);
    wipeBytes(newIv);
    if (rawVaultKey) wipeBytes(rawVaultKey);
  }
}

export function normalizePassphrase(passphrase: string): string {
  const normalized = passphrase.normalize("NFC");
  if (Array.from(normalized).length < MINIMUM_PASSPHRASE_LENGTH) {
    throw new Error(
      `Passphrase must contain at least ${MINIMUM_PASSPHRASE_LENGTH} characters.`,
    );
  }
  return normalized;
}

function validateVaultMetadata(metadata: ClientVaultMetadata): void {
  if (
    metadata.formatVersion !== 1 ||
    metadata.kdf !== "PBKDF2-SHA-256" ||
    metadata.wrapAlgorithm !== "AES-256-GCM" ||
    !Number.isInteger(metadata.iterations) ||
    metadata.iterations < VAULT_KDF_ITERATIONS ||
    metadata.iterations > 2_000_000
  ) {
    throw new Error("Unsupported vault format.");
  }
}

async function deriveWrappingKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const passphraseBytes = new TextEncoder().encode(passphrase);
  try {
    const material = await crypto.subtle.importKey(
      "raw",
      copyArrayBuffer(passphraseBytes),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    return await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: copyArrayBuffer(salt),
        iterations,
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } finally {
    wipeBytes(passphraseBytes);
  }
}

export function importVaultKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    copyArrayBuffer(rawKey),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function importVaultKeyFromBase64(
  value: string,
): Promise<CryptoKey> {
  const rawKey = base64ToBytes(value);
  try {
    if (rawKey.byteLength !== 32) {
      throw new Error("Invalid vault key.");
    }
    return await importVaultKey(rawKey);
  } finally {
    wipeBytes(rawKey);
  }
}
