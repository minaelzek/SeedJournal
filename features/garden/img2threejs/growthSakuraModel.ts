import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { MemoryForm, TreeGrowthEvent } from "@/lib/contracts";

type Vec3 = readonly [number, number, number];

export type SakuraModelQuality = "low" | "balanced" | "high";

export interface GrowthSakuraModelOptions {
  totalGrowthUnits?: number;
  events?: readonly TreeGrowthEvent[];
  quality?: SakuraModelQuality;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

interface BranchSpec {
  id: string;
  parentId: string | null;
  order: number;
  curve: readonly [Vec3, Vec3, Vec3, Vec3];
  radiusStart: number;
  radiusEnd: number;
  startUnit: number;
  endUnit: number;
  role: "root" | "trunk" | "scaffold" | "secondary" | "twig";
}

interface OrganSlot {
  id: string;
  parentBranchId: string;
  branchAmount: number;
  anchor: Vec3;
  position: Vec3;
  tangent: Vec3;
  unlockUnit: number;
  scale: number;
  seed: number;
}

interface MemoryBinding {
  entryId: string;
  eventId: string;
  form: MemoryForm;
}

export interface GrowthSakuraBlueprintSummary {
  maximumGrowthUnits: 192;
  maximumInteractiveMemories: 48;
  branchCount: number;
  rootCount: number;
  scaffoldCount: number;
  secondaryCount: number;
  twigCount: number;
  blossomSlotCount: number;
  leafSlotCount: number;
}

const MAX_GROWTH_UNITS = 192 as const;
const MAX_INTERACTIVE_MEMORIES = 48 as const;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function vector(value: Vec3): THREE.Vector3 {
  return new THREE.Vector3(value[0], value[1], value[2]);
}

function tuple(value: THREE.Vector3): Vec3 {
  return [value.x, value.y, value.z];
}

function curveFor(spec: BranchSpec): THREE.CubicBezierCurve3 {
  return new THREE.CubicBezierCurve3(
    vector(spec.curve[0]),
    vector(spec.curve[1]),
    vector(spec.curve[2]),
    vector(spec.curve[3]),
  );
}

function childCurve(
  parent: BranchSpec,
  amount: number,
  target: Vec3,
): readonly [Vec3, Vec3, Vec3, Vec3] {
  const parentCurve = curveFor(parent);
  const start = parentCurve.getPoint(amount);
  const parentTangent = parentCurve.getTangent(amount).normalize();
  const end = vector(target);
  const direction = end.clone().sub(start).normalize();
  const length = start.distanceTo(end);
  const controlA = start
    .clone()
    .addScaledVector(parentTangent, Math.max(0.18, length * 0.22));
  const controlB = end
    .clone()
    .addScaledVector(direction, -Math.max(0.2, length * 0.34))
    .add(new THREE.Vector3(0, length * 0.08, 0));
  return [tuple(start), tuple(controlA), tuple(controlB), tuple(end)];
}

function createBlueprint(): BranchSpec[] {
  const branches: BranchSpec[] = [];
  const byId = new Map<string, BranchSpec>();
  const add = (branch: BranchSpec) => {
    branches.push(branch);
    byId.set(branch.id, branch);
    return branch;
  };

  const trunk = add({
    id: "trunk",
    parentId: null,
    order: 0,
    curve: [
      [0, -2.72, 0],
      [-0.32, -1.46, 0.16],
      [0.34, 0.24, -0.14],
      [-0.02, 1.5, 0.05],
    ],
    radiusStart: 0.5,
    radiusEnd: 0.19,
    startUnit: 1,
    endUnit: 48,
    role: "trunk",
  });

  const rootCenter = vector(trunk.curve[0]);
  const rootAngles = [-2.72, -1.72, -0.58, 0.22, 1.24, 2.38] as const;
  const rootLengths = [1.12, 0.66, 0.92, 1.18, 0.7, 0.98] as const;
  for (let index = 0; index < rootAngles.length; index += 1) {
    const angle = rootAngles[index];
    const length = rootLengths[index];
    const end = new THREE.Vector3(
      Math.cos(angle) * length,
      -2.75 + (index % 3) * 0.014,
      Math.sin(angle) * length * 0.52,
    );
    add({
      id: `root-${index}`,
      parentId: "trunk",
      order: 0,
      curve: [
        tuple(
          rootCenter.clone().add(
            new THREE.Vector3(
              Math.cos(angle) * 0.12,
              0.28,
              Math.sin(angle) * 0.08,
            ),
          ),
        ),
        tuple(
          rootCenter
            .clone()
            .lerp(end, 0.32)
            .add(new THREE.Vector3(0, 0.2, 0)),
        ),
        tuple(end.clone().lerp(rootCenter, 0.2)),
        tuple(end),
      ],
      radiusStart: index === 0 || index === 3 ? 0.3 : 0.24,
      radiusEnd: 0.034,
      startUnit: 8 + (index % 4),
      endUnit: 22 + (index % 4),
      role: "root",
    });
  }

  const primaryTargets: ReadonlyArray<{
    id: string;
    parentId?: string;
    amount: number;
    target: Vec3;
    startUnit: number;
  }> = [
    { id: "left-low", amount: 0.34, target: [-4.62, 0.28, 0.2], startUnit: 8 },
    { id: "right-low", amount: 0.41, target: [4.34, 0.94, -0.42], startUnit: 9 },
    { id: "left-mid", amount: 0.53, target: [-3.9, 2.02, -0.08], startUnit: 28 },
    { id: "right-mid", amount: 0.61, target: [3.48, 2.62, 0.34], startUnit: 40 },
    { id: "center-left", amount: 0.68, target: [-1.18, 3.36, 0.62], startUnit: 48 },
    { id: "center-right", amount: 0.73, target: [1.26, 3.22, -0.56], startUnit: 54 },
    { id: "rear-left", parentId: "scaffold-left-mid", amount: 0.47, target: [-2.78, 3.22, 1.48], startUnit: 48 },
    { id: "rear-right", parentId: "scaffold-right-mid", amount: 0.54, target: [2.86, 3.02, -1.42], startUnit: 54 },
    { id: "left-high", parentId: "scaffold-left-mid", amount: 0.66, target: [-3.56, 3.94, 0.48], startUnit: 60 },
    { id: "right-high", parentId: "scaffold-right-mid", amount: 0.72, target: [3.4, 3.58, -0.52], startUnit: 66 },
    { id: "leader", amount: 0.76, target: [-0.38, 4.9, 0.08], startUnit: 42 },
    { id: "inner-left", parentId: "scaffold-leader", amount: 0.43, target: [-1.3, 4.06, -0.3], startUnit: 74 },
    { id: "inner-right", parentId: "scaffold-leader", amount: 0.48, target: [1.28, 3.86, 0.34], startUnit: 76 },
    { id: "crown-left", parentId: "scaffold-leader", amount: 0.56, target: [-2.0, 5.08, 0.24], startUnit: 78 },
    { id: "crown-right", parentId: "scaffold-leader", amount: 0.62, target: [2.08, 4.56, -0.28], startUnit: 84 },
  ];

  const primary: BranchSpec[] = primaryTargets.map((definition, index) => {
    const parent = byId.get(definition.parentId ?? "trunk") ?? trunk;
    return add({
      id: `scaffold-${definition.id}`,
      parentId: parent.id,
      order: parent.order + 1,
      curve: childCurve(parent, definition.amount, definition.target),
      radiusStart:
        parent.id === "trunk" ? 0.24 - index * 0.012 : 0.135,
      radiusEnd: 0.07,
      startUnit: definition.startUnit,
      endUnit: Math.min(
        96,
        definition.startUnit +
          (definition.id === "left-low" || definition.id === "right-low"
            ? 10
            : 18),
      ),
      role: "scaffold",
    });
  });

  const secondary: BranchSpec[] = [];
  const secondaryPatterns = [
    { amount: 0.4, along: 1.06, spread: 0.9, lift: 0.34, depth: 0.3 },
    { amount: 0.52, along: 0.82, spread: 0.16, lift: 0.72, depth: 0.14 },
    { amount: 0.63, along: 1.18, spread: -0.74, lift: 0.2, depth: -0.38 },
    { amount: 0.82, along: 1.04, spread: 0.64, lift: 0.38, depth: 0.22 },
  ] as const;
  let secondaryOrdinal = 0;
  const secondaryTotal = primary.length * secondaryPatterns.length;
  for (const [primaryIndex, parent] of primary.entries()) {
    const parentCurve = curveFor(parent);
    for (const [patternIndex, pattern] of secondaryPatterns.entries()) {
      const start = parentCurve.getPoint(pattern.amount);
      const direction = parentCurve.getTangent(pattern.amount).normalize();
      const planarPerpendicular = new THREE.Vector3(
        -direction.y,
        direction.x,
        0,
      ).normalize();
      const alternating = (primaryIndex + patternIndex) % 2 === 0 ? 1 : -1;
      const target = start
        .clone()
        .addScaledVector(direction, pattern.along)
        .addScaledVector(planarPerpendicular, pattern.spread * alternating)
        .add(new THREE.Vector3(0, pattern.lift, pattern.depth * alternating));
      target.x = THREE.MathUtils.clamp(target.x, -4.72, 4.72);
      target.y = Math.min(target.y, 5.28);
      target.z = THREE.MathUtils.clamp(target.z, -1.72, 1.72);
      const startUnit = Math.max(
        parent.startUnit + 4,
        24 +
          Math.floor(
            (secondaryOrdinal / Math.max(1, secondaryTotal - 1)) * 72,
          ),
      );
      const branch = add({
        id: `secondary-${primaryIndex}-${patternIndex}`,
        parentId: parent.id,
        order: 2,
        curve: childCurve(parent, pattern.amount, tuple(target)),
        radiusStart: 0.09,
        radiusEnd: 0.032,
        startUnit,
        endUnit: Math.min(144, startUnit + 20),
        role: "secondary",
      });
      secondary.push(branch);
      secondaryOrdinal += 1;
    }
  }

  let twigOrdinal = 0;
  const twigTotal = secondary.length * 2;
  for (const [secondaryIndex, parent] of secondary.entries()) {
    const parentCurve = curveFor(parent);
    for (let index = 0; index < 2; index += 1) {
      const amount = index === 0 ? 0.64 : 0.84;
      const start = parentCurve.getPoint(amount);
      const direction = parentCurve.getTangent(amount).normalize();
      const perpendicular = new THREE.Vector3(
        -direction.y,
        direction.x,
        index === 0 ? 0.22 : -0.18,
      ).normalize();
      const sign = (secondaryIndex + index) % 2 === 0 ? 1 : -1;
      const target = start
        .clone()
        .addScaledVector(direction, 0.68 + index * 0.12)
        .addScaledVector(perpendicular, sign * (0.28 + index * 0.08))
        .add(new THREE.Vector3(0, 0.2 + index * 0.14, sign * 0.08));
      const startUnit = Math.max(
        parent.startUnit + 4,
        72 +
          Math.floor((twigOrdinal / Math.max(1, twigTotal - 1)) * 96),
      );
      add({
        id: `twig-${secondaryIndex}-${index}`,
        parentId: parent.id,
        order: 3,
        curve: childCurve(parent, amount, tuple(target)),
        radiusStart: 0.04,
        radiusEnd: 0.012,
        startUnit,
        endUnit: Math.min(MAX_GROWTH_UNITS, startUnit + 12),
        role: "twig",
      });
      twigOrdinal += 1;
    }
  }

  return branches;
}

const BRANCH_BLUEPRINT = createBlueprint();
const BRANCH_BY_ID = new Map(
  BRANCH_BLUEPRINT.map((branch) => [branch.id, branch]),
);
function createOrganSlots(): { blossoms: OrganSlot[]; leaves: OrganSlot[] } {
  const blossoms: OrganSlot[] = [];
  const leaves: OrganSlot[] = [];
  const trunk = BRANCH_BLUEPRINT.find((branch) => branch.id === "trunk");
  if (trunk) {
    const trunkCurve = curveFor(trunk);
    const earlyLeafAnchors = [0.055, 0.12, 0.2, 0.28, 0.36] as const;
    const earlyLeafUnits = [1, 1, 3, 6, 9] as const;
    earlyLeafAnchors.forEach((amount, index) => {
      const anchor = trunkCurve.getPoint(amount);
      const side = index % 2 === 0 ? -1 : 1;
      leaves.push({
        id: `leaf-trunk-${index}`,
        parentBranchId: trunk.id,
        branchAmount: amount,
        anchor: tuple(anchor),
        position: tuple(
          anchor.clone().add(new THREE.Vector3(side * 0.14, 0.055, 0.02 * side)),
        ),
        tangent: tuple(trunkCurve.getTangent(amount).normalize()),
        unlockUnit: earlyLeafUnits[index],
        scale: 0.68 + index * 0.035,
        seed: hashString(`early-leaf-${index}`),
      });
    });
    for (let index = 0; index < 5; index += 1) {
      const amount = 0.34 + index * 0.055;
      const anchor = trunkCurve.getPoint(amount);
      const side = index % 2 === 0 ? -1 : 1;
      blossoms.push({
        id: `blossom-trunk-${index}`,
        parentBranchId: trunk.id,
        branchAmount: amount,
        anchor: tuple(anchor),
        position: tuple(
          anchor.clone().add(new THREE.Vector3(side * 0.055, 0.045, -0.02 * side)),
        ),
        tangent: tuple(trunkCurve.getTangent(amount).normalize()),
        unlockUnit: 12 + index * 2,
        scale: 0.68 + index * 0.035,
        seed: hashString(`early-blossom-${index}`),
      });
    }
  }
  for (const branch of BRANCH_BLUEPRINT) {
    if (branch.order === 0) continue;
    const curve = curveFor(branch);
    const lowerCrownBonus = curve.getPoint(0.62).y < 1.75 ? 2 : 0;
    const blossomCount =
      (branch.role === "scaffold" ? 5 : branch.role === "secondary" ? 3 : 3) +
      lowerCrownBonus;
    const random = seededUnit(hashString(`organs:${branch.id}`));
    for (let index = 0; index < blossomCount; index += 1) {
      const anchorStart =
        branch.role === "scaffold" ? 0.46 : branch.role === "secondary" ? 0.5 : 0.3;
      const normalized =
        (index + 0.18 + random() * 0.64) / Math.max(1, blossomCount);
      const tipWeighted = 1 - (1 - normalized) ** 1.65;
      const anchorAmount = anchorStart + (0.96 - anchorStart) * tipWeighted;
      const anchor = curve.getPoint(Math.min(0.95, anchorAmount));
      const tangent = curve
        .getTangent(Math.min(0.95, anchorAmount))
        .normalize();
      const angle = (index / blossomCount) * Math.PI * 2 + random() * 0.7;
      const radius =
        branch.order === 3
          ? 0.1 + random() * 0.15
          : 0.075 + random() * 0.13;
      const offset = new THREE.Vector3(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius * 0.86 + (random() - 0.5) * 0.08,
        (random() - 0.5) * radius * 1.8,
      );
      blossoms.push({
        id: `blossom-${branch.id}-${index}`,
        parentBranchId: branch.id,
        branchAmount: Math.min(0.95, anchorAmount),
        anchor: tuple(anchor),
        position: tuple(anchor.clone().add(offset)),
        tangent: tuple(tangent),
        unlockUnit: Math.min(
          MAX_GROWTH_UNITS,
          Math.max(
            12,
            branch.startUnit +
              (branch.role === "secondary" ? 6 : 4) +
              (branch.role === "scaffold"
                ? Math.max(0, index - 2) * 2
                : index * 2),
          ),
        ),
        scale: 0.8 + random() * 0.38,
        seed: Math.floor(random() * 0xffffffff),
      });
    }
    if (branch.order <= 2 || hashString(branch.id) % 2 === 0) {
      const leafAmount = branch.order === 3 ? 0.78 : 0.72;
      const leafAnchor = curve.getPoint(leafAmount);
      leaves.push({
        id: `leaf-${branch.id}`,
        parentBranchId: branch.id,
        branchAmount: leafAmount,
        anchor: tuple(leafAnchor),
        position: tuple(
          leafAnchor.clone().add(
            new THREE.Vector3(
              (random() - 0.5) * 0.12,
              0.06 + random() * 0.08,
              (random() - 0.5) * 0.1,
            ),
          ),
        ),
        tangent: tuple(curve.getTangent(0.78).normalize()),
        unlockUnit: Math.min(
          MAX_GROWTH_UNITS,
          Math.max(1, branch.startUnit + 3),
        ),
        scale: 0.78 + random() * 0.24,
        seed: Math.floor(random() * 0xffffffff),
      });
    }
  }
  return { blossoms, leaves };
}

const ORGAN_SLOTS = createOrganSlots();

export const GROWTH_SAKURA_BLUEPRINT: GrowthSakuraBlueprintSummary = {
  maximumGrowthUnits: MAX_GROWTH_UNITS,
  maximumInteractiveMemories: MAX_INTERACTIVE_MEMORIES,
  branchCount: BRANCH_BLUEPRINT.length,
  rootCount: BRANCH_BLUEPRINT.filter((branch) => branch.role === "root").length,
  scaffoldCount: BRANCH_BLUEPRINT.filter(
    (branch) => branch.role === "scaffold",
  ).length,
  secondaryCount: BRANCH_BLUEPRINT.filter(
    (branch) => branch.role === "secondary",
  ).length,
  twigCount: BRANCH_BLUEPRINT.filter((branch) => branch.role === "twig").length,
  blossomSlotCount: ORGAN_SLOTS.blossoms.length,
  leafSlotCount: ORGAN_SLOTS.leaves.length,
};

export function growthSakuraBranchContracts(): ReadonlyArray<{
  id: string;
  parentId: string | null;
  role: BranchSpec["role"];
  startUnit: number;
  endUnit: number;
}> {
  return BRANCH_BLUEPRINT.map(
    ({ id, parentId, role, startUnit, endUnit }) => ({
      id,
      parentId,
      role,
      startUnit,
      endUnit,
    }),
  );
}

export function growthSakuraAttachmentAudit(): ReadonlyArray<{
  childId: string;
  parentId: string;
  gap: number;
}> {
  return BRANCH_BLUEPRINT.filter(
    (branch) => branch.parentId && branch.role !== "root",
  ).map((branch) => {
    const parent = BRANCH_BY_ID.get(branch.parentId!);
    const childStart = vector(branch.curve[0]);
    let gap = Number.POSITIVE_INFINITY;
    if (parent) {
      const parentCurve = curveFor(parent);
      for (let index = 0; index <= 200; index += 1) {
        gap = Math.min(
          gap,
          childStart.distanceTo(parentCurve.getPoint(index / 200)),
        );
      }
    }
    return { childId: branch.id, parentId: branch.parentId!, gap };
  });
}

function branchProgress(branch: BranchSpec, units: number): number {
  if (units < branch.startUnit) return 0;
  if (branch.endUnit <= branch.startUnit) return 1;
  const progress = clamp01(
    (Math.min(units, MAX_GROWTH_UNITS) - branch.startUnit + 1) /
      (branch.endUnit - branch.startUnit + 1),
  );
  const eased = 1 - (1 - progress) ** 3;
  return branch.id === "trunk" && units >= 1 ? Math.max(0.14, eased) : eased;
}

function organHasParentContact(slot: OrganSlot, units: number): boolean {
  const parent = BRANCH_BY_ID.get(slot.parentBranchId);
  return Boolean(
    parent && branchProgress(parent, units) + 0.015 >= slot.branchAmount,
  );
}

function createTaperedTubeGeometry(
  curve: THREE.CubicBezierCurve3,
  radiusStart: number,
  radiusEnd: number,
  progress: number,
  tubularSegments: number,
  radialSegments: number,
): THREE.BufferGeometry {
  const rows = Math.max(2, Math.ceil(tubularSegments * progress));
  const positions: number[] = [];
  const indices: number[] = [];
  const previousNormal = new THREE.Vector3(1, 0, 0);
  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const binormal = new THREE.Vector3();

  for (let row = 0; row <= rows; row += 1) {
    const local = row / rows;
    const amount = local * progress;
    curve.getPoint(amount, point);
    curve.getTangent(amount, tangent).normalize();
    normal.copy(previousNormal).addScaledVector(tangent, -previousNormal.dot(tangent));
    if (normal.lengthSq() < 1e-6) {
      normal.copy(Math.abs(tangent.y) < 0.9 ? WORLD_UP : FORWARD).cross(tangent);
    }
    normal.normalize();
    binormal.crossVectors(tangent, normal).normalize();
    previousNormal.copy(normal);
    const taper = THREE.MathUtils.lerp(radiusStart, radiusEnd, amount);
    const growingTip =
      progress < 0.995
        ? THREE.MathUtils.lerp(1, 0.16, Math.pow(local, 3.4))
        : 1;
    const collar = 1 + Math.max(0, 1 - local * 5) * 0.12;
    const radius = taper * collar * growingTip;
    for (let side = 0; side < radialSegments; side += 1) {
      const angle = (side / radialSegments) * Math.PI * 2;
      const vertex = point
        .clone()
        .addScaledVector(normal, Math.cos(angle) * radius)
        .addScaledVector(binormal, Math.sin(angle) * radius);
      positions.push(vertex.x, vertex.y, vertex.z);
    }
  }

  for (let row = 0; row < rows; row += 1) {
    for (let side = 0; side < radialSegments; side += 1) {
      const next = (side + 1) % radialSegments;
      const a = row * radialSegments + side;
      const b = row * radialSegments + next;
      const c = (row + 1) * radialSegments + side;
      const d = (row + 1) * radialSegments + next;
      indices.push(a, c, b, b, c, d);
    }
  }

  const endCenter = positions.length / 3;
  curve.getPoint(progress, point);
  positions.push(point.x, point.y, point.z);
  const endRing = rows * radialSegments;
  for (let side = 0; side < radialSegments; side += 1) {
    indices.push(
      endCenter,
      endRing + side,
      endRing + ((side + 1) % radialSegments),
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function colorizeWoodGeometry(
  geometry: THREE.BufferGeometry,
  branchId: string,
  root: boolean,
): void {
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  const random = seededUnit(hashString(`wood-facets:${branchId}`));
  const base = new THREE.Color(root ? "#4b3732" : "#66504a");
  const color = new THREE.Color();
  for (let index = 0; index < position.count; index += 1) {
    color
      .copy(base)
      .offsetHSL(
        (random() - 0.5) * 0.022,
        (random() - 0.5) * 0.08,
        (random() - 0.5) * 0.075,
      );
    color.toArray(colors, index * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

function createRootFlareGeometry(
  maturity: number,
  progress: number,
): THREE.BufferGeometry {
  const sides = 10;
  const positions: number[] = [];
  const indices: number[] = [];
  const ringHeights = [-2.73, -2.43, -2.08] as const;
  const ringRadii = [0.7, 0.5, 0.34] as const;
  for (let ring = 0; ring < ringHeights.length; ring += 1) {
    for (let side = 0; side < sides; side += 1) {
      const angle = (side / sides) * Math.PI * 2 + 0.11;
      const lobe = 0.82 + ((side * 7) % 5) * 0.065;
      const radius = ringRadii[ring] * lobe * maturity * progress;
      positions.push(
        Math.cos(angle) * radius,
        THREE.MathUtils.lerp(-2.73, ringHeights[ring], progress),
        Math.sin(angle) * radius * 0.82,
      );
    }
  }
  for (let ring = 0; ring < ringHeights.length - 1; ring += 1) {
    for (let side = 0; side < sides; side += 1) {
      const next = (side + 1) % sides;
      const a = ring * sides + side;
      const b = ring * sides + next;
      const c = (ring + 1) * sides + side;
      const d = (ring + 1) * sides + next;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  colorizeWoodGeometry(geometry, "root-flare", true);
  return geometry;
}

function createPetalGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.012);
  shape.bezierCurveTo(0.07, 0.018, 0.105, 0.095, 0.075, 0.16);
  shape.bezierCurveTo(0.04, 0.205, 0.015, 0.2, 0, 0.172);
  shape.bezierCurveTo(-0.015, 0.2, -0.04, 0.205, -0.075, 0.16);
  shape.bezierCurveTo(-0.105, 0.095, -0.07, 0.018, 0, -0.012);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.018,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.008,
    bevelThickness: 0.008,
  });
  geometry.translate(0, 0.01, -0.009);
  return geometry;
}

function createLeafGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.14);
  shape.bezierCurveTo(0.09, -0.07, 0.105, 0.04, 0, 0.18);
  shape.bezierCurveTo(-0.105, 0.04, -0.09, -0.07, 0, -0.14);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.014,
    steps: 1,
    bevelEnabled: false,
  });
  geometry.translate(0, 0, -0.007);
  return geometry;
}

function memoryForm(kind: TreeGrowthEvent["kind"]): MemoryForm | null {
  switch (kind) {
    case "memory_leaf":
      return "leaf";
    case "memory_bud":
      return "bud";
    case "memory_blossom":
      return "blossom";
    case "memory_luminous_blossom":
      return "luminous-blossom";
    default:
      return null;
  }
}

function memoryBindings(events: readonly TreeGrowthEvent[]): MemoryBinding[] {
  return events.flatMap((event) => {
    const form = memoryForm(event.kind);
    return form && event.entryId
      ? [{ entryId: event.entryId, eventId: event.id, form }]
      : [];
  });
}

function distributedBindings(
  bindings: readonly MemoryBinding[],
  slotCount: number,
): Map<number, MemoryBinding> {
  const result = new Map<number, MemoryBinding>();
  const assigned = Math.min(bindings.length, slotCount);
  for (let index = 0; index < assigned; index += 1) {
    const slotIndex = Math.min(
      slotCount - 1,
      Math.floor(((index + 0.5) / Math.max(1, assigned)) * slotCount),
    );
    result.set(slotIndex, bindings[index]);
  }
  return result;
}

function dynamicMemorySlot(
  binding: MemoryBinding,
  index: number,
  units: number,
): OrganSlot {
  const visibleBranches = BRANCH_BLUEPRINT.filter(
    (branch) => branchProgress(branch, units) > 0.04,
  );
  const parent =
    visibleBranches[
      hashString(`${binding.eventId}:${index}`) % Math.max(1, visibleBranches.length)
    ] ?? BRANCH_BLUEPRINT[0];
  const progress = branchProgress(parent, units);
  const amount = THREE.MathUtils.clamp(progress * 0.82, 0.035, 0.9);
  const curve = curveFor(parent);
  const anchor = curve.getPoint(amount);
  const random = seededUnit(hashString(`memory-slot:${binding.eventId}`));
  const angle = random() * Math.PI * 2;
  const radius = binding.form === "leaf" ? 0.04 : 0.055;
  return {
    id: `memory-slot-${binding.eventId}`,
    parentBranchId: parent.id,
    branchAmount: amount,
    anchor: tuple(anchor),
    position: tuple(
      anchor.clone().add(
        new THREE.Vector3(
          Math.cos(angle) * radius,
          0.025 + random() * 0.035,
          Math.sin(angle) * radius,
        ),
      ),
    ),
    tangent: tuple(curve.getTangent(amount).normalize()),
    unlockUnit: units,
    scale:
      binding.form === "luminous-blossom"
        ? 1.08
        : binding.form === "blossom"
          ? 0.98
          : binding.form === "bud"
            ? 0.78
            : 0.72,
    seed: hashString(`memory-organ:${binding.eventId}`),
  };
}

function totalUnits(options: GrowthSakuraModelOptions): number {
  const fromEvents = options.events?.reduce(
    (total, event) => total + event.growthUnits,
    0,
  );
  const source = options.totalGrowthUnits ?? fromEvents ?? MAX_GROWTH_UNITS;
  return Math.max(0, Math.floor(source));
}

function addSeed(root: THREE.Group): void {
  const seed = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.24, 0),
    new THREE.MeshStandardMaterial({
      color: "#8c6551",
      roughness: 0.88,
      metalness: 0,
      flatShading: true,
    }),
  );
  seed.name = "Cherry stone";
  seed.position.set(0, -2.68, 0);
  seed.scale.set(0.82, 1.08, 0.72);
  root.add(seed);
}

function setCylinderBetween(
  transform: THREE.Object3D,
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
): void {
  const direction = end.clone().sub(start);
  const length = direction.length();
  transform.position.copy(start).addScaledVector(direction, 0.5);
  transform.quaternion.setFromUnitVectors(WORLD_UP, direction.normalize());
  transform.scale.set(radius, length, radius);
  transform.updateMatrix();
}

export function createGrowthSakuraModel(
  options: GrowthSakuraModelOptions = {},
): THREE.Group {
  const units = totalUnits(options);
  const cappedUnits = Math.min(units, MAX_GROWTH_UNITS);
  const quality = options.quality ?? "balanced";
  const root = new THREE.Group();
  root.name = "Growth-constrained Sakura";

  if (units === 0) {
    addSeed(root);
    root.userData.growthContract = {
      totalGrowthUnits: 0,
      maximumStructuralUnits: MAX_GROWTH_UNITS,
      blueprint: GROWTH_SAKURA_BLUEPRINT,
    };
    return root;
  }

  const barkMaterial = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.95,
    metalness: 0,
    flatShading: true,
    vertexColors: true,
    emissive: "#2a1713",
    emissiveIntensity: 0.025,
  });
  const rootMaterial = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.96,
    metalness: 0,
    flatShading: true,
    vertexColors: true,
  });
  const petalMaterial = new THREE.MeshStandardMaterial({
    color: "#fffaf8",
    roughness: 0.68,
    metalness: 0,
    flatShading: true,
    side: THREE.DoubleSide,
    vertexColors: true,
    emissive: "#e7afbf",
    emissiveIntensity: 0.58,
  });
  const stamenMaterial = new THREE.MeshStandardMaterial({
    color: "#fff8e8",
    roughness: 0.72,
    metalness: 0,
    vertexColors: true,
    emissive: "#9a6728",
    emissiveIntensity: 0.32,
  });
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: "#fffdf6",
    roughness: 0.82,
    metalness: 0,
    flatShading: true,
    side: THREE.DoubleSide,
    vertexColors: true,
    emissive: "#3f4c31",
    emissiveIntensity: 0.28,
  });
  const budMaterial = new THREE.MeshStandardMaterial({
    color: "#fff8f8",
    roughness: 0.72,
    metalness: 0,
    flatShading: true,
    vertexColors: true,
    emissive: "#8f465e",
    emissiveIntensity: 0.34,
  });

  const visibleBranchContracts: Array<{
    id: string;
    parentId: string | null;
    role: BranchSpec["role"];
    progress: number;
  }> = [];
  const barkGeometries: THREE.BufferGeometry[] = [];
  const rootGeometries: THREE.BufferGeometry[] = [];
  const radialSegments = quality === "high" ? 9 : quality === "low" ? 6 : 7;
  const tubularSegments = quality === "high" ? 14 : quality === "low" ? 8 : 11;
  const maturity =
    0.11 + Math.pow(clamp01(cappedUnits / MAX_GROWTH_UNITS), 0.65) * 0.89;
  for (const branch of BRANCH_BLUEPRINT) {
    const progress = branchProgress(branch, cappedUnits);
    if (progress <= 0.015) continue;
    const geometry = createTaperedTubeGeometry(
      curveFor(branch),
      branch.radiusStart * maturity,
      branch.radiusEnd * maturity,
      progress,
      tubularSegments,
      radialSegments,
    );
    const isRoot = branch.role === "root";
    colorizeWoodGeometry(geometry, branch.id, isRoot);
    (isRoot ? rootGeometries : barkGeometries).push(geometry);
    visibleBranchContracts.push({
      id: branch.id,
      parentId: branch.parentId,
      role: branch.role,
      progress,
    });
  }
  const flareProgress = 1 - (1 - clamp01((cappedUnits - 7) / 18)) ** 3;
  if (flareProgress > 0.015) {
    rootGeometries.push(createRootFlareGeometry(maturity, flareProgress));
  }
  const addWoodMesh = (
    geometries: THREE.BufferGeometry[],
    material: THREE.Material,
    name: string,
  ) => {
    if (geometries.length === 0) return;
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach((source) => source.dispose());
    if (!geometry) return;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = options.castShadow ?? true;
    mesh.receiveShadow = options.receiveShadow ?? true;
    root.add(mesh);
  };
  addWoodMesh(barkGeometries, barkMaterial, "Sakura wood");
  addWoodMesh(rootGeometries, rootMaterial, "Surface roots");

  if (root.children.length === 0) {
    barkMaterial.dispose();
    rootMaterial.dispose();
  }

  const availableBlossoms = ORGAN_SLOTS.blossoms.filter(
    (slot) =>
      slot.unlockUnit <= cappedUnits && organHasParentContact(slot, cappedUnits),
  );
  const pendingBuds = ORGAN_SLOTS.blossoms.filter(
    (slot) =>
      slot.unlockUnit > cappedUnits &&
      slot.unlockUnit - cappedUnits <= 6 &&
      organHasParentContact(slot, cappedUnits),
  );
  const availableLeaves = ORGAN_SLOTS.leaves.filter(
    (slot) =>
      slot.unlockUnit <= cappedUnits && organHasParentContact(slot, cappedUnits),
  );
  const qualityStride = quality === "low" ? 2 : 1;
  const blossoms = availableBlossoms.filter(
    (_slot, index) => index % qualityStride === 0,
  );
  const leaves = availableLeaves.filter(
    (_slot, index) => quality !== "low" || index % 2 === 0,
  );
  const bindings = memoryBindings(options.events ?? []).slice(
    -MAX_INTERACTIVE_MEMORIES,
  );
  const flowerBindings = bindings.filter(
    (binding) =>
      binding.form === "blossom" || binding.form === "luminous-blossom",
  );
  const leafBindings = bindings.filter((binding) => binding.form === "leaf");
  const budBindings = bindings.filter((binding) => binding.form === "bud");
  const flowerBindingBySlot = distributedBindings(
    flowerBindings,
    blossoms.length,
  );
  const leafBindingBySlot = distributedBindings(leafBindings, leaves.length);
  const dynamicFlowers = flowerBindings
    .slice(blossoms.length)
    .map((binding, index) =>
      dynamicMemorySlot(binding, blossoms.length + index, cappedUnits),
    );
  blossoms.push(...dynamicFlowers);
  const dynamicLeaves = leafBindings
    .slice(leaves.length)
    .map((binding, index) =>
      dynamicMemorySlot(binding, leaves.length + index, cappedUnits),
    );
  leaves.push(...dynamicLeaves);
  const memoryBudSlots = budBindings.map((binding, index) =>
    dynamicMemorySlot(binding, index, cappedUnits),
  );
  const buds = [...pendingBuds, ...memoryBudSlots];
  const blossomEntryIds: Array<string | null> = [];
  const memoryPositions: Record<string, Vec3> = {};

  if (blossoms.length > 0) {
    const petalGeometry = createPetalGeometry();
    const petalMesh = new THREE.InstancedMesh(
      petalGeometry,
      petalMaterial,
      blossoms.length * 5,
    );
    petalMesh.name = "Sakura petals";
    petalMesh.castShadow = options.castShadow ?? true;
    const centerMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.034, 1),
      stamenMaterial,
      blossoms.length,
    );
    centerMesh.name = "Sakura blossom centers";
    const pedicelMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(1, 1, 1, 5, 1),
      barkMaterial,
      blossoms.length,
    );
    pedicelMesh.name = "Blossom pedicels";
    const transform = new THREE.Object3D();
    const petalTransform = new THREE.Object3D();
    const parentAnchor = new THREE.Vector3();
    const blossomPosition = new THREE.Vector3();
    const color = new THREE.Color();
    const centerColor = new THREE.Color();
    const bloomQuaternion = new THREE.Quaternion();
    const petalSpin = new THREE.Quaternion();
    const bloomEuler = new THREE.Euler();
    blossoms.forEach((slot, blossomIndex) => {
      blossomPosition.fromArray(slot.position);
      parentAnchor.fromArray(slot.anchor);
      setCylinderBetween(transform, parentAnchor, blossomPosition, 0.012);
      pedicelMesh.setMatrixAt(blossomIndex, transform.matrix);
      const binding = flowerBindingBySlot.get(blossomIndex);
      blossomEntryIds.push(binding?.entryId ?? null);
      if (binding) memoryPositions[binding.entryId] = slot.position;
      const random = seededUnit(slot.seed);
      const luminous = binding?.form === "luminous-blossom";
      const tone = random();
      bloomEuler.set(
        (random() - 0.5) * 0.48,
        (random() - 0.5) * 0.58,
        (random() - 0.5) * 0.5,
      );
      bloomQuaternion.setFromEuler(bloomEuler);
      const baseColor = luminous
        ? new THREE.Color("#ffe5ee")
        : new THREE.Color(
            tone < 0.18
              ? "#fff1ee"
              : tone < 0.42
                ? "#e4adbd"
                : tone < 0.74
                  ? "#f1c9d1"
                  : "#d99caf",
          );
      centerColor.set(luminous ? "#ffe09a" : "#d9b36b");
      for (let petalIndex = 0; petalIndex < 5; petalIndex += 1) {
        const angle = (petalIndex / 5) * Math.PI * 2 + random() * 0.16;
        petalTransform.position.copy(blossomPosition);
        petalSpin.setFromAxisAngle(FORWARD, angle);
        petalTransform.quaternion.copy(bloomQuaternion).multiply(petalSpin);
        petalTransform.rotateX(-0.12 + random() * 0.24);
        const scale = slot.scale * (0.92 + random() * 0.16);
        petalTransform.scale.setScalar(scale);
        petalTransform.updateMatrix();
        const instance = blossomIndex * 5 + petalIndex;
        petalMesh.setMatrixAt(instance, petalTransform.matrix);
        color
          .copy(baseColor)
          .offsetHSL(
            (random() - 0.5) * 0.022,
            (random() - 0.5) * 0.07,
            (random() - 0.5) * 0.12,
          );
        petalMesh.setColorAt(instance, color);
      }
      transform.position.copy(blossomPosition).add(new THREE.Vector3(0, 0.012, 0.012));
      transform.quaternion.copy(bloomQuaternion);
      transform.scale.setScalar(slot.scale);
      transform.updateMatrix();
      centerMesh.setMatrixAt(blossomIndex, transform.matrix);
      centerMesh.setColorAt(blossomIndex, centerColor);
    });
    petalMesh.instanceMatrix.needsUpdate = true;
    centerMesh.instanceMatrix.needsUpdate = true;
    pedicelMesh.instanceMatrix.needsUpdate = true;
    if (petalMesh.instanceColor) petalMesh.instanceColor.needsUpdate = true;
    if (centerMesh.instanceColor) centerMesh.instanceColor.needsUpdate = true;
    petalMesh.userData.instanceEntryIds = blossomEntryIds;
    centerMesh.userData.instanceEntryIds = blossomEntryIds;
    root.add(pedicelMesh, petalMesh, centerMesh);
  }

  if (buds.length > 0) {
    const budMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.075, 1),
      budMaterial,
      buds.length,
    );
    budMesh.name = "Sakura buds";
    const transform = new THREE.Object3D();
    const budStemMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(1, 1, 1, 5, 1),
      barkMaterial,
      buds.length,
    );
    budStemMesh.name = "Bud pedicels";
    const budColor = new THREE.Color();
    const budEntryIds: Array<string | null> = [];
    buds.forEach((slot, index) => {
      setCylinderBetween(
        transform,
        vector(slot.anchor),
        vector(slot.position),
        0.008,
      );
      budStemMesh.setMatrixAt(index, transform.matrix);
      transform.position.fromArray(slot.position);
      transform.rotation.set(0.2, slot.seed * 0.0001, -0.12);
      transform.scale.set(0.72, 1.12, 0.72);
      transform.updateMatrix();
      budMesh.setMatrixAt(index, transform.matrix);
      budColor.set(index % 3 === 0 ? "#d39aac" : "#c8879a");
      budMesh.setColorAt(index, budColor);
      const binding =
        index >= pendingBuds.length
          ? budBindings[index - pendingBuds.length]
          : undefined;
      budEntryIds.push(binding?.entryId ?? null);
      if (binding) memoryPositions[binding.entryId] = slot.position;
    });
    budMesh.instanceMatrix.needsUpdate = true;
    budStemMesh.instanceMatrix.needsUpdate = true;
    if (budMesh.instanceColor) budMesh.instanceColor.needsUpdate = true;
    budMesh.userData.instanceEntryIds = budEntryIds;
    root.add(budStemMesh, budMesh);
  }

  if (leaves.length > 0) {
    const leafMesh = new THREE.InstancedMesh(
      createLeafGeometry(),
      leafMaterial,
      leaves.length,
    );
    leafMesh.name = "Emerging Sakura leaves";
    leafMesh.castShadow = options.castShadow ?? true;
    const petioleMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(1, 1, 1, 5, 1),
      barkMaterial,
      leaves.length,
    );
    petioleMesh.name = "Leaf petioles";
    const transform = new THREE.Object3D();
    const leafColor = new THREE.Color();
    const leafEntryIds: Array<string | null> = [];
    leaves.forEach((slot, index) => {
      const random = seededUnit(slot.seed);
      setCylinderBetween(
        transform,
        vector(slot.anchor),
        vector(slot.position),
        0.008,
      );
      petioleMesh.setMatrixAt(index, transform.matrix);
      transform.position.fromArray(slot.position);
      if (slot.id.startsWith("leaf-trunk")) {
        const side = index % 2 === 0 ? -1 : 1;
        transform.rotation.set(-0.12, side * 0.28, side * 0.88);
      } else {
        transform.rotation.set(
          -0.2 + random() * 0.4,
          random() * Math.PI * 2,
          -0.7 + random() * 1.4,
        );
      }
      transform.scale.setScalar(slot.scale);
      transform.updateMatrix();
      leafMesh.setMatrixAt(index, transform.matrix);
      leafColor.set(
        index % 4 === 0
          ? "#ad966b"
          : index % 3 === 0
            ? "#84906a"
            : "#99a278",
      );
      leafMesh.setColorAt(index, leafColor);
      const binding = leafBindingBySlot.get(index);
      leafEntryIds.push(binding?.entryId ?? null);
      if (binding) memoryPositions[binding.entryId] = slot.position;
    });
    leafMesh.instanceMatrix.needsUpdate = true;
    petioleMesh.instanceMatrix.needsUpdate = true;
    if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
    leafMesh.userData.instanceEntryIds = leafEntryIds;
    root.add(petioleMesh, leafMesh);
  }

  root.userData.growthContract = {
    totalGrowthUnits: units,
    cappedStructuralUnits: cappedUnits,
    maximumStructuralUnits: MAX_GROWTH_UNITS,
    scoreUnits: [1, 2, 4, 6],
    structuralMilestones: { twig: 12, scaffold: 48 },
    monotonic: true,
    parentFirst: true,
    blueprint: GROWTH_SAKURA_BLUEPRINT,
  };
  root.userData.sculptRuntime = {
    visibleBranchContracts,
    blossomEntryIds,
    memoryPositions,
    maximumBranchCount: BRANCH_BLUEPRINT.length,
    maximumBlossomSlots: ORGAN_SLOTS.blossoms.length,
    maximumLeafSlots: ORGAN_SLOTS.leaves.length,
    maximumInteractiveMemories: MAX_INTERACTIVE_MEMORIES,
    visibleMemoryCount: Object.keys(memoryPositions).length,
  };
  return root;
}

export function growthSakuraCountsAt(totalGrowthUnits: number): {
  structuralUnits: number;
  branches: number;
  blossoms: number;
  leaves: number;
  buds: number;
} {
  const units = Math.max(0, Math.floor(totalGrowthUnits));
  const capped = Math.min(units, MAX_GROWTH_UNITS);
  return {
    structuralUnits: capped,
    branches: BRANCH_BLUEPRINT.filter(
      (branch) => branchProgress(branch, capped) > 0.015,
    ).length,
    blossoms: ORGAN_SLOTS.blossoms.filter(
      (slot) => slot.unlockUnit <= capped && organHasParentContact(slot, capped),
    ).length,
    leaves: ORGAN_SLOTS.leaves.filter(
      (slot) => slot.unlockUnit <= capped && organHasParentContact(slot, capped),
    ).length,
    buds: ORGAN_SLOTS.blossoms.filter(
      (slot) =>
        slot.unlockUnit > capped &&
        slot.unlockUnit - capped <= 6 &&
        organHasParentContact(slot, capped),
    ).length,
  };
}
