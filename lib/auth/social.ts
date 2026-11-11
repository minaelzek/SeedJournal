import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { env } from "cloudflare:workers";
import type { SocialProvider, VerifiedSocialIdentity } from "./social-identity";

export type { SocialProvider, VerifiedSocialIdentity } from "./social-identity";
export { isSocialProvider, socialSubjectId } from "./social-identity";

export class SocialAuthError extends Error {
  constructor(message = "The sign-in token could not be verified.") {
    super(message);
    this.name = "SocialAuthError";
  }
}

const GOOGLE_ISSUERS = new Set([
  "accounts.google.com",
  "https://accounts.google.com",
]);
const APPLE_ISSUER = "https://appleid.apple.com";
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
const APPLE_JWKS = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys"),
);

function workerEnv(): {
  GOOGLE_CLIENT_ID?: string;
  APPLE_CLIENT_ID?: string;
} {
  return env as unknown as {
    GOOGLE_CLIENT_ID?: string;
    APPLE_CLIENT_ID?: string;
  };
}

export function googleClientId(): string | undefined {
  return workerEnv().GOOGLE_CLIENT_ID?.trim() || undefined;
}

export function appleClientId(): string | undefined {
  return workerEnv().APPLE_CLIENT_ID?.trim() || undefined;
}

export async function verifySocialIdToken(
  provider: SocialProvider,
  idToken: string,
): Promise<VerifiedSocialIdentity> {
  if (provider === "google") return verifyGoogleIdToken(idToken);
  return verifyAppleIdToken(idToken);
}

async function verifyGoogleIdToken(
  idToken: string,
): Promise<VerifiedSocialIdentity> {
  const audience = googleClientId();
  if (!audience) {
    throw new SocialAuthError("Google sign-in is not configured.");
  }
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      audience,
      clockTolerance: 60,
    }));
  } catch {
    throw new SocialAuthError("The Google sign-in token is invalid.");
  }
  if (!payload.iss || !GOOGLE_ISSUERS.has(payload.iss)) {
    throw new SocialAuthError("The Google sign-in token is invalid.");
  }
  if (typeof payload.sub !== "string" || !payload.sub.trim()) {
    throw new SocialAuthError("The Google sign-in token is invalid.");
  }
  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  const emailVerified = payload.email_verified === true;
  const displayName =
    typeof payload.name === "string" ? payload.name.trim() : "";
  return {
    provider: "google",
    subject: payload.sub.trim(),
    ...(email ? { email } : {}),
    emailVerified,
    ...(displayName ? { displayName } : {}),
  };
}

async function verifyAppleIdToken(
  idToken: string,
): Promise<VerifiedSocialIdentity> {
  const audience = appleClientId();
  if (!audience) {
    throw new SocialAuthError("Apple sign-in is not configured.");
  }
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(idToken, APPLE_JWKS, {
      issuer: APPLE_ISSUER,
      audience,
      clockTolerance: 60,
    }));
  } catch {
    throw new SocialAuthError("The Apple sign-in token is invalid.");
  }
  if (typeof payload.sub !== "string" || !payload.sub.trim()) {
    throw new SocialAuthError("The Apple sign-in token is invalid.");
  }
  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  const emailVerified =
    payload.email_verified === true || payload.email_verified === "true";
  return {
    provider: "apple",
    subject: payload.sub.trim(),
    ...(email ? { email } : {}),
    emailVerified,
  };
}


