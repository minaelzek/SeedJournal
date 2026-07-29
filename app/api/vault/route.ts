import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { vaults } from "@/db/schema";
import { resolveApiAccount } from "@/lib/auth/account";
import { serializeVault } from "../_shared/data";
import {
  ApiRouteError,
  apiJson,
  assertSafeMutation,
  readJson,
  withApi,
} from "../_shared/http";
import {
  parseExpectedRevision,
  parseVaultMetadata,
  requireObject,
} from "../_shared/validation";

export const GET = withApi(async () => {
  const account = await resolveApiAccount();
  const db = getDb();
  const vault = await db.query.vaults.findFirst({
    where: eq(vaults.accountId, account.id),
  });
  return apiJson({ vault: vault ? serializeVault(vault) : null });
});

export const POST = withApi(async (request: Request) => {
  await assertSafeMutation(request);
  const account = await resolveApiAccount();
  const metadata = parseVaultMetadata(await readJson<unknown>(request));
  const now = Date.now();
  const db = getDb();
  const inserted = await db
    .insert(vaults)
    .values({
      accountId: account.id,
      ...metadata,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: vaults.accountId })
    .returning();
  if (inserted.length === 0) {
    throw new ApiRouteError(
      409,
      "vault_exists",
      "A vault is already configured for this account.",
    );
  }
  return apiJson({ vault: serializeVault(inserted[0]) }, { status: 201 });
});

export const PUT = withApi(async (request: Request) => {
  await assertSafeMutation(request);
  const account = await resolveApiAccount();
  const body = requireObject(await readJson<unknown>(request));
  const expectedRevision = parseExpectedRevision(body.expectedRevision);
  const metadata = parseVaultMetadata(body.vault);
  const nextRevision = expectedRevision + 1;
  const db = getDb();
  const updated = await db
    .update(vaults)
    .set({
      ...metadata,
      revision: nextRevision,
      updatedAt: Date.now(),
    })
    .where(
      and(
        eq(vaults.accountId, account.id),
        eq(vaults.revision, expectedRevision),
      ),
    )
    .returning();
  if (updated.length === 0) {
    throw new ApiRouteError(
      409,
      "revision_conflict",
      "The vault changed on another device.",
    );
  }
  return apiJson({ vault: serializeVault(updated[0]) });
});
