/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { applySecurityHeaders } from "../lib/http/security-headers";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

// No in-module auth limiter: isolate-local windows are leaky and fail open, not closed.
const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const response =
      url.pathname === "/_vinext/image"
        ? await optimizeImage(request, env)
        : await handler.fetch(request, env, ctx);
    return applySecurityHeaders(response, request);
  },
};

function optimizeImage(request: Request, env: Env): Promise<Response> {
  const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
  return handleImageOptimization(request, {
    fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
    transformImage: async (body, { width, format, quality }) => {
      const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
      return result.response();
    },
  }, allowedWidths);
}

export default worker;
