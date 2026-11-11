import { describe, expect, it } from "vitest";
import {
  ensurePendingTreeSeed,
  isTreeSeed,
  readPendingTreeSeed,
} from "../features/garden/pendingTreeSeed";

describe("pending tree seed", () => {
  it("accepts 16–64 hexadecimal characters only", () => {
    expect(isTreeSeed("0123456789abcdef")).toBe(true);
    expect(isTreeSeed("a".repeat(32))).toBe(true);
    expect(isTreeSeed("ABCDEF0123456789")).toBe(true);
    expect(isTreeSeed("f".repeat(64))).toBe(true);
    expect(isTreeSeed("0123456789abcde")).toBe(false);
    expect(isTreeSeed("a".repeat(65))).toBe(false);
    expect(isTreeSeed("seed-journal-welcome")).toBe(false);
    expect(isTreeSeed("0123456789abcdeg")).toBe(false);
    expect(isTreeSeed("")).toBe(false);
    expect(isTreeSeed(null)).toBe(false);
  });

  it("generates a 32-character hex seed without window storage", () => {
    expect(readPendingTreeSeed()).toBeNull();
    const seed = ensurePendingTreeSeed();
    expect(seed).toMatch(/^[0-9a-f]{32}$/);
    expect(isTreeSeed(seed)).toBe(true);
    expect(readPendingTreeSeed()).toBeNull();
  });
});
