import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CSRF_COOKIE,
  CSRF_COOKIE_DEV,
  CSRF_HEADER,
  issueCsrf,
} from "../app/api/_shared/http";
import { createSessionToken } from "../lib/auth/session-cookie";

const revoked = vi.hoisted(() => [] as Array<string | null>);

vi.mock("@/lib/auth/session", async () => {
  const cookie = await vi.importActual<
    typeof import("../lib/auth/session-cookie")
  >("../lib/auth/session-cookie");
  return {
    readSessionTokensFromRequest: cookie.readSessionTokensFromRequest,
    sessionClearCookieHeaders: cookie.sessionClearCookieHeaders,
    revokeSession: vi.fn(async (token: string | null) => {
      revoked.push(token);
    }),
  };
});

import { POST } from "../app/api/auth/logout/route";

const originalNodeEnv = process.env.NODE_ENV;
const mutableEnv = process.env as Record<string, string | undefined>;

beforeEach(() => {
  revoked.length = 0;
});

afterEach(() => {
  if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
  else mutableEnv.NODE_ENV = originalNodeEnv;
});

function logoutRequest(sessionCookie = ""): Request {
  const issued = issueCsrf(new Request("https://seed.example/api/auth/csrf"));
  const cookieName =
    process.env.NODE_ENV === "production" ? CSRF_COOKIE : CSRF_COOKIE_DEV;
  const cookie = [`${cookieName}=${issued.token}`, sessionCookie]
    .filter(Boolean)
    .join("; ");
  return new Request("https://seed.example/api/auth/logout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://seed.example",
      "sec-fetch-site": "same-origin",
      cookie,
      [CSRF_HEADER]: issued.token,
    },
    body: "{}",
  });
}

describe("logout", () => {
  it("still rejects a mutation without a matching CSRF token", async () => {
    const response = await POST(
      new Request("https://seed.example/api/auth/logout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://seed.example",
          "sec-fetch-site": "same-origin",
        },
        body: "{}",
      }),
    );
    expect(response.status).toBe(403);
    expect(revoked).toEqual([]);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("revokes every valid session token and clears both cookie names", async () => {
    mutableEnv.NODE_ENV = "production";
    const host = createSessionToken();
    const dev = createSessionToken();
    const response = await POST(
      logoutRequest(
        `__Host-seedjournal-session=${host}; seedjournal-session=${dev}; seedjournal-session=not-a-token`,
      ),
    );
    expect(response.status).toBe(200);
    expect(revoked).toEqual([host, dev]);
    expect(response.headers.getSetCookie()).toEqual([
      "__Host-seedjournal-session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure",
      "seedjournal-session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure",
    ]);
    const body = (await response.json()) as { signedOut: boolean };
    expect(body.signedOut).toBe(true);
  });
});
