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

type SculptMaterialSpec = Record<string, unknown>;

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

// Generated from ObjectSculptSpec target: Living Sakura v2
// Sculpt build pass: blockout
// This factory is intentionally pass-gated. Finish browser screenshot review before unlocking deeper passes.
export function createLivingSakuraV2Model(options: ProceduralModelOptions = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = "Living Sakura v2";
  root.userData.reconstructionEvidence = {"itemFamily": null, "subtype": null, "componentAdapter": null, "route": null, "exactnessTier": null, "referenceCamera": {"solved": true, "fovDegrees": 34, "aspect": 1.0, "orientation": {"yaw": 0.0, "pitch": 0.0, "roll": 0.0}, "positionHint": [0, 3.8, 11.5], "note": "Near-orthographic editorial product framing; verify against front reference and three-quarter orbit."}, "approximationNotes": []};

  const materialMap: Record<string, THREE.Material> = {};
  materialMap["bark"] = createSculptMaterial(
    "bark",
    {"id": "bark", "name": "Warm faceted Sakura bark", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#6a5147", "color": "#6a5147", "albedo": {"dominant": "#6a5147", "secondary": ["#493a36", "#8b6c5a", "#a7836e"], "samplingNotes": "Warm brown-grey bark sampled from trunk planes; rough, never plastic."}, "colorVariation": {"palette": ["#6a5147", "#493a36", "#8b6c5a", "#a7836e"], "pattern": "deterministic organ-local variation", "amplitude": 0.16, "heightCorrelation": 0.2}, "textureResolution": 1024, "textureProjection": {"mode": "object", "repeat": [2, 3], "anisotropy": 4, "texelDensityIntent": "stable across differently scaled botanical organs"}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2, "amplitude": 0.3, "role": "broad value planes"}, {"id": "meso", "frequency": 10, "amplitude": 0.14, "role": "organ structure and shallow relief"}, {"id": "micro", "frequency": 42, "amplitude": 0.045, "role": "grazing highlight breakup"}], "roughness": {"base": 0.86, "variation": 0.1, "map": "independent-procedural-roughness", "localResponse": "cavities stay matte; raised planes carry a soft highlight"}, "metalness": {"base": 0, "variation": 0}, "normal": {"pattern": "longitudinal bark grain and horizontal lenticel interruptions", "strength": 0.22, "scale": 18, "space": "tangent"}, "bump": {"pattern": "longitudinal bark grain and horizontal lenticel interruptions", "amplitude": 0.025, "scale": 24}, "displacement": {"pattern": "none", "amplitude": 0, "scale": 1, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.28, "contactShadowBias": 0.3, "notes": "only at genuine overlaps and flower centers"}, "wear": {"edgeWear": 0.03, "scratches": [], "chips": []}, "dirt": {"amount": 0.03, "cavityBias": 0.15, "color": "#a7836e"}, "localOverrides": [{"id": "bark-local", "region": "reference-visible local accents", "roughness": 0.9199999999999999, "evidenceRefs": ["full-object"]}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Warm brown-grey bark sampled from trunk planes; rough, never plastic.", "qualityTier": "reference"},
    options
  );
  materialMap["petal-pale"] = createSculptMaterial(
    "petal-pale",
    {"id": "petal-pale", "name": "Pale blush petals", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#f5dedf", "color": "#f5dedf", "albedo": {"dominant": "#f5dedf", "secondary": ["#fff1ec", "#eab7c2", "#d98fa5"], "samplingNotes": "Near-white blush petals with warm pink centers."}, "colorVariation": {"palette": ["#f5dedf", "#fff1ec", "#eab7c2", "#d98fa5"], "pattern": "deterministic organ-local variation", "amplitude": 0.16, "heightCorrelation": 0.2}, "textureResolution": 1024, "textureProjection": {"mode": "object", "repeat": [2, 3], "anisotropy": 4, "texelDensityIntent": "stable across differently scaled botanical organs"}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2, "amplitude": 0.3, "role": "broad value planes"}, {"id": "meso", "frequency": 10, "amplitude": 0.14, "role": "organ structure and shallow relief"}, {"id": "micro", "frequency": 42, "amplitude": 0.045, "role": "grazing highlight breakup"}], "roughness": {"base": 0.68, "variation": 0.1, "map": "independent-procedural-roughness", "localResponse": "cavities stay matte; raised planes carry a soft highlight"}, "metalness": {"base": 0, "variation": 0}, "normal": {"pattern": "shallow five-petal cups", "strength": 0.22, "scale": 18, "space": "tangent"}, "bump": {"pattern": "shallow five-petal cups", "amplitude": 0.025, "scale": 24}, "displacement": {"pattern": "none", "amplitude": 0, "scale": 1, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.28, "contactShadowBias": 0.3, "notes": "only at genuine overlaps and flower centers"}, "wear": {"edgeWear": 0.03, "scratches": [], "chips": []}, "dirt": {"amount": 0.03, "cavityBias": 0.15, "color": "#d98fa5"}, "localOverrides": [{"id": "petal-pale-local", "region": "reference-visible local accents", "roughness": 0.74, "evidenceRefs": ["full-object"]}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Near-white blush petals with warm pink centers.", "qualityTier": "reference"},
    options
  );
  materialMap["petal-rose"] = createSculptMaterial(
    "petal-rose",
    {"id": "petal-rose", "name": "Rose accent petals", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#e7a8b8", "color": "#e7a8b8", "albedo": {"dominant": "#e7a8b8", "secondary": ["#f1c5cd", "#cc7896", "#f7dce0"], "samplingNotes": "Restrained rose accents create depth without a uniform pink cloud."}, "colorVariation": {"palette": ["#e7a8b8", "#f1c5cd", "#cc7896", "#f7dce0"], "pattern": "deterministic organ-local variation", "amplitude": 0.16, "heightCorrelation": 0.2}, "textureResolution": 1024, "textureProjection": {"mode": "object", "repeat": [2, 3], "anisotropy": 4, "texelDensityIntent": "stable across differently scaled botanical organs"}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2, "amplitude": 0.3, "role": "broad value planes"}, {"id": "meso", "frequency": 10, "amplitude": 0.14, "role": "organ structure and shallow relief"}, {"id": "micro", "frequency": 42, "amplitude": 0.045, "role": "grazing highlight breakup"}], "roughness": {"base": 0.65, "variation": 0.1, "map": "independent-procedural-roughness", "localResponse": "cavities stay matte; raised planes carry a soft highlight"}, "metalness": {"base": 0, "variation": 0}, "normal": {"pattern": "shallow five-petal cups", "strength": 0.22, "scale": 18, "space": "tangent"}, "bump": {"pattern": "shallow five-petal cups", "amplitude": 0.025, "scale": 24}, "displacement": {"pattern": "none", "amplitude": 0, "scale": 1, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.28, "contactShadowBias": 0.3, "notes": "only at genuine overlaps and flower centers"}, "wear": {"edgeWear": 0.03, "scratches": [], "chips": []}, "dirt": {"amount": 0.03, "cavityBias": 0.15, "color": "#f7dce0"}, "localOverrides": [{"id": "petal-rose-local", "region": "reference-visible local accents", "roughness": 0.71, "evidenceRefs": ["full-object"]}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Restrained rose accents create depth without a uniform pink cloud.", "qualityTier": "reference"},
    options
  );
  materialMap["leaf"] = createSculptMaterial(
    "leaf",
    {"id": "leaf", "name": "Emerging copper-green leaves", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#7d835b", "color": "#7d835b", "albedo": {"dominant": "#7d835b", "secondary": ["#a28f5d", "#5f704b", "#b39b68"], "samplingNotes": "Sparse pointed spring leaves, limited to a small supporting role."}, "colorVariation": {"palette": ["#7d835b", "#a28f5d", "#5f704b", "#b39b68"], "pattern": "deterministic organ-local variation", "amplitude": 0.16, "heightCorrelation": 0.2}, "textureResolution": 1024, "textureProjection": {"mode": "object", "repeat": [2, 3], "anisotropy": 4, "texelDensityIntent": "stable across differently scaled botanical organs"}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2, "amplitude": 0.3, "role": "broad value planes"}, {"id": "meso", "frequency": 10, "amplitude": 0.14, "role": "organ structure and shallow relief"}, {"id": "micro", "frequency": 42, "amplitude": 0.045, "role": "grazing highlight breakup"}], "roughness": {"base": 0.74, "variation": 0.1, "map": "independent-procedural-roughness", "localResponse": "cavities stay matte; raised planes carry a soft highlight"}, "metalness": {"base": 0, "variation": 0}, "normal": {"pattern": "central vein and lightly serrated plane", "strength": 0.22, "scale": 18, "space": "tangent"}, "bump": {"pattern": "central vein and lightly serrated plane", "amplitude": 0.025, "scale": 24}, "displacement": {"pattern": "none", "amplitude": 0, "scale": 1, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.28, "contactShadowBias": 0.3, "notes": "only at genuine overlaps and flower centers"}, "wear": {"edgeWear": 0.03, "scratches": [], "chips": []}, "dirt": {"amount": 0.03, "cavityBias": 0.15, "color": "#b39b68"}, "localOverrides": [{"id": "leaf-local", "region": "reference-visible local accents", "roughness": 0.8, "evidenceRefs": ["full-object"]}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Sparse pointed spring leaves, limited to a small supporting role.", "qualityTier": "reference"},
    options
  );
  materialMap["ground"] = createSculptMaterial(
    "ground",
    {"id": "ground", "name": "Warm ivory garden field", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#f0e7df", "color": "#f0e7df", "albedo": {"dominant": "#f0e7df", "secondary": ["#fbf5ef", "#dccdc4", "#cbb9ae"], "samplingNotes": "Quiet warm field with soft contact shadow; no scene clutter."}, "colorVariation": {"palette": ["#f0e7df", "#fbf5ef", "#dccdc4", "#cbb9ae"], "pattern": "deterministic organ-local variation", "amplitude": 0.16, "heightCorrelation": 0.2}, "textureResolution": 1024, "textureProjection": {"mode": "object", "repeat": [2, 3], "anisotropy": 4, "texelDensityIntent": "stable across differently scaled botanical organs"}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2, "amplitude": 0.3, "role": "broad value planes"}, {"id": "meso", "frequency": 10, "amplitude": 0.14, "role": "organ structure and shallow relief"}, {"id": "micro", "frequency": 42, "amplitude": 0.045, "role": "grazing highlight breakup"}], "roughness": {"base": 0.95, "variation": 0.1, "map": "independent-procedural-roughness", "localResponse": "cavities stay matte; raised planes carry a soft highlight"}, "metalness": {"base": 0, "variation": 0}, "normal": {"pattern": "fine matte paper grain", "strength": 0.22, "scale": 18, "space": "tangent"}, "bump": {"pattern": "fine matte paper grain", "amplitude": 0.025, "scale": 24}, "displacement": {"pattern": "none", "amplitude": 0, "scale": 1, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.28, "contactShadowBias": 0.3, "notes": "only at genuine overlaps and flower centers"}, "wear": {"edgeWear": 0.03, "scratches": [], "chips": []}, "dirt": {"amount": 0.03, "cavityBias": 0.15, "color": "#cbb9ae"}, "localOverrides": [{"id": "ground-local", "region": "reference-visible local accents", "roughness": 1, "evidenceRefs": ["full-object"]}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Quiet warm field with soft contact shadow; no scene clutter.", "qualityTier": "reference"},
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
  node_root_0.name = "Living Sakura root rig__pivot";
  if (endpoint_root_0) {
    node_root_0.position.copy(endpoint_root_0.start);
    node_root_0.quaternion.copy(endpoint_root_0.quaternion);
    node_root_0.scale.set(1, 1, 1);
  } else {
    node_root_0.position.set(0.0, 0.0, 0.0);
    node_root_0.rotation.set(0.0, 0.0, 0.0);
    node_root_0.scale.set(1.0, 1.0, 1.0);
  }
  node_root_0.userData.sculptComponent = {"id": "root", "name": "Living Sakura root rig", "level": "macro", "role": "root", "importance": 1, "confidence": 0.9, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "A low-poly continuous volume establishes grounded organic mass without radial spikes.", "geometryDescriptor": {"topologyIntent": "faceted asymmetric root flare", "tubePath": null, "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": ["asymmetric buttress deformation"], "uvStrategy": "stable object-space procedural coordinates", "normalStrategy": "faceted normals with restrained planar variation"}, "parent": null, "attachment": null, "dimensions": {"width": 0.2, "height": 1, "depth": 0.2, "units": "world-relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "grounded-root-flare", "description": "Broad irregular buttress roots merge into the trunk and ground plane.", "placement": "lower center", "approximateSize": "object-relative", "orientation": "follows the local botanical frame", "materialEffect": "preserve observed local albedo and roughness variation", "geometryEffect": "asymmetric low-poly root flare", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.82, "microRoughness": 0.12, "bumpAmplitude": 0.035, "normalPattern": "longitudinal bark planes", "displacementPattern": "none", "occlusionPattern": "parent junction and contact AO", "edgeWearPattern": "subtle raised-plane value shift", "notes": "Silhouette remains geometry-led; surface effects stay restrained."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.9, "dominantAlbedo": "rgba(106, 81, 71, 1)", "secondaryAlbedo": "rgba(73, 58, 54, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1], "stops": [{"offset": 0, "color": "rgba(73, 58, 54, 1)"}, {"offset": 0.55, "color": "rgba(106, 81, 71, 1)"}, {"offset": 1, "color": "rgba(106, 81, 71, 1)"}]}}};
  node_root_0.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}};
  (nodes["root"] ?? root).add(node_root_0);
  nodes["root"] = node_root_0;
  const mesh_root_0Geometry = endpoint_root_0
    ? new THREE.CylinderGeometry(endpoint_root_0.endRadius, endpoint_root_0.baseRadius, endpoint_root_0.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 64, 40);
  const mesh_root_0 = new THREE.Mesh(
    mesh_root_0Geometry,
    materialMap["bark"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_root_0.name = "Living Sakura root rig";
  if (endpoint_root_0) {
    mesh_root_0.position.copy(endpoint_root_0.midpoint);
    mesh_root_0.quaternion.identity();
  }
  mesh_root_0.castShadow = options.castShadow ?? true;
  mesh_root_0.receiveShadow = options.receiveShadow ?? true;
  mesh_root_0.userData.sculptComponent = {"id": "root", "name": "Living Sakura root rig", "level": "macro", "role": "root", "importance": 1, "confidence": 0.9, "primitive": "ellipsoid", "topologyClass": "continuous-sculpt", "topologyRationale": "A low-poly continuous volume establishes grounded organic mass without radial spikes.", "geometryDescriptor": {"topologyIntent": "faceted asymmetric root flare", "tubePath": null, "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": ["asymmetric buttress deformation"], "uvStrategy": "stable object-space procedural coordinates", "normalStrategy": "faceted normals with restrained planar variation"}, "parent": null, "attachment": null, "dimensions": {"width": 0.2, "height": 1, "depth": 0.2, "units": "world-relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "grounded-root-flare", "description": "Broad irregular buttress roots merge into the trunk and ground plane.", "placement": "lower center", "approximateSize": "object-relative", "orientation": "follows the local botanical frame", "materialEffect": "preserve observed local albedo and roughness variation", "geometryEffect": "asymmetric low-poly root flare", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.82, "microRoughness": 0.12, "bumpAmplitude": 0.035, "normalPattern": "longitudinal bark planes", "displacementPattern": "none", "occlusionPattern": "parent junction and contact AO", "edgeWearPattern": "subtle raised-plane value shift", "notes": "Silhouette remains geometry-led; surface effects stay restrained."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.9, "dominantAlbedo": "rgba(106, 81, 71, 1)", "secondaryAlbedo": "rgba(73, 58, 54, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1], "stops": [{"offset": 0, "color": "rgba(73, 58, 54, 1)"}, {"offset": 0.55, "color": "rgba(106, 81, 71, 1)"}, {"offset": 1, "color": "rgba(106, 81, 71, 1)"}]}}};
  node_root_0.add(mesh_root_0);
  meshes["root"] = mesh_root_0;
  colliders["root"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."};
  destructionGroups["living-sakura"] ??= [];
  destructionGroups["living-sakura"].push(node_root_0);
  const socket_root_growth_surface_0 = new THREE.Object3D();
  socket_root_growth_surface_0.name = "growth-surface";
  socket_root_growth_surface_0.position.set(0.0, 1.0, 0.0);
  socket_root_growth_surface_0.rotation.set(0.0, 0.0, 0.0);
  socket_root_growth_surface_0.userData.socket = {"id": "growth-surface", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"};
  node_root_0.add(socket_root_growth_surface_0);
  sockets["root:growth-surface"] = socket_root_growth_surface_0;

  const attachment_trunk_lower_1 = {"parentId": "root", "parentSocket": "root:growth-surface", "localStart": [0, 0, 0], "localEnd": [0.28, 2.7, 0.04], "contactType": "overlap", "embedDepth": 0.1456, "overlap": 0.16640000000000002, "gapTolerance": 0.008, "baseRadius": 0.52, "endRadius": 0.32, "evidenceRefs": ["full-object"]};
  const endpoint_trunk_lower_1 = makeAttachmentEndpoint(attachment_trunk_lower_1);
  const node_trunk_lower_1 = new THREE.Group();
  node_trunk_lower_1.name = "Aged leaning lower trunk__pivot";
  if (endpoint_trunk_lower_1) {
    node_trunk_lower_1.position.copy(endpoint_trunk_lower_1.start);
    node_trunk_lower_1.quaternion.copy(endpoint_trunk_lower_1.quaternion);
    node_trunk_lower_1.scale.set(1, 1, 1);
  } else {
    node_trunk_lower_1.position.set(0.0, 0.0, 0.0);
    node_trunk_lower_1.rotation.set(0.0, 0.0, 0.0);
    node_trunk_lower_1.scale.set(1.0, 1.0, 1.0);
  }
  node_trunk_lower_1.userData.sculptComponent = {"id": "trunk-lower", "name": "Aged leaning lower trunk", "level": "macro", "role": "trunk", "importance": 1, "confidence": 0.9, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "A tapered curved tube preserves botanical continuity, parent-local attachment, and wind pivots.", "geometryDescriptor": {"topologyIntent": "faceted parent-local cubic tube with pipe-area taper", "tubePath": {"points": [[0, 0, 0], [0.28, 2.7, 0.04]], "radius": 0.52, "radialSegments": 7, "closed": false}, "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": ["deterministic bend", "subtle axial irregularity"], "uvStrategy": "stable object-space procedural coordinates", "normalStrategy": "faceted normals with restrained planar variation"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "root:growth-surface", "localStart": [0, 0, 0], "localEnd": [0.28, 2.7, 0.04], "contactType": "overlap", "embedDepth": 0.1456, "overlap": 0.16640000000000002, "gapTolerance": 0.008, "baseRadius": 0.52, "endRadius": 0.32, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 1.04, "height": 2.714774392099646, "depth": 1.04, "units": "world-relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "trunk", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [0.28, 2.7, 0.04], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "aged-trunk", "description": "The trunk leans four degrees and changes plane rather than rising as a central pole.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows the local botanical frame", "materialEffect": "preserve observed local albedo and roughness variation", "geometryEffect": "curved faceted taper", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.82, "microRoughness": 0.12, "bumpAmplitude": 0.035, "normalPattern": "longitudinal bark planes", "displacementPattern": "none", "occlusionPattern": "parent junction and contact AO", "edgeWearPattern": "subtle raised-plane value shift", "notes": "Silhouette remains geometry-led; surface effects stay restrained."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.9, "dominantAlbedo": "rgba(106, 81, 71, 1)", "secondaryAlbedo": "rgba(73, 58, 54, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1], "stops": [{"offset": 0, "color": "rgba(73, 58, 54, 1)"}, {"offset": 0.55, "color": "rgba(106, 81, 71, 1)"}, {"offset": 1, "color": "rgba(106, 81, 71, 1)"}]}}};
  node_trunk_lower_1.userData.actionProfile = {"animationRole": "trunk", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [0.28, 2.7, 0.04], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}};
  (nodes["root"] ?? root).add(node_trunk_lower_1);
  nodes["trunk-lower"] = node_trunk_lower_1;
  const mesh_trunk_lower_1Geometry = endpoint_trunk_lower_1
    ? new THREE.CylinderGeometry(endpoint_trunk_lower_1.endRadius, endpoint_trunk_lower_1.baseRadius, endpoint_trunk_lower_1.length, 32, 12)
    : buildTubeGeometry({"points": [[0, 0, 0], [0.28, 2.7, 0.04]], "radius": 0.52, "radialSegments": 7, "closed": false});
  const mesh_trunk_lower_1 = new THREE.Mesh(
    mesh_trunk_lower_1Geometry,
    materialMap["bark"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_trunk_lower_1.name = "Aged leaning lower trunk";
  if (endpoint_trunk_lower_1) {
    mesh_trunk_lower_1.position.copy(endpoint_trunk_lower_1.midpoint);
    mesh_trunk_lower_1.quaternion.identity();
  }
  mesh_trunk_lower_1.castShadow = options.castShadow ?? true;
  mesh_trunk_lower_1.receiveShadow = options.receiveShadow ?? true;
  mesh_trunk_lower_1.userData.sculptComponent = {"id": "trunk-lower", "name": "Aged leaning lower trunk", "level": "macro", "role": "trunk", "importance": 1, "confidence": 0.9, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "A tapered curved tube preserves botanical continuity, parent-local attachment, and wind pivots.", "geometryDescriptor": {"topologyIntent": "faceted parent-local cubic tube with pipe-area taper", "tubePath": {"points": [[0, 0, 0], [0.28, 2.7, 0.04]], "radius": 0.52, "radialSegments": 7, "closed": false}, "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": ["deterministic bend", "subtle axial irregularity"], "uvStrategy": "stable object-space procedural coordinates", "normalStrategy": "faceted normals with restrained planar variation"}, "parent": "root", "attachment": {"parentId": "root", "parentSocket": "root:growth-surface", "localStart": [0, 0, 0], "localEnd": [0.28, 2.7, 0.04], "contactType": "overlap", "embedDepth": 0.1456, "overlap": 0.16640000000000002, "gapTolerance": 0.008, "baseRadius": 0.52, "endRadius": 0.32, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 1.04, "height": 2.714774392099646, "depth": 1.04, "units": "world-relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "trunk", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [0.28, 2.7, 0.04], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "aged-trunk", "description": "The trunk leans four degrees and changes plane rather than rising as a central pole.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows the local botanical frame", "materialEffect": "preserve observed local albedo and roughness variation", "geometryEffect": "curved faceted taper", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.82, "microRoughness": 0.12, "bumpAmplitude": 0.035, "normalPattern": "longitudinal bark planes", "displacementPattern": "none", "occlusionPattern": "parent junction and contact AO", "edgeWearPattern": "subtle raised-plane value shift", "notes": "Silhouette remains geometry-led; surface effects stay restrained."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.9, "dominantAlbedo": "rgba(106, 81, 71, 1)", "secondaryAlbedo": "rgba(73, 58, 54, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1], "stops": [{"offset": 0, "color": "rgba(73, 58, 54, 1)"}, {"offset": 0.55, "color": "rgba(106, 81, 71, 1)"}, {"offset": 1, "color": "rgba(106, 81, 71, 1)"}]}}};
  node_trunk_lower_1.add(mesh_trunk_lower_1);
  meshes["trunk-lower"] = mesh_trunk_lower_1;
  colliders["trunk-lower"] = {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."};
  destructionGroups["living-sakura"] ??= [];
  destructionGroups["living-sakura"].push(node_trunk_lower_1);
  const socket_trunk_lower_growth_surface_0 = new THREE.Object3D();
  socket_trunk_lower_growth_surface_0.name = "growth-surface";
  socket_trunk_lower_growth_surface_0.position.set(0.28, 2.7, 0.04);
  socket_trunk_lower_growth_surface_0.rotation.set(0.0, 0.0, 0.0);
  socket_trunk_lower_growth_surface_0.userData.socket = {"id": "growth-surface", "localPosition": [0.28, 2.7, 0.04], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"};
  node_trunk_lower_1.add(socket_trunk_lower_growth_surface_0);
  sockets["trunk-lower:growth-surface"] = socket_trunk_lower_growth_surface_0;

  const attachment_leader_dominant_2 = {"parentId": "trunk-lower", "parentSocket": "trunk-lower:growth-surface", "localStart": [0, 0, 0], "localEnd": [1.25, 3.7, -0.22], "contactType": "overlap", "embedDepth": 0.0868, "overlap": 0.0992, "gapTolerance": 0.008, "baseRadius": 0.31, "endRadius": 0.105, "evidenceRefs": ["full-object"]};
  const endpoint_leader_dominant_2 = makeAttachmentEndpoint(attachment_leader_dominant_2);
  const node_leader_dominant_2 = new THREE.Group();
  node_leader_dominant_2.name = "Dominant right leader__pivot";
  if (endpoint_leader_dominant_2) {
    node_leader_dominant_2.position.copy(endpoint_leader_dominant_2.start);
    node_leader_dominant_2.quaternion.copy(endpoint_leader_dominant_2.quaternion);
    node_leader_dominant_2.scale.set(1, 1, 1);
  } else {
    node_leader_dominant_2.position.set(0.0, 0.0, 0.0);
    node_leader_dominant_2.rotation.set(0.0, 0.0, 0.0);
    node_leader_dominant_2.scale.set(1.0, 1.0, 1.0);
  }
  node_leader_dominant_2.userData.sculptComponent = {"id": "leader-dominant", "name": "Dominant right leader", "level": "macro", "role": "leader", "importance": 0.98, "confidence": 0.9, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "A tapered curved tube preserves botanical continuity, parent-local attachment, and wind pivots.", "geometryDescriptor": {"topologyIntent": "faceted parent-local cubic tube with pipe-area taper", "tubePath": {"points": [[0, 0, 0], [1.25, 3.7, -0.22]], "radius": 0.31, "radialSegments": 7, "closed": false}, "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": ["deterministic bend", "subtle axial irregularity"], "uvStrategy": "stable object-space procedural coordinates", "normalStrategy": "faceted normals with restrained planar variation"}, "parent": "trunk-lower", "attachment": {"parentId": "trunk-lower", "parentSocket": "trunk-lower:growth-surface", "localStart": [0, 0, 0], "localEnd": [1.25, 3.7, -0.22], "contactType": "overlap", "embedDepth": 0.0868, "overlap": 0.0992, "gapTolerance": 0.008, "baseRadius": 0.31, "endRadius": 0.105, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.62, "height": 3.9116364861781316, "depth": 0.62, "units": "world-relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "leader", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [1.25, 3.7, -0.22], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "unequal-leaders", "description": "The dominant leader carries more crown mass and rises higher than its counter leader.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows the local botanical frame", "materialEffect": "preserve observed local albedo and roughness variation", "geometryEffect": "unequal bifurcation", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.82, "microRoughness": 0.12, "bumpAmplitude": 0.035, "normalPattern": "longitudinal bark planes", "displacementPattern": "none", "occlusionPattern": "parent junction and contact AO", "edgeWearPattern": "subtle raised-plane value shift", "notes": "Silhouette remains geometry-led; surface effects stay restrained."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.9, "dominantAlbedo": "rgba(106, 81, 71, 1)", "secondaryAlbedo": "rgba(73, 58, 54, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1], "stops": [{"offset": 0, "color": "rgba(73, 58, 54, 1)"}, {"offset": 0.55, "color": "rgba(106, 81, 71, 1)"}, {"offset": 1, "color": "rgba(106, 81, 71, 1)"}]}}};
  node_leader_dominant_2.userData.actionProfile = {"animationRole": "leader", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [1.25, 3.7, -0.22], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}};
  (nodes["trunk-lower"] ?? root).add(node_leader_dominant_2);
  nodes["leader-dominant"] = node_leader_dominant_2;
  const mesh_leader_dominant_2Geometry = endpoint_leader_dominant_2
    ? new THREE.CylinderGeometry(endpoint_leader_dominant_2.endRadius, endpoint_leader_dominant_2.baseRadius, endpoint_leader_dominant_2.length, 32, 12)
    : buildTubeGeometry({"points": [[0, 0, 0], [1.25, 3.7, -0.22]], "radius": 0.31, "radialSegments": 7, "closed": false});
  const mesh_leader_dominant_2 = new THREE.Mesh(
    mesh_leader_dominant_2Geometry,
    materialMap["bark"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_leader_dominant_2.name = "Dominant right leader";
  if (endpoint_leader_dominant_2) {
    mesh_leader_dominant_2.position.copy(endpoint_leader_dominant_2.midpoint);
    mesh_leader_dominant_2.quaternion.identity();
  }
  mesh_leader_dominant_2.castShadow = options.castShadow ?? true;
  mesh_leader_dominant_2.receiveShadow = options.receiveShadow ?? true;
  mesh_leader_dominant_2.userData.sculptComponent = {"id": "leader-dominant", "name": "Dominant right leader", "level": "macro", "role": "leader", "importance": 0.98, "confidence": 0.9, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "A tapered curved tube preserves botanical continuity, parent-local attachment, and wind pivots.", "geometryDescriptor": {"topologyIntent": "faceted parent-local cubic tube with pipe-area taper", "tubePath": {"points": [[0, 0, 0], [1.25, 3.7, -0.22]], "radius": 0.31, "radialSegments": 7, "closed": false}, "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": ["deterministic bend", "subtle axial irregularity"], "uvStrategy": "stable object-space procedural coordinates", "normalStrategy": "faceted normals with restrained planar variation"}, "parent": "trunk-lower", "attachment": {"parentId": "trunk-lower", "parentSocket": "trunk-lower:growth-surface", "localStart": [0, 0, 0], "localEnd": [1.25, 3.7, -0.22], "contactType": "overlap", "embedDepth": 0.0868, "overlap": 0.0992, "gapTolerance": 0.008, "baseRadius": 0.31, "endRadius": 0.105, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.62, "height": 3.9116364861781316, "depth": 0.62, "units": "world-relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "leader", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [1.25, 3.7, -0.22], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "unequal-leaders", "description": "The dominant leader carries more crown mass and rises higher than its counter leader.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows the local botanical frame", "materialEffect": "preserve observed local albedo and roughness variation", "geometryEffect": "unequal bifurcation", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.82, "microRoughness": 0.12, "bumpAmplitude": 0.035, "normalPattern": "longitudinal bark planes", "displacementPattern": "none", "occlusionPattern": "parent junction and contact AO", "edgeWearPattern": "subtle raised-plane value shift", "notes": "Silhouette remains geometry-led; surface effects stay restrained."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.9, "dominantAlbedo": "rgba(106, 81, 71, 1)", "secondaryAlbedo": "rgba(73, 58, 54, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1], "stops": [{"offset": 0, "color": "rgba(73, 58, 54, 1)"}, {"offset": 0.55, "color": "rgba(106, 81, 71, 1)"}, {"offset": 1, "color": "rgba(106, 81, 71, 1)"}]}}};
  node_leader_dominant_2.add(mesh_leader_dominant_2);
  meshes["leader-dominant"] = mesh_leader_dominant_2;
  colliders["leader-dominant"] = {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."};
  destructionGroups["living-sakura"] ??= [];
  destructionGroups["living-sakura"].push(node_leader_dominant_2);
  const socket_leader_dominant_growth_surface_0 = new THREE.Object3D();
  socket_leader_dominant_growth_surface_0.name = "growth-surface";
  socket_leader_dominant_growth_surface_0.position.set(1.25, 3.7, -0.22);
  socket_leader_dominant_growth_surface_0.rotation.set(0.0, 0.0, 0.0);
  socket_leader_dominant_growth_surface_0.userData.socket = {"id": "growth-surface", "localPosition": [1.25, 3.7, -0.22], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"};
  node_leader_dominant_2.add(socket_leader_dominant_growth_surface_0);
  sockets["leader-dominant:growth-surface"] = socket_leader_dominant_growth_surface_0;

  const attachment_leader_subordinate_3 = {"parentId": "trunk-lower", "parentSocket": "trunk-lower:growth-surface", "localStart": [0, 0, 0], "localEnd": [-0.95, 2.95, 0.3], "contactType": "overlap", "embedDepth": 0.07, "overlap": 0.08, "gapTolerance": 0.008, "baseRadius": 0.25, "endRadius": 0.085, "evidenceRefs": ["full-object"]};
  const endpoint_leader_subordinate_3 = makeAttachmentEndpoint(attachment_leader_subordinate_3);
  const node_leader_subordinate_3 = new THREE.Group();
  node_leader_subordinate_3.name = "Subordinate left leader__pivot";
  if (endpoint_leader_subordinate_3) {
    node_leader_subordinate_3.position.copy(endpoint_leader_subordinate_3.start);
    node_leader_subordinate_3.quaternion.copy(endpoint_leader_subordinate_3.quaternion);
    node_leader_subordinate_3.scale.set(1, 1, 1);
  } else {
    node_leader_subordinate_3.position.set(0.0, 0.0, 0.0);
    node_leader_subordinate_3.rotation.set(0.0, 0.0, 0.0);
    node_leader_subordinate_3.scale.set(1.0, 1.0, 1.0);
  }
  node_leader_subordinate_3.userData.sculptComponent = {"id": "leader-subordinate", "name": "Subordinate left leader", "level": "macro", "role": "leader", "importance": 0.94, "confidence": 0.9, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "A tapered curved tube preserves botanical continuity, parent-local attachment, and wind pivots.", "geometryDescriptor": {"topologyIntent": "faceted parent-local cubic tube with pipe-area taper", "tubePath": {"points": [[0, 0, 0], [-0.95, 2.95, 0.3]], "radius": 0.25, "radialSegments": 7, "closed": false}, "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": ["deterministic bend", "subtle axial irregularity"], "uvStrategy": "stable object-space procedural coordinates", "normalStrategy": "faceted normals with restrained planar variation"}, "parent": "trunk-lower", "attachment": {"parentId": "trunk-lower", "parentSocket": "trunk-lower:growth-surface", "localStart": [0, 0, 0], "localEnd": [-0.95, 2.95, 0.3], "contactType": "overlap", "embedDepth": 0.07, "overlap": 0.08, "gapTolerance": 0.008, "baseRadius": 0.25, "endRadius": 0.085, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.5, "height": 3.113679495388053, "depth": 0.5, "units": "world-relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "leader", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [-0.95, 2.95, 0.3], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "unequal-leaders", "description": "The shorter leader opens the central fork window.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows the local botanical frame", "materialEffect": "preserve observed local albedo and roughness variation", "geometryEffect": "unequal bifurcation", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.82, "microRoughness": 0.12, "bumpAmplitude": 0.035, "normalPattern": "longitudinal bark planes", "displacementPattern": "none", "occlusionPattern": "parent junction and contact AO", "edgeWearPattern": "subtle raised-plane value shift", "notes": "Silhouette remains geometry-led; surface effects stay restrained."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.9, "dominantAlbedo": "rgba(106, 81, 71, 1)", "secondaryAlbedo": "rgba(73, 58, 54, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1], "stops": [{"offset": 0, "color": "rgba(73, 58, 54, 1)"}, {"offset": 0.55, "color": "rgba(106, 81, 71, 1)"}, {"offset": 1, "color": "rgba(106, 81, 71, 1)"}]}}};
  node_leader_subordinate_3.userData.actionProfile = {"animationRole": "leader", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [-0.95, 2.95, 0.3], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}};
  (nodes["trunk-lower"] ?? root).add(node_leader_subordinate_3);
  nodes["leader-subordinate"] = node_leader_subordinate_3;
  const mesh_leader_subordinate_3Geometry = endpoint_leader_subordinate_3
    ? new THREE.CylinderGeometry(endpoint_leader_subordinate_3.endRadius, endpoint_leader_subordinate_3.baseRadius, endpoint_leader_subordinate_3.length, 32, 12)
    : buildTubeGeometry({"points": [[0, 0, 0], [-0.95, 2.95, 0.3]], "radius": 0.25, "radialSegments": 7, "closed": false});
  const mesh_leader_subordinate_3 = new THREE.Mesh(
    mesh_leader_subordinate_3Geometry,
    materialMap["bark"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_leader_subordinate_3.name = "Subordinate left leader";
  if (endpoint_leader_subordinate_3) {
    mesh_leader_subordinate_3.position.copy(endpoint_leader_subordinate_3.midpoint);
    mesh_leader_subordinate_3.quaternion.identity();
  }
  mesh_leader_subordinate_3.castShadow = options.castShadow ?? true;
  mesh_leader_subordinate_3.receiveShadow = options.receiveShadow ?? true;
  mesh_leader_subordinate_3.userData.sculptComponent = {"id": "leader-subordinate", "name": "Subordinate left leader", "level": "macro", "role": "leader", "importance": 0.94, "confidence": 0.9, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "A tapered curved tube preserves botanical continuity, parent-local attachment, and wind pivots.", "geometryDescriptor": {"topologyIntent": "faceted parent-local cubic tube with pipe-area taper", "tubePath": {"points": [[0, 0, 0], [-0.95, 2.95, 0.3]], "radius": 0.25, "radialSegments": 7, "closed": false}, "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": ["deterministic bend", "subtle axial irregularity"], "uvStrategy": "stable object-space procedural coordinates", "normalStrategy": "faceted normals with restrained planar variation"}, "parent": "trunk-lower", "attachment": {"parentId": "trunk-lower", "parentSocket": "trunk-lower:growth-surface", "localStart": [0, 0, 0], "localEnd": [-0.95, 2.95, 0.3], "contactType": "overlap", "embedDepth": 0.07, "overlap": 0.08, "gapTolerance": 0.008, "baseRadius": 0.25, "endRadius": 0.085, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.5, "height": 3.113679495388053, "depth": 0.5, "units": "world-relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "leader", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [-0.95, 2.95, 0.3], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "unequal-leaders", "description": "The shorter leader opens the central fork window.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows the local botanical frame", "materialEffect": "preserve observed local albedo and roughness variation", "geometryEffect": "unequal bifurcation", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.82, "microRoughness": 0.12, "bumpAmplitude": 0.035, "normalPattern": "longitudinal bark planes", "displacementPattern": "none", "occlusionPattern": "parent junction and contact AO", "edgeWearPattern": "subtle raised-plane value shift", "notes": "Silhouette remains geometry-led; surface effects stay restrained."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.9, "dominantAlbedo": "rgba(106, 81, 71, 1)", "secondaryAlbedo": "rgba(73, 58, 54, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1], "stops": [{"offset": 0, "color": "rgba(73, 58, 54, 1)"}, {"offset": 0.55, "color": "rgba(106, 81, 71, 1)"}, {"offset": 1, "color": "rgba(106, 81, 71, 1)"}]}}};
  node_leader_subordinate_3.add(mesh_leader_subordinate_3);
  meshes["leader-subordinate"] = mesh_leader_subordinate_3;
  colliders["leader-subordinate"] = {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."};
  destructionGroups["living-sakura"] ??= [];
  destructionGroups["living-sakura"].push(node_leader_subordinate_3);
  const socket_leader_subordinate_growth_surface_0 = new THREE.Object3D();
  socket_leader_subordinate_growth_surface_0.name = "growth-surface";
  socket_leader_subordinate_growth_surface_0.position.set(-0.95, 2.95, 0.3);
  socket_leader_subordinate_growth_surface_0.rotation.set(0.0, 0.0, 0.0);
  socket_leader_subordinate_growth_surface_0.userData.socket = {"id": "growth-surface", "localPosition": [-0.95, 2.95, 0.3], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"};
  node_leader_subordinate_3.add(socket_leader_subordinate_growth_surface_0);
  sockets["leader-subordinate:growth-surface"] = socket_leader_subordinate_growth_surface_0;

  const attachment_primary_sweep_4 = {"parentId": "trunk-lower", "parentSocket": "trunk-lower:growth-surface", "localStart": [0, 0, 0], "localEnd": [-4.6, 1.45, 0.32], "contactType": "overlap", "embedDepth": 0.08120000000000001, "overlap": 0.0928, "gapTolerance": 0.008, "baseRadius": 0.29, "endRadius": 0.055, "evidenceRefs": ["full-object"]};
  const endpoint_primary_sweep_4 = makeAttachmentEndpoint(attachment_primary_sweep_4);
  const node_primary_sweep_4 = new THREE.Group();
  node_primary_sweep_4.name = "Signature low sweeping bough__pivot";
  if (endpoint_primary_sweep_4) {
    node_primary_sweep_4.position.copy(endpoint_primary_sweep_4.start);
    node_primary_sweep_4.quaternion.copy(endpoint_primary_sweep_4.quaternion);
    node_primary_sweep_4.scale.set(1, 1, 1);
  } else {
    node_primary_sweep_4.position.set(0.0, 0.0, 0.0);
    node_primary_sweep_4.rotation.set(0.0, 0.0, 0.0);
    node_primary_sweep_4.scale.set(1.0, 1.0, 1.0);
  }
  node_primary_sweep_4.userData.sculptComponent = {"id": "primary-sweep", "name": "Signature low sweeping bough", "level": "macro", "role": "branch", "importance": 1, "confidence": 0.9, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "A tapered curved tube preserves botanical continuity, parent-local attachment, and wind pivots.", "geometryDescriptor": {"topologyIntent": "faceted parent-local cubic tube with pipe-area taper", "tubePath": {"points": [[0, 0, 0], [-4.6, 1.45, 0.32]], "radius": 0.29, "radialSegments": 7, "closed": false}, "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": ["deterministic bend", "subtle axial irregularity"], "uvStrategy": "stable object-space procedural coordinates", "normalStrategy": "faceted normals with restrained planar variation"}, "parent": "trunk-lower", "attachment": {"parentId": "trunk-lower", "parentSocket": "trunk-lower:growth-surface", "localStart": [0, 0, 0], "localEnd": [-4.6, 1.45, 0.32], "contactType": "overlap", "embedDepth": 0.08120000000000001, "overlap": 0.0928, "gapTolerance": 0.008, "baseRadius": 0.29, "endRadius": 0.055, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.58, "height": 4.833725271465063, "depth": 0.58, "units": "world-relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [-4.6, 1.45, 0.32], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "signature-low-bough", "description": "A long low bough sweeps left, lifts gently, then terminates with a slight descent.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows the local botanical frame", "materialEffect": "preserve observed local albedo and roughness variation", "geometryEffect": "identity-defining asymmetric arc", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.82, "microRoughness": 0.12, "bumpAmplitude": 0.035, "normalPattern": "longitudinal bark planes", "displacementPattern": "none", "occlusionPattern": "parent junction and contact AO", "edgeWearPattern": "subtle raised-plane value shift", "notes": "Silhouette remains geometry-led; surface effects stay restrained."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.9, "dominantAlbedo": "rgba(106, 81, 71, 1)", "secondaryAlbedo": "rgba(73, 58, 54, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1], "stops": [{"offset": 0, "color": "rgba(73, 58, 54, 1)"}, {"offset": 0.55, "color": "rgba(106, 81, 71, 1)"}, {"offset": 1, "color": "rgba(106, 81, 71, 1)"}]}}};
  node_primary_sweep_4.userData.actionProfile = {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [-4.6, 1.45, 0.32], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}};
  (nodes["trunk-lower"] ?? root).add(node_primary_sweep_4);
  nodes["primary-sweep"] = node_primary_sweep_4;
  const mesh_primary_sweep_4Geometry = endpoint_primary_sweep_4
    ? new THREE.CylinderGeometry(endpoint_primary_sweep_4.endRadius, endpoint_primary_sweep_4.baseRadius, endpoint_primary_sweep_4.length, 32, 12)
    : buildTubeGeometry({"points": [[0, 0, 0], [-4.6, 1.45, 0.32]], "radius": 0.29, "radialSegments": 7, "closed": false});
  const mesh_primary_sweep_4 = new THREE.Mesh(
    mesh_primary_sweep_4Geometry,
    materialMap["bark"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_primary_sweep_4.name = "Signature low sweeping bough";
  if (endpoint_primary_sweep_4) {
    mesh_primary_sweep_4.position.copy(endpoint_primary_sweep_4.midpoint);
    mesh_primary_sweep_4.quaternion.identity();
  }
  mesh_primary_sweep_4.castShadow = options.castShadow ?? true;
  mesh_primary_sweep_4.receiveShadow = options.receiveShadow ?? true;
  mesh_primary_sweep_4.userData.sculptComponent = {"id": "primary-sweep", "name": "Signature low sweeping bough", "level": "macro", "role": "branch", "importance": 1, "confidence": 0.9, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "A tapered curved tube preserves botanical continuity, parent-local attachment, and wind pivots.", "geometryDescriptor": {"topologyIntent": "faceted parent-local cubic tube with pipe-area taper", "tubePath": {"points": [[0, 0, 0], [-4.6, 1.45, 0.32]], "radius": 0.29, "radialSegments": 7, "closed": false}, "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": ["deterministic bend", "subtle axial irregularity"], "uvStrategy": "stable object-space procedural coordinates", "normalStrategy": "faceted normals with restrained planar variation"}, "parent": "trunk-lower", "attachment": {"parentId": "trunk-lower", "parentSocket": "trunk-lower:growth-surface", "localStart": [0, 0, 0], "localEnd": [-4.6, 1.45, 0.32], "contactType": "overlap", "embedDepth": 0.08120000000000001, "overlap": 0.0928, "gapTolerance": 0.008, "baseRadius": 0.29, "endRadius": 0.055, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.58, "height": 4.833725271465063, "depth": 0.58, "units": "world-relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [-4.6, 1.45, 0.32], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "signature-low-bough", "description": "A long low bough sweeps left, lifts gently, then terminates with a slight descent.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows the local botanical frame", "materialEffect": "preserve observed local albedo and roughness variation", "geometryEffect": "identity-defining asymmetric arc", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.82, "microRoughness": 0.12, "bumpAmplitude": 0.035, "normalPattern": "longitudinal bark planes", "displacementPattern": "none", "occlusionPattern": "parent junction and contact AO", "edgeWearPattern": "subtle raised-plane value shift", "notes": "Silhouette remains geometry-led; surface effects stay restrained."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.9, "dominantAlbedo": "rgba(106, 81, 71, 1)", "secondaryAlbedo": "rgba(73, 58, 54, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1], "stops": [{"offset": 0, "color": "rgba(73, 58, 54, 1)"}, {"offset": 0.55, "color": "rgba(106, 81, 71, 1)"}, {"offset": 1, "color": "rgba(106, 81, 71, 1)"}]}}};
  node_primary_sweep_4.add(mesh_primary_sweep_4);
  meshes["primary-sweep"] = mesh_primary_sweep_4;
  colliders["primary-sweep"] = {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."};
  destructionGroups["living-sakura"] ??= [];
  destructionGroups["living-sakura"].push(node_primary_sweep_4);
  const socket_primary_sweep_growth_surface_0 = new THREE.Object3D();
  socket_primary_sweep_growth_surface_0.name = "growth-surface";
  socket_primary_sweep_growth_surface_0.position.set(-4.6, 1.45, 0.32);
  socket_primary_sweep_growth_surface_0.rotation.set(0.0, 0.0, 0.0);
  socket_primary_sweep_growth_surface_0.userData.socket = {"id": "growth-surface", "localPosition": [-4.6, 1.45, 0.32], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"};
  node_primary_sweep_4.add(socket_primary_sweep_growth_surface_0);
  sockets["primary-sweep:growth-surface"] = socket_primary_sweep_growth_surface_0;

  const attachment_primary_left_high_5 = {"parentId": "leader-subordinate", "parentSocket": "leader-subordinate:growth-surface", "localStart": [0, 0, 0], "localEnd": [-2.65, 1.65, -0.42], "contactType": "overlap", "embedDepth": 0.05600000000000001, "overlap": 0.064, "gapTolerance": 0.008, "baseRadius": 0.2, "endRadius": 0.05, "evidenceRefs": ["full-object"]};
  const endpoint_primary_left_high_5 = makeAttachmentEndpoint(attachment_primary_left_high_5);
  const node_primary_left_high_5 = new THREE.Group();
  node_primary_left_high_5.name = "Primary Left High__pivot";
  if (endpoint_primary_left_high_5) {
    node_primary_left_high_5.position.copy(endpoint_primary_left_high_5.start);
    node_primary_left_high_5.quaternion.copy(endpoint_primary_left_high_5.quaternion);
    node_primary_left_high_5.scale.set(1, 1, 1);
  } else {
    node_primary_left_high_5.position.set(0.0, 0.0, 0.0);
    node_primary_left_high_5.rotation.set(0.0, 0.0, 0.0);
    node_primary_left_high_5.scale.set(1.0, 1.0, 1.0);
  }
  node_primary_left_high_5.userData.sculptComponent = {"id": "primary-left-high", "name": "Primary Left High", "level": "macro", "role": "branch", "importance": 0.91, "confidence": 0.9, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "A tapered curved tube preserves botanical continuity, parent-local attachment, and wind pivots.", "geometryDescriptor": {"topologyIntent": "faceted parent-local cubic tube with pipe-area taper", "tubePath": {"points": [[0, 0, 0], [-2.65, 1.65, -0.42]], "radius": 0.2, "radialSegments": 7, "closed": false}, "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": ["deterministic bend", "subtle axial irregularity"], "uvStrategy": "stable object-space procedural coordinates", "normalStrategy": "faceted normals with restrained planar variation"}, "parent": "leader-subordinate", "attachment": {"parentId": "leader-subordinate", "parentSocket": "leader-subordinate:growth-surface", "localStart": [0, 0, 0], "localEnd": [-2.65, 1.65, -0.42], "contactType": "overlap", "embedDepth": 0.05600000000000001, "overlap": 0.064, "gapTolerance": 0.008, "baseRadius": 0.2, "endRadius": 0.05, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.4, "height": 3.149825391986038, "depth": 0.4, "units": "world-relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [-2.65, 1.65, -0.42], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "primary-bough", "description": "One of six unequal crown-defining boughs.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows the local botanical frame", "materialEffect": "preserve observed local albedo and roughness variation", "geometryEffect": "curved tapered scaffold", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.82, "microRoughness": 0.12, "bumpAmplitude": 0.035, "normalPattern": "longitudinal bark planes", "displacementPattern": "none", "occlusionPattern": "parent junction and contact AO", "edgeWearPattern": "subtle raised-plane value shift", "notes": "Silhouette remains geometry-led; surface effects stay restrained."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.9, "dominantAlbedo": "rgba(106, 81, 71, 1)", "secondaryAlbedo": "rgba(73, 58, 54, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1], "stops": [{"offset": 0, "color": "rgba(73, 58, 54, 1)"}, {"offset": 0.55, "color": "rgba(106, 81, 71, 1)"}, {"offset": 1, "color": "rgba(106, 81, 71, 1)"}]}}};
  node_primary_left_high_5.userData.actionProfile = {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [-2.65, 1.65, -0.42], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}};
  (nodes["leader-subordinate"] ?? root).add(node_primary_left_high_5);
  nodes["primary-left-high"] = node_primary_left_high_5;
  const mesh_primary_left_high_5Geometry = endpoint_primary_left_high_5
    ? new THREE.CylinderGeometry(endpoint_primary_left_high_5.endRadius, endpoint_primary_left_high_5.baseRadius, endpoint_primary_left_high_5.length, 32, 12)
    : buildTubeGeometry({"points": [[0, 0, 0], [-2.65, 1.65, -0.42]], "radius": 0.2, "radialSegments": 7, "closed": false});
  const mesh_primary_left_high_5 = new THREE.Mesh(
    mesh_primary_left_high_5Geometry,
    materialMap["bark"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_primary_left_high_5.name = "Primary Left High";
  if (endpoint_primary_left_high_5) {
    mesh_primary_left_high_5.position.copy(endpoint_primary_left_high_5.midpoint);
    mesh_primary_left_high_5.quaternion.identity();
  }
  mesh_primary_left_high_5.castShadow = options.castShadow ?? true;
  mesh_primary_left_high_5.receiveShadow = options.receiveShadow ?? true;
  mesh_primary_left_high_5.userData.sculptComponent = {"id": "primary-left-high", "name": "Primary Left High", "level": "macro", "role": "branch", "importance": 0.91, "confidence": 0.9, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "A tapered curved tube preserves botanical continuity, parent-local attachment, and wind pivots.", "geometryDescriptor": {"topologyIntent": "faceted parent-local cubic tube with pipe-area taper", "tubePath": {"points": [[0, 0, 0], [-2.65, 1.65, -0.42]], "radius": 0.2, "radialSegments": 7, "closed": false}, "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": ["deterministic bend", "subtle axial irregularity"], "uvStrategy": "stable object-space procedural coordinates", "normalStrategy": "faceted normals with restrained planar variation"}, "parent": "leader-subordinate", "attachment": {"parentId": "leader-subordinate", "parentSocket": "leader-subordinate:growth-surface", "localStart": [0, 0, 0], "localEnd": [-2.65, 1.65, -0.42], "contactType": "overlap", "embedDepth": 0.05600000000000001, "overlap": 0.064, "gapTolerance": 0.008, "baseRadius": 0.2, "endRadius": 0.05, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.4, "height": 3.149825391986038, "depth": 0.4, "units": "world-relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [-2.65, 1.65, -0.42], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "primary-bough", "description": "One of six unequal crown-defining boughs.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows the local botanical frame", "materialEffect": "preserve observed local albedo and roughness variation", "geometryEffect": "curved tapered scaffold", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.82, "microRoughness": 0.12, "bumpAmplitude": 0.035, "normalPattern": "longitudinal bark planes", "displacementPattern": "none", "occlusionPattern": "parent junction and contact AO", "edgeWearPattern": "subtle raised-plane value shift", "notes": "Silhouette remains geometry-led; surface effects stay restrained."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.9, "dominantAlbedo": "rgba(106, 81, 71, 1)", "secondaryAlbedo": "rgba(73, 58, 54, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1], "stops": [{"offset": 0, "color": "rgba(73, 58, 54, 1)"}, {"offset": 0.55, "color": "rgba(106, 81, 71, 1)"}, {"offset": 1, "color": "rgba(106, 81, 71, 1)"}]}}};
  node_primary_left_high_5.add(mesh_primary_left_high_5);
  meshes["primary-left-high"] = mesh_primary_left_high_5;
  colliders["primary-left-high"] = {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."};
  destructionGroups["living-sakura"] ??= [];
  destructionGroups["living-sakura"].push(node_primary_left_high_5);
  const socket_primary_left_high_growth_surface_0 = new THREE.Object3D();
  socket_primary_left_high_growth_surface_0.name = "growth-surface";
  socket_primary_left_high_growth_surface_0.position.set(-2.65, 1.65, -0.42);
  socket_primary_left_high_growth_surface_0.rotation.set(0.0, 0.0, 0.0);
  socket_primary_left_high_growth_surface_0.userData.socket = {"id": "growth-surface", "localPosition": [-2.65, 1.65, -0.42], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"};
  node_primary_left_high_5.add(socket_primary_left_high_growth_surface_0);
  sockets["primary-left-high:growth-surface"] = socket_primary_left_high_growth_surface_0;

  const attachment_primary_left_back_6 = {"parentId": "leader-subordinate", "parentSocket": "leader-subordinate:growth-surface", "localStart": [0, 0, 0], "localEnd": [-1.85, 2.2, -1.05], "contactType": "overlap", "embedDepth": 0.052640000000000006, "overlap": 0.06016, "gapTolerance": 0.008, "baseRadius": 0.188, "endRadius": 0.05, "evidenceRefs": ["full-object"]};
  const endpoint_primary_left_back_6 = makeAttachmentEndpoint(attachment_primary_left_back_6);
  const node_primary_left_back_6 = new THREE.Group();
  node_primary_left_back_6.name = "Primary Left Back__pivot";
  if (endpoint_primary_left_back_6) {
    node_primary_left_back_6.position.copy(endpoint_primary_left_back_6.start);
    node_primary_left_back_6.quaternion.copy(endpoint_primary_left_back_6.quaternion);
    node_primary_left_back_6.scale.set(1, 1, 1);
  } else {
    node_primary_left_back_6.position.set(0.0, 0.0, 0.0);
    node_primary_left_back_6.rotation.set(0.0, 0.0, 0.0);
    node_primary_left_back_6.scale.set(1.0, 1.0, 1.0);
  }
  node_primary_left_back_6.userData.sculptComponent = {"id": "primary-left-back", "name": "Primary Left Back", "level": "macro", "role": "branch", "importance": 0.91, "confidence": 0.9, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "A tapered curved tube preserves botanical continuity, parent-local attachment, and wind pivots.", "geometryDescriptor": {"topologyIntent": "faceted parent-local cubic tube with pipe-area taper", "tubePath": {"points": [[0, 0, 0], [-1.85, 2.2, -1.05]], "radius": 0.188, "radialSegments": 7, "closed": false}, "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": ["deterministic bend", "subtle axial irregularity"], "uvStrategy": "stable object-space procedural coordinates", "normalStrategy": "faceted normals with restrained planar variation"}, "parent": "leader-subordinate", "attachment": {"parentId": "leader-subordinate", "parentSocket": "leader-subordinate:growth-surface", "localStart": [0, 0, 0], "localEnd": [-1.85, 2.2, -1.05], "contactType": "overlap", "embedDepth": 0.052640000000000006, "overlap": 0.06016, "gapTolerance": 0.008, "baseRadius": 0.188, "endRadius": 0.05, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.376, "height": 3.0602287496198715, "depth": 0.376, "units": "world-relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [-1.85, 2.2, -1.05], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "primary-bough", "description": "One of six unequal crown-defining boughs.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows the local botanical frame", "materialEffect": "preserve observed local albedo and roughness variation", "geometryEffect": "curved tapered scaffold", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.82, "microRoughness": 0.12, "bumpAmplitude": 0.035, "normalPattern": "longitudinal bark planes", "displacementPattern": "none", "occlusionPattern": "parent junction and contact AO", "edgeWearPattern": "subtle raised-plane value shift", "notes": "Silhouette remains geometry-led; surface effects stay restrained."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.9, "dominantAlbedo": "rgba(106, 81, 71, 1)", "secondaryAlbedo": "rgba(73, 58, 54, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1], "stops": [{"offset": 0, "color": "rgba(73, 58, 54, 1)"}, {"offset": 0.55, "color": "rgba(106, 81, 71, 1)"}, {"offset": 1, "color": "rgba(106, 81, 71, 1)"}]}}};
  node_primary_left_back_6.userData.actionProfile = {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [-1.85, 2.2, -1.05], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}};
  (nodes["leader-subordinate"] ?? root).add(node_primary_left_back_6);
  nodes["primary-left-back"] = node_primary_left_back_6;
  const mesh_primary_left_back_6Geometry = endpoint_primary_left_back_6
    ? new THREE.CylinderGeometry(endpoint_primary_left_back_6.endRadius, endpoint_primary_left_back_6.baseRadius, endpoint_primary_left_back_6.length, 32, 12)
    : buildTubeGeometry({"points": [[0, 0, 0], [-1.85, 2.2, -1.05]], "radius": 0.188, "radialSegments": 7, "closed": false});
  const mesh_primary_left_back_6 = new THREE.Mesh(
    mesh_primary_left_back_6Geometry,
    materialMap["bark"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_primary_left_back_6.name = "Primary Left Back";
  if (endpoint_primary_left_back_6) {
    mesh_primary_left_back_6.position.copy(endpoint_primary_left_back_6.midpoint);
    mesh_primary_left_back_6.quaternion.identity();
  }
  mesh_primary_left_back_6.castShadow = options.castShadow ?? true;
  mesh_primary_left_back_6.receiveShadow = options.receiveShadow ?? true;
  mesh_primary_left_back_6.userData.sculptComponent = {"id": "primary-left-back", "name": "Primary Left Back", "level": "macro", "role": "branch", "importance": 0.91, "confidence": 0.9, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "A tapered curved tube preserves botanical continuity, parent-local attachment, and wind pivots.", "geometryDescriptor": {"topologyIntent": "faceted parent-local cubic tube with pipe-area taper", "tubePath": {"points": [[0, 0, 0], [-1.85, 2.2, -1.05]], "radius": 0.188, "radialSegments": 7, "closed": false}, "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": ["deterministic bend", "subtle axial irregularity"], "uvStrategy": "stable object-space procedural coordinates", "normalStrategy": "faceted normals with restrained planar variation"}, "parent": "leader-subordinate", "attachment": {"parentId": "leader-subordinate", "parentSocket": "leader-subordinate:growth-surface", "localStart": [0, 0, 0], "localEnd": [-1.85, 2.2, -1.05], "contactType": "overlap", "embedDepth": 0.052640000000000006, "overlap": 0.06016, "gapTolerance": 0.008, "baseRadius": 0.188, "endRadius": 0.05, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.376, "height": 3.0602287496198715, "depth": 0.376, "units": "world-relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [-1.85, 2.2, -1.05], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "primary-bough", "description": "One of six unequal crown-defining boughs.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows the local botanical frame", "materialEffect": "preserve observed local albedo and roughness variation", "geometryEffect": "curved tapered scaffold", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.82, "microRoughness": 0.12, "bumpAmplitude": 0.035, "normalPattern": "longitudinal bark planes", "displacementPattern": "none", "occlusionPattern": "parent junction and contact AO", "edgeWearPattern": "subtle raised-plane value shift", "notes": "Silhouette remains geometry-led; surface effects stay restrained."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.9, "dominantAlbedo": "rgba(106, 81, 71, 1)", "secondaryAlbedo": "rgba(73, 58, 54, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1], "stops": [{"offset": 0, "color": "rgba(73, 58, 54, 1)"}, {"offset": 0.55, "color": "rgba(106, 81, 71, 1)"}, {"offset": 1, "color": "rgba(106, 81, 71, 1)"}]}}};
  node_primary_left_back_6.add(mesh_primary_left_back_6);
  meshes["primary-left-back"] = mesh_primary_left_back_6;
  colliders["primary-left-back"] = {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."};
  destructionGroups["living-sakura"] ??= [];
  destructionGroups["living-sakura"].push(node_primary_left_back_6);
  const socket_primary_left_back_growth_surface_0 = new THREE.Object3D();
  socket_primary_left_back_growth_surface_0.name = "growth-surface";
  socket_primary_left_back_growth_surface_0.position.set(-1.85, 2.2, -1.05);
  socket_primary_left_back_growth_surface_0.rotation.set(0.0, 0.0, 0.0);
  socket_primary_left_back_growth_surface_0.userData.socket = {"id": "growth-surface", "localPosition": [-1.85, 2.2, -1.05], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"};
  node_primary_left_back_6.add(socket_primary_left_back_growth_surface_0);
  sockets["primary-left-back:growth-surface"] = socket_primary_left_back_growth_surface_0;

  const attachment_primary_crown_7 = {"parentId": "leader-dominant", "parentSocket": "leader-dominant:growth-surface", "localStart": [0, 0, 0], "localEnd": [-0.25, 2.85, 0.2], "contactType": "overlap", "embedDepth": 0.04928000000000001, "overlap": 0.05632000000000001, "gapTolerance": 0.008, "baseRadius": 0.17600000000000002, "endRadius": 0.05, "evidenceRefs": ["full-object"]};
  const endpoint_primary_crown_7 = makeAttachmentEndpoint(attachment_primary_crown_7);
  const node_primary_crown_7 = new THREE.Group();
  node_primary_crown_7.name = "Primary Crown__pivot";
  if (endpoint_primary_crown_7) {
    node_primary_crown_7.position.copy(endpoint_primary_crown_7.start);
    node_primary_crown_7.quaternion.copy(endpoint_primary_crown_7.quaternion);
    node_primary_crown_7.scale.set(1, 1, 1);
  } else {
    node_primary_crown_7.position.set(0.0, 0.0, 0.0);
    node_primary_crown_7.rotation.set(0.0, 0.0, 0.0);
    node_primary_crown_7.scale.set(1.0, 1.0, 1.0);
  }
  node_primary_crown_7.userData.sculptComponent = {"id": "primary-crown", "name": "Primary Crown", "level": "macro", "role": "branch", "importance": 0.91, "confidence": 0.9, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "A tapered curved tube preserves botanical continuity, parent-local attachment, and wind pivots.", "geometryDescriptor": {"topologyIntent": "faceted parent-local cubic tube with pipe-area taper", "tubePath": {"points": [[0, 0, 0], [-0.25, 2.85, 0.2]], "radius": 0.17600000000000002, "radialSegments": 7, "closed": false}, "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": ["deterministic bend", "subtle axial irregularity"], "uvStrategy": "stable object-space procedural coordinates", "normalStrategy": "faceted normals with restrained planar variation"}, "parent": "leader-dominant", "attachment": {"parentId": "leader-dominant", "parentSocket": "leader-dominant:growth-surface", "localStart": [0, 0, 0], "localEnd": [-0.25, 2.85, 0.2], "contactType": "overlap", "embedDepth": 0.04928000000000001, "overlap": 0.05632000000000001, "gapTolerance": 0.008, "baseRadius": 0.17600000000000002, "endRadius": 0.05, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.35200000000000004, "height": 2.8679260799399975, "depth": 0.35200000000000004, "units": "world-relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [-0.25, 2.85, 0.2], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "primary-bough", "description": "One of six unequal crown-defining boughs.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows the local botanical frame", "materialEffect": "preserve observed local albedo and roughness variation", "geometryEffect": "curved tapered scaffold", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.82, "microRoughness": 0.12, "bumpAmplitude": 0.035, "normalPattern": "longitudinal bark planes", "displacementPattern": "none", "occlusionPattern": "parent junction and contact AO", "edgeWearPattern": "subtle raised-plane value shift", "notes": "Silhouette remains geometry-led; surface effects stay restrained."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.9, "dominantAlbedo": "rgba(106, 81, 71, 1)", "secondaryAlbedo": "rgba(73, 58, 54, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1], "stops": [{"offset": 0, "color": "rgba(73, 58, 54, 1)"}, {"offset": 0.55, "color": "rgba(106, 81, 71, 1)"}, {"offset": 1, "color": "rgba(106, 81, 71, 1)"}]}}};
  node_primary_crown_7.userData.actionProfile = {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [-0.25, 2.85, 0.2], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}};
  (nodes["leader-dominant"] ?? root).add(node_primary_crown_7);
  nodes["primary-crown"] = node_primary_crown_7;
  const mesh_primary_crown_7Geometry = endpoint_primary_crown_7
    ? new THREE.CylinderGeometry(endpoint_primary_crown_7.endRadius, endpoint_primary_crown_7.baseRadius, endpoint_primary_crown_7.length, 32, 12)
    : buildTubeGeometry({"points": [[0, 0, 0], [-0.25, 2.85, 0.2]], "radius": 0.17600000000000002, "radialSegments": 7, "closed": false});
  const mesh_primary_crown_7 = new THREE.Mesh(
    mesh_primary_crown_7Geometry,
    materialMap["bark"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_primary_crown_7.name = "Primary Crown";
  if (endpoint_primary_crown_7) {
    mesh_primary_crown_7.position.copy(endpoint_primary_crown_7.midpoint);
    mesh_primary_crown_7.quaternion.identity();
  }
  mesh_primary_crown_7.castShadow = options.castShadow ?? true;
  mesh_primary_crown_7.receiveShadow = options.receiveShadow ?? true;
  mesh_primary_crown_7.userData.sculptComponent = {"id": "primary-crown", "name": "Primary Crown", "level": "macro", "role": "branch", "importance": 0.91, "confidence": 0.9, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "A tapered curved tube preserves botanical continuity, parent-local attachment, and wind pivots.", "geometryDescriptor": {"topologyIntent": "faceted parent-local cubic tube with pipe-area taper", "tubePath": {"points": [[0, 0, 0], [-0.25, 2.85, 0.2]], "radius": 0.17600000000000002, "radialSegments": 7, "closed": false}, "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": ["deterministic bend", "subtle axial irregularity"], "uvStrategy": "stable object-space procedural coordinates", "normalStrategy": "faceted normals with restrained planar variation"}, "parent": "leader-dominant", "attachment": {"parentId": "leader-dominant", "parentSocket": "leader-dominant:growth-surface", "localStart": [0, 0, 0], "localEnd": [-0.25, 2.85, 0.2], "contactType": "overlap", "embedDepth": 0.04928000000000001, "overlap": 0.05632000000000001, "gapTolerance": 0.008, "baseRadius": 0.17600000000000002, "endRadius": 0.05, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.35200000000000004, "height": 2.8679260799399975, "depth": 0.35200000000000004, "units": "world-relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [-0.25, 2.85, 0.2], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "primary-bough", "description": "One of six unequal crown-defining boughs.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows the local botanical frame", "materialEffect": "preserve observed local albedo and roughness variation", "geometryEffect": "curved tapered scaffold", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.82, "microRoughness": 0.12, "bumpAmplitude": 0.035, "normalPattern": "longitudinal bark planes", "displacementPattern": "none", "occlusionPattern": "parent junction and contact AO", "edgeWearPattern": "subtle raised-plane value shift", "notes": "Silhouette remains geometry-led; surface effects stay restrained."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.9, "dominantAlbedo": "rgba(106, 81, 71, 1)", "secondaryAlbedo": "rgba(73, 58, 54, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1], "stops": [{"offset": 0, "color": "rgba(73, 58, 54, 1)"}, {"offset": 0.55, "color": "rgba(106, 81, 71, 1)"}, {"offset": 1, "color": "rgba(106, 81, 71, 1)"}]}}};
  node_primary_crown_7.add(mesh_primary_crown_7);
  meshes["primary-crown"] = mesh_primary_crown_7;
  colliders["primary-crown"] = {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."};
  destructionGroups["living-sakura"] ??= [];
  destructionGroups["living-sakura"].push(node_primary_crown_7);
  const socket_primary_crown_growth_surface_0 = new THREE.Object3D();
  socket_primary_crown_growth_surface_0.name = "growth-surface";
  socket_primary_crown_growth_surface_0.position.set(-0.25, 2.85, 0.2);
  socket_primary_crown_growth_surface_0.rotation.set(0.0, 0.0, 0.0);
  socket_primary_crown_growth_surface_0.userData.socket = {"id": "growth-surface", "localPosition": [-0.25, 2.85, 0.2], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"};
  node_primary_crown_7.add(socket_primary_crown_growth_surface_0);
  sockets["primary-crown:growth-surface"] = socket_primary_crown_growth_surface_0;

  const attachment_primary_right_high_8 = {"parentId": "leader-dominant", "parentSocket": "leader-dominant:growth-surface", "localStart": [0, 0, 0], "localEnd": [2.6, 2.05, -0.28], "contactType": "overlap", "embedDepth": 0.04592000000000001, "overlap": 0.052480000000000006, "gapTolerance": 0.008, "baseRadius": 0.164, "endRadius": 0.05, "evidenceRefs": ["full-object"]};
  const endpoint_primary_right_high_8 = makeAttachmentEndpoint(attachment_primary_right_high_8);
  const node_primary_right_high_8 = new THREE.Group();
  node_primary_right_high_8.name = "Primary Right High__pivot";
  if (endpoint_primary_right_high_8) {
    node_primary_right_high_8.position.copy(endpoint_primary_right_high_8.start);
    node_primary_right_high_8.quaternion.copy(endpoint_primary_right_high_8.quaternion);
    node_primary_right_high_8.scale.set(1, 1, 1);
  } else {
    node_primary_right_high_8.position.set(0.0, 0.0, 0.0);
    node_primary_right_high_8.rotation.set(0.0, 0.0, 0.0);
    node_primary_right_high_8.scale.set(1.0, 1.0, 1.0);
  }
  node_primary_right_high_8.userData.sculptComponent = {"id": "primary-right-high", "name": "Primary Right High", "level": "macro", "role": "branch", "importance": 0.91, "confidence": 0.9, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "A tapered curved tube preserves botanical continuity, parent-local attachment, and wind pivots.", "geometryDescriptor": {"topologyIntent": "faceted parent-local cubic tube with pipe-area taper", "tubePath": {"points": [[0, 0, 0], [2.6, 2.05, -0.28]], "radius": 0.164, "radialSegments": 7, "closed": false}, "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": ["deterministic bend", "subtle axial irregularity"], "uvStrategy": "stable object-space procedural coordinates", "normalStrategy": "faceted normals with restrained planar variation"}, "parent": "leader-dominant", "attachment": {"parentId": "leader-dominant", "parentSocket": "leader-dominant:growth-surface", "localStart": [0, 0, 0], "localEnd": [2.6, 2.05, -0.28], "contactType": "overlap", "embedDepth": 0.04592000000000001, "overlap": 0.052480000000000006, "gapTolerance": 0.008, "baseRadius": 0.164, "endRadius": 0.05, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.328, "height": 3.3227849764918584, "depth": 0.328, "units": "world-relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [2.6, 2.05, -0.28], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "primary-bough", "description": "One of six unequal crown-defining boughs.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows the local botanical frame", "materialEffect": "preserve observed local albedo and roughness variation", "geometryEffect": "curved tapered scaffold", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.82, "microRoughness": 0.12, "bumpAmplitude": 0.035, "normalPattern": "longitudinal bark planes", "displacementPattern": "none", "occlusionPattern": "parent junction and contact AO", "edgeWearPattern": "subtle raised-plane value shift", "notes": "Silhouette remains geometry-led; surface effects stay restrained."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.9, "dominantAlbedo": "rgba(106, 81, 71, 1)", "secondaryAlbedo": "rgba(73, 58, 54, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1], "stops": [{"offset": 0, "color": "rgba(73, 58, 54, 1)"}, {"offset": 0.55, "color": "rgba(106, 81, 71, 1)"}, {"offset": 1, "color": "rgba(106, 81, 71, 1)"}]}}};
  node_primary_right_high_8.userData.actionProfile = {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [2.6, 2.05, -0.28], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}};
  (nodes["leader-dominant"] ?? root).add(node_primary_right_high_8);
  nodes["primary-right-high"] = node_primary_right_high_8;
  const mesh_primary_right_high_8Geometry = endpoint_primary_right_high_8
    ? new THREE.CylinderGeometry(endpoint_primary_right_high_8.endRadius, endpoint_primary_right_high_8.baseRadius, endpoint_primary_right_high_8.length, 32, 12)
    : buildTubeGeometry({"points": [[0, 0, 0], [2.6, 2.05, -0.28]], "radius": 0.164, "radialSegments": 7, "closed": false});
  const mesh_primary_right_high_8 = new THREE.Mesh(
    mesh_primary_right_high_8Geometry,
    materialMap["bark"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_primary_right_high_8.name = "Primary Right High";
  if (endpoint_primary_right_high_8) {
    mesh_primary_right_high_8.position.copy(endpoint_primary_right_high_8.midpoint);
    mesh_primary_right_high_8.quaternion.identity();
  }
  mesh_primary_right_high_8.castShadow = options.castShadow ?? true;
  mesh_primary_right_high_8.receiveShadow = options.receiveShadow ?? true;
  mesh_primary_right_high_8.userData.sculptComponent = {"id": "primary-right-high", "name": "Primary Right High", "level": "macro", "role": "branch", "importance": 0.91, "confidence": 0.9, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "A tapered curved tube preserves botanical continuity, parent-local attachment, and wind pivots.", "geometryDescriptor": {"topologyIntent": "faceted parent-local cubic tube with pipe-area taper", "tubePath": {"points": [[0, 0, 0], [2.6, 2.05, -0.28]], "radius": 0.164, "radialSegments": 7, "closed": false}, "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": ["deterministic bend", "subtle axial irregularity"], "uvStrategy": "stable object-space procedural coordinates", "normalStrategy": "faceted normals with restrained planar variation"}, "parent": "leader-dominant", "attachment": {"parentId": "leader-dominant", "parentSocket": "leader-dominant:growth-surface", "localStart": [0, 0, 0], "localEnd": [2.6, 2.05, -0.28], "contactType": "overlap", "embedDepth": 0.04592000000000001, "overlap": 0.052480000000000006, "gapTolerance": 0.008, "baseRadius": 0.164, "endRadius": 0.05, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.328, "height": 3.3227849764918584, "depth": 0.328, "units": "world-relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [2.6, 2.05, -0.28], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "primary-bough", "description": "One of six unequal crown-defining boughs.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows the local botanical frame", "materialEffect": "preserve observed local albedo and roughness variation", "geometryEffect": "curved tapered scaffold", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.82, "microRoughness": 0.12, "bumpAmplitude": 0.035, "normalPattern": "longitudinal bark planes", "displacementPattern": "none", "occlusionPattern": "parent junction and contact AO", "edgeWearPattern": "subtle raised-plane value shift", "notes": "Silhouette remains geometry-led; surface effects stay restrained."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.9, "dominantAlbedo": "rgba(106, 81, 71, 1)", "secondaryAlbedo": "rgba(73, 58, 54, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1], "stops": [{"offset": 0, "color": "rgba(73, 58, 54, 1)"}, {"offset": 0.55, "color": "rgba(106, 81, 71, 1)"}, {"offset": 1, "color": "rgba(106, 81, 71, 1)"}]}}};
  node_primary_right_high_8.add(mesh_primary_right_high_8);
  meshes["primary-right-high"] = mesh_primary_right_high_8;
  colliders["primary-right-high"] = {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."};
  destructionGroups["living-sakura"] ??= [];
  destructionGroups["living-sakura"].push(node_primary_right_high_8);
  const socket_primary_right_high_growth_surface_0 = new THREE.Object3D();
  socket_primary_right_high_growth_surface_0.name = "growth-surface";
  socket_primary_right_high_growth_surface_0.position.set(2.6, 2.05, -0.28);
  socket_primary_right_high_growth_surface_0.rotation.set(0.0, 0.0, 0.0);
  socket_primary_right_high_growth_surface_0.userData.socket = {"id": "growth-surface", "localPosition": [2.6, 2.05, -0.28], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"};
  node_primary_right_high_8.add(socket_primary_right_high_growth_surface_0);
  sockets["primary-right-high:growth-surface"] = socket_primary_right_high_growth_surface_0;

  const attachment_primary_right_low_9 = {"parentId": "trunk-lower", "parentSocket": "trunk-lower:growth-surface", "localStart": [0, 0, 0], "localEnd": [3.45, 1.8, 0.62], "contactType": "overlap", "embedDepth": 0.04256000000000001, "overlap": 0.04864000000000001, "gapTolerance": 0.008, "baseRadius": 0.15200000000000002, "endRadius": 0.05, "evidenceRefs": ["full-object"]};
  const endpoint_primary_right_low_9 = makeAttachmentEndpoint(attachment_primary_right_low_9);
  const node_primary_right_low_9 = new THREE.Group();
  node_primary_right_low_9.name = "Primary Right Low__pivot";
  if (endpoint_primary_right_low_9) {
    node_primary_right_low_9.position.copy(endpoint_primary_right_low_9.start);
    node_primary_right_low_9.quaternion.copy(endpoint_primary_right_low_9.quaternion);
    node_primary_right_low_9.scale.set(1, 1, 1);
  } else {
    node_primary_right_low_9.position.set(0.0, 0.0, 0.0);
    node_primary_right_low_9.rotation.set(0.0, 0.0, 0.0);
    node_primary_right_low_9.scale.set(1.0, 1.0, 1.0);
  }
  node_primary_right_low_9.userData.sculptComponent = {"id": "primary-right-low", "name": "Primary Right Low", "level": "macro", "role": "branch", "importance": 0.91, "confidence": 0.9, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "A tapered curved tube preserves botanical continuity, parent-local attachment, and wind pivots.", "geometryDescriptor": {"topologyIntent": "faceted parent-local cubic tube with pipe-area taper", "tubePath": {"points": [[0, 0, 0], [3.45, 1.8, 0.62]], "radius": 0.15200000000000002, "radialSegments": 7, "closed": false}, "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": ["deterministic bend", "subtle axial irregularity"], "uvStrategy": "stable object-space procedural coordinates", "normalStrategy": "faceted normals with restrained planar variation"}, "parent": "trunk-lower", "attachment": {"parentId": "trunk-lower", "parentSocket": "trunk-lower:growth-surface", "localStart": [0, 0, 0], "localEnd": [3.45, 1.8, 0.62], "contactType": "overlap", "embedDepth": 0.04256000000000001, "overlap": 0.04864000000000001, "gapTolerance": 0.008, "baseRadius": 0.15200000000000002, "endRadius": 0.05, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.30400000000000005, "height": 3.9404187594721454, "depth": 0.30400000000000005, "units": "world-relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [3.45, 1.8, 0.62], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "primary-bough", "description": "One of six unequal crown-defining boughs.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows the local botanical frame", "materialEffect": "preserve observed local albedo and roughness variation", "geometryEffect": "curved tapered scaffold", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.82, "microRoughness": 0.12, "bumpAmplitude": 0.035, "normalPattern": "longitudinal bark planes", "displacementPattern": "none", "occlusionPattern": "parent junction and contact AO", "edgeWearPattern": "subtle raised-plane value shift", "notes": "Silhouette remains geometry-led; surface effects stay restrained."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.9, "dominantAlbedo": "rgba(106, 81, 71, 1)", "secondaryAlbedo": "rgba(73, 58, 54, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1], "stops": [{"offset": 0, "color": "rgba(73, 58, 54, 1)"}, {"offset": 0.55, "color": "rgba(106, 81, 71, 1)"}, {"offset": 1, "color": "rgba(106, 81, 71, 1)"}]}}};
  node_primary_right_low_9.userData.actionProfile = {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [3.45, 1.8, 0.62], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}};
  (nodes["trunk-lower"] ?? root).add(node_primary_right_low_9);
  nodes["primary-right-low"] = node_primary_right_low_9;
  const mesh_primary_right_low_9Geometry = endpoint_primary_right_low_9
    ? new THREE.CylinderGeometry(endpoint_primary_right_low_9.endRadius, endpoint_primary_right_low_9.baseRadius, endpoint_primary_right_low_9.length, 32, 12)
    : buildTubeGeometry({"points": [[0, 0, 0], [3.45, 1.8, 0.62]], "radius": 0.15200000000000002, "radialSegments": 7, "closed": false});
  const mesh_primary_right_low_9 = new THREE.Mesh(
    mesh_primary_right_low_9Geometry,
    materialMap["bark"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_primary_right_low_9.name = "Primary Right Low";
  if (endpoint_primary_right_low_9) {
    mesh_primary_right_low_9.position.copy(endpoint_primary_right_low_9.midpoint);
    mesh_primary_right_low_9.quaternion.identity();
  }
  mesh_primary_right_low_9.castShadow = options.castShadow ?? true;
  mesh_primary_right_low_9.receiveShadow = options.receiveShadow ?? true;
  mesh_primary_right_low_9.userData.sculptComponent = {"id": "primary-right-low", "name": "Primary Right Low", "level": "macro", "role": "branch", "importance": 0.91, "confidence": 0.9, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "A tapered curved tube preserves botanical continuity, parent-local attachment, and wind pivots.", "geometryDescriptor": {"topologyIntent": "faceted parent-local cubic tube with pipe-area taper", "tubePath": {"points": [[0, 0, 0], [3.45, 1.8, 0.62]], "radius": 0.15200000000000002, "radialSegments": 7, "closed": false}, "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": ["deterministic bend", "subtle axial irregularity"], "uvStrategy": "stable object-space procedural coordinates", "normalStrategy": "faceted normals with restrained planar variation"}, "parent": "trunk-lower", "attachment": {"parentId": "trunk-lower", "parentSocket": "trunk-lower:growth-surface", "localStart": [0, 0, 0], "localEnd": [3.45, 1.8, 0.62], "contactType": "overlap", "embedDepth": 0.04256000000000001, "overlap": 0.04864000000000001, "gapTolerance": 0.008, "baseRadius": 0.15200000000000002, "endRadius": 0.05, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.30400000000000005, "height": 3.9404187594721454, "depth": 0.30400000000000005, "units": "world-relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [3.45, 1.8, 0.62], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "primary-bough", "description": "One of six unequal crown-defining boughs.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows the local botanical frame", "materialEffect": "preserve observed local albedo and roughness variation", "geometryEffect": "curved tapered scaffold", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.82, "microRoughness": 0.12, "bumpAmplitude": 0.035, "normalPattern": "longitudinal bark planes", "displacementPattern": "none", "occlusionPattern": "parent junction and contact AO", "edgeWearPattern": "subtle raised-plane value shift", "notes": "Silhouette remains geometry-led; surface effects stay restrained."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.9, "dominantAlbedo": "rgba(106, 81, 71, 1)", "secondaryAlbedo": "rgba(73, 58, 54, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1], "stops": [{"offset": 0, "color": "rgba(73, 58, 54, 1)"}, {"offset": 0.55, "color": "rgba(106, 81, 71, 1)"}, {"offset": 1, "color": "rgba(106, 81, 71, 1)"}]}}};
  node_primary_right_low_9.add(mesh_primary_right_low_9);
  meshes["primary-right-low"] = mesh_primary_right_low_9;
  colliders["primary-right-low"] = {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."};
  destructionGroups["living-sakura"] ??= [];
  destructionGroups["living-sakura"].push(node_primary_right_low_9);
  const socket_primary_right_low_growth_surface_0 = new THREE.Object3D();
  socket_primary_right_low_growth_surface_0.name = "growth-surface";
  socket_primary_right_low_growth_surface_0.position.set(3.45, 1.8, 0.62);
  socket_primary_right_low_growth_surface_0.rotation.set(0.0, 0.0, 0.0);
  socket_primary_right_low_growth_surface_0.userData.socket = {"id": "growth-surface", "localPosition": [3.45, 1.8, 0.62], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"};
  node_primary_right_low_9.add(socket_primary_right_low_growth_surface_0);
  sockets["primary-right-low:growth-surface"] = socket_primary_right_low_growth_surface_0;

  const attachment_primary_front_10 = {"parentId": "leader-dominant", "parentSocket": "leader-dominant:growth-surface", "localStart": [0, 0, 0], "localEnd": [1.35, 1.75, 1.18], "contactType": "overlap", "embedDepth": 0.039200000000000006, "overlap": 0.044800000000000006, "gapTolerance": 0.008, "baseRadius": 0.14, "endRadius": 0.05, "evidenceRefs": ["full-object"]};
  const endpoint_primary_front_10 = makeAttachmentEndpoint(attachment_primary_front_10);
  const node_primary_front_10 = new THREE.Group();
  node_primary_front_10.name = "Primary Front__pivot";
  if (endpoint_primary_front_10) {
    node_primary_front_10.position.copy(endpoint_primary_front_10.start);
    node_primary_front_10.quaternion.copy(endpoint_primary_front_10.quaternion);
    node_primary_front_10.scale.set(1, 1, 1);
  } else {
    node_primary_front_10.position.set(0.0, 0.0, 0.0);
    node_primary_front_10.rotation.set(0.0, 0.0, 0.0);
    node_primary_front_10.scale.set(1.0, 1.0, 1.0);
  }
  node_primary_front_10.userData.sculptComponent = {"id": "primary-front", "name": "Primary Front", "level": "macro", "role": "branch", "importance": 0.91, "confidence": 0.9, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "A tapered curved tube preserves botanical continuity, parent-local attachment, and wind pivots.", "geometryDescriptor": {"topologyIntent": "faceted parent-local cubic tube with pipe-area taper", "tubePath": {"points": [[0, 0, 0], [1.35, 1.75, 1.18]], "radius": 0.14, "radialSegments": 7, "closed": false}, "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": ["deterministic bend", "subtle axial irregularity"], "uvStrategy": "stable object-space procedural coordinates", "normalStrategy": "faceted normals with restrained planar variation"}, "parent": "leader-dominant", "attachment": {"parentId": "leader-dominant", "parentSocket": "leader-dominant:growth-surface", "localStart": [0, 0, 0], "localEnd": [1.35, 1.75, 1.18], "contactType": "overlap", "embedDepth": 0.039200000000000006, "overlap": 0.044800000000000006, "gapTolerance": 0.008, "baseRadius": 0.14, "endRadius": 0.05, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.28, "height": 2.5054740070493646, "depth": 0.28, "units": "world-relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [1.35, 1.75, 1.18], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "primary-bough", "description": "One of six unequal crown-defining boughs.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows the local botanical frame", "materialEffect": "preserve observed local albedo and roughness variation", "geometryEffect": "curved tapered scaffold", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.82, "microRoughness": 0.12, "bumpAmplitude": 0.035, "normalPattern": "longitudinal bark planes", "displacementPattern": "none", "occlusionPattern": "parent junction and contact AO", "edgeWearPattern": "subtle raised-plane value shift", "notes": "Silhouette remains geometry-led; surface effects stay restrained."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.9, "dominantAlbedo": "rgba(106, 81, 71, 1)", "secondaryAlbedo": "rgba(73, 58, 54, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1], "stops": [{"offset": 0, "color": "rgba(73, 58, 54, 1)"}, {"offset": 0.55, "color": "rgba(106, 81, 71, 1)"}, {"offset": 1, "color": "rgba(106, 81, 71, 1)"}]}}};
  node_primary_front_10.userData.actionProfile = {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [1.35, 1.75, 1.18], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}};
  (nodes["leader-dominant"] ?? root).add(node_primary_front_10);
  nodes["primary-front"] = node_primary_front_10;
  const mesh_primary_front_10Geometry = endpoint_primary_front_10
    ? new THREE.CylinderGeometry(endpoint_primary_front_10.endRadius, endpoint_primary_front_10.baseRadius, endpoint_primary_front_10.length, 32, 12)
    : buildTubeGeometry({"points": [[0, 0, 0], [1.35, 1.75, 1.18]], "radius": 0.14, "radialSegments": 7, "closed": false});
  const mesh_primary_front_10 = new THREE.Mesh(
    mesh_primary_front_10Geometry,
    materialMap["bark"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_primary_front_10.name = "Primary Front";
  if (endpoint_primary_front_10) {
    mesh_primary_front_10.position.copy(endpoint_primary_front_10.midpoint);
    mesh_primary_front_10.quaternion.identity();
  }
  mesh_primary_front_10.castShadow = options.castShadow ?? true;
  mesh_primary_front_10.receiveShadow = options.receiveShadow ?? true;
  mesh_primary_front_10.userData.sculptComponent = {"id": "primary-front", "name": "Primary Front", "level": "macro", "role": "branch", "importance": 0.91, "confidence": 0.9, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "A tapered curved tube preserves botanical continuity, parent-local attachment, and wind pivots.", "geometryDescriptor": {"topologyIntent": "faceted parent-local cubic tube with pipe-area taper", "tubePath": {"points": [[0, 0, 0], [1.35, 1.75, 1.18]], "radius": 0.14, "radialSegments": 7, "closed": false}, "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": ["deterministic bend", "subtle axial irregularity"], "uvStrategy": "stable object-space procedural coordinates", "normalStrategy": "faceted normals with restrained planar variation"}, "parent": "leader-dominant", "attachment": {"parentId": "leader-dominant", "parentSocket": "leader-dominant:growth-surface", "localStart": [0, 0, 0], "localEnd": [1.35, 1.75, 1.18], "contactType": "overlap", "embedDepth": 0.039200000000000006, "overlap": 0.044800000000000006, "gapTolerance": 0.008, "baseRadius": 0.14, "endRadius": 0.05, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.28, "height": 2.5054740070493646, "depth": 0.28, "units": "world-relative", "confidence": 0.9}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "branch", "pivot": {"mode": "socket", "localPosition": [0, 0, 0], "axis": [0, 0, 1], "confidence": 0.92}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": true, "twist": true, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "growth-surface", "localPosition": [1.35, 1.75, 1.18], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}], "collider": {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "living-sakura", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "bark"}}, "material": "bark", "materialLayers": ["bark"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "primary-bough", "description": "One of six unequal crown-defining boughs.", "placement": "reference-derived local region", "approximateSize": "object-relative", "orientation": "follows the local botanical frame", "materialEffect": "preserve observed local albedo and roughness variation", "geometryEffect": "curved tapered scaffold", "confidence": 0.9}], "surfaceDetail": {"macroRoughness": 0.82, "microRoughness": 0.12, "bumpAmplitude": 0.035, "normalPattern": "longitudinal bark planes", "displacementPattern": "none", "occlusionPattern": "parent junction and contact AO", "edgeWearPattern": "subtle raised-plane value shift", "notes": "Silhouette remains geometry-led; surface effects stay restrained."}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "macro", "colorMaterialRecipe": {"materialClass": "wood", "materialClassConfidence": 0.9, "dominantAlbedo": "rgba(106, 81, 71, 1)", "secondaryAlbedo": "rgba(73, 58, 54, 1)", "colorGradient": {"type": "linear", "axis": [0.2, 1], "stops": [{"offset": 0, "color": "rgba(73, 58, 54, 1)"}, {"offset": 0.55, "color": "rgba(106, 81, 71, 1)"}, {"offset": 1, "color": "rgba(106, 81, 71, 1)"}]}}};
  node_primary_front_10.add(mesh_primary_front_10);
  meshes["primary-front"] = mesh_primary_front_10;
  colliders["primary-front"] = {"type": "capsule", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Simplified interaction proxy; never used as the visible form."};
  destructionGroups["living-sakura"] ??= [];
  destructionGroups["living-sakura"].push(node_primary_front_10);
  const socket_primary_front_growth_surface_0 = new THREE.Object3D();
  socket_primary_front_growth_surface_0.name = "growth-surface";
  socket_primary_front_growth_surface_0.position.set(1.35, 1.75, 1.18);
  socket_primary_front_growth_surface_0.rotation.set(0.0, 0.0, 0.0);
  socket_primary_front_growth_surface_0.userData.socket = {"id": "growth-surface", "localPosition": [1.35, 1.75, 1.18], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"};
  node_primary_front_10.add(socket_primary_front_growth_surface_0);
  sockets["primary-front:growth-surface"] = socket_primary_front_growth_surface_0;

  root.userData.sculptRuntime = { nodes, meshes, sockets, colliders, destructionGroups } satisfies ProceduralModelRuntime;
  root.userData.lookDevTargets = {"qualityPriority": "balanced", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": false, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py", "acceptedLimitation": "The reference is a stylized single-view art target. Runtime materials use authored procedural response; extracted pixels are not treated as inverse-rendered PBR truth."}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"]}, "screenshotReview": ["Compare leafless silhouette first.", "Compare peak-bloom negative space and visible wood.", "Review front, three-quarter, side and rear.", "Record 30-second motion study and simple/deep reveal studies."]};
  root.userData.actionReadiness = {
    note: 'Use root.userData.sculptRuntime.nodes for transforms, sockets for attachments, colliders for physics proxies, and destructionGroups for breakable sets.',
  };
  return root;
}

export function createLivingSakuraV2LookDevLights(
  mode: 'neutral' | 'grazing' | 'reference' = 'neutral',
): THREE.Group {
  const lights = new THREE.Group();
  lights.name = "Living Sakura v2 look-dev lights";
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
  lights.userData.lightingFromPhoto = [{"type": "key light", "direction": "upper front-left", "color": "warm daylight", "intensity": "broad and moderate"}, {"type": "fill light", "direction": "camera-right", "color": "warm neutral", "intensity": "low"}, {"type": "rim light", "direction": "rear upper hemisphere", "color": "pale peach cream", "intensity": "subtle"}, {"type": "exposure", "toneMapping": "ACES filmic", "exposure": "protect pale petals", "background": "warm ivory"}, {"type": "contact shadow", "behavior": "soft root contact only; no hard theatrical shadow"}];
  lights.userData.lookDevTargets = {"qualityPriority": "balanced", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": false, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py", "acceptedLimitation": "The reference is a stylized single-view art target. Runtime materials use authored procedural response; extracted pixels are not treated as inverse-rendered PBR truth."}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"]}, "screenshotReview": ["Compare leafless silhouette first.", "Compare peak-bloom negative space and visible wood.", "Review front, three-quarter, side and rear.", "Record 30-second motion study and simple/deep reveal studies."]};
  return lights;
}

// PBR materials (clearcoat/iridescence/transmission/anisotropy) need an environment
// map to visually behave as intended — call this once per renderer and assign the
// result to scene.environment before rendering. No external HDR asset required.
export function createLivingSakuraV2Environment(renderer: THREE.WebGLRenderer): THREE.Texture {
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
export function frameLivingSakuraV2Camera(
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
export function createLivingSakuraV2PresentationComposer(
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

export function configureLivingSakuraV2Renderer(renderer: THREE.WebGLRenderer): void {
  // Load-bearing for view-dependent finishes (anodized / Doppler): without ACES + sRGB
  // the environment reflection reads flat/washed instead of a believable metal response.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

export function createLivingSakuraV2InspectControls(
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
