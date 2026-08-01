"use client";

import { useId, useMemo, type CSSProperties } from "react";
import type { GardenWeatherKind } from "@/features/reflection";
import type { TreeGrowthDelta, TreeSnapshot } from "@/lib/contracts";
import {
  morphIntentForReveal,
  presentSakura,
  presentationAtSequence,
  type MorphIntent,
  type SakuraPresentation,
} from "./presentation";
import "./illustration.css";

export interface IllustratedSakuraProps {
  snapshot: TreeSnapshot;
  growthDelta?: TreeGrowthDelta;
  /** When set with growthDelta, show the pre-morph state (reveal theater). */
  revealPhase?: "before" | "after" | "idle";
  weatherKind?: GardenWeatherKind;
  reducedMotion?: boolean;
  selectedEntryId?: string | null;
  onSelectEntry?: (entryId: string) => void;
  className?: string;
  /** Override presentation (tests / storyboard). */
  presentation?: SakuraPresentation;
  morphIntent?: MorphIntent;
  /** Larger composition for celebration theater */
  size?: "hero" | "reveal";
}

function FivePetalBlossom({
  cx,
  cy,
  scale,
  luminous,
  soft,
}: {
  cx: number;
  cy: number;
  scale: number;
  luminous?: boolean;
  soft?: boolean;
}) {
  const petals = [0, 72, 144, 216, 288];
  return (
    <g
      className={[
        "sj-sakura__blossom",
        luminous ? "sj-sakura__blossom--luminous" : "",
        soft ? "sj-sakura__blossom--soft" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      transform={`translate(${cx} ${cy}) scale(${scale})`}
    >
      {luminous ? (
        <circle className="sj-sakura__blossom-glow" r="16" cx="0" cy="0" />
      ) : null}
      {petals.map((deg) => (
        <path
          key={deg}
          className="sj-sakura__petal"
          d="M0,0 C-2.8,-2.2 -4.2,-6.8 -1.4,-9.2 C-0.5,-9.7 0.5,-9.7 1.4,-9.2 C4.2,-6.8 2.8,-2.2 0,0 Z"
          transform={`rotate(${deg})`}
        />
      ))}
      <circle className="sj-sakura__stamen" r="2.35" cx="0" cy="0" />
      <circle className="sj-sakura__stamen-core" r="1.05" cx="0" cy="0" />
    </g>
  );
}

function Leaf({
  cx,
  cy,
  scale,
  rotation,
}: {
  cx: number;
  cy: number;
  scale: number;
  rotation: number;
}) {
  return (
    <g transform={`translate(${cx} ${cy}) rotate(${rotation}) scale(${scale})`}>
      <path
        className="sj-sakura__leaf"
        d="M0,-10 C-6.2,-5 -7.2,2.5 0,12 C7.2,2.5 6.2,-5 0,-10 Z"
      />
      <path
        className="sj-sakura__leaf-vein"
        d="M0,-7 L0,8"
        fill="none"
      />
    </g>
  );
}

function Bud({ cx, cy, scale }: { cx: number; cy: number; scale: number }) {
  return (
    <g transform={`translate(${cx} ${cy}) scale(${scale})`}>
      <ellipse className="sj-sakura__bud" cx="0" cy="-1.5" rx="3.6" ry="6.2" />
      <ellipse className="sj-sakura__bud-tip" cx="0" cy="-5.8" rx="1.8" ry="2.6" />
    </g>
  );
}

type OrganLayout = {
  blossoms: Array<{ x: number; y: number; s: number; luminous: boolean }>;
  leaves: Array<{ x: number; y: number; s: number; r: number }>;
  buds: Array<{ x: number; y: number; s: number }>;
  canopyY: number;
  canopyRx: number;
  canopyRy: number;
};

function organLayout(presentation: SakuraPresentation): OrganLayout {
  const { sakura, stage } = presentation;
  const blossoms: OrganLayout["blossoms"] = [];
  const leaves: OrganLayout["leaves"] = [];
  const buds: OrganLayout["buds"] = [];

  if (stage === "seed") {
    return { blossoms, leaves, buds, canopyY: 120, canopyRx: 0, canopyRy: 0 };
  }

  const canopyY =
    stage === "sprout" ? 112 : stage === "sapling" ? 92 : stage === "young-tree" ? 78 : 70;
  const canopyRx = 22 + sakura.canopyMass * 78;
  const canopyRy = 16 + sakura.canopyMass * 52;

  for (let i = 0; i < sakura.blossomCount; i += 1) {
    const t = (i + 0.31) / Math.max(1, sakura.blossomCount);
    const angle = t * Math.PI * 2 * 2.15 + i * 0.47;
    const radial = 0.18 + (i % 7) * 0.095 + sakura.canopyMass * 0.12;
    blossoms.push({
      x: 100 + Math.cos(angle) * canopyRx * radial,
      y: canopyY + Math.sin(angle) * canopyRy * radial * 0.88,
      s: 0.62 + sakura.blossomDensity * 0.55 + (i % 4) * 0.07,
      luminous: sakura.luminosity > 0.18 && i % 4 === 0,
    });
  }

  for (let i = 0; i < sakura.leafCount; i += 1) {
    const t = (i + 0.18) / Math.max(1, sakura.leafCount);
    const angle = t * Math.PI * 2 * 1.55 + 0.9;
    const radial = 0.32 + (i % 5) * 0.11;
    leaves.push({
      x: 100 + Math.cos(angle) * canopyRx * radial * 0.95,
      y: canopyY + 8 + Math.sin(angle) * canopyRy * radial * 0.82,
      s: 0.5 + sakura.leafDensity * 0.4,
      r: (i * 41 + 12) % 360,
    });
  }

  for (let i = 0; i < sakura.budCount; i += 1) {
    const t = (i + 0.42) / Math.max(1, sakura.budCount);
    const angle = t * Math.PI * 2 * 1.8 + 1.3;
    const radial = 0.38 + (i % 4) * 0.12;
    buds.push({
      x: 100 + Math.cos(angle) * canopyRx * radial * 0.9,
      y: canopyY - 2 + Math.sin(angle) * canopyRy * radial * 0.78,
      s: 0.55 + sakura.budDensity * 0.4,
    });
  }

  return { blossoms, leaves, buds, canopyY, canopyRx, canopyRy };
}

/** Filled character trunk — not technical stroke sticks. */
function Trunk({
  stage,
  weight,
}: {
  stage: SakuraPresentation["stage"];
  weight: number;
}) {
  const w = 5 + weight * 14;
  if (stage === "seed") return null;

  if (stage === "sprout") {
    return (
      <g className="sj-sakura__trunk-group">
        <path
          className="sj-sakura__trunk-fill"
          d={`M${100 - w * 0.28},168
              C${99 - w * 0.2},148 ${98.5 - w * 0.15},132 ${100 - w * 0.12},118
              L${100 + w * 0.12},118
              C${101.5 + w * 0.15},132 ${101 + w * 0.2},148 ${100 + w * 0.28},168 Z`}
        />
        <path
          className="sj-sakura__trunk-highlight"
          d={`M${100 - w * 0.08},165 C99,140 99.2,128 100,120`}
          fill="none"
        />
      </g>
    );
  }

  if (stage === "sapling") {
    return (
      <g className="sj-sakura__trunk-group">
        <path
          className="sj-sakura__trunk-fill"
          d={`M${100 - w * 0.42},174
              C${98 - w * 0.35},140 ${97 - w * 0.28},112 ${99 - w * 0.18},86
              L${101 + w * 0.18},86
              C${103 + w * 0.28},112 ${102 + w * 0.35},140 ${100 + w * 0.42},174 Z`}
        />
        <path
          className="sj-sakura__branch-fill"
          d={`M100,120 C88,112 78,104 68,96 L70,92 C80,100 90,108 100,114 Z`}
        />
        <path
          className="sj-sakura__branch-fill"
          d={`M100,114 C112,106 122,98 132,90 L130,86 C120,94 110,102 100,110 Z`}
        />
        <path
          className="sj-sakura__trunk-highlight"
          d={`M${100 - w * 0.12},170 C98.5,130 99,100 100,88`}
          fill="none"
        />
      </g>
    );
  }

  // young / established / mature — full character tree
  const crownLift = stage === "mature" ? 42 : stage === "established" ? 48 : 56;
  return (
    <g className="sj-sakura__trunk-group">
      <path
        className="sj-sakura__trunk-fill"
        d={`M${100 - w * 0.5},178
            C${96 - w * 0.42},130 ${95 - w * 0.32},95 ${98 - w * 0.2},${crownLift}
            L${102 + w * 0.2},${crownLift}
            C${105 + w * 0.32},95 ${104 + w * 0.42},130 ${100 + w * 0.5},178 Z`}
      />
      <path
        className="sj-sakura__branch-fill"
        d="M100,108 C78,96 58,84 40,72 L43,68 C61,80 81,92 100,102 Z"
      />
      <path
        className="sj-sakura__branch-fill"
        d="M100,104 C122,92 142,80 160,68 L157,64 C139,76 119,88 100,98 Z"
      />
      <path
        className="sj-sakura__branch-fill"
        d="M100,86 C88,74 78,64 68,54 L71,51 C81,61 91,71 100,82 Z"
      />
      <path
        className="sj-sakura__branch-fill"
        d="M100,82 C112,70 122,60 132,50 L129,47 C119,57 109,67 100,78 Z"
      />
      {(stage === "established" || stage === "mature") && (
        <>
          <path
            className="sj-sakura__branch-fill"
            d="M100,70 C92,60 86,52 80,44 L83,42 C89,50 95,58 100,68 Z"
          />
          <path
            className="sj-sakura__branch-fill"
            d="M100,68 C108,58 114,50 120,42 L117,40 C111,48 105,56 100,66 Z"
          />
        </>
      )}
      <path
        className="sj-sakura__trunk-highlight"
        d={`M${100 - w * 0.14},174 C97,120 98,80 100,${crownLift + 6}`}
        fill="none"
      />
    </g>
  );
}

function canopyClouds(
  presentation: SakuraPresentation,
  layout: OrganLayout,
): Array<{ cx: number; cy: number; rx: number; ry: number; o: number }> {
  const { stage, sakura } = presentation;
  if (stage === "seed") return [];
  const { canopyY, canopyRx, canopyRy } = layout;
  const m = sakura.canopyMass;
  const clouds = [
    { cx: 100, cy: canopyY, rx: canopyRx * 0.72, ry: canopyRy * 0.78, o: 0.55 + m * 0.3 },
    { cx: 100 - canopyRx * 0.38, cy: canopyY + 6, rx: canopyRx * 0.48, ry: canopyRy * 0.55, o: 0.42 + m * 0.25 },
    { cx: 100 + canopyRx * 0.4, cy: canopyY + 4, rx: canopyRx * 0.5, ry: canopyRy * 0.58, o: 0.44 + m * 0.25 },
  ];
  if (stage !== "sprout") {
    clouds.push({
      cx: 100,
      cy: canopyY - canopyRy * 0.35,
      rx: canopyRx * 0.55,
      ry: canopyRy * 0.45,
      o: 0.4 + m * 0.28,
    });
  }
  if (stage === "established" || stage === "mature") {
    clouds.push(
      {
        cx: 100 - canopyRx * 0.55,
        cy: canopyY + canopyRy * 0.25,
        rx: canopyRx * 0.38,
        ry: canopyRy * 0.4,
        o: 0.38 + m * 0.2,
      },
      {
        cx: 100 + canopyRx * 0.58,
        cy: canopyY + canopyRy * 0.22,
        rx: canopyRx * 0.4,
        ry: canopyRy * 0.42,
        o: 0.38 + m * 0.2,
      },
    );
  }
  return clouds;
}

function SeedCharacter() {
  return (
    <g className="sj-sakura__seed-group">
      <ellipse className="sj-sakura__seed-shadow" cx="100" cy="172" rx="16" ry="4.5" />
      <ellipse className="sj-sakura__seed" cx="100" cy="158" rx="13" ry="10" />
      <ellipse className="sj-sakura__seed-shine" cx="96" cy="154" rx="4.5" ry="3.2" />
      <path
        className="sj-sakura__seed-crease"
        d="M92,156 Q100,164 108,156"
        fill="none"
      />
      {/* Tiny hopeful tip — character personality */}
      <path
        className="sj-sakura__seed-hope"
        d="M100,148 C99,144 99.2,141 100,138 C100.8,141 101,144 100,148 Z"
      />
    </g>
  );
}

export function IllustratedSakura({
  snapshot,
  growthDelta,
  revealPhase = "idle",
  weatherKind = "still",
  reducedMotion = false,
  selectedEntryId = null,
  onSelectEntry,
  className,
  presentation: presentationOverride,
  morphIntent: morphIntentOverride,
  size = "hero",
}: IllustratedSakuraProps) {
  const uid = useId().replace(/:/g, "");
  const soilId = `sj-soil-${uid}`;
  const canopyId = `sj-canopy-${uid}`;
  const glowId = `sj-glow-${uid}`;
  const softId = `sj-soft-${uid}`;

  const presentation = useMemo(() => {
    if (presentationOverride) return presentationOverride;
    if (growthDelta && revealPhase === "before") {
      return presentationAtSequence(snapshot, growthDelta.previousSequence);
    }
    if (growthDelta && revealPhase === "after") {
      return presentationAtSequence(snapshot, growthDelta.nextSequence);
    }
    return presentSakura(snapshot);
  }, [growthDelta, presentationOverride, revealPhase, snapshot]);

  const morphIntent = useMemo(() => {
    if (morphIntentOverride) return morphIntentOverride;
    if (growthDelta) return morphIntentForReveal(snapshot, growthDelta);
    return "micro" as MorphIntent;
  }, [growthDelta, morphIntentOverride, snapshot]);

  const organs = useMemo(() => organLayout(presentation), [presentation]);
  const clouds = useMemo(
    () => canopyClouds(presentation, organs),
    [organs, presentation],
  );
  const { stage, sakura } = presentation;

  return (
    <div
      className={[
        "sj-illustrated-sakura",
        `sj-illustrated-sakura--${size}`,
        className,
        reducedMotion ? "sj-illustrated-sakura--reduced" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-stage={stage}
      data-weather={weatherKind}
      data-morph={growthDelta ? morphIntent : undefined}
      data-reveal={revealPhase !== "idle" ? revealPhase : undefined}
      data-luminous={sakura.luminosity > 0.15 || undefined}
      data-presence={sakura.presence > 0.9 ? "full" : "soft"}
      style={
        {
          "--sakura-trunk": String(sakura.trunkWeight),
          "--sakura-canopy": String(sakura.canopyMass),
          "--sakura-blossom": String(sakura.blossomDensity),
          "--sakura-bud": String(sakura.budDensity),
          "--sakura-leaf": String(sakura.leafDensity),
          "--sakura-petal-fall": String(sakura.petalFall),
          "--sakura-luminosity": String(sakura.luminosity),
          "--sakura-height": String(sakura.heightScale),
          "--sakura-presence": String(sakura.presence),
        } as CSSProperties
      }
      role="img"
      aria-hidden="true"
    >
      <div className="sj-illustrated-sakura__aura" aria-hidden="true" />
      <svg
        className="sj-illustrated-sakura__svg"
        viewBox="0 0 200 200"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id={soilId} cx="50%" cy="35%" r="65%">
            <stop offset="0%" stopColor="var(--sj-color-soil)" stopOpacity="0.98" />
            <stop
              offset="70%"
              stopColor="var(--sj-color-garden-ground)"
              stopOpacity="0.55"
            />
            <stop
              offset="100%"
              stopColor="var(--sj-color-garden-ground)"
              stopOpacity="0.05"
            />
          </radialGradient>
          <radialGradient id={canopyId} cx="45%" cy="40%" r="70%">
            <stop
              offset="0%"
              stopColor="var(--sj-color-blossom-light)"
              stopOpacity="0.98"
            />
            <stop
              offset="48%"
              stopColor="var(--sj-color-blossom)"
              stopOpacity="0.82"
            />
            <stop
              offset="100%"
              stopColor="var(--sj-color-blossom-shadow)"
              stopOpacity="0.28"
            />
          </radialGradient>
          <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
            <stop
              offset="0%"
              stopColor="var(--sj-color-blossom-light)"
              stopOpacity="0.7"
            />
            <stop
              offset="100%"
              stopColor="var(--sj-color-blossom)"
              stopOpacity="0"
            />
          </radialGradient>
          <filter id={softId} x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="1.6" />
          </filter>
        </defs>

        {/* Soft ground disc */}
        <ellipse
          className="sj-sakura__soil"
          cx="100"
          cy="180"
          rx={42 + sakura.trunkWeight * 22 + sakura.presence * 8}
          ry={9 + sakura.trunkWeight * 5}
          fill={`url(#${soilId})`}
        />
        <ellipse
          className="sj-sakura__soil-rim"
          cx="100"
          cy="180"
          rx={34 + sakura.trunkWeight * 16}
          ry={3.2}
        />

        {stage === "seed" ? <SeedCharacter /> : null}

        {/* Pink canopy mass behind structure */}
        <g className="sj-sakura__canopy" filter={`url(#${softId})`}>
          {clouds.map((cloud, index) => (
            <ellipse
              key={`cloud-${index}`}
              className="sj-sakura__canopy-mass"
              cx={cloud.cx}
              cy={cloud.cy}
              rx={cloud.rx}
              ry={cloud.ry}
              fill={`url(#${canopyId})`}
              opacity={cloud.o * (0.55 + sakura.blossomDensity * 0.45)}
            />
          ))}
        </g>

        <Trunk stage={stage} weight={sakura.trunkWeight} />

        {/* Leaves secondary */}
        <g
          className="sj-sakura__leaves"
          opacity={0.5 + sakura.leafDensity * 0.4}
        >
          {organs.leaves.map((leaf, index) => (
            <Leaf
              key={`leaf-${index}`}
              cx={leaf.x}
              cy={leaf.y}
              scale={leaf.s}
              rotation={leaf.r}
            />
          ))}
        </g>

        <g className="sj-sakura__buds">
          {organs.buds.map((bud, index) => (
            <Bud key={`bud-${index}`} cx={bud.x} cy={bud.y} scale={bud.s} />
          ))}
        </g>

        <g className="sj-sakura__blossoms">
          {organs.blossoms.map((blossom, index) => (
            <FivePetalBlossom
              key={`blossom-${index}`}
              cx={blossom.x}
              cy={blossom.y}
              scale={blossom.s}
              luminous={blossom.luminous}
              soft={index % 3 === 0}
            />
          ))}
        </g>

        {/* Memory hotspots — interactive blossom markers */}
        {presentation.memoryMarkers.map((marker) => {
          const px = 38 + marker.x * 124;
          const py = 36 + marker.y * 96;
          const selected = selectedEntryId === marker.entryId;
          return (
            <g
              key={marker.eventId}
              className={
                selected
                  ? "sj-sakura__marker sj-sakura__marker--selected"
                  : "sj-sakura__marker"
              }
              transform={`translate(${px} ${py})`}
            >
              {onSelectEntry ? (
                <circle
                  r="11"
                  className="sj-sakura__marker-hit"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectEntry(marker.entryId);
                  }}
                />
              ) : null}
              {marker.form === "luminous-blossom" ||
              marker.form === "blossom" ? (
                <FivePetalBlossom
                  cx={0}
                  cy={0}
                  scale={marker.form === "luminous-blossom" ? 0.82 : 0.66}
                  luminous={marker.form === "luminous-blossom"}
                />
              ) : marker.form === "bud" ? (
                <Bud cx={0} cy={0} scale={0.78} />
              ) : (
                <Leaf cx={0} cy={0} scale={0.62} rotation={-18} />
              )}
            </g>
          );
        })}

        {/* Ambient petal fall */}
        {sakura.petalFall > 0.05
          ? Array.from({ length: Math.round(4 + sakura.petalFall * 12) }).map(
              (_, index) => (
                <ellipse
                  key={`petal-${index}`}
                  className="sj-sakura__falling-petal"
                  cx={42 + ((index * 41) % 116)}
                  cy={28 + ((index * 29) % 100)}
                  rx="2.4"
                  ry="3.6"
                  style={{ animationDelay: `${(index % 8) * 0.42}s` }}
                />
              ),
            )
          : null}

        {/* Celebration burst ring (CSS-driven when morphing) */}
        <circle
          className="sj-sakura__burst-ring"
          cx="100"
          cy={organs.canopyY || 100}
          r="28"
          fill={`url(#${glowId})`}
        />
      </svg>
    </div>
  );
}

export default IllustratedSakura;
