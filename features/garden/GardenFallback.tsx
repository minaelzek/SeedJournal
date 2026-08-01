"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import type { TreeSnapshot } from "@/lib/contracts";
import { buildTreeTopology, sampleCubic } from "./topology";
import { readGardenMaterialPalette } from "./materials";
import { stageForGarden, usesTreeRootContact } from "./art/stage";
import { visibleBranchIndexes } from "./art/branchPresentation";
import type { TreeTopology, Vec3Tuple } from "./types";
import "./garden.css";

export interface GardenFallbackProps {
  snapshot: TreeSnapshot;
  reason?: "loading" | "unsupported" | "context-lost";
  topology?: TreeTopology;
}

function drawLeaf(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  rotation: number,
  color: string,
) {
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.scale(scale, scale);
  context.beginPath();
  context.moveTo(0, -7);
  context.bezierCurveTo(-5, -2, -5, 4, 0, 8);
  context.bezierCurveTo(5, 4, 5, -2, 0, -7);
  context.fillStyle = color;
  context.fill();
  context.strokeStyle = "rgba(220, 230, 226, .18)";
  context.lineWidth = 0.55;
  context.beginPath();
  context.moveTo(0, -6);
  context.lineTo(0, 6);
  context.stroke();
  context.restore();
}

function drawBlossom(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  color: string,
  center: string,
) {
  context.save();
  context.translate(x, y);
  context.scale(scale, scale);
  context.fillStyle = color;
  for (let index = 0; index < 5; index += 1) {
    context.save();
    context.rotate((index / 5) * Math.PI * 2);
    context.beginPath();
    context.moveTo(0, 0);
    context.bezierCurveTo(-2.8, -2, -3.5, -6.4, -1.15, -7.2);
    context.bezierCurveTo(-0.45, -7.4, -0.22, -6.35, 0, -5.85);
    context.bezierCurveTo(0.22, -6.35, 0.45, -7.4, 1.15, -7.2);
    context.bezierCurveTo(3.5, -6.4, 2.8, -2, 0, 0);
    context.fill();
    context.restore();
  }
  context.fillStyle = center;
  context.beginPath();
  context.arc(0, 0, 1.4, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawSeed(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  seed: string,
  seedHighlight: string,
  crease: string,
  ground: string,
  soilRim: string,
) {
  context.save();
  context.translate(x, y);
  context.fillStyle = ground;
  context.globalAlpha = 0.7;
  context.beginPath();
  context.ellipse(0, 13 * scale, 38 * scale, 8 * scale, 0, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = soilRim;
  context.globalAlpha = 0.58;
  context.lineWidth = Math.max(1, scale);
  context.beginPath();
  context.ellipse(0, 12 * scale, 32 * scale, 6 * scale, 0, 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = 1;
  context.rotate(-0.16);
  context.scale(scale, scale * 0.72);
  const gradient = context.createRadialGradient(-8, -8, 2, 0, 0, 30);
  gradient.addColorStop(0, seedHighlight);
  gradient.addColorStop(1, seed);
  context.fillStyle = gradient;
  context.beginPath();
  context.ellipse(0, 0, 24, 18, 0, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = crease;
  context.globalAlpha = 0.52;
  context.lineWidth = Math.max(0.65, scale * 0.58);
  context.beginPath();
  context.moveTo(4, -13);
  context.bezierCurveTo(1, -5, 5, 6, 2, 14);
  context.stroke();
  context.globalAlpha = 1;
  context.restore();
}

function rendererDescription(
  stage: string,
  branches: number,
  memories: number,
) {
  if (stage === "seed") return "Seed, resting in the earth.";
  return `${stage.replace("-", " ")} with ${branches} ${branches === 1 ? "branch" : "branches"} and ${memories} ${memories === 1 ? "memory" : "memories"}.`;
}

export function GardenFallback({
  snapshot,
  reason = "loading",
  topology: suppliedTopology,
}: GardenFallbackProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const builtTopology = useMemo(
    () => suppliedTopology ?? buildTreeTopology(snapshot),
    [snapshot, suppliedTopology],
  );
  const topology = builtTopology;
  const palette = useMemo(() => readGardenMaterialPalette(), []);
  const stage = stageForGarden(snapshot, topology);
  const memoryCount = snapshot.events.filter((event) => event.entryId).length;

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const bounds = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.round(bounds.width * pixelRatio));
      canvas.height = Math.max(1, Math.round(bounds.height * pixelRatio));
      const context = canvas.getContext("2d");
      if (!context) return;
      context.scale(pixelRatio, pixelRatio);
      context.clearRect(0, 0, bounds.width, bounds.height);

      const projection =
        topology.algorithmVersion === 2 ? topology.fallbackProjection : null;
      const allPoints: Vec3Tuple[] = projection
        ? [
            ...projection.branches.flatMap((branch) => branch.points),
            ...projection.organs.map((organ) => organ.position),
          ]
        : topology.branches.flatMap((branch) =>
            Array.from({ length: 9 }, (_, index) =>
              sampleCubic(branch, index / 8),
            ),
          );
      if (!projection) {
        topology.foliage.forEach((node) => allPoints.push(node.position));
      }
      const minX = projection
        ? 0
        : Math.min(-0.5, ...allPoints.map((point) => point[0]));
      const maxX = projection
        ? projection.viewBox[0]
        : Math.max(0.5, ...allPoints.map((point) => point[0]));
      const minY = projection
        ? 0
        : Math.min(-3, ...allPoints.map((point) => point[1]));
      const maxY = projection
        ? projection.viewBox[1]
        : Math.max(-2.25, ...allPoints.map((point) => point[1]));
      const spanX = Math.max(1, maxX - minX);
      const spanY = Math.max(1, maxY - minY);
      const scale = Math.min(
        (bounds.width * 0.84) / spanX,
        (bounds.height * 0.84) / spanY,
      );
      const centerX = (minX + maxX) * 0.5;
      const centerY = (minY + maxY) * 0.5;
      const project = ([x, y]: Vec3Tuple) => ({
        x: bounds.width * 0.5 + (x - centerX) * scale,
        y: projection
          ? bounds.height * 0.5 + (y - centerY) * scale
          : bounds.height * 0.51 - (y - centerY) * scale,
      });

      if (stage === "seed" || stage === "sprout") {
        const seedPoint =
          stage === "sprout" && projection
            ? project(projection.seed.position)
            : {
                x: bounds.width * 0.5,
                y: bounds.height * (bounds.width < 600 ? 0.64 : 0.635),
              };
        drawSeed(
          context,
          seedPoint.x,
          seedPoint.y,
          bounds.height * (bounds.width < 600 ? 0.0022 : 0.0018),
          palette.seed,
          palette.seedHighlight,
          palette.seedCrease,
          palette.ground,
          palette.soilRim,
        );
        if (stage === "seed") return;
      }

      context.lineCap = "round";
      context.lineJoin = "round";
      if (usesTreeRootContact(stage)) {
        const rootPoint = project(
          topology.branches.find((branch) => branch.parentId === null)?.start ?? [
            0,
            -2.64,
            0,
          ],
        );
        context.fillStyle = palette.ground;
        context.globalAlpha = 0.68;
        context.beginPath();
        context.ellipse(
          rootPoint.x,
          rootPoint.y + Math.max(2, scale * 0.05),
          Math.max(18, scale * 0.62),
          Math.max(4, scale * 0.16),
          0,
          0,
          Math.PI * 2,
        );
        context.fill();
        context.globalAlpha = 1;
      }
      const visibleIndices = visibleBranchIndexes(topology);
      const projectedBranches = projection
        ? projection.branches.flatMap((branch, index) =>
            visibleIndices.has(index)
              ? [
                  {
                    points: branch.points,
                    strokeWidth: branch.strokeWidth,
                  },
                ]
              : [],
          )
        : topology.branches.flatMap((branch, branchIndex) =>
            visibleIndices.has(branchIndex)
              ? [
                  {
                    points: Array.from({ length: 15 }, (_, index) =>
                      sampleCubic(branch, index / 14),
                    ),
                    strokeWidth: branch.radiusStart * 1.9,
                  },
                ]
              : [],
          );
      projectedBranches.forEach((branch) => {
        for (let segment = 0; segment < branch.points.length - 1; segment += 1) {
          const start = project(branch.points[segment]);
          const end = project(branch.points[segment + 1]);
          context.beginPath();
          context.moveTo(start.x, start.y);
          context.lineTo(end.x, end.y);
          context.strokeStyle = palette.trunk;
          context.lineWidth = Math.max(1, branch.strokeWidth * scale);
          context.stroke();
        }
      });

      const visibleFoliage = (
        projection
          ? projection.organs.map((node) => ({
              ...node,
              rotationZ: node.rotation,
            }))
          : topology.foliage.map((node) => ({
              ...node,
              rotationZ: node.rotation[2],
            }))
      ).slice(0, 850);
      visibleFoliage.forEach((node) => {
        const point = project(node.position);
        const kindBoost =
          node.kind === "blossom" || node.kind === "luminous-blossom"
            ? 1.55
            : node.kind === "bud"
              ? 1.25
              : node.kind === "leaf"
                ? 0.72
                : 1;
        const organScale = Math.max(
          0.42,
          node.scale * scale * (projection ? 0.015 : 0.036) * kindBoost,
        );
        if (node.kind === "radicle") {
          context.save();
          context.translate(point.x, point.y);
          context.rotate(node.rotationZ);
          context.strokeStyle = palette.radicle;
          context.lineWidth = Math.max(1, organScale * 1.2);
          context.lineCap = "round";
          context.beginPath();
          context.moveTo(0, -2 * organScale);
          context.bezierCurveTo(
            -2 * organScale,
            0,
            2 * organScale,
            4 * organScale,
            0,
            7 * organScale,
          );
          context.stroke();
          context.restore();
        } else if (node.kind === "seed") {
          return;
        } else if (node.kind === "leaf") {
          drawLeaf(
            context,
            point.x,
            point.y,
            organScale,
            node.rotationZ,
            palette.leaf,
          );
        } else if (node.kind === "bud") {
          context.save();
          context.translate(point.x, point.y);
          context.rotate(node.rotationZ);
          context.fillStyle = palette.bud;
          context.beginPath();
          context.ellipse(
            0,
            0,
            2.4 * organScale,
            4.6 * organScale,
            0,
            0,
            Math.PI * 2,
          );
          context.fill();
          context.restore();
        } else {
          drawBlossom(
            context,
            point.x,
            point.y,
            organScale * 0.76,
            node.kind === "luminous-blossom"
              ? palette.blossomSelected
              : palette.blossomLight,
            palette.stamen,
          );
        }
      });
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [palette, snapshot, stage, topology]);

  return (
    <div
      className="sj-garden-fallback"
      data-reason={reason}
      data-tree-stage={stage}
      role="img"
      aria-label={rendererDescription(
        stage,
        topology.branches.length,
        memoryCount,
      )}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  );
}
