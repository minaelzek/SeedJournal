import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canUseWebGL,
  registerWebGLContextLost,
  resolveLivingGardenTier,
  type WebGLDocument,
} from "../features/garden/canUseWebGL";

function stubDocument(context: unknown | null): WebGLDocument {
  return {
    createElement() {
      return {
        getContext() {
          return context;
        },
      };
    },
  };
}

describe("living garden WebGL demotion chain", () => {
  it("detects WebGL availability from a real getContext probe", () => {
    expect(canUseWebGL(stubDocument({}))).toBe(true);
    expect(canUseWebGL(stubDocument(null))).toBe(false);
    expect(canUseWebGL(undefined)).toBe(false);
  });

  it("demotes living → seed mark when WebGL is unavailable", () => {
    expect(
      resolveLivingGardenTier({
        preferLiving: true,
        webglAvailable: false,
      }),
    ).toBe("seed");
  });

  it("keeps living when WebGL works and the scene has not failed", () => {
    expect(
      resolveLivingGardenTier({
        preferLiving: true,
        webglAvailable: true,
        livingFailed: false,
      }),
    ).toBe("living");
  });

  it("demotes living → seed mark on living scene error", () => {
    expect(
      resolveLivingGardenTier({
        preferLiving: true,
        webglAvailable: true,
        livingFailed: true,
      }),
    ).toBe("seed");
  });

  it("never returns living when WebGL is missing (blank garden forbidden)", () => {
    const tiers = [
      resolveLivingGardenTier({
        preferLiving: true,
        webglAvailable: false,
      }),
      resolveLivingGardenTier({
        preferLiving: true,
        webglAvailable: false,
        livingFailed: true,
      }),
    ];
    expect(tiers.every((tier) => tier === "seed")).toBe(true);
  });

  it("never offers an illustrated 2D tree as a demotion tier", () => {
    expect(
      resolveLivingGardenTier({
        preferLiving: false,
        webglAvailable: false,
      }),
    ).toBe("seed");
  });

  it("registerWebGLContextLost fires demotion callback on contextlost (shipped helper)", () => {
    let lost = 0;
    const listeners = new Map<string, (event: { preventDefault(): void }) => void>();
    const target = {
      addEventListener(
        type: "webglcontextlost",
        listener: (event: { preventDefault(): void }) => void,
      ) {
        listeners.set(type, listener);
      },
      removeEventListener(
        type: "webglcontextlost",
        listener: (event: { preventDefault(): void }) => void,
      ) {
        if (listeners.get(type) === listener) listeners.delete(type);
      },
    };

    const unsubscribe = registerWebGLContextLost(target, () => {
      lost += 1;
    });
    expect(listeners.has("webglcontextlost")).toBe(true);

    let prevented = false;
    listeners.get("webglcontextlost")!({
      preventDefault() {
        prevented = true;
      },
    });
    expect(prevented).toBe(true);
    expect(lost).toBe(1);

    expect(
      resolveLivingGardenTier({
        preferLiving: true,
        webglAvailable: true,
        livingFailed: true,
      }),
    ).toBe("seed");

    unsubscribe();
  });

  it("product living scene wires context-lost into LivingProductGarden demotion", () => {
    const sceneSource = readFileSync(
      resolve("features/garden/living-sakura/LivingSakuraScene.tsx"),
      "utf8",
    );
    const productSource = readFileSync(
      resolve("features/garden/living-sakura/LivingProductGarden.tsx"),
      "utf8",
    );
    const gardenSource = readFileSync(
      resolve("features/garden/living-sakura/LivingSakuraGarden.tsx"),
      "utf8",
    );
    const welcomeSource = readFileSync(
      resolve("app/welcome/WelcomeLivingCompanion.tsx"),
      "utf8",
    );
    const frameSource = readFileSync(
      resolve("features/shell/AppFrame.tsx"),
      "utf8",
    );

    expect(sceneSource).toContain("registerWebGLContextLost");
    expect(sceneSource).toContain("onContextLost");
    expect(sceneSource).toContain("gl.domElement");
    expect(gardenSource).toContain("onContextLost={onContextLost}");
    expect(productSource).toContain("onContextLost={onLivingContextLost}");
    expect(productSource).toContain("setLivingFailed(true)");
    expect(productSource).not.toContain("IllustratedSakura");
    expect(welcomeSource).not.toContain("IllustratedSakura");
    expect(frameSource).not.toContain("IllustratedSakura");
  });
});
