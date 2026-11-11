const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Shared local account and header impersonation.
 * A production build and NODE_ENV=production always refuse this.
 * Any other environment refuses it unless NODE_ENV is exactly
 * "development" or SEED_JOURNAL_DEV_AUTH=1. Unset NODE_ENV must not
 * fall open: that is how a Worker deployed without a production build
 * would accept a client-supplied identity header.
 */
export function allowDevAuth(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (productionBuild()) return false;
  if (process.env.SEED_JOURNAL_DEV_AUTH === "0") return false;
  if (process.env.SEED_JOURNAL_DEV_AUTH === "1") return true;
  return process.env.NODE_ENV === "development";
}

export function devAuthAllowedForRequest(request: Request): boolean {
  if (!allowDevAuth()) return false;
  if (process.env.SEED_JOURNAL_DEV_AUTH === "1") return true;
  return isLoopbackHostname(new URL(request.url).hostname);
}

export function devAuthAllowedForHostHeader(
  hostHeader: string | null,
): boolean {
  if (!allowDevAuth()) return false;
  if (process.env.SEED_JOURNAL_DEV_AUTH === "1") return true;
  return isLoopbackHostname(hostnameFromHostHeader(hostHeader));
}

export function hostnameFromHostHeader(hostHeader: string | null): string | null {
  if (!hostHeader) return null;
  const host = hostHeader.trim().toLowerCase();
  if (!host) return null;
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    if (end <= 1) return null;
    return host.slice(1, end);
  }
  return host.replace(/:\d+$/u, "");
}

export function isLoopbackHostname(hostname: string | null): boolean {
  if (!hostname) return false;
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

function productionBuild(): boolean {
  const env = (import.meta as { env?: { PROD?: boolean } }).env;
  return env?.PROD === true;
}
