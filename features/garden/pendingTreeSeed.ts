/**
 * Device-local welcome stone identity.
 * Locked onto the account after first sign-in if the garden has not grown.
 */

export const STORAGE_KEY = "seed-journal:pending-tree-seed";

const TREE_SEED_PATTERN = /^[0-9a-f]{16,64}$/i;

export function isTreeSeed(value: unknown): value is string {
  return typeof value === "string" && TREE_SEED_PATTERN.test(value);
}

export function readPendingTreeSeed(): string | null {
  const storage = localStorageOrNull();
  if (!storage) return null;
  try {
    const stored = storage.getItem(STORAGE_KEY);
    return isTreeSeed(stored) ? stored.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function ensurePendingTreeSeed(): string {
  const existing = readPendingTreeSeed();
  if (existing) return existing;
  const seed = generateTreeSeed();
  const storage = localStorageOrNull();
  if (!storage) return seed;
  try {
    storage.setItem(STORAGE_KEY, seed);
  } catch {
    // Quota / private mode — keep an ephemeral seed for this paint.
  }
  return seed;
}

export function clearPendingTreeSeed(): void {
  const storage = localStorageOrNull();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures; the next visit can generate a new seed.
  }
}

function generateTreeSeed(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function localStorageOrNull(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
