const MAX_EMAIL_LENGTH = 320;

export function isVerifiedEmailClaim(value: unknown): boolean {
  return value === true || value === "true";
}

/**
 * Email used as an account-linking key. Unverified provider emails are
 * ignored so they cannot overwrite a verified address or attach a second
 * provider to someone else's journal.
 */
export function verifiedAccountEmail(
  email: string | undefined,
  emailVerified: boolean,
): string | undefined {
  if (!email || !emailVerified) return undefined;
  const normalized = email.trim().normalize("NFC").toLocaleLowerCase("en-US");
  if (
    !normalized ||
    normalized.length > MAX_EMAIL_LENGTH ||
    !normalized.includes("@")
  ) {
    return undefined;
  }
  return normalized;
}
