import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./lib/http/security-headers";

// worker/index.ts applySecurityHeaders is the production source of truth.
// HSTS is added there only for https requests, not in this static list.
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS.map((header) => ({
          key: header.key,
          value: header.value,
        })),
      },
    ];
  },
};

export default nextConfig;
