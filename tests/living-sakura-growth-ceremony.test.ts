import { describe, expect, it } from "vitest";

import {
  GROWTH_CEREMONY_DURATION_SECONDS,
  GROWTH_CEREMONY_WINDOWS,
  GROWTH_REVEAL_REDUCED_MOTION_SECONDS,
  createGrowthCeremonySchedule,
  sampleGrowthCeremony,
} from "../features/garden/living-sakura/growthCeremony";

function schedule() {
  return createGrowthCeremonySchedule({
    eventId: "journal-204",
    parentPathSegmentIds: ["trunk", "leader-02", "tertiary-17"],
    organIds: ["memory-blossom", "leaf-02", "bud-01", "leaf-01"],
  });
}

describe("Living Sakura 4.2 second growth ceremony", () => {
  it("builds the same deterministic schedule independent of organ input order", () => {
    const first = schedule();
    const second = createGrowthCeremonySchedule({
      eventId: "journal-204",
      parentPathSegmentIds: ["trunk", "leader-02", "tertiary-17"],
      organIds: ["leaf-01", "bud-01", "memory-blossom", "leaf-02"],
    });

    expect(second).toEqual(first);
    expect(first.durationSeconds).toBe(GROWTH_CEREMONY_DURATION_SECONDS);
    expect(first.path[0].startSeconds).toBe(0);
    expect(first.path.at(-1)?.endSeconds).toBeCloseTo(0.85);
    expect(Math.max(...first.organs.map((organ) => organ.endSeconds))).toBeLessThanOrEqual(3.35);
  });

  it("runs parent path, wood, staggered organs, and local settle in one clock", () => {
    const growth = schedule();

    const path = sampleGrowthCeremony(growth, 0.3);
    expect(path.phase).toBe("parent-path");
    expect(path.parentPath.some((step) => step.progress > 0)).toBe(true);
    expect(path.woodProgress).toBe(0);

    const wood = sampleGrowthCeremony(growth, 1.9);
    expect(wood.phase).toBe("organ-stagger");
    expect(wood.woodProgress).toBe(1);
    expect(wood.organs.some((organ) => organ.progress > 0)).toBe(true);

    const organs = sampleGrowthCeremony(growth, 3.35);
    expect(organs.phase).toBe("local-settle");
    expect(organs.organs.every((organ) => organ.progress === 1)).toBe(true);
    expect(organs.settleProgress).toBe(0);

    const complete = sampleGrowthCeremony(growth, 4.2);
    expect(complete.phase).toBe("complete");
    expect(complete.complete).toBe(true);
    expect(complete.overallProgress).toBe(1);
    expect(complete.settleProgress).toBe(1);
    expect(complete.organs.every((organ) => organ.localSettleOffset === 0)).toBe(true);
  });

  it("honors the explicit ceremony timing contract", () => {
    expect(GROWTH_CEREMONY_WINDOWS).toEqual({
      parentPathPulse: { start: 0, end: 0.85 },
      woodExtension: { start: 0.45, end: 1.9 },
      organStagger: { start: 1.45, end: 3.35 },
      localSettle: { start: 3.35, end: 4.2 },
    });

    const before = sampleGrowthCeremony(schedule(), -10);
    const after = sampleGrowthCeremony(schedule(), 100);
    expect(before.elapsedSeconds).toBe(0);
    expect(after.elapsedSeconds).toBe(4.2);
  });

  it("preserves reduced-motion sequence and state without oscillation", () => {
    const growth = schedule();
    for (const elapsed of [0, 0.3, 0.6, 1.7, 2.4, 3.2, 3.7, 4.2]) {
      const standard = sampleGrowthCeremony(growth, elapsed);
      const reduced = sampleGrowthCeremony(growth, elapsed, {
        reducedMotion: true,
      });

      expect(reduced.phase).toBe(standard.phase);
      expect(reduced.overallProgress).toBe(standard.overallProgress);
      expect(reduced.woodProgress).toBe(standard.woodProgress);
      expect(reduced.settleProgress).toBe(standard.settleProgress);
      expect(reduced.parentPath).toEqual(standard.parentPath);
      expect(reduced.organs.map((organ) => organ.progress)).toEqual(
        standard.organs.map((organ) => organ.progress),
      );
      expect(reduced.organs.every((organ) => organ.localSettleOffset === 0)).toBe(true);
    }

    expect(
      sampleGrowthCeremony(growth, 2.4).organs.some(
        (organ) => Math.abs(organ.localSettleOffset) > 0,
      ),
    ).toBe(true);
  });

  it("keeps reduced-motion dissolve short and equal-duration full ceremony", () => {
    expect(GROWTH_CEREMONY_DURATION_SECONDS).toBe(4.2);
    expect(GROWTH_REVEAL_REDUCED_MOTION_SECONDS).toBeLessThan(1);
    expect(GROWTH_REVEAL_REDUCED_MOTION_SECONDS).toBeGreaterThan(0);

    const growth = schedule();
    const fullAtDissolve = sampleGrowthCeremony(
      growth,
      GROWTH_CEREMONY_DURATION_SECONDS,
      { reducedMotion: true },
    );
    expect(fullAtDissolve.complete).toBe(true);
    expect(fullAtDissolve.overallProgress).toBe(1);
  });
});
