import { describe, expect, it } from "vitest";
import {
  buildBotanicalBranchGeometry,
  buildCherryStoneGeometry,
  buildPointedLeafGeometry,
  buildSakuraBlossomGeometry,
  collectBarkLenticels,
} from "../features/garden/art/botanicalGeometry";
import { TREE_MATERIAL_FALLBACKS } from "../features/garden/materials";
import { usesTreeRootContact } from "../features/garden/art/stage";
import {
  GARDEN_VERTICAL_FOV_DEGREES,
  gardenCameraDistance,
  gardenLookAtY,
  gardenOrganPresentationScale,
} from "../features/garden/art/framing";
import type { CubicBranch } from "../features/garden/types";
import type { TreeTopology } from "../features/garden/types";
import {
  terminalBranchIndexes,
  visibleBranchIndexes,
} from "../features/garden/art/branchPresentation";

const trunk: CubicBranch = {
  id: "trunk",
  parentId: null,
  order: 0,
  start: [0, -2.8, 0],
  controlA: [-0.05, -1.4, 0.03],
  controlB: [0.12, 0.2, -0.04],
  end: [0.35, 1.8, 0],
  radiusStart: 0.34,
  radiusEnd: 0.1,
  birthSequence: 1,
  axisProgress: 0,
  windWeight: 0.08,
  barkVariation: 0.42,
};

describe("botanical art geometry", () => {
  it("builds the entire branch system as one indexed swept mesh", () => {
    const geometry = buildBotanicalBranchGeometry([trunk], 9, 12);
    expect(geometry.getAttribute("position").count).toBe(117);
    expect(geometry.getIndex()?.count).toBe(648);
    expect(geometry.boundingSphere?.radius).toBeGreaterThan(2);
    const colors = geometry.getAttribute("color");
    expect(
      Math.min(
        ...Array.from(
          colors.array as Float32Array<ArrayBuffer>,
        ),
      ),
    ).toBeGreaterThan(0.65);
  });

  it("keeps sakura pigments legible on the light garden field", () => {
    const luminance = (hex: string) => {
      const channels = hex
        .slice(1)
        .match(/.{2}/g)!
        .map((channel) => Number.parseInt(channel, 16) / 255);
      return (
        channels[0] * 0.2126 +
        channels[1] * 0.7152 +
        channels[2] * 0.0722
      );
    };
    const background = luminance(TREE_MATERIAL_FALLBACKS.void);
    // Bark is darker grey-brown against the light field.
    expect(background - luminance(TREE_MATERIAL_FALLBACKS.bark)).toBeGreaterThan(
      0.25,
    );
    // Blossom light stays high-key pink (sakura mark).
    expect(luminance(TREE_MATERIAL_FALLBACKS.blossomLight)).toBeGreaterThan(0.7);
    // Blossoms read brighter / pinker than bark.
    expect(
      luminance(TREE_MATERIAL_FALLBACKS.blossomLight) -
        luminance(TREE_MATERIAL_FALLBACKS.bark),
    ).toBeGreaterThan(0.25);
    // Leaf is secondary — not the hero chroma.
    expect(luminance(TREE_MATERIAL_FALLBACKS.leaf)).toBeLessThan(
      luminance(TREE_MATERIAL_FALLBACKS.blossomLight),
    );
  });

  it("preserves camera scale and focus through the first nurture", () => {
    const seedDistance = gardenCameraDistance({
      stage: "seed",
      boundsRadius: 0.42,
      width: 1440,
      height: 720,
    });
    const sproutDistance = gardenCameraDistance({
      stage: "sprout",
      boundsRadius: 0.48,
      width: 1440,
      height: 720,
    });
    const seedFocus = gardenLookAtY({
      stage: "seed",
      totalGrowthUnits: 0,
      centerY: -2.72,
      boundsRadius: 0.42,
      width: 1440,
    });
    const sproutFocus = gardenLookAtY({
      stage: "sprout",
      totalGrowthUnits: 1,
      centerY: -2.55,
      boundsRadius: 0.48,
      width: 1440,
    });
    const fov = (GARDEN_VERTICAL_FOV_DEGREES * Math.PI) / 180;
    const seedViewportHeight = 0.58 / (2 * seedDistance * Math.tan(fov / 2));

    expect(seedDistance / sproutDistance).toBeLessThan(1.2);
    expect(Math.abs(seedFocus - sproutFocus)).toBeLessThan(0.02);
    expect(seedViewportHeight).toBeGreaterThan(0.08);
    expect(seedViewportHeight).toBeLessThan(0.11);
    expect(usesTreeRootContact("seed")).toBe(false);
    expect(usesTreeRootContact("sprout")).toBe(false);
    expect(usesTreeRootContact("sapling")).toBe(true);
  });

  it("frames the full sapling inside the protected vertical composition", () => {
    const distance = gardenCameraDistance({
      stage: "sapling",
      boundsRadius: 1.5,
      width: 1440,
      height: 720,
    });
    const halfHeight =
      distance *
      Math.tan((GARDEN_VERTICAL_FOV_DEGREES * Math.PI) / 360);
    const occupancy = (1.5 * 2) / (halfHeight * 2);
    expect(occupancy).toBeGreaterThan(0.47);
    expect(occupancy).toBeLessThan(0.52);
  });

  it.each([
    ["established", 96],
    ["mature", 192],
  ] as const)(
    "fits the complete %s crown inside a 390px mobile viewport at %i units",
    (stage, units) => {
      const width = 390;
      const height = 844;
      const radius = stage === "established" ? 4.2 : 5;
      const distance = gardenCameraDistance({
        stage,
        boundsRadius: radius,
        width,
        height,
      });
      const verticalHalf =
        distance *
        Math.tan((GARDEN_VERTICAL_FOV_DEGREES * Math.PI) / 360);
      const visibleWorldWidth = verticalHalf * (width / height) * 2;
      const crownPixelWidth = ((radius * 2) / visibleWorldWidth) * width;
      const margin = (width - crownPixelWidth) / 2;
      expect(margin).toBeGreaterThanOrEqual(16);
      expect(margin).toBeLessThanOrEqual(24);
      expect(units).toBe(stage === "established" ? 96 : 192);
      expect(gardenOrganPresentationScale(stage, width)).toBe(1.55);
    },
  );

  it("leaves established and mature desktop framing unchanged", () => {
    const radius = 5;
    const distance = gardenCameraDistance({
      stage: "mature",
      boundsRadius: radius,
      width: 1440,
      height: 720,
    });
    const expected =
      (radius /
        Math.tan((GARDEN_VERTICAL_FOV_DEGREES * Math.PI) / 360)) *
      1.18;
    expect(distance).toBeCloseTo(expected, 8);
    expect(gardenOrganPresentationScale("mature", 1440)).toBe(1);
  });

  it("omits only bare hairline construction tips while retaining adorned growth", () => {
    const tip = (id: string, parentId: string | null): CubicBranch => ({
      ...trunk,
      id,
      parentId,
      order: parentId ? 4 : 0,
      start: parentId ? [0, -1.4, 0] : trunk.start,
      end: parentId ? [0.08, -1.18, 0] : trunk.end,
      radiusStart: parentId ? 0.02 : trunk.radiusStart,
    });
    const branches = [tip("root", null), tip("bare", "root"), tip("leafy", "root")];
    const topology = {
      branches,
      foliage: [
        {
          id: "leaf",
          parentBranchId: "leafy",
          position: [0.08, -1.18, 0],
          rotation: [0, 0, 0],
          scale: 1,
          kind: "leaf",
          entryId: null,
          memoryRenderId: 0,
          sequence: 1,
          birthSequence: 1,
          axisProgress: 0.2,
          windWeight: 0.2,
        },
      ],
    } as unknown as TreeTopology;
    const visible = visibleBranchIndexes(topology);
    expect(visible.has(0)).toBe(true);
    expect(visible.has(1)).toBe(false);
    expect(visible.has(2)).toBe(true);
    expect(terminalBranchIndexes(topology)).toEqual([2]);
  });

  it("gives the leaf a pointed silhouette and subtle longitudinal curl", () => {
    const geometry = buildPointedLeafGeometry();
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    expect(box).not.toBeNull();
    expect(box!.max.y - box!.min.y).toBeGreaterThan(
      box!.max.x - box!.min.x,
    );
    expect(box!.max.z - box!.min.z).toBeGreaterThan(0);
  });

  it("shapes the cherry stone as an asymmetric almond rather than a sphere", () => {
    const geometry = buildCherryStoneGeometry();
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const width = box.max.x - box.min.x;
    const height = box.max.y - box.min.y;
    const depth = box.max.z - box.min.z;
    expect(height).toBeGreaterThan(width);
    expect(width).toBeGreaterThan(depth);
  });

  it("builds a single five-petal blossom buffer with a visible notch", () => {
    const geometry = buildSakuraBlossomGeometry();
    expect(geometry.getAttribute("position").count).toBeGreaterThan(50);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.max.x).toBeGreaterThan(0.5);
    expect(geometry.boundingBox!.min.x).toBeLessThan(-0.5);
  });

  it("places restrained horizontal bark marks only on substantial wood", () => {
    const lenticels = collectBarkLenticels([trunk], 12);
    expect(lenticels.length).toBeGreaterThan(0);
    expect(lenticels.length).toBeLessThanOrEqual(12);
    expect(lenticels.every((mark) => mark.scale[0] > mark.scale[1])).toBe(true);
  });
});
