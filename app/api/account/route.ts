import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts } from "@/db/schema";
import { resolveApiAccount } from "@/lib/auth/account";
import {
  CSRF_COOKIE,
  ApiRouteError,
  apiJson,
  assertSafeMutation,
  readJson,
  withApi,
} from "../_shared/http";
import { requireObject } from "../_shared/validation";

export const DELETE = withApi(async (request: Request) => {
  await assertSafeMutation(request);
  const account = await resolveApiAccount();
  const body = requireObject(await readJson<unknown>(request));
  if (body.confirmation !== "DELETE") {
    throw new ApiRouteError(
      400,
      "confirmation_required",
      "Type DELETE to confirm account deletion.",
    );
  }
  const db = getDb();
  await db.delete(accounts).where(eq(accounts.id, account.id));
  return apiJson(
    { deleted: true },
    {
      headers: {
        "Set-Cookie": `${CSRF_COOKIE}=; Path=/; Secure; SameSite=Strict; Max-Age=0`,
      },
    },
  );
});
