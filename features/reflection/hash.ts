/**
 * Small, stable, non-cryptographic hash used only for repeatable prompt ordering.
 */
export function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function seededIndex(seed: string, length: number): number {
  if (length <= 0) return 0;
  return stableHash(seed) % length;
}

