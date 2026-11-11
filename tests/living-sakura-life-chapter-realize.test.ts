import { describe, expect, it } from "vitest";
import { createLivingSakuraModel } from "../features/garden/living-sakura/livingSakuraModel";
import { realizeSakuraAtJournalCount } from "../features/garden/living-sakura/realizeLifeStage";

describe("realized life-stage silhouettes", () => {
  it("maps journal gates onto distinct chapter habits", () => {
    expect(realizeSakuraAtJournalCount("chapter-seed", 12).stage).toBe("sapling");
    expect(realizeSakuraAtJournalCount("chapter-seed", 48).stage).toBe("young");
    expect(realizeSakuraAtJournalCount("chapter-seed", 96).stage).toBe(
      "established",
    );
    expect(realizeSakuraAtJournalCount("chapter-seed", 192).stage).toBe("mature");
    expect(realizeSakuraAtJournalCount("chapter-seed", 400).stage).toBe(
      "enduring",
    );
  });

  it("grows a sapling whip without a mature low-sweeping bough", () => {
    const sapling = realizeSakuraAtJournalCount("chapter-seed", 20);
    expect(sapling.segments.length).toBeGreaterThan(3);
    expect(sapling.segments.some((segment) => segment.role === "trunk")).toBe(
      true,
    );
    expect(
      sapling.segments.some((segment) => segment.signature === "low-sweeping-bough"),
    ).toBe(false);
    const height = Math.max(...sapling.segments.map((segment) => segment.end[1]));
    expect(height).toBeGreaterThan(1.2);
    expect(height).toBeLessThan(4.2);
  });

  it("opens a young vase after 48 journals and a broader crown by 192", () => {
    const young = realizeSakuraAtJournalCount("chapter-seed", 60);
    const mature = realizeSakuraAtJournalCount("chapter-seed", 192);
    expect(young.segments.some((segment) => segment.role === "leader")).toBe(
      true,
    );
    expect(mature.segments.length).toBeGreaterThan(young.segments.length);
    const youngHeight = Math.max(...young.segments.map((s) => s.end[1]));
    const matureHeight = Math.max(...mature.segments.map((s) => s.end[1]));
    expect(matureHeight).toBeGreaterThan(youngHeight);
  });

  it("renders chapter-distinct living models", () => {
    const sprout = createLivingSakuraModel({
      rootSeed: "chapter-seed",
      journalCount: 6,
      newestGrowthUnits: 2,
    });
    const sapling = createLivingSakuraModel({
      rootSeed: "chapter-seed",
      journalCount: 20,
      newestGrowthUnits: 2,
    });
    const mature = createLivingSakuraModel({
      rootSeed: "chapter-seed",
      journalCount: 192,
      newestGrowthUnits: 4,
    });
    expect(sapling.visibleBranchCount).toBeGreaterThan(sprout.visibleBranchCount);
    expect(mature.visibleBranchCount).toBeGreaterThan(sapling.visibleBranchCount);
    expect(sprout.root.getObjectByName("Wood youth/stem")).toBeTruthy();
    expect(sapling.root.getObjectByName("Wood youth/stem")).toBeTruthy();
    expect(mature.root.getObjectByName("Wood youth/stem")).toBeTruthy();
    sprout.dispose();
    sapling.dispose();
    mature.dispose();
  });
});
