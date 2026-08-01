import { describe, expect, it } from "vitest";
import {
  SAKURA_AMBIENT_MIX,
  ambientOrganKind,
  sakuraFloralShare,
  sakuraOrganScale,
  sakuraPetalBudget,
} from "../features/garden/art/sakuraOrganPolicy";
import type { TreeStage } from "../lib/contracts";

describe("sakura organ policy (species identity)", () => {
  it("makes young-tree ambient organs blossom-forward, not leaf-default", () => {
    const samples = Array.from({ length: 200 }, (_, index) =>
      ambientOrganKind("young-tree", (index + 0.5) / 200),
    );
    const blossoms = samples.filter((kind) => kind === "blossom").length;
    const leaves = samples.filter((kind) => kind === "leaf").length;
    const buds = samples.filter((kind) => kind === "bud").length;

    expect(blossoms / samples.length).toBeGreaterThan(0.48);
    expect(blossoms / samples.length).toBeLessThan(0.62);
    expect(buds / samples.length).toBeGreaterThan(0.18);
    expect(leaves / samples.length).toBeLessThan(0.28);
    expect(sakuraFloralShare(samples)).toBeGreaterThan(0.7);
  });

  it("introduces buds and blossoms at sapling, not only green leaves", () => {
    const samples = Array.from({ length: 100 }, (_, index) =>
      ambientOrganKind("sapling", index / 100),
    );
    expect(samples.some((kind) => kind === "blossom")).toBe(true);
    expect(samples.some((kind) => kind === "bud")).toBe(true);
    expect(sakuraFloralShare(samples)).toBeGreaterThan(0.55);
  });

  it("keeps mature ambient majority floral", () => {
    const samples = Array.from({ length: 100 }, (_, index) =>
      ambientOrganKind("mature", index / 100),
    );
    expect(sakuraFloralShare(samples)).toBeGreaterThan(0.8);
    expect(SAKURA_AMBIENT_MIX.mature.blossom).toBeGreaterThan(0.6);
  });

  it("is deterministic for the same stage and unit random", () => {
    for (const stage of [
      "sprout",
      "sapling",
      "young-tree",
      "established",
      "mature",
    ] as TreeStage[]) {
      expect(ambientOrganKind(stage, 0.1)).toBe(ambientOrganKind(stage, 0.1));
      expect(ambientOrganKind(stage, 0.9)).toBe(ambientOrganKind(stage, 0.9));
    }
  });

  it("scales blossoms larger than leaves so flowers own the silhouette", () => {
    expect(sakuraOrganScale("blossom", "young-tree")).toBeGreaterThan(
      sakuraOrganScale("leaf", "young-tree") * 1.5,
    );
    expect(sakuraOrganScale("bud", "sapling")).toBeGreaterThan(
      sakuraOrganScale("leaf", "sapling"),
    );
  });

  it("caps petal rain by quality without zeroing atmosphere", () => {
    expect(sakuraPetalBudget("high", 40)).toBe(40);
    expect(sakuraPetalBudget("high", 80)).toBe(48);
    expect(sakuraPetalBudget("balanced", 40)).toBe(28);
    expect(sakuraPetalBudget("low", 40)).toBe(12);
    expect(sakuraPetalBudget("low", 1)).toBe(2);
  });
});
