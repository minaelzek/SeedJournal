import { describe, expect, it } from "vitest";
import {
  buildLifeChapterSegments,
  isLifeChapter,
} from "../features/garden/living-sakura/lifeChapter";
import { createLivingSakuraModel } from "../features/garden/living-sakura/livingSakuraModel";

describe("authored life-chapter silhouettes", () => {
  it("classifies 12–191 as the mid-life habit window", () => {
    expect(isLifeChapter(11)).toBe(false);
    expect(isLifeChapter(12)).toBe(true);
    expect(isLifeChapter(191)).toBe(true);
    expect(isLifeChapter(192)).toBe(false);
  });

  it("grows a sapling on the lifelong stem without a signature low bough", () => {
    const sapling = buildLifeChapterSegments("chapter-seed", 24);
    expect(sapling.some((segment) => segment.id === "youth/stem")).toBe(true);
    expect(sapling.some((segment) => segment.role === "leader")).toBe(false);
    expect(
      sapling.some((segment) => segment.signature === "low-sweeping-bough"),
    ).toBe(false);
    const height = Math.max(...sapling.map((segment) => segment.end[1]));
    expect(height).toBeGreaterThan(1.4);
    expect(height).toBeLessThan(3.2);
  });

  it("opens an unequal young vase at 48 journals", () => {
    const young = buildLifeChapterSegments("chapter-seed", 60);
    expect(young.some((segment) => segment.id === "young/leader/dominant")).toBe(
      true,
    );
    expect(
      young.some((segment) => segment.id === "young/leader/subordinate"),
    ).toBe(true);
    expect(
      young.some((segment) => segment.signature === "low-sweeping-bough"),
    ).toBe(false);
  });

  it("adds the signature sweep only once the tree is established", () => {
    const established = buildLifeChapterSegments("chapter-seed", 120);
    expect(
      established.some((segment) => segment.signature === "low-sweeping-bough"),
    ).toBe(true);
    expect(established.length).toBeGreaterThan(
      buildLifeChapterSegments("chapter-seed", 60).length,
    );
  });

  it("keeps every journal petal on wood and separated at sapling density", () => {
    const model = createLivingSakuraModel({
      rootSeed: "chapter-hit-spacing",
      journalCount: 24,
      newestGrowthUnits: 2,
    });
    expect(model.memoryInstances).toHaveLength(24);
    const ids = new Set(model.memoryInstances.map((memory) => memory.segmentId));
    expect(ids.size).toBeGreaterThan(1);
    expect(model.root.scale.x).toBe(1);
    model.dispose();
  });
});
