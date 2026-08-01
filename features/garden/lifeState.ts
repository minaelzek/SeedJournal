import type { GardenWeatherKind } from "@/features/reflection";

export interface GardenLifeState {
  windScale: number;
  petalCap: number;
  lightScale: number;
  fogNearOffset: number;
  fogFarOffset: number;
}

const WEATHER_LIFE: Record<GardenWeatherKind, GardenLifeState> = {
  still: {
    windScale: 0.38,
    petalCap: 14,
    lightScale: 0.96,
    fogNearOffset: 0,
    fogFarOffset: 0,
  },
  dew: {
    windScale: 0.56,
    petalCap: 18,
    lightScale: 1.02,
    fogNearOffset: 0.5,
    fogFarOffset: 1,
  },
  mist: {
    windScale: 0.3,
    petalCap: 12,
    lightScale: 0.88,
    fogNearOffset: -2,
    fogFarOffset: -3,
  },
  breeze: {
    windScale: 1.45,
    petalCap: 36,
    lightScale: 1,
    fogNearOffset: 1,
    fogFarOffset: 1,
  },
  sunbreak: {
    windScale: 0.72,
    petalCap: 24,
    lightScale: 1.16,
    fogNearOffset: 2,
    fogFarOffset: 4,
  },
};

export function gardenLifeForWeather(
  weather: GardenWeatherKind = "still",
): GardenLifeState {
  return WEATHER_LIFE[weather];
}
