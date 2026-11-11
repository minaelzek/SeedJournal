import { apiJson, issueCsrf, withApi } from "../../_shared/http";

export const GET = withApi(async (request: Request) => {
  const csrf = issueCsrf(request);
  const headers = csrf.setCookie
    ? { "Set-Cookie": csrf.setCookie }
    : undefined;
  return apiJson({ csrfToken: csrf.token }, { headers });
});
