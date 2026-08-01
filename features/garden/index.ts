export { SakuraScene, type SakuraSceneProps } from "./SakuraScene";
export { GardenFallback, type GardenFallbackProps } from "./GardenFallback";
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
/** Illustration-first sakura hero (product default). */
export {
  IllustratedSakura,
  presentSakura,
  morphIntentForReveal,
  type IllustratedSakuraProps,
  type SakuraPresentation,
  type MorphIntent,
} from "./illustration";

