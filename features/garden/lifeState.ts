import type { GardenWeatherKind } from "@/features/reflection";

export interface GardenLifeState {
  windScale: number;
  petalCap: number;
  lightScale: number;
  fogNearOffset: number;
  fogFarOffset: number;
  /** 0–1 bark and soil wetness. Rain is the only heavy wet. */
  wetness: number;
  /** Extra key-light warmth; sunbreak is the peak. */
  glare: number;
}

const WEATHER_LIFE: Record<GardenWeatherKind, GardenLifeState> = {
  still: {
    windScale: 0.9,
    petalCap: 14,
    lightScale: 0.96,
    fogNearOffset: 0,
    fogFarOffset: 0,
    wetness: 0,
    glare: 0,
  },
  dew: {
    windScale: 0.62,
    petalCap: 18,
    lightScale: 1.02,
    fogNearOffset: 0.5,
    fogFarOffset: 1,
    wetness: 0.18,
    glare: 0.08,
  },
  mist: {
    windScale: 0.45,
    petalCap: 16,
    lightScale: 0.94,
    fogNearOffset: -1,
    fogFarOffset: -2,
    wetness: 0.2,
    glare: 0,
  },
  rain: {
    windScale: 0.6,
    petalCap: 18,
    lightScale: 0.9,
    fogNearOffset: -1.5,
    fogFarOffset: -2,
    wetness: 0.45,
    glare: 0,
  },
  breeze: {
    windScale: 1.02,
    petalCap: 28,
    lightScale: 1,
    fogNearOffset: 1,
    fogFarOffset: 1,
    wetness: 0,
    glare: 0.06,
  },
  sunbreak: {
    windScale: 0.75,
    petalCap: 24,
    lightScale: 1.18,
    fogNearOffset: 3,
    fogFarOffset: 6,
    wetness: 0,
    glare: 0.7,
  },
  restless: {
    // Above still air (0.9), short of a gale. Breeze stays the lighter lift.
    windScale: 1.12,
    petalCap: 18,
    lightScale: 0.96,
    fogNearOffset: 0.4,
    fogFarOffset: 0.8,
    wetness: 0,
    glare: 0,
  },
};

export function gardenLifeForWeather(
  weather: GardenWeatherKind = "still",
): GardenLifeState {
  return WEATHER_LIFE[weather];
}
