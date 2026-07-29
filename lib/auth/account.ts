import "server-only";

import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { accounts, type Account } from "@/db/schema";
import { AuthenticationRequiredError } from "./errors";

export function normalizeAuthEmail(email: string): string {
  return email.trim().normalize("NFC").toLocaleLowerCase("en-US");
}

export async function resolveApiAccount(): Promise<Account> {
  const user = await getChatGPTUser();
  if (!user) throw new AuthenticationRequiredError();

  const authEmail = normalizeAuthEmail(user.email);
  if (!authEmail || authEmail.length > 320) {
    throw new AuthenticationRequiredError();
  }

  const db = getDb();
  const existing = await db.query.accounts.findFirst({
    where: eq(accounts.authEmail, authEmail),
  });
  if (existing) return existing;

  const now = Date.now();
  await db
    .insert(accounts)
    .values({
      id: crypto.randomUUID(),
      authEmail,
      treeSeed: randomTreeSeed(),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: accounts.authEmail });

  const account = await db.query.accounts.findFirst({
    where: eq(accounts.authEmail, authEmail),
  });
  if (!account) {
    throw new Error("Account resolution failed.");
  }
  return account;
}

function randomTreeSeed(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
