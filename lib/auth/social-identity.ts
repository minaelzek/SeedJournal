export type SocialProvider = "google" | "apple";

export interface VerifiedSocialIdentity {
  provider: SocialProvider;
  subject: string;
  email?: string;
  emailVerified: boolean;
  displayName?: string;
}

export function isSocialProvider(value: string): value is SocialProvider {
  return value === "google" || value === "apple";
}

export function socialSubjectId(
  provider: SocialProvider,
  subject: string,
): string {
  return `${provider}:${subject}`;
}
