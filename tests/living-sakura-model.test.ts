import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  createBudGeometry,
  createFlowerGeometry,
  createHalfOpenFlowerGeometry,
  createLivingSakuraModel,
  presentationSegmentBudget,
} from "../features/garden/living-sakura/livingSakuraModel";

describe("living Sakura visual model", () => {
  it("presentation densify loves early chapters without skipping mature capacity", () => {
    expect(presentationSegmentBudget(0, 93)).toBe(0);
    expect(presentationSegmentBudget(1, 93)).toBe(0);
    expect(presentationSegmentBudget(11, 93)).toBe(0);
    expect(presentationSegmentBudget(12, 93)).toBeGreaterThan(0);
    expect(presentationSegmentBudget(96, 93)).toBe(93);
    expect(presentationSegmentBudget(10_000, 93)).toBe(93);
    // Append-stable: never shrinks as journals increase.
    let previous = 0;
    for (const n of [1, 2, 3, 6, 12, 24, 48, 72, 96, 200]) {
      const budget = presentationSegmentBudget(n, 93);
      expect(budget).toBeGreaterThanOrEqual(previous);
      previous = budget;
    }
  });

  it("cherishes a cherry stone with no adult wood when there are no journals", () => {
    const model = createLivingSakuraModel({
      rootSeed: "first-open-seed",
      journalCount: 0,
      newestGrowthUnits: 1,
    });

    expect(model.hasSeedKernel).toBe(true);
    expect(model.seedKernel).not.toBeNull();
    expect(model.seedKernel!.name).toBe("Seed kernel");
    expect(model.visibleBranchCount).toBe(0);
    expect(presentationSegmentBudget(0, 93)).toBe(0);

    let wood = 0;
    let ribs = 0;
    let stoneMeshes = 0;
    model.root.traverse((child) => {
      if (child instanceof THREE.Mesh && child.name.startsWith("Wood ")) {
        wood += 1;
      }
      if (child.name.startsWith("Surface root")) ribs += 1;
      if (child.name === "Cherry stone") stoneMeshes += 1;
    });
    expect(wood).toBe(0);
    expect(ribs).toBe(0);
    expect(stoneMeshes).toBe(1);
    expect(model.memoryBlossomCount).toBe(0);
    expect(model.root.scale.x).toBe(1);
    expect(model.root.position.y).toBe(0);
    model.dispose();
  });

  it("does not keep a seed kernel after the first journal", () => {
    const model = createLivingSakuraModel({
      rootSeed: "first-open-seed",
      journalCount: 1,
      newestGrowthUnits: 1,
    });
    expect(model.hasSeedKernel).toBe(false);
    expect(model.seedKernel).toBeNull();
    expect(model.visibleBranchCount).toBeGreaterThan(0);
    model.dispose();
  });

  it("does not add sphere tumor props at wood joins", () => {
    const model = createLivingSakuraModel({
      rootSeed: "join-collars",
      journalCount: 48,
      newestGrowthUnits: 2,
      structureOnly: true,
    });
    let collars = 0;
    let rootBalls = 0;
    model.root.traverse((child) => {
      if (child.name.startsWith("Join collar")) collars += 1;
      if (child.name === "Grounded root flare") rootBalls += 1;
    });
    // Collars are continuous pipe-flare rings only — never separate sphere beads / root balls.
    expect(collars).toBe(0);
    expect(rootBalls).toBe(0);
    model.dispose();
  });

  it("pipe-flare collars match parent girth at major joins", () => {
    // Structural: first ring of a child wood mesh should not be a thin pin under parent.
    const model = createLivingSakuraModel({
      rootSeed: "pipe-flare-join",
      journalCount: 96,
      newestGrowthUnits: 2,
      structureOnly: true,
    });
    const woods: THREE.Mesh[] = [];
    model.root.traverse((child) => {
      if (child instanceof THREE.Mesh && child.name.startsWith("Wood ")) {
        woods.push(child);
      }
    });
    expect(woods.length).toBeGreaterThan(4);
    // Measure first-ring radial bulk vs tip-ring for non-trunk wood.
    let continuousJoins = 0;
    for (const mesh of woods.slice(0, 20)) {
      const positions = mesh.geometry.getAttribute("position");
      if (!positions || positions.count < 40) continue;
      const sides = 10;
      let baseCx = 0;
      let baseCy = 0;
      let baseCz = 0;
      for (let i = 0; i < sides; i += 1) {
        baseCx += positions.getX(i);
        baseCy += positions.getY(i);
        baseCz += positions.getZ(i);
      }
      baseCx /= sides;
      baseCy /= sides;
      baseCz /= sides;
      let baseR = 0;
      for (let i = 0; i < sides; i += 1) {
        baseR += Math.hypot(
          positions.getX(i) - baseCx,
          positions.getY(i) - baseCy,
          positions.getZ(i) - baseCz,
        );
      }
      baseR /= sides;
      // Join ring should be a real wood girth, not a hairline pin.
      if (baseR > 0.008) continuousJoins += 1;
    }
    expect(continuousJoins).toBeGreaterThan(8);
    model.dispose();
  });

  it("mid-life densify exposes tertiary wood segments for crown lace", () => {
    const youth = createLivingSakuraModel({
      rootSeed: "lace-midlife",
      journalCount: 6,
      newestGrowthUnits: 1,
      structureOnly: true,
    });
    const mid = createLivingSakuraModel({
      rootSeed: "lace-midlife",
      journalCount: 48,
      newestGrowthUnits: 2,
      structureOnly: true,
    });
    // Topology lace: mid-life must densify past youth (more wood meshes).
    let youthWood = 0;
    let midWood = 0;
    youth.root.traverse((c) => {
      if (c instanceof THREE.Mesh && c.name.startsWith("Wood ")) youthWood += 1;
    });
    mid.root.traverse((c) => {
      if (c instanceof THREE.Mesh && c.name.startsWith("Wood ")) midWood += 1;
    });
    expect(midWood).toBeGreaterThan(youthWood);
    expect(mid.visibleBranchCount).toBeGreaterThan(youth.visibleBranchCount);
    youth.dispose();
    mid.dispose();
  });

  it("tapers wood tips and flares collars so limbs never read as blunt pipes", () => {
    const model = createLivingSakuraModel({
      rootSeed: "mesh-craft-taper",
      journalCount: 96,
      newestGrowthUnits: 2,
      structureOnly: true,
    });
    // Collect wood meshes (not roots / underlays).
    const woods: THREE.Mesh[] = [];
    model.root.traverse((child) => {
      if (child instanceof THREE.Mesh && child.name.startsWith("Wood ")) {
        woods.push(child);
      }
    });
    expect(woods.length).toBeGreaterThan(8);

    // Ring radial radius = mean distance of ring verts from that ring's centroid.
    const ringRadius = (
      positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
      start: number,
      count: number,
    ) => {
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let i = 0; i < count; i += 1) {
        const idx = start + i;
        cx += positions.getX(idx);
        cy += positions.getY(idx);
        cz += positions.getZ(idx);
      }
      cx /= count;
      cy /= count;
      cz /= count;
      let radial = 0;
      for (let i = 0; i < count; i += 1) {
        const idx = start + i;
        radial += Math.hypot(
          positions.getX(idx) - cx,
          positions.getY(idx) - cy,
          positions.getZ(idx) - cz,
        );
      }
      return radial / count;
    };

    let taperedTips = 0;
    let measured = 0;
    for (const mesh of woods) {
      const positions = mesh.geometry.getAttribute("position");
      if (!positions || positions.count < 50) continue;
      // Heuristic ring size: 8–16 sides; use 10 as mid of densified craft.
      const sides = 10;
      if (positions.count < sides * 4) continue;
      const baseR = ringRadius(positions, 0, sides);
      // Last full ring sits just before the apex vertex.
      const tipRingStart = positions.count - 1 - sides;
      if (tipRingStart < sides) continue;
      const tipR = ringRadius(positions, tipRingStart, sides);
      measured += 1;
      // Tip must be thinner than base (pipe model + tip pinch).
      if (tipR < baseR * 0.85) taperedTips += 1;
    }
    expect(measured).toBeGreaterThan(4);
    expect(taperedTips).toBeGreaterThan(measured * 0.4);

    // Soft normals + vertex colors present (sculpture, not faceted plastic).
    for (const mesh of woods.slice(0, 5)) {
      expect(mesh.geometry.getAttribute("normal")).toBeTruthy();
      expect(mesh.geometry.getAttribute("color")).toBeTruthy();
    }
    model.dispose();
  });

  it("builds a five-petal notched cupped blossom within the low-poly budget", () => {
    const geometry = createFlowerGeometry();
    const positions = geometry.getAttribute("position");
    // 5 petals × 10 verts = 50 (extra mid ring for soft body).
    expect(positions.count).toBe(50);
    expect(positions.count).toBeGreaterThanOrEqual(30);
    expect(positions.count).toBeLessThanOrEqual(80);

    // Per petal, verts 4/6 are tip lobes and vert 5 is the recessed notch.
    const petalLength = 0.24;
    const notchDepth = petalLength * 0.12;
    for (let petal = 0; petal < 5; petal += 1) {
      const base = petal * 10;
      const lobe = Math.hypot(positions.getX(base + 4), positions.getY(base + 4));
      const notch = Math.hypot(positions.getX(base + 5), positions.getY(base + 5));
      expect(lobe).toBeGreaterThan(notch);
      expect(lobe - notch).toBeGreaterThanOrEqual(petalLength * 0.1 - 1e-6);
      expect(petalLength - notchDepth).toBeCloseTo(notch, 5);
    }

    // Deeper cup along Z (soft bowl, not a flat confetti chip).
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < positions.count; index += 1) {
      minZ = Math.min(minZ, positions.getZ(index));
      maxZ = Math.max(maxZ, positions.getZ(index));
    }
    expect(maxZ - minZ).toBeGreaterThan(0.1);
    geometry.dispose();
  });

  it("builds instanceable half-open and bud geometries", () => {
    const halfOpen = createHalfOpenFlowerGeometry();
    const bud = createBudGeometry();
    const halfPositions = halfOpen.getAttribute("position");
    const budPositions = bud.getAttribute("position");
    expect(halfPositions.count).toBe(40);
    expect(halfPositions.count).toBeLessThanOrEqual(80);
    expect(budPositions.count).toBeGreaterThan(8);

    let halfSpan = 0;
    for (let index = 0; index < halfPositions.count; index += 1) {
      halfSpan = Math.max(
        halfSpan,
        Math.hypot(halfPositions.getX(index), halfPositions.getY(index)),
      );
    }
    // Half-open footprint stays smaller than full open petal length.
    expect(halfSpan).toBeLessThan(0.2);

    let budMinY = Number.POSITIVE_INFINITY;
    let budMaxY = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < budPositions.count; index += 1) {
      budMinY = Math.min(budMinY, budPositions.getY(index));
      budMaxY = Math.max(budMaxY, budPositions.getY(index));
    }
    // Elongated bud capsule (taller than wide).
    expect(budMaxY - budMinY).toBeGreaterThan(0.12);
    halfOpen.dispose();
    bud.dispose();
  });

  it("grounds each chapter with a stage-true root flare", () => {
    const countRoots = (root: THREE.Object3D) => {
      let roots = 0;
      root.traverse((child) => {
        if (child.name.startsWith("Surface root")) roots += 1;
      });
      return roots;
    };
    const sapling = createLivingSakuraModel({
      rootSeed: "prod-wood-midlife",
      journalCount: 24,
      newestGrowthUnits: 2,
      structureOnly: true,
    });
    const young = createLivingSakuraModel({
      rootSeed: "prod-wood-midlife",
      journalCount: 60,
      newestGrowthUnits: 2,
      structureOnly: true,
    });
    const mature = createLivingSakuraModel({
      rootSeed: "prod-wood-midlife",
      journalCount: 192,
      newestGrowthUnits: 2,
      structureOnly: true,
    });
    expect(countRoots(sapling.root)).toBeGreaterThanOrEqual(3);
    expect(countRoots(sapling.root)).toBeLessThanOrEqual(4);
    expect(countRoots(young.root)).toBe(4);
    expect(countRoots(mature.root)).toBe(4);
    sapling.dispose();
    young.dispose();
    mature.dispose();
  });

  it("gives the first journal a tender sprout — not a miniature adult vase", () => {
    const sprout = createLivingSakuraModel({
      rootSeed: "first-memory",
      journalCount: 1,
      newestGrowthUnits: 1,
    });
    const sapling = createLivingSakuraModel({
      rootSeed: "first-memory",
      journalCount: 12,
      newestGrowthUnits: 1,
    });

    expect(sprout.visibleBranchCount).toBeGreaterThanOrEqual(1);
    expect(sprout.visibleBranchCount).toBeLessThan(8);
    expect(sprout.memoryBlossomCount).toBe(1);
    expect(sprout.newestMemory?.name).toBe("Newest memory blossom");
    expect(sprout.hasSeedKernel).toBe(false);
    expect(sprout.root.scale.y).toBe(1);
    let stem = 0;
    let leaves = 0;
    let husk = 0;
    sprout.root.traverse((child) => {
      if (child.name === "Wood youth/stem") stem += 1;
      if (child.name.startsWith("Sprout leaf")) leaves += 1;
      if (child.name.startsWith("Sprout husk")) husk += 1;
    });
    expect(stem).toBe(1);
    expect(leaves).toBeGreaterThan(0);
    expect(husk).toBe(2);
    expect(sapling.visibleBranchCount).toBeGreaterThan(sprout.visibleBranchCount);
    sprout.dispose();
    sapling.dispose();
  });

  it("keeps the memory blossom invariant while surrounding generosity varies", () => {
    const quiet = createLivingSakuraModel({
      rootSeed: "reward-fairness",
      journalCount: 96,
      newestGrowthUnits: 1,
    });
    const deep = createLivingSakuraModel({
      rootSeed: "reward-fairness",
      journalCount: 96,
      newestGrowthUnits: 6,
    });

    // Equal-beauty petal: flower mesh scale is identical across private tiers.
    expect(quiet.newestMemory?.children[0].scale).toEqual(
      deep.newestMemory?.children[0].scale,
    );
    // Flower, center, and the opening bud. Surrounding organs stay siblings.
    expect(quiet.newestMemory?.children).toHaveLength(3);
    expect(deep.newestMemory?.children).toHaveLength(3);
    expect(quiet.newestMemory?.getObjectByName("Opening bud")).toBeTruthy();
    expect(deep.newestMemory?.getObjectByName("Opening bud")).toBeTruthy();
    // Ceremony organs: newest-memory + surrounding life (2 vs 11).
    expect(quiet.ceremonyOrganIds[0]).toBe("newest-memory");
    expect(deep.ceremonyOrganIds[0]).toBe("newest-memory");
    expect(quiet.ceremonyOrgans).toHaveLength(1 + 2);
    expect(deep.ceremonyOrgans.length).toBeGreaterThanOrEqual(1 + 11);
    expect(
      deep.ceremonyOrganIds.includes("generosity-shoot"),
    ).toBe(true);
    expect(quiet.ceremonyOrganIds.includes("generosity-shoot")).toBe(false);
    expect(quiet.ceremonyPathSegmentIds.length).toBeGreaterThan(0);
    expect(typeof quiet.applyCeremonySample).toBe("function");
    quiet.dispose();
    deep.dispose();
  });

  it("structureOnly suppresses floral mass for founder silhouette stills", () => {
    const bloom = createLivingSakuraModel({
      rootSeed: "still-pack-structure",
      journalCount: 192,
      newestGrowthUnits: 4,
    });
    const structure = createLivingSakuraModel({
      rootSeed: "still-pack-structure",
      journalCount: 192,
      newestGrowthUnits: 4,
      structureOnly: true,
    });

    expect(bloom.memoryBlossomCount).toBeGreaterThan(0);
    expect(structure.memoryBlossomCount).toBe(0);
    expect(structure.newestMemory).toBeNull();
    expect(structure.visibleBranchCount).toBe(bloom.visibleBranchCount);
    expect(structure.visibleBranchCount).toBeGreaterThan(0);
    bloom.dispose();
    structure.dispose();
  });

  it("adds bounded visible woody development in enduring seasons", () => {
    const mature = createLivingSakuraModel({
      rootSeed: "enduring-care",
      journalCount: 192,
      newestGrowthUnits: 4,
    });
    const enduring = createLivingSakuraModel({
      rootSeed: "enduring-care",
      journalCount: 1_000,
      newestGrowthUnits: 4,
    });

    const collectShoots = (root: typeof mature.root) => {
      const shoots: typeof mature.root.children = [];
      root.traverse((child) => {
        if (child.name.startsWith("Enduring care shoot")) {
          shoots.push(child);
        }
      });
      return shoots;
    };
    const matureShoots = collectShoots(mature.root);
    const enduringShoots = collectShoots(enduring.root);
    expect(matureShoots).toHaveLength(0);
    expect(enduringShoots.length).toBeGreaterThanOrEqual(12);
    expect(enduringShoots.length).toBeLessThanOrEqual(24);
    expect(enduring.root.scale.x).toBeGreaterThan(mature.root.scale.x);
    mature.dispose();
    enduring.dispose();
  });

  it("keeps wood identity from established through first maturity", () => {
    const earlyEstablished = createLivingSakuraModel({
      rootSeed: "same-tree-language",
      journalCount: 96,
      newestGrowthUnits: 2,
    });
    const lateEstablished = createLivingSakuraModel({
      rootSeed: "same-tree-language",
      journalCount: 150,
      newestGrowthUnits: 2,
    });
    const pinnedEntryId =
      earlyEstablished.memoryInstances.find((memory) => memory.ordinal === 48)
        ?.entryId ?? earlyEstablished.activeMemoryEntryIds[0];
    const mature = createLivingSakuraModel({
      rootSeed: "same-tree-language",
      journalCount: 192,
      newestGrowthUnits: 2,
      selectedEntryIds: pinnedEntryId ? [pinnedEntryId] : undefined,
    });
    const earlyIds = new Set(
      earlyEstablished.pivots.map((pivot) => pivot.segmentId),
    );
    const lateIds = new Set(
      lateEstablished.pivots.map((pivot) => pivot.segmentId),
    );
    for (const id of earlyIds) {
      expect(lateIds.has(id), `lost established segment ${id}`).toBe(true);
    }
    const matureIds = new Set(mature.pivots.map((pivot) => pivot.segmentId));
    expect([...matureIds].some((id) => id.startsWith("wood/"))).toBe(false);
    expect(matureIds.has("youth/stem")).toBe(true);
    expect(
      matureIds.has("life/sweep") || matureIds.has("young/leader/dominant"),
    ).toBe(true);
    for (const id of lateIds) {
      expect(matureIds.has(id), `lost late-established segment ${id}`).toBe(
        true,
      );
    }
    if (pinnedEntryId) {
      expect(mature.memoryAddressByEntryId[pinnedEntryId]).toBe(
        earlyEstablished.memoryAddressByEntryId[pinnedEntryId],
      );
    }
    earlyEstablished.dispose();
    lateEstablished.dispose();
    mature.dispose();
  });

  it("keeps complete memory identity while bounding the active projection", () => {
    const early = createLivingSakuraModel({
      rootSeed: "stable-history",
      journalCount: 2,
      newestGrowthUnits: 2,
    });
    const enduring = createLivingSakuraModel({
      rootSeed: "stable-history",
      journalCount: 1_000,
      newestGrowthUnits: 6,
      selectedEntryIds: ["study-memory-1"],
    });

    expect(enduring.historicalMemoryCount).toBe(1_000);
    expect(enduring.memoryBlossomCount).toBe(256);
    expect(enduring.activeMemoryEntryIds).toContain("study-memory-1");
    expect(enduring.memoryAddressByEntryId["study-memory-1"]).toBe(
      early.memoryAddressByEntryId["study-memory-1"],
    );
    early.dispose();
    enduring.dispose();
  });

  it("exposes one deterministic, privacy-safe hit instance for every active memory", () => {
    const model = createLivingSakuraModel({
      rootSeed: "interactive-memory-index",
      journalCount: 192,
      newestGrowthUnits: 4,
    });

    expect(model.memoryInstances).toHaveLength(192);
    expect(model.memoryHitTargets.count).toBe(192);
    expect(model.memoryInstances.map((memory) => memory.instanceIndex)).toEqual(
      Array.from({ length: 192 }, (_, index) => index),
    );
    // Every active journal petal is hit-targetable (order may place newest last).
    expect(new Set(model.memoryInstances.map((memory) => memory.entryId))).toEqual(
      new Set(model.activeMemoryEntryIds),
    );
    expect(model.memoryInstances).toHaveLength(model.activeMemoryEntryIds.length);
    const rendererMetadata = JSON.stringify(model.memoryInstances);
    expect(rendererMetadata).not.toMatch(
      /title|insight|plaintext|passphrase|ciphertext|growthUnits/i,
    );
    model.dispose();
  });

  it("keeps memory hit targets attached when their botanical branch moves", () => {
    const model = createLivingSakuraModel({
      rootSeed: "branch-bound-memories",
      journalCount: 96,
      newestGrowthUnits: 2,
    });
    const memory = model.memoryInstances.find(
      (candidate) => candidate.segmentId !== "trunk" && candidate.ordinal < 96,
    );
    expect(memory).toBeDefined();
    const pivot = model.pivots.find(
      (candidate) => candidate.segmentId === memory!.segmentId,
    );
    expect(pivot).toBeDefined();

    const beforeMatrix = new THREE.Matrix4();
    const afterMatrix = new THREE.Matrix4();
    const before = new THREE.Vector3();
    const after = new THREE.Vector3();
    model.updateMemoryTransforms(0.8);
    model.memoryHitTargets.getMatrixAt(memory!.instanceIndex, beforeMatrix);
    before.setFromMatrixPosition(beforeMatrix);

    pivot!.group.rotation.z += 0.18;
    model.updateMemoryTransforms(0.8);
    model.memoryHitTargets.getMatrixAt(memory!.instanceIndex, afterMatrix);
    after.setFromMatrixPosition(afterMatrix);

    expect(after.distanceTo(before)).toBeGreaterThan(0.001);
    model.dispose();
  });

  it("separates multiple active memory hit centers without pile-up on wood", () => {
    const model = createLivingSakuraModel({
      rootSeed: "memory-hit-spacing",
      journalCount: 24,
      newestGrowthUnits: 2,
    });

    expect(model.memoryInstances).toHaveLength(24);
    // Hit matrices include root stage scale (sibling of root under the same parent).
    model.updateMemoryTransforms(0.72);

    const matrix = new THREE.Matrix4();
    const positions = model.memoryInstances.map((memory) => {
      model.memoryHitTargets.getMatrixAt(memory.instanceIndex, matrix);
      return new THREE.Vector3().setFromMatrixPosition(matrix);
    });

    let pairCount = 0;
    let pileUps = 0;
    let minDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < positions.length; i += 1) {
      for (let j = i + 1; j < positions.length; j += 1) {
        pairCount += 1;
        const distance = positions[i].distanceTo(positions[j]);
        minDistance = Math.min(minDistance, distance);
        // Exact stack on the same spur slot — not a short on-wood umbel.
        if (distance < 0.002) pileUps += 1;
      }
    }

    expect(pairCount).toBeGreaterThan(0);
    expect(pileUps).toBe(0);
    expect(minDistance).toBeGreaterThan(0.002);
    model.dispose();
  });

  it("keeps hit centers aligned with blossom world positions across stage scales", () => {
    for (const journalCount of [1, 12, 48, 96] as const) {
      const model = createLivingSakuraModel({
        rootSeed: `hit-align-${journalCount}`,
        journalCount,
        newestGrowthUnits: 2,
      });
      model.updateMemoryTransforms(0.8);
      const matrix = new THREE.Matrix4();
      const hitLocal = new THREE.Vector3();
      const blossomWorld = new THREE.Vector3();
      for (const memory of model.memoryInstances) {
        if (memory.instanceIndex < 0) continue;
        model.memoryHitTargets.getMatrixAt(memory.instanceIndex, matrix);
        hitLocal.setFromMatrixPosition(matrix);
        // Hit mesh is sibling of root: parent-local hit ≈ root-local blossom * scale.
        // Compare against true world position with root at identity parent.
        const world = model.getMemoryWorldPosition(memory.entryId, blossomWorld);
        expect(world).not.toBeNull();
        expect(hitLocal.distanceTo(blossomWorld!)).toBeLessThan(0.05);
      }
      model.dispose();
    }
  });

  it("parents canopy organs to wood pivots so sway carries the umbels", () => {
    const model = createLivingSakuraModel({
      rootSeed: "pivot-parented-canopy",
      journalCount: 220,
      newestGrowthUnits: 2,
    });

    const organMeshes: THREE.InstancedMesh[] = [];
    for (const pivot of model.pivots) {
      pivot.group.traverse((object) => {
        if (
          object instanceof THREE.InstancedMesh &&
          (object.name.includes("flower") ||
            object.name.includes("Flower") ||
            object.name.includes("pedicel") ||
            object.name.includes("Pedicel") ||
            object.name.includes("bud") ||
            object.name.includes("Bud") ||
            object.name.includes("leaf") ||
            object.name.includes("Leaf") ||
            object.name.includes("Ambient") ||
            object.name.includes("Sakura") ||
            object.name.includes("Spring") ||
            object.name.includes("Memory surrounding"))
        ) {
          organMeshes.push(object);
        }
      });
    }
    expect(organMeshes.length).toBeGreaterThan(0);

    // Newest memory blossom remains a pivot child (not root).
    expect(model.newestMemory).not.toBeNull();
    expect(model.newestMemory!.parent).not.toBe(model.root);
    expect(
      model.pivots.some((pivot) => pivot.group === model.newestMemory!.parent),
    ).toBe(true);

    model.dispose();
  });

  it("keeps memory blossoms larger than ambient scale floor", () => {
    const model = createLivingSakuraModel({
      rootSeed: "memory-scale-floor",
      journalCount: 24,
      newestGrowthUnits: 2,
    });
    expect(model.newestMemory).not.toBeNull();
    const flower = model.newestMemory!.children.find(
      (child) => child instanceof THREE.Mesh && !(child instanceof THREE.InstancedMesh),
    ) as THREE.Mesh | undefined;
    expect(flower).toBeDefined();
    // Host-capped equal beauty: readable, never a giant free-float (old 2.15+).
    expect(flower!.scale.x).toBeGreaterThanOrEqual(0.18);
    expect(flower!.scale.x).toBeLessThan(1.2);
    model.dispose();
  });

  it("keeps early memory blossoms close to their visible wood host", () => {
    const model = createLivingSakuraModel({
      rootSeed: "petal-attach-youth",
      journalCount: 3,
      newestGrowthUnits: 1,
    });
    expect(model.newestMemory).not.toBeNull();
    const local = model.newestMemory!.position;
    // Host-local attach must stay within a short pedicel of the limb (not mid-air).
    expect(local.length()).toBeLessThan(1.15);
    model.dispose();
  });

  it("keeps memory placement deterministic and one blossom per active entry", () => {
    const first = createLivingSakuraModel({
      rootSeed: "memory-placement-stability",
      journalCount: 48,
      newestGrowthUnits: 4,
    });
    const second = createLivingSakuraModel({
      rootSeed: "memory-placement-stability",
      journalCount: 48,
      newestGrowthUnits: 4,
    });

    expect(first.memoryInstances.map((memory) => memory.entryId)).toEqual(
      second.memoryInstances.map((memory) => memory.entryId),
    );
    expect(new Set(first.memoryInstances.map((m) => m.entryId)).size).toBe(
      first.memoryInstances.length,
    );

    first.updateMemoryTransforms(0.72);
    second.updateMemoryTransforms(0.72);
    const matrixA = new THREE.Matrix4();
    const matrixB = new THREE.Matrix4();
    for (const memory of first.memoryInstances) {
      first.memoryHitTargets.getMatrixAt(memory.instanceIndex, matrixA);
      second.memoryHitTargets.getMatrixAt(memory.instanceIndex, matrixB);
      const a = new THREE.Vector3().setFromMatrixPosition(matrixA);
      const b = new THREE.Vector3().setFromMatrixPosition(matrixB);
      expect(a.distanceTo(b)).toBeLessThan(1e-9);
    }
    first.dispose();
    second.dispose();
  });

  it("publishes one finite world-space petal point per journal and a stable focus ring", () => {
    const model = createLivingSakuraModel({
      rootSeed: "petal-point-world",
      journalCount: 3,
      newestGrowthUnits: 1,
    });
    // The garden parents the tree under a yaw rig. Points must be world-space
    // or a click projects beside the blossom.
    const rig = new THREE.Group();
    rig.position.set(4.2, 0.35, -2.4);
    rig.rotation.y = 0.65;
    rig.add(model.root);
    // useFrame writes petal points before the renderer refreshes matrixWorld.
    model.updateMemoryTransforms(0.8);
    rig.updateMatrixWorld(true);

    expect(model.petalPoints).toHaveLength(model.memoryInstances.length);
    expect(model.petalPoints).toHaveLength(3);
    const origin = new THREE.Vector3();
    let atOrigin = 0;
    for (const petal of model.petalPoints) {
      expect(Number.isFinite(petal.position.x)).toBe(true);
      expect(Number.isFinite(petal.position.y)).toBe(true);
      expect(Number.isFinite(petal.position.z)).toBe(true);
      if (petal.position.distanceTo(origin) < 1e-3) atOrigin += 1;
    }
    expect(atOrigin).toBe(0);

    const rendered = new THREE.Vector3();
    expect(model.newestMemory).not.toBeNull();
    model.newestMemory!.getWorldPosition(rendered);
    const newestPetal = model.petalPoints.find(
      (candidate) => candidate.entryId === model.memoryInstances.at(-1)!.entryId,
    );
    expect(newestPetal).toBeDefined();
    expect(newestPetal!.position.distanceTo(rendered)).toBeLessThan(0.05);
    for (const memory of model.memoryInstances) {
      const petal = model.petalPoints.find(
        (candidate) => candidate.entryId === memory.entryId,
      );
      expect(petal).toBeDefined();
      const reported = model.getMemoryWorldPosition(memory.entryId, rendered);
      expect(reported).not.toBeNull();
      expect(petal!.position.distanceTo(reported!)).toBeLessThan(1e-4);
    }
    // Translated rig: world centers leave the root-local neighborhood.
    expect(
      Math.max(...model.petalPoints.map((petal) => petal.position.x)),
    ).toBeGreaterThan(2);

    const secondId = model.memoryInstances[1]!.entryId;
    model.setSelectedMemory(secondId);
    const ring = model.root.getObjectByName(
      "Selected memory blossom focus",
    ) as THREE.Mesh;
    expect(ring).toBeTruthy();
    expect(ring.visible).toBe(true);
    expect(ring.parent).not.toBeNull();
    expect(ring.userData.baseScale).toBe(ring.scale.x);
    expect(Number.isFinite(ring.userData.baseScale)).toBe(true);
    const placedScale = ring.userData.baseScale as number;
    model.setSelectedMemory(secondId);
    expect(ring.userData.baseScale).toBe(ring.scale.x);
    expect(Number.isFinite(ring.userData.baseScale)).toBe(true);
    expect(ring.userData.baseScale as number).toBeCloseTo(placedScale, 5);
    // A later pulse multiplies scale.x by ~1.055. baseScale must not follow it.
    ring.scale.setScalar((ring.userData.baseScale as number) * 1.055);
    expect(ring.userData.baseScale as number).toBeCloseTo(placedScale, 5);
    expect(
      Math.abs((ring.userData.baseScale as number) / placedScale),
    ).toBeLessThan(2);

    model.setSelectedMemory(null);
    expect(ring.visible).toBe(false);
    expect(ring.parent).toBeNull();
    model.dispose();
  });

  it("updates memory transforms when there are no journals", () => {
    const model = createLivingSakuraModel({
      rootSeed: "empty-memory-transforms",
      journalCount: 0,
      newestGrowthUnits: 1,
    });
    expect(() => model.updateMemoryTransforms(0.8)).not.toThrow();
    expect(model.petalPoints).toHaveLength(0);
    expect(model.memoryInstances).toHaveLength(0);
    model.dispose();
  });

  it("names fallen petals on a mature canopy", () => {
    const model = createLivingSakuraModel({
      rootSeed: "mature-hanami-haze",
      journalCount: 200,
      newestGrowthUnits: 6,
    });
    const fallen = model.root.getObjectByName("Fallen petals");
    expect(fallen).toBeTruthy();
    expect(fallen).toBeInstanceOf(THREE.InstancedMesh);
    model.dispose();
  });
});
