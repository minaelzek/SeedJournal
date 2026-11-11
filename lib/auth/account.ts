import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accounts,
  socialAccounts,
  type Account,
} from "@/db/schema";
import { AuthenticationRequiredError } from "./errors";
import { getRequestPrincipal } from "./principal";
import { verifiedAccountEmail } from "./profile-email";
import { resolveSessionAccountId } from "./session";
import {
  socialSubjectId,
  type VerifiedSocialIdentity,
} from "./social-identity";

function normalizeProfileEmail(email: string): string {
  return email.trim().normalize("NFC").toLocaleLowerCase("en-US");
}

function normalizeProfileDisplayName(displayName: string): string {
  return displayName.trim().normalize("NFC");
}

export async function resolveApiAccount(): Promise<Account> {
  const principal = await getRequestPrincipal();
  if (!principal) throw new AuthenticationRequiredError();

  if (principal.kind === "session") {
    const accountId = await resolveSessionAccountId(principal.sessionToken);
    if (!accountId) throw new AuthenticationRequiredError();
    const db = getDb();
    const account = await db.query.accounts.findFirst({
      where: eq(accounts.id, accountId),
    });
    if (!account) throw new AuthenticationRequiredError();
    return account;
  }

  return upsertAccountBySubject({
    authSubjectId: principal.subjectId,
    email: principal.email,
    displayName: principal.displayName,
  });
}

export async function upsertAccountBySubject(input: {
  authSubjectId: string;
  email?: string;
  displayName?: string;
  emailVerified?: boolean;
}): Promise<Account> {
  const authSubjectId = input.authSubjectId.trim();
  if (!authSubjectId || authSubjectId.length > 256) {
    throw new AuthenticationRequiredError();
  }

  const email =
    input.email === undefined ? undefined : normalizeProfileEmail(input.email);
  const displayName =
    input.displayName === undefined
      ? undefined
      : normalizeProfileDisplayName(input.displayName);
  if (email !== undefined && email.length > 320) {
    throw new AuthenticationRequiredError();
  }
  if (displayName !== undefined && displayName.length > 256) {
    throw new AuthenticationRequiredError();
  }

  const db = getDb();
  const existing = await db.query.accounts.findFirst({
    where: eq(accounts.authSubjectId, authSubjectId),
  });
  if (existing) {
    const profileUpdate: {
      email?: string | null;
      emailVerified?: number;
      displayName?: string | null;
      updatedAt?: number;
    } = {};
    if (email !== undefined && email !== existing.email) {
      profileUpdate.email = email || null;
      profileUpdate.emailVerified = input.emailVerified && email ? 1 : 0;
    } else if (
      input.emailVerified &&
      email &&
      email === existing.email &&
      existing.emailVerified !== 1
    ) {
      profileUpdate.emailVerified = 1;
    }
    if (displayName !== undefined && displayName !== existing.displayName) {
      profileUpdate.displayName = displayName || null;
    }

    if (Object.keys(profileUpdate).length > 0) {
      const updatedAt = Date.now();
      await db
        .update(accounts)
        .set({ ...profileUpdate, updatedAt })
        .where(eq(accounts.id, existing.id));
      return { ...existing, ...profileUpdate, updatedAt };
    }
    return existing;
  }

  const now = Date.now();
  await db
    .insert(accounts)
    .values({
      id: crypto.randomUUID(),
      authSubjectId,
      email: email ?? null,
      emailVerified: input.emailVerified && email ? 1 : 0,
      displayName: displayName || null,
      treeSeed: randomTreeSeed(),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: accounts.authSubjectId });

  const account = await db.query.accounts.findFirst({
    where: eq(accounts.authSubjectId, authSubjectId),
  });
  if (!account) {
    throw new Error("Account resolution failed.");
  }
  return account;
}

export async function resolveSocialAccount(
  identity: VerifiedSocialIdentity,
): Promise<Account> {
  const db = getDb();
  const linked = await db.query.socialAccounts.findFirst({
    where: and(
      eq(socialAccounts.provider, identity.provider),
      eq(socialAccounts.providerUserId, identity.subject),
    ),
  });
  if (linked) {
    const account = await db.query.accounts.findFirst({
      where: eq(accounts.id, linked.accountId),
    });
    if (!account) throw new AuthenticationRequiredError();
    await refreshSocialAccount(linked.id, identity);
    return mergeAccountProfile(account, identity);
  }

  const verifiedEmail = verifiedAccountEmail(
    identity.email,
    identity.emailVerified,
  );
  if (verifiedEmail) {
    const byEmail = await findVerifiedEmailAccount(verifiedEmail);
    if (byEmail) {
      return bindSocialIdentity(byEmail, identity);
    }
  }

  if (!verifiedEmail) {
    throw new AuthenticationRequiredError();
  }

  let account: Account;
  try {
    account = await upsertAccountBySubject({
      authSubjectId: socialSubjectId(identity.provider, identity.subject),
      email: verifiedEmail,
      displayName: identity.displayName,
      emailVerified: true,
    });
  } catch (error) {
    if (!isVerifiedEmailConflict(error)) throw error;
    const existing = await findVerifiedEmailAccount(verifiedEmail);
    if (!existing) throw error;
    account = existing;
  }
  return bindSocialIdentity(account, identity);
}

async function findVerifiedEmailAccount(
  email: string,
): Promise<Account | undefined> {
  const db = getDb();
  return db.query.accounts.findFirst({
    where: and(eq(accounts.email, email), eq(accounts.emailVerified, 1)),
  });
}

async function bindSocialIdentity(
  account: Account,
  identity: VerifiedSocialIdentity,
): Promise<Account> {
  await attachSocialAccount(account.id, identity);
  const db = getDb();
  const linked = await db.query.socialAccounts.findFirst({
    where: and(
      eq(socialAccounts.provider, identity.provider),
      eq(socialAccounts.providerUserId, identity.subject),
    ),
  });
  if (!linked) throw new AuthenticationRequiredError();
  if (linked.accountId === account.id) {
    return mergeAccountProfile(account, identity);
  }
  const owner = await db.query.accounts.findFirst({
    where: eq(accounts.id, linked.accountId),
  });
  if (!owner) throw new AuthenticationRequiredError();
  return mergeAccountProfile(owner, identity);
}

function isVerifiedEmailConflict(error: unknown): boolean {
  const message = errorText(error);
  return (
    message.includes("accounts_verified_email_unique") ||
    message.includes("UNIQUE constraint failed: accounts.email")
  );
}

function errorText(error: unknown): string {
  if (!error) return "";
  if (error instanceof Error) {
    const cause = (error as { cause?: unknown }).cause;
    return `${error.message}\n${errorText(cause)}`;
  }
  return String(error);
}

async function attachSocialAccount(
  accountId: string,
  identity: VerifiedSocialIdentity,
): Promise<void> {
  const now = Date.now();
  const db = getDb();
  await db
    .insert(socialAccounts)
    .values({
      id: crypto.randomUUID(),
      accountId,
      provider: identity.provider,
      providerUserId: identity.subject,
      email: identity.email ? normalizeProfileEmail(identity.email) : null,
      emailVerified: identity.emailVerified ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [socialAccounts.provider, socialAccounts.providerUserId],
    });
}

async function refreshSocialAccount(
  socialAccountId: string,
  identity: VerifiedSocialIdentity,
): Promise<void> {
  const db = getDb();
  await db
    .update(socialAccounts)
    .set({
      email: identity.email ? normalizeProfileEmail(identity.email) : null,
      emailVerified: identity.emailVerified ? 1 : 0,
      updatedAt: Date.now(),
    })
    .where(eq(socialAccounts.id, socialAccountId));
}

async function mergeAccountProfile(
  account: Account,
  identity: VerifiedSocialIdentity,
): Promise<Account> {
  const verifiedEmail = verifiedAccountEmail(
    identity.email,
    identity.emailVerified,
  );
  return upsertAccountBySubject({
    authSubjectId: account.authSubjectId,
    ...(verifiedEmail ? { email: verifiedEmail, emailVerified: true } : {}),
    displayName: identity.displayName ?? account.displayName ?? undefined,
  });
}

export { isSocialProvider } from "./social-identity";

function randomTreeSeed(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
