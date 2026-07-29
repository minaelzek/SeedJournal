"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { TreeStage } from "@/lib/contracts";
import type { GardenMaterialPalette } from "./materials";
import type { FoliageNode, TreeTopology } from "./types";
import { usesTreeRootContact } from "./art/stage";
import {
  buildBotanicalBranchGeometry,
  buildBudGeometry,
  buildCherryStoneGeometry,
  buildNotchedPetalGeometry,
  buildPointedLeafGeometry,
  buildRadicleGeometry,
  buildSakuraBlossomGeometry,
  buildSeedCreaseGeometry,
  buildStamenClusterGeometry,
  collectBarkLenticels,
  foliageFromOrganBuffers,
  geometryFromBranchBuffers,
  organWindWeight,
} from "./art/botanicalGeometry";
import {
  terminalBranchIndexes,
  visibleBranchIndexes,
} from "./art/branchPresentation";
import { seededRandom } from "./topology";

const WORLD_UP = new THREE.Vector3(0, 1, 0);

interface BranchSystemProps {
  topology: TreeTopology;
  palette: GardenMaterialPalette;
  quality: "high" | "balanced" | "low";
}

function BranchSystem({ topology, palette, quality }: BranchSystemProps) {
  const visibleIndices = useMemo(
    () => visibleBranchIndexes(topology),
    [topology],
  );
  const geometry = useMemo(
    () => {
      if (topology.algorithmVersion === 2 && topology.branchBuffers) {
        return geometryFromBranchBuffers(
          topology.branchBuffers,
          visibleIndices,
        );
      }
      return buildBotanicalBranchGeometry(
        topology.branches,
        quality === "low" ? 7 : quality === "balanced" ? 9 : 11,
        quality === "low" ? 8 : quality === "balanced" ? 12 : 16,
      );
    },
    [quality, topology, visibleIndices],
  );
  const lenticels = useMemo(
    () =>
      collectBarkLenticels(
        topology.branches,
        quality === "low" ? 24 : quality === "balanced" ? 54 : 80,
      ),
    [quality, topology.branches],
  );
  const lenticelRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = lenticelRef.current;
    if (!mesh) return;
    const transform = new THREE.Object3D();
    lenticels.forEach((lenticel, index) => {
      transform.position.fromArray(lenticel.position);
      transform.quaternion.fromArray(lenticel.quaternion);
      transform.scale.fromArray(lenticel.scale);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [lenticels]);

  if (topology.branches.length === 0) return null;

  return (
    <>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial
          color={palette.bark}
          vertexColors
          roughness={0.96}
          metalness={0}
          emissive={palette.bark}
          emissiveIntensity={0.2}
          envMapIntensity={0.18}
        />
      </mesh>
      <instancedMesh
        ref={lenticelRef}
        args={[undefined, undefined, lenticels.length]}
        frustumCulled
      >
        <circleGeometry args={[1, 10]} />
        <meshStandardMaterial
          color={palette.barkLenticel}
          roughness={1}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </instancedMesh>
    </>
  );
}

function BranchTips({
  topology,
  palette,
}: {
  topology: TreeTopology;
  palette: GardenMaterialPalette;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const terminals = useMemo(
    () => terminalBranchIndexes(topology),
    [topology],
  );

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const transform = new THREE.Object3D();
    const tangent = new THREE.Vector3();
    terminals.forEach((branchIndex, instanceIndex) => {
      const branch = topology.branches[branchIndex];
      tangent
        .set(
          branch.end[0] - branch.controlB[0],
          branch.end[1] - branch.controlB[1],
          branch.end[2] - branch.controlB[2],
        )
        .normalize();
      const length = Math.max(0.045, branch.radiusEnd * 3.2);
      transform.position
        .fromArray(branch.end)
        .addScaledVector(tangent, length * 0.5);
      transform.quaternion.setFromUnitVectors(WORLD_UP, tangent);
      transform.scale.set(
        branch.radiusEnd * 1.015,
        length,
        branch.radiusEnd * 1.015,
      );
      transform.updateMatrix();
      mesh.setMatrixAt(instanceIndex, transform.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [terminals, topology.branches]);

  if (terminals.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, terminals.length]}
      frustumCulled
    >
      <coneGeometry args={[1, 1, 10, 1, false]} />
      <meshStandardMaterial
        color={palette.bark}
        roughness={0.97}
        emissive={palette.bark}
        emissiveIntensity={0.18}
      />
    </instancedMesh>
  );
}

function RootContact({
  stage,
  palette,
}: {
  stage: TreeStage;
  palette: GardenMaterialPalette;
}) {
  if (!usesTreeRootContact(stage)) return null;
  return (
    <mesh
      position={[0, -2.77, -0.05]}
      rotation={[-Math.PI / 2, 0, 0]}
      scale={[1.16, 0.42, 1]}
    >
      <circleGeometry args={[1, 48]} />
      <meshBasicMaterial
        color={palette.ground}
        transparent
        opacity={0.68}
        depthWrite={false}
      />
    </mesh>
  );
}

type OrganKind = "radicle" | "leaf" | "bud" | "blossom";

interface OrganInstancesProps {
  nodes: FoliageNode[];
  kind: OrganKind;
  palette: GardenMaterialPalette;
  reducedMotion: boolean;
  selectedEntryId?: string | null;
  hoveredEntryId?: string | null;
  onHoverEntry: (entryId: string | null) => void;
  onSelectEntry?: (entryId: string) => void;
  memoryEntryByRenderId: ReadonlyMap<number, string>;
  presentationScale: number;
}

function OrganInstances({
  nodes,
  kind,
  palette,
  reducedMotion,
  selectedEntryId,
  hoveredEntryId,
  onHoverEntry,
  onSelectEntry,
  memoryEntryByRenderId,
  presentationScale,
}: OrganInstancesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const stamenRef = useRef<THREE.InstancedMesh>(null);
  const transform = useMemo(() => new THREE.Object3D(), []);
  const blossomGeometry = useMemo(() => buildSakuraBlossomGeometry(), []);
  const leafGeometry = useMemo(() => buildPointedLeafGeometry(), []);
  const budGeometry = useMemo(() => buildBudGeometry(), []);
  const radicleGeometry = useMemo(() => buildRadicleGeometry(), []);
  const stamenGeometry = useMemo(() => buildStamenClusterGeometry(), []);
  const baseColors = useMemo(
    () => ({
      resting: new THREE.Color(
        kind === "radicle"
          ? palette.radicle
          : kind === "leaf"
          ? palette.leaf
          : kind === "bud"
            ? palette.bud
            : palette.blossomLight,
      ),
      selected: new THREE.Color(
        kind === "radicle"
          ? palette.radicle
          : kind === "leaf"
            ? palette.leafSelected
            : palette.blossomSelected,
      ),
      stamen: new THREE.Color(palette.stamen),
    }),
    [kind, palette],
  );
  const latestSequence = useMemo(
    () => Math.max(0, ...nodes.map((node) => node.sequence)),
    [nodes],
  );
  const previousSequence = useRef(latestSequence);
  const bornAt = useRef(new Map<string, number>());
  const lastUpdate = useRef(0);

  useLayoutEffect(() => {
    if (latestSequence > previousSequence.current) {
      const now = performance.now();
      nodes.forEach((node) => {
        if (node.sequence > previousSequence.current) {
          bornAt.current.set(node.id, now);
        }
      });
      previousSequence.current = latestSequence;
    }
  }, [latestSequence, nodes]);

  const applyInstances = useCallback(
    (elapsedTime: number, now: number) => {
      const mesh = meshRef.current;
      if (!mesh) return;

      const slowBreath = Math.sin(elapsedTime * 0.19);
      const gust = reducedMotion
        ? 0
        : Math.pow(Math.max(0, slowBreath - 0.72) / 0.28, 2);

      nodes.forEach((node, index) => {
        const born = bornAt.current.get(node.id);
        const elapsed = born ? now - born : Number.POSITIVE_INFINITY;
        const duration =
          kind === "radicle"
            ? 980
            : kind === "leaf"
              ? 1080
              : kind === "bud"
                ? 1320
                : 1900;
        const linearProgress = reducedMotion
          ? Math.min(1, elapsed / 150)
          : Math.min(1, elapsed / duration);
        const growth = 1 - Math.pow(1 - linearProgress, 3);
        if (linearProgress >= 1) bornAt.current.delete(node.id);

        const weight = organWindWeight(node);
        const phase = index * 0.37 + node.position[0] * 0.52;
        const wind = gust * weight * (0.045 + Math.sin(phase) * 0.016);
        transform.position.fromArray(node.position);
        transform.rotation.set(
          node.rotation[0] + wind * 0.4,
          node.rotation[1] + wind,
          node.rotation[2] - wind * 0.65,
        );
        const baseScale =
          node.scale *
          growth *
          presentationScale *
          (kind === "radicle"
            ? 0.52
            : kind === "leaf"
              ? 0.36
              : kind === "bud"
                ? 0.28
                : 0.19);
        if (kind === "leaf") {
          transform.scale.set(baseScale * 0.72, baseScale * 1.24, baseScale);
        } else if (kind === "bud") {
          transform.scale.setScalar(baseScale);
        } else {
          transform.scale.setScalar(baseScale);
        }
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);

        const memoryEntry = memoryEntryByRenderId.get(node.memoryRenderId);
        const isLit =
          memoryEntry !== undefined &&
          (memoryEntry === selectedEntryId || memoryEntry === hoveredEntryId);
        mesh.setColorAt(index, isLit ? baseColors.selected : baseColors.resting);
        if (kind === "blossom" && stamenRef.current) {
          stamenRef.current.setMatrixAt(index, transform.matrix);
          stamenRef.current.setColorAt(index, baseColors.stamen);
        }
      });

      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (stamenRef.current) {
        stamenRef.current.instanceMatrix.needsUpdate = true;
        if (stamenRef.current.instanceColor) {
          stamenRef.current.instanceColor.needsUpdate = true;
        }
      }
    },
    [
      baseColors,
      hoveredEntryId,
      kind,
      nodes,
      memoryEntryByRenderId,
      reducedMotion,
      selectedEntryId,
      transform,
      presentationScale,
    ],
  );

  useLayoutEffect(() => {
    applyInstances(0, performance.now());
  }, [applyInstances]);

  useFrame(({ clock }) => {
    if (reducedMotion && bornAt.current.size === 0) return;
    const now = performance.now();
    if (now - lastUpdate.current < 32) return;
    lastUpdate.current = now;
    applyInstances(clock.elapsedTime, now);
  });

  const nodeFromEvent = (event: { instanceId?: number }) =>
    event.instanceId === undefined ? undefined : nodes[event.instanceId];

  const handlers = {
    onPointerOver: (event: {
      stopPropagation: () => void;
      instanceId?: number;
    }) => {
      const node = nodeFromEvent(event);
      if (!node) return;
      const entryId = memoryEntryByRenderId.get(node.memoryRenderId);
      if (!entryId) return;
      event.stopPropagation();
      onHoverEntry(entryId);
      document.body.style.cursor = "pointer";
    },
    onPointerOut: () => {
      onHoverEntry(null);
      document.body.style.cursor = "";
    },
    onClick: (event: {
      stopPropagation: () => void;
      instanceId?: number;
    }) => {
      const node = nodeFromEvent(event);
      if (!node) return;
      const entryId = memoryEntryByRenderId.get(node.memoryRenderId);
      if (!entryId) return;
      event.stopPropagation();
      onSelectEntry?.(entryId);
    },
  };

  const geometry =
    kind === "radicle"
      ? radicleGeometry
      : kind === "leaf"
      ? leafGeometry
      : kind === "bud"
        ? budGeometry
        : blossomGeometry;

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[geometry, undefined, nodes.length]}
        {...handlers}
        frustumCulled
      >
        <meshStandardMaterial
          color={palette.materialNeutral}
          vertexColors
          side={THREE.DoubleSide}
          roughness={
            kind === "radicle" ? 0.94 : kind === "leaf" ? 0.79 : 0.73
          }
          metalness={0}
          emissive={
            kind === "radicle"
              ? palette.radicle
              : kind === "leaf"
                ? palette.leaf
                : kind === "bud"
                  ? palette.bud
                  : palette.blossom
          }
          emissiveIntensity={kind === "radicle" ? 0.12 : 0.22}
        />
      </instancedMesh>
      {kind === "blossom" ? (
        <instancedMesh
          ref={stamenRef}
          args={[stamenGeometry, undefined, nodes.length]}
          frustumCulled
        >
          <meshStandardMaterial
            vertexColors
            color={palette.stamen}
            roughness={0.82}
            side={THREE.DoubleSide}
          />
        </instancedMesh>
      ) : null}
    </>
  );
}

function SeedSculpture({
  stage,
  palette,
}: {
  stage: TreeStage;
  palette: GardenMaterialPalette;
}) {
  const stoneGeometry = useMemo(() => buildCherryStoneGeometry(), []);
  const creaseGeometry = useMemo(() => buildSeedCreaseGeometry(), []);
  if (stage !== "seed" && stage !== "sprout") return null;
  return (
    <group position={[-0.02, -2.94, 0.02]}>
      <mesh
        position={[0, -0.205, -0.05]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[0.42, 0.23, 1]}
      >
        <circleGeometry args={[1, 36]} />
        <meshBasicMaterial
          color={palette.ground}
          transparent
          opacity={0.62}
          depthWrite={false}
        />
      </mesh>
      <mesh
        position={[0, -0.196, -0.08]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[0.36, 0.2, 0.5]}
      >
        <torusGeometry args={[0.8, 0.055, 6, 34]} />
        <meshStandardMaterial
          color={palette.soilRim}
          roughness={1}
          transparent
          opacity={0.5}
        />
      </mesh>
      <group rotation={[0.05, 0.18, -0.16]} scale={[0.22, 0.29, 0.16]}>
        <mesh castShadow geometry={stoneGeometry}>
          <meshStandardMaterial
            color={palette.seed}
            roughness={0.96}
            metalness={0}
            emissive={palette.seed}
            emissiveIntensity={0.08}
          />
        </mesh>
        <mesh geometry={creaseGeometry}>
          <meshStandardMaterial
            color={palette.seedCrease}
            roughness={1}
            transparent
            opacity={0.56}
          />
        </mesh>
      </group>
    </group>
  );
}

interface FallingPetalsProps {
  count: number;
  palette: GardenMaterialPalette;
  reducedMotion: boolean;
  seed: string;
}

function FallingPetals({
  count,
  palette,
  reducedMotion,
  seed,
}: FallingPetalsProps) {
  const actualCount = reducedMotion ? 0 : Math.min(6, count);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const petals = useMemo(() => {
    const random = seededRandom(`quiet-petals:${seed}`);
    return Array.from({ length: actualCount }, (_, index) => ({
      x: (random() - 0.5) * 7,
      y: random() * 6 - 1,
      z: (random() - 0.5) * 2.8,
      drift: 0.07 + random() * 0.07,
      fall: 0.045 + random() * 0.055,
      phase: index * 1.37 + random() * 3,
    }));
  }, [actualCount, seed]);
  const geometry = useMemo(() => buildNotchedPetalGeometry(), []);
  const transform = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }, delta) => {
    const mesh = meshRef.current;
    if (!mesh || actualCount === 0) return;
    petals.forEach((petal, index) => {
      petal.x += delta * petal.drift;
      petal.y -= delta * petal.fall;
      if (petal.y < -3.1) {
        petal.y = 3.8;
        petal.x = -3.5;
      }
      transform.position.set(
        petal.x + Math.sin(clock.elapsedTime * 0.21 + petal.phase) * 0.08,
        petal.y,
        petal.z,
      );
      transform.rotation.set(
        clock.elapsedTime * 0.15 + petal.phase,
        petal.phase,
        clock.elapsedTime * 0.11,
      );
      transform.scale.setScalar(0.055);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (actualCount === 0) return null;
  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, actualCount]}
      frustumCulled
    >
      <meshStandardMaterial
        color={palette.blossom}
        roughness={0.8}
        transparent
        opacity={0.7}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

function MemoryHitTargets({
  topology,
  onHoverEntry,
  onSelectEntry,
}: {
  topology: TreeTopology;
  onHoverEntry: (entryId: string | null) => void;
  onSelectEntry?: (entryId: string) => void;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const regions = useMemo(
    () => topology.memoryHitRegions ?? [],
    [topology.memoryHitRegions],
  );

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const transform = new THREE.Object3D();
    regions.forEach((region, index) => {
      transform.position.fromArray(region.position);
      transform.scale.setScalar(Math.max(0.24, region.radius * 1.65));
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [regions]);

  if (regions.length === 0) return null;
  const entryAt = (instanceId?: number) =>
    instanceId === undefined ? undefined : regions[instanceId]?.entryId;

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, regions.length]}
      onPointerOver={(event) => {
        const entryId = entryAt(event.instanceId);
        if (!entryId) return;
        event.stopPropagation();
        onHoverEntry(entryId);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        onHoverEntry(null);
        document.body.style.cursor = "";
      }}
      onClick={(event) => {
        const entryId = entryAt(event.instanceId);
        if (!entryId) return;
        event.stopPropagation();
        onSelectEntry?.(entryId);
      }}
    >
      <sphereGeometry args={[1, 8, 6]} />
      <meshBasicMaterial
        transparent
        opacity={0}
        colorWrite={false}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

interface SakuraTreeProps {
  topology: TreeTopology;
  stage: TreeStage;
  palette: GardenMaterialPalette;
  petalCount: number;
  foliageLimit: number;
  organPresentationScale: number;
  quality: "high" | "balanced" | "low";
  rootSeed: string;
  reducedMotion: boolean;
  selectedEntryId?: string | null;
  onSelectEntry?: (entryId: string) => void;
}

export function SakuraTree({
  topology,
  stage,
  palette,
  petalCount,
  foliageLimit,
  organPresentationScale,
  quality,
  rootSeed,
  reducedMotion,
  selectedEntryId,
  onSelectEntry,
}: SakuraTreeProps) {
  const [hoveredEntryId, setHoveredEntryId] = useState<string | null>(null);
  const memoryEntryByRenderId = useMemo(
    () =>
      new Map(
        (topology.memoryHitRegions ?? []).map((region) => [
          region.renderId,
          region.entryId,
        ]),
      ),
    [topology.memoryHitRegions],
  );
  const visibleNodes = useMemo(() => {
    if (topology.algorithmVersion === 2 && topology.organBuffers) {
      return foliageFromOrganBuffers(topology.organBuffers).slice(
        0,
        foliageLimit,
      );
    }
    return topology.foliage.slice(0, foliageLimit);
  }, [foliageLimit, topology]);
  const groups = useMemo(
    () => ({
      leaves: visibleNodes.filter((node) => node.kind === "leaf"),
      radicles: visibleNodes.filter((node) => node.kind === "radicle"),
      buds: visibleNodes.filter((node) => node.kind === "bud"),
      blossoms: visibleNodes.filter(
        (node) =>
          node.kind === "blossom" || node.kind === "luminous-blossom",
      ),
    }),
    [visibleNodes],
  );
  const organProps = {
    palette,
    reducedMotion,
    selectedEntryId,
    hoveredEntryId,
    onHoverEntry: setHoveredEntryId,
    onSelectEntry,
    memoryEntryByRenderId,
    presentationScale: organPresentationScale,
  };
  const selectedRegion = selectedEntryId
    ? topology.memoryHitRegions?.find(
        (region) => region.entryId === selectedEntryId,
      )
    : undefined;

  return (
    <group position={[0, 0, 0]}>
      {selectedRegion ? (
        <pointLight
          color={palette.moon}
          intensity={1.05}
          distance={1.35}
          decay={2}
          position={selectedRegion.position}
        />
      ) : null}
      <SeedSculpture stage={stage} palette={palette} />
      <RootContact stage={stage} palette={palette} />
      <BranchSystem topology={topology} palette={palette} quality={quality} />
      <BranchTips topology={topology} palette={palette} />
      <OrganInstances
        nodes={groups.radicles}
        kind="radicle"
        {...organProps}
      />
      <OrganInstances nodes={groups.leaves} kind="leaf" {...organProps} />
      <OrganInstances nodes={groups.buds} kind="bud" {...organProps} />
      <OrganInstances
        nodes={groups.blossoms}
        kind="blossom"
        {...organProps}
      />
      <MemoryHitTargets
        topology={topology}
        onHoverEntry={setHoveredEntryId}
        onSelectEntry={onSelectEntry}
      />
      <FallingPetals
        count={petalCount}
        palette={palette}
        reducedMotion={reducedMotion}
        seed={rootSeed}
      />
    </group>
  );
}
