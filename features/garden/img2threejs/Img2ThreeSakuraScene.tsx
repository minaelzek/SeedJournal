"use client";
/* eslint-disable react-hooks/immutability -- Three.js scene objects are intentionally animated in frame callbacks. */

import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { stageForGrowthUnits } from "@/features/growth";
import type { TreeSnapshot } from "@/lib/contracts";
import { GardenFallback } from "../GardenFallback";
import type { QualityTier } from "../types";
import { QUALITY_SETTINGS, useGardenPreferences } from "../useGardenPreferences";
import { GardenErrorBoundary } from "../GardenErrorBoundary";
import { createGrowthSakuraModel } from "./growthSakuraModel";
import "../garden.css";

export interface Img2ThreeSakuraSceneProps {
  snapshot: TreeSnapshot;
  quality?: QualityTier;
  motionMode?: "active" | "ambient" | "paused";
  selectedEntryId?: string | null;
  onSelectEntry?: (entryId: string) => void;
  className?: string;
}

function canUseWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2") ||
        canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl"),
    );
  } catch {
    return false;
  }
}

function disposeModel(model: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    const source = Array.isArray(object.material)
      ? object.material
      : [object.material];
    source.forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function modelEntryId(event: ThreeEvent<MouseEvent>): string | null {
  if (!(event.object instanceof THREE.InstancedMesh)) return null;
  if (event.instanceId === undefined) return null;
  const identifiers = event.object.userData.instanceEntryIds as
    | Array<string | null>
    | undefined;
  const index =
    event.object.name === "Sakura petals"
      ? Math.floor(event.instanceId / 5)
      : event.instanceId;
  return identifiers?.[index] ?? null;
}

interface SakuraModelWorldProps {
  snapshot: TreeSnapshot;
  quality: QualityTier;
  motionMode: "active" | "ambient" | "paused";
  reducedMotion: boolean;
  selectedEntryId?: string | null;
  onSelectEntry?: (entryId: string) => void;
}

function SakuraModelWorld({
  snapshot,
  quality,
  motionMode,
  reducedMotion,
  selectedEntryId,
  onSelectEntry,
}: SakuraModelWorldProps) {
  const totalGrowthUnits = useMemo(
    () => snapshot.events.reduce((total, event) => total + event.growthUnits, 0),
    [snapshot.events],
  );
  const model = useMemo(
    () =>
      createGrowthSakuraModel({
        totalGrowthUnits,
        events: snapshot.events,
        quality,
        castShadow: false,
        receiveShadow: false,
      }),
    [quality, snapshot.events, totalGrowthUnits],
  );
  const group = useRef<THREE.Group>(null);
  const { camera, gl, invalidate, size } = useThree();
  const bounds = useMemo(() => new THREE.Box3().setFromObject(model), [model]);
  const center = useMemo(() => bounds.getCenter(new THREE.Vector3()), [bounds]);
  const dimensions = useMemo(() => bounds.getSize(new THREE.Vector3()), [bounds]);
  const memoryPositions = model.userData.sculptRuntime?.memoryPositions as
    | Record<string, readonly [number, number, number]>
    | undefined;
  const memoryEvents = useMemo(
    () =>
      snapshot.events
        .filter((event) => event.entryId && event.kind.startsWith("memory_"))
        .slice(-48),
    [snapshot.events],
  );

  useEffect(() => () => disposeModel(model), [model]);

  useEffect(() => {
    gl.setClearColor(new THREE.Color("#000000"), 0);
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.04;
  }, [gl]);

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const aspect = Math.max(0.65, size.width / Math.max(1, size.height));
    camera.aspect = aspect;
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
    const verticalDistance = dimensions.y / (2 * Math.tan(verticalFov / 2));
    const horizontalDistance = dimensions.x / (2 * Math.tan(horizontalFov / 2));
    const stagePadding =
      totalGrowthUnits < 12 ? 1.5 : size.width < 600 ? 1.3 : 1.45;
    const fittedDistance =
      Math.max(verticalDistance, horizontalDistance) * stagePadding +
      dimensions.z * 0.5;
    const minimumDistance =
      totalGrowthUnits < 12
        ? 4.5
        : totalGrowthUnits < 48
          ? 9
          : totalGrowthUnits < 96
            ? 14
            : totalGrowthUnits < 192
              ? 17.5
              : 22;
    const distance = Math.max(fittedDistance, minimumDistance);
    camera.position.set(
      center.x + dimensions.x * 0.025,
      center.y,
      center.z + distance,
    );
    camera.near = 0.05;
    camera.far = Math.max(40, distance + 20);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, center, dimensions, gl, invalidate, size.height, size.width, totalGrowthUnits]);

  useFrame(({ clock }, delta) => {
    if (!group.current || reducedMotion || motionMode === "paused") return;
    const target = Math.sin(clock.elapsedTime * 0.34) * 0.012;
    group.current.rotation.y = THREE.MathUtils.damp(
      group.current.rotation.y,
      target,
      2.2,
      delta,
    );
  });

  const selectFromMesh = (event: ThreeEvent<MouseEvent>) => {
    const entryId = modelEntryId(event);
    if (!entryId || !onSelectEntry) return;
    event.stopPropagation();
    onSelectEntry(entryId);
  };

  const selectedPosition = selectedEntryId
    ? memoryPositions?.[selectedEntryId]
    : undefined;

  return (
    <>
      <hemisphereLight args={["#fff8ef", "#8a6f60", 2.1]} position={[0, 7, 0]} />
      <directionalLight color="#fff5ed" intensity={3.2} position={[5, 8, 7]} />
      <directionalLight color="#e7c5cd" intensity={1.25} position={[-6, 2, -4]} />
      <group ref={group}>
        <primitive object={model} onClick={selectFromMesh} />
        {selectedPosition ? (
          <pointLight
            color="#ffd6df"
            intensity={2.4}
            distance={1.1}
            decay={2}
            position={selectedPosition}
          />
        ) : null}
        {onSelectEntry
          ? memoryEvents.map((event) => {
              if (!event.entryId) return null;
              const position = memoryPositions?.[event.entryId];
              if (!position) return null;
              const selected = selectedEntryId === event.entryId;
              return (
                <Html
                  key={event.id}
                  center
                  position={position}
                  zIndexRange={[12, 1]}
                  style={{ pointerEvents: "auto" }}
                >
                  <button
                    type="button"
                    className="sj-img2threejs-hotspot"
                    data-selected={selected || undefined}
                    aria-label={`Open tree memory ${event.sequence}`}
                    aria-pressed={selected}
                    onClick={() => onSelectEntry(event.entryId!)}
                  >
                    <span aria-hidden="true" />
                  </button>
                </Html>
              );
            })
          : null}
      </group>
    </>
  );
}

export function Img2ThreeSakuraScene({
  snapshot,
  quality: requestedQuality,
  motionMode = "active",
  selectedEntryId,
  onSelectEntry,
  className,
}: Img2ThreeSakuraSceneProps) {
  const [contextLost, setContextLost] = useState(false);
  const preferences = useGardenPreferences(requestedQuality);
  const settings = QUALITY_SETTINGS[preferences.quality];
  const totalGrowthUnits = snapshot.events.reduce(
    (total, event) => total + event.growthUnits,
    0,
  );
  const stage = stageForGrowthUnits(totalGrowthUnits);
  const memoryCount = snapshot.events.filter(
    (event) => event.entryId && event.kind.startsWith("memory_"),
  ).length;
  const interactive = Boolean(onSelectEntry && memoryCount > 0);
  const fallback = (
    <GardenFallback
      snapshot={snapshot}
      reason={contextLost ? "context-lost" : "unsupported"}
    />
  );

  if (contextLost || (typeof window !== "undefined" && !canUseWebGL())) {
    return fallback;
  }

  return (
    <div
      className={["sj-garden-scene", className].filter(Boolean).join(" ")}
      data-quality={preferences.quality}
      data-tree-stage={stage}
      data-reduced-motion={preferences.reducedMotion || undefined}
      role={interactive ? "group" : "img"}
      aria-label={`${stage.replace("-", " ")} sakura with ${memoryCount} ${memoryCount === 1 ? "memory" : "memories"}.`}
    >
      <GardenErrorBoundary fallback={fallback}>
        <Canvas
          frameloop={
            motionMode === "active" && !preferences.reducedMotion
              ? "always"
              : "demand"
          }
          dpr={[1, settings.dpr]}
          camera={{ position: [0, 0, 10], fov: 32, near: 0.05, far: 60 }}
          gl={{
            alpha: true,
            antialias: preferences.quality !== "low",
            powerPreference: "high-performance",
          }}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener(
              "webglcontextlost",
              (event) => {
                event.preventDefault();
                setContextLost(true);
              },
              { once: true },
            );
          }}
        >
          <SakuraModelWorld
            snapshot={snapshot}
            quality={preferences.quality}
            motionMode={motionMode}
            reducedMotion={preferences.reducedMotion}
            selectedEntryId={selectedEntryId}
            onSelectEntry={onSelectEntry}
          />
        </Canvas>
      </GardenErrorBoundary>
    </div>
  );
}
