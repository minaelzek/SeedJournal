import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSessionToken,
  isSessionToken,
  readCookieValue,
  readSessionTokenFromRequest,
  readSessionTokensFromRequest,
  SESSION_COOKIE_DEV,
  SESSION_COOKIE_PROD,
  sessionClearCookieHeaders,
} from "../lib/auth/session-cookie";

const cookieJar = vi.hoisted(() => new Map<string, string>());
const headerJar = vi.hoisted(() => ({ current: new Headers() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value ? { value } : undefined;
    },
  }),
  headers: async () => headerJar.current,
}));

import { getRequestPrincipal } from "../lib/auth/principal";

const originalNodeEnv = process.env.NODE_ENV;
const mutableEnv = process.env as Record<string, string | undefined>;

beforeEach(() => {
  cookieJar.clear();
  headerJar.current = new Headers();
});

afterEach(() => {
  if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
  else mutableEnv.NODE_ENV = originalNodeEnv;
});

function requestWithCookie(cookie: string): Request {
  return new Request("https://seed.example/api/bootstrap", {
    headers: { cookie },
  });
}

describe("session tokens", () => {
  it("issues and recognizes a 32-byte base64url token", () => {
    const token = createSessionToken();
    expect(isSessionToken(token)).toBe(true);
    expect(isSessionToken("not-a-token")).toBe(false);
  });

  it("reads the development session cookie from a request", () => {
    mutableEnv.NODE_ENV = "development";
    const token = createSessionToken();
    const request = requestWithCookie(`${SESSION_COOKIE_DEV}=${token}`);
    expect(readSessionTokenFromRequest(request)).toBe(token);
  });

  it("prefers the host cookie when development sends both", () => {
    mutableEnv.NODE_ENV = "development";
    const host = createSessionToken();
    const dev = createSessionToken();
    const request = requestWithCookie(
      `${SESSION_COOKIE_PROD}=${host}; ${SESSION_COOKIE_DEV}=${dev}`,
    );
    expect(readSessionTokenFromRequest(request)).toBe(host);
  });

  it("ignores the unprefixed cookie in production", () => {
    mutableEnv.NODE_ENV = "production";
    const dev = createSessionToken();
    const host = createSessionToken();
    expect(
      readSessionTokenFromRequest(
        requestWithCookie(`${SESSION_COOKIE_DEV}=${dev}`),
      ),
    ).toBeNull();
    expect(
      readSessionTokenFromRequest(
        requestWithCookie(
          `${SESSION_COOKIE_DEV}=${dev}; ${SESSION_COOKIE_PROD}=${host}`,
        ),
      ),
    ).toBe(host);
    expect(
      readSessionTokenFromRequest(
        requestWithCookie(
          `${SESSION_COOKIE_PROD}=not-a-token; ${SESSION_COOKIE_DEV}=${dev}`,
        ),
      ),
    ).toBeNull();
  });

  it("collects every valid session token, not only the winning cookie", () => {
    mutableEnv.NODE_ENV = "production";
    const host = createSessionToken();
    const dev = createSessionToken();
    const request = requestWithCookie(
      `${SESSION_COOKIE_DEV}=${dev}; ${SESSION_COOKIE_PROD}=${host}; ${SESSION_COOKIE_DEV}=not-a-token; ${SESSION_COOKIE_PROD}=${host}`,
    );
    expect(readSessionTokensFromRequest(request)).toEqual([dev, host]);
    expect(readSessionTokenFromRequest(request)).toBe(host);
  });

  it("ignores unrelated cookies", () => {
    expect(readCookieValue("theme=dark", SESSION_COOKIE_DEV)).toBeNull();
  });

  it("clears both session cookie names", () => {
    mutableEnv.NODE_ENV = "development";
    expect(sessionClearCookieHeaders()).toEqual([
      "__Host-seedjournal-session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure",
      "seedjournal-session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
    ]);
    mutableEnv.NODE_ENV = "production";
    expect(sessionClearCookieHeaders()).toEqual([
      "__Host-seedjournal-session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure",
      "seedjournal-session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure",
    ]);
  });
});

describe("request principal session cookie", () => {
  it("accepts the unprefixed cookie from dev request headers", async () => {
    mutableEnv.NODE_ENV = "development";
    const token = createSessionToken();
    headerJar.current = new Headers({
      cookie: `${SESSION_COOKIE_DEV}=${token}`,
    });
    await expect(getRequestPrincipal()).resolves.toEqual({
      kind: "session",
      sessionToken: token,
    });
  });

  it("does not let the unprefixed cookie open a production session", async () => {
    mutableEnv.NODE_ENV = "production";
    const dev = createSessionToken();
    const host = createSessionToken();
    cookieJar.set(SESSION_COOKIE_DEV, dev);
    headerJar.current = new Headers({
      cookie: `${SESSION_COOKIE_DEV}=${dev}`,
    });
    await expect(getRequestPrincipal()).resolves.toBeNull();

    cookieJar.set(SESSION_COOKIE_PROD, host);
    await expect(getRequestPrincipal()).resolves.toEqual({
      kind: "session",
      sessionToken: host,
    });
  });
});
