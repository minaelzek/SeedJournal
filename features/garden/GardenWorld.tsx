"use client";
/* eslint-disable react-hooks/immutability -- React Three Fiber frame callbacks intentionally mutate Three objects. */

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { TreeSnapshot } from "@/lib/contracts";
import { readGardenMaterialPalette } from "./materials";
import { SakuraTree } from "./SakuraTree";
import type { TreeTopology } from "./types";

interface GardenWorldProps {
  snapshot: TreeSnapshot;
  topology: TreeTopology;
  petalCount: number;
  reducedMotion: boolean;
  selectedEntryId?: string | null;
  onSelectEntry?: (entryId: string) => void;
  onSustainedSlowFrameRate?: () => void;
}

export function GardenWorld({
  snapshot,
  topology,
  petalCount,
  reducedMotion,
  selectedEntryId,
  onSelectEntry,
  onSustainedSlowFrameRate,
}: GardenWorldProps) {
  const palette = useMemo(() => readGardenMaterialPalette(), []);
  const { camera, gl, pointer } = useThree();
  const frameTimes = useRef<number[]>([]);
  const slowReported = useRef(false);

  useEffect(() => {
    gl.setClearColor(new THREE.Color(palette.void), 0);
  }, [gl, palette.void]);

  useFrame((_state, delta) => {
    if (!reducedMotion) {
      const targetX = pointer.x * 0.15;
      const targetY = 0.25 + pointer.y * 0.08;
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.025);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 0.025);
      camera.lookAt(0, 0.2, 0);
    }

    if (!slowReported.current) {
      frameTimes.current.push(delta);
      if (frameTimes.current.length > 120) frameTimes.current.shift();
      if (frameTimes.current.length === 120) {
        const ordered = [...frameTimes.current].sort((a, b) => a - b);
        const median = ordered[Math.floor(ordered.length / 2)];
        if (1 / median < 28) {
          slowReported.current = true;
          onSustainedSlowFrameRate?.();
        }
      }
    }
  });

  return (
    <>
      <fog attach="fog" args={[palette.void, 8, 17]} />
      <ambientLight color={palette.moonMuted} intensity={0.78} />
      <directionalLight
        color={palette.moon}
        intensity={2.2}
        position={[4, 7, 5]}
      />
      <pointLight
        color={palette.blossom}
        intensity={5}
        distance={8}
        position={[-2.5, 2.6, 1.4]}
      />
      <mesh position={[3.4, 2.9, -2.8]} aria-hidden>
        <sphereGeometry args={[0.68, 28, 28]} />
        <meshBasicMaterial color={palette.moon} toneMapped={false} />
      </mesh>
      <mesh
        position={[0, -3.23, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[4.7, 56]} />
        <meshStandardMaterial
          color={palette.indigo}
          roughness={1}
          transparent
          opacity={0.82}
        />
      </mesh>
      <SakuraTree
        topology={topology}
        palette={palette}
        petalCount={petalCount}
        rootSeed={snapshot.rootSeed}
        reducedMotion={reducedMotion}
        selectedEntryId={selectedEntryId}
        onSelectEntry={onSelectEntry}
      />
    </>
  );
}
