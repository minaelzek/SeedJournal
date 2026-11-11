import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  issueCsrf,
} from "../app/api/_shared/http";

const accounts = vi.hoisted(() => ({
  upsert: vi.fn(),
}));

vi.mock("@/lib/auth/account", () => ({
  upsertAccountBySubject: accounts.upsert,
}));
vi.mock("@/lib/auth/account-key", () => ({
  ensureAccountDataKey: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({
  createAccountSession: vi.fn(),
  sessionSetCookieHeader: vi.fn(),
}));
vi.mock("@/app/chatgpt-auth", () => ({
  LOCAL_PREVIEW_SUBJECT_ID: "local-preview-user",
}));

import { POST } from "../app/api/auth/dev-session/route";

const originalNodeEnv = process.env.NODE_ENV;
const mutableEnv = process.env as Record<string, string | undefined>;

afterEach(() => {
  accounts.upsert.mockReset();
  if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
  else mutableEnv.NODE_ENV = originalNodeEnv;
});

function devSessionRequest(): Request {
  mutableEnv.NODE_ENV = "production";
  const issued = issueCsrf(new Request("https://seed.example/api/auth/csrf"));
  return new Request("https://seed.example/api/auth/dev-session", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://seed.example",
      "sec-fetch-site": "same-origin",
      cookie: `${CSRF_COOKIE}=${issued.token}`,
      [CSRF_HEADER]: issued.token,
    },
    body: "{}",
  });
}

describe("dev session", () => {
  it("is not available in production", async () => {
    const response = await POST(devSessionRequest());
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_found");
    expect(accounts.upsert).not.toHaveBeenCalled();
  });
});
