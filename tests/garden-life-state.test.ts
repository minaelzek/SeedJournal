import { describe, expect, it } from "vitest";
import { gardenLifeForWeather } from "../features/garden/lifeState";

describe("garden life state", () => {
  it("embodies reflective weather without assigning emotional value", () => {
    const still = gardenLifeForWeather("still");
    const mist = gardenLifeForWeather("mist");
    const breeze = gardenLifeForWeather("breeze");
    const sunbreak = gardenLifeForWeather("sunbreak");

    expect(breeze.windScale).toBeGreaterThan(still.windScale);
    expect(breeze.petalCap).toBeGreaterThan(mist.petalCap);
    expect(mist.lightScale).toBeLessThan(still.lightScale);
    expect(sunbreak.lightScale).toBeGreaterThan(still.lightScale);
  });
});
