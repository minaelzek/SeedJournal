"use client";
/* eslint-disable react-hooks/immutability -- React Three Fiber frame callbacks intentionally mutate Three objects. */

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { branchRadiusAt, sampleCubic, seededRandom } from "./topology";
import type {
  CubicBranch,
  FoliageNode,
  TreeTopology,
} from "./types";
import type { GardenMaterialPalette } from "./materials";

const UP = new THREE.Vector3(0, 1, 0);
const BRANCH_SUBDIVISIONS = 7;

interface BranchInstancesProps {
  branches: CubicBranch[];
  palette: GardenMaterialPalette;
}

function BranchInstances({ branches, palette }: BranchInstancesProps) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const pieces = useMemo(
    () =>
      branches.flatMap((branch) =>
        Array.from({ length: BRANCH_SUBDIVISIONS }, (_, index) => ({
          branch,
          start: index / BRANCH_SUBDIVISIONS,
          end: (index + 1) / BRANCH_SUBDIVISIONS,
        })),
      ),
    [branches],
  );

  useLayoutEffect(() => {
    if (!ref.current) return;
    const transform = new THREE.Object3D();
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    const direction = new THREE.Vector3();
    pieces.forEach((piece, index) => {
      from.fromArray(sampleCubic(piece.branch, piece.start));
      to.fromArray(sampleCubic(piece.branch, piece.end));
      direction.subVectors(to, from);
      const length = direction.length();
      transform.position.copy(from).addScaledVector(direction, 0.5);
      transform.quaternion.setFromUnitVectors(UP, direction.normalize());
      const radius = branchRadiusAt(
        piece.branch,
        (piece.start + piece.end) * 0.5,
      );
      transform.scale.set(radius, length, radius);
      transform.updateMatrix();
      ref.current?.setMatrixAt(index, transform.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [pieces]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, pieces.length]}>
      <cylinderGeometry args={[1, 1, 1, 7, 1, false]} />
      <meshStandardMaterial
        color={palette.trunk}
        roughness={0.93}
        metalness={0}
      />
    </instancedMesh>
  );
}

interface FoliageInstancesProps {
  nodes: FoliageNode[];
  palette: GardenMaterialPalette;
  reducedMotion: boolean;
  selectedEntryId?: string | null;
  onSelectEntry?: (entryId: string) => void;
}

function FoliageInstances({
  nodes,
  palette,
  reducedMotion,
  selectedEntryId,
  onSelectEntry,
}: FoliageInstancesProps) {
  const leafRef = useRef<THREE.InstancedMesh>(null);
  const blossomRef = useRef<THREE.InstancedMesh>(null);
  const luminousRef = useRef<THREE.InstancedMesh>(null);
  const latestSequence = useMemo(
    () => Math.max(0, ...nodes.map((node) => node.sequence)),
    [nodes],
  );
  const previousSequence = useRef(latestSequence);
  const bornAt = useRef(new Map<string, number>());
  const [hoveredEntryId, setHoveredEntryId] = useState<string | null>(null);

  const groups = useMemo(
    () => ({
      leaves: nodes.filter((node) => node.kind === "leaf"),
      blossoms: nodes.filter(
        (node) => node.kind === "bud" || node.kind === "blossom",
      ),
      luminous: nodes.filter((node) => node.kind === "luminous-blossom"),
    }),
    [nodes],
  );

  useLayoutEffect(() => {
    if (latestSequence > previousSequence.current) {
      const time = performance.now();
      nodes.forEach((node) => {
        if (node.sequence > previousSequence.current) bornAt.current.set(node.id, time);
      });
      previousSequence.current = latestSequence;
    }
  }, [latestSequence, nodes]);

  useFrame(({ clock }) => {
    const now = performance.now();
    const transform = new THREE.Object3D();
    const update = (
      mesh: THREE.InstancedMesh | null,
      instances: FoliageNode[],
      leaf: boolean,
    ) => {
      if (!mesh) return;
      let hasGrowingNode = false;
      instances.forEach((node, index) => {
        const born = bornAt.current.get(node.id);
        const elapsed = born ? now - born : Number.POSITIVE_INFINITY;
        const duration =
          node.kind === "leaf" ? 1100 : node.kind === "bud" ? 1300 : 1850;
        const rawProgress = reducedMotion
          ? Math.min(1, elapsed / 150)
          : Math.min(1, elapsed / duration);
        const progress = 1 - Math.pow(1 - rawProgress, 3);
        if (progress < 1) hasGrowingNode = true;
        const breeze = reducedMotion
          ? 0
          : Math.sin(clock.elapsedTime * 0.72 + index * 0.91) * 0.035;
        transform.position.fromArray(node.position);
        transform.rotation.set(
          node.rotation[0] + breeze,
          node.rotation[1],
          node.rotation[2] + breeze * 0.6,
        );
        const selected =
          node.entryId !== null &&
          (node.entryId === selectedEntryId || node.entryId === hoveredEntryId);
        const scale = node.scale * progress * (selected ? 1.16 : 1);
        transform.scale.set(
          leaf ? scale * 0.66 : scale,
          leaf ? scale * 1.65 : scale,
          leaf ? scale * 0.38 : scale * 0.72,
        );
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (!hasGrowingNode) {
        instances.forEach((node) => bornAt.current.delete(node.id));
      }
    };

    update(leafRef.current, groups.leaves, true);
    update(blossomRef.current, groups.blossoms, false);
    update(luminousRef.current, groups.luminous, false);
  });

  const eventHandlers = (instances: FoliageNode[]) => ({
    onPointerOver: (event: { stopPropagation: () => void; instanceId?: number }) => {
      const node =
        event.instanceId === undefined ? undefined : instances[event.instanceId];
      if (!node?.entryId) return;
      event.stopPropagation();
      setHoveredEntryId(node.entryId);
      document.body.style.cursor = "pointer";
    },
    onPointerOut: () => {
      setHoveredEntryId(null);
      document.body.style.cursor = "";
    },
    onClick: (event: { stopPropagation: () => void; instanceId?: number }) => {
      const node =
        event.instanceId === undefined ? undefined : instances[event.instanceId];
      if (!node?.entryId) return;
      event.stopPropagation();
      onSelectEntry?.(node.entryId);
    },
  });

  return (
    <>
      <instancedMesh
        ref={leafRef}
        args={[undefined, undefined, groups.leaves.length]}
        {...eventHandlers(groups.leaves)}
      >
        <sphereGeometry args={[0.18, 7, 5]} />
        <meshStandardMaterial color={palette.leaf} roughness={0.82} />
      </instancedMesh>
      <instancedMesh
        ref={blossomRef}
        args={[undefined, undefined, groups.blossoms.length]}
        {...eventHandlers(groups.blossoms)}
      >
        <dodecahedronGeometry args={[0.15, 1]} />
        <meshStandardMaterial
          color={palette.blossom}
          roughness={0.64}
          emissive={palette.blossomShadow}
          emissiveIntensity={0.06}
        />
      </instancedMesh>
      <instancedMesh
        ref={luminousRef}
        args={[undefined, undefined, groups.luminous.length]}
        {...eventHandlers(groups.luminous)}
      >
        <dodecahedronGeometry args={[0.18, 1]} />
        <meshStandardMaterial
          color={palette.blossomLight}
          roughness={0.55}
          emissive={palette.blossom}
          emissiveIntensity={0.48}
        />
      </instancedMesh>
    </>
  );
}

interface PetalFieldProps {
  count: number;
  palette: GardenMaterialPalette;
  reducedMotion: boolean;
  seed: string;
}

function PetalField({
  count,
  palette,
  reducedMotion,
  seed,
}: PetalFieldProps) {
  const points = useRef<THREE.Points>(null);
  const initial = useMemo(() => {
    const random = seededRandom(`petals:${seed}`);
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = (random() - 0.5) * 10;
      positions[index * 3 + 1] = random() * 8 - 3;
      positions[index * 3 + 2] = (random() - 0.5) * 5;
    }
    return positions;
  }, [count, seed]);

  useFrame((_state, delta) => {
    if (reducedMotion || !points.current) return;
    const positions = points.current.geometry.attributes.position
      .array as Float32Array;
    for (let index = 0; index < positions.length; index += 3) {
      positions[index] += delta * 0.045;
      positions[index + 1] -= delta * (0.08 + (index % 11) * 0.003);
      if (positions[index + 1] < -3.2) positions[index + 1] = 4.8;
      if (positions[index] > 5) positions[index] = -5;
    }
    points.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={points} frustumCulled>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[initial, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={palette.blossomLight}
        size={0.035}
        transparent
        opacity={0.46}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

interface SakuraTreeProps {
  topology: TreeTopology;
  palette: GardenMaterialPalette;
  petalCount: number;
  rootSeed: string;
  reducedMotion: boolean;
  selectedEntryId?: string | null;
  onSelectEntry?: (entryId: string) => void;
}

export function SakuraTree({
  topology,
  palette,
  petalCount,
  rootSeed,
  reducedMotion,
  selectedEntryId,
  onSelectEntry,
}: SakuraTreeProps) {
  return (
    <group position={[0, -0.2, 0]}>
      <BranchInstances branches={topology.branches} palette={palette} />
      <FoliageInstances
        nodes={topology.foliage}
        palette={palette}
        reducedMotion={reducedMotion}
        selectedEntryId={selectedEntryId}
        onSelectEntry={onSelectEntry}
      />
      <PetalField
        count={petalCount}
        palette={palette}
        reducedMotion={reducedMotion}
        seed={rootSeed}
      />
    </group>
  );
}
