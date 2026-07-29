"use client";

import type { TreeSnapshot } from "@/lib/contracts";
import { buildTreeTopology, sampleCubic } from "./topology";
import "./garden.css";

export interface GardenFallbackProps {
  snapshot: TreeSnapshot;
  reason?: "loading" | "unsupported" | "context-lost";
}

function project([x, y]: readonly [number, number, number]) {
  return {
    x: 200 + x * 42,
    y: 290 - y * 42,
  };
}

export function GardenFallback({
  snapshot,
  reason = "loading",
}: GardenFallbackProps) {
  const topology = buildTreeTopology(snapshot);
  const paths = topology.branches.map((branch) => {
    const start = project(sampleCubic(branch, 0));
    const a = project(sampleCubic(branch, 0.33));
    const b = project(sampleCubic(branch, 0.66));
    const end = project(sampleCubic(branch, 1));
    return `M ${start.x} ${start.y} C ${a.x} ${a.y}, ${b.x} ${b.y}, ${end.x} ${end.y}`;
  });

  return (
    <div className="sj-garden-fallback" data-reason={reason} aria-hidden="true">
      <svg viewBox="0 0 400 340" role="presentation">
        <defs>
          <radialGradient id="sj-moon-haze">
            <stop offset="0%" stopColor="var(--sj-color-moon)" stopOpacity=".34" />
            <stop offset="100%" stopColor="var(--sj-color-moon)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="290" cy="84" r="72" fill="url(#sj-moon-haze)" />
        <circle
          className="sj-garden-fallback__moon"
          cx="290"
          cy="84"
          r="43"
        />
        <g className="sj-garden-fallback__branches">
          {paths.map((path, index) => (
            <path
              key={topology.branches[index].id}
              d={path}
              strokeWidth={index === 0 ? 14 : 5}
            />
          ))}
        </g>
        <g className="sj-garden-fallback__foliage">
          {topology.foliage.slice(0, 130).map((node) => {
            const point = project(node.position);
            return (
              <circle
                key={node.id}
                cx={point.x}
                cy={point.y}
                r={node.kind === "leaf" ? 2.4 : 3.6}
                data-kind={node.kind}
              />
            );
          })}
        </g>
        <ellipse
          className="sj-garden-fallback__ground"
          cx="200"
          cy="310"
          rx="136"
          ry="13"
        />
      </svg>
    </div>
  );
}

