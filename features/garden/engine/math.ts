import type { CubicBranch, Vec3Tuple } from "../types";

export const TAU = Math.PI * 2;

export function xmur3(value: string): () => number {
  let hash = 1779033703 ^ value.length;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return (hash ^= hash >>> 16) >>> 0;
  };
}

export function seededRandom(seed: string | number): () => number {
  const seedFactory = xmur3(String(seed));
  let state = seedFactory();
  return () => {
    let value = (state += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function add(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function subtract(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function multiply(vector: Vec3Tuple, value: number): Vec3Tuple {
  return [vector[0] * value, vector[1] * value, vector[2] * value];
}

export function dot(a: Vec3Tuple, b: Vec3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function magnitude(vector: Vec3Tuple): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

export function normalize(vector: Vec3Tuple): Vec3Tuple {
  const length = magnitude(vector);
  return length < 1e-8 ? [0, 1, 0] : multiply(vector, 1 / length);
}

export function lerp(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

export function lerpVector(
  a: Vec3Tuple,
  b: Vec3Tuple,
  amount: number,
): Vec3Tuple {
  return [
    lerp(a[0], b[0], amount),
    lerp(a[1], b[1], amount),
    lerp(a[2], b[2], amount),
  ];
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function distance(a: Vec3Tuple, b: Vec3Tuple): number {
  return magnitude(subtract(a, b));
}

export function sampleCubic(
  branch: CubicBranch,
  amount: number,
): Vec3Tuple {
  const inverse = 1 - amount;
  const a = inverse * inverse * inverse;
  const b = 3 * inverse * inverse * amount;
  const c = 3 * inverse * amount * amount;
  const d = amount * amount * amount;
  return [
    a * branch.start[0] +
      b * branch.controlA[0] +
      c * branch.controlB[0] +
      d * branch.end[0],
    a * branch.start[1] +
      b * branch.controlA[1] +
      c * branch.controlB[1] +
      d * branch.end[1],
    a * branch.start[2] +
      b * branch.controlA[2] +
      c * branch.controlB[2] +
      d * branch.end[2],
  ];
}

export function cubicTangent(
  branch: CubicBranch,
  amount: number,
): Vec3Tuple {
  const inverse = 1 - amount;
  return normalize([
    3 * inverse * inverse * (branch.controlA[0] - branch.start[0]) +
      6 * inverse * amount * (branch.controlB[0] - branch.controlA[0]) +
      3 * amount * amount * (branch.end[0] - branch.controlB[0]),
    3 * inverse * inverse * (branch.controlA[1] - branch.start[1]) +
      6 * inverse * amount * (branch.controlB[1] - branch.controlA[1]) +
      3 * amount * amount * (branch.end[1] - branch.controlB[1]),
    3 * inverse * inverse * (branch.controlA[2] - branch.start[2]) +
      6 * inverse * amount * (branch.controlB[2] - branch.controlA[2]) +
      3 * amount * amount * (branch.end[2] - branch.controlB[2]),
  ]);
}
