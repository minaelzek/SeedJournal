const LOCAL_HTTP_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export const HSTS_MAX_AGE = "max-age=15552000";
export const HSTS_CUSTOM_DOMAIN = `${HSTS_MAX_AGE}; includeSubDomains`;

/**
 * workers.dev is a shared platform suffix. HSTS on that host pins only the
 * exact Worker hostname. includeSubDomains belongs on a custom domain the
 * operator controls, and is selected automatically once the request host is
 * no longer under workers.dev.
 */
export function isWorkersDevHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/u, "");
  return host === "workers.dev" || host.endsWith(".workers.dev");
}

export function strictTransportSecurityForHost(hostname: string): string {
  return isWorkersDevHostname(hostname) ? HSTS_MAX_AGE : HSTS_CUSTOM_DOMAIN;
}

/**
 * A mutation is trusted when its Origin is the request's own origin, or an
 * extra https origin listed for a custom-domain cutover. Another workers.dev
 * host is not trusted just because it shares the suffix.
 */
export function isTrustedMutationOrigin(
  requestUrl: URL,
  originHeader: string | null,
  extraOrigins?: string,
): boolean {
  const origin = parseOrigin(originHeader);
  if (!origin) return false;
  if (origin.origin === requestUrl.origin) return true;
  return allowedOriginSet(extraOrigins).has(origin.origin);
}

export function allowedOriginSet(extraOrigins?: string): Set<string> {
  const allowed = new Set<string>();
  if (!extraOrigins) return allowed;
  for (const part of extraOrigins.split(",")) {
    const origin = parseOrigin(part.trim());
    if (!origin || origin.protocol !== "https:") continue;
    if (origin.hostname === "workers.dev") continue;
    allowed.add(origin.origin);
  }
  return allowed;
}

function parseOrigin(value: string | null | undefined): URL | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.origin !== value) return null;
  if (url.username || url.password) return null;
  if (url.protocol === "https:") return url;
  if (url.protocol === "http:" && LOCAL_HTTP_HOSTS.has(url.hostname)) return url;
  return null;
}
