"use client";
/* eslint-disable react-hooks/immutability -- React Three Fiber frame callbacks intentionally mutate Three objects. */

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { GardenWeatherKind } from "@/features/reflection";
import type { TreeGrowthDelta, TreeSnapshot } from "@/lib/contracts";
import {
  gardenCameraDistance,
  gardenLookAtY,
  gardenOrganPresentationScale,
} from "./art/framing";
import { boundsForGarden, stageForGarden } from "./art/stage";
import { readGardenMaterialPalette } from "./materials";
import { gardenLifeForWeather } from "./lifeState";
import { SakuraTree } from "./SakuraTree";
import type { QualityTier, TreeTopology } from "./types";

interface GardenWorldProps {
  snapshot: TreeSnapshot;
  topology: TreeTopology;
  motionMode: "active" | "ambient" | "paused";
  weatherKind: GardenWeatherKind;
  growthDelta?: TreeGrowthDelta;
  returnBudEntryId?: string;
  quality: QualityTier;
  foliageLimit: number;
  petalCount: number;
  reducedMotion: boolean;
  selectedEntryId?: string | null;
  onSelectEntry?: (entryId: string) => void;
  onSustainedSlowFrameRate?: () => void;
}

export function GardenWorld({
  snapshot,
  topology,
  motionMode,
  weatherKind,
  growthDelta,
  returnBudEntryId,
  quality,
  foliageLimit,
  petalCount,
  reducedMotion,
  selectedEntryId,
  onSelectEntry,
  onSustainedSlowFrameRate,
}: GardenWorldProps) {
  const palette = useMemo(() => readGardenMaterialPalette(), []);
  const life = gardenLifeForWeather(weatherKind);
  const stage = useMemo(
    () => stageForGarden(snapshot, topology),
    [snapshot, topology],
  );
  const bounds = useMemo(() => boundsForGarden(topology, stage), [stage, topology]);
  const { camera, gl, invalidate, pointer, size } = useThree();
  const portraitTree =
    size.width < 600 && (stage === "established" || stage === "mature");
  const organPresentationScale = gardenOrganPresentationScale(
    stage,
    size.width,
  );
  const frameTimes = useRef<number[]>([]);
  const slowReported = useRef(false);
  const cameraInitialized = useRef(false);
  const desiredPosition = useMemo(() => new THREE.Vector3(), []);
  const desiredLookAt = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    gl.setClearColor(new THREE.Color(palette.void), 0);
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.16;
  }, [gl, palette.void]);

  useEffect(() => {
    if (motionMode !== "ambient" || reducedMotion) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") invalidate();
    }, 80);
    return () => window.clearInterval(interval);
  }, [invalidate, motionMode, reducedMotion]);

  useEffect(() => {
    const distance = gardenCameraDistance({
      stage,
      boundsRadius: bounds.radius,
      width: size.width,
      height: size.height,
    });
    desiredLookAt.fromArray(bounds.center);
    desiredLookAt.y = gardenLookAtY({
      stage,
      totalGrowthUnits: topology.totalGrowthUnits,
      centerY: bounds.center[1],
      boundsRadius: bounds.radius,
      width: size.width,
    });
    desiredPosition.set(
      bounds.center[0] + bounds.radius * 0.09,
      desiredLookAt.y + bounds.radius * 0.025,
      distance,
    );
    if (reducedMotion || !cameraInitialized.current) {
      camera.position.copy(desiredPosition);
      camera.lookAt(desiredLookAt);
      cameraInitialized.current = true;
    }
  }, [
    bounds.center,
    bounds.radius,
    camera,
    desiredLookAt,
    desiredPosition,
    reducedMotion,
    size.height,
    size.width,
    stage,
    topology.totalGrowthUnits,
  ]);

  useFrame((_state, delta) => {
    if (!reducedMotion) {
      const targetX = desiredPosition.x + pointer.x * bounds.radius * 0.012;
      const targetY = desiredPosition.y + pointer.y * bounds.radius * 0.006;
      camera.position.x = THREE.MathUtils.damp(camera.position.x, targetX, 3.8, delta);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, targetY, 3.8, delta);
      camera.position.z = THREE.MathUtils.damp(
        camera.position.z,
        desiredPosition.z,
        3.8,
        delta,
      );
      camera.lookAt(desiredLookAt);
    }

    if (motionMode === "active" && !slowReported.current) {
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
      <fog
        attach="fog"
        args={[
          palette.void,
          portraitTree ? 30 : 13 + life.fogNearOffset,
          portraitTree ? 60 : 28 + life.fogFarOffset,
        ]}
      />
      <hemisphereLight
        args={[
          palette.moon,
          palette.ground,
          (portraitTree ? 1.72 : 1.18) * life.lightScale,
        ]}
        position={[0, 7, 0]}
      />
      <directionalLight
        color={palette.moon}
        intensity={3.4 * life.lightScale}
        position={[5.5, 8.5, 6]}
      />
      <directionalLight
        color={palette.moonMuted}
        intensity={(portraitTree ? 1.4 : 0.58) * life.lightScale}
        position={[-5, 1.5, -3]}
      />
      <SakuraTree
        topology={topology}
        growthDelta={growthDelta}
        returnBudEntryId={returnBudEntryId}
        stage={stage}
        palette={palette}
        petalCount={petalCount}
        foliageLimit={foliageLimit}
        organPresentationScale={organPresentationScale}
        quality={quality}
        rootSeed={snapshot.rootSeed}
        reducedMotion={reducedMotion}
        weatherKind={weatherKind}
        selectedEntryId={selectedEntryId}
        onSelectEntry={onSelectEntry}
      />
    </>
  );
}
