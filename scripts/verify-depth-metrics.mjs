/**
 * One-shot depth verification for living sakura volumetric work.
 * Run from repo root: node scripts/verify-depth-metrics.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadTs(rel) {
  const server = await createServer({
    configFile: false,
    root,
    server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    return await server.ssrLoadModule(`/${rel.replace(/\\/g, "/")}`);
  } finally {
    await server.close();
  }
}

const { planProductionWood } = await loadTs("features/garden/living-sakura/productionWood.ts");
const { planAuthoredCrown, measureAuthoredCrown } = await loadTs(
  "features/garden/living-sakura/authoredCrown.ts",
);
const { buildLivingSakuraTopology } = await loadTs(
  "features/garden/living-sakura/livingTopology.ts",
);

const wood = planProductionWood({ rootSeed: "quiet-rain" });
console.log("production crownDepthToWidth", wood.crown.crownDepthToWidth);
console.log("production windows", wood.protectedWindows.length);

for (const seed of ["seed-journal-mature", "quiet-rain", "first-light", "late-spring"]) {
  const plan = planAuthoredCrown({ rootSeed: seed });
  const measured = measureAuthoredCrown(plan.segments);
  console.log(
    `authored ${seed} depth/width`,
    (measured.depth / measured.width).toFixed(4),
    "windows",
    plan.protectedWindows.length,
  );
}

const tree = buildLivingSakuraTopology({
  rootSeed: "open-crown",
  cumulativeEventCount: 10_000,
});
const zs = tree.segments.map((segment) => segment.end[2]);
console.log("topology z min/max", Math.min(...zs).toFixed(3), Math.max(...zs).toFixed(3));
console.log("topology z span", (Math.max(...zs) - Math.min(...zs)).toFixed(3));
console.log("topology windows", tree.protectedWindows.length);
console.log("OK");
