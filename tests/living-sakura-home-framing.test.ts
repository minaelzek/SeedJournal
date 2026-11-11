import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as THREE from "three";
import { createLivingSakuraModel } from "../features/garden/living-sakura/livingSakuraModel";
import {
  productCourtyardAtmosphere,
  productStageScale,
  productTreeFraming,
} from "../features/garden/living-sakura/livingSakuraFraming";

describe("home tree framing + attached memory petals", () => {
  it("lifts early framing closer so companions sit above the dock, not under CTA", () => {
    const seed = productTreeFraming(1, { narrow: true });
    const mature = productTreeFraming(192, { narrow: true });

    expect(seed.distance).toBeLessThan(mature.distance);
    expect(seed.focusY).toBeLessThan(mature.focusY);
    expect(seed.rootLiftY).toBeGreaterThan(0);
    expect(mature.rootLiftY).toBe(0);
    // Progressive densify scale grows seed → mature.
    expect(productStageScale(1)).toBeLessThan(productStageScale(48));
    expect(productStageScale(48)).toBeLessThan(productStageScale(192));
  });

  it("frames a 0-journal stone closer and lower than a 12-journal sapling", () => {
    const stone = productTreeFraming(0);
    const sapling = productTreeFraming(12);
    const narrowStone = productTreeFraming(0, { narrow: true });
    const narrowSapling = productTreeFraming(12, { narrow: true });

    expect(stone.distance).toBeLessThan(sapling.distance);
    expect(stone.focusY).toBeLessThan(sapling.focusY);
    expect(stone.cameraY).toBeLessThan(sapling.cameraY);
    // The journal-0 stone stays in the soil nest — no root lift.
    expect(stone.rootLiftY).toBe(0);
    expect(narrowStone.distance).toBeLessThan(narrowSapling.distance);
    expect(narrowStone.focusY).toBeLessThan(narrowSapling.focusY);

    const lifted = productTreeFraming(12, { aboveCard: true });
    expect(lifted.focusY).toBeLessThan(sapling.focusY);
    expect(lifted.distance).toBeLessThan(sapling.distance);
    expect(lifted.distance).toBeGreaterThan(1);

    const seedAir = productCourtyardAtmosphere(0);
    const sproutAir = productCourtyardAtmosphere(1);
    expect(seedAir.fogNear).toBeGreaterThan(stone.distance);
    expect(sproutAir.fogNear).toBeGreaterThan(productTreeFraming(1).distance);
    expect(seedAir.color).toBe("#f2e8dc");
  });

  it("binds newest memory to a visible wood segment (no sky-float on early trees)", () => {
    for (const count of [1, 3, 12] as const) {
      const model = createLivingSakuraModel({
        rootSeed: "attach-test",
        journalCount: count,
        newestGrowthUnits: 2,
      });

      expect(model.newestMemory).not.toBeNull();
      expect(model.memoryInstances.length).toBe(count);

      const newest = model.memoryInstances[model.memoryInstances.length - 1];
      // Display pivot is a rendered wood group (parent of newestMemory).
      expect(model.newestMemory!.parent).not.toBeNull();
      const parentIsRoot = model.newestMemory!.parent === model.root;
      const parentIsPivot = model.pivots.some(
        (pivot) => pivot.group === model.newestMemory!.parent,
      );
      expect(parentIsRoot || parentIsPivot).toBe(true);

      const world = model.getMemoryWorldPosition(
        newest.entryId,
        new THREE.Vector3(),
      );
      expect(world).not.toBeNull();
      // Petal must sit near the living wood volume, not high empty sky.
      expect(world!.y).toBeGreaterThan(0.15);
      expect(world!.y).toBeLessThan(8.5);
      expect(Math.hypot(world!.x, world!.z)).toBeLessThan(7.5);

      model.dispose();
    }
  });

  it("grows visible wood count as journals accumulate (seed → fuller companion)", () => {
    const early = createLivingSakuraModel({
      rootSeed: "growth-path",
      journalCount: 1,
      newestGrowthUnits: 1,
    });
    const mid = createLivingSakuraModel({
      rootSeed: "growth-path",
      journalCount: 48,
      newestGrowthUnits: 2,
    });
    const late = createLivingSakuraModel({
      rootSeed: "growth-path",
      journalCount: 192,
      newestGrowthUnits: 4,
    });

    expect(early.visibleBranchCount).toBeGreaterThanOrEqual(1);
    expect(mid.visibleBranchCount).toBeGreaterThan(early.visibleBranchCount);
    expect(late.visibleBranchCount).toBeGreaterThanOrEqual(mid.visibleBranchCount);
    const earlyHeight = new THREE.Box3().setFromObject(early.root).getSize(
      new THREE.Vector3(),
    ).y;
    const lateHeight = new THREE.Box3().setFromObject(late.root).getSize(
      new THREE.Vector3(),
    ).y;
    expect(lateHeight).toBeGreaterThan(earlyHeight);

    early.dispose();
    mid.dispose();
    late.dispose();
  });

  it("product scene wires journal-aware camera framing (shipped path)", () => {
    const scene = readFileSync(
      resolve("features/garden/living-sakura/LivingSakuraScene.tsx"),
      "utf8",
    );
    const atmosphere = readFileSync(
      resolve("features/garden/living-sakura/gardenAtmosphere.tsx"),
      "utf8",
    );
    const model = readFileSync(
      resolve("features/garden/living-sakura/livingSakuraModel.ts"),
      "utf8",
    );
    const css = readFileSync(resolve("features/shell/shell.css"), "utf8");

    expect(scene).toContain("productTreeFraming");
    expect(atmosphere).toContain("productCourtyardAtmosphere");
    expect(scene).toContain("CourtyardAir");
    expect(scene).toContain("journalCount={journalCount}");
    expect(scene).not.toContain('args={["#efe6da", 11, 36]}');
    expect(model).toContain("resolveVisibleHost");
    expect(model).toContain("localOnVisibleHost");
    expect(css).toContain("sj-home__dock");
    expect(css).toContain("max-height: min(42dvh, 22rem)");
  });

  it("living CSS cascade lock beats stage and mobile garden transforms", () => {
    const css = readFileSync(resolve("features/shell/shell.css"), "utf8");

    // Stage/mobile rules that would otherwise shift living WebGL under the dock.
    const stageSeedRule = css.indexOf(
      '.sj-app-frame[data-garden-mode="active"]\n  .sj-app-frame__garden[data-tree-stage="seed"]',
    );
    const stageSeedAlt = css.indexOf(
      'data-tree-stage="seed"]',
    );
    const mobileActiveScale = css.indexOf(
      "@media (max-width: 48rem)",
    );
    const mobileSeedTransform = css.indexOf(
      "translateY(5vh) scale(1.22)",
    );

    // Locks must appear after those transforms (source order = cascade when equal).
    const desktopLock = css.indexOf("living-transform-cascade-lock");
    const mobileLock = css.indexOf("living-transform-cascade-lock-mobile");

    expect(stageSeedAlt).toBeGreaterThan(-1);
    expect(mobileActiveScale).toBeGreaterThan(-1);
    expect(mobileSeedTransform).toBeGreaterThan(-1);
    expect(desktopLock).toBeGreaterThan(-1);
    expect(mobileLock).toBeGreaterThan(-1);

    // Desktop lock after base stage seed transform block.
    expect(desktopLock).toBeGreaterThan(stageSeedAlt);
    // Mobile lock after the 5vh seed scale rule inside the media query.
    expect(mobileLock).toBeGreaterThan(mobileSeedTransform);
    expect(mobileLock).toBeGreaterThan(mobileActiveScale);

    // Lock bodies re-assert transform:none with living renderer specificity.
    const desktopSlice = css.slice(desktopLock, desktopLock + 2200);
    const mobileSlice = css.slice(mobileLock, mobileLock + 2400);
    expect(desktopSlice).toContain('data-garden-renderer="living"');
    expect(desktopSlice).toContain("transform: none");
    expect(desktopSlice).toContain('data-tree-stage="seed"');
    expect(mobileSlice).toContain('data-garden-renderer="living"');
    expect(mobileSlice).toContain("transform: none");
    expect(mobileSlice).toContain('data-tree-stage="seed"');
    expect(mobileSlice).toContain('data-tree-stage="sprout"');

    // Ambient living must not keep translateX(10vw) scale from the generic ambient rule.
    expect(desktopSlice).toMatch(
      /data-garden-renderer="living"[\s\S]*data-garden-mode="ambient"[\s\S]*transform:\s*none/,
    );

    void stageSeedRule;
  });
});
