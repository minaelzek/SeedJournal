import { describe, expect, it } from "vitest";
import type { TreeGrowthEvent, TreeSnapshot } from "../lib/contracts";
import {
  buildTreeTopology,
  sampleCubic,
  seededRandom,
  topologyFingerprint,
} from "../features/garden/topology";

function event(
  sequence: number,
  kind: TreeGrowthEvent["kind"],
  seed = sequence * 101,
): TreeGrowthEvent {
  return {
    id: `event-${sequence}`,
    sequence,
    entryId: kind.startsWith("memory_") ? `entry-${sequence}` : null,
    occurredAt: 1760000000000 + sequence,
    localDate: "2026-07-29",
    kind,
    growthUnits: kind === "memory_luminous_blossom" ? 6 : kind === "branch" ? 0 : 1,
    seed,
  };
}

function snapshot(events: TreeGrowthEvent[] = []): TreeSnapshot {
  return {
    treeId: "tree-1",
    rootSeed: "quiet-sakura",
    algorithmVersion: 1,
    totalEntries: events.filter((item) => item.entryId).length,
    distinctJournalDays: events.length ? 1 : 0,
    events,
  };
}

describe("seeded tree topology", () => {
  it("produces the same model for the same snapshot", () => {
    const input = snapshot([
      event(1, "memory_leaf"),
      event(2, "twig"),
      event(3, "memory_blossom"),
    ]);

    const first = buildTreeTopology(input);
    const second = buildTreeTopology(input);

    expect(first).toEqual(second);
    expect(topologyFingerprint(first)).toBe(topologyFingerprint(second));
  });

  it("does not move existing geometry when events are appended", () => {
    const initial = buildTreeTopology(
      snapshot([event(1, "memory_leaf"), event(2, "twig")]),
    );
    const appended = buildTreeTopology(
      snapshot([
        event(1, "memory_leaf"),
        event(2, "twig"),
        event(3, "memory_luminous_blossom"),
        event(4, "branch"),
      ]),
    );

    expect(appended.branches.slice(0, initial.branches.length)).toEqual(
      initial.branches,
    );
    const initialEventFoliage = initial.foliage.filter(
      (item) => item.sequence > 0,
    );
    expect(
      appended.foliage
        .filter((item) => item.sequence > 0)
        .slice(0, initialEventFoliage.length),
    ).toEqual(initialEventFoliage);
  });

  it("keeps entry identifiers only on memory foliage", () => {
    const topology = buildTreeTopology(
      snapshot([
        event(1, "memory_bud"),
        event(2, "twig"),
        event(3, "memory_blossom"),
      ]),
    );

    const ambient = topology.foliage.filter((node) => node.sequence === 0);
    const memories = topology.foliage.filter((node) => node.sequence > 0);
    expect(ambient.every((node) => node.entryId === null)).toBe(true);
    expect(memories.map((node) => node.entryId)).toEqual([
      "entry-1",
      "entry-3",
    ]);
  });

  it("samples cubic endpoints exactly", () => {
    const topology = buildTreeTopology(snapshot());
    const trunk = topology.branches[0];
    expect(sampleCubic(trunk, 0)).toEqual(trunk.start);
    expect(sampleCubic(trunk, 1)).toEqual(trunk.end);
  });

  it("provides repeatable random sequences", () => {
    const first = seededRandom("sakura");
    const second = seededRandom("sakura");
    expect(Array.from({ length: 12 }, first)).toEqual(
      Array.from({ length: 12 }, second),
    );
  });

  it("rejects unsupported algorithm versions", () => {
    expect(() =>
      buildTreeTopology({
        ...snapshot(),
        algorithmVersion: 2,
      } as unknown as TreeSnapshot),
    ).toThrow(/Unsupported tree algorithm version/);
  });
});

