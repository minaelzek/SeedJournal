import {
  isSocialProvider,
  resolveSocialAccount,
} from "@/lib/auth/account";
import { ensureAccountDataKey } from "@/lib/auth/account-key";
import {
  createAccountSession,
  sessionSetCookieHeader,
} from "@/lib/auth/session";
import { SocialAuthError, verifySocialIdToken } from "@/lib/auth/social";
import {
  ApiRouteError,
  apiJson,
  assertSafeMutation,
  readJson,
  withApi,
} from "../../_shared/http";
import { requireObject } from "../../_shared/validation";

export const POST = withApi(async (request: Request) => {
  await assertSafeMutation(request);
  const body = requireObject(await readJson<unknown>(request));
  const provider =
    typeof body.provider === "string" ? body.provider.trim().toLowerCase() : "";
  const idToken = typeof body.idToken === "string" ? body.idToken.trim() : "";
  if (idToken.length > 8192) {
    throw new ApiRouteError(
      413,
      "payload_too_large",
      "The sign-in token is too large.",
    );
  }
  if (!isSocialProvider(provider) || !idToken) {
    throw new ApiRouteError(
      400,
      "invalid_request",
      "A Google or Apple sign-in token is required.",
    );
  }

  let identity;
  try {
    identity = await verifySocialIdToken(provider, idToken);
  } catch (error) {
    if (error instanceof SocialAuthError) {
      throw new ApiRouteError(401, "invalid_social_token", error.message);
    }
    throw error;
  }

  const account = await resolveSocialAccount(identity);
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
