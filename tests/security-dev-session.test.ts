import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CSRF_COOKIE,
  CSRF_COOKIE_DEV,
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

import { ensureAccountDataKey } from "../lib/auth/account-key";
import {
  createAccountSession,
  sessionSetCookieHeader,
} from "../lib/auth/session";
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

function requestAt(url: string): Request {
  const issued = issueCsrf(new Request(url));
  const cookieName =
    process.env.NODE_ENV === "production" ? CSRF_COOKIE : CSRF_COOKIE_DEV;
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: new URL(url).origin,
      "sec-fetch-site": "same-origin",
      cookie: `${cookieName}=${issued.token}`,
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

  it("is not available on a public host even in development", async () => {
    mutableEnv.NODE_ENV = "development";
    const response = await POST(
      requestAt("https://seed.example/api/auth/dev-session"),
    );
    expect(response.status).toBe(404);
    expect(accounts.upsert).not.toHaveBeenCalled();
  });

  it("is not available when NODE_ENV is unset", async () => {
    delete mutableEnv.NODE_ENV;
    const response = await POST(
      requestAt("http://127.0.0.1:3000/api/auth/dev-session"),
    );
    expect(response.status).toBe(404);
    expect(accounts.upsert).not.toHaveBeenCalled();
  });

  it("opens the shared local account on loopback during development", async () => {
    mutableEnv.NODE_ENV = "development";
    accounts.upsert.mockResolvedValue({
      id: "acct-local",
      email: "local-preview@seedjournal.invalid",
      displayName: "Local gardener",
    });
    vi.mocked(ensureAccountDataKey).mockResolvedValue("wrapped");
    vi.mocked(createAccountSession).mockResolvedValue("session-token");
    vi.mocked(sessionSetCookieHeader).mockReturnValue(
      "seedjournal-session=session-token; Path=/; HttpOnly",
    );
    const response = await POST(
      requestAt("http://127.0.0.1:3000/api/auth/dev-session"),
    );
    expect(response.status).toBe(200);
    expect(accounts.upsert).toHaveBeenCalledOnce();
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });
});
