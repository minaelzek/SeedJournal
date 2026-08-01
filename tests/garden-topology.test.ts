import { describe, expect, it } from "vitest";
import type { TreeGrowthEvent, TreeSnapshot } from "../lib/contracts";
import { TreeWorkerSession } from "../features/garden/engine/session";
import {
  buildTreeTopology,
  sampleCubic,
  seededRandom,
  topologyFingerprint,
  TreeEngineV2,
  treeStageForUnits,
} from "../features/garden/topology";

function event(
  sequence: number,
  kind: TreeGrowthEvent["kind"] = "memory_leaf",
  growthUnits: TreeGrowthEvent["growthUnits"] = 1,
  entryId: string | null = kind.startsWith("memory_")
    ? `entry-${sequence}`
    : null,
): TreeGrowthEvent {
  return {
    id: `event-${sequence}`,
    sequence,
    entryId,
    occurredAt: 1760000000000 + sequence,
    localDate: "2026-07-29",
    kind,
    growthUnits,
    seed: sequence * 101,
  };
}

function snapshot(
  events: TreeGrowthEvent[] = [],
  extras: Partial<TreeSnapshot> & {
    memoryLineage?: Record<string, string>;
  } = {},
): TreeSnapshot {
  return {
    treeId: "tree-1",
    rootSeed: "quiet-sakura",
    algorithmVersion: 2,
    totalEntries: events.filter((item) => item.kind.startsWith("memory_"))
      .length,
    distinctJournalDays: events.length ? 1 : 0,
    events,
    ...extras,
  };
}

function unitHistory(units: number): TreeGrowthEvent[] {
  return Array.from({ length: units }, (_, index) =>
    event(index + 1, "memory_leaf", 1),
  );
}

function logicalGeometry(topology: ReturnType<typeof buildTreeTopology>) {
  return {
    branches: topology.branches,
    foliage: topology.foliage,
    revision: topology.revision,
    bounds: topology.bounds,
    fallbackProjection: topology.fallbackProjection,
    branchBuffers: {
      positions: Array.from(topology.branchBuffers.positions),
      normals: Array.from(topology.branchBuffers.normals),
      indices: Array.from(topology.branchBuffers.indices),
      parentIndices: Array.from(topology.branchBuffers.parentIndices),
      birthSequence: Array.from(topology.branchBuffers.birthSequence),
    },
    organBuffers: {
      positions: Array.from(topology.organBuffers.positions),
      kinds: Array.from(topology.organBuffers.kinds),
      memoryRenderIds: Array.from(topology.organBuffers.memoryRenderIds),
    },
  };
}

describe("Seed-to-Sakura V2 topology", () => {
  it("renders zero growth as a seed and nothing else", () => {
    const topology = buildTreeTopology(snapshot());

    expect(topology.algorithmVersion).toBe(2);
    expect(topology.stage).toBe("seed");
    expect(topology.totalGrowthUnits).toBe(0);
    expect(topology.branches).toEqual([]);
    expect(topology.foliage).toHaveLength(1);
    expect(topology.foliage[0]).toMatchObject({
      id: "v2-seed",
      kind: "seed",
      entryId: null,
      memoryRenderId: 0,
    });
    expect(topology.branchBuffers.positions).toHaveLength(0);
    expect(Array.from(topology.organBuffers.kinds)).toEqual([0]);
    expect(topology.fallbackProjection.branches).toEqual([]);
    expect(topology.fallbackProjection.organs).toEqual([]);
  });

  it.each([
    [0, "seed"],
    [1, "sprout"],
    [3, "sprout"],
    [4, "sprout"],
    [11, "sprout"],
    [12, "sapling"],
    [47, "sapling"],
    [48, "young-tree"],
    [95, "young-tree"],
    [96, "established"],
    [191, "established"],
    [192, "mature"],
  ] as const)("maps %i cumulative units to %s", (units, stage) => {
    expect(treeStageForUnits(units)).toBe(stage);
    expect(buildTreeTopology(snapshot(unitHistory(units))).stage).toBe(stage);
  });

  it("is exactly deterministic for a root seed and event history", () => {
    const input = snapshot([
      event(1, "leaf", 0, "entry-1"),
      event(2, "memory_luminous_blossom", 6, "entry-1"),
      event(3, "twig", 0),
      event(4, "memory_blossom", 4),
    ]);
    const first = buildTreeTopology(input, "high");
    const second = buildTreeTopology(input, "high");

    expect(logicalGeometry(first)).toEqual(logicalGeometry(second));
    expect(topologyFingerprint(first)).toBe(topologyFingerprint(second));
  });

  it("preserves every prior centerline and organ when events append", () => {
    const initialEvents = [
      event(1, "memory_leaf", 1),
      event(2, "memory_bud", 2),
      event(3, "twig", 0),
    ];
    const appendedEvents = [
      ...initialEvents,
      event(4, "memory_luminous_blossom", 6),
      event(5, "branch", 0),
    ];
    const initial = buildTreeTopology(snapshot(initialEvents));
    const appended = buildTreeTopology(snapshot(appendedEvents));

    const centerlines = (branches: typeof initial.branches) =>
      branches.map(
        ({
          id,
          parentId,
          order,
          start,
          controlA,
          controlB,
          end,
          birthSequence,
        }) => ({
          id,
          parentId,
          order,
          start,
          controlA,
          controlB,
          end,
          birthSequence,
        }),
      );
    expect(
      centerlines(appended.branches.slice(0, initial.branches.length)),
    ).toEqual(centerlines(initial.branches));
    appended.branches
      .slice(0, initial.branches.length)
      .forEach((branch, index) => {
        expect(branch.radiusStart).toBeGreaterThanOrEqual(
          initial.branches[index].radiusStart,
        );
        expect(branch.radiusEnd).toBeGreaterThanOrEqual(
          initial.branches[index].radiusEnd,
        );
      });
    expect(appended.foliage.slice(0, initial.foliage.length)).toEqual(
      initial.foliage,
    );
    expect(
      appended.memoryHitRegions
        .slice(0, initial.memoryHitRegions.length)
        .map((region) => region.renderId),
    ).toEqual(initial.memoryHitRegions.map((region) => region.renderId));
  });

  it("makes full replay and retained sequential append byte-identical", () => {
    const events = [
      event(1, "memory_leaf", 1),
      event(2, "memory_bud", 2),
      event(3, "twig", 0),
      event(4, "memory_blossom", 4),
      event(5, "memory_luminous_blossom", 6),
      event(6, "branch", 0),
    ];
    const engine = new TreeEngineV2(snapshot(events.slice(0, 2)));
    engine.append(events.slice(2, 4));
    const appended = engine.append(events.slice(4));
    const replayed = buildTreeTopology(snapshot(events));

    expect(logicalGeometry(appended)).toEqual(logicalGeometry(replayed));
  });

  it("keeps journal identifiers out of transferable GPU buffers", () => {
    const topology = buildTreeTopology(
      snapshot([event(1, "memory_luminous_blossom", 6, "private-entry-id")]),
    );
    const serializedBuffers = JSON.stringify({
      branch: Object.values(topology.branchBuffers).map((value) =>
        ArrayBuffer.isView(value) ? Array.from(value as Uint8Array) : value,
      ),
      organ: Object.values(topology.organBuffers).map((value) =>
        ArrayBuffer.isView(value) ? Array.from(value as Uint8Array) : value,
      ),
    });

    expect(serializedBuffers).not.toContain("private-entry-id");
    expect(topology.memoryHitRegions).toHaveLength(1);
    expect(topology.memoryHitRegions[0].entryId).toBe("private-entry-id");
    expect(topology.organBuffers.memoryRenderIds.some((id) => id > 0)).toBe(
      true,
    );
  });

  it("attaches every branch to a valid immutable parent endpoint", () => {
    const topology = buildTreeTopology(snapshot(unitHistory(192)));
    const byId = new Map(topology.branches.map((branch) => [branch.id, branch]));

    topology.branches.forEach((branch, index) => {
      if (index === 0) {
        expect(branch.parentId).toBeNull();
        return;
      }
      const parent = byId.get(branch.parentId ?? "");
      expect(parent, branch.id).toBeDefined();
      expect(branch.start).toEqual(parent?.end);
      expect(branch.order).toBeGreaterThanOrEqual(parent?.order ?? 0);
    });
    expect(topology.bounds.radius).toBeLessThan(7.5);
    expect(topology.stage).toBe("mature");
  });

  it("opens unmistakable lateral scaffolds by the first sapling reflections", () => {
    const topology = buildTreeTopology(snapshot(unitHistory(14)));
    const lateral = topology.branches.filter(
      (branch) =>
        branch.order > 0 &&
        Math.abs(branch.end[0] - branch.start[0]) >
          Math.abs(branch.end[1] - branch.start[1]) * 0.55,
    );
    const extent = Math.max(
      ...topology.branches.map((branch) => Math.abs(branch.end[0])),
    );

    expect(topology.stage).toBe("sapling");
    expect(lateral.length).toBeGreaterThanOrEqual(2);
    expect(extent).toBeGreaterThan(0.6);
  });

  it("forms a broad, balanced mature crown around a substantial trunk", () => {
    const topology = buildTreeTopology(snapshot(unitHistory(192)));
    const root = topology.branches.find((branch) => branch.parentId === null);
    const byId = new Map(topology.branches.map((branch) => [branch.id, branch]));
    const scaffoldRoots = topology.branches.filter((branch) => {
      const parent = branch.parentId ? byId.get(branch.parentId) : undefined;
      return branch.order === 1 && parent?.order === 0;
    });
    const crownEnds = topology.branches
      .map((branch) => branch.end)
      .filter((point) => point[1] > -0.35);
    const minX = Math.min(...crownEnds.map((point) => point[0]));
    const maxX = Math.max(...crownEnds.map((point) => point[0]));
    const minY = Math.min(...crownEnds.map((point) => point[1]));
    const maxY = Math.max(...crownEnds.map((point) => point[1]));
    const width = maxX - minX;
    const height = maxY - minY;
    const left = crownEnds.filter((point) => point[0] < -0.25).length;
    const right = crownEnds.filter((point) => point[0] > 0.25).length;
    const anonymousOrgans = topology.foliage.filter(
      (organ) =>
        organ.memoryRenderId === 0 &&
        organ.kind !== "seed" &&
        organ.kind !== "radicle",
    );
    const middleCrownOrgans = anonymousOrgans.filter(
      (organ) =>
        organ.position[1] > minY + height * 0.28 &&
        organ.position[1] < minY + height * 0.78,
    );
    const centralHalfWidth = width * 0.12;
    const flankInner = width * 0.18;
    const flankOuter = width * 0.38;
    const centralDensity =
      middleCrownOrgans.filter(
        (organ) => Math.abs(organ.position[0]) < centralHalfWidth,
      ).length /
      (centralHalfWidth * 2);
    const flankDensity =
      middleCrownOrgans.filter((organ) => {
        const x = Math.abs(organ.position[0]);
        return x > flankInner && x < flankOuter;
      }).length /
      ((flankOuter - flankInner) * 2);
    const centralVoid = 1 - centralDensity / Math.max(1, flankDensity);

    expect(root?.radiusStart).toBeGreaterThanOrEqual(0.3);
    expect(scaffoldRoots.length).toBeGreaterThanOrEqual(3);
    expect(scaffoldRoots.length).toBeLessThanOrEqual(5);
    expect(width).toBeGreaterThan(height);
    expect(width).toBeGreaterThan(5);
    expect(left / crownEnds.length).toBeGreaterThan(0.28);
    expect(right / crownEnds.length).toBeGreaterThan(0.28);
    expect(centralVoid).toBeGreaterThanOrEqual(0.35);
    expect(centralVoid).toBeLessThanOrEqual(0.45);
    expect(anonymousOrgans.length).toBeGreaterThanOrEqual(300);
    // Sakura-forward ambient organs densify the crown; stay well under GPU blowup.
    expect(anonymousOrgans.length).toBeLessThanOrEqual(780);
  });

  it("has a grounded trunk and attached, readable scaffolds by 48 units", () => {
    const at48 = buildTreeTopology(snapshot(unitHistory(48)));
    const at96 = buildTreeTopology(snapshot(unitHistory(96)));
    const at192 = buildTreeTopology(snapshot(unitHistory(192)));
    const byId48 = new Map(at48.branches.map((branch) => [branch.id, branch]));
    const byId96 = new Map(at96.branches.map((branch) => [branch.id, branch]));
    const byId192 = new Map(
      at192.branches.map((branch) => [branch.id, branch]),
    );
    const root48 = at48.branches.find((branch) => branch.parentId === null);
    const root96 = at96.branches.find((branch) => branch.parentId === null);
    const root192 = at192.branches.find((branch) => branch.parentId === null);
    const scaffold48 = at48.branches.filter((branch) => {
      const parent = branch.parentId
        ? byId48.get(branch.parentId)
        : undefined;
      return branch.order === 1 && parent?.order === 0;
    });

    expect(root48?.radiusStart).toBeGreaterThanOrEqual(0.18);
    expect(root96?.radiusStart).toBeGreaterThanOrEqual(0.25);
    expect(root192?.radiusStart).toBeGreaterThanOrEqual(0.34);
    expect(root48?.start[1]).toBeLessThanOrEqual(-2.6);
    expect(
      Math.abs((root48?.start[1] ?? 0) - at48.foliage[0].position[1]),
    ).toBeLessThanOrEqual(root48?.radiusStart ?? 0);
    expect(scaffold48).toHaveLength(4);
    scaffold48.forEach((scaffold) => {
      expect(scaffold.radiusStart).toBeGreaterThanOrEqual(0.068);
      expect(scaffold.radiusEnd).toBeGreaterThanOrEqual(0.032);
      const at96Branch = byId96.get(scaffold.id);
      const at192Branch = byId192.get(scaffold.id);
      expect(at96Branch?.radiusStart).toBeGreaterThanOrEqual(
        scaffold.radiusStart,
      );
      expect(at96Branch?.radiusEnd).toBeGreaterThanOrEqual(
        scaffold.radiusEnd,
      );
      expect(at192Branch?.radiusStart).toBeGreaterThanOrEqual(
        at96Branch?.radiusStart ?? 0,
      );
      expect(at192Branch?.radiusEnd).toBeGreaterThanOrEqual(
        at96Branch?.radiusEnd ?? 0,
      );
    });

    [at48, at96, at192].forEach((topology) => {
      const byId = new Map(
        topology.branches.map((branch) => [branch.id, branch]),
      );
      topology.branches.forEach((branch) => {
        if (!branch.parentId) return;
        const parent = byId.get(branch.parentId);
        expect(parent, branch.id).toBeDefined();
        expect(branch.start).toEqual(parent?.end);
        expect(branch.radiusStart).toBeGreaterThanOrEqual(
          (parent?.radiusEnd ?? 0) * 1.05,
        );
      });
    });
  });

  it("increases structural and botanical density monotonically by stage", () => {
    const stages = [12, 48, 96, 192].map((units) =>
      buildTreeTopology(snapshot(unitHistory(units))),
    );
    const branchCounts = stages.map((topology) => topology.branches.length);
    const organCounts = stages.map(
      (topology) =>
        topology.foliage.filter(
          (organ) =>
            organ.memoryRenderId === 0 &&
            organ.kind !== "seed" &&
            organ.kind !== "radicle",
        ).length,
    );

    for (let index = 1; index < stages.length; index += 1) {
      expect(branchCounts[index]).toBeGreaterThan(branchCounts[index - 1]);
      expect(organCounts[index]).toBeGreaterThan(organCounts[index - 1]);
    }
  });

  it("replays a mature history identically from a retained prefix", () => {
    const events = unitHistory(192);
    const engine = new TreeEngineV2(snapshot(events.slice(0, 96)), "low");
    const appended = engine.append(events.slice(96));
    const replayed = buildTreeTopology(snapshot(events), "low");

    expect(appended.revision.fingerprint).toBe(
      replayed.revision.fingerprint,
    );
    expect(appended.branches).toEqual(replayed.branches);
    expect(appended.foliage).toEqual(replayed.foliage);
    expect(Array.from(appended.branchBuffers.positions)).toEqual(
      Array.from(replayed.branchBuffers.positions),
    );
    expect(Array.from(appended.organBuffers.memoryRenderIds)).toEqual(
      Array.from(replayed.organBuffers.memoryRenderIds),
    );
  });

  it("places a revisit daughter near its originating memory", () => {
    const input = snapshot(
      [
        event(1, "memory_blossom", 4, "origin"),
        event(2, "memory_blossom", 4, "revisit"),
      ],
      { memoryLineage: { revisit: "origin" } },
    );
    const topology = buildTreeTopology(input);
    const origin = topology.foliage.find((node) => node.entryId === "origin");
    const revisit = topology.foliage.find((node) => node.entryId === "revisit");
    const separation = Math.hypot(
      (origin?.position[0] ?? 0) - (revisit?.position[0] ?? 0),
      (origin?.position[1] ?? 0) - (revisit?.position[1] ?? 0),
      (origin?.position[2] ?? 0) - (revisit?.position[2] ?? 0),
    );

    expect(origin).toBeDefined();
    expect(revisit).toBeDefined();
    expect(separation).toBeLessThan(1.2);
  });

  it("builds render-ready swept mesh metadata and synchronized fallback data", () => {
    const topology = buildTreeTopology(snapshot(unitHistory(12)), "balanced");
    const buffers = topology.branchBuffers;

    expect(buffers.positions.length).toBe(buffers.normals.length);
    expect(buffers.positions.length / 3).toBe(buffers.birthSequence.length);
    expect(buffers.positions.length / 3).toBe(buffers.axisProgress.length);
    expect(buffers.positions.length / 3).toBe(buffers.windWeight.length);
    expect(buffers.ranges.length).toBe(topology.branches.length * 4);
    expect(topology.fallbackProjection.branches).toHaveLength(
      topology.branches.length,
    );
    expect(topology.fallbackProjection.organs).toHaveLength(
      topology.foliage.length - 1,
    );
  });

  it("replays 1,000 events off-thread within the low-tier organ budget", () => {
    const start = performance.now();
    const topology = buildTreeTopology(snapshot(unitHistory(1_000)), "low");
    const elapsed = performance.now() - start;

    expect(topology.stage).toBe("mature");
    expect(topology.branches.length).toBeGreaterThan(2_500);
    expect(topology.organBuffers.kinds).toHaveLength(1_800);
    expect(
      Array.from(topology.organBuffers.memoryRenderIds).filter(
        (renderId) => renderId > 0,
      ),
    ).toHaveLength(1_000);
    expect(elapsed).toBeLessThan(2_500);
  });

  it("samples cubic endpoints exactly and repeats seeded randomness", () => {
    const branch = buildTreeTopology(snapshot(unitHistory(1))).branches[0];
    expect(sampleCubic(branch, 0)).toEqual(branch.start);
    expect(sampleCubic(branch, 1)).toEqual(branch.end);
    const first = seededRandom("sakura");
    const second = seededRandom("sakura");
    expect(Array.from({ length: 12 }, first)).toEqual(
      Array.from({ length: 12 }, second),
    );
  });
});

describe("retained tree worker protocol", () => {
  it("initializes, appends a contiguous suffix, and changes quality", () => {
    const session = new TreeWorkerSession();
    const initialized = session.handle({
      type: "init",
      requestId: 1,
      snapshot: snapshot([event(1)]),
      quality: "balanced",
    });
    expect(initialized.type).toBe("rebuilt");

    const patched = session.handle({
      type: "append",
      requestId: 2,
      treeId: "tree-1",
      fromSequence: 1,
      events: [event(2, "memory_bud", 2)],
    });
    expect(patched).toMatchObject({
      type: "patched",
      previousSequence: 1,
      nextSequence: 2,
    });

    const high = session.handle({
      type: "set-quality",
      requestId: 3,
      quality: "high",
    });
    expect(high.type).toBe("rebuilt");
    if (patched.type === "patched" && high.type === "rebuilt") {
      expect(high.topology.revision.fingerprint).toBe(
        patched.topology.revision.fingerprint,
      );
      expect(high.topology.branchBuffers.positions.length).toBeGreaterThan(
        patched.topology.branchBuffers.positions.length,
      );
    }
  });

  it("requests a resync for a gap, stale cursor, or different tree", () => {
    const session = new TreeWorkerSession();
    session.handle({
      type: "init",
      requestId: 1,
      snapshot: snapshot([event(1)]),
      quality: "low",
    });

    expect(
      session.handle({
        type: "append",
        requestId: 2,
        treeId: "tree-1",
        fromSequence: 1,
        events: [event(3)],
      }),
    ).toMatchObject({
      type: "resync-required",
      expectedSequence: 2,
      receivedSequence: 3,
    });
    expect(
      session.handle({
        type: "append",
        requestId: 3,
        treeId: "another-tree",
        fromSequence: 1,
        events: [event(2)],
      }),
    ).toMatchObject({ type: "resync-required" });
  });

  it("keeps the frozen V1 builder available for compatibility fixtures", () => {
    const legacy = buildTreeTopology(
      snapshot([event(1)], { algorithmVersion: 1 }),
    );
    expect(legacy.algorithmVersion).toBe(1);
    expect(legacy.branches).toHaveLength(6);
    expect(legacy.stage).toBe("mature");
  });
});
