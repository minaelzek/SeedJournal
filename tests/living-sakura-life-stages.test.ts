import { describe, expect, it } from "vitest";
import { botanicalMemoryAnchorKey } from "../features/growth/livingDevelopment";
import {
  LIVING_SAKURA_LIFE_STAGE_CONTRACTS,
  livingSakuraLifeStageForOrdinal,
  livingSakuraMemoryIdentity,
  planLivingSakuraLifeStage,
  type LifeStageSegmentRole,
  type LivingSakuraLifeStage,
} from "../features/garden/living-sakura/lifeStageTopology";

const ROOT_SEED = "quiet-rain-living-sakura";

function plan(ordinal: number, entryId?: string) {
  return planLivingSakuraLifeStage({
    rootSeed: ROOT_SEED,
    journalOrdinal: ordinal,
    entryId,
  });
}

function rolesAt(ordinal: number): readonly LifeStageSegmentRole[] {
  return plan(ordinal).segments.map((segment) => segment.role);
}

describe("Living Sakura life-stage topology planner", () => {
  it.each([
    [0, "seed"],
    [1, "sprout"],
    [11, "sprout"],
    [12, "sapling"],
    [47, "sapling"],
    [48, "young"],
    [95, "young"],
    [96, "established"],
    [191, "established"],
    [192, "mature"],
    [193, "enduring"],
    [10_000, "enduring"],
  ] as const)("maps journal %i to the %s contract", (ordinal, stage) => {
    expect(livingSakuraLifeStageForOrdinal(ordinal)).toBe(stage);
    expect(plan(ordinal).stage).toBe(stage);
  });

  it("defines seven genuinely distinct structural contracts", () => {
    const stages = Object.keys(
      LIVING_SAKURA_LIFE_STAGE_CONTRACTS,
    ) as LivingSakuraLifeStage[];
    const contracts = stages.map(
      (stage) => LIVING_SAKURA_LIFE_STAGE_CONTRACTS[stage],
    );

    expect(stages).toEqual([
      "seed",
      "sprout",
      "sapling",
      "young",
      "established",
      "mature",
      "enduring",
    ]);
    expect(new Set(contracts.map((contract) => contract.blueprintId))).toHaveLength(7);
    expect(new Set(contracts.map((contract) => contract.trunk.form))).toHaveLength(7);
    expect(new Set(contracts.map((contract) => contract.crown.habit))).toHaveLength(7);

    expect(rolesAt(0)).toContain("seed");
    expect(rolesAt(1)).toContain("stem");
    expect(rolesAt(12)).toContain("trunk");
    expect(rolesAt(48)).toContain("leader");
    expect(rolesAt(96)).toContain("tertiary");
    expect(rolesAt(193)).toContain("renewal-shoot");

    const matureRoles = rolesAt(192);
    for (const ordinal of [0, 1, 12, 48, 96]) {
      const stageRoles = rolesAt(ordinal);
      expect(stageRoles).not.toEqual(matureRoles.slice(0, stageRoles.length));
    }
  });

  it("keeps every planned count inside its stage contract", () => {
    for (const ordinal of [0, 1, 11, 12, 47, 48, 95, 96, 191, 192, 193, 1_000]) {
      const result = plan(ordinal);
      for (const role of result.contract.roles) {
        const count = result.targetCounts[role.role] ?? 0;
        expect(count, `${result.stage}:${role.role}`).toBeGreaterThanOrEqual(
          role.minimum,
        );
        if (role.maximum !== null) {
          expect(count, `${result.stage}:${role.role}`).toBeLessThanOrEqual(
            role.maximum,
          );
        }
        expect(result.segments.filter((segment) => segment.role === role.role)).toHaveLength(
          count,
        );
      }
    }
  });

  it.each([
    [1, 11],
    [12, 47],
    [48, 95],
    [96, 191],
    [193, 1_000],
  ] as const)(
    "appends without mutating earlier intents from journal %i to %i",
    (earlierOrdinal, laterOrdinal) => {
      const earlier = plan(earlierOrdinal);
      const later = plan(laterOrdinal);

      expect(later.stage).toBe(earlier.stage);
      expect(later.segments.length).toBeGreaterThanOrEqual(earlier.segments.length);
      expect(later.segments.slice(0, earlier.segments.length)).toEqual(
        earlier.segments,
      );
      expect(later.phenotype).toEqual(earlier.phenotype);
    },
  );

  it("continues adding enduring topology without a stage cap", () => {
    const first = plan(193);
    const thousand = plan(1_000);
    const tenThousand = plan(10_000);

    expect(thousand.segments.length).toBeGreaterThan(first.segments.length);
    expect(tenThousand.segments.length).toBeGreaterThan(thousand.segments.length);
    expect(tenThousand.targetCounts.tertiary).toBeGreaterThan(
      thousand.targetCounts.tertiary ?? 0,
    );
    expect(tenThousand.targetCounts["renewal-shoot"]).toBeGreaterThan(
      thousand.targetCounts["renewal-shoot"] ?? 0,
    );
  });

  it("is deterministic while rootSeed controls the stable phenotype", () => {
    expect(plan(1_000)).toEqual(plan(1_000));

    const other = planLivingSakuraLifeStage({
      rootSeed: "late-spring-living-sakura",
      journalOrdinal: 1_000,
    });
    expect(other.stage).toBe("enduring");
    expect(other.phenotype).not.toEqual(plan(1_000).phenotype);
    expect(other.segments).not.toEqual(plan(1_000).segments);
  });

  it("preserves the existing permanent memory anchor across every life stage", () => {
    const entryId = "journal-entry-permanent-17";
    const expected = botanicalMemoryAnchorKey(ROOT_SEED, entryId);
    const direct = livingSakuraMemoryIdentity(ROOT_SEED, entryId);

    expect(direct).toEqual({ entryId, anchorKey: expected });
    for (const ordinal of [1, 12, 48, 96, 192, 193, 10_000]) {
      expect(plan(ordinal, entryId).currentMemoryIdentity).toEqual(direct);
    }
  });

  it("rejects invalid identity and ordinal inputs", () => {
    expect(() =>
      planLivingSakuraLifeStage({ rootSeed: " ", journalOrdinal: 1 }),
    ).toThrow("rootSeed must not be empty");
    expect(() => plan(-1)).toThrow(
      "journalOrdinal must be a non-negative safe integer",
    );
    expect(() => livingSakuraMemoryIdentity(ROOT_SEED, " ")).toThrow(
      "entryId must not be empty",
    );
  });
});
