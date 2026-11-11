// Production source of truth is worker applySecurityHeaders. next.config.ts
// mirrors this static list; Cloudflare does not rely on those headers.
// script-src and style-src keep 'unsafe-inline' only because Next/vinext and
// the Google button require it. Do not widen script-src.

export const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com https://appleid.cdn-apple.com; style-src 'self' 'unsafe-inline' https://accounts.google.com; connect-src 'self' https://accounts.google.com https://appleid.apple.com; img-src 'self' data: blob: https://*.googleusercontent.com; font-src 'self'; worker-src 'self' blob:; frame-src https://accounts.google.com https://appleid.apple.com; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'";

export const STRICT_TRANSPORT_SECURITY = "max-age=15552000; includeSubDomains";

export const SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=()",
  },
  // same-origin-allow-popups keeps Google and Apple sign-in popups working.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
];

export function applySecurityHeaders(
  response: Response,
  request: Request,
): Response {
  const headers = copyResponseHeaders(response.headers);
  const keepImageSandbox =
    new URL(request.url).pathname === "/_vinext/image" &&
    headers.get("Content-Security-Policy")?.includes("sandbox") === true;
  for (const header of SECURITY_HEADERS) {
    // Document CSP allows unsafe-inline; keep the image endpoint's sandbox policy.
    if (header.key === "Content-Security-Policy" && keepImageSandbox) continue;
    headers.set(header.key, header.value);
  }

  if (new URL(request.url).protocol === "https:") {
    headers.set("Strict-Transport-Security", STRICT_TRANSPORT_SECURITY);
  } else {
    headers.delete("Strict-Transport-Security");
  }

  const status = response.status;
  const nullBody =
    status === 101 || status === 204 || status === 205 || status === 304;
  return new Response(nullBody ? null : response.body, {
    status,
    statusText: response.statusText,
    headers,
  });
}

function copyResponseHeaders(source: Headers): Headers {
  const headers = new Headers();
  source.forEach((value, key) => {
    if (key === "set-cookie") return;
    headers.set(key, value);
  });
  for (const cookie of source.getSetCookie()) {
    headers.append("Set-Cookie", cookie);
  }
  return headers;
}
