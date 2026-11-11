import { describe, expect, it } from "vitest";
import {
  buildYouthChapterSegments,
  isYouthChapter,
  youthShootCount,
} from "../features/garden/living-sakura/youthChapter";
import { createLivingSakuraModel } from "../features/garden/living-sakura/livingSakuraModel";
import { productTreeFraming } from "../features/garden/living-sakura/livingSakuraFraming";

describe("youth sprout chapter", () => {
  it("treats journals 1–11 as the sprout chapter", () => {
    expect(isYouthChapter(0)).toBe(false);
    expect(isYouthChapter(1)).toBe(true);
    expect(isYouthChapter(11)).toBe(true);
    expect(isYouthChapter(12)).toBe(false);
  });

  it("grows shoots across the sprout chapter without becoming a vase", () => {
    expect(youthShootCount(1)).toBe(1);
    expect(youthShootCount(11)).toBe(4);
    const first = buildYouthChapterSegments("quiet-rain", 1);
    const late = buildYouthChapterSegments("quiet-rain", 11);
    expect(first).toHaveLength(2);
    expect(late.length).toBeGreaterThan(first.length);
    expect(late.length).toBeLessThanOrEqual(5);
    expect(first[0].id).toBe("youth/stem");
    expect(late[0].end[1]).toBeGreaterThan(first[0].end[1]);
  });

  it("frames a sprout close to the nest, not at adult mid-crown", () => {
    const sprout = productTreeFraming(1);
    const sapling = productTreeFraming(12);
    expect(sprout.focusY).toBeLessThan(1.2);
    expect(sprout.distance).toBeLessThan(8);
    expect(sprout.distance).toBeLessThan(sapling.distance);
    expect(sprout.focusY).toBeLessThan(sapling.focusY);
  });

  it("keeps the first journal as one shoot umbel, never flowers down the stem", () => {
    const model = createLivingSakuraModel({
      rootSeed: "first-honest",
      journalCount: 1,
      newestGrowthUnits: 1,
    });
    const stem = model.pivots.find((pivot) => pivot.segmentId === "youth/stem");
    expect(stem).toBeDefined();
    const ambientOn = (group: { children: readonly { name: string; count?: number }[] }) =>
      group.children.reduce((total, child) => {
        if (child.name === "Ambient sakura flowers" && "count" in child) {
          return total + Number(child.count);
        }
        return total;
      }, 0);
    expect(ambientOn(stem!.group)).toBe(0);
    const shoot = model.pivots.find((pivot) =>
      pivot.segmentId.startsWith("youth/shoot"),
    );
    expect(shoot).toBeDefined();
    expect(ambientOn(shoot!.group)).toBe(0);
    expect(model.memoryBlossomCount).toBe(1);
    expect(model.newestMemory).not.toBeNull();
    model.dispose();
  });

  it("dresses eight journals as a living seedling, not a bare twig", () => {
    const model = createLivingSakuraModel({
      rootSeed: "eight-reflections",
      journalCount: 8,
      newestGrowthUnits: 2,
    });
    let leaves = 0;
    let ambient = 0;
    model.root.traverse((child) => {
      if (child.name.startsWith("Sprout leaf")) leaves += 1;
      if (child.name === "Ambient sakura flowers" && "count" in child) {
        ambient += Number(child.count);
      }
    });
    expect(model.visibleBranchCount).toBeGreaterThanOrEqual(4);
    expect(model.memoryBlossomCount).toBe(8);
    expect(leaves).toBeGreaterThan(8);
    expect(ambient).toBeGreaterThan(20);
    expect(model.newestMemory).not.toBeNull();
    expect(model.newestMemory!.children[0].scale.x).toBeGreaterThanOrEqual(0.22);
    model.dispose();
  });

  it("makes a 6-unit journal grow a visible shoot that a 1-unit journal does not", () => {
    const quiet = createLivingSakuraModel({
      rootSeed: "youth-depth",
      journalCount: 2,
      newestGrowthUnits: 1,
    });
    const deep = createLivingSakuraModel({
      rootSeed: "youth-depth",
      journalCount: 2,
      newestGrowthUnits: 6,
    });
    expect(quiet.ceremonyOrganIds.includes("generosity-shoot")).toBe(false);
    expect(deep.ceremonyOrganIds.includes("generosity-shoot")).toBe(true);
    expect(deep.ceremonyOrgans.length).toBeGreaterThan(quiet.ceremonyOrgans.length);
    expect(quiet.newestMemory?.children[0].scale).toEqual(
      deep.newestMemory?.children[0].scale,
    );
    quiet.dispose();
    deep.dispose();
  });
});
