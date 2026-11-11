export const SESSION_COOKIE_PROD = "__Host-seedjournal-session";
export const SESSION_COOKIE_DEV = "seedjournal-session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function sessionCookieName(): string {
  return process.env.NODE_ENV === "production"
    ? SESSION_COOKIE_PROD
    : SESSION_COOKIE_DEV;
}

export function createSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

export function isSessionToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function readCookieValue(
  header: string | null,
  name: string,
): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key === name) return part.slice(separator + 1).trim();
  }
  return null;
}

export function readSessionTokenFromRequest(request: Request): string | null {
  const header = request.headers.get("cookie");
  const hostToken = readCookieValue(header, SESSION_COOKIE_PROD);
  if (hostToken && isSessionToken(hostToken)) return hostToken;
  // Local dev and Playwright send the unprefixed cookie over plain HTTP.
  // Production trusts only __Host-seedjournal-session, which a sibling
  // domain cannot plant. A leftover unprefixed cookie must not sign anyone in.
  if (process.env.NODE_ENV === "production") return null;
  const devToken = readCookieValue(header, SESSION_COOKIE_DEV);
  if (devToken && isSessionToken(devToken)) return devToken;
  return null;
}

export function readSessionTokensFromRequest(request: Request): string[] {
  const header = request.headers.get("cookie");
  if (!header) return [];
  const names = new Set<string>([SESSION_COOKIE_PROD, SESSION_COOKIE_DEV]);
  const tokens: string[] = [];
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (!names.has(key)) continue;
    const value = part.slice(separator + 1).trim();
    if (!isSessionToken(value) || tokens.includes(value)) continue;
    tokens.push(value);
  }
  return tokens;
}

export function sessionSetCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === "production";
  const parts = [
    `${sessionCookieName()}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function sessionClearCookieHeaders(): string[] {
  const secureDevCookie = process.env.NODE_ENV === "production";
  return [
    clearSessionCookie(SESSION_COOKIE_PROD, true),
    clearSessionCookie(SESSION_COOKIE_DEV, secureDevCookie),
  ];
}

function clearSessionCookie(name: string, secure: boolean): string {
  const parts = [
    `${name}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
