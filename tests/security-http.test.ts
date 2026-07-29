import { describe, expect, it } from "vitest";
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  ApiRouteError,
  assertSafeMutation,
  issueCsrf,
  readJson,
} from "../app/api/_shared/http";

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
});
