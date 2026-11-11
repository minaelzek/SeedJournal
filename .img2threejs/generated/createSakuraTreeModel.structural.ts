import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type ProceduralModelOptions = {
  wireframe?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  textureSize?: number;
  textureAnisotropy?: number;
  qualityPriority?: 'reference-fidelity' | 'balanced';
};

export type ProceduralModelRuntime = {
  nodes: Record<string, THREE.Object3D>;
  meshes: Record<string, THREE.Mesh>;
  sockets: Record<string, THREE.Object3D>;
  colliders: Record<string, unknown>;
  destructionGroups: Record<string, THREE.Object3D[]>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generated schema material payload.
type SculptMaterialSpec = Record<string, any>;

function buildTubeGeometry(
  path: { points: [number, number, number][]; radius?: number; radialSegments?: number; closed?: boolean },
): THREE.TubeGeometry {
  const vectors = path.points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(vectors, path.closed ?? false);
  const tubularSegments = Math.max(8, path.points.length * 6);
  return new THREE.TubeGeometry(curve, tubularSegments, path.radius ?? 0.05, path.radialSegments ?? 8, path.closed ?? false);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function readLayerNumber(value: unknown, keys: string[], fallback: number): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      if (typeof record[key] === 'number') return record[key] as number;
    }
  }
  return fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = /^#[0-9a-f]{3}$/i.test(hex)
    ? '#' + hex.slice(1).split('').map((part) => part + part).join('')
    : hex;
  const value = /^#[0-9a-f]{6}$/i.test(normalized) ? Number.parseInt(normalized.slice(1), 16) : 0x8a7a5f;
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function materialPalette(spec: SculptMaterialSpec): string[] {
  const palette = spec.colorVariation?.palette;
  if (Array.isArray(palette) && palette.length > 0) return palette.filter((value) => typeof value === 'string');
  const secondary = spec.albedo?.secondary;
  const colors = [spec.baseColor ?? spec.color ?? spec.albedo?.dominant, ...(Array.isArray(secondary) ? secondary : [])];
  return colors.filter((value): value is string => typeof value === 'string' && value.startsWith('#'));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothCurve(value: number): number {
  return value * value * (3 - 2 * value);
}

function periodicHash(x: number, y: number, seed: number, periodX: number, periodY: number): number {
  const wrappedX = ((x % periodX) + periodX) % periodX;
  const wrappedY = ((y % periodY) + periodY) % periodY;
  let value = Math.imul(wrappedX + seed * 17, 374761393) ^ Math.imul(wrappedY + seed * 31, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function periodicValueNoise(u: number, v: number, seed: number, periodX: number, periodY: number): number {
  const x = u * periodX;
  const y = v * periodY;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothCurve(x - x0);
  const ty = smoothCurve(y - y0);
  const a = periodicHash(x0, y0, seed, periodX, periodY);
  const b = periodicHash(x0 + 1, y0, seed, periodX, periodY);
  const c = periodicHash(x0, y0 + 1, seed, periodX, periodY);
  const d = periodicHash(x0 + 1, y0 + 1, seed, periodX, periodY);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), ty);
}

type SurfaceBand = {
  frequency: number;
  amplitude: number;
  stretchX: number;
  stretchY: number;
  ridge: boolean;
};

function surfaceBands(spec: SculptMaterialSpec): SurfaceBand[] {
  const source = Array.isArray(spec.surfaceFrequencyBands) ? spec.surfaceFrequencyBands : [];
  const parsed = source.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const band = item as Record<string, unknown>;
    const frequency = typeof band.frequency === 'number' ? band.frequency : 0;
    const amplitude = typeof band.amplitude === 'number' ? band.amplitude : 0;
    if (frequency <= 0 || amplitude <= 0) return [];
    const stretch = Array.isArray(band.stretch) ? band.stretch : [1, 1];
    const description = `${String(band.pattern ?? '')} ${String(band.role ?? '')}`.toLowerCase();
    return [{
      frequency,
      amplitude,
      stretchX: typeof stretch[0] === 'number' ? Math.max(0.1, stretch[0]) : 1,
      stretchY: typeof stretch[1] === 'number' ? Math.max(0.1, stretch[1]) : 1,
      ridge: /(ridge|groove|grain|fiber|striated|crack)/.test(description),
    }];
  });
  return parsed.length > 0 ? parsed : [
    { frequency: 2, amplitude: 0.42, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 12, amplitude: 0.22, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 56, amplitude: 0.08, stretchX: 1, stretchY: 1, ridge: false },
  ];
}

function sampleSurface(u: number, v: number, bands: SurfaceBand[], seed: number): number {
  let value = 0;
  let weight = 0;
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index];
    const periodX = Math.max(1, Math.round(band.frequency * band.stretchX));
    const periodY = Math.max(1, Math.round(band.frequency * band.stretchY));
    let sample = periodicValueNoise(u, v, seed + index * 1013, periodX, periodY);
    if (band.ridge) sample = 1 - Math.abs(sample * 2 - 1);
    value += sample * band.amplitude;
    weight += band.amplitude;
  }
  return weight > 0 ? clamp01(value / weight) : 0.5;
}

function mixPalette(colors: [number, number, number][], value: number): [number, number, number] {
  if (colors.length === 1) return colors[0];
  const scaled = clamp01(value) * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(scaled));
  const mix = scaled - index;
  const a = colors[index];
  const b = colors[index + 1];
  return [
    Math.round(THREE.MathUtils.lerp(a[0], b[0], mix)),
    Math.round(THREE.MathUtils.lerp(a[1], b[1], mix)),
    Math.round(THREE.MathUtils.lerp(a[2], b[2], mix)),
  ];
}

type ColorGradientStop = { offset: number; color: string };
type ColorGradientSpec = {
  type: 'linear' | 'radial';
  axis: [number, number];
  stops: ColorGradientStop[];
};

function parseRgba(value: string): [number, number, number] {
  const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);
  if (!match) return [138, 122, 95];
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

// Analytical per-pixel gradient sample. The extraction schema's colorGradient carries
// exact rgba(...) stop colors (see extract_part_color_recipe.py), so this samples the
// same trend directly in JS math rather than round-tripping through a Canvas 2D
// createLinearGradient/createRadialGradient object — same visual result, and it composes
// directly with the existing noise/height-correlated colorVariation blend below.
function sampleColorGradient(gradient: ColorGradientSpec, u: number, v: number): [number, number, number] {
  const stops = gradient.stops.length >= 2 ? gradient.stops : [{ offset: 0, color: 'rgba(138,122,95,1)' }, { offset: 1, color: 'rgba(138,122,95,1)' }];
  let t: number;
  if (gradient.type === 'radial') {
    const [cx, cy] = gradient.axis;
    const dx = u - cx;
    const dy = v - cy;
    const maxRadius = Math.max(0.001, Math.hypot(Math.max(cx, 1 - cx), Math.max(cy, 1 - cy)));
    t = clamp01(Math.hypot(dx, dy) / maxRadius);
  } else {
    const [ax, ay] = gradient.axis;
    const projection = (u - 0.5) * ax + (v - 0.5) * ay;
    const maxProjection = 0.5 * (Math.abs(ax) + Math.abs(ay)) || 0.5;
    t = clamp01(projection / maxProjection + 0.5);
  }
  const scaled = t * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.max(0, Math.floor(scaled)));
  const mix = scaled - index;
  const a = parseRgba(stops[index].color);
  const b = parseRgba(stops[index + 1].color);
  return [
    THREE.MathUtils.lerp(a[0], b[0], mix),
    THREE.MathUtils.lerp(a[1], b[1], mix),
    THREE.MathUtils.lerp(a[2], b[2], mix),
  ];
}

function writePixel(data: Uint8ClampedArray, offset: number, red: number, green: number, blue: number): void {
  data[offset] = Math.max(0, Math.min(255, Math.round(red)));
  data[offset + 1] = Math.max(0, Math.min(255, Math.round(green)));
  data[offset + 2] = Math.max(0, Math.min(255, Math.round(blue)));
  data[offset + 3] = 255;
}

function makeCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function createMapTexture(
  canvas: HTMLCanvasElement,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [2, 2];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 2,
    typeof repeat[1] === 'number' ? repeat[1] : 2,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

type ProceduralTextureSet = {
  albedo: THREE.Texture;
  roughness: THREE.Texture;
  height: THREE.Texture;
  normal: THREE.Texture;
  ao: THREE.Texture;
  source: 'reference-pixel-extraction' | 'procedural';
};

function referenceMapUrl(spec: SculptMaterialSpec, channel: string): string | null {
  const reference = spec.referencePbr;
  if (!reference || typeof reference !== 'object') return null;
  if (reference.usable === false) return null;
  const confidence = typeof reference.confidence === 'number'
    ? reference.confidence
    : (typeof reference.estimatedFidelity === 'number' ? reference.estimatedFidelity : 0);
  const threshold = typeof reference.targetThreshold === 'number' ? reference.targetThreshold : 0.7;
  if (confidence < threshold) return null;
  const maps = reference.maps;
  if (!maps || typeof maps !== 'object') return null;
  const map = (maps as Record<string, unknown>)[channel];
  if (!map || typeof map !== 'object') return null;
  const record = map as Record<string, unknown>;
  const url = typeof record.url === 'string' && record.url.trim() ? record.url : record.path;
  return typeof url === 'string' && url.trim() ? url : null;
}

function createLoadedMapTexture(
  url: string,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.Texture {
  const texture = new THREE.TextureLoader().load(url);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [1, 1];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 1,
    typeof repeat[1] === 'number' ? repeat[1] : 1,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

function makeReferenceTextureSet(spec: SculptMaterialSpec, options: ProceduralModelOptions): ProceduralTextureSet | null {
  const albedo = referenceMapUrl(spec, 'albedo');
  const roughness = referenceMapUrl(spec, 'roughness');
  const height = referenceMapUrl(spec, 'height');
  const normal = referenceMapUrl(spec, 'normal');
  const ao = referenceMapUrl(spec, 'ao');
  if (!albedo || !roughness || !height || !normal || !ao) return null;
  return {
    albedo: createLoadedMapTexture(albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createLoadedMapTexture(roughness, THREE.NoColorSpace, spec, options),
    height: createLoadedMapTexture(height, THREE.NoColorSpace, spec, options),
    normal: createLoadedMapTexture(normal, THREE.NoColorSpace, spec, options),
    ao: createLoadedMapTexture(ao, THREE.NoColorSpace, spec, options),
    source: 'reference-pixel-extraction',
  };
}

function makeProceduralTextureSet(
  id: string,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): ProceduralTextureSet | null {
  if (typeof document === 'undefined') return null;
  const qualityFirst = (options.qualityPriority ?? 'reference-fidelity') === 'reference-fidelity';
  const requested = options.textureSize ?? spec.textureResolution;
  const requestedSize = typeof requested === 'number' && Number.isFinite(requested)
    ? requested
    : (qualityFirst ? 1024 : 512);
  const size = Math.max(256, Math.min(2048, 2 ** Math.round(Math.log2(requestedSize))));
  const canvases = {
    albedo: makeCanvas(size),
    roughness: makeCanvas(size),
    height: makeCanvas(size),
    normal: makeCanvas(size),
    ao: makeCanvas(size),
  };
  const contexts = {
    albedo: canvases.albedo.getContext('2d'),
    roughness: canvases.roughness.getContext('2d'),
    height: canvases.height.getContext('2d'),
    normal: canvases.normal.getContext('2d'),
    ao: canvases.ao.getContext('2d'),
  };
  if (!contexts.albedo || !contexts.roughness || !contexts.height || !contexts.normal || !contexts.ao) return null;
  const images = {
    albedo: contexts.albedo.createImageData(size, size),
    roughness: contexts.roughness.createImageData(size, size),
    height: contexts.height.createImageData(size, size),
    normal: contexts.normal.createImageData(size, size),
    ao: contexts.ao.createImageData(size, size),
  };
  const seed = hashString(id);
  const bands = surfaceBands(spec);
  const heightField = new Float32Array(size * size);
  const roughnessField = new Float32Array(size * size);
  const palette = materialPalette(spec);
  const fallback = typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F';
  const colors = (palette.length >= 2 ? palette : [fallback, '#6E614B', '#A08F70']).map(hexToRgb);
  const baseRoughness = clamp01(readLayerNumber(spec.roughness, ['base'], 0.76));
  const roughnessVariation = clamp01(readLayerNumber(spec.roughness, ['variation'], 0.18));
  const colorAmplitude = clamp01(readLayerNumber(spec.colorVariation, ['amplitude', 'variation'], 0.18));
  const heightCorrelation = clamp01(readLayerNumber(spec.colorVariation, ['heightCorrelation'], 0.3));
  const colorGradient: ColorGradientSpec | undefined = spec.colorGradient;
  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const index = y * size + x;
      const height = sampleSurface(u, v, bands, seed + 101);
      const roughNoise = sampleSurface(u, v, bands, seed + 7001);
      const colorNoise = sampleSurface(u, v, bands, seed + 15013);
      heightField[index] = height;
      roughnessField[index] = clamp01(baseRoughness + (roughNoise - 0.5) * roughnessVariation * 2);
      let color: [number, number, number];
      if (colorGradient) {
        // Evidence-derived spatial gradient (Plan 1.3 Workstream C) takes priority
        // over the noise-based palette blend below — it is a measured trend, not a guess.
        color = sampleColorGradient(colorGradient, u, v);
      } else {
        const paletteValue = clamp01(
          0.5 + (colorNoise - 0.5) * colorAmplitude * 2 + (height - 0.5) * heightCorrelation
        );
        color = mixPalette(colors, paletteValue);
      }
      writePixel(images.albedo.data, index * 4, color[0], color[1], color[2]);
    }
  }
  const normalStrength = Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35));
  const aoStrength = clamp01(readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35));
  for (let y = 0; y < size; y += 1) {
    const up = ((y - 1 + size) % size) * size;
    const down = ((y + 1) % size) * size;
    for (let x = 0; x < size; x += 1) {
      const left = (x - 1 + size) % size;
      const right = (x + 1) % size;
      const index = y * size + x;
      const center = heightField[index];
      const dx = (heightField[y * size + right] - heightField[y * size + left]) * normalStrength * 6;
      const dy = (heightField[down + x] - heightField[up + x]) * normalStrength * 6;
      const inverseLength = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const normalX = -dx * inverseLength;
      const normalY = -dy * inverseLength;
      const normalZ = inverseLength;
      const neighborAverage = (
        heightField[y * size + left] + heightField[y * size + right]
        + heightField[up + x] + heightField[down + x]
      ) * 0.25;
      const cavity = Math.max(0, neighborAverage - center);
      const ao = clamp01(1 - aoStrength * (cavity * 12 + (1 - center) * 0.16));
      const offset = index * 4;
      const heightByte = center * 255;
      const roughnessByte = roughnessField[index] * 255;
      writePixel(images.height.data, offset, heightByte, heightByte, heightByte);
      writePixel(images.roughness.data, offset, roughnessByte, roughnessByte, roughnessByte);
      writePixel(
        images.normal.data, offset,
        (normalX * 0.5 + 0.5) * 255,
        (normalY * 0.5 + 0.5) * 255,
        (normalZ * 0.5 + 0.5) * 255,
      );
      writePixel(images.ao.data, offset, ao * 255, ao * 255, ao * 255);
    }
  }
  contexts.albedo.putImageData(images.albedo, 0, 0);
  contexts.roughness.putImageData(images.roughness, 0, 0);
  contexts.height.putImageData(images.height, 0, 0);
  contexts.normal.putImageData(images.normal, 0, 0);
  contexts.ao.putImageData(images.ao, 0, 0);
  return {
    albedo: createMapTexture(canvases.albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createMapTexture(canvases.roughness, THREE.NoColorSpace, spec, options),
    height: createMapTexture(canvases.height, THREE.NoColorSpace, spec, options),
    normal: createMapTexture(canvases.normal, THREE.NoColorSpace, spec, options),
    ao: createMapTexture(canvases.ao, THREE.NoColorSpace, spec, options),
    source: 'procedural',
  };
}

function createSculptMaterial(id: string, spec: SculptMaterialSpec, options: ProceduralModelOptions): THREE.MeshPhysicalMaterial {
  const textures = makeReferenceTextureSet(spec, options) ?? makeProceduralTextureSet(id, spec, options);
  const material = new THREE.MeshPhysicalMaterial({
    color: textures ? 0xffffff : new THREE.Color(typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F'),
    roughness: textures ? 1 : clamp01(readLayerNumber(spec.roughness, ['base'], 0.76)),
    metalness: clamp01(readLayerNumber(spec.metalness, ['base'], 0.0)),
    clearcoat: clamp01(readLayerNumber(spec.clearcoat, ['base', 'amount'], 0)),
    clearcoatRoughness: clamp01(readLayerNumber(spec.clearcoatRoughness, ['base'], 0.25)),
    transmission: clamp01(readLayerNumber(spec.transmission, ['base', 'amount'], 0)),
    ior: Math.max(1, readLayerNumber(spec.ior, ['base', 'value'], 1.5)),
    thickness: Math.max(0, readLayerNumber(spec.thickness, ['base', 'amount'], 0)),
    attenuationDistance: Math.max(0.001, readLayerNumber(spec.attenuationDistance, ['base', 'value'], Infinity)),
    attenuationColor: new THREE.Color(typeof spec.attenuationColor === 'string' ? spec.attenuationColor : '#ffffff'),
    sheen: clamp01(readLayerNumber(spec.sheen, ['base', 'amount'], 0)),
    sheenColor: new THREE.Color(typeof spec.sheenColor === 'string' ? spec.sheenColor : '#ffffff'),
    sheenRoughness: clamp01(readLayerNumber(spec.sheenRoughness, ['base'], 1.0)),
    iridescence: clamp01(readLayerNumber(spec.iridescence, ['base', 'amount'], 0)),
    iridescenceIOR: Math.max(1, readLayerNumber(spec.iridescenceIOR, ['base', 'value'], 1.3)),
    anisotropy: clamp01(readLayerNumber(spec.anisotropy, ['base', 'amount'], 0)),
    anisotropyRotation: readLayerNumber(spec.anisotropy, ['rotation'], 0),
    specularIntensity: clamp01(readLayerNumber(spec.specularIntensity, ['base'], 1.0)),
    specularColor: new THREE.Color(typeof spec.specularColor === 'string' ? spec.specularColor : '#ffffff'),
    emissive: new THREE.Color(typeof spec.emissive === 'string' ? spec.emissive : '#000000'),
    emissiveIntensity: Math.max(0, readLayerNumber(spec.emissiveIntensity, ['base'], 1.0)),
    opacity: clamp01(readLayerNumber(spec.opacity, ['base'], 1)),
    transparent: readLayerNumber(spec.transmission, ['base', 'amount'], 0) > 0 || readLayerNumber(spec.opacity, ['base'], 1) < 1,
    alphaTest: Math.max(0, readLayerNumber(spec.alpha, ['cutoff', 'alphaTest'], 0)),
    wireframe: options.wireframe ?? false,
    side: spec.doubleSided === true ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (textures) {
    material.map = textures.albedo;
    material.roughnessMap = textures.roughness;
    material.normalMap = textures.normal;
    material.normalScale.setScalar(Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35)));
    material.aoMap = textures.ao;
    material.aoMap.channel = 0;
    material.aoMapIntensity = readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35);
    const bumpScale = Math.max(0, readLayerNumber(spec.bump, ['amplitude', 'strength'], 0));
    if (bumpScale > 0) {
      material.bumpMap = textures.height;
      material.bumpScale = bumpScale;
    }
    const displacementScale = Math.max(0, readLayerNumber(spec.displacement, ['amplitude', 'strength'], 0));
    if (displacementScale > 0) {
      material.displacementMap = textures.height;
      material.displacementScale = displacementScale;
      material.displacementBias = -displacementScale * 0.5;
    }
  }
  material.envMapIntensity = readLayerNumber(spec, ['envMapIntensity'], 0.8);
  material.userData.sculptMaterial = spec;
  material.userData.proceduralMapsIndependent = true;
  material.userData.pbrTextureSource = textures?.source ?? 'flat-fallback';
  material.userData.referencePbr = spec.referencePbr ?? null;
  material.needsUpdate = true;
  return material;
}

type AttachmentEndpoint = {
  start: THREE.Vector3;
  midpoint: THREE.Vector3;
  quaternion: THREE.Quaternion;
  length: number;
  baseRadius: number;
  endRadius: number;
};

function readVector3(value: unknown, fallback: [number, number, number]): THREE.Vector3 {
  if (Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === 'number')) {
    return new THREE.Vector3(value[0], value[1], value[2]);
  }
  return new THREE.Vector3(fallback[0], fallback[1], fallback[2]);
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function makeAttachmentEndpoint(attachment: unknown): AttachmentEndpoint | null {
  if (!attachment || typeof attachment !== 'object') return null;
  const record = attachment as Record<string, unknown>;
  const start = readVector3(record.localStart, [0, 0, 0]);
  const end = readVector3(record.localEnd, [0, 1, 0]);
  const delta = end.clone().sub(start);
  const length = delta.length();
  if (length <= 0.0001) return null;
  const direction = delta.clone().normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  const baseRadius = Math.max(0.005, readNumber(record.baseRadius, 0.06));
  const endRadius = Math.max(0.003, readNumber(record.endRadius, baseRadius * 0.55));
  return {
    start,
    midpoint: delta.multiplyScalar(0.5),
    quaternion,
    length,
    baseRadius,
    endRadius,
  };
}

// Generated from ObjectSculptSpec target: Sakura Tree
// Sculpt build pass: structural-pass
// This factory is intentionally pass-gated. Finish browser screenshot review before unlocking deeper passes.
export function createSakuraTreeModel(options: ProceduralModelOptions = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = "Sakura Tree";
  root.userData.reconstructionEvidence = {"itemFamily": null, "subtype": null, "componentAdapter": null, "route": null, "exactnessTier": null, "referenceCamera": {"solved": false, "fovDegrees": 40.0, "aspect": 1.0, "orientation": {"yaw": 0.0, "pitch": 0.0, "roll": 0.0}, "positionHint": [0.0, 0.0, 3.0], "note": "For likeness work, solve the reference camera (forge/stage1_intake/solve_camera_pose.py) so the review render aligns with the photo and the reference can be projected. Confirm by overlay review."}, "approximationNotes": []};

  const materialMap: Record<string, THREE.Material> = {};
  materialMap["bark"] = createSculptMaterial(
    "bark",
    {"id": "bark", "name": "Faceted bark", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "qualityTier": "reference", "baseColor": "#6f5a4a", "color": "#6f5a4a", "albedo": {"dominant": "#6f5a4a", "secondary": ["#59483d", "#88705b", "#9b846c"], "samplingNotes": "Sampled from the visible trunk and scaffold bark planes."}, "colorVariation": {"palette": ["#59483d", "#6f5a4a", "#88705b", "#9b846c"], "pattern": "vertical faceted grain with low-frequency planar breakup", "amplitude": 0.24, "heightCorrelation": 0.45}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [2, 5], "anisotropy": 4, "texelDensityIntent": "Keep bark planes stable across trunk and branch scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2, "amplitude": 0.42, "role": "broad bark value planes"}, {"id": "meso", "frequency": 11, "amplitude": 0.22, "role": "vertical grain and branch-junction relief"}, {"id": "micro", "frequency": 44, "amplitude": 0.07, "role": "subtle highlight breakup"}], "roughness": {"base": 0.84, "variation": 0.12, "map": "independent-procedural-roughness", "localResponse": "rougher in bark creases and root contact, slightly satin on raised planes"}, "metalness": {"base": 0, "variation": 0}, "normal": {"pattern": "independent faceted bark relief", "strength": 0.28, "scale": 18, "space": "tangent"}, "bump": {"pattern": "fine bark grain", "amplitude": 0.04, "scale": 32}, "displacement": {"pattern": "none", "amplitude": 0, "scale": 1, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.48, "contactShadowBias": 0.3, "notes": "Darken branch junctions and root flare contact."}, "wear": {"edgeWear": 0.05, "scratches": [], "chips": []}, "dirt": {"amount": 0.18, "cavityBias": 0.4, "color": "#3d3029"}, "localOverrides": [{"id": "root-contact", "region": "lower trunk and root flare", "roughness": 0.94, "dirtAmount": 0.28, "evidenceRefs": ["full-object"]}], "notes": "Dielectric bark; no metallic response."},
    options
  );
  materialMap["petal"] = createSculptMaterial(
    "petal",
    {"id": "petal", "name": "Sakura petals", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "qualityTier": "reference", "baseColor": "#f2d4d6", "color": "#f2d4d6", "albedo": {"dominant": "#f2d4d6", "secondary": ["#eab5bf", "#f8e6e3", "#d98fa6"], "samplingNotes": "Pale blush and near-white petal planes with a warmer pink edge variation."}, "colorVariation": {"palette": ["#d98fa6", "#eab5bf", "#f2d4d6", "#f8e6e3"], "pattern": "cluster-local pastel variation", "amplitude": 0.18, "heightCorrelation": 0.15}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [3, 3], "anisotropy": 2, "texelDensityIntent": "Keep petals crisp at the reference review distance."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2, "amplitude": 0.18, "role": "cluster value grouping"}, {"id": "meso", "frequency": 7, "amplitude": 0.08, "role": "petal cup variation"}, {"id": "micro", "frequency": 24, "amplitude": 0.025, "role": "soft matte highlight breakup"}], "roughness": {"base": 0.62, "variation": 0.1, "map": "independent-petal-roughness", "localResponse": "slightly satin near petal centers, matte at edges"}, "metalness": {"base": 0, "variation": 0}, "normal": {"pattern": "shallow petal cup", "strength": 0.12, "scale": 12, "space": "tangent"}, "bump": {"pattern": "none", "amplitude": 0, "scale": 1}, "displacement": {"pattern": "none", "amplitude": 0, "scale": 1, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.16, "contactShadowBias": 0.25, "notes": "Small AO at flower centers."}, "wear": {"edgeWear": 0, "scratches": [], "chips": []}, "dirt": {"amount": 0, "cavityBias": 0, "color": "#8e6875"}, "localOverrides": [{"id": "petal-center", "region": "flower center", "roughness": 0.48, "color": "#f5b6a4", "evidenceRefs": ["full-object"]}], "notes": "Opaque thin petals; keep centers warmer without making the flower glossy."},
    options
  );
  materialMap["leaf"] = createSculptMaterial(
    "leaf",
    {"id": "leaf", "name": "Emerging leaves", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "qualityTier": "reference", "baseColor": "#8d9069", "color": "#8d9069", "albedo": {"dominant": "#8d9069", "secondary": ["#727852", "#ad9a63", "#69774e"], "samplingNotes": "Sparse copper-green young leaves appear around blossom tips."}, "colorVariation": {"palette": ["#69774e", "#727852", "#8d9069", "#ad9a63"], "pattern": "per-leaf seasonal variation", "amplitude": 0.2, "heightCorrelation": 0.2}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [2, 2], "anisotropy": 2, "texelDensityIntent": "Keep pointed leaf silhouettes stable."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2, "amplitude": 0.18, "role": "leaf color family"}, {"id": "meso", "frequency": 6, "amplitude": 0.09, "role": "central vein plane"}, {"id": "micro", "frequency": 18, "amplitude": 0.03, "role": "matte leaf breakup"}], "roughness": {"base": 0.72, "variation": 0.12, "map": "independent-leaf-roughness", "localResponse": "slightly satin along the central vein"}, "metalness": {"base": 0, "variation": 0}, "normal": {"pattern": "central leaf vein", "strength": 0.14, "scale": 10, "space": "tangent"}, "bump": {"pattern": "none", "amplitude": 0, "scale": 1}, "displacement": {"pattern": "none", "amplitude": 0, "scale": 1, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.12, "contactShadowBias": 0.2, "notes": "Low AO; leaves are thin and open."}, "wear": {"edgeWear": 0, "scratches": [], "chips": []}, "dirt": {"amount": 0.02, "cavityBias": 0.05, "color": "#4d583c"}, "localOverrides": [{"id": "copper-emergence", "region": "new spring leaves", "color": "#ad9a63", "roughness": 0.68, "evidenceRefs": ["full-object"]}], "notes": "Young leaves are sparse accents, not a dense green canopy."},
    options
  );
  materialMap["ground"] = createSculptMaterial(
    "ground",
    {"id": "ground", "name": "Ground and fallen petals", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "qualityTier": "reference", "baseColor": "#eadfd3", "color": "#eadfd3", "albedo": {"dominant": "#eadfd3", "secondary": ["#f5eee7", "#d9c7bd"], "samplingNotes": "Warm ivory background and sparse detached petals."}, "colorVariation": {"palette": ["#d9c7bd", "#eadfd3", "#f5eee7"], "pattern": "soft warm neutral field", "amplitude": 0.08, "heightCorrelation": 0}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [1, 1], "anisotropy": 1, "texelDensityIntent": "Keep ground neutral and free of visible tiling."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 1, "amplitude": 0.05, "role": "warm background field"}, {"id": "meso", "frequency": 3, "amplitude": 0.025, "role": "soft ground breakup"}, {"id": "micro", "frequency": 8, "amplitude": 0.01, "role": "minimal matte noise"}], "roughness": {"base": 0.94, "variation": 0.04, "map": "independent-ground-roughness", "localResponse": "matte background with slightly darker contact region"}, "metalness": {"base": 0, "variation": 0}, "normal": {"pattern": "none", "strength": 0, "scale": 1, "space": "tangent"}, "bump": {"pattern": "none", "amplitude": 0, "scale": 1}, "displacement": {"pattern": "none", "amplitude": 0, "scale": 1, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.22, "contactShadowBias": 0.22, "notes": "Subtle contact shadow below root flare."}, "wear": {"edgeWear": 0, "scratches": [], "chips": []}, "dirt": {"amount": 0.02, "cavityBias": 0.1, "color": "#b9a59b"}, "localOverrides": [{"id": "petal-ground-accent", "region": "sparse fallen petals around roots", "color": "#eab5bf", "roughness": 0.82, "evidenceRefs": ["full-object"]}], "notes": "A neutral presentation field; no scene clutter."},
    options
  );

  const nodes: Record<string, THREE.Object3D> = { root };
  const meshes: Record<string, THREE.Mesh> = {};
  const sockets: Record<string, THREE.Object3D> = {};
  const colliders: Record<string, unknown> = {};
  const destructionGroups: Record<string, THREE.Object3D[]> = {};

  const attachment_root_0 = null;
  const endpoint_root_0 = makeAttachmentEndpoint(attachment_root_0);
  const node_root_0 = new THREE.Group();
  node_root_0.name = "Trunk__pivot";
  if (endpoint_root_0) {
    node_root_0.position.copy(endpoint_root_0.start);
    node_root_0.rotation.set(0, 0, 0);
    node_root_0.scale.set(1, 1, 1);
  } else {
    node_root_0.position.set(0.0, -3.0, 0.0);
    node_root_0.rotation.set(0.0, 0.0, 0.0);
    node_root_0.scale.set(1.0, 1.0, 1.0);
  }
  node_root_0.userData.sculptComponent = {"id": "root", "name": "Trunk", "level": "macro", "role": "root", "importance": 1.0, "confidence": 0.96, "primitive": "tube", "topologyClass": "continuous-sculpt", "topologyRationale": "The trunk is one continuous organic volume with a curved tapering path; a tube path preserves 3D curvature better than a primitive cylinder.", "geometryDescriptor": {"topologyIntent": "curved tapered trunk with faceted tube rings", "tubePath": {"points": [[0, 0, 0], [0.04, 0.7, 0], [-0.08, 1.5, 0.02], [0.08, 2.4, 0.0], [-0.02, 3.4, 0.0]], "radius": 0.38, "radialSegments": 8, "closed": false}, "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": ["root flare transition", "deterministic bark plane variation"], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"}, "parent": null, "attachment": null, "dimensions": {"width": 1.3, "height": 3.6, "depth": 1.1, "units": "world-relative", "confidence": 0.96}, "transform": {"position": [0, -3.0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "static-tree", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "trunk", "description": "Tapered multi-ring trunk with visible faceted bark planes.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "curved volume and planar bark shading", "confidence": 0.96}, {"id": "canopy-voids", "description": "Open gaps remain readable through the scaffold network.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "preserve negative-space silhouette", "confidence": 0.93}], "surfaceDetail": {"macroRoughness": 0.78, "microRoughness": 0.12, "bumpAmplitude": 0.04, "normalPattern": "faceted procedural variation", "displacementPattern": "none", "occlusionPattern": "contact and branch-junction AO", "edgeWearPattern": "subtle planar value shifts", "notes": "Keep the organic silhouette in geometry; use surface variation only for local response."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.95, "dominantAlbedo": "rgba(111, 90, 74, 1)", "secondaryAlbedo": "rgba(89, 72, 61, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1.0], "stops": [{"offset": 0, "color": "rgba(89, 72, 61, 1)"}, {"offset": 0.55, "color": "rgba(111, 90, 74, 1)"}, {"offset": 1, "color": "rgba(149, 126, 104, 1)"}]}}};
  node_root_0.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "static-tree", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}};
  (nodes["root"] ?? root).add(node_root_0);
  nodes["root"] = node_root_0;
  const mesh_root_0Geometry = endpoint_root_0
    ? new THREE.CylinderGeometry(endpoint_root_0.endRadius, endpoint_root_0.baseRadius, endpoint_root_0.length, 32, 12)
    : buildTubeGeometry({"points": [[0, 0, 0], [0.04, 0.7, 0], [-0.08, 1.5, 0.02], [0.08, 2.4, 0.0], [-0.02, 3.4, 0.0]], "radius": 0.38, "radialSegments": 8, "closed": false});
  const mesh_root_0 = new THREE.Mesh(
    mesh_root_0Geometry,
    materialMap["bark"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_root_0.name = "Trunk";
  if (endpoint_root_0) {
    mesh_root_0.position.copy(endpoint_root_0.midpoint);
    mesh_root_0.quaternion.copy(endpoint_root_0.quaternion);
  }
  mesh_root_0.castShadow = options.castShadow ?? true;
  mesh_root_0.receiveShadow = options.receiveShadow ?? true;
  mesh_root_0.userData.sculptComponent = {"id": "root", "name": "Trunk", "level": "macro", "role": "root", "importance": 1.0, "confidence": 0.96, "primitive": "tube", "topologyClass": "continuous-sculpt", "topologyRationale": "The trunk is one continuous organic volume with a curved tapering path; a tube path preserves 3D curvature better than a primitive cylinder.", "geometryDescriptor": {"topologyIntent": "curved tapered trunk with faceted tube rings", "tubePath": {"points": [[0, 0, 0], [0.04, 0.7, 0], [-0.08, 1.5, 0.02], [0.08, 2.4, 0.0], [-0.02, 3.4, 0.0]], "radius": 0.38, "radialSegments": 8, "closed": false}, "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": ["root flare transition", "deterministic bark plane variation"], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"}, "parent": null, "attachment": null, "dimensions": {"width": 1.3, "height": 3.6, "depth": 1.1, "units": "world-relative", "confidence": 0.96}, "transform": {"position": [0, -3.0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "static-tree", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "trunk", "description": "Tapered multi-ring trunk with visible faceted bark planes.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "curved volume and planar bark shading", "confidence": 0.96}, {"id": "canopy-voids", "description": "Open gaps remain readable through the scaffold network.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "preserve negative-space silhouette", "confidence": 0.93}], "surfaceDetail": {"macroRoughness": 0.78, "microRoughness": 0.12, "bumpAmplitude": 0.04, "normalPattern": "faceted procedural variation", "displacementPattern": "none", "occlusionPattern": "contact and branch-junction AO", "edgeWearPattern": "subtle planar value shifts", "notes": "Keep the organic silhouette in geometry; use surface variation only for local response."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.95, "dominantAlbedo": "rgba(111, 90, 74, 1)", "secondaryAlbedo": "rgba(89, 72, 61, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1.0], "stops": [{"offset": 0, "color": "rgba(89, 72, 61, 1)"}, {"offset": 0.55, "color": "rgba(111, 90, 74, 1)"}, {"offset": 1, "color": "rgba(149, 126, 104, 1)"}]}}};
  node_root_0.add(mesh_root_0);
  meshes["root"] = mesh_root_0;
  colliders["root"] = {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."};
  destructionGroups["static-tree"] ??= [];
  destructionGroups["static-tree"].push(node_root_0);
  const socket_root_branch_tip_0 = new THREE.Object3D();
  socket_root_branch_tip_0.name = "branch-tip";
  socket_root_branch_tip_0.position.set(0.0, 1.0, 0.0);
  socket_root_branch_tip_0.rotation.set(0.0, 0.0, 0.0);
  socket_root_branch_tip_0.userData.socket = {"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"};
  node_root_0.add(socket_root_branch_tip_0);
  sockets["root:branch-tip"] = socket_root_branch_tip_0;

  const attachment_root_flare_1 = null;
  const endpoint_root_flare_1 = makeAttachmentEndpoint(attachment_root_flare_1);
  const node_root_flare_1 = new THREE.Group();
  node_root_flare_1.name = "Buttress mass__pivot";
  if (endpoint_root_flare_1) {
    node_root_flare_1.position.copy(endpoint_root_flare_1.start);
    node_root_flare_1.rotation.set(0, 0, 0);
    node_root_flare_1.scale.set(1, 1, 1);
  } else {
    node_root_flare_1.position.set(0.0, 0.06, 0.0);
    node_root_flare_1.rotation.set(0.0, 0.0, 0.0);
    node_root_flare_1.scale.set(1.65, 0.46, 1.1);
  }
  node_root_flare_1.userData.sculptComponent = {"id": "root-flare", "name": "Buttress mass", "level": "macro", "role": "base-accent", "importance": 0.82, "confidence": 0.84, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "The root flare is a continuous organic swell at the trunk base, represented by an ellipsoid rather than a box or cylinder.", "geometryDescriptor": {"topologyIntent": "The root flare is a continuous organic swell at the trunk base, represented by an ellipsoid rather than a box or cylinder.", "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"}, "parent": "root", "attachment": null, "dimensions": {"width": 1.7, "height": 0.55, "depth": 1.2, "units": "world-relative", "confidence": 0.84}, "transform": {"position": [0, 0.06, 0], "rotation": [0, 0, 0], "scale": [1.65, 0.46, 1.1]}, "actionProfile": {"animationRole": "base-accent", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "static-tree", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "root-flare", "description": "Angular buttress-like roots contact the ground at the trunk base.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "lower silhouette and ground contact", "confidence": 0.88}], "surfaceDetail": {"macroRoughness": 0.78, "microRoughness": 0.12, "bumpAmplitude": 0.04, "normalPattern": "faceted procedural variation", "displacementPattern": "none", "occlusionPattern": "contact and branch-junction AO", "edgeWearPattern": "subtle planar value shifts", "notes": "Keep the organic silhouette in geometry; use surface variation only for local response."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.95, "dominantAlbedo": "rgba(111, 90, 74, 1)", "secondaryAlbedo": "rgba(89, 72, 61, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1.0], "stops": [{"offset": 0, "color": "rgba(89, 72, 61, 1)"}, {"offset": 0.55, "color": "rgba(111, 90, 74, 1)"}, {"offset": 1, "color": "rgba(149, 126, 104, 1)"}]}}};
  node_root_flare_1.userData.actionProfile = {"animationRole": "base-accent", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "static-tree", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}};
  (nodes["root"] ?? root).add(node_root_flare_1);
  nodes["root-flare"] = node_root_flare_1;
  const mesh_root_flare_1Geometry = endpoint_root_flare_1
    ? new THREE.CylinderGeometry(endpoint_root_flare_1.endRadius, endpoint_root_flare_1.baseRadius, endpoint_root_flare_1.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  const mesh_root_flare_1 = new THREE.Mesh(
    mesh_root_flare_1Geometry,
    materialMap["bark"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_root_flare_1.name = "Buttress mass";
  if (endpoint_root_flare_1) {
    mesh_root_flare_1.position.copy(endpoint_root_flare_1.midpoint);
    mesh_root_flare_1.quaternion.copy(endpoint_root_flare_1.quaternion);
  }
  mesh_root_flare_1.castShadow = options.castShadow ?? true;
  mesh_root_flare_1.receiveShadow = options.receiveShadow ?? true;
  mesh_root_flare_1.userData.sculptComponent = {"id": "root-flare", "name": "Buttress mass", "level": "macro", "role": "base-accent", "importance": 0.82, "confidence": 0.84, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "The root flare is a continuous organic swell at the trunk base, represented by an ellipsoid rather than a box or cylinder.", "geometryDescriptor": {"topologyIntent": "The root flare is a continuous organic swell at the trunk base, represented by an ellipsoid rather than a box or cylinder.", "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"}, "parent": "root", "attachment": null, "dimensions": {"width": 1.7, "height": 0.55, "depth": 1.2, "units": "world-relative", "confidence": 0.84}, "transform": {"position": [0, 0.06, 0], "rotation": [0, 0, 0], "scale": [1.65, 0.46, 1.1]}, "actionProfile": {"animationRole": "base-accent", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "static-tree", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "root-flare", "description": "Angular buttress-like roots contact the ground at the trunk base.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "lower silhouette and ground contact", "confidence": 0.88}], "surfaceDetail": {"macroRoughness": 0.78, "microRoughness": 0.12, "bumpAmplitude": 0.04, "normalPattern": "faceted procedural variation", "displacementPattern": "none", "occlusionPattern": "contact and branch-junction AO", "edgeWearPattern": "subtle planar value shifts", "notes": "Keep the organic silhouette in geometry; use surface variation only for local response."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.95, "dominantAlbedo": "rgba(111, 90, 74, 1)", "secondaryAlbedo": "rgba(89, 72, 61, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1.0], "stops": [{"offset": 0, "color": "rgba(89, 72, 61, 1)"}, {"offset": 0.55, "color": "rgba(111, 90, 74, 1)"}, {"offset": 1, "color": "rgba(149, 126, 104, 1)"}]}}};
  node_root_flare_1.add(mesh_root_flare_1);
  meshes["root-flare"] = mesh_root_flare_1;
  colliders["root-flare"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."};
  destructionGroups["static-tree"] ??= [];
  destructionGroups["static-tree"].push(node_root_flare_1);

  const attachment_primary_left_2 = {"parentId": "root", "parentSocket": "root:branch-tip", "localStart": [-0.05, 2.8, 0.0], "localEnd": [-1.65, 3.8, 0.08], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.25, "endRadius": 0.12, "evidenceRefs": ["full-object"]};
  const endpoint_primary_left_2 = makeAttachmentEndpoint(attachment_primary_left_2);
  const node_primary_left_2 = new THREE.Group();
  node_primary_left_2.name = "Primary Left__pivot";
  if (endpoint_primary_left_2) {
    node_primary_left_2.position.copy(endpoint_primary_left_2.start);
    node_primary_left_2.rotation.set(0, 0, 0);
    node_primary_left_2.scale.set(1, 1, 1);
  } else {
    node_primary_left_2.position.set(0.0, 0.0, 0.0);
    node_primary_left_2.rotation.set(0.0, 0.0, 0.0);
    node_primary_left_2.scale.set(1.0, 1.0, 1.0);
  }
  node_primary_left_2.userData.sculptComponent = {"id": "primary-left", "name": "Primary Left", "level": "macro", "role": "branch", "importance": 0.92, "confidence": 0.85, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "geometryDescriptor": {"topologyIntent": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "root:branch-tip", "localStart": [-0.05, 2.8, 0.0], "localEnd": [-1.65, 3.8, 0.08], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.25, "endRadius": 0.12, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.5, "height": 1.8884914614580601, "depth": 0.5, "units": "world-relative", "confidence": 0.86}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "branch-segment", "description": "Tapered woody segment with a visible overlap at its parent junction.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "tapered tube segment", "confidence": 0.88}, {"id": "primary-scaffolds", "description": "Broad arching primary scaffolds create the spreading crown.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "macro silhouette and branch hierarchy", "confidence": 0.95}], "surfaceDetail": {"macroRoughness": 0.78, "microRoughness": 0.12, "bumpAmplitude": 0.04, "normalPattern": "faceted procedural variation", "displacementPattern": "none", "occlusionPattern": "contact and branch-junction AO", "edgeWearPattern": "subtle planar value shifts", "notes": "Keep the organic silhouette in geometry; use surface variation only for local response."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.95, "dominantAlbedo": "rgba(111, 90, 74, 1)", "secondaryAlbedo": "rgba(89, 72, 61, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1.0], "stops": [{"offset": 0, "color": "rgba(89, 72, 61, 1)"}, {"offset": 0.55, "color": "rgba(111, 90, 74, 1)"}, {"offset": 1, "color": "rgba(149, 126, 104, 1)"}]}}};
  node_primary_left_2.userData.actionProfile = {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}};
  (nodes["root"] ?? root).add(node_primary_left_2);
  nodes["primary-left"] = node_primary_left_2;
  const mesh_primary_left_2Geometry = endpoint_primary_left_2
    ? new THREE.CylinderGeometry(endpoint_primary_left_2.endRadius, endpoint_primary_left_2.baseRadius, endpoint_primary_left_2.length, 32, 12)
    : buildTubeGeometry({"points": [[0.0, -0.5, 0.0], [0.0, 0.5, 0.0]], "radius": 0.05, "closed": false});
  const mesh_primary_left_2 = new THREE.Mesh(
    mesh_primary_left_2Geometry,
    materialMap["bark"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_primary_left_2.name = "Primary Left";
  if (endpoint_primary_left_2) {
    mesh_primary_left_2.position.copy(endpoint_primary_left_2.midpoint);
    mesh_primary_left_2.quaternion.copy(endpoint_primary_left_2.quaternion);
  }
  mesh_primary_left_2.castShadow = options.castShadow ?? true;
  mesh_primary_left_2.receiveShadow = options.receiveShadow ?? true;
  mesh_primary_left_2.userData.sculptComponent = {"id": "primary-left", "name": "Primary Left", "level": "macro", "role": "branch", "importance": 0.92, "confidence": 0.85, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "geometryDescriptor": {"topologyIntent": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "root:branch-tip", "localStart": [-0.05, 2.8, 0.0], "localEnd": [-1.65, 3.8, 0.08], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.25, "endRadius": 0.12, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.5, "height": 1.8884914614580601, "depth": 0.5, "units": "world-relative", "confidence": 0.86}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "branch-segment", "description": "Tapered woody segment with a visible overlap at its parent junction.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "tapered tube segment", "confidence": 0.88}, {"id": "primary-scaffolds", "description": "Broad arching primary scaffolds create the spreading crown.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "macro silhouette and branch hierarchy", "confidence": 0.95}], "surfaceDetail": {"macroRoughness": 0.78, "microRoughness": 0.12, "bumpAmplitude": 0.04, "normalPattern": "faceted procedural variation", "displacementPattern": "none", "occlusionPattern": "contact and branch-junction AO", "edgeWearPattern": "subtle planar value shifts", "notes": "Keep the organic silhouette in geometry; use surface variation only for local response."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.95, "dominantAlbedo": "rgba(111, 90, 74, 1)", "secondaryAlbedo": "rgba(89, 72, 61, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1.0], "stops": [{"offset": 0, "color": "rgba(89, 72, 61, 1)"}, {"offset": 0.55, "color": "rgba(111, 90, 74, 1)"}, {"offset": 1, "color": "rgba(149, 126, 104, 1)"}]}}};
  node_primary_left_2.add(mesh_primary_left_2);
  meshes["primary-left"] = mesh_primary_left_2;
  colliders["primary-left"] = {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."};
  destructionGroups["branch-segments"] ??= [];
  destructionGroups["branch-segments"].push(node_primary_left_2);
  const socket_primary_left_branch_tip_0 = new THREE.Object3D();
  socket_primary_left_branch_tip_0.name = "branch-tip";
  socket_primary_left_branch_tip_0.position.set(0.0, 1.0, 0.0);
  socket_primary_left_branch_tip_0.rotation.set(0.0, 0.0, 0.0);
  socket_primary_left_branch_tip_0.userData.socket = {"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"};
  node_primary_left_2.add(socket_primary_left_branch_tip_0);
  sockets["primary-left:branch-tip"] = socket_primary_left_branch_tip_0;

  const attachment_primary_right_3 = {"parentId": "root", "parentSocket": "root:branch-tip", "localStart": [0.05, 2.85, -0.02], "localEnd": [1.65, 3.78, -0.02], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.25, "endRadius": 0.12, "evidenceRefs": ["full-object"]};
  const endpoint_primary_right_3 = makeAttachmentEndpoint(attachment_primary_right_3);
  const node_primary_right_3 = new THREE.Group();
  node_primary_right_3.name = "Primary Right__pivot";
  if (endpoint_primary_right_3) {
    node_primary_right_3.position.copy(endpoint_primary_right_3.start);
    node_primary_right_3.rotation.set(0, 0, 0);
    node_primary_right_3.scale.set(1, 1, 1);
  } else {
    node_primary_right_3.position.set(0.0, 0.0, 0.0);
    node_primary_right_3.rotation.set(0.0, 0.0, 0.0);
    node_primary_right_3.scale.set(1.0, 1.0, 1.0);
  }
  node_primary_right_3.userData.sculptComponent = {"id": "primary-right", "name": "Primary Right", "level": "macro", "role": "branch", "importance": 0.92, "confidence": 0.85, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "geometryDescriptor": {"topologyIntent": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "root:branch-tip", "localStart": [0.05, 2.85, -0.02], "localEnd": [1.65, 3.78, -0.02], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.25, "endRadius": 0.12, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.5, "height": 1.8506485349736181, "depth": 0.5, "units": "world-relative", "confidence": 0.86}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "branch-segment", "description": "Tapered woody segment with a visible overlap at its parent junction.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "tapered tube segment", "confidence": 0.88}], "surfaceDetail": {"macroRoughness": 0.78, "microRoughness": 0.12, "bumpAmplitude": 0.04, "normalPattern": "faceted procedural variation", "displacementPattern": "none", "occlusionPattern": "contact and branch-junction AO", "edgeWearPattern": "subtle planar value shifts", "notes": "Keep the organic silhouette in geometry; use surface variation only for local response."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.95, "dominantAlbedo": "rgba(111, 90, 74, 1)", "secondaryAlbedo": "rgba(89, 72, 61, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1.0], "stops": [{"offset": 0, "color": "rgba(89, 72, 61, 1)"}, {"offset": 0.55, "color": "rgba(111, 90, 74, 1)"}, {"offset": 1, "color": "rgba(149, 126, 104, 1)"}]}}};
  node_primary_right_3.userData.actionProfile = {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}};
  (nodes["root"] ?? root).add(node_primary_right_3);
  nodes["primary-right"] = node_primary_right_3;
  const mesh_primary_right_3Geometry = endpoint_primary_right_3
    ? new THREE.CylinderGeometry(endpoint_primary_right_3.endRadius, endpoint_primary_right_3.baseRadius, endpoint_primary_right_3.length, 32, 12)
    : buildTubeGeometry({"points": [[0.0, -0.5, 0.0], [0.0, 0.5, 0.0]], "radius": 0.05, "closed": false});
  const mesh_primary_right_3 = new THREE.Mesh(
    mesh_primary_right_3Geometry,
    materialMap["bark"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_primary_right_3.name = "Primary Right";
  if (endpoint_primary_right_3) {
    mesh_primary_right_3.position.copy(endpoint_primary_right_3.midpoint);
    mesh_primary_right_3.quaternion.copy(endpoint_primary_right_3.quaternion);
  }
  mesh_primary_right_3.castShadow = options.castShadow ?? true;
  mesh_primary_right_3.receiveShadow = options.receiveShadow ?? true;
  mesh_primary_right_3.userData.sculptComponent = {"id": "primary-right", "name": "Primary Right", "level": "macro", "role": "branch", "importance": 0.92, "confidence": 0.85, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "geometryDescriptor": {"topologyIntent": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "root:branch-tip", "localStart": [0.05, 2.85, -0.02], "localEnd": [1.65, 3.78, -0.02], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.25, "endRadius": 0.12, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.5, "height": 1.8506485349736181, "depth": 0.5, "units": "world-relative", "confidence": 0.86}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "branch-segment", "description": "Tapered woody segment with a visible overlap at its parent junction.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "tapered tube segment", "confidence": 0.88}], "surfaceDetail": {"macroRoughness": 0.78, "microRoughness": 0.12, "bumpAmplitude": 0.04, "normalPattern": "faceted procedural variation", "displacementPattern": "none", "occlusionPattern": "contact and branch-junction AO", "edgeWearPattern": "subtle planar value shifts", "notes": "Keep the organic silhouette in geometry; use surface variation only for local response."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.95, "dominantAlbedo": "rgba(111, 90, 74, 1)", "secondaryAlbedo": "rgba(89, 72, 61, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1.0], "stops": [{"offset": 0, "color": "rgba(89, 72, 61, 1)"}, {"offset": 0.55, "color": "rgba(111, 90, 74, 1)"}, {"offset": 1, "color": "rgba(149, 126, 104, 1)"}]}}};
  node_primary_right_3.add(mesh_primary_right_3);
  meshes["primary-right"] = mesh_primary_right_3;
  colliders["primary-right"] = {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."};
  destructionGroups["branch-segments"] ??= [];
  destructionGroups["branch-segments"].push(node_primary_right_3);
  const socket_primary_right_branch_tip_0 = new THREE.Object3D();
  socket_primary_right_branch_tip_0.name = "branch-tip";
  socket_primary_right_branch_tip_0.position.set(0.0, 1.0, 0.0);
  socket_primary_right_branch_tip_0.rotation.set(0.0, 0.0, 0.0);
  socket_primary_right_branch_tip_0.userData.socket = {"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"};
  node_primary_right_3.add(socket_primary_right_branch_tip_0);
  sockets["primary-right:branch-tip"] = socket_primary_right_branch_tip_0;

  const attachment_primary_top_4 = {"parentId": "root", "parentSocket": "root:branch-tip", "localStart": [0.0, 3.15, 0.03], "localEnd": [0.38, 4.85, -0.04], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.23, "endRadius": 0.095, "evidenceRefs": ["full-object"]};
  const endpoint_primary_top_4 = makeAttachmentEndpoint(attachment_primary_top_4);
  const node_primary_top_4 = new THREE.Group();
  node_primary_top_4.name = "Primary Top__pivot";
  if (endpoint_primary_top_4) {
    node_primary_top_4.position.copy(endpoint_primary_top_4.start);
    node_primary_top_4.rotation.set(0, 0, 0);
    node_primary_top_4.scale.set(1, 1, 1);
  } else {
    node_primary_top_4.position.set(0.0, 0.0, 0.0);
    node_primary_top_4.rotation.set(0.0, 0.0, 0.0);
    node_primary_top_4.scale.set(1.0, 1.0, 1.0);
  }
  node_primary_top_4.userData.sculptComponent = {"id": "primary-top", "name": "Primary Top", "level": "macro", "role": "branch", "importance": 0.92, "confidence": 0.85, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "geometryDescriptor": {"topologyIntent": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "root:branch-tip", "localStart": [0.0, 3.15, 0.03], "localEnd": [0.38, 4.85, -0.04], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.23, "endRadius": 0.095, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.46, "height": 1.7433588270921163, "depth": 0.46, "units": "world-relative", "confidence": 0.86}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "branch-segment", "description": "Tapered woody segment with a visible overlap at its parent junction.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "tapered tube segment", "confidence": 0.88}], "surfaceDetail": {"macroRoughness": 0.78, "microRoughness": 0.12, "bumpAmplitude": 0.04, "normalPattern": "faceted procedural variation", "displacementPattern": "none", "occlusionPattern": "contact and branch-junction AO", "edgeWearPattern": "subtle planar value shifts", "notes": "Keep the organic silhouette in geometry; use surface variation only for local response."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.95, "dominantAlbedo": "rgba(111, 90, 74, 1)", "secondaryAlbedo": "rgba(89, 72, 61, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1.0], "stops": [{"offset": 0, "color": "rgba(89, 72, 61, 1)"}, {"offset": 0.55, "color": "rgba(111, 90, 74, 1)"}, {"offset": 1, "color": "rgba(149, 126, 104, 1)"}]}}};
  node_primary_top_4.userData.actionProfile = {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}};
  (nodes["root"] ?? root).add(node_primary_top_4);
  nodes["primary-top"] = node_primary_top_4;
  const mesh_primary_top_4Geometry = endpoint_primary_top_4
    ? new THREE.CylinderGeometry(endpoint_primary_top_4.endRadius, endpoint_primary_top_4.baseRadius, endpoint_primary_top_4.length, 32, 12)
    : buildTubeGeometry({"points": [[0.0, -0.5, 0.0], [0.0, 0.5, 0.0]], "radius": 0.05, "closed": false});
  const mesh_primary_top_4 = new THREE.Mesh(
    mesh_primary_top_4Geometry,
    materialMap["bark"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_primary_top_4.name = "Primary Top";
  if (endpoint_primary_top_4) {
    mesh_primary_top_4.position.copy(endpoint_primary_top_4.midpoint);
    mesh_primary_top_4.quaternion.copy(endpoint_primary_top_4.quaternion);
  }
  mesh_primary_top_4.castShadow = options.castShadow ?? true;
  mesh_primary_top_4.receiveShadow = options.receiveShadow ?? true;
  mesh_primary_top_4.userData.sculptComponent = {"id": "primary-top", "name": "Primary Top", "level": "macro", "role": "branch", "importance": 0.92, "confidence": 0.85, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "geometryDescriptor": {"topologyIntent": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "root:branch-tip", "localStart": [0.0, 3.15, 0.03], "localEnd": [0.38, 4.85, -0.04], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.23, "endRadius": 0.095, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.46, "height": 1.7433588270921163, "depth": 0.46, "units": "world-relative", "confidence": 0.86}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "branch-segment", "description": "Tapered woody segment with a visible overlap at its parent junction.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "tapered tube segment", "confidence": 0.88}], "surfaceDetail": {"macroRoughness": 0.78, "microRoughness": 0.12, "bumpAmplitude": 0.04, "normalPattern": "faceted procedural variation", "displacementPattern": "none", "occlusionPattern": "contact and branch-junction AO", "edgeWearPattern": "subtle planar value shifts", "notes": "Keep the organic silhouette in geometry; use surface variation only for local response."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.95, "dominantAlbedo": "rgba(111, 90, 74, 1)", "secondaryAlbedo": "rgba(89, 72, 61, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1.0], "stops": [{"offset": 0, "color": "rgba(89, 72, 61, 1)"}, {"offset": 0.55, "color": "rgba(111, 90, 74, 1)"}, {"offset": 1, "color": "rgba(149, 126, 104, 1)"}]}}};
  node_primary_top_4.add(mesh_primary_top_4);
  meshes["primary-top"] = mesh_primary_top_4;
  colliders["primary-top"] = {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."};
  destructionGroups["branch-segments"] ??= [];
  destructionGroups["branch-segments"].push(node_primary_top_4);
  const socket_primary_top_branch_tip_0 = new THREE.Object3D();
  socket_primary_top_branch_tip_0.name = "branch-tip";
  socket_primary_top_branch_tip_0.position.set(0.0, 1.0, 0.0);
  socket_primary_top_branch_tip_0.rotation.set(0.0, 0.0, 0.0);
  socket_primary_top_branch_tip_0.userData.socket = {"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"};
  node_primary_top_4.add(socket_primary_top_branch_tip_0);
  sockets["primary-top:branch-tip"] = socket_primary_top_branch_tip_0;

  const attachment_primary_mid_left_5 = {"parentId": "root", "parentSocket": "root:branch-tip", "localStart": [-0.03, 2.5, 0.03], "localEnd": [-1.18, 3.05, -0.06], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.21, "endRadius": 0.105, "evidenceRefs": ["full-object"]};
  const endpoint_primary_mid_left_5 = makeAttachmentEndpoint(attachment_primary_mid_left_5);
  const node_primary_mid_left_5 = new THREE.Group();
  node_primary_mid_left_5.name = "Primary Mid Left__pivot";
  if (endpoint_primary_mid_left_5) {
    node_primary_mid_left_5.position.copy(endpoint_primary_mid_left_5.start);
    node_primary_mid_left_5.rotation.set(0, 0, 0);
    node_primary_mid_left_5.scale.set(1, 1, 1);
  } else {
    node_primary_mid_left_5.position.set(0.0, 0.0, 0.0);
    node_primary_mid_left_5.rotation.set(0.0, 0.0, 0.0);
    node_primary_mid_left_5.scale.set(1.0, 1.0, 1.0);
  }
  node_primary_mid_left_5.userData.sculptComponent = {"id": "primary-mid-left", "name": "Primary Mid Left", "level": "macro", "role": "branch", "importance": 0.92, "confidence": 0.85, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "geometryDescriptor": {"topologyIntent": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "root:branch-tip", "localStart": [-0.03, 2.5, 0.03], "localEnd": [-1.18, 3.05, -0.06], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.21, "endRadius": 0.105, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.42, "height": 1.2779280104919837, "depth": 0.42, "units": "world-relative", "confidence": 0.86}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "branch-segment", "description": "Tapered woody segment with a visible overlap at its parent junction.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "tapered tube segment", "confidence": 0.88}], "surfaceDetail": {"macroRoughness": 0.78, "microRoughness": 0.12, "bumpAmplitude": 0.04, "normalPattern": "faceted procedural variation", "displacementPattern": "none", "occlusionPattern": "contact and branch-junction AO", "edgeWearPattern": "subtle planar value shifts", "notes": "Keep the organic silhouette in geometry; use surface variation only for local response."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.95, "dominantAlbedo": "rgba(111, 90, 74, 1)", "secondaryAlbedo": "rgba(89, 72, 61, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1.0], "stops": [{"offset": 0, "color": "rgba(89, 72, 61, 1)"}, {"offset": 0.55, "color": "rgba(111, 90, 74, 1)"}, {"offset": 1, "color": "rgba(149, 126, 104, 1)"}]}}};
  node_primary_mid_left_5.userData.actionProfile = {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}};
  (nodes["root"] ?? root).add(node_primary_mid_left_5);
  nodes["primary-mid-left"] = node_primary_mid_left_5;
  const mesh_primary_mid_left_5Geometry = endpoint_primary_mid_left_5
    ? new THREE.CylinderGeometry(endpoint_primary_mid_left_5.endRadius, endpoint_primary_mid_left_5.baseRadius, endpoint_primary_mid_left_5.length, 32, 12)
    : buildTubeGeometry({"points": [[0.0, -0.5, 0.0], [0.0, 0.5, 0.0]], "radius": 0.05, "closed": false});
  const mesh_primary_mid_left_5 = new THREE.Mesh(
    mesh_primary_mid_left_5Geometry,
    materialMap["bark"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_primary_mid_left_5.name = "Primary Mid Left";
  if (endpoint_primary_mid_left_5) {
    mesh_primary_mid_left_5.position.copy(endpoint_primary_mid_left_5.midpoint);
    mesh_primary_mid_left_5.quaternion.copy(endpoint_primary_mid_left_5.quaternion);
  }
  mesh_primary_mid_left_5.castShadow = options.castShadow ?? true;
  mesh_primary_mid_left_5.receiveShadow = options.receiveShadow ?? true;
  mesh_primary_mid_left_5.userData.sculptComponent = {"id": "primary-mid-left", "name": "Primary Mid Left", "level": "macro", "role": "branch", "importance": 0.92, "confidence": 0.85, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "geometryDescriptor": {"topologyIntent": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "root:branch-tip", "localStart": [-0.03, 2.5, 0.03], "localEnd": [-1.18, 3.05, -0.06], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.21, "endRadius": 0.105, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.42, "height": 1.2779280104919837, "depth": 0.42, "units": "world-relative", "confidence": 0.86}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "branch-segment", "description": "Tapered woody segment with a visible overlap at its parent junction.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "tapered tube segment", "confidence": 0.88}], "surfaceDetail": {"macroRoughness": 0.78, "microRoughness": 0.12, "bumpAmplitude": 0.04, "normalPattern": "faceted procedural variation", "displacementPattern": "none", "occlusionPattern": "contact and branch-junction AO", "edgeWearPattern": "subtle planar value shifts", "notes": "Keep the organic silhouette in geometry; use surface variation only for local response."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.95, "dominantAlbedo": "rgba(111, 90, 74, 1)", "secondaryAlbedo": "rgba(89, 72, 61, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1.0], "stops": [{"offset": 0, "color": "rgba(89, 72, 61, 1)"}, {"offset": 0.55, "color": "rgba(111, 90, 74, 1)"}, {"offset": 1, "color": "rgba(149, 126, 104, 1)"}]}}};
  node_primary_mid_left_5.add(mesh_primary_mid_left_5);
  meshes["primary-mid-left"] = mesh_primary_mid_left_5;
  colliders["primary-mid-left"] = {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."};
  destructionGroups["branch-segments"] ??= [];
  destructionGroups["branch-segments"].push(node_primary_mid_left_5);
  const socket_primary_mid_left_branch_tip_0 = new THREE.Object3D();
  socket_primary_mid_left_branch_tip_0.name = "branch-tip";
  socket_primary_mid_left_branch_tip_0.position.set(0.0, 1.0, 0.0);
  socket_primary_mid_left_branch_tip_0.rotation.set(0.0, 0.0, 0.0);
  socket_primary_mid_left_branch_tip_0.userData.socket = {"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"};
  node_primary_mid_left_5.add(socket_primary_mid_left_branch_tip_0);
  sockets["primary-mid-left:branch-tip"] = socket_primary_mid_left_branch_tip_0;

  const attachment_primary_mid_right_6 = {"parentId": "root", "parentSocket": "root:branch-tip", "localStart": [0.03, 2.55, 0.0], "localEnd": [1.2, 3.08, 0.05], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.21, "endRadius": 0.105, "evidenceRefs": ["full-object"]};
  const endpoint_primary_mid_right_6 = makeAttachmentEndpoint(attachment_primary_mid_right_6);
  const node_primary_mid_right_6 = new THREE.Group();
  node_primary_mid_right_6.name = "Primary Mid Right__pivot";
  if (endpoint_primary_mid_right_6) {
    node_primary_mid_right_6.position.copy(endpoint_primary_mid_right_6.start);
    node_primary_mid_right_6.rotation.set(0, 0, 0);
    node_primary_mid_right_6.scale.set(1, 1, 1);
  } else {
    node_primary_mid_right_6.position.set(0.0, 0.0, 0.0);
    node_primary_mid_right_6.rotation.set(0.0, 0.0, 0.0);
    node_primary_mid_right_6.scale.set(1.0, 1.0, 1.0);
  }
  node_primary_mid_right_6.userData.sculptComponent = {"id": "primary-mid-right", "name": "Primary Mid Right", "level": "macro", "role": "branch", "importance": 0.92, "confidence": 0.85, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "geometryDescriptor": {"topologyIntent": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "root:branch-tip", "localStart": [0.03, 2.55, 0.0], "localEnd": [1.2, 3.08, 0.05], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.21, "endRadius": 0.105, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.42, "height": 1.2854182198802069, "depth": 0.42, "units": "world-relative", "confidence": 0.86}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "branch-segment", "description": "Tapered woody segment with a visible overlap at its parent junction.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "tapered tube segment", "confidence": 0.88}, {"id": "secondary-branches", "description": "Secondary branches alternate along the primary scaffolds with varied angles.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "meso branch rhythm", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.78, "microRoughness": 0.12, "bumpAmplitude": 0.04, "normalPattern": "faceted procedural variation", "displacementPattern": "none", "occlusionPattern": "contact and branch-junction AO", "edgeWearPattern": "subtle planar value shifts", "notes": "Keep the organic silhouette in geometry; use surface variation only for local response."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.95, "dominantAlbedo": "rgba(111, 90, 74, 1)", "secondaryAlbedo": "rgba(89, 72, 61, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1.0], "stops": [{"offset": 0, "color": "rgba(89, 72, 61, 1)"}, {"offset": 0.55, "color": "rgba(111, 90, 74, 1)"}, {"offset": 1, "color": "rgba(149, 126, 104, 1)"}]}}};
  node_primary_mid_right_6.userData.actionProfile = {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}};
  (nodes["root"] ?? root).add(node_primary_mid_right_6);
  nodes["primary-mid-right"] = node_primary_mid_right_6;
  const mesh_primary_mid_right_6Geometry = endpoint_primary_mid_right_6
    ? new THREE.CylinderGeometry(endpoint_primary_mid_right_6.endRadius, endpoint_primary_mid_right_6.baseRadius, endpoint_primary_mid_right_6.length, 32, 12)
    : buildTubeGeometry({"points": [[0.0, -0.5, 0.0], [0.0, 0.5, 0.0]], "radius": 0.05, "closed": false});
  const mesh_primary_mid_right_6 = new THREE.Mesh(
    mesh_primary_mid_right_6Geometry,
    materialMap["bark"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_primary_mid_right_6.name = "Primary Mid Right";
  if (endpoint_primary_mid_right_6) {
    mesh_primary_mid_right_6.position.copy(endpoint_primary_mid_right_6.midpoint);
    mesh_primary_mid_right_6.quaternion.copy(endpoint_primary_mid_right_6.quaternion);
  }
  mesh_primary_mid_right_6.castShadow = options.castShadow ?? true;
  mesh_primary_mid_right_6.receiveShadow = options.receiveShadow ?? true;
  mesh_primary_mid_right_6.userData.sculptComponent = {"id": "primary-mid-right", "name": "Primary Mid Right", "level": "macro", "role": "branch", "importance": 0.92, "confidence": 0.85, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "geometryDescriptor": {"topologyIntent": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "root:branch-tip", "localStart": [0.03, 2.55, 0.0], "localEnd": [1.2, 3.08, 0.05], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.21, "endRadius": 0.105, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.42, "height": 1.2854182198802069, "depth": 0.42, "units": "world-relative", "confidence": 0.86}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "branch-segment", "description": "Tapered woody segment with a visible overlap at its parent junction.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "tapered tube segment", "confidence": 0.88}, {"id": "secondary-branches", "description": "Secondary branches alternate along the primary scaffolds with varied angles.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "meso branch rhythm", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.78, "microRoughness": 0.12, "bumpAmplitude": 0.04, "normalPattern": "faceted procedural variation", "displacementPattern": "none", "occlusionPattern": "contact and branch-junction AO", "edgeWearPattern": "subtle planar value shifts", "notes": "Keep the organic silhouette in geometry; use surface variation only for local response."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.95, "dominantAlbedo": "rgba(111, 90, 74, 1)", "secondaryAlbedo": "rgba(89, 72, 61, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1.0], "stops": [{"offset": 0, "color": "rgba(89, 72, 61, 1)"}, {"offset": 0.55, "color": "rgba(111, 90, 74, 1)"}, {"offset": 1, "color": "rgba(149, 126, 104, 1)"}]}}};
  node_primary_mid_right_6.add(mesh_primary_mid_right_6);
  meshes["primary-mid-right"] = mesh_primary_mid_right_6;
  colliders["primary-mid-right"] = {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."};
  destructionGroups["branch-segments"] ??= [];
  destructionGroups["branch-segments"].push(node_primary_mid_right_6);
  const socket_primary_mid_right_branch_tip_0 = new THREE.Object3D();
  socket_primary_mid_right_branch_tip_0.name = "branch-tip";
  socket_primary_mid_right_branch_tip_0.position.set(0.0, 1.0, 0.0);
  socket_primary_mid_right_branch_tip_0.rotation.set(0.0, 0.0, 0.0);
  socket_primary_mid_right_branch_tip_0.userData.socket = {"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"};
  node_primary_mid_right_6.add(socket_primary_mid_right_branch_tip_0);
  sockets["primary-mid-right:branch-tip"] = socket_primary_mid_right_branch_tip_0;

  const attachment_secondary_left_low_7 = {"parentId": "primary-left", "parentSocket": "primary-left:branch-tip", "localStart": [0.35, 0.2, 0.0], "localEnd": [-0.72, 0.58, 0.05], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.12, "endRadius": 0.06, "evidenceRefs": ["full-object"]};
  const endpoint_secondary_left_low_7 = makeAttachmentEndpoint(attachment_secondary_left_low_7);
  const node_secondary_left_low_7 = new THREE.Group();
  node_secondary_left_low_7.name = "Secondary Left Low__pivot";
  if (endpoint_secondary_left_low_7) {
    node_secondary_left_low_7.position.copy(endpoint_secondary_left_low_7.start);
    node_secondary_left_low_7.rotation.set(0, 0, 0);
    node_secondary_left_low_7.scale.set(1, 1, 1);
  } else {
    node_secondary_left_low_7.position.set(0.0, 0.0, 0.0);
    node_secondary_left_low_7.rotation.set(0.0, 0.0, 0.0);
    node_secondary_left_low_7.scale.set(1.0, 1.0, 1.0);
  }
  node_secondary_left_low_7.userData.sculptComponent = {"id": "secondary-left-low", "name": "Secondary Left Low", "level": "meso", "role": "branch", "importance": 0.78, "confidence": 0.85, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "geometryDescriptor": {"topologyIntent": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"}, "parent": "primary-left", "attachment": {"parentId": "primary-left", "parentSocket": "primary-left:branch-tip", "localStart": [0.35, 0.2, 0.0], "localEnd": [-0.72, 0.58, 0.05], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.12, "endRadius": 0.06, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.24, "height": 1.1365737987477977, "depth": 0.24, "units": "world-relative", "confidence": 0.86}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "branch-segment", "description": "Tapered woody segment with a visible overlap at its parent junction.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "tapered tube segment", "confidence": 0.88}], "surfaceDetail": {"macroRoughness": 0.78, "microRoughness": 0.12, "bumpAmplitude": 0.04, "normalPattern": "faceted procedural variation", "displacementPattern": "none", "occlusionPattern": "contact and branch-junction AO", "edgeWearPattern": "subtle planar value shifts", "notes": "Keep the organic silhouette in geometry; use surface variation only for local response."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "meso", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.95, "dominantAlbedo": "rgba(111, 90, 74, 1)", "secondaryAlbedo": "rgba(89, 72, 61, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1.0], "stops": [{"offset": 0, "color": "rgba(89, 72, 61, 1)"}, {"offset": 0.55, "color": "rgba(111, 90, 74, 1)"}, {"offset": 1, "color": "rgba(149, 126, 104, 1)"}]}}};
  node_secondary_left_low_7.userData.actionProfile = {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}};
  (nodes["primary-left"] ?? root).add(node_secondary_left_low_7);
  nodes["secondary-left-low"] = node_secondary_left_low_7;
  const mesh_secondary_left_low_7Geometry = endpoint_secondary_left_low_7
    ? new THREE.CylinderGeometry(endpoint_secondary_left_low_7.endRadius, endpoint_secondary_left_low_7.baseRadius, endpoint_secondary_left_low_7.length, 32, 12)
    : buildTubeGeometry({"points": [[0.0, -0.5, 0.0], [0.0, 0.5, 0.0]], "radius": 0.05, "closed": false});
  const mesh_secondary_left_low_7 = new THREE.Mesh(
    mesh_secondary_left_low_7Geometry,
    materialMap["bark"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_secondary_left_low_7.name = "Secondary Left Low";
  if (endpoint_secondary_left_low_7) {
    mesh_secondary_left_low_7.position.copy(endpoint_secondary_left_low_7.midpoint);
    mesh_secondary_left_low_7.quaternion.copy(endpoint_secondary_left_low_7.quaternion);
  }
  mesh_secondary_left_low_7.castShadow = options.castShadow ?? true;
  mesh_secondary_left_low_7.receiveShadow = options.receiveShadow ?? true;
  mesh_secondary_left_low_7.userData.sculptComponent = {"id": "secondary-left-low", "name": "Secondary Left Low", "level": "meso", "role": "branch", "importance": 0.78, "confidence": 0.85, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "geometryDescriptor": {"topologyIntent": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"}, "parent": "primary-left", "attachment": {"parentId": "primary-left", "parentSocket": "primary-left:branch-tip", "localStart": [0.35, 0.2, 0.0], "localEnd": [-0.72, 0.58, 0.05], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.12, "endRadius": 0.06, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.24, "height": 1.1365737987477977, "depth": 0.24, "units": "world-relative", "confidence": 0.86}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "branch-segment", "description": "Tapered woody segment with a visible overlap at its parent junction.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "tapered tube segment", "confidence": 0.88}], "surfaceDetail": {"macroRoughness": 0.78, "microRoughness": 0.12, "bumpAmplitude": 0.04, "normalPattern": "faceted procedural variation", "displacementPattern": "none", "occlusionPattern": "contact and branch-junction AO", "edgeWearPattern": "subtle planar value shifts", "notes": "Keep the organic silhouette in geometry; use surface variation only for local response."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "meso", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.95, "dominantAlbedo": "rgba(111, 90, 74, 1)", "secondaryAlbedo": "rgba(89, 72, 61, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1.0], "stops": [{"offset": 0, "color": "rgba(89, 72, 61, 1)"}, {"offset": 0.55, "color": "rgba(111, 90, 74, 1)"}, {"offset": 1, "color": "rgba(149, 126, 104, 1)"}]}}};
  node_secondary_left_low_7.add(mesh_secondary_left_low_7);
  meshes["secondary-left-low"] = mesh_secondary_left_low_7;
  colliders["secondary-left-low"] = {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."};
  destructionGroups["branch-segments"] ??= [];
  destructionGroups["branch-segments"].push(node_secondary_left_low_7);
  const socket_secondary_left_low_branch_tip_0 = new THREE.Object3D();
  socket_secondary_left_low_branch_tip_0.name = "branch-tip";
  socket_secondary_left_low_branch_tip_0.position.set(0.0, 1.0, 0.0);
  socket_secondary_left_low_branch_tip_0.rotation.set(0.0, 0.0, 0.0);
  socket_secondary_left_low_branch_tip_0.userData.socket = {"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"};
  node_secondary_left_low_7.add(socket_secondary_left_low_branch_tip_0);
  sockets["secondary-left-low:branch-tip"] = socket_secondary_left_low_branch_tip_0;

  const attachment_secondary_left_high_8 = {"parentId": "primary-left", "parentSocket": "primary-left:branch-tip", "localStart": [0.72, 0.48, 0.02], "localEnd": [-0.18, 0.9, -0.06], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.11, "endRadius": 0.05, "evidenceRefs": ["full-object"]};
  const endpoint_secondary_left_high_8 = makeAttachmentEndpoint(attachment_secondary_left_high_8);
  const node_secondary_left_high_8 = new THREE.Group();
  node_secondary_left_high_8.name = "Secondary Left High__pivot";
  if (endpoint_secondary_left_high_8) {
    node_secondary_left_high_8.position.copy(endpoint_secondary_left_high_8.start);
    node_secondary_left_high_8.rotation.set(0, 0, 0);
    node_secondary_left_high_8.scale.set(1, 1, 1);
  } else {
    node_secondary_left_high_8.position.set(0.0, 0.0, 0.0);
    node_secondary_left_high_8.rotation.set(0.0, 0.0, 0.0);
    node_secondary_left_high_8.scale.set(1.0, 1.0, 1.0);
  }
  node_secondary_left_high_8.userData.sculptComponent = {"id": "secondary-left-high", "name": "Secondary Left High", "level": "meso", "role": "branch", "importance": 0.78, "confidence": 0.85, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "geometryDescriptor": {"topologyIntent": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"}, "parent": "primary-left", "attachment": {"parentId": "primary-left", "parentSocket": "primary-left:branch-tip", "localStart": [0.72, 0.48, 0.02], "localEnd": [-0.18, 0.9, -0.06], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.11, "endRadius": 0.05, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.22, "height": 0.996393496566492, "depth": 0.22, "units": "world-relative", "confidence": 0.86}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "branch-segment", "description": "Tapered woody segment with a visible overlap at its parent junction.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "tapered tube segment", "confidence": 0.88}], "surfaceDetail": {"macroRoughness": 0.78, "microRoughness": 0.12, "bumpAmplitude": 0.04, "normalPattern": "faceted procedural variation", "displacementPattern": "none", "occlusionPattern": "contact and branch-junction AO", "edgeWearPattern": "subtle planar value shifts", "notes": "Keep the organic silhouette in geometry; use surface variation only for local response."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "meso", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.95, "dominantAlbedo": "rgba(111, 90, 74, 1)", "secondaryAlbedo": "rgba(89, 72, 61, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1.0], "stops": [{"offset": 0, "color": "rgba(89, 72, 61, 1)"}, {"offset": 0.55, "color": "rgba(111, 90, 74, 1)"}, {"offset": 1, "color": "rgba(149, 126, 104, 1)"}]}}};
  node_secondary_left_high_8.userData.actionProfile = {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}};
  (nodes["primary-left"] ?? root).add(node_secondary_left_high_8);
  nodes["secondary-left-high"] = node_secondary_left_high_8;
  const mesh_secondary_left_high_8Geometry = endpoint_secondary_left_high_8
    ? new THREE.CylinderGeometry(endpoint_secondary_left_high_8.endRadius, endpoint_secondary_left_high_8.baseRadius, endpoint_secondary_left_high_8.length, 32, 12)
    : buildTubeGeometry({"points": [[0.0, -0.5, 0.0], [0.0, 0.5, 0.0]], "radius": 0.05, "closed": false});
  const mesh_secondary_left_high_8 = new THREE.Mesh(
    mesh_secondary_left_high_8Geometry,
    materialMap["bark"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_secondary_left_high_8.name = "Secondary Left High";
  if (endpoint_secondary_left_high_8) {
    mesh_secondary_left_high_8.position.copy(endpoint_secondary_left_high_8.midpoint);
    mesh_secondary_left_high_8.quaternion.copy(endpoint_secondary_left_high_8.quaternion);
  }
  mesh_secondary_left_high_8.castShadow = options.castShadow ?? true;
  mesh_secondary_left_high_8.receiveShadow = options.receiveShadow ?? true;
  mesh_secondary_left_high_8.userData.sculptComponent = {"id": "secondary-left-high", "name": "Secondary Left High", "level": "meso", "role": "branch", "importance": 0.78, "confidence": 0.85, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "geometryDescriptor": {"topologyIntent": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"}, "parent": "primary-left", "attachment": {"parentId": "primary-left", "parentSocket": "primary-left:branch-tip", "localStart": [0.72, 0.48, 0.02], "localEnd": [-0.18, 0.9, -0.06], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.11, "endRadius": 0.05, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.22, "height": 0.996393496566492, "depth": 0.22, "units": "world-relative", "confidence": 0.86}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "branch-segment", "description": "Tapered woody segment with a visible overlap at its parent junction.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "tapered tube segment", "confidence": 0.88}], "surfaceDetail": {"macroRoughness": 0.78, "microRoughness": 0.12, "bumpAmplitude": 0.04, "normalPattern": "faceted procedural variation", "displacementPattern": "none", "occlusionPattern": "contact and branch-junction AO", "edgeWearPattern": "subtle planar value shifts", "notes": "Keep the organic silhouette in geometry; use surface variation only for local response."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "meso", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.95, "dominantAlbedo": "rgba(111, 90, 74, 1)", "secondaryAlbedo": "rgba(89, 72, 61, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1.0], "stops": [{"offset": 0, "color": "rgba(89, 72, 61, 1)"}, {"offset": 0.55, "color": "rgba(111, 90, 74, 1)"}, {"offset": 1, "color": "rgba(149, 126, 104, 1)"}]}}};
  node_secondary_left_high_8.add(mesh_secondary_left_high_8);
  meshes["secondary-left-high"] = mesh_secondary_left_high_8;
  colliders["secondary-left-high"] = {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."};
  destructionGroups["branch-segments"] ??= [];
  destructionGroups["branch-segments"].push(node_secondary_left_high_8);
  const socket_secondary_left_high_branch_tip_0 = new THREE.Object3D();
  socket_secondary_left_high_branch_tip_0.name = "branch-tip";
  socket_secondary_left_high_branch_tip_0.position.set(0.0, 1.0, 0.0);
  socket_secondary_left_high_branch_tip_0.rotation.set(0.0, 0.0, 0.0);
  socket_secondary_left_high_branch_tip_0.userData.socket = {"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"};
  node_secondary_left_high_8.add(socket_secondary_left_high_branch_tip_0);
  sockets["secondary-left-high:branch-tip"] = socket_secondary_left_high_branch_tip_0;

  const attachment_secondary_right_low_9 = {"parentId": "primary-right", "parentSocket": "primary-right:branch-tip", "localStart": [0.35, 0.2, 0.0], "localEnd": [0.76, 0.56, 0.04], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.12, "endRadius": 0.06, "evidenceRefs": ["full-object"]};
  const endpoint_secondary_right_low_9 = makeAttachmentEndpoint(attachment_secondary_right_low_9);
  const node_secondary_right_low_9 = new THREE.Group();
  node_secondary_right_low_9.name = "Secondary Right Low__pivot";
  if (endpoint_secondary_right_low_9) {
    node_secondary_right_low_9.position.copy(endpoint_secondary_right_low_9.start);
    node_secondary_right_low_9.rotation.set(0, 0, 0);
    node_secondary_right_low_9.scale.set(1, 1, 1);
  } else {
    node_secondary_right_low_9.position.set(0.0, 0.0, 0.0);
    node_secondary_right_low_9.rotation.set(0.0, 0.0, 0.0);
    node_secondary_right_low_9.scale.set(1.0, 1.0, 1.0);
  }
  node_secondary_right_low_9.userData.sculptComponent = {"id": "secondary-right-low", "name": "Secondary Right Low", "level": "meso", "role": "branch", "importance": 0.78, "confidence": 0.85, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "geometryDescriptor": {"topologyIntent": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"}, "parent": "primary-right", "attachment": {"parentId": "primary-right", "parentSocket": "primary-right:branch-tip", "localStart": [0.35, 0.2, 0.0], "localEnd": [0.76, 0.56, 0.04], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.12, "endRadius": 0.06, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.24, "height": 0.5470831746635972, "depth": 0.24, "units": "world-relative", "confidence": 0.86}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "branch-segment", "description": "Tapered woody segment with a visible overlap at its parent junction.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "tapered tube segment", "confidence": 0.88}], "surfaceDetail": {"macroRoughness": 0.78, "microRoughness": 0.12, "bumpAmplitude": 0.04, "normalPattern": "faceted procedural variation", "displacementPattern": "none", "occlusionPattern": "contact and branch-junction AO", "edgeWearPattern": "subtle planar value shifts", "notes": "Keep the organic silhouette in geometry; use surface variation only for local response."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "meso", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.95, "dominantAlbedo": "rgba(111, 90, 74, 1)", "secondaryAlbedo": "rgba(89, 72, 61, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1.0], "stops": [{"offset": 0, "color": "rgba(89, 72, 61, 1)"}, {"offset": 0.55, "color": "rgba(111, 90, 74, 1)"}, {"offset": 1, "color": "rgba(149, 126, 104, 1)"}]}}};
  node_secondary_right_low_9.userData.actionProfile = {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}};
  (nodes["primary-right"] ?? root).add(node_secondary_right_low_9);
  nodes["secondary-right-low"] = node_secondary_right_low_9;
  const mesh_secondary_right_low_9Geometry = endpoint_secondary_right_low_9
    ? new THREE.CylinderGeometry(endpoint_secondary_right_low_9.endRadius, endpoint_secondary_right_low_9.baseRadius, endpoint_secondary_right_low_9.length, 32, 12)
    : buildTubeGeometry({"points": [[0.0, -0.5, 0.0], [0.0, 0.5, 0.0]], "radius": 0.05, "closed": false});
  const mesh_secondary_right_low_9 = new THREE.Mesh(
    mesh_secondary_right_low_9Geometry,
    materialMap["bark"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_secondary_right_low_9.name = "Secondary Right Low";
  if (endpoint_secondary_right_low_9) {
    mesh_secondary_right_low_9.position.copy(endpoint_secondary_right_low_9.midpoint);
    mesh_secondary_right_low_9.quaternion.copy(endpoint_secondary_right_low_9.quaternion);
  }
  mesh_secondary_right_low_9.castShadow = options.castShadow ?? true;
  mesh_secondary_right_low_9.receiveShadow = options.receiveShadow ?? true;
  mesh_secondary_right_low_9.userData.sculptComponent = {"id": "secondary-right-low", "name": "Secondary Right Low", "level": "meso", "role": "branch", "importance": 0.78, "confidence": 0.85, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "geometryDescriptor": {"topologyIntent": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"}, "parent": "primary-right", "attachment": {"parentId": "primary-right", "parentSocket": "primary-right:branch-tip", "localStart": [0.35, 0.2, 0.0], "localEnd": [0.76, 0.56, 0.04], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.12, "endRadius": 0.06, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.24, "height": 0.5470831746635972, "depth": 0.24, "units": "world-relative", "confidence": 0.86}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "branch-segment", "description": "Tapered woody segment with a visible overlap at its parent junction.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "tapered tube segment", "confidence": 0.88}], "surfaceDetail": {"macroRoughness": 0.78, "microRoughness": 0.12, "bumpAmplitude": 0.04, "normalPattern": "faceted procedural variation", "displacementPattern": "none", "occlusionPattern": "contact and branch-junction AO", "edgeWearPattern": "subtle planar value shifts", "notes": "Keep the organic silhouette in geometry; use surface variation only for local response."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "meso", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.95, "dominantAlbedo": "rgba(111, 90, 74, 1)", "secondaryAlbedo": "rgba(89, 72, 61, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1.0], "stops": [{"offset": 0, "color": "rgba(89, 72, 61, 1)"}, {"offset": 0.55, "color": "rgba(111, 90, 74, 1)"}, {"offset": 1, "color": "rgba(149, 126, 104, 1)"}]}}};
  node_secondary_right_low_9.add(mesh_secondary_right_low_9);
  meshes["secondary-right-low"] = mesh_secondary_right_low_9;
  colliders["secondary-right-low"] = {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."};
  destructionGroups["branch-segments"] ??= [];
  destructionGroups["branch-segments"].push(node_secondary_right_low_9);
  const socket_secondary_right_low_branch_tip_0 = new THREE.Object3D();
  socket_secondary_right_low_branch_tip_0.name = "branch-tip";
  socket_secondary_right_low_branch_tip_0.position.set(0.0, 1.0, 0.0);
  socket_secondary_right_low_branch_tip_0.rotation.set(0.0, 0.0, 0.0);
  socket_secondary_right_low_branch_tip_0.userData.socket = {"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"};
  node_secondary_right_low_9.add(socket_secondary_right_low_branch_tip_0);
  sockets["secondary-right-low:branch-tip"] = socket_secondary_right_low_branch_tip_0;

  const attachment_secondary_right_high_10 = {"parentId": "primary-right", "parentSocket": "primary-right:branch-tip", "localStart": [0.8, 0.45, -0.02], "localEnd": [0.22, 0.9, 0.02], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.11, "endRadius": 0.05, "evidenceRefs": ["full-object"]};
  const endpoint_secondary_right_high_10 = makeAttachmentEndpoint(attachment_secondary_right_high_10);
  const node_secondary_right_high_10 = new THREE.Group();
  node_secondary_right_high_10.name = "Secondary Right High__pivot";
  if (endpoint_secondary_right_high_10) {
    node_secondary_right_high_10.position.copy(endpoint_secondary_right_high_10.start);
    node_secondary_right_high_10.rotation.set(0, 0, 0);
    node_secondary_right_high_10.scale.set(1, 1, 1);
  } else {
    node_secondary_right_high_10.position.set(0.0, 0.0, 0.0);
    node_secondary_right_high_10.rotation.set(0.0, 0.0, 0.0);
    node_secondary_right_high_10.scale.set(1.0, 1.0, 1.0);
  }
  node_secondary_right_high_10.userData.sculptComponent = {"id": "secondary-right-high", "name": "Secondary Right High", "level": "meso", "role": "branch", "importance": 0.78, "confidence": 0.85, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "geometryDescriptor": {"topologyIntent": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"}, "parent": "primary-right", "attachment": {"parentId": "primary-right", "parentSocket": "primary-right:branch-tip", "localStart": [0.8, 0.45, -0.02], "localEnd": [0.22, 0.9, 0.02], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.11, "endRadius": 0.05, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.22, "height": 0.7351870510285121, "depth": 0.22, "units": "world-relative", "confidence": 0.86}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "branch-segment", "description": "Tapered woody segment with a visible overlap at its parent junction.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "tapered tube segment", "confidence": 0.88}], "surfaceDetail": {"macroRoughness": 0.78, "microRoughness": 0.12, "bumpAmplitude": 0.04, "normalPattern": "faceted procedural variation", "displacementPattern": "none", "occlusionPattern": "contact and branch-junction AO", "edgeWearPattern": "subtle planar value shifts", "notes": "Keep the organic silhouette in geometry; use surface variation only for local response."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "meso", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.95, "dominantAlbedo": "rgba(111, 90, 74, 1)", "secondaryAlbedo": "rgba(89, 72, 61, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1.0], "stops": [{"offset": 0, "color": "rgba(89, 72, 61, 1)"}, {"offset": 0.55, "color": "rgba(111, 90, 74, 1)"}, {"offset": 1, "color": "rgba(149, 126, 104, 1)"}]}}};
  node_secondary_right_high_10.userData.actionProfile = {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}};
  (nodes["primary-right"] ?? root).add(node_secondary_right_high_10);
  nodes["secondary-right-high"] = node_secondary_right_high_10;
  const mesh_secondary_right_high_10Geometry = endpoint_secondary_right_high_10
    ? new THREE.CylinderGeometry(endpoint_secondary_right_high_10.endRadius, endpoint_secondary_right_high_10.baseRadius, endpoint_secondary_right_high_10.length, 32, 12)
    : buildTubeGeometry({"points": [[0.0, -0.5, 0.0], [0.0, 0.5, 0.0]], "radius": 0.05, "closed": false});
  const mesh_secondary_right_high_10 = new THREE.Mesh(
    mesh_secondary_right_high_10Geometry,
    materialMap["bark"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_secondary_right_high_10.name = "Secondary Right High";
  if (endpoint_secondary_right_high_10) {
    mesh_secondary_right_high_10.position.copy(endpoint_secondary_right_high_10.midpoint);
    mesh_secondary_right_high_10.quaternion.copy(endpoint_secondary_right_high_10.quaternion);
  }
  mesh_secondary_right_high_10.castShadow = options.castShadow ?? true;
  mesh_secondary_right_high_10.receiveShadow = options.receiveShadow ?? true;
  mesh_secondary_right_high_10.userData.sculptComponent = {"id": "secondary-right-high", "name": "Secondary Right High", "level": "meso", "role": "branch", "importance": 0.78, "confidence": 0.85, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "geometryDescriptor": {"topologyIntent": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"}, "parent": "primary-right", "attachment": {"parentId": "primary-right", "parentSocket": "primary-right:branch-tip", "localStart": [0.8, 0.45, -0.02], "localEnd": [0.22, 0.9, 0.02], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.11, "endRadius": 0.05, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.22, "height": 0.7351870510285121, "depth": 0.22, "units": "world-relative", "confidence": 0.86}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "branch-segment", "description": "Tapered woody segment with a visible overlap at its parent junction.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "tapered tube segment", "confidence": 0.88}], "surfaceDetail": {"macroRoughness": 0.78, "microRoughness": 0.12, "bumpAmplitude": 0.04, "normalPattern": "faceted procedural variation", "displacementPattern": "none", "occlusionPattern": "contact and branch-junction AO", "edgeWearPattern": "subtle planar value shifts", "notes": "Keep the organic silhouette in geometry; use surface variation only for local response."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "meso", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.95, "dominantAlbedo": "rgba(111, 90, 74, 1)", "secondaryAlbedo": "rgba(89, 72, 61, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1.0], "stops": [{"offset": 0, "color": "rgba(89, 72, 61, 1)"}, {"offset": 0.55, "color": "rgba(111, 90, 74, 1)"}, {"offset": 1, "color": "rgba(149, 126, 104, 1)"}]}}};
  node_secondary_right_high_10.add(mesh_secondary_right_high_10);
  meshes["secondary-right-high"] = mesh_secondary_right_high_10;
  colliders["secondary-right-high"] = {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."};
  destructionGroups["branch-segments"] ??= [];
  destructionGroups["branch-segments"].push(node_secondary_right_high_10);
  const socket_secondary_right_high_branch_tip_0 = new THREE.Object3D();
  socket_secondary_right_high_branch_tip_0.name = "branch-tip";
  socket_secondary_right_high_branch_tip_0.position.set(0.0, 1.0, 0.0);
  socket_secondary_right_high_branch_tip_0.rotation.set(0.0, 0.0, 0.0);
  socket_secondary_right_high_branch_tip_0.userData.socket = {"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"};
  node_secondary_right_high_10.add(socket_secondary_right_high_branch_tip_0);
  sockets["secondary-right-high:branch-tip"] = socket_secondary_right_high_branch_tip_0;

  const attachment_secondary_top_left_11 = {"parentId": "primary-top", "parentSocket": "primary-top:branch-tip", "localStart": [0.05, 0.55, 0.0], "localEnd": [-0.72, 0.92, 0.05], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.105, "endRadius": 0.045, "evidenceRefs": ["full-object"]};
  const endpoint_secondary_top_left_11 = makeAttachmentEndpoint(attachment_secondary_top_left_11);
  const node_secondary_top_left_11 = new THREE.Group();
  node_secondary_top_left_11.name = "Secondary Top Left__pivot";
  if (endpoint_secondary_top_left_11) {
    node_secondary_top_left_11.position.copy(endpoint_secondary_top_left_11.start);
    node_secondary_top_left_11.rotation.set(0, 0, 0);
    node_secondary_top_left_11.scale.set(1, 1, 1);
  } else {
    node_secondary_top_left_11.position.set(0.0, 0.0, 0.0);
    node_secondary_top_left_11.rotation.set(0.0, 0.0, 0.0);
    node_secondary_top_left_11.scale.set(1.0, 1.0, 1.0);
  }
  node_secondary_top_left_11.userData.sculptComponent = {"id": "secondary-top-left", "name": "Secondary Top Left", "level": "meso", "role": "branch", "importance": 0.78, "confidence": 0.85, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "geometryDescriptor": {"topologyIntent": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"}, "parent": "primary-top", "attachment": {"parentId": "primary-top", "parentSocket": "primary-top:branch-tip", "localStart": [0.05, 0.55, 0.0], "localEnd": [-0.72, 0.92, 0.05], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.105, "endRadius": 0.045, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.21, "height": 0.8557452892070163, "depth": 0.21, "units": "world-relative", "confidence": 0.86}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "branch-segment", "description": "Tapered woody segment with a visible overlap at its parent junction.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "tapered tube segment", "confidence": 0.88}], "surfaceDetail": {"macroRoughness": 0.78, "microRoughness": 0.12, "bumpAmplitude": 0.04, "normalPattern": "faceted procedural variation", "displacementPattern": "none", "occlusionPattern": "contact and branch-junction AO", "edgeWearPattern": "subtle planar value shifts", "notes": "Keep the organic silhouette in geometry; use surface variation only for local response."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "meso", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.95, "dominantAlbedo": "rgba(111, 90, 74, 1)", "secondaryAlbedo": "rgba(89, 72, 61, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1.0], "stops": [{"offset": 0, "color": "rgba(89, 72, 61, 1)"}, {"offset": 0.55, "color": "rgba(111, 90, 74, 1)"}, {"offset": 1, "color": "rgba(149, 126, 104, 1)"}]}}};
  node_secondary_top_left_11.userData.actionProfile = {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}};
  (nodes["primary-top"] ?? root).add(node_secondary_top_left_11);
  nodes["secondary-top-left"] = node_secondary_top_left_11;
  const mesh_secondary_top_left_11Geometry = endpoint_secondary_top_left_11
    ? new THREE.CylinderGeometry(endpoint_secondary_top_left_11.endRadius, endpoint_secondary_top_left_11.baseRadius, endpoint_secondary_top_left_11.length, 32, 12)
    : buildTubeGeometry({"points": [[0.0, -0.5, 0.0], [0.0, 0.5, 0.0]], "radius": 0.05, "closed": false});
  const mesh_secondary_top_left_11 = new THREE.Mesh(
    mesh_secondary_top_left_11Geometry,
    materialMap["bark"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_secondary_top_left_11.name = "Secondary Top Left";
  if (endpoint_secondary_top_left_11) {
    mesh_secondary_top_left_11.position.copy(endpoint_secondary_top_left_11.midpoint);
    mesh_secondary_top_left_11.quaternion.copy(endpoint_secondary_top_left_11.quaternion);
  }
  mesh_secondary_top_left_11.castShadow = options.castShadow ?? true;
  mesh_secondary_top_left_11.receiveShadow = options.receiveShadow ?? true;
  mesh_secondary_top_left_11.userData.sculptComponent = {"id": "secondary-top-left", "name": "Secondary Top Left", "level": "meso", "role": "branch", "importance": 0.78, "confidence": 0.85, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "geometryDescriptor": {"topologyIntent": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"}, "parent": "primary-top", "attachment": {"parentId": "primary-top", "parentSocket": "primary-top:branch-tip", "localStart": [0.05, 0.55, 0.0], "localEnd": [-0.72, 0.92, 0.05], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.105, "endRadius": 0.045, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.21, "height": 0.8557452892070163, "depth": 0.21, "units": "world-relative", "confidence": 0.86}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "branch-segment", "description": "Tapered woody segment with a visible overlap at its parent junction.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "tapered tube segment", "confidence": 0.88}], "surfaceDetail": {"macroRoughness": 0.78, "microRoughness": 0.12, "bumpAmplitude": 0.04, "normalPattern": "faceted procedural variation", "displacementPattern": "none", "occlusionPattern": "contact and branch-junction AO", "edgeWearPattern": "subtle planar value shifts", "notes": "Keep the organic silhouette in geometry; use surface variation only for local response."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "meso", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.95, "dominantAlbedo": "rgba(111, 90, 74, 1)", "secondaryAlbedo": "rgba(89, 72, 61, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1.0], "stops": [{"offset": 0, "color": "rgba(89, 72, 61, 1)"}, {"offset": 0.55, "color": "rgba(111, 90, 74, 1)"}, {"offset": 1, "color": "rgba(149, 126, 104, 1)"}]}}};
  node_secondary_top_left_11.add(mesh_secondary_top_left_11);
  meshes["secondary-top-left"] = mesh_secondary_top_left_11;
  colliders["secondary-top-left"] = {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."};
  destructionGroups["branch-segments"] ??= [];
  destructionGroups["branch-segments"].push(node_secondary_top_left_11);
  const socket_secondary_top_left_branch_tip_0 = new THREE.Object3D();
  socket_secondary_top_left_branch_tip_0.name = "branch-tip";
  socket_secondary_top_left_branch_tip_0.position.set(0.0, 1.0, 0.0);
  socket_secondary_top_left_branch_tip_0.rotation.set(0.0, 0.0, 0.0);
  socket_secondary_top_left_branch_tip_0.userData.socket = {"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"};
  node_secondary_top_left_11.add(socket_secondary_top_left_branch_tip_0);
  sockets["secondary-top-left:branch-tip"] = socket_secondary_top_left_branch_tip_0;

  const attachment_secondary_top_right_12 = {"parentId": "primary-top", "parentSocket": "primary-top:branch-tip", "localStart": [0.12, 0.8, 0.0], "localEnd": [0.72, 0.86, -0.02], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.105, "endRadius": 0.045, "evidenceRefs": ["full-object"]};
  const endpoint_secondary_top_right_12 = makeAttachmentEndpoint(attachment_secondary_top_right_12);
  const node_secondary_top_right_12 = new THREE.Group();
  node_secondary_top_right_12.name = "Secondary Top Right__pivot";
  if (endpoint_secondary_top_right_12) {
    node_secondary_top_right_12.position.copy(endpoint_secondary_top_right_12.start);
    node_secondary_top_right_12.rotation.set(0, 0, 0);
    node_secondary_top_right_12.scale.set(1, 1, 1);
  } else {
    node_secondary_top_right_12.position.set(0.0, 0.0, 0.0);
    node_secondary_top_right_12.rotation.set(0.0, 0.0, 0.0);
    node_secondary_top_right_12.scale.set(1.0, 1.0, 1.0);
  }
  node_secondary_top_right_12.userData.sculptComponent = {"id": "secondary-top-right", "name": "Secondary Top Right", "level": "meso", "role": "branch", "importance": 0.78, "confidence": 0.85, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "geometryDescriptor": {"topologyIntent": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"}, "parent": "primary-top", "attachment": {"parentId": "primary-top", "parentSocket": "primary-top:branch-tip", "localStart": [0.12, 0.8, 0.0], "localEnd": [0.72, 0.86, -0.02], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.105, "endRadius": 0.045, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.21, "height": 0.6033241251599343, "depth": 0.21, "units": "world-relative", "confidence": 0.86}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "branch-segment", "description": "Tapered woody segment with a visible overlap at its parent junction.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "tapered tube segment", "confidence": 0.88}], "surfaceDetail": {"macroRoughness": 0.78, "microRoughness": 0.12, "bumpAmplitude": 0.04, "normalPattern": "faceted procedural variation", "displacementPattern": "none", "occlusionPattern": "contact and branch-junction AO", "edgeWearPattern": "subtle planar value shifts", "notes": "Keep the organic silhouette in geometry; use surface variation only for local response."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "meso", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.95, "dominantAlbedo": "rgba(111, 90, 74, 1)", "secondaryAlbedo": "rgba(89, 72, 61, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1.0], "stops": [{"offset": 0, "color": "rgba(89, 72, 61, 1)"}, {"offset": 0.55, "color": "rgba(111, 90, 74, 1)"}, {"offset": 1, "color": "rgba(149, 126, 104, 1)"}]}}};
  node_secondary_top_right_12.userData.actionProfile = {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}};
  (nodes["primary-top"] ?? root).add(node_secondary_top_right_12);
  nodes["secondary-top-right"] = node_secondary_top_right_12;
  const mesh_secondary_top_right_12Geometry = endpoint_secondary_top_right_12
    ? new THREE.CylinderGeometry(endpoint_secondary_top_right_12.endRadius, endpoint_secondary_top_right_12.baseRadius, endpoint_secondary_top_right_12.length, 32, 12)
    : buildTubeGeometry({"points": [[0.0, -0.5, 0.0], [0.0, 0.5, 0.0]], "radius": 0.05, "closed": false});
  const mesh_secondary_top_right_12 = new THREE.Mesh(
    mesh_secondary_top_right_12Geometry,
    materialMap["bark"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_secondary_top_right_12.name = "Secondary Top Right";
  if (endpoint_secondary_top_right_12) {
    mesh_secondary_top_right_12.position.copy(endpoint_secondary_top_right_12.midpoint);
    mesh_secondary_top_right_12.quaternion.copy(endpoint_secondary_top_right_12.quaternion);
  }
  mesh_secondary_top_right_12.castShadow = options.castShadow ?? true;
  mesh_secondary_top_right_12.receiveShadow = options.receiveShadow ?? true;
  mesh_secondary_top_right_12.userData.sculptComponent = {"id": "secondary-top-right", "name": "Secondary Top Right", "level": "meso", "role": "branch", "importance": 0.78, "confidence": 0.85, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "geometryDescriptor": {"topologyIntent": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"}, "parent": "primary-top", "attachment": {"parentId": "primary-top", "parentSocket": "primary-top:branch-tip", "localStart": [0.12, 0.8, 0.0], "localEnd": [0.72, 0.86, -0.02], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.105, "endRadius": 0.045, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.21, "height": 0.6033241251599343, "depth": 0.21, "units": "world-relative", "confidence": 0.86}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "branch-segment", "description": "Tapered woody segment with a visible overlap at its parent junction.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "tapered tube segment", "confidence": 0.88}], "surfaceDetail": {"macroRoughness": 0.78, "microRoughness": 0.12, "bumpAmplitude": 0.04, "normalPattern": "faceted procedural variation", "displacementPattern": "none", "occlusionPattern": "contact and branch-junction AO", "edgeWearPattern": "subtle planar value shifts", "notes": "Keep the organic silhouette in geometry; use surface variation only for local response."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "meso", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.95, "dominantAlbedo": "rgba(111, 90, 74, 1)", "secondaryAlbedo": "rgba(89, 72, 61, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1.0], "stops": [{"offset": 0, "color": "rgba(89, 72, 61, 1)"}, {"offset": 0.55, "color": "rgba(111, 90, 74, 1)"}, {"offset": 1, "color": "rgba(149, 126, 104, 1)"}]}}};
  node_secondary_top_right_12.add(mesh_secondary_top_right_12);
  meshes["secondary-top-right"] = mesh_secondary_top_right_12;
  colliders["secondary-top-right"] = {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."};
  destructionGroups["branch-segments"] ??= [];
  destructionGroups["branch-segments"].push(node_secondary_top_right_12);
  const socket_secondary_top_right_branch_tip_0 = new THREE.Object3D();
  socket_secondary_top_right_branch_tip_0.name = "branch-tip";
  socket_secondary_top_right_branch_tip_0.position.set(0.0, 1.0, 0.0);
  socket_secondary_top_right_branch_tip_0.rotation.set(0.0, 0.0, 0.0);
  socket_secondary_top_right_branch_tip_0.userData.socket = {"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"};
  node_secondary_top_right_12.add(socket_secondary_top_right_branch_tip_0);
  sockets["secondary-top-right:branch-tip"] = socket_secondary_top_right_branch_tip_0;

  const attachment_secondary_mid_left_13 = {"parentId": "primary-mid-left", "parentSocket": "primary-mid-left:branch-tip", "localStart": [0.25, 0.18, 0.0], "localEnd": [-0.62, 0.48, 0.02], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.1, "endRadius": 0.045, "evidenceRefs": ["full-object"]};
  const endpoint_secondary_mid_left_13 = makeAttachmentEndpoint(attachment_secondary_mid_left_13);
  const node_secondary_mid_left_13 = new THREE.Group();
  node_secondary_mid_left_13.name = "Secondary Mid Left__pivot";
  if (endpoint_secondary_mid_left_13) {
    node_secondary_mid_left_13.position.copy(endpoint_secondary_mid_left_13.start);
    node_secondary_mid_left_13.rotation.set(0, 0, 0);
    node_secondary_mid_left_13.scale.set(1, 1, 1);
  } else {
    node_secondary_mid_left_13.position.set(0.0, 0.0, 0.0);
    node_secondary_mid_left_13.rotation.set(0.0, 0.0, 0.0);
    node_secondary_mid_left_13.scale.set(1.0, 1.0, 1.0);
  }
  node_secondary_mid_left_13.userData.sculptComponent = {"id": "secondary-mid-left", "name": "Secondary Mid Left", "level": "meso", "role": "branch", "importance": 0.78, "confidence": 0.85, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "geometryDescriptor": {"topologyIntent": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"}, "parent": "primary-mid-left", "attachment": {"parentId": "primary-mid-left", "parentSocket": "primary-mid-left:branch-tip", "localStart": [0.25, 0.18, 0.0], "localEnd": [-0.62, 0.48, 0.02], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.1, "endRadius": 0.045, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.2, "height": 0.9204890004774636, "depth": 0.2, "units": "world-relative", "confidence": 0.86}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "branch-segment", "description": "Tapered woody segment with a visible overlap at its parent junction.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "tapered tube segment", "confidence": 0.88}], "surfaceDetail": {"macroRoughness": 0.78, "microRoughness": 0.12, "bumpAmplitude": 0.04, "normalPattern": "faceted procedural variation", "displacementPattern": "none", "occlusionPattern": "contact and branch-junction AO", "edgeWearPattern": "subtle planar value shifts", "notes": "Keep the organic silhouette in geometry; use surface variation only for local response."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "meso", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.95, "dominantAlbedo": "rgba(111, 90, 74, 1)", "secondaryAlbedo": "rgba(89, 72, 61, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1.0], "stops": [{"offset": 0, "color": "rgba(89, 72, 61, 1)"}, {"offset": 0.55, "color": "rgba(111, 90, 74, 1)"}, {"offset": 1, "color": "rgba(149, 126, 104, 1)"}]}}};
  node_secondary_mid_left_13.userData.actionProfile = {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}};
  (nodes["primary-mid-left"] ?? root).add(node_secondary_mid_left_13);
  nodes["secondary-mid-left"] = node_secondary_mid_left_13;
  const mesh_secondary_mid_left_13Geometry = endpoint_secondary_mid_left_13
    ? new THREE.CylinderGeometry(endpoint_secondary_mid_left_13.endRadius, endpoint_secondary_mid_left_13.baseRadius, endpoint_secondary_mid_left_13.length, 32, 12)
    : buildTubeGeometry({"points": [[0.0, -0.5, 0.0], [0.0, 0.5, 0.0]], "radius": 0.05, "closed": false});
  const mesh_secondary_mid_left_13 = new THREE.Mesh(
    mesh_secondary_mid_left_13Geometry,
    materialMap["bark"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_secondary_mid_left_13.name = "Secondary Mid Left";
  if (endpoint_secondary_mid_left_13) {
    mesh_secondary_mid_left_13.position.copy(endpoint_secondary_mid_left_13.midpoint);
    mesh_secondary_mid_left_13.quaternion.copy(endpoint_secondary_mid_left_13.quaternion);
  }
  mesh_secondary_mid_left_13.castShadow = options.castShadow ?? true;
  mesh_secondary_mid_left_13.receiveShadow = options.receiveShadow ?? true;
  mesh_secondary_mid_left_13.userData.sculptComponent = {"id": "secondary-mid-left", "name": "Secondary Mid Left", "level": "meso", "role": "branch", "importance": 0.78, "confidence": 0.85, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "geometryDescriptor": {"topologyIntent": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"}, "parent": "primary-mid-left", "attachment": {"parentId": "primary-mid-left", "parentSocket": "primary-mid-left:branch-tip", "localStart": [0.25, 0.18, 0.0], "localEnd": [-0.62, 0.48, 0.02], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.1, "endRadius": 0.045, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.2, "height": 0.9204890004774636, "depth": 0.2, "units": "world-relative", "confidence": 0.86}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "branch-segment", "description": "Tapered woody segment with a visible overlap at its parent junction.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "tapered tube segment", "confidence": 0.88}], "surfaceDetail": {"macroRoughness": 0.78, "microRoughness": 0.12, "bumpAmplitude": 0.04, "normalPattern": "faceted procedural variation", "displacementPattern": "none", "occlusionPattern": "contact and branch-junction AO", "edgeWearPattern": "subtle planar value shifts", "notes": "Keep the organic silhouette in geometry; use surface variation only for local response."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "meso", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.95, "dominantAlbedo": "rgba(111, 90, 74, 1)", "secondaryAlbedo": "rgba(89, 72, 61, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1.0], "stops": [{"offset": 0, "color": "rgba(89, 72, 61, 1)"}, {"offset": 0.55, "color": "rgba(111, 90, 74, 1)"}, {"offset": 1, "color": "rgba(149, 126, 104, 1)"}]}}};
  node_secondary_mid_left_13.add(mesh_secondary_mid_left_13);
  meshes["secondary-mid-left"] = mesh_secondary_mid_left_13;
  colliders["secondary-mid-left"] = {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."};
  destructionGroups["branch-segments"] ??= [];
  destructionGroups["branch-segments"].push(node_secondary_mid_left_13);
  const socket_secondary_mid_left_branch_tip_0 = new THREE.Object3D();
  socket_secondary_mid_left_branch_tip_0.name = "branch-tip";
  socket_secondary_mid_left_branch_tip_0.position.set(0.0, 1.0, 0.0);
  socket_secondary_mid_left_branch_tip_0.rotation.set(0.0, 0.0, 0.0);
  socket_secondary_mid_left_branch_tip_0.userData.socket = {"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"};
  node_secondary_mid_left_13.add(socket_secondary_mid_left_branch_tip_0);
  sockets["secondary-mid-left:branch-tip"] = socket_secondary_mid_left_branch_tip_0;

  const attachment_secondary_mid_right_14 = {"parentId": "primary-mid-right", "parentSocket": "primary-mid-right:branch-tip", "localStart": [0.25, 0.18, 0.0], "localEnd": [0.62, 0.48, -0.02], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.1, "endRadius": 0.045, "evidenceRefs": ["full-object"]};
  const endpoint_secondary_mid_right_14 = makeAttachmentEndpoint(attachment_secondary_mid_right_14);
  const node_secondary_mid_right_14 = new THREE.Group();
  node_secondary_mid_right_14.name = "Secondary Mid Right__pivot";
  if (endpoint_secondary_mid_right_14) {
    node_secondary_mid_right_14.position.copy(endpoint_secondary_mid_right_14.start);
    node_secondary_mid_right_14.rotation.set(0, 0, 0);
    node_secondary_mid_right_14.scale.set(1, 1, 1);
  } else {
    node_secondary_mid_right_14.position.set(0.0, 0.0, 0.0);
    node_secondary_mid_right_14.rotation.set(0.0, 0.0, 0.0);
    node_secondary_mid_right_14.scale.set(1.0, 1.0, 1.0);
  }
  node_secondary_mid_right_14.userData.sculptComponent = {"id": "secondary-mid-right", "name": "Secondary Mid Right", "level": "meso", "role": "branch", "importance": 0.78, "confidence": 0.85, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "geometryDescriptor": {"topologyIntent": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"}, "parent": "primary-mid-right", "attachment": {"parentId": "primary-mid-right", "parentSocket": "primary-mid-right:branch-tip", "localStart": [0.25, 0.18, 0.0], "localEnd": [0.62, 0.48, -0.02], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.1, "endRadius": 0.045, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.2, "height": 0.47675989764240867, "depth": 0.2, "units": "world-relative", "confidence": 0.86}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "branch-segment", "description": "Tapered woody segment with a visible overlap at its parent junction.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "tapered tube segment", "confidence": 0.88}], "surfaceDetail": {"macroRoughness": 0.78, "microRoughness": 0.12, "bumpAmplitude": 0.04, "normalPattern": "faceted procedural variation", "displacementPattern": "none", "occlusionPattern": "contact and branch-junction AO", "edgeWearPattern": "subtle planar value shifts", "notes": "Keep the organic silhouette in geometry; use surface variation only for local response."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "meso", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.95, "dominantAlbedo": "rgba(111, 90, 74, 1)", "secondaryAlbedo": "rgba(89, 72, 61, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1.0], "stops": [{"offset": 0, "color": "rgba(89, 72, 61, 1)"}, {"offset": 0.55, "color": "rgba(111, 90, 74, 1)"}, {"offset": 1, "color": "rgba(149, 126, 104, 1)"}]}}};
  node_secondary_mid_right_14.userData.actionProfile = {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}};
  (nodes["primary-mid-right"] ?? root).add(node_secondary_mid_right_14);
  nodes["secondary-mid-right"] = node_secondary_mid_right_14;
  const mesh_secondary_mid_right_14Geometry = endpoint_secondary_mid_right_14
    ? new THREE.CylinderGeometry(endpoint_secondary_mid_right_14.endRadius, endpoint_secondary_mid_right_14.baseRadius, endpoint_secondary_mid_right_14.length, 32, 12)
    : buildTubeGeometry({"points": [[0.0, -0.5, 0.0], [0.0, 0.5, 0.0]], "radius": 0.05, "closed": false});
  const mesh_secondary_mid_right_14 = new THREE.Mesh(
    mesh_secondary_mid_right_14Geometry,
    materialMap["bark"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_secondary_mid_right_14.name = "Secondary Mid Right";
  if (endpoint_secondary_mid_right_14) {
    mesh_secondary_mid_right_14.position.copy(endpoint_secondary_mid_right_14.midpoint);
    mesh_secondary_mid_right_14.quaternion.copy(endpoint_secondary_mid_right_14.quaternion);
  }
  mesh_secondary_mid_right_14.castShadow = options.castShadow ?? true;
  mesh_secondary_mid_right_14.receiveShadow = options.receiveShadow ?? true;
  mesh_secondary_mid_right_14.userData.sculptComponent = {"id": "secondary-mid-right", "name": "Secondary Mid Right", "level": "meso", "role": "branch", "importance": 0.78, "confidence": 0.85, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "geometryDescriptor": {"topologyIntent": "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"}, "parent": "primary-mid-right", "attachment": {"parentId": "primary-mid-right", "parentSocket": "primary-mid-right:branch-tip", "localStart": [0.25, 0.18, 0.0], "localEnd": [0.62, 0.48, -0.02], "contactType": "overlap", "overlap": 0.06, "gapTolerance": 0.012, "baseRadius": 0.1, "endRadius": 0.045, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.2, "height": 0.47675989764240867, "depth": 0.2, "units": "world-relative", "confidence": 0.86}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."}, "constraints": [], "destruction": {"breakable": true, "fractureGroup": "branch-segments", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "branch-segment", "description": "Tapered woody segment with a visible overlap at its parent junction.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows local branch or surface frame", "materialEffect": "preserve reference albedo and roughness variation", "geometryEffect": "tapered tube segment", "confidence": 0.88}], "surfaceDetail": {"macroRoughness": 0.78, "microRoughness": 0.12, "bumpAmplitude": 0.04, "normalPattern": "faceted procedural variation", "displacementPattern": "none", "occlusionPattern": "contact and branch-junction AO", "edgeWearPattern": "subtle planar value shifts", "notes": "Keep the organic silhouette in geometry; use surface variation only for local response."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "meso", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.95, "dominantAlbedo": "rgba(111, 90, 74, 1)", "secondaryAlbedo": "rgba(89, 72, 61, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1.0], "stops": [{"offset": 0, "color": "rgba(89, 72, 61, 1)"}, {"offset": 0.55, "color": "rgba(111, 90, 74, 1)"}, {"offset": 1, "color": "rgba(149, 126, 104, 1)"}]}}};
  node_secondary_mid_right_14.add(mesh_secondary_mid_right_14);
  meshes["secondary-mid-right"] = mesh_secondary_mid_right_14;
  colliders["secondary-mid-right"] = {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."};
  destructionGroups["branch-segments"] ??= [];
  destructionGroups["branch-segments"].push(node_secondary_mid_right_14);
  const socket_secondary_mid_right_branch_tip_0 = new THREE.Object3D();
  socket_secondary_mid_right_branch_tip_0.name = "branch-tip";
  socket_secondary_mid_right_branch_tip_0.position.set(0.0, 1.0, 0.0);
  socket_secondary_mid_right_branch_tip_0.rotation.set(0.0, 0.0, 0.0);
  socket_secondary_mid_right_branch_tip_0.userData.socket = {"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"};
  node_secondary_mid_right_14.add(socket_secondary_mid_right_branch_tip_0);
  sockets["secondary-mid-right:branch-tip"] = socket_secondary_mid_right_branch_tip_0;

  root.userData.sculptRuntime = { nodes, meshes, sockets, colliders, destructionGroups } satisfies ProceduralModelRuntime;
  root.userData.lookDevTargets = {"qualityPriority": "balanced", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": false, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py", "acceptedLimitation": "PBR extraction is recorded as evidence with 0.86 confidence, but the runtime model uses authored procedural materials because the source is a stylized single view."}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"]}, "screenshotReview": ["Compare branch silhouette and negative spaces.", "Compare blossom cluster distribution and individual petal readability.", "Compare bark facet response under neutral and grazing light.", "Compare warm ivory background and contact shadow.", "Capture front-three-quarter, side-orbit, and low-angle-root renders."]};
  root.userData.actionReadiness = {
    note: 'Use root.userData.sculptRuntime.nodes for transforms, sockets for attachments, colliders for physics proxies, and destructionGroups for breakable sets.',
  };
  return root;
}

export function createSakuraTreeLookDevLights(
  mode: 'neutral' | 'grazing' | 'reference' = 'neutral',
): THREE.Group {
  const lights = new THREE.Group();
  lights.name = "Sakura Tree look-dev lights";
  const hemi = new THREE.HemisphereLight(
    mode === 'reference' ? 0xfff0d6 : 0xf2f4ff,
    0x363b42,
    mode === 'grazing' ? 0.28 : mode === 'reference' ? 0.72 : 0.85,
  );
  lights.add(hemi);
  const key = new THREE.DirectionalLight(
    mode === 'reference' ? 0xffcf8a : 0xfff4e8,
    mode === 'grazing' ? 4.2 : mode === 'reference' ? 2.6 : 2.15,
  );
  if (mode === 'grazing') key.position.set(7.5, 1.1, 4.0);
  else if (mode === 'reference') key.position.set(-4.5, 7.5, 5.0);
  else key.position.set(-4.0, 6.0, 5.5);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.018;
  key.shadow.radius = 7;
  key.shadow.blurSamples = 24;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 30;
  key.shadow.camera.left = -2.6;
  key.shadow.camera.right = 2.6;
  key.shadow.camera.top = 2.6;
  key.shadow.camera.bottom = -2.6;
  key.shadow.camera.updateProjectionMatrix();
  lights.add(key);
  const fill = new THREE.DirectionalLight(0xa8c4ff, mode === 'grazing' ? 0.12 : 0.42);
  fill.position.set(4.0, 3.0, 3.5);
  lights.add(fill);
  const rim = new THREE.DirectionalLight(0xfff1c4, mode === 'grazing' ? 0.28 : 0.85);
  rim.position.set(0.5, 4.5, -6.0);
  lights.add(rim);
  lights.userData.reviewMode = mode;
  lights.userData.lightingFromPhoto = [{"type": "key light", "direction": "upper front-left, broad soft source", "color": "warm ivory daylight", "intensity": "moderate; preserve pale petals without clipping"}, {"type": "fill light", "direction": "front and slightly above camera", "color": "warm neutral", "intensity": "low; keep trunk fork readable"}, {"type": "rim or environment light", "direction": "soft rear hemisphere", "color": "pale warm cream", "intensity": "subtle; separate blossom edges from background"}, {"type": "exposure and tone mapping", "exposure": "slightly below neutral to preserve petal value range", "toneMapping": "ACESFilmic or equivalent filmic mapping", "background": "warm ivory field"}, {"type": "contact shadow", "behavior": "soft ground contact beneath roots and sparse petal accents; no hard cast shadow"}];
  lights.userData.lookDevTargets = {"qualityPriority": "balanced", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": false, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py", "acceptedLimitation": "PBR extraction is recorded as evidence with 0.86 confidence, but the runtime model uses authored procedural materials because the source is a stylized single view."}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"]}, "screenshotReview": ["Compare branch silhouette and negative spaces.", "Compare blossom cluster distribution and individual petal readability.", "Compare bark facet response under neutral and grazing light.", "Compare warm ivory background and contact shadow.", "Capture front-three-quarter, side-orbit, and low-angle-root renders."]};
  return lights;
}

// PBR materials (clearcoat/iridescence/transmission/anisotropy) need an environment
// map to visually behave as intended — call this once per renderer and assign the
// result to scene.environment before rendering. No external HDR asset required.
export function createSakuraTreeEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return texture;
}

// Plan 1.3 §3.2 — auto-framing by bounding box. The Divine Eye can only compare a
// render to the reference if the object is FRAMED consistently (an object framed
// differently scores as wrong even when its shape is right). This positions the camera
// deterministically from the object's bounding box so it fills the frame at a stable
// margin, and sets near/far to the object scale. Call after adding the model to the
// scene, and again on resize (after updating camera.aspect).
export function frameSakuraTreeCamera(
  camera: THREE.PerspectiveCamera,
  object: THREE.Object3D,
  options: { margin?: number; azimuthDeg?: number; elevationDeg?: number } = {},
): void {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const margin = options.margin ?? 1.15;
  const maxDim = Math.max(size.x, size.y, size.z) * margin;
  const fov = (camera.fov * Math.PI) / 180;
  // distance so the largest object dimension fits vertically in the frame
  const distance = (maxDim / 2) / Math.tan(fov / 2);
  const az = ((options.azimuthDeg ?? 0) * Math.PI) / 180;
  const el = ((options.elevationDeg ?? 0) * Math.PI) / 180;
  const dir = new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el),
  );
  camera.position.copy(center).addScaledVector(dir, distance);
  camera.near = Math.max(0.01, distance - maxDim);
  camera.far = distance + maxDim * 2;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

// Plan 1.3 §3.2c — PRESENTATION composer (DOF + bloom). CRITICAL (R-POSTFX): this is
// for the showcase/hero render ONLY. The Divine Eye's EVALUATION render MUST use a
// plain renderer with NO composer — bloom blows highlights and DOF blurs edges, which
// would corrupt the deterministic IoU/DCD/edge/blowout signals. Enable dof/bloom ONLY
// when the reference photo actually exhibits them (detect_reference_effects.py authorizes).
export function createSakuraTreePresentationComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  options: { dof?: boolean; bloom?: boolean; bloomStrength?: number; dofFocus?: number; dofAperture?: number } = {},
): EffectComposer {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (options.dof) {
    composer.addPass(new BokehPass(scene, camera, {
      focus: options.dofFocus ?? 10.0,
      aperture: options.dofAperture ?? 0.0002,
      maxblur: 0.01,
    }));
  }
  if (options.bloom) {
    const size = new THREE.Vector2();
    renderer.getSize(size);
    composer.addPass(new UnrealBloomPass(size, options.bloomStrength ?? 0.4, 0.4, 0.85));
  }
  return composer;
}

export function configureSakuraTreeRenderer(renderer: THREE.WebGLRenderer): void {
  // Load-bearing for view-dependent finishes (anodized / Doppler): without ACES + sRGB
  // the environment reflection reads flat/washed instead of a believable metal response.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

export function createSakuraTreeInspectControls(
  camera: THREE.Camera,
  domElement: HTMLElement,
): OrbitControls {
  // View-dependent finishes only read correctly once the user orbits — their color
  // comes from the environment reflection, not albedo, so free rotation matters here.
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.minDistance = 1.0;
  controls.maxDistance = 8.0;
  controls.autoRotate = false;
  return controls;
}
