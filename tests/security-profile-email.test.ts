import { describe, expect, it } from "vitest";
import {
  isVerifiedEmailClaim,
  verifiedAccountEmail,
} from "../lib/auth/profile-email";

describe("verified account email", () => {
  it("accepts boolean and string verification claims", () => {
    expect(isVerifiedEmailClaim(true)).toBe(true);
    expect(isVerifiedEmailClaim("true")).toBe(true);
    expect(isVerifiedEmailClaim(false)).toBe(false);
    expect(isVerifiedEmailClaim("false")).toBe(false);
    expect(isVerifiedEmailClaim(undefined)).toBe(false);
  });

  it("normalizes a verified email and drops an unverified one", () => {
    expect(verifiedAccountEmail("  Gardener@Example.com ", true)).toBe(
      "gardener@example.com",
    );
    expect(verifiedAccountEmail("gardener@example.com", false)).toBeUndefined();
    expect(verifiedAccountEmail("not-an-email", true)).toBeUndefined();
    expect(verifiedAccountEmail("", true)).toBeUndefined();
  });
});
