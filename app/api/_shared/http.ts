import { AuthenticationRequiredError } from "@/lib/auth/errors";
import type { ApiError } from "@/lib/contracts";

const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
export const CSRF_COOKIE = "__Host-seedjournal-csrf";
export const CSRF_HEADER = "x-seedjournal-csrf";
export const MAX_JSON_BODY_BYTES = 400 * 1024;

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
  const headers = new Headers(init.headers);
  headers.set("Content-Type", JSON_CONTENT_TYPE);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(body), { ...init, headers });
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
    try {
      return await handler(...args);
    } catch (error) {
      return apiError(error);
    }
  };
}

export function issueCsrf(request: Request): {
  token: string;
  setCookie: string | null;
} {
  const current = readCookie(request.headers.get("cookie"), CSRF_COOKIE);
  if (current && isCsrfToken(current)) {
    return { token: current, setCookie: null };
  }
  const token = randomBase64Url(32);
  return {
    token,
    setCookie: `${CSRF_COOKIE}=${token}; Path=/; Secure; SameSite=Strict; Max-Age=43200`,
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
  const origin = request.headers.get("origin");
  if (!origin || origin !== url.origin) {
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

  const cookieToken = readCookie(
    request.headers.get("cookie"),
    CSRF_COOKIE,
  );
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
  return apiJson(body, { status });
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
