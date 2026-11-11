import { AuthenticationRequiredError } from "@/lib/auth/errors";
import type { ApiError } from "@/lib/contracts";
import { isTrustedMutationOrigin } from "@/lib/http/request-origin";

const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
export const CSRF_COOKIE = "__Host-seedjournal-csrf";
export const CSRF_COOKIE_DEV = "seedjournal-csrf";
export const CSRF_HEADER = "x-seedjournal-csrf";
export const MAX_JSON_BODY_BYTES = 400 * 1024;
export const REQUEST_ID_HEADER = "X-Request-ID";

export class ApiRouteError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiRouteError";
  }
}

export function apiJson(
  body: unknown,
  init: ResponseInit = {},
): Response {
  const headers = copyHeadersPreservingSetCookie(init.headers);
  headers.set("Content-Type", JSON_CONTENT_TYPE);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(body), { ...init, headers });
}

function copyHeadersPreservingSetCookie(
  init: HeadersInit | undefined,
): Headers {
  const headers = new Headers();
  if (!init) return headers;
  // One Set-Cookie string is one cookie. Headers.set and a combined value
  // drop every cookie after the first, so each cookie is appended alone.
  if (hasSetCookieList(init)) {
    init.forEach((value, key) => {
      if (key === "set-cookie") return;
      headers.append(key, value);
    });
    for (const cookie of init.getSetCookie()) {
      headers.append("Set-Cookie", cookie);
    }
    return headers;
  }
  if (Array.isArray(init)) {
    for (const [key, value] of init) {
      headers.append(key, value);
    }
    return headers;
  }
  for (const [key, value] of Object.entries(init)) {
    headers.append(key, value);
  }
  return headers;
}

function hasSetCookieList(
  init: HeadersInit,
): init is Headers {
  return (
    typeof (init as Headers).getSetCookie === "function" &&
    typeof (init as Headers).forEach === "function"
  );
}

export function apiError(
  error: unknown,
  requestId = crypto.randomUUID(),
): Response {
  if (error instanceof AuthenticationRequiredError) {
    return errorResponse(401, "authentication_required", error.message, requestId);
  }
  if (error instanceof ApiRouteError) {
    return errorResponse(error.status, error.code, error.message, requestId);
  }
  return errorResponse(
    500,
    "internal_error",
    "The request could not be completed.",
    requestId,
  );
}

export function withApi<T extends unknown[]>(
  handler: (...args: T) => Promise<Response>,
): (...args: T) => Promise<Response> {
  return async (...args: T) => {
    const request = args[0] instanceof Request ? args[0] : undefined;
    const requestId = crypto.randomUUID();
    try {
      const response = await handler(...args);
      response.headers.set(REQUEST_ID_HEADER, requestId);
      return response;
    } catch (error) {
      logApiFailure(request, error, requestId);
      return apiError(error, requestId);
    }
  };
}

function csrfCookieName(): string {
  return process.env.NODE_ENV === "production" ? CSRF_COOKIE : CSRF_COOKIE_DEV;
}

export function issueCsrf(request: Request): {
  token: string;
  setCookie: string | null;
} {
  const current = readAcceptedCsrfCookie(request.headers.get("cookie"));
  if (current) {
    return { token: current, setCookie: null };
  }
  const token = randomBase64Url(32);
  const secure = process.env.NODE_ENV === "production";
  const parts = [
    `${csrfCookieName()}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=43200",
  ];
  if (secure) parts.push("Secure");
  return {
    token,
    setCookie: parts.join("; "),
  };
}

export async function assertSafeMutation(request: Request): Promise<void> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0];
  if (contentType?.trim().toLowerCase() !== "application/json") {
    throw new ApiRouteError(
      415,
      "unsupported_media_type",
      "Requests must use application/json.",
    );
  }

  const url = new URL(request.url);
  if (
    !isTrustedMutationOrigin(
      url,
      request.headers.get("origin"),
      process.env.SEED_JOURNAL_ALLOWED_ORIGINS,
    )
  ) {
    throw new ApiRouteError(
      403,
      "invalid_origin",
      "The request origin was rejected.",
    );
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new ApiRouteError(
      403,
      "cross_site_request",
      "Cross-site requests are not permitted.",
    );
  }

  const cookieToken = readAcceptedCsrfCookie(request.headers.get("cookie"));
  const headerToken = request.headers.get(CSRF_HEADER);
  if (
    !cookieToken ||
    !headerToken ||
    !isCsrfToken(cookieToken) ||
    !isCsrfToken(headerToken) ||
    !constantTimeEqual(cookieToken, headerToken)
  ) {
    throw new ApiRouteError(
      403,
      "invalid_csrf",
      "The request security token is invalid.",
    );
  }
}

export async function readJson<T>(
  request: Request,
  maxBytes = MAX_JSON_BODY_BYTES,
): Promise<T> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > maxBytes
  ) {
    throw new ApiRouteError(413, "payload_too_large", "The request is too large.");
  }
  if (!request.body) {
    throw new ApiRouteError(400, "invalid_json", "A JSON body is required.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ApiRouteError(
          413,
          "payload_too_large",
          "The request is too large.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as T;
  } catch {
    throw new ApiRouteError(400, "invalid_json", "The JSON body is invalid.");
  }
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  requestId: string,
): Response {
  const body: ApiError = { error: { code, message }, requestId };
  return apiJson(body, {
    status,
    headers: { [REQUEST_ID_HEADER]: requestId },
  });
}

function logApiFailure(
  request: Request | undefined,
  error: unknown,
  requestId: string,
): void {
  const status =
    error instanceof AuthenticationRequiredError
      ? 401
      : error instanceof ApiRouteError
        ? error.status
        : 500;
  const code =
    error instanceof AuthenticationRequiredError
      ? "authentication_required"
      : error instanceof ApiRouteError
        ? error.code
        : "internal_error";
  const record = {
    event: "api_error",
    requestId,
    method: request?.method ?? "UNKNOWN",
    path: request ? new URL(request.url).pathname : "unknown",
    status,
    code,
    errorName: error instanceof Error ? error.name : "UnknownError",
  };
  if (status >= 500) {
    console.error("[seed-journal] api_error", record);
  } else {
    console.warn("[seed-journal] api_error", record);
  }
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key === name) return part.slice(separator + 1).trim();
  }
  return null;
}

function readAcceptedCsrfCookie(header: string | null): string | null {
  const host = readCookie(header, CSRF_COOKIE);
  if (host && isCsrfToken(host)) return host;
  // The unprefixed cookie can be planted by a sibling host. Production
  // accepts only the __Host- cookie, matching the session cookie rule.
  if (process.env.NODE_ENV === "production") return null;
  const dev = readCookie(header, CSRF_COOKIE_DEV);
  if (dev && isCsrfToken(dev)) return dev;
  return null;
}

function isCsrfToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function randomBase64Url(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}
