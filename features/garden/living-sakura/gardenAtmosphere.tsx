"use client";

/* eslint-disable react-hooks/immutability -- Three.js animation updates scene-graph transforms inside useFrame. */

import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { gardenLifeForWeather } from "@/features/garden/lifeState";
import type { GardenWeatherKind } from "@/features/reflection";
import { productCourtyardAtmosphere } from "./livingSakuraFraming";

/**
 * Zen courtyard + living weather. Ground holds the tree with intent;
 * weather is the garden's weather, never a mood score. All meshes here
 * disable raycast so memory-petal taps stay honest.
 */

const COURTYARD_MOSS = [
  { x: 0.72, y: 0.042, z: 0.38, sx: 0.2, sy: 0.042, sz: 0.15, yaw: 0.38, tone: 0 },
  { x: 0.86, y: 0.036, z: 0.24, sx: 0.11, sy: 0.03, sz: 0.09, yaw: 1.1, tone: 1 },
  { x: 0.58, y: 0.034, z: 0.52, sx: 0.09, sy: 0.026, sz: 0.08, yaw: -0.4, tone: 2 },
  { x: -0.64, y: 0.04, z: 0.54, sx: 0.18, sy: 0.04, sz: 0.14, yaw: -0.55, tone: 1 },
  { x: -0.5, y: 0.034, z: 0.68, sx: 0.09, sy: 0.026, sz: 0.08, yaw: 0.85, tone: 0 },
  { x: -0.78, y: 0.032, z: 0.36, sx: 0.08, sy: 0.024, sz: 0.07, yaw: 0.2, tone: 2 },
  { x: 0.4, y: 0.038, z: -0.72, sx: 0.16, sy: 0.038, sz: 0.13, yaw: 0.22, tone: 0 },
  { x: 0.22, y: 0.03, z: -0.86, sx: 0.08, sy: 0.022, sz: 0.07, yaw: -0.7, tone: 1 },
  { x: -0.82, y: 0.034, z: -0.22, sx: 0.13, sy: 0.032, sz: 0.1, yaw: -0.9, tone: 1 },
  { x: -0.28, y: 0.03, z: 0.92, sx: 0.1, sy: 0.024, sz: 0.08, yaw: 1.4, tone: 2 },
] as const;

const MOSS_TONES = ["#61785c", "#738a6e", "#8aa084"] as const;

function hashUnit(seed: number): number {
  const value = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  return ((value >>> 0) % 10_000) / 10_000;
}

function disableRaycast(root: THREE.Object3D) {
  root.traverse((child) => {
    child.raycast = () => undefined;
  });
}

function createSoilMoundGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.CircleGeometry(1.62, 96);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  const dark: [number, number, number] = [0.34, 0.23, 0.15];
  const mid: [number, number, number] = [0.5, 0.35, 0.23];
  const warm: [number, number, number] = [0.61, 0.44, 0.3];
  for (let i = 0; i < pos.count; i += 1) {
    let x = pos.getX(i);
    let z = pos.getZ(i);
    const angle = Math.atan2(z, x);
    const lobe =
      1 +
      0.2 * Math.sin(angle * 3 + 0.4) +
      0.11 * Math.sin(angle * 5 - 1.1) +
      0.06 * Math.sin(angle * 2.2 + 0.6) +
      0.035 * Math.sin(angle * 8 + 2.2);
    x *= lobe;
    z *= lobe;
    const rr = Math.hypot(x, z);
    const mound = 0.082 * Math.exp(-(rr * rr) / 1.05);
    const nest = 0.032 * Math.exp(-(rr * rr) / 0.065);
    const grain = Math.sin(x * 7.1 + z * 5.8) * 0.007 * Math.exp(-(rr * rr) / 1.5);
    const y = Math.max(0.004, mound - nest + grain);
    pos.setXYZ(i, x, y, z);
    const shade = Math.min(1, Math.max(0, y * 9 + rr * 0.16));
    const nestMix = Math.exp(-(rr * rr) / 0.075);
    const contact = Math.exp(-((rr - 0.22) * (rr - 0.22)) / 0.02);
    colors[i * 3] =
      dark[0] * nestMix + mid[0] * (1 - nestMix) * (1 - shade) + warm[0] * shade * (1 - nestMix);
    colors[i * 3 + 1] =
      dark[1] * nestMix + mid[1] * (1 - nestMix) * (1 - shade) + warm[1] * shade * (1 - nestMix);
    colors[i * 3 + 2] =
      dark[2] * nestMix + mid[2] * (1 - nestMix) * (1 - shade) + warm[2] * shade * (1 - nestMix);
    colors[i * 3] *= 1 - contact * 0.28;
    colors[i * 3 + 1] *= 1 - contact * 0.32;
    colors[i * 3 + 2] *= 1 - contact * 0.3;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createSoilShelfGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.CircleGeometry(0.92, 40);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    let x = pos.getX(i);
    let z = pos.getZ(i);
    const angle = Math.atan2(z, x);
    const lobe = 1 + 0.28 * Math.sin(angle * 2 + 1.2) + 0.12 * Math.sin(angle * 5);
    x *= lobe;
    z *= lobe * 0.72;
    const rr = Math.hypot(x, z);
    const y = 0.02 * Math.exp(-(rr * rr) / 0.55);
    pos.setXYZ(i, x, y, z);
    const shade = 0.42 + 0.12 * (1 - Math.min(1, rr));
    colors[i * 3] = shade * 0.95;
    colors[i * 3 + 1] = shade * 0.72;
    colors[i * 3 + 2] = shade * 0.5;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createGravelWashGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.CircleGeometry(7.2, 128);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  const cream: [number, number, number] = [0.93, 0.88, 0.82];
  const sand: [number, number, number] = [0.78, 0.7, 0.58];
  const grit: [number, number, number] = [0.62, 0.55, 0.44];
  const rake: [number, number, number] = [0.7, 0.63, 0.52];
  for (let i = 0; i < pos.count; i += 1) {
    const x0 = pos.getX(i);
    const z0 = pos.getZ(i);
    const angle = Math.atan2(z0, x0);
    const r0 = Math.hypot(x0, z0);
    const lobe = 1 + 0.04 * Math.sin(angle * 2.4 + 0.7);
    const x = x0 * lobe;
    const z = z0 * lobe;
    const r = Math.hypot(x, z);
    const grain = Math.sin(x * 9.4 + z * 7.6) * Math.cos(x * 4.2 - z * 6.9);
    // Concentric rake lines — a courtyard that was tended, not a disc prop.
    const rakeWave = Math.sin(r * 11.2 + angle * 0.35) * 0.007;
    const rakeBand = 0.5 + 0.5 * Math.sin(r * 11.2);
    pos.setXYZ(
      i,
      x,
      -0.026 + grain * 0.005 * Math.max(0, 1 - r / 7.2) + rakeWave * Math.max(0, 1 - r / 6.4),
      z,
    );
    const gritMix = (grain + 1) * 0.5;
    let red = sand[0] + (grit[0] - sand[0]) * gritMix;
    let green = sand[1] + (grit[1] - sand[1]) * gritMix;
    let blue = sand[2] + (grit[2] - sand[2]) * gritMix;
    red += (rake[0] - red) * rakeBand * 0.22;
    green += (rake[1] - green) * rakeBand * 0.22;
    blue += (rake[2] - blue) * rakeBand * 0.22;
    const fade = Math.min(1, Math.max(0, (r - 4.6) / 2.4));
    red += (cream[0] - red) * fade;
    green += (cream[1] - green) * fade;
    blue += (cream[2] - blue) * fade;
    colors[i * 3] = red;
    colors[i * 3 + 1] = green;
    colors[i * 3 + 2] = blue;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createMossGeometry(): THREE.BufferGeometry {
  // A soft patch on the soil, not a green pill.
  const geometry = new THREE.CircleGeometry(1, 10);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    const n = 1 + 0.28 * Math.sin(x * 3.2 + z * 2.4) + 0.12 * Math.sin(z * 5.1 - x);
    const height = (0.45 + 0.55 * (1 - Math.min(1, r))) * (0.75 + 0.25 * Math.sin(x * 6 + z * 4));
    pos.setXYZ(i, x * n, height, z * n * (0.72 + 0.2 * Math.sin(x + z)));
    const tone = 0.35 + 0.2 * (1 - r) + 0.05 * Math.sin(x * 8 + z * 3);
    colors[i * 3] = 0.28 + tone * 0.15;
    colors[i * 3 + 1] = 0.38 + tone * 0.35;
    colors[i * 3 + 2] = 0.26 + tone * 0.08;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createStoneGeometry(seed: number): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(1, 18, 14);
  const pos = geometry.getAttribute("position");
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n =
      1 +
      0.16 * Math.sin(x * 2.6 + seed) +
      0.1 * Math.sin(z * 3.3 - seed * 0.6) +
      0.06 * Math.sin((x + z) * 5.2 + seed);
    const bury = y < 0 ? 0.35 : 1;
    pos.setXYZ(i, x * n * 1.08, y * n * 0.42 * bury, z * n * 0.82);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function StageGround({ weatherKind }: { weatherKind: GardenWeatherKind }) {
  const groupRef = useRef<THREE.Group>(null);
  const soilGeometry = useMemo(() => createSoilMoundGeometry(), []);
  const soilShelfGeometry = useMemo(() => createSoilShelfGeometry(), []);
  const gravelGeometry = useMemo(() => createGravelWashGeometry(), []);
  const mossGeometry = useMemo(() => createMossGeometry(), []);
  const stoneA = useMemo(() => createStoneGeometry(1.7), []);
  const stoneB = useMemo(() => createStoneGeometry(4.2), []);
  const stoneC = useMemo(() => createStoneGeometry(8.9), []);
  const wet = gardenLifeForWeather(weatherKind).wetness;
  const basinRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    disableRaycast(group);
    return () => {
      soilGeometry.dispose();
      soilShelfGeometry.dispose();
      gravelGeometry.dispose();
      mossGeometry.dispose();
      stoneA.dispose();
      stoneB.dispose();
      stoneC.dispose();
    };
  }, [gravelGeometry, mossGeometry, soilGeometry, soilShelfGeometry, stoneA, stoneB, stoneC]);

  useFrame((state) => {
    const basin = basinRef.current;
    if (!basin) return;
    const time = state.clock.elapsedTime;
    basin.position.y = 0.046 + Math.sin(time * 0.7) * 0.002;
    const material = basin.material;
    if (material instanceof THREE.MeshStandardMaterial) {
      material.roughness = 0.08 + Math.sin(time * 0.55) * 0.02;
    }
  });

  return (
    <group ref={groupRef} name="Zen courtyard">
      <mesh geometry={gravelGeometry} receiveShadow>
        <meshStandardMaterial
          vertexColors
          roughness={0.97 - wet * 0.44}
          metalness={wet * 0.18}
          color={wet > 0.5 ? "#848078" : "#ffffff"}
        />
      </mesh>
      <mesh
        name="Soil shelf"
        geometry={soilShelfGeometry}
        position={[-0.72, 0.004, 0.28]}
        rotation={[0, 0.4, 0]}
        receiveShadow
      >
        <meshStandardMaterial
          vertexColors
          roughness={0.98}
          metalness={0}
          color={wet > 0.5 ? "#675448" : "#ffffff"}
        />
      </mesh>
      <mesh geometry={soilGeometry} receiveShadow>
        <meshStandardMaterial
          vertexColors
          roughness={0.97 - wet * 0.4}
          metalness={wet * 0.12}
          color={wet > 0.5 ? "#675448" : "#ffffff"}
        />
      </mesh>
      {COURTYARD_MOSS.map((clump, index) => (
        <mesh
          key={`moss-${index}`}
          geometry={mossGeometry}
          position={[clump.x, clump.y, clump.z]}
          rotation={[-0.2, clump.yaw, 0.06]}
          scale={[clump.sx, clump.sy, clump.sz]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial
            vertexColors
            color={MOSS_TONES[clump.tone]}
            roughness={0.94 - wet * 0.16}
            metalness={0}
          />
        </mesh>
      ))}
      <mesh
        name="Courtyard stone"
        geometry={stoneA}
        position={[1.22, 0.038, 0.56]}
        rotation={[0.1, 0.82, 0.06]}
        scale={[0.22, 0.09, 0.16]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#7f776e" roughness={0.9 - wet * 0.22} metalness={0.04} />
      </mesh>
      <mesh
        name="Courtyard companion stone"
        geometry={stoneB}
        position={[1.42, 0.028, 0.38]}
        rotation={[0.18, -0.4, 0.1]}
        scale={[0.11, 0.05, 0.08]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#8a8278" roughness={0.92 - wet * 0.2} metalness={0.03} />
      </mesh>
      <mesh
        name="Far courtyard stone"
        geometry={stoneC}
        position={[-1.34, 0.03, -0.62]}
        rotation={[0.08, 1.2, -0.05]}
        scale={[0.16, 0.062, 0.12]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#82786e" roughness={0.91 - wet * 0.2} metalness={0.03} />
      </mesh>
      {(
        [
          [0.48, 0.86, 0.034, 0.4],
          [-0.42, 0.62, 0.026, 1.1],
          [0.95, -0.28, 0.03, 0.2],
          [-0.98, 0.42, 0.028, 2.1],
          [0.15, -1.02, 0.022, 0.8],
        ] as const
      ).map(([x, z, size, yaw]) => (
        <mesh
          key={`pebble-${x}-${z}`}
          name="Courtyard pebble"
          geometry={stoneC}
          position={[x, 0.008, z]}
          rotation={[0.2, yaw, 0.1]}
          scale={[size, size * 0.45, size * 0.8]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#8b8176" roughness={0.94} metalness={0.02} />
        </mesh>
      ))}
      <group name="Tsukubai" position={[-1.08, 0, 0.78]}>
        <mesh
          geometry={stoneB}
          position={[0, 0.034, 0]}
          rotation={[0.05, 0.4, 0]}
          scale={[0.2, 0.07, 0.2]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#6d675f" roughness={0.88} metalness={0.05} />
        </mesh>
        <mesh
          ref={basinRef}
          position={[0, 0.046, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[0.11, 24]} />
          <meshStandardMaterial
            color={wet > 0.4 ? "#6a7c82" : "#7f8f86"}
            roughness={0.1}
            metalness={0.22}
            transparent
            opacity={0.78}
          />
        </mesh>
      </group>
    </group>
  );
}

function courtyardTone(
  kind: GardenWeatherKind,
  base: ReturnType<typeof productCourtyardAtmosphere>,
): { color: string; fogNear: number; fogFar: number } {
  const life = gardenLifeForWeather(kind);
  if (kind === "rain") {
    return {
      color: "#c5d3dc",
      fogNear: Math.max(10, base.fogNear + life.fogNearOffset),
      fogFar: Math.max(28, base.fogFar + life.fogFarOffset),
    };
  }
  if (kind === "mist") {
    return {
      color: "#e7e4e2",
      fogNear: Math.max(6.4, base.fogNear + life.fogNearOffset),
      fogFar: Math.max(18, base.fogFar + life.fogFarOffset),
    };
  }
  if (kind === "sunbreak") {
    return {
      color: "#f8e8c8",
      fogNear: base.fogNear + life.fogNearOffset,
      fogFar: base.fogFar + life.fogFarOffset,
    };
  }
  if (kind === "dew") {
    return {
      color: "#ece6dc",
      fogNear: base.fogNear + life.fogNearOffset,
      fogFar: base.fogFar + life.fogFarOffset,
    };
  }
  if (kind === "restless") {
    return {
      color: "#e4eaf0",
      fogNear: base.fogNear + life.fogNearOffset,
      fogFar: base.fogFar + life.fogFarOffset,
    };
  }
  return {
    color: base.color,
    fogNear: base.fogNear + life.fogNearOffset,
    fogFar: base.fogFar + life.fogFarOffset,
  };
}

export function CourtyardAir({
  journalCount,
  weatherKind,
}: {
  journalCount: number;
  weatherKind: GardenWeatherKind;
}) {
  const air = courtyardTone(weatherKind, productCourtyardAtmosphere(journalCount));
  return (
    <>
      <color attach="background" args={[air.color]} />
      <fog attach="fog" args={[air.color, air.fogNear, air.fogFar]} />
    </>
  );
}

const RAIN_STREAK_COUNT = 420;
const RAIN_SPLASH_COUNT = 110;

export function SoftRain({ reducedMotion }: { reducedMotion: boolean }) {
  const streakRef = useRef<THREE.InstancedMesh>(null);
  const splashRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const streaks = useMemo(
    () =>
      Array.from({ length: RAIN_STREAK_COUNT }, (_, index) => ({
        x: (hashUnit(index + 11) - 0.5) * 8.6,
        y: hashUnit(index + 41) * 11.2,
        z: (hashUnit(index + 71) - 0.5) * 7.8,
        speed: 8.4 + hashUnit(index + 101) * 6.2,
        length: 0.42 + hashUnit(index + 131) * 0.62,
        thick: 0.55 + hashUnit(index + 151) * 0.7,
      })),
    [],
  );
  const splashes = useMemo(
    () =>
      Array.from({ length: RAIN_SPLASH_COUNT }, (_, index) => ({
        x: (hashUnit(index + 211) - 0.5) * 4.4,
        z: (hashUnit(index + 241) - 0.5) * 3.8,
        phase: hashUnit(index + 271),
        size: 0.045 + hashUnit(index + 291) * 0.07,
      })),
    [],
  );

  useFrame((state, delta) => {
    const streaksMesh = streakRef.current;
    const splashMesh = splashRef.current;
    if (!streaksMesh) return;
    const step = reducedMotion ? delta * 0.18 : delta;
    const leanX = state.pointer.x * 0.22;
    const leanZ = -state.pointer.y * 0.12;
    for (let index = 0; index < streaks.length; index += 1) {
      const drop = streaks[index];
      drop.y -= drop.speed * step;
      drop.x += leanX * step * 1.4;
      drop.z += leanZ * step * 1.4;
      if (drop.y < 0.04) {
        drop.y = 10.8;
        drop.x = (hashUnit(index + Math.floor(state.clock.elapsedTime * 3)) - 0.5) * 8.6;
        drop.z = (hashUnit(index + 71) - 0.5) * 7.8;
      }
      dummy.position.set(drop.x, drop.y, drop.z);
      dummy.rotation.set(0.12 + leanZ * 0.4, 0, -0.28 + leanX * 0.5);
      dummy.scale.set(drop.thick, drop.length, drop.thick);
      dummy.updateMatrix();
      streaksMesh.setMatrixAt(index, dummy.matrix);
    }
    streaksMesh.instanceMatrix.needsUpdate = true;

    if (!splashMesh) return;
    const time = state.clock.elapsedTime;
    for (let index = 0; index < splashes.length; index += 1) {
      const splash = splashes[index];
      const pulse = ((time * 1.7 + splash.phase * 6.2) % 1 + 1) % 1;
      const open = pulse < 0.55 ? pulse / 0.55 : 0;
      dummy.position.set(splash.x, 0.03, splash.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(splash.size * (0.35 + open * 2.4));
      dummy.updateMatrix();
      splashMesh.setMatrixAt(index, dummy.matrix);
    }
    splashMesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group name="Garden rain">
      <instancedMesh
        ref={streakRef}
        args={[undefined, undefined, streaks.length]}
        frustumCulled={false}
        raycast={() => undefined}
      >
        <cylinderGeometry args={[0.007, 0.0035, 1, 4]} />
        <meshBasicMaterial
          color="#d7e6ef"
          transparent
          opacity={0.62}
          depthWrite={false}
        />
      </instancedMesh>
      <instancedMesh
        ref={splashRef}
        args={[undefined, undefined, splashes.length]}
        frustumCulled={false}
        raycast={() => undefined}
      >
        <ringGeometry args={[0.32, 0.5, 14]} />
        <meshBasicMaterial
          color="#c5d5e0"
          transparent
          opacity={0.38}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </instancedMesh>
      <mesh
        position={[0, 3.4, 0]}
        rotation={[0.08, 0.2, -0.12]}
        raycast={() => undefined}
      >
        <planeGeometry args={[16, 10]} />
        <meshBasicMaterial
          color="#9aafbd"
          transparent
          opacity={0.12}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

export function SunGlow() {
  return (
    <group position={[6.8, 8.6, -7.4]} name="Sunbreak">
      <mesh raycast={() => undefined}>
        <sphereGeometry args={[1.7, 24, 24]} />
        <meshBasicMaterial color="#fff1b8" transparent opacity={0.82} />
      </mesh>
      <mesh raycast={() => undefined}>
        <sphereGeometry args={[3.6, 20, 20]} />
        <meshBasicMaterial
          color="#ffd98a"
          transparent
          opacity={0.22}
          depthWrite={false}
        />
      </mesh>
      <pointLight color="#ffe4a8" intensity={2.15} distance={34} decay={2} />
      {[0, 1, 2].map((index) => (
        <mesh
          key={index}
          position={[-1.4 - index * 0.55, -3.2, index * 0.35]}
          rotation={[0.62, 0.18, -0.42 + index * 0.14]}
          raycast={() => undefined}
        >
          <planeGeometry args={[2.1 + index * 0.45, 11]} />
          <meshBasicMaterial
            color="#ffe7b0"
            transparent
            opacity={0.09}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

export function MorningDew() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const beads = useMemo(
    () =>
      COURTYARD_MOSS.flatMap((clump, clumpIndex) =>
        Array.from({ length: 4 }, (_, index) => ({
          x: clump.x + (hashUnit(clumpIndex * 17 + index + 3) - 0.5) * clump.sx * 1.4,
          y: clump.y + 0.03 + hashUnit(clumpIndex * 19 + index + 7) * 0.04,
          z: clump.z + (hashUnit(clumpIndex * 23 + index + 11) - 0.5) * clump.sz * 1.4,
          size: 0.01 + hashUnit(clumpIndex * 29 + index + 13) * 0.012,
          phase: hashUnit(clumpIndex * 31 + index + 17),
        })),
      ),
    [],
  );

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const time = state.clock.elapsedTime;
    for (let index = 0; index < beads.length; index += 1) {
      const bead = beads[index];
      dummy.position.set(
        bead.x,
        bead.y + Math.sin(time * 0.4 + bead.phase * 6) * 0.006,
        bead.z,
      );
      dummy.scale.setScalar(bead.size * (0.86 + Math.sin(time * 0.9 + bead.phase * 4) * 0.14));
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, beads.length]}
      frustumCulled={false}
      raycast={() => undefined}
      name="Morning dew"
    >
      <sphereGeometry args={[1, 8, 8]} />
      <meshPhysicalMaterial
        color="#f4fbff"
        transparent
        opacity={0.55}
        roughness={0.08}
        metalness={0.05}
        transmission={0.35}
        thickness={0.2}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

function createMistTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Mist texture could not be drawn.");
  }
  const gradient = context.createRadialGradient(128, 128, 8, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255,255,255,0.72)");
  gradient.addColorStop(0.28, "rgba(244,246,247,0.34)");
  gradient.addColorStop(0.62, "rgba(232,236,238,0.12)");
  gradient.addColorStop(1, "rgba(232,236,238,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Low, wide sheets — a ground drift, not stacked cotton puffs. */
const MIST_DRIFT = [
  { x: -2.8, y: 0.22, z: 0.15, w: 8.8, h: 0.95, o: 0.13 },
  { x: 2.2, y: 0.16, z: -0.55, w: 9.2, h: 1.05, o: 0.1 },
  { x: 0.15, y: 0.38, z: 1.2, w: 10.4, h: 1.15, o: 0.08 },
  { x: -0.6, y: 0.12, z: -1.25, w: 7.6, h: 0.78, o: 0.11 },
  { x: 0.8, y: 0.48, z: 0.35, w: 11.2, h: 1.25, o: 0.07 },
] as const;

export function SoftMist({ reducedMotion }: { reducedMotion: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const texture = useMemo(() => createMistTexture(), []);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame((state) => {
    const group = groupRef.current;
    if (!group || reducedMotion) return;
    const time = state.clock.elapsedTime;
    group.children.forEach((child, index) => {
      const home = MIST_DRIFT[index];
      if (!home) return;
      child.position.x = home.x + Math.sin(time * 0.05 + index * 1.1) * 0.85;
      child.position.y = home.y + Math.sin(time * 0.04 + index * 0.7) * 0.03;
      child.position.z = home.z + Math.cos(time * 0.045 + index * 0.9) * 0.4;
    });
  });

  return (
    <group ref={groupRef} name="Garden mist">
      {MIST_DRIFT.map((sheet, index) => (
        <sprite
          key={index}
          position={[sheet.x, sheet.y, sheet.z]}
          scale={[sheet.w, sheet.h, 1]}
          raycast={() => undefined}
        >
          <spriteMaterial
            map={texture}
            color="#e7ebed"
            transparent
            opacity={sheet.o}
            depthWrite={false}
            fog
          />
        </sprite>
      ))}
    </group>
  );
}

/** Cool rim and a few slow motes — restless air, not a gale and not still warmth. */
export function RestlessAir({ reducedMotion }: { reducedMotion: boolean }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const motes = useMemo(
    () =>
      [
        { x: -0.28, y: 0.46, z: 0.42 },
        { x: 0.22, y: 0.62, z: 0.18 },
        { x: -0.08, y: 0.78, z: 0.55 },
        { x: 0.34, y: 0.94, z: 0.28 },
        { x: -0.18, y: 1.08, z: 0.36 },
      ].map((mote, index) => ({
        ...mote,
        size: 0.012 + hashUnit(index + 15) * 0.008,
        phase: hashUnit(index + 40),
      })),
    [],
  );

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const time = reducedMotion ? 0 : state.clock.elapsedTime;
    for (let index = 0; index < motes.length; index += 1) {
      const mote = motes[index];
      dummy.position.set(
        mote.x + Math.sin(time * 0.08 + mote.phase * 6) * 0.06,
        mote.y + Math.sin(time * 0.05 + mote.phase * 4) * 0.04,
        mote.z + Math.cos(time * 0.07 + mote.phase * 5) * 0.05,
      );
      dummy.scale.setScalar(mote.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group name="Restless air">
      <directionalLight position={[-2.6, 2.4, 1.8]} intensity={0.34} color="#c5d4e4" />
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, motes.length]}
        frustumCulled={false}
        raycast={() => undefined}
        name="Restless motes"
      >
        <sphereGeometry args={[1, 6, 6]} />
        <meshBasicMaterial
          color="#d5e2ee"
          transparent
          opacity={0.42}
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  );
}

export function BreezeRibbons({ reducedMotion }: { reducedMotion: boolean }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const ribbons = useMemo(
    () =>
      Array.from({ length: 18 }, (_, index) => ({
        y: 1.2 + hashUnit(index + 5) * 4.6,
        z: (hashUnit(index + 17) - 0.5) * 4.2,
        phase: hashUnit(index + 29),
        length: 1.6 + hashUnit(index + 41) * 2.2,
      })),
    [],
  );

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const time = reducedMotion ? 0 : state.clock.elapsedTime;
    for (let index = 0; index < ribbons.length; index += 1) {
      const ribbon = ribbons[index];
      const travel = ((time * 0.18 + ribbon.phase) % 1) * 10 - 5;
      dummy.position.set(travel, ribbon.y, ribbon.z);
      dummy.rotation.set(0.1, 0, -0.18);
      dummy.scale.set(ribbon.length, 0.012, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, ribbons.length]}
      frustumCulled={false}
      raycast={() => undefined}
      name="Breeze ribbons"
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        color="#d7e0d4"
        transparent
        opacity={0.16}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
}

function createFallingPetalGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.08);
  shape.quadraticCurveTo(0.045, 0.05, 0.038, 0.01);
  shape.quadraticCurveTo(0.012, -0.01, 0, -0.006);
  shape.quadraticCurveTo(-0.012, -0.01, -0.038, 0.01);
  shape.quadraticCurveTo(-0.045, 0.05, 0, 0.08);
  const geometry = new THREE.ShapeGeometry(shape, 6);
  geometry.center();
  return geometry;
}

export function FallingPetals({
  journalCount,
  weatherKind,
  reducedMotion,
}: {
  journalCount: number;
  weatherKind: GardenWeatherKind;
  reducedMotion: boolean;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const life = gardenLifeForWeather(weatherKind);
  const count = Math.min(
    life.petalCap,
    journalCount < 12 ? 0 : journalCount < 48 ? 8 : journalCount < 96 ? 16 : life.petalCap,
  );
  const petalGeometry = useMemo(() => createFallingPetalGeometry(), []);
  const petals = useMemo(
    () =>
      Array.from({ length: Math.max(count, 1) }, (_, index) => ({
        x: (hashUnit(index + 8) - 0.5) * 5.4,
        y: 1.8 + hashUnit(index + 21) * 5.6,
        z: (hashUnit(index + 34) - 0.5) * 4.2,
        spin: hashUnit(index + 47) * Math.PI * 2,
        tumble: 0.4 + hashUnit(index + 59) * 1.4,
        drift: 0.12 + hashUnit(index + 71) * 0.22,
        speed: 0.18 + hashUnit(index + 83) * 0.28,
        size: 0.055 + hashUnit(index + 97) * 0.04,
        phase: hashUnit(index + 109),
      })),
    [count],
  );

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh || count === 0) return;
    const step = reducedMotion ? delta * 0.12 : delta;
    const wind = life.windScale;
    const pointerX = state.pointer.x;
    for (let index = 0; index < count; index += 1) {
      const petal = petals[index];
      petal.y -= petal.speed * step * (0.7 + wind * 0.25);
      petal.x +=
        Math.sin(state.clock.elapsedTime * 0.55 + petal.phase * 6) *
          petal.drift *
          step *
          wind +
        pointerX * step * 0.18;
      petal.spin += petal.tumble * step;
      if (petal.y < 0.02) {
        petal.y = 6.4;
        petal.x = (hashUnit(index + Math.floor(state.clock.elapsedTime * 4)) - 0.5) * 5.4;
      }
      dummy.position.set(petal.x, petal.y, petal.z);
      dummy.rotation.set(petal.spin * 0.6, petal.spin, petal.spin * 0.35);
      dummy.scale.setScalar(petal.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (count === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, Math.max(count, 1)]}
      frustumCulled={false}
      raycast={() => undefined}
      name="Falling petals"
    >
      <primitive object={petalGeometry} attach="geometry" />
      <meshStandardMaterial
        color="#f3c5cd"
        roughness={0.72}
        metalness={0}
        side={THREE.DoubleSide}
        transparent
        opacity={0.88}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

export function QuietMotes({
  weatherKind,
  reducedMotion,
}: {
  weatherKind: GardenWeatherKind;
  reducedMotion: boolean;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const warm = weatherKind === "sunbreak";
  const motes = useMemo(
    () =>
      Array.from({ length: warm ? 36 : 22 }, (_, index) => ({
        x: (hashUnit(index + 4) - 0.5) * 5.2,
        y: 0.4 + hashUnit(index + 18) * 5.4,
        z: (hashUnit(index + 33) - 0.5) * 4.4,
        size: 0.008 + hashUnit(index + 48) * 0.012,
        phase: hashUnit(index + 62),
      })),
    [warm],
  );

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const time = reducedMotion ? 0 : state.clock.elapsedTime;
    for (let index = 0; index < motes.length; index += 1) {
      const mote = motes[index];
      dummy.position.set(
        mote.x + Math.sin(time * 0.18 + mote.phase * 6) * 0.16,
        mote.y + Math.sin(time * 0.12 + mote.phase * 4) * 0.1,
        mote.z + Math.cos(time * 0.16 + mote.phase * 5) * 0.12,
      );
      dummy.scale.setScalar(mote.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, motes.length]}
      frustumCulled={false}
      raycast={() => undefined}
      name="Quiet motes"
    >
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial
        color={warm ? "#ffe7b8" : "#fff6ea"}
        transparent
        opacity={warm ? 0.38 : 0.22}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

function courtyardIbl(kind: GardenWeatherKind) {
  if (kind === "rain") {
    return {
      environmentIntensity: 0.3,
      sky: "#c5d3dc",
      skyIntensity: 0.62,
      gravel: "#64645e",
      gravelIntensity: 0.18,
      fill: "#9aadb8",
      fillIntensity: 0.14,
    };
  }
  if (kind === "mist") {
    return {
      environmentIntensity: 0.26,
      sky: "#d5d9de",
      skyIntensity: 0.56,
      gravel: "#aea8a0",
      gravelIntensity: 0.2,
      fill: "#c5ccd2",
      fillIntensity: 0.16,
    };
  }
  const life = gardenLifeForWeather(kind);
  if (kind === "restless") {
    return {
      environmentIntensity: 0.28,
      sky: "#e7eef3",
      skyIntensity: 0.5,
      gravel: "#b3aea6",
      gravelIntensity: 0.18,
      fill: "#d5dee8",
      fillIntensity: 0.14,
    };
  }
  if (kind === "sunbreak") {
    return {
      environmentIntensity: 0.36 + life.glare * 0.04,
      sky: "#fff1c8",
      skyIntensity: 0.78,
      gravel: "#c9b48a",
      gravelIntensity: 0.28,
      fill: "#ffe2b0",
      fillIntensity: 0.24,
    };
  }
  return {
    environmentIntensity: 0.32 + life.glare * 0.03,
    sky: "#f3e6d2",
    skyIntensity: 0.66,
    gravel: "#c2b296",
    gravelIntensity: 0.24,
    fill: "#ead8c0",
    fillIntensity: 0.18,
  };
}

/** Key directional: existing courtyard lamp, slightly warmed/boosted by glare. */
export function courtyardKeyLight(kind: GardenWeatherKind): {
  color: string;
  intensity: number;
} {
  const life = gardenLifeForWeather(kind);
  const color = new THREE.Color(
    kind === "rain" ? "#d5dde4" : kind === "mist" ? "#e6ddd4" : "#ffe4c4",
  );
  if (life.glare > 0 && kind !== "rain" && kind !== "mist") {
    color.lerp(new THREE.Color("#ffd089"), life.glare * 0.55);
  }
  return {
    color: `#${color.getHexString()}`,
    intensity: 2.35 * life.lightScale * (1 + life.glare * 0.12),
  };
}

/**
 * Cheap courtyard PMREM. Sets scene.environment so bark/petal envMapIntensity
 * can work. Fill only — existing key lights stay in charge.
 */
export const CourtyardEnvironment = memo(function CourtyardEnvironment({
  weatherKind,
}: {
  weatherKind: GardenWeatherKind;
}) {
  const ibl = courtyardIbl(weatherKind);
  return (
    <Environment
      frames={1}
      resolution={64}
      near={0.5}
      far={24}
      environmentIntensity={ibl.environmentIntensity}
    >
      <Lightformer
        form="circle"
        intensity={ibl.skyIntensity}
        color={ibl.sky}
        position={[0, 8.2, -1.4]}
        scale={16}
      />
      <Lightformer
        form="rect"
        intensity={ibl.gravelIntensity}
        color={ibl.gravel}
        position={[0, -1.15, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[12, 12]}
      />
      <Lightformer
        form="rect"
        intensity={ibl.fillIntensity}
        color={ibl.fill}
        position={[6.2, 3.1, -3.4]}
        scale={[7, 3.2]}
      />
      <Lightformer
        form="rect"
        intensity={ibl.fillIntensity * 0.72}
        color={ibl.fill}
        position={[-5.4, 2.2, 3.6]}
        scale={[5.2, 2.6]}
      />
    </Environment>
  );
});

const EXPOSURE_EASE_SECONDS = 2.4;

function exposureForWeather(kind: GardenWeatherKind): number {
  return kind === "rain"
    ? 1
    : kind === "sunbreak"
      ? 1.2
      : kind === "mist"
        ? 1.02
        : kind === "dew"
          ? 1.08
          : kind === "restless"
            ? 1.06
            : 1.04;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function WeatherGrade({ kind }: { kind: GardenWeatherKind }) {
  const { gl } = useThree();
  const fromExposure = useRef(gl.toneMappingExposure);
  const toward = useRef<number | null>(null);
  const elapsed = useRef(0);

  useFrame((_, delta) => {
    const target = exposureForWeather(kind);
    if (prefersReducedMotion()) {
      gl.toneMappingExposure = target;
      fromExposure.current = target;
      toward.current = target;
      elapsed.current = EXPOSURE_EASE_SECONDS;
      return;
    }
    if (toward.current !== target) {
      fromExposure.current = gl.toneMappingExposure;
      toward.current = target;
      elapsed.current = 0;
    }
    elapsed.current = Math.min(EXPOSURE_EASE_SECONDS, elapsed.current + delta);
    const t = elapsed.current / EXPOSURE_EASE_SECONDS;
    const eased = t * t * (3 - 2 * t);
    gl.toneMappingExposure =
      fromExposure.current + (target - fromExposure.current) * eased;
  });

  return null;
}

export function SoftContactShadows() {
  const groupRef = useRef<THREE.Group>(null);
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const strip = () => disableRaycast(group);
    strip();
    const id = requestAnimationFrame(strip);
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <group ref={groupRef}>
      <ContactShadows
        position={[0, -0.018, 0]}
        opacity={0.28}
        scale={12}
        blur={4.8}
        far={4.8}
        resolution={512}
        color="#6e5c52"
      />
    </group>
  );
}

export function GardenWeatherLayer({
  weatherKind,
  journalCount,
  reducedMotion,
  structureOnly,
}: {
  weatherKind: GardenWeatherKind;
  journalCount: number;
  reducedMotion: boolean;
  structureOnly: boolean;
}) {
  if (structureOnly) return null;
  return (
    <group name="Garden weather">
      {weatherKind === "sunbreak" ? <SunGlow /> : null}
      {weatherKind === "rain" ? <SoftRain reducedMotion={reducedMotion} /> : null}
      {weatherKind === "dew" ? <MorningDew /> : null}
      {weatherKind === "mist" ? <SoftMist reducedMotion={reducedMotion} /> : null}
      {weatherKind === "breeze" ? (
        <BreezeRibbons reducedMotion={reducedMotion} />
      ) : null}
      {weatherKind === "restless" ? (
        <RestlessAir reducedMotion={reducedMotion} />
      ) : null}
      {weatherKind === "still" ||
      weatherKind === "sunbreak" ||
      weatherKind === "dew" ? (
        <QuietMotes weatherKind={weatherKind} reducedMotion={reducedMotion} />
      ) : null}
      <FallingPetals
        journalCount={journalCount}
        weatherKind={weatherKind}
        reducedMotion={reducedMotion}
      />
    </group>
  );
}
