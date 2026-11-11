export {
  extractLongitudinalAnchor,
  extractSafeAnchor,
} from "./anchors";
export {
  evaluateReflection,
  getReflectionMode,
  REFLECTION_ENGINE_VERSION,
  selectReflectionTarget,
  stripOpeningPrompt,
} from "./engine";
export {
  composeGardenReply,
  pageIsHeavy,
  quotedSpan,
} from "./compose";
export type { ComposedLine, ComposeKind } from "./compose";
export { selectDailyOpeningPrompt, selectFollowUp } from "./follow-up";
export type { SelectedFollowUp } from "./follow-up";
export { extractWritingScene, isSceneFollowUpId } from "./scene";
export type { WritingScene, SceneQuestion } from "./scene";
export { growthForEntry, mapReflectionToGrowth } from "./growth";
export type { GrowthResult } from "./growth";
export { seededIndex, stableHash } from "./hash";
export { weatherForEntry } from "./weather";
export type { GardenWeather, GardenWeatherKind } from "./weather";
