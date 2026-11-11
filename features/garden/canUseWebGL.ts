/**
 * Shared WebGL capability probe for product garden demotion.
 * Pure enough to unit-test with a document stub.
 */

export type WebGLDocument = {
  createElement(tagName: "canvas"): {
    getContext(
      contextId: string,
    ): unknown | null;
  };
};

/**
 * Returns true when the environment can create a WebGL (or WebGL2) context.
 * Safe on the server: returns false when `document` is unavailable.
 */
export function canUseWebGL(
  doc: WebGLDocument | null | undefined = typeof document !== "undefined"
    ? document
    : undefined,
): boolean {
  if (!doc) return false;
  try {
    const canvas = doc.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2") ||
        canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl"),
    );
  } catch {
    return false;
  }
}

/**
 * Product demotion for the living garden:
 * living (WebGL) → static seed mark (GardenFallback).
 * There is no illustrated 2D tree.
 */
export type GardenDemotionTier = "living" | "seed";

export function resolveLivingGardenTier(input: {
  preferLiving: boolean;
  webglAvailable: boolean;
  livingFailed?: boolean;
}): GardenDemotionTier {
  if (input.preferLiving && input.webglAvailable && !input.livingFailed) {
    return "living";
  }
  return "seed";
}

/** Minimal event target used by the product WebGL context-lost bridge. */
export type WebGLContextLostTarget = {
  addEventListener(
    type: "webglcontextlost",
    listener: (event: { preventDefault(): void }) => void,
    options?: { once?: boolean },
  ): void;
  removeEventListener(
    type: "webglcontextlost",
    listener: (event: { preventDefault(): void }) => void,
  ): void;
};

/**
 * Registers a one-shot `webglcontextlost` listener (mirrors legacy SakuraScene).
 * Returns an unsubscribe function. Safe to call when `target` is missing.
 */
export function registerWebGLContextLost(
  target: WebGLContextLostTarget | null | undefined,
  onLost: () => void,
): () => void {
  if (!target) return () => undefined;
  const handler = (event: { preventDefault(): void }) => {
    try {
      event.preventDefault();
    } catch {
      // Some synthetic events omit preventDefault — demotion still proceeds.
    }
    onLost();
  };
  target.addEventListener("webglcontextlost", handler, { once: true });
  return () => {
    try {
      target.removeEventListener("webglcontextlost", handler);
    } catch {
      // ignore
    }
  };
}
