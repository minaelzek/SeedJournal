import { upsertAccountBySubject } from "@/lib/auth/account";
import { ensureAccountDataKey } from "@/lib/auth/account-key";
import { LOCAL_PREVIEW_SUBJECT_ID } from "@/app/chatgpt-auth";
import {
  createAccountSession,
  sessionSetCookieHeader,
} from "@/lib/auth/session";
import {
  ApiRouteError,
  apiJson,
  assertSafeMutation,
  withApi,
} from "../../_shared/http";

export const POST = withApi(async (request: Request) => {
  await assertSafeMutation(request);
  if (process.env.NODE_ENV === "production") {
    throw new ApiRouteError(
      404,
      "not_found",
      "This sign-in path is not available.",
    );
  }

  const account = await upsertAccountBySubject({
    authSubjectId: LOCAL_PREVIEW_SUBJECT_ID,
    email: "local-preview@seedjournal.invalid",
    displayName: "Local gardener",
  });
  await ensureAccountDataKey(account.id);
  const token = await createAccountSession(account.id);
  return apiJson(
    {
      account: {
        id: account.id,
        email: account.email,
        displayName: account.displayName,
      },
    },
    {
      headers: {
        "Set-Cookie": sessionSetCookieHeader(token),
      },
    },
  );
});
