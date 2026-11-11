import { describe, expect, it } from "vitest";

import {
  classifyMemoryPointerGesture,
  createMemoryInstanceIndex,
  createSafeMemoryRendererMetadata,
  entryIdForMemoryInstance,
  isSafeMemoryRendererMetadata,
  MEMORY_GESTURE_THRESHOLD_CSS_PX,
  MEMORY_SCREEN_SEPARATION_PADDING_CSS_PX,
  MEMORY_TARGET_DIAMETER_CSS_PX,
  minimumMemoryScreenSeparationCssPx,
  navigateVisibleMemories,
  nearestPetalId,
  orderMemoryHitCandidates,
  projectedMemoryHitRadius,
} from "../features/garden/living-sakura/memoryInteraction";

function sources(count: number) {
  return Array.from({ length: count }, (_, projectionOrdinal) => ({
    entryId: `entry-${String(projectionOrdinal + 1).padStart(4, "0")}`,
    projectionOrdinal,
  }));
}

function projectedDiameter(input: {
  radius: number;
  distance: number;
  viewportHeight: number;
  fov: number;
}) {
  const visibleWorldHeight =
    2 * input.distance * Math.tan((input.fov * Math.PI) / 360);
  return ((input.radius * 2) / visibleWorldHeight) * input.viewportHeight;
}

describe("Living Sakura stable memory instance identity", () => {
  it.each([1, 48, 96, 192, 1_000])(
    "maps every entry exactly once in a %i-entry scenario",
    (count) => {
      const input = sources(count);
      const index = createMemoryInstanceIndex([...input].reverse());

      expect(index.instances).toHaveLength(count);
      expect(new Set(index.entryIdByInstanceId).size).toBe(count);
      expect(index.entryIdByInstanceId[0]).toBe("entry-0001");
      expect(index.entryIdByInstanceId[count - 1]).toBe(
        `entry-${String(count).padStart(4, "0")}`,
      );
      for (let instanceId = 0; instanceId < count; instanceId += 1) {
        const expectedEntryId = input[instanceId].entryId;
        expect(entryIdForMemoryInstance(index, instanceId)).toBe(expectedEntryId);
        expect(index.instanceIdByEntryId.get(expectedEntryId)).toBe(instanceId);
      }
    },
  );

  it("is deterministic across input order and append-stable", () => {
    const first48 = sources(48);
    const shuffled = [...first48].sort(
      (left, right) => (right.projectionOrdinal % 7) - (left.projectionOrdinal % 7),
    );
    const initial = createMemoryInstanceIndex(shuffled);
    const repeated = createMemoryInstanceIndex([...shuffled].reverse());
    const expanded = createMemoryInstanceIndex(sources(1_000));

    expect(repeated.entryIdByInstanceId).toEqual(initial.entryIdByInstanceId);
    expect(expanded.entryIdByInstanceId.slice(0, 48)).toEqual(
      initial.entryIdByInstanceId,
    );
  });

  it("uses entry ID as a deterministic tie-breaker and rejects duplicates", () => {
    const index = createMemoryInstanceIndex([
      { entryId: "entry-b", projectionOrdinal: 4 },
      { entryId: "entry-a", projectionOrdinal: 4 },
    ]);
    expect(index.entryIdByInstanceId).toEqual(["entry-a", "entry-b"]);
    expect(() =>
      createMemoryInstanceIndex([
        { entryId: "same", projectionOrdinal: 0 },
        { entryId: "same", projectionOrdinal: 1 },
      ]),
    ).toThrow(/Duplicate memory entryId/);
  });

  it("returns null for invalid or out-of-range renderer instance IDs", () => {
    const index = createMemoryInstanceIndex(sources(1));
    expect(entryIdForMemoryInstance(index, -1)).toBeNull();
    expect(entryIdForMemoryInstance(index, 1)).toBeNull();
    expect(entryIdForMemoryInstance(index, Number.NaN)).toBeNull();
  });
});

describe("Living Sakura renderer metadata privacy", () => {
  it("emits only kind, opaque entryId, and instanceId", () => {
    const privateSource = {
      entryId: "opaque-7a9f",
      projectionOrdinal: 0,
      journalBody: "private journal body",
      title: "private title",
      insight: "private insight",
      passphrase: "do not expose",
      ciphertext: "encrypted-payload",
      growthScore: 6,
      botanicalAddress: "private/growth/recipe",
    };
    const index = createMemoryInstanceIndex([privateSource]);
    const metadata = createSafeMemoryRendererMetadata(index, 0);

    expect(Object.keys(metadata).sort()).toEqual([
      "entryId",
      "instanceId",
      "kind",
    ]);
    expect(metadata).toEqual({
      kind: "living-sakura-memory",
      entryId: "opaque-7a9f",
      instanceId: 0,
    });
    const serialized = JSON.stringify({ index: index.instances, metadata });
    for (const forbidden of [
      "private journal body",
      "private title",
      "private insight",
      "do not expose",
      "encrypted-payload",
      "growthScore",
      "botanicalAddress",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("strictly guards untyped renderer metadata", () => {
    expect(
      isSafeMemoryRendererMetadata({
        kind: "living-sakura-memory",
        entryId: "opaque-entry",
        instanceId: 8,
      }),
    ).toBe(true);
    expect(
      isSafeMemoryRendererMetadata({
        kind: "living-sakura-memory",
        entryId: "opaque-entry",
        instanceId: 8,
        title: "must not be here",
      }),
    ).toBe(false);
    expect(
      isSafeMemoryRendererMetadata({
        kind: "living-sakura-memory",
        entryId: "opaque-entry",
        instanceId: -1,
      }),
    ).toBe(false);
  });
});

describe("nearest journal petal", () => {
  it("picks the closest blossom inside the radius and ignores the rest", () => {
    const petals = [
      { entryId: "far", screenX: 10, screenY: 10 },
      { entryId: "near", screenX: 40, screenY: 48 },
      { entryId: "closer", screenX: 52, screenY: 50 },
    ];
    expect(nearestPetalId(petals, 50, 50, 72)).toBe("closer");
    expect(nearestPetalId([...petals].reverse(), 50, 50, 72)).toBe("closer");
    expect(nearestPetalId(petals, 400, 400, 72)).toBeNull();
  });

  it("includes the radius edge and skips non-finite petals", () => {
    expect(
      nearestPetalId([{ entryId: "edge", screenX: 50, screenY: 0 }], 0, 0, 50),
    ).toBe("edge");
    expect(
      nearestPetalId([{ entryId: "out", screenX: 50.01, screenY: 0 }], 0, 0, 50),
    ).toBeNull();
    expect(
      nearestPetalId(
        [
          { entryId: "bad", screenX: Number.NaN, screenY: 0 },
          { entryId: "good", screenX: 1, screenY: 1 },
        ],
        0,
        0,
        10,
      ),
    ).toBe("good");
    expect(nearestPetalId([], 0, 0, 0)).toBeNull();
  });

  it("keeps screen distance ahead of depth, then prefers the nearer camera", () => {
    expect(
      nearestPetalId(
        [
          { entryId: "screen-near", screenX: 0, screenY: 0, depth: 20 },
          { entryId: "camera-near", screenX: 30, screenY: 0, depth: 1 },
        ],
        0,
        0,
        40,
      ),
    ).toBe("screen-near");
    expect(
      nearestPetalId(
        [
          { entryId: "farther", screenX: 10, screenY: 10, depth: 8 },
          { entryId: "closer", screenX: 10, screenY: 10, depth: 3 },
        ],
        10,
        10,
        20,
      ),
    ).toBe("closer");
    expect(
      nearestPetalId(
        [
          { entryId: "first", screenX: 4, screenY: 0 },
          { entryId: "second", screenX: 4, screenY: 0 },
        ],
        0,
        0,
        10,
      ),
    ).toBe("first");
  });
});

describe("Living Sakura pointer gesture semantics", () => {
  it("uses the eight-pixel fine-pointer threshold inclusively", () => {
    expect(MEMORY_GESTURE_THRESHOLD_CSS_PX.fine).toBe(8);
    expect(
      classifyMemoryPointerGesture({
        pointerPrecision: "fine",
        start: { clientX: 20, clientY: 20 },
        end: { clientX: 28, clientY: 20 },
      }),
    ).toBe("activate");
    expect(
      classifyMemoryPointerGesture({
        pointerPrecision: "fine",
        start: { clientX: 20, clientY: 20 },
        end: { clientX: 28.01, clientY: 20 },
      }),
    ).toBe("drag");
  });

  it("uses the eighteen-pixel coarse-pointer threshold by Euclidean travel", () => {
    expect(MEMORY_GESTURE_THRESHOLD_CSS_PX.coarse).toBe(18);
    expect(
      classifyMemoryPointerGesture({
        pointerPrecision: "coarse",
        start: { clientX: 0, clientY: 0 },
        end: { clientX: 6, clientY: 8 },
      }),
    ).toBe("activate");
    // Exactly eighteen pixels of travel still counts as activation.
    expect(
      classifyMemoryPointerGesture({
        pointerPrecision: "coarse",
        start: { clientX: 0, clientY: 0 },
        end: { clientX: 0, clientY: 18 },
      }),
    ).toBe("activate");
    expect(
      classifyMemoryPointerGesture({
        pointerPrecision: "coarse",
        start: { clientX: 0, clientY: 0 },
        end: { clientX: 14, clientY: 14 },
      }),
    ).toBe("drag");
  });

  it("preserves pointer cancellation regardless of movement", () => {
    expect(
      classifyMemoryPointerGesture({
        pointerPrecision: "fine",
        start: { clientX: 0, clientY: 0 },
        end: { clientX: 0, clientY: 0 },
        cancelled: true,
      }),
    ).toBe("cancel");
  });
});

describe("Living Sakura projected hit targets", () => {
  it.each([
    ["fine", 44],
    ["coarse", 64],
  ] as const)("projects the %s target to %i CSS pixels", (pointerPrecision, target) => {
    const distance = 18;
    const viewportHeight = 812;
    const fov = 32;
    const radius = projectedMemoryHitRadius({
      pointerPrecision,
      distanceToCamera: distance,
      viewportHeightCssPx: viewportHeight,
      verticalFovDegrees: fov,
    });

    expect(MEMORY_TARGET_DIAMETER_CSS_PX[pointerPrecision]).toBe(target);
    expect(
      projectedDiameter({ radius, distance, viewportHeight, fov }),
    ).toBeCloseTo(target, 10);
  });

  it("plans minimum screen separation from target diameter plus padding", () => {
    expect(MEMORY_SCREEN_SEPARATION_PADDING_CSS_PX).toBe(8);
    expect(minimumMemoryScreenSeparationCssPx("fine")).toBe(44 + 8);
    expect(minimumMemoryScreenSeparationCssPx("coarse")).toBe(64 + 8);
    expect(minimumMemoryScreenSeparationCssPx("coarse", 0)).toBe(64);
    expect(() => minimumMemoryScreenSeparationCssPx("fine", -1)).toThrow(
      /paddingCssPx/,
    );
  });

  it("supports explicit world-radius clamping for dense canopies", () => {
    const base = {
      pointerPrecision: "coarse" as const,
      distanceToCamera: 100,
      viewportHeightCssPx: 400,
      verticalFovDegrees: 60,
    };
    expect(
      projectedMemoryHitRadius({ ...base, maximumWorldRadius: 0.75 }),
    ).toBe(0.75);
    expect(
      projectedMemoryHitRadius({
        ...base,
        distanceToCamera: 1,
        minimumWorldRadius: 0.1,
      }),
    ).toBe(0.1);
  });

  it("rejects invalid camera and clamp inputs", () => {
    expect(() =>
      projectedMemoryHitRadius({
        pointerPrecision: "fine",
        distanceToCamera: 0,
        viewportHeightCssPx: 800,
        verticalFovDegrees: 32,
      }),
    ).toThrow(/distanceToCamera/);
    expect(() =>
      projectedMemoryHitRadius({
        pointerPrecision: "fine",
        distanceToCamera: 10,
        viewportHeightCssPx: 800,
        verticalFovDegrees: 180,
      }),
    ).toThrow(/less than 180/);
  });
});

describe("Living Sakura overlapping hit ordering", () => {
  it("orders by screen distance, then camera depth, then stable instance ID", () => {
    const input = [
      { instanceId: 8, screenDistanceCssPx: 4, cameraDepth: 2 },
      { instanceId: 5, screenDistanceCssPx: 2, cameraDepth: 6 },
      { instanceId: 3, screenDistanceCssPx: 2, cameraDepth: 4 },
      { instanceId: 1, screenDistanceCssPx: 2, cameraDepth: 4 },
    ];
    const ordered = orderMemoryHitCandidates(input);

    expect(ordered.map((candidate) => candidate.instanceId)).toEqual([
      1, 3, 5, 8,
    ]);
    expect(input.map((candidate) => candidate.instanceId)).toEqual([8, 5, 3, 1]);
  });
});

describe("Living Sakura visible-memory keyboard navigation", () => {
  const visibleEntryIds = ["oldest", "middle", "newest"];

  it("moves left/right without wrapping and enters from the nearest edge", () => {
    expect(
      navigateVisibleMemories({
        key: "ArrowRight",
        visibleEntryIds,
        activeEntryId: null,
      }),
    ).toMatchObject({ action: "focus", activeEntryId: "oldest" });
    expect(
      navigateVisibleMemories({
        key: "ArrowLeft",
        visibleEntryIds,
        activeEntryId: null,
      }),
    ).toMatchObject({ action: "focus", activeEntryId: "newest" });
    expect(
      navigateVisibleMemories({
        key: "ArrowLeft",
        visibleEntryIds,
        activeEntryId: "oldest",
      }).activeEntryId,
    ).toBe("oldest");
    expect(
      navigateVisibleMemories({
        key: "ArrowRight",
        visibleEntryIds,
        activeEntryId: "newest",
      }).activeEntryId,
    ).toBe("newest");
  });

  it("supports Home, End, Enter, and Escape semantics", () => {
    expect(
      navigateVisibleMemories({
        key: "Home",
        visibleEntryIds,
        activeEntryId: "middle",
      }),
    ).toMatchObject({ action: "focus", activeEntryId: "oldest", handled: true });
    expect(
      navigateVisibleMemories({
        key: "End",
        visibleEntryIds,
        activeEntryId: "middle",
      }),
    ).toMatchObject({ action: "focus", activeEntryId: "newest", handled: true });
    expect(
      navigateVisibleMemories({
        key: "Enter",
        visibleEntryIds,
        activeEntryId: "middle",
      }),
    ).toEqual({ action: "activate", activeEntryId: "middle", handled: true });
    expect(
      navigateVisibleMemories({
        key: "Escape",
        visibleEntryIds,
        activeEntryId: "middle",
      }),
    ).toEqual({ action: "clear", activeEntryId: null, handled: true });
  });

  it("ignores unrelated keys and safely handles an empty projection", () => {
    expect(
      navigateVisibleMemories({
        key: "Tab",
        visibleEntryIds,
        activeEntryId: "middle",
      }),
    ).toEqual({ action: "none", activeEntryId: "middle", handled: false });
    expect(
      navigateVisibleMemories({
        key: "ArrowRight",
        visibleEntryIds: [],
        activeEntryId: null,
      }),
    ).toEqual({ action: "none", activeEntryId: null, handled: false });
    expect(
      navigateVisibleMemories({
        key: "Enter",
        visibleEntryIds,
        activeEntryId: null,
      }),
    ).toEqual({ action: "none", activeEntryId: null, handled: false });
  });
});
