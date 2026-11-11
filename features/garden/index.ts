export { SakuraScene, type SakuraSceneProps } from "./SakuraScene";
export { GardenFallback, type GardenFallbackProps } from "./GardenFallback";
export {
  canUseWebGL,
  resolveLivingGardenTier,
  registerWebGLContextLost,
  type GardenDemotionTier,
  type WebGLDocument,
  type WebGLContextLostTarget,
} from "./canUseWebGL";
export { GardenErrorBoundary } from "./GardenErrorBoundary";
export {
  MemoryNavigator,
  type GardenMemoryRecord,
  type MemoryNavigatorProps,
} from "./MemoryNavigator";
export {
  buildTreeTopology,
  topologyFingerprint,
  sampleCubic,
  seededRandom,
} from "./topology";
export type {
  CubicBranch,
  FoliageNode,
  QualityTier,
  TreeTopology,
} from "./types";
/** Presentation knobs for growth-reveal copy (not a 2D tree renderer). */
export {
  presentSakura,
  morphIntentForReveal,
  type SakuraPresentation,
  type MorphIntent,
} from "./illustration";

