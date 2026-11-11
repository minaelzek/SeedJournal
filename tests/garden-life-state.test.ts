import { describe, expect, it } from "vitest";
import { gardenLifeForWeather } from "../features/garden/lifeState";

describe("garden life state", () => {
  it("embodies reflective weather without assigning emotional value", () => {
    const still = gardenLifeForWeather("still");
    const mist = gardenLifeForWeather("mist");
    const breeze = gardenLifeForWeather("breeze");
    const sunbreak = gardenLifeForWeather("sunbreak");

    expect(breeze.windScale).toBeGreaterThan(still.windScale);
    const restless = gardenLifeForWeather("restless");
    expect(restless.windScale).toBeGreaterThan(still.windScale);
    expect(restless.windScale).toBeLessThan(1.45);
    expect(breeze.petalCap).toBeGreaterThan(mist.petalCap);
    expect(mist.lightScale).toBeLessThan(still.lightScale);
    expect(gardenLifeForWeather("rain").lightScale).toBeGreaterThan(0.85);
    expect(gardenLifeForWeather("rain").lightScale).toBeLessThanOrEqual(still.lightScale);
    expect(sunbreak.lightScale).toBeGreaterThan(still.lightScale);
    expect(gardenLifeForWeather("rain").wetness).toBeGreaterThan(0);
    expect(gardenLifeForWeather("rain").wetness).toBeLessThan(0.5);
    expect(sunbreak.glare).toBeGreaterThan(still.glare);
    expect(gardenLifeForWeather("rain").petalCap).toBeGreaterThan(0);
    expect(breeze.petalCap).toBeGreaterThan(still.petalCap);
  });
});
