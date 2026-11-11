import { describe, expect, it, vi } from "vitest";

const vinextMocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  optimize: vi.fn(),
}));

vi.mock("vinext/server/app-router-entry", () => ({
  default: { fetch: vinextMocks.fetch },
}));

vi.mock("vinext/server/image-optimization", () => ({
  handleImageOptimization: vinextMocks.optimize,
  DEFAULT_DEVICE_SIZES: [640],
  DEFAULT_IMAGE_SIZES: [64],
}));
import {
  CSRF_COOKIE,
  CSRF_COOKIE_DEV,
  CSRF_HEADER,
  ApiRouteError,
  apiJson,
  assertSafeMutation,
  issueCsrf,
  readJson,
  withApi,
} from "../app/api/_shared/http";
import { applySecurityHeaders } from "../lib/http/security-headers";
import { isTrustedMutationOrigin } from "../lib/http/request-origin";
import worker from "../worker/index";

const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com https://appleid.cdn-apple.com; style-src 'self' 'unsafe-inline' https://accounts.google.com; connect-src 'self' https://accounts.google.com https://appleid.apple.com; img-src 'self' data: blob: https://*.googleusercontent.com; font-src 'self'; worker-src 'self' blob:; frame-src https://accounts.google.com https://appleid.apple.com; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

describe("API request protections", () => {
  it("accepts a same-origin JSON mutation with a matching CSRF token", async () => {
    const seedRequest = new Request("https://seed.example/api/bootstrap");
    const { token } = issueCsrf(seedRequest);
    const request = new Request("https://seed.example/api/entries", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://seed.example",
        "sec-fetch-site": "same-origin",
        cookie: `${CSRF_COOKIE}=${token}`,
        [CSRF_HEADER]: token,
      },
      body: "{}",
    });
    await expect(assertSafeMutation(request)).resolves.toBeUndefined();
  });

  it("does not accept a planted unprefixed CSRF cookie in production", async () => {
    const mutableEnv = process.env as Record<string, string | undefined>;
    const previous = process.env.NODE_ENV;
    mutableEnv.NODE_ENV = "production";
    try {
      const issued = issueCsrf(
        new Request("https://seed.example/api/auth/csrf", {
          headers: { cookie: `${CSRF_COOKIE_DEV}=${"a".repeat(43)}` },
        }),
      );
      expect(issued.token).not.toBe("a".repeat(43));
      expect(issued.setCookie).toContain("__Host-seedjournal-csrf=");
      expect(issued.setCookie).toContain("HttpOnly");
      expect(issued.setCookie).toContain("Secure");
      const request = new Request("https://seed.example/api/entries", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://seed.example",
          "sec-fetch-site": "same-origin",
          cookie: `${CSRF_COOKIE_DEV}=${issued.token}`,
          [CSRF_HEADER]: issued.token,
        },
        body: "{}",
      });
      await expect(assertSafeMutation(request)).rejects.toMatchObject({
        code: "invalid_csrf",
        status: 403,
      });
    } finally {
      if (previous === undefined) delete mutableEnv.NODE_ENV;
      else mutableEnv.NODE_ENV = previous;
    }
  });

  it("trusts the workers.dev host that received the request and not a sibling", async () => {
    const worker = "https://seed-journal.account.workers.dev";
    const issued = issueCsrf(new Request(`${worker}/api/auth/csrf`));
    const same = new Request(`${worker}/api/entries`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: worker,
        "sec-fetch-site": "same-origin",
        cookie: `${CSRF_COOKIE}=${issued.token}`,
        [CSRF_HEADER]: issued.token,
      },
      body: "{}",
    });
    await expect(assertSafeMutation(same)).resolves.toBeUndefined();

    const sibling = new Request(`${worker}/api/entries`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://other-worker.account.workers.dev",
        "sec-fetch-site": "same-site",
        cookie: `${CSRF_COOKIE}=${issued.token}`,
        [CSRF_HEADER]: issued.token,
      },
      body: "{}",
    });
    await expect(assertSafeMutation(sibling)).rejects.toMatchObject({
      code: "invalid_origin",
    });
    expect(
      isTrustedMutationOrigin(
        new URL(`${worker}/api/entries`),
        "https://journal.example",
        "https://workers.dev, https://journal.example/path, https://journal.example",
      ),
    ).toBe(true);
    expect(
      isTrustedMutationOrigin(
        new URL(`${worker}/api/entries`),
        "https://evil.workers.dev",
        "https://workers.dev",
      ),
    ).toBe(false);
  });

  it("rejects cross-origin and mismatched-token mutations", async () => {
    const request = new Request("https://seed.example/api/entries", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.example",
        cookie: `${CSRF_COOKIE}=invalid`,
        [CSRF_HEADER]: "invalid",
      },
      body: "{}",
    });
    await expect(assertSafeMutation(request)).rejects.toMatchObject({
      code: "invalid_origin",
      status: 403,
    } satisfies Partial<ApiRouteError>);
  });

  it("bounds streamed JSON request bodies", async () => {
    const request = new Request("https://seed.example/api/test", {
      method: "POST",
      body: JSON.stringify({ value: "too large" }),
    });
    await expect(readJson(request, 4)).rejects.toMatchObject({
      code: "payload_too_large",
      status: 413,
    } satisfies Partial<ApiRouteError>);
  });

  it("returns a request id and logs only safe error metadata", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const handler = withApi(async (request: Request) => {
        void request;
        throw new ApiRouteError(
          400,
          "invalid_request",
          "Do not put sensitive request content in logs.",
        );
      });
      const response = await handler(
        new Request("https://seed.example/api/entries/private-id?secret=hidden"),
      );
      const body = (await response.json()) as { requestId: string };
      expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(response.headers.get("X-Request-ID")).toBe(body.requestId);
      const log = JSON.stringify(warning.mock.calls);
      expect(log).toContain(body.requestId);
      expect(log).toContain("invalid_request");
      expect(log).not.toContain("Do not put sensitive request content in logs.");
      expect(log).not.toContain("secret=hidden");
    } finally {
      warning.mockRestore();
    }
  });
});

describe("apiJson", () => {
  it("sends every appended Set-Cookie instead of one combined header", () => {
    const headers = new Headers();
    headers.append(
      "Set-Cookie",
      "__Host-seedjournal-session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure",
    );
    headers.append(
      "Set-Cookie",
      "seedjournal-session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
    );
    const response = apiJson({ ok: true }, { headers });
    expect(response.headers.getSetCookie()).toEqual([
      "__Host-seedjournal-session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure",
      "seedjournal-session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
    ]);
  });

  it("keeps a single Set-Cookie passed as a header record", () => {
    const response = apiJson(
      { ok: true },
      { headers: { "Set-Cookie": "seedjournal-session=abc; HttpOnly; Path=/" } },
    );
    expect(response.headers.getSetCookie()).toEqual([
      "seedjournal-session=abc; HttpOnly; Path=/",
    ]);
  });
});

describe("applySecurityHeaders", () => {
  it("sets the edge policy on https responses and keeps Set-Cookie", () => {
    const headers = new Headers({
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Request-ID": "req-1",
    });
    headers.append("Set-Cookie", "seedjournal-session=abc; HttpOnly; Path=/");
    headers.append("Set-Cookie", "seedjournal-csrf=token; Path=/");
    const secured = applySecurityHeaders(
      new Response("ok", { status: 200, headers }),
      new Request("https://seed.example/journal"),
    );

    expect(secured.headers.get("content-security-policy")).toBe(
      CONTENT_SECURITY_POLICY,
    );
    expect(secured.headers.get("content-security-policy")).not.toContain(
      "unsafe-eval",
    );
    expect(secured.headers.get("referrer-policy")).toBe("no-referrer");
    expect(secured.headers.get("x-content-type-options")).toBe("nosniff");
    expect(secured.headers.get("permissions-policy")).toBe(
      "camera=(), microphone=(self), geolocation=(), payment=(), usb=()",
    );
    expect(secured.headers.get("cross-origin-opener-policy")).toBe(
      "same-origin-allow-popups",
    );
    expect(secured.headers.get("x-frame-options")).toBe("DENY");
    expect(secured.headers.get("cross-origin-resource-policy")).toBe(
      "same-origin",
    );
    expect(secured.headers.get("strict-transport-security")).toBe(
      "max-age=15552000; includeSubDomains",
    );
    expect(secured.headers.getSetCookie()).toEqual([
      "seedjournal-session=abc; HttpOnly; Path=/",
      "seedjournal-csrf=token; Path=/",
    ]);
    expect(secured.headers.get("cache-control")).toBe("private, no-store");
    expect(secured.headers.get("x-request-id")).toBe("req-1");
    expect(secured.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(secured.status).toBe(200);
  });

  it("keeps the image sandbox policy instead of the document policy", () => {
    const imagePolicy = "script-src 'none'; frame-src 'none'; sandbox;";
    const secured = applySecurityHeaders(
      new Response("png", {
        headers: {
          "Content-Type": "image/png",
          "Content-Security-Policy": imagePolicy,
        },
      }),
      new Request("https://seed.example/_vinext/image?url=%2Fog.png&w=640&q=75"),
    );

    expect(secured.headers.get("content-security-policy")).toBe(imagePolicy);
    expect(secured.headers.get("content-security-policy")).not.toContain(
      "unsafe-inline",
    );
    expect(secured.headers.get("x-content-type-options")).toBe("nosniff");
    expect(secured.headers.get("strict-transport-security")).toBe(
      "max-age=15552000; includeSubDomains",
    );
  });

  it("pins workers.dev without includeSubDomains and a custom domain with it", () => {
    const workers = applySecurityHeaders(
      new Response("ok"),
      new Request("https://seed-journal.account.workers.dev/welcome"),
    );
    expect(workers.headers.get("strict-transport-security")).toBe(
      "max-age=15552000",
    );

    const custom = applySecurityHeaders(
      new Response("ok"),
      new Request("https://journal.example/welcome"),
    );
    expect(custom.headers.get("strict-transport-security")).toBe(
      "max-age=15552000; includeSubDomains",
    );
  });

  it("omits strict-transport-security when the request is not https", () => {
    const secured = applySecurityHeaders(
      new Response(null, {
        status: 204,
        headers: { "Strict-Transport-Security": "max-age=1" },
      }),
      new Request("http://seed.example/"),
    );

    expect(secured.headers.get("strict-transport-security")).toBeNull();
    expect(secured.headers.get("referrer-policy")).toBe("no-referrer");
    expect(secured.status).toBe(204);
    expect(secured.body).toBeNull();
  });
});

describe("worker security headers", () => {
  it("applies the edge policy on the production fetch path", async () => {
    vinextMocks.fetch.mockResolvedValueOnce(
      new Response("ok", {
        headers: { "Cache-Control": "private, no-store" },
      }),
    );
    const response = await worker.fetch(
      new Request("https://seed.example/journal"),
      {} as never,
      {} as never,
    );

    expect(response.headers.get("content-security-policy")).toContain(
      "default-src 'self'",
    );
    expect(response.headers.get("strict-transport-security")).toBe(
      "max-age=15552000; includeSubDomains",
    );
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("does not replace the image endpoint sandbox policy", async () => {
    const imagePolicy = "script-src 'none'; frame-src 'none'; sandbox;";
    vinextMocks.optimize.mockResolvedValueOnce(
      new Response("png", {
        headers: { "Content-Security-Policy": imagePolicy },
      }),
    );
    const response = await worker.fetch(
      new Request("https://seed.example/_vinext/image?url=%2Fog.png"),
      {} as never,
      {} as never,
    );

    expect(response.headers.get("content-security-policy")).toBe(imagePolicy);
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
});
