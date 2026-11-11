"use client";

/* eslint-disable react-hooks/immutability -- Three.js animation intentionally updates scene-graph transforms inside useFrame. */

import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import * as THREE from "three";

import {
  createGrowthCeremonySchedule,
  GROWTH_CEREMONY_DURATION_SECONDS,
  GROWTH_REVEAL_REDUCED_MOTION_SECONDS,
  sampleGrowthCeremony,
} from "./growthCeremony";
import type { LivingMemoryInput } from "../../growth/livingDevelopment";
import { gardenLifeForWeather } from "@/features/garden/lifeState";
import type { GardenWeatherKind } from "@/features/reflection";
import { registerWebGLContextLost } from "@/features/garden/canUseWebGL";
import {
  nearestPetalId,
  projectedMemoryHitRadius,
  type PointerPrecision,
} from "./memoryInteraction";
import { createLivingSakuraModel } from "./livingSakuraModel";
import { productTreeFraming, revealShootFraming } from "./livingSakuraFraming";
import {
  CourtyardAir,
  CourtyardEnvironment,
  courtyardKeyLight,
  GardenWeatherLayer,
  SoftContactShadows,
  StageGround,
  WeatherGrade,
} from "./gardenAtmosphere";
import styles from "./LivingSakuraScene.module.css";

export interface LivingSakuraSceneProps {
  journalCount: number;
  newestGrowthUnits: 1 | 2 | 4 | 6;
  memories?: readonly LivingMemoryInput[];
  selectedEntryId?: string | null;
  onSelectMemory?: (entryId: string) => void;
  rootSeed?: string;
  interactive?: boolean;
  viewYaw?: number;
  /**
   * Growth-reveal ceremony mode: drives newest-memory scale from the shared
   * 4.2s schedule (equal duration across private tiers). Prefer interactive=false.
   */
  revealMode?: boolean;
  /** App-level reduced-motion preference; falls back to matchMedia when omitted. */
  reducedMotion?: boolean;
  /**
   * Founder still-pack: wood-only silhouette (no ambient organs / memory petals).
   * Lab capture mode only — product garden never sets this.
   */
  structureOnly?: boolean;
  /** Fires once when the growth ceremony (or short dissolve) reaches complete. */
  onCeremonyComplete?: () => void;
  /**
   * Non-React WebGL failure (context lost). Product mounts demote living →
   * seed mark so the garden slot never goes blank.
   */
  onContextLost?: () => void;
  /** Garden atmosphere from on-device reflection — never a mood score. */
  weatherKind?: GardenWeatherKind;
  /** Shift the crown upward while the journal card covers the lower frame. */
  aboveCard?: boolean;
  onModelStats?: (stats: {
    branches: number;
    memories: number;
    history: number;
    careCycle: number;
    visibleEntryIds: readonly string[];
  }) => void;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

function usePointerPrecision(): PointerPrecision {
  const [precision, setPrecision] = useState<PointerPrecision>("fine");
  useEffect(() => {
    const media = window.matchMedia("(pointer: coarse)");
    const update = () => setPrecision(media.matches ? "coarse" : "fine");
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return precision;
}

function ResponsiveCamera({
  journalCount,
  aboveCard = false,
  revealMode = false,
}: {
  journalCount: number;
  aboveCard?: boolean;
  revealMode?: boolean;
}) {
  const { size } = useThree();
  const narrow = size.width / Math.max(size.height, 1) < 0.82;
  const framing = revealMode
    ? revealShootFraming(journalCount, narrow)
    : productTreeFraming(journalCount, { narrow, aboveCard });
  const focus = useMemo(
    () => new THREE.Vector3(0, framing.focusY, 0),
    [framing.focusY],
  );
  // Pull back so the volumetric crown stays framed through a full walk-around.
  // Early journals use closer framing so the companion sits above the home dock.
  return (
    <PerspectiveCamera
      makeDefault
      position={[0, framing.cameraY, framing.distance]}
      fov={framing.fov}
      near={0.1}
      far={90}
      onUpdate={(camera) => camera.lookAt(focus)}
    />
  );
}

function ControlledOrbit({
  reducedMotion,
  pointerPrecision,
  journalCount,
  focusWorld: _focusWorld,
  aboveCard = false,
}: {
  reducedMotion: boolean;
  pointerPrecision: PointerPrecision;
  journalCount: number;
  focusWorld: MutableRefObject<THREE.Vector3 | null>;
  aboveCard?: boolean;
}) {
  void _focusWorld;
  const { size, camera, gl } = useThree();
  const controlsRef = useRef<{
    target: THREE.Vector3;
    update: () => void;
    domElement?: HTMLElement;
    _sphericalDelta?: { theta: number; phi: number };
  } | null>(null);
  const narrow = size.width / Math.max(size.height, 1) < 0.82;
  const framing = productTreeFraming(journalCount, { narrow, aboveCard });
  const fittedDistance = framing.distance;
  const focus = useMemo(
    () => [0, framing.focusY, 0] as [number, number, number],
    [framing.focusY],
  );
  useEffect(() => {
    const element = gl.domElement;
    let press: {
      x: number;
      y: number;
      position: THREE.Vector3;
      target: THREE.Vector3;
    } | null = null;
    const threshold = pointerPrecision === "coarse" ? 24 : 16;
    const down = (event: PointerEvent) => {
      const controls = controlsRef.current;
      if (!controls) return;
      press = {
        x: event.clientX,
        y: event.clientY,
        position: camera.position.clone(),
        target: controls.target.clone(),
      };
    };
    const up = (event: PointerEvent) => {
      const controls = controlsRef.current;
      if (!press || !controls) {
        press = null;
        return;
      }
      const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
      // OrbitControls bakes rotation inside pointermove. A short press must
      // undo that, not only clear the delta still waiting for the next frame.
      if (moved <= threshold) {
        if (controls._sphericalDelta) {
          controls._sphericalDelta.theta = 0;
          controls._sphericalDelta.phi = 0;
        }
        camera.position.copy(press.position);
        controls.target.copy(press.target);
        controls.update();
      }
      press = null;
    };
    element.addEventListener("pointerdown", down);
    element.addEventListener("pointerup", up);
    element.addEventListener("pointercancel", up);
    return () => {
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointerup", up);
      element.removeEventListener("pointercancel", up);
    };
  }, [camera, gl, pointerPrecision]);

  const minPolar = THREE.MathUtils.degToRad(narrow ? 40 : 36);
  const maxPolar = THREE.MathUtils.degToRad(narrow ? 86 : 90);

  return (
    <OrbitControls
      ref={(value) => {
        controlsRef.current = value;
      }}
      makeDefault
      enablePan={false}
      enableZoom
      minDistance={fittedDistance * (narrow ? 0.82 : 0.84)}
      maxDistance={fittedDistance * (narrow ? 1.32 : 1.48)}
      minPolarAngle={minPolar}
      maxPolarAngle={maxPolar}
      target={focus}
      rotateSpeed={pointerPrecision === "coarse" || narrow ? 0.68 : 0.84}
      zoomSpeed={0.8}
      dampingFactor={reducedMotion ? 0 : 0.1}
      enableDamping={!reducedMotion}
      touches={{
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
      }}
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE,
      }}
    />
  );
}

/** Angular frequency for a period in seconds (ω = 2π / T). */
const TAU = Math.PI * 2;
function windOmega(periodSeconds: number): number {
  return TAU / periodSeconds;
}

const IDLE_ORGAN_NAME =
  /Ambient sakura flowers|Half-open|Historical memory|Spring leaves/;

type IdleOrganFlutter = {
  mesh: THREE.Mesh;
  phase: number;
  omega: number;
  amplitude: number;
};

function hash01(seed: number): number {
  const value = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  return ((value >>> 0) % 10_000) / 10_000;
}

function collectIdleOrgans(root: THREE.Object3D): IdleOrganFlutter[] {
  const organs: IdleOrganFlutter[] = [];
  let index = 0;
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (!IDLE_ORGAN_NAME.test(child.name)) return;
    const hash = hash01(index * 97 + child.id);
    const isLeaf = child.name.includes("Spring leaves");
    organs.push({
      mesh: child,
      phase: hash * TAU,
      omega: windOmega(isLeaf ? 5.4 + hash * 2.6 : 6.8 + hash * 3.2),
      amplitude: THREE.MathUtils.degToRad(isLeaf ? 2.15 : 1.05),
    });
    index += 1;
  });
  return organs;
}

/**
 * Hierarchical idle wind amplitudes (degrees) by pivot order.
 * Design ranges: trunk 0.15–0.35°, primary 0.3–0.8°, secondary 0.8–1.8°, fine 1.5–3.5°.
 * order: trunk, leader, primary, secondary, tertiary
 */
// Design bands: trunk 0.15–0.35 · primary ~0.3–0.8 · secondary 0.8–1.8 · twigs 1.5–3.5
const WIND_AMPLITUDE_DEGREES = [0.42, 0.78, 1.22, 1.92, 3.35] as const;

function LivingTree({
  journalCount,
  newestGrowthUnits,
  rootSeed,
  reducedMotion,
  revealMode,
  structureOnly,
  onCeremonyComplete,
  onModelStats,
  viewYaw,
  memories,
  selectedEntryId,
  onSelectMemory,
  pointerPrecision,
  weatherKind,
  focusWorld,
}: {
  journalCount: number;
  newestGrowthUnits: 1 | 2 | 4 | 6;
  rootSeed: string;
  reducedMotion: boolean;
  revealMode: boolean;
  structureOnly: boolean;
  onCeremonyComplete?: () => void;
  onModelStats?: LivingSakuraSceneProps["onModelStats"];
  viewYaw: number;
  memories?: readonly LivingMemoryInput[];
  selectedEntryId?: string | null;
  onSelectMemory?: (entryId: string) => void;
  pointerPrecision: PointerPrecision;
  weatherKind: GardenWeatherKind;
  focusWorld: MutableRefObject<THREE.Vector3 | null>;
}) {
  const { gl, size, camera, controls } = useThree();
  const revealElapsed = useRef(0);
  const ceremonyCompleteRef = useRef(false);
  const selectRef = useRef(onSelectMemory);
  const orbitRef = useRef(controls);
  const projectScratch = useRef(new THREE.Vector3());
  useLayoutEffect(() => {
    selectRef.current = onSelectMemory;
    orbitRef.current = controls;
  }, [controls, onSelectMemory]);
  const model = useMemo(
    () =>
      createLivingSakuraModel({
        rootSeed,
        journalCount,
        memories,
        newestGrowthUnits,
        // Ceremony starts near-zero only in revealMode; home stays at full scale.
        // Reveal progress is sampled on this same model — do not rebuild as it changes.
        revealProgress: revealMode ? 0.001 : 1,
        structureOnly,
      }),
    [
      journalCount,
      memories,
      newestGrowthUnits,
      revealMode,
      rootSeed,
      structureOnly,
    ],
  );
  const modelRef = useRef(model);
  const idleOrgansRef = useRef<IdleOrganFlutter[]>([]);
  /** Segment ids that host a journal memory — residual secondary rotation targets. */
  const memoryHostSegmentIds = useMemo(() => {
    const hosts = new Set<string>();
    for (const memory of model.memoryInstances) {
      hosts.add(memory.segmentId);
    }
    return hosts;
  }, [model]);
  // Real botanical path + organs from the model (never a stub ["trunk"] path).
  const ceremony = useMemo(() => {
    const pathIds =
      model.ceremonyPathSegmentIds.length > 0
        ? model.ceremonyPathSegmentIds
        : ["trunk"];
    const organIds =
      model.ceremonyOrganIds.length > 0
        ? model.ceremonyOrganIds
        : ["newest-memory"];
    return createGrowthCeremonySchedule({
      eventId: `${rootSeed}:memory:${journalCount}`,
      parentPathSegmentIds: pathIds,
      organIds,
    });
  }, [journalCount, model, rootSeed]);

  useEffect(() => {
    revealElapsed.current = 0;
    ceremonyCompleteRef.current = false;
    modelRef.current = model;
    onModelStats?.({
      branches: model.visibleBranchCount,
      memories: model.memoryBlossomCount,
      history: model.historicalMemoryCount,
      careCycle: model.careCycle,
      visibleEntryIds: model.activeMemoryEntryIds,
    });
    return () => model.dispose();
  }, [journalCount, model, onModelStats]);

  useLayoutEffect(() => {
    model.setSelectedMemory(selectedEntryId ?? null);
  }, [model, selectedEntryId]);

  useLayoutEffect(() => {
    idleOrgansRef.current = collectIdleOrgans(model.root);
    return () => {
      for (const organ of idleOrgansRef.current) {
        organ.mesh.rotation.z = 0;
      }
      idleOrgansRef.current = [];
    };
  }, [model]);

  useLayoutEffect(() => {
    if (journalCount !== 0) return;
    // One absolute seat in the nest. Later frames must not add this again.
    model.root.position.y = productTreeFraming(journalCount).rootLiftY;
  }, [journalCount, model]);

  useEffect(() => {
    const wet = gardenLifeForWeather(weatherKind).wetness;
    model.root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (!/wood|bark|root|husk|shoot|generosity/i.test(child.name)) return;
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        if (!material.userData.dryColor) {
          material.userData.dryColor = material.color.clone();
          material.userData.dryRoughness = material.roughness;
          material.userData.dryMetalness = material.metalness;
        }
        const dryColor = material.userData.dryColor as THREE.Color;
        material.color.copy(dryColor).multiplyScalar(1 - wet * 0.08);
        material.roughness = Math.min(
          0.96,
          (material.userData.dryRoughness as number) + wet * 0.08,
        );
        material.metalness = Math.min(
          0.2,
          (material.userData.dryMetalness as number) + wet * 0.1,
        );
      }
    });
  }, [model, weatherKind]);

  useFrame((state, delta) => {
    const activeModel = modelRef.current;
    const time = state.clock.elapsedTime;
    focusWorld.current = null;

    // Hierarchical idle wind: base cycles 8–14s, irregular gusts ~25–45s.
    // Nested pivots inherit parent rotation; each layer adds delayed local response.
    // Periods ~13.4s / 10.9s / 8.7s sit inside the 8–14s design band.
    // Reveal mode quiets wind so the growth locus stays readable.
    const weatherWind = gardenLifeForWeather(weatherKind).windScale;
    const revealWindScale = (revealMode ? 0.35 : 1) * weatherWind;
    const calm =
      Math.sin(time * windOmega(13.4)) * 0.42 +
      Math.sin(time * windOmega(10.9) + 1.7) * 0.34 +
      Math.sin(time * windOmega(8.7) + 4.1) * 0.24;
    // Sparse irregular gusts: beat of ~28s / ~34s / ~42s so peaks land unevenly in 25–45s.
    const g1 = Math.max(0, Math.sin(time * windOmega(34) - 1.15));
    const g2 = Math.max(0, Math.sin(time * windOmega(42) + 0.72));
    const g3 = Math.max(0, Math.sin(time * windOmega(28.5) + 2.35));
    const gust = g1 ** 6 * 0.48 + g2 ** 7 * 0.34 + (g1 * g3) ** 4 * 0.3;

    for (const pivot of activeModel.pivots) {
      if (reducedMotion) {
        pivot.group.rotation.set(0, 0, 0);
        continue;
      }

      const amplitudeDegrees =
        WIND_AMPLITUDE_DEGREES[pivot.order] ?? WIND_AMPLITUDE_DEGREES[4];
      // Gusts lift fine tips more than the trunk (still within design ranges).
      const gustLift = 1 + gust * (0.06 + pivot.order * 0.055);
      const amplitude = THREE.MathUtils.degToRad(amplitudeDegrees * gustLift);

      // Local period shortens slightly toward the tips (still ~8–14s family).
      const localPeriod = 12.2 - pivot.order * 0.7;
      const delayed =
        Math.sin(time * windOmega(localPeriod) + pivot.phase) * 0.52 +
        calm * (0.4 - pivot.order * 0.018) +
        gust * (0.09 + pivot.order * 0.032) * pivot.side;

      // Contained pointer lean on secondary+ only — never whole-tree; off in reveal.
      const pointerLean =
        pivot.order >= 2 && !revealMode
          ? clampSigned(state.pointer.x * pivot.side) * amplitude * 0.28
          : 0;

      const windScale = revealWindScale;

      pivot.group.rotation.z =
        (delayed * amplitude + pointerLean) * windScale;
      pivot.group.rotation.x =
        Math.sin(time * windOmega(23.2) + pivot.phase * 1.7) *
        amplitude *
        0.2 *
        windScale;

      // Subtle residual secondary rotation on memory-host twigs (safe, tiny yaw).
      if (memoryHostSegmentIds.has(pivot.segmentId) && pivot.order >= 3) {
        pivot.group.rotation.y =
          Math.sin(time * windOmega(15.6) + pivot.phase * 0.9) *
          THREE.MathUtils.degToRad(0.42) *
          windScale;
      } else {
        pivot.group.rotation.y = 0;
      }
    }

    // Extra local flutter on organ meshes only — never rewrite instance matrices.
    const allowFlutter = !reducedMotion && !revealMode;
    for (const organ of idleOrgansRef.current) {
      if (!allowFlutter) {
        organ.mesh.rotation.z = 0;
        continue;
      }
      organ.mesh.rotation.z =
        Math.sin(time * organ.omega + organ.phase) * organ.amplitude * 0.78 +
        Math.sin(time * organ.omega * 0.41 + organ.phase * 1.7) *
          organ.amplitude *
          0.22;
    }

    // Seed kernel breath — same final scale when reduced motion.
    const seedKernel = activeModel.seedKernel;
    if (seedKernel) {
      const baseScale =
        typeof seedKernel.userData.baseScale === "number"
          ? seedKernel.userData.baseScale
          : 1;
      if (reducedMotion) {
        seedKernel.scale.setScalar(baseScale);
      } else {
        const breath = 0.5 + 0.5 * Math.sin(time * windOmega(2.4));
        seedKernel.scale.setScalar(baseScale * (1 + breath * 0.045));
      }
    }

    // Soft selection focus pulse (opacity + scale breath); static under reduced motion.
    const focusRing = activeModel.root.getObjectByName(
      "Selected memory blossom focus",
    ) as THREE.Mesh | undefined;
    if (focusRing) {
      const baseScale =
        typeof focusRing.userData.baseScale === "number"
          ? focusRing.userData.baseScale
          : focusRing.scale.x;
      const baseOpacity =
        typeof focusRing.userData.baseOpacity === "number"
          ? focusRing.userData.baseOpacity
          : 0.88;
      if (reducedMotion) {
        focusRing.scale.setScalar(baseScale);
        const material = focusRing.material;
        if (material instanceof THREE.MeshBasicMaterial) {
          material.opacity = baseOpacity;
        }
      } else {
        // ~1.6s breath — calm selection focus, not flashy.
        const breath = 0.5 + 0.5 * Math.sin(time * windOmega(1.6));
        focusRing.scale.setScalar(baseScale * (1 + breath * 0.055));
        const material = focusRing.material;
        if (material instanceof THREE.MeshBasicMaterial) {
          material.opacity = baseOpacity * (0.78 + breath * 0.22);
        }
      }
    }

    const perspectiveCamera = state.camera as THREE.PerspectiveCamera;
    const framing = productTreeFraming(journalCount, {
      narrow: size.width / Math.max(size.height, 1) < 0.82,
    });
    const focusPoint = projectScratch.current.set(0, framing.focusY, 0);
    const targetDistance = perspectiveCamera.position.distanceTo(focusPoint);
    // Generous floors so journal memory petals stay finger-friendly after full orbit.
    const densityShrink = journalCount < 96 ? 1 : journalCount < 192 ? 0.88 : 0.74;
    const hitRadiusWorld = projectedMemoryHitRadius({
      pointerPrecision,
      distanceToCamera: targetDistance,
      viewportHeightCssPx: Math.max(size.height, 1),
      verticalFovDegrees: perspectiveCamera.fov,
      minimumWorldRadius:
        (pointerPrecision === "coarse" ? 0.72 : 0.58) * densityShrink,
      maximumWorldRadius:
        (pointerPrecision === "coarse" ? 1.8 : 1.45) * densityShrink,
    });
    // Diameter = 2× radius; hit spheres must cover the luminous memory petals.
    activeModel.updateMemoryTransforms(hitRadiusWorld * 2);

    // Full schedule only in revealMode: path pulse → wood grow → organ stagger → settle.
    if (revealMode && activeModel.ceremonyOrganIds.length > 0) {
      revealElapsed.current += Math.min(delta, 0.1);
      const sampleElapsed = reducedMotion
        ? (revealElapsed.current / GROWTH_REVEAL_REDUCED_MOTION_SECONDS) *
          GROWTH_CEREMONY_DURATION_SECONDS
        : revealElapsed.current;
      const ceremonyState = sampleGrowthCeremony(ceremony, sampleElapsed, {
        reducedMotion,
      });
      const easedOrgans = ceremonyState.organs.map((organ) => ({
        ...organ,
        progress: reducedMotion ? organ.progress : easeOutBack(organ.progress),
      }));
      activeModel.applyCeremonySample({
        parentPath: ceremonyState.parentPath,
        woodProgress: reducedMotion
          ? ceremonyState.woodProgress
          : easeOutBack(ceremonyState.woodProgress),
        organs: easedOrgans,
      });
      if (ceremonyState.complete && !ceremonyCompleteRef.current) {
        ceremonyCompleteRef.current = true;
        onCeremonyComplete?.();
      }
    } else if (revealMode && !ceremonyCompleteRef.current) {
      ceremonyCompleteRef.current = true;
      onCeremonyComplete?.();
    }
  });

  useEffect(() => {
    const element = gl.domElement;
    const radius = pointerPrecision === "coarse" ? 80 : 64;
    const screen: {
      entryId: string;
      screenX: number;
      screenY: number;
      depth: number;
    }[] = [];
    const scratch = projectScratch.current;

    const projectPetals = () => {
      screen.length = 0;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return screen;
      // OrbitControls lookAt does not refresh the inverse until the next render.
      camera.updateMatrixWorld();
      for (const petal of modelRef.current.petalPoints) {
        scratch.copy(petal.position).applyMatrix4(camera.matrixWorldInverse);
        // In front of the camera, view-space Z is negative.
        if (!(scratch.z < 0)) continue;
        const depth = -scratch.z;
        scratch.copy(petal.position).project(camera);
        if (
          !Number.isFinite(scratch.x) ||
          !Number.isFinite(scratch.y) ||
          scratch.z < -1 ||
          scratch.z > 1
        ) {
          continue;
        }
        screen.push({
          entryId: petal.entryId,
          depth,
          screenX: rect.left + (scratch.x * 0.5 + 0.5) * rect.width,
          screenY: rect.top + (-scratch.y * 0.5 + 0.5) * rect.height,
        });
      }
      return screen;
    };

    const haltOrbit = () => {
      const orbit = orbitRef.current as {
        _sphericalDelta?: { theta: number; phi: number };
      } | null;
      if (!orbit?._sphericalDelta) return;
      orbit._sphericalDelta.theta = 0;
      orbit._sphericalDelta.phi = 0;
    };

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const entryId = nearestPetalId(
        projectPetals(),
        event.clientX,
        event.clientY,
        radius,
      );
      if (!entryId) {
        element.style.cursor = "auto";
        return;
      }
      // Capture-phase: keep OrbitControls from rotating, and suppress the
      // compatibility click so a sheet button under the release cannot navigate.
      event.preventDefault();
      event.stopImmediatePropagation();
      haltOrbit();
      element.style.cursor = "pointer";
      selectRef.current?.(entryId);
    };
    const onMove = (event: PointerEvent) => {
      const entryId = nearestPetalId(
        projectPetals(),
        event.clientX,
        event.clientY,
        radius,
      );
      element.style.cursor = entryId ? "pointer" : "auto";
    };

    element.addEventListener("pointerdown", onDown, true);
    element.addEventListener("pointermove", onMove);
    return () => {
      element.removeEventListener("pointerdown", onDown, true);
      element.removeEventListener("pointermove", onMove);
      element.style.cursor = "auto";
    };
  }, [camera, gl, pointerPrecision]);

  return (
    <group position={[0, 0, 0]} rotation={[0, viewYaw, 0]}>
      <primitive object={model.root} />
    </group>
  );
}

function clampSigned(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

function easeOutBack(value: number): number {
  const c1 = 1.35;
  const c3 = c1 + 1;
  return 1 + c3 * (value - 1) ** 3 + c1 * (value - 1) ** 2;
}

export function LivingSakuraScene({
  journalCount,
  newestGrowthUnits,
  memories,
  selectedEntryId,
  onSelectMemory,
  rootSeed = "seed-journal-living-sakura-v2",
  interactive = true,
  viewYaw = 0,
  revealMode = false,
  reducedMotion: reducedMotionProp,
  structureOnly = false,
  weatherKind = "still",
  aboveCard = false,
  onCeremonyComplete,
  onContextLost,
  onModelStats,
}: LivingSakuraSceneProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const reducedMotion = reducedMotionProp ?? prefersReducedMotion;
  const pointerPrecision = usePointerPrecision();
  // Ceremony stages never take pointer; garden may still orbit when interactive.
  const allowInteraction = interactive && !revealMode && !structureOnly;
  const onContextLostRef = useRef(onContextLost);
  const focusWorld = useRef<THREE.Vector3 | null>(null);
  const keyLight = courtyardKeyLight(weatherKind);
  useEffect(() => {
    onContextLostRef.current = onContextLost;
  }, [onContextLost]);

  // Accessible name lives on the lab/product stage wrapper (focusable section /
  // garden frame). Do not put aria-label on the R3F host div — it has no role.
  return (
    <div
      className={styles.scene}
      data-living-sakura-scene
      data-reveal-mode={revealMode || undefined}
      data-reduced-motion={reducedMotion || undefined}
      data-structure-only={structureOnly || undefined}
      data-weather={weatherKind}
      data-context-lost-wired={onContextLost ? "true" : undefined}
      aria-hidden={revealMode || structureOnly ? true : undefined}
    >
      <Canvas
        dpr={[1, 1.5]}
        shadows
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl }) => {
          // Soft product tone — no post stack, just filmic exposure.
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.04;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          // Runtime context loss must demote the product garden (not blank canvas).
          registerWebGLContextLost(gl.domElement, () => {
            onContextLostRef.current?.();
          });
        }}
        camera={{ position: [0, 3.2, 12], fov: 31, near: 0.1, far: 90 }}
      >
        <ResponsiveCamera
          journalCount={journalCount}
          aboveCard={aboveCard}
          revealMode={revealMode}
        />
        <WeatherGrade kind={weatherKind} />
        <CourtyardAir journalCount={journalCount} weatherKind={weatherKind} />
        <CourtyardEnvironment weatherKind={weatherKind} />
        <ambientLight
          intensity={weatherKind === "rain" ? 0.22 : 0.18}
          color={weatherKind === "rain" ? "#9aadb8" : "#f3ebe3"}
        />
        <hemisphereLight
          args={
            weatherKind === "rain"
              ? ["#b7c6d0", "#4a5156", 0.58]
              : weatherKind === "sunbreak"
                ? ["#fff4d6", "#8a6e55", 1.22]
                : weatherKind === "mist"
                  ? ["#e4e8ec", "#7a7e82", 0.82]
                  : weatherKind === "dew"
                    ? ["#eef6f4", "#7d7266", 1.04]
                    : weatherKind === "restless"
                      ? ["#d7e2ec", "#6e675f", 0.86]
                      : ["#fff8f0", "#7a6a5f", 0.98]
          }
        />
        <directionalLight
          position={[-7.6, 5.8, 2.4]}
          intensity={keyLight.intensity}
          color={keyLight.color}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-left={-6.5}
          shadow-camera-right={6.5}
          shadow-camera-top={8.5}
          shadow-camera-bottom={-1.8}
          shadow-bias={-0.00026}
          shadow-normalBias={0.032}
        />
        <directionalLight
          position={[7.2, 2.4, -1.8]}
          intensity={weatherKind === "rain" ? 0.12 : 0.4}
          color="#c0acc0"
        />
        <directionalLight
          position={[0.4, 3.8, -9.8]}
          intensity={
            weatherKind === "sunbreak"
              ? 0.95
              : weatherKind === "rain"
                ? 0.18
                : weatherKind === "restless"
                  ? 0.26
                  : 0.5
          }
          color={
            weatherKind === "sunbreak"
              ? "#ffe7b8"
              : weatherKind === "restless"
                ? "#c5d4e2"
                : "#efe0d4"
          }
        />
        <pointLight position={[0, 0.85, 0.6]} intensity={0.14} color="#e4d2c0" distance={10} decay={2} />
        <pointLight position={[0.1, 7.2, 3.8]} intensity={0.2} color="#fffaf4" distance={18} decay={2} />
        <GardenWeatherLayer
          weatherKind={weatherKind}
          journalCount={journalCount}
          reducedMotion={reducedMotion}
          structureOnly={structureOnly}
        />
        <Suspense fallback={null}>
          <StageGround weatherKind={weatherKind} />
          <LivingTree
            journalCount={journalCount}
            newestGrowthUnits={newestGrowthUnits}
            rootSeed={rootSeed}
            memories={memories}
            selectedEntryId={selectedEntryId}
            onSelectMemory={allowInteraction ? onSelectMemory : undefined}
            pointerPrecision={pointerPrecision}
            reducedMotion={reducedMotion}
            revealMode={revealMode}
            structureOnly={structureOnly}
            weatherKind={weatherKind}
            focusWorld={focusWorld}
            onCeremonyComplete={onCeremonyComplete}
            onModelStats={onModelStats}
            viewYaw={viewYaw}
          />
          <SoftContactShadows />
        </Suspense>
        {allowInteraction ? (
          <ControlledOrbit
            reducedMotion={reducedMotion}
            pointerPrecision={pointerPrecision}
            journalCount={journalCount}
            focusWorld={focusWorld}
            aboveCard={aboveCard}
          />
        ) : null}
      </Canvas>
      {allowInteraction ? (
        <p className={styles.canvasHint} aria-hidden="true">
          Tap a glowing petal to open a memory · Drag to walk around
        </p>
      ) : null}
    </div>
  );
}
