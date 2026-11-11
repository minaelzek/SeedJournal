"use client";

import * as THREE from "three";
import { useEffect, useRef, useState } from "react";
import {
  configureSakuraTreeRenderer,
  createSakuraTreeEnvironment,
  createSakuraTreeInspectControls,
  createSakuraTreeLookDevLights,
} from "@/.img2threejs/generated/createSakuraTreeModel.form";
import { createGrowthSakuraModel } from "@/features/garden/img2threejs/growthSakuraModel";

export default function SakuraReconstructionPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState("Preparing form refinement…");
  const [cleanReview, setCleanReview] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const searchParams = new URLSearchParams(window.location.search);
    const unlitReview = searchParams.has("unlit");
    const staticReview = searchParams.has("static");
    const manualReview = searchParams.has("manual");
    const referenceReview = searchParams.has("reference");
    setCleanReview(searchParams.has("clean"));

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f1e8df");

    const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 80);
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    configureSakuraTreeRenderer(renderer);
    renderer.toneMappingExposure = 0.9;

    const requestedUnits = Number(searchParams.get("units") ?? "192");
    const model = createGrowthSakuraModel({
      totalGrowthUnits: Number.isFinite(requestedUnits)
        ? Math.max(0, Math.floor(requestedUnits))
        : 192,
      castShadow: true,
      receiveShadow: true,
      quality: "balanced",
    });

    if (unlitReview) {
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const sourceMaterials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        const unlitMaterials = sourceMaterials.map((sourceMaterial) => {
          const color =
            "color" in sourceMaterial && sourceMaterial.color instanceof THREE.Color
              ? sourceMaterial.color.clone()
              : new THREE.Color("#9a897d");
          sourceMaterial.dispose();
          const material = new THREE.MeshBasicMaterial({ color });
          return material;
        });
        object.material = Array.isArray(object.material)
          ? unlitMaterials
          : unlitMaterials[0];
      });
    }
    scene.add(model);
    scene.environment = createSakuraTreeEnvironment(renderer);
    scene.add(createSakuraTreeLookDevLights("reference"));

    const bounds = new THREE.Box3().setFromObject(model);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 18),
      new THREE.MeshStandardMaterial({
        color: "#eadfd3",
        roughness: 0.96,
        metalness: 0,
      }),
    );
    ground.name = "Preview ground";
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = bounds.min.y - 0.035;
    ground.receiveShadow = true;
    scene.add(ground);

    const controls = createSakuraTreeInspectControls(camera, canvas);
    controls.target.copy(bounds.getCenter(new THREE.Vector3()));
    controls.minDistance = 0.65;
    controls.maxDistance = 18;
    controls.update();

    const resize = () => {
      const width = canvas.clientWidth || 1;
      const height = canvas.clientHeight || 1;
      camera.aspect = width / height;
      const target = bounds.getCenter(new THREE.Vector3());
      controls.target.copy(target);
      const stageMinimumDistance = referenceReview
        ? 0
        : requestedUnits < 12
          ? 4.5 + requestedUnits * 0.35
          : requestedUnits < 48
            ? 8.5 + ((requestedUnits - 12) / 36) * 1.5
            : requestedUnits < 96
              ? 16
              : requestedUnits < 192
                ? 18
                : 20;
      const dimensions = bounds.getSize(new THREE.Vector3());
      const verticalFov = THREE.MathUtils.degToRad(camera.fov);
      const horizontalFov = 2 * Math.atan(
        Math.tan(verticalFov / 2) * camera.aspect,
      );
      const fittedDistance =
        Math.max(
          dimensions.y / (2 * Math.tan(verticalFov / 2)),
          dimensions.x / (2 * Math.tan(horizontalFov / 2)),
        ) * (referenceReview ? 1.04 : 1.32) +
        dimensions.z * 0.5;
      const distance = Math.max(stageMinimumDistance, fittedDistance);
      const azimuth = THREE.MathUtils.degToRad(18);
      const elevation = THREE.MathUtils.degToRad(4);
      const viewDirection = new THREE.Vector3(
        Math.sin(azimuth) * Math.cos(elevation),
        Math.sin(elevation),
        Math.cos(azimuth) * Math.cos(elevation),
      );
      camera.position.copy(target).addScaledVector(viewDirection, distance);
      camera.lookAt(target);
      camera.updateProjectionMatrix();
      controls.update();
      renderer.setSize(width, height, false);
      if (staticReview) renderer.render(scene, camera);
    };

    resize();
    setStatus("Rendered · drag to orbit · scroll to zoom");

    let frame = 0;
    const renderOnControl = () => renderer.render(scene, camera);
    if (manualReview) controls.addEventListener("change", renderOnControl);
    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(render);
    };
    if (staticReview || manualReview) {
      let remainingFrames = 4;
      const renderStatic = () => {
        controls.update();
        renderer.render(scene, camera);
        remainingFrames -= 1;
        if (remainingFrames > 0) {
          frame = window.requestAnimationFrame(renderStatic);
        }
      };
      renderStatic();
    } else render();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      if (manualReview) controls.removeEventListener("change", renderOnControl);
      controls.dispose();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((material) => material.dispose());
        } else if (mesh.material) {
          mesh.material.dispose();
        }
      });
      scene.environment?.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <main className="min-h-svh overflow-hidden bg-[#f1e8df] text-[#2d322d]">
      {!cleanReview && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-5 sm:p-8">
          <div>
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.28em] text-[#846d67]">
              img2threejs / Seed Journal
            </p>
            <h1 className="mt-2 font-serif text-2xl text-[#4d403b] sm:text-3xl">
              Sakura reconstruction
            </h1>
          </div>
          <span className="rounded-full border border-[#b8898c]/40 bg-[#fffaf4]/70 px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[#875d64] backdrop-blur-sm">
            form refinement
          </span>
        </div>
      )}

      <div className="relative h-svh min-h-[34rem] w-full">
        <canvas
          ref={canvasRef}
          className="h-full w-full"
          aria-label="Interactive three-dimensional sakura tree reconstruction"
        />
        {!cleanReview && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-5 sm:p-8">
            <div className="rounded-full border border-[#9f8275]/25 bg-[#fffaf4]/70 px-4 py-2 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-[#78645c] shadow-sm backdrop-blur-sm">
              {status}
            </div>
          </div>
        )}
        {!cleanReview && (
          <aside className="absolute bottom-5 left-5 max-w-[18rem] rounded-2xl border border-[#9f8275]/20 bg-[#fffaf4]/72 p-4 shadow-sm backdrop-blur-md sm:bottom-8 sm:left-8">
            <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-[#9a716f]">
              visual review target
            </p>
            <p className="mt-2 text-sm leading-6 text-[#5e514b]">
              Broad scaffold branches, tapered faceted trunk, open canopy gaps,
              pale blossoms, and sparse copper-green leaves.
            </p>
          </aside>
        )}
      </div>
    </main>
  );
}
