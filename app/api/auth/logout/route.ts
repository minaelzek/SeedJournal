import {
  readSessionTokensFromRequest,
  revokeSession,
  sessionClearCookieHeaders,
} from "@/lib/auth/session";
import { apiJson, assertSafeMutation, withApi } from "../../_shared/http";

export const POST = withApi(async (request: Request) => {
  await assertSafeMutation(request);
  for (const token of readSessionTokensFromRequest(request)) {
    await revokeSession(token);
  }
  const headers = new Headers();
  for (const cookie of sessionClearCookieHeaders()) {
    headers.append("Set-Cookie", cookie);
  }
  return apiJson({ signedOut: true }, { headers });
});
