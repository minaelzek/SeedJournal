import copy
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SPEC_PATH = ROOT / "object-sculpt-spec.json"
spec = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
template = copy.deepcopy(spec["componentTree"][0])

FULL_EVIDENCE = ["full-object"]


def recipe(dominant, secondary, material_class, confidence=0.9, accent=None):
    stops = [
        {"offset": 0, "color": f"rgba({secondary[0]}, {secondary[1]}, {secondary[2]}, 1)"},
        {"offset": 0.55, "color": f"rgba({dominant[0]}, {dominant[1]}, {dominant[2]}, 1)"},
        {"offset": 1, "color": f"rgba({(accent or dominant)[0]}, {(accent or dominant)[1]}, {(accent or dominant)[2]}, 1)"},
    ]
    return {
        "materialClass": material_class,
        "materialClassConfidence": confidence,
        "dominantAlbedo": f"rgba({dominant[0]}, {dominant[1]}, {dominant[2]}, 1)",
        "secondaryAlbedo": f"rgba({secondary[0]}, {secondary[1]}, {secondary[2]}, 1)",
        "colorGradient": {"type": "linear", "axis": [0.2, 1.0], "stops": stops},
    }


def action_profile(animation_role, collider_type, fracture_group, sockets=None):
    return {
        "animationRole": animation_role,
        "pivot": {"mode": "socket" if animation_role != "root" else "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.9},
        "transformChannels": {"translate": True, "rotate": True, "scale": True, "bend": animation_role in {"root", "branch"}, "twist": animation_role == "branch", "detach": False, "visibility": True, "materialState": True},
        "sockets": sockets or [],
        "collider": {"type": collider_type, "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": False, "notes": "Simplified runtime proxy; visual geometry remains the source of fidelity."},
        "constraints": [],
        "destruction": {"breakable": fracture_group is not None, "fractureGroup": fracture_group or "static-tree", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "ground"},
    }


def feature(feature_id, description, geometry_effect, confidence=0.9):
    return {
        "id": feature_id,
        "description": description,
        "placement": "reference-derived local region",
        "approximateSize": "object-relative",
        "orientation": "follows local branch or surface frame",
        "materialEffect": "preserve reference albedo and roughness variation",
        "geometryEffect": geometry_effect,
        "confidence": confidence,
    }


def component(
    component_id,
    name,
    level,
    primitive,
    material,
    topology_class,
    topology_rationale,
    parent=None,
    transform=None,
    dimensions=None,
    geometry_descriptor=None,
    attachment=None,
    role="static-part",
    local_features=None,
    importance=0.8,
    confidence=0.85,
):
    item = copy.deepcopy(template)
    item.update(
        {
            "id": component_id,
            "name": name,
            "level": level,
            "role": role,
            "importance": importance,
            "confidence": confidence,
            "primitive": primitive,
            "topologyClass": topology_class,
            "topologyRationale": topology_rationale,
            "parent": parent,
            "attachment": attachment,
            "dimensions": dimensions or {"width": 1, "height": 1, "depth": 1, "units": "world-relative", "confidence": confidence},
            "transform": transform or {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
            "geometryDescriptor": geometry_descriptor or {"topologyIntent": topology_rationale, "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"},
            "colorMaterialRecipe": copy.deepcopy(recipe_map.get(material, recipe((138, 122, 95), (100, 90, 75), "unknown", 0.5))),
            "actionProfile": action_profile(role, "capsule" if primitive in {"tube", "cylinder"} else "box", "branch-segments" if role == "branch" else None, [{"id": "branch-tip", "localPosition": [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "child branch attachment"}] if role in {"root", "branch"} else []),
            "material": material,
            "materialLayers": [material],
            "localFeatures": local_features or [],
            "surfaceDetail": {"macroRoughness": 0.78, "microRoughness": 0.12, "bumpAmplitude": 0.04, "normalPattern": "faceted procedural variation", "displacementPattern": "none", "occlusionPattern": "contact and branch-junction AO", "edgeWearPattern": "subtle planar value shifts", "notes": "Keep the organic silhouette in geometry; use surface variation only for local response."},
            "evidenceRefs": FULL_EVIDENCE,
            "fidelityTier": level,
            "deformations": [],
            "joints": [],
            "seams": [],
        }
    )
    return item


def branch(component_id, parent, start, end, base_radius, end_radius, level="macro", material="bark", importance=0.8):
    attachment = {
        "parentId": parent,
        "parentSocket": f"{parent}:branch-tip",
        "localStart": start,
        "localEnd": end,
        "contactType": "overlap",
        "overlap": 0.06,
        "gapTolerance": 0.012,
        "baseRadius": base_radius,
        "endRadius": end_radius,
        "evidenceRefs": FULL_EVIDENCE,
    }
    descriptor = {
        "topologyIntent": "thin organic branch segment represented as a tapered attachment tube",
        "tubePath": {"points": [[0, 0, 0], [0.5, 0.5, 0], [1, 1, 0]], "radius": base_radius, "radialSegments": 8, "closed": False},
        "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1},
        "deformationStack": ["subtle deterministic axis irregularity"],
        "uvStrategy": "generated procedural coordinates",
        "normalStrategy": "flat-shaded faceted normals",
    }
    return component(component_id, component_id.replace("-", " ").title(), level, "tube", material, "fiber-strand", "The branch is a long thin organic strand with a clear 3D path and tapered attachment; tube/cylinder endpoint geometry preserves the branch network.", parent=parent, attachment=attachment, dimensions={"width": base_radius * 2, "height": max(0.1, sum((end[i] - start[i]) ** 2 for i in range(3)) ** 0.5), "depth": base_radius * 2, "units": "world-relative", "confidence": 0.86}, role="branch", local_features=[feature("branch-segment", "Tapered woody segment with a visible overlap at its parent junction.", "tapered tube segment", 0.88)], importance=importance)


def extrude_profile(points, depth):
    return {"topologyIntent": "thin faceted organic plate with a silhouette-defining profile", "profile2D": {"points": points, "depth": depth}, "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1}, "deformationStack": ["gentle cup across the plate"], "uvStrategy": "generated procedural coordinates", "normalStrategy": "flat-shaded faceted normals"}


bark = {
    "id": "bark", "name": "Faceted bark", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "qualityTier": "reference", "baseColor": "#6f5a4a", "color": "#6f5a4a",
    "albedo": {"dominant": "#6f5a4a", "secondary": ["#59483d", "#88705b", "#9b846c"], "samplingNotes": "Sampled from the visible trunk and scaffold bark planes."},
    "colorVariation": {"palette": ["#59483d", "#6f5a4a", "#88705b", "#9b846c"], "pattern": "vertical faceted grain with low-frequency planar breakup", "amplitude": 0.24, "heightCorrelation": 0.45},
    "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [2, 5], "anisotropy": 4, "texelDensityIntent": "Keep bark planes stable across trunk and branch scale."},
    "surfaceFrequencyBands": [{"id":"macro","frequency":2,"amplitude":0.42,"role":"broad bark value planes"},{"id":"meso","frequency":11,"amplitude":0.22,"role":"vertical grain and branch-junction relief"},{"id":"micro","frequency":44,"amplitude":0.07,"role":"subtle highlight breakup"}],
    "roughness": {"base": 0.84, "variation": 0.12, "map": "independent-procedural-roughness", "localResponse": "rougher in bark creases and root contact, slightly satin on raised planes"}, "metalness": {"base": 0, "variation": 0}, "normal": {"pattern":"independent faceted bark relief", "strength":0.28, "scale":18, "space":"tangent"}, "bump":{"pattern":"fine bark grain", "amplitude":0.04, "scale":32}, "displacement":{"pattern":"none", "amplitude":0, "scale":1, "silhouetteAffects":False}, "ambientOcclusion":{"cavityStrength":0.48,"contactShadowBias":0.3,"notes":"Darken branch junctions and root flare contact."}, "wear":{"edgeWear":0.05,"scratches":[],"chips":[]}, "dirt":{"amount":0.18,"cavityBias":0.4,"color":"#3d3029"}, "localOverrides":[{"id":"root-contact","region":"lower trunk and root flare","roughness":0.94,"dirtAmount":0.28,"evidenceRefs":FULL_EVIDENCE}], "notes":"Dielectric bark; no metallic response."}
petal = {
    "id": "petal", "name": "Sakura petals", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "qualityTier": "reference", "baseColor": "#f2d4d6", "color": "#f2d4d6",
    "albedo": {"dominant":"#f2d4d6","secondary":["#eab5bf","#f8e6e3","#d98fa6"],"samplingNotes":"Pale blush and near-white petal planes with a warmer pink edge variation."},
    "colorVariation": {"palette":["#d98fa6","#eab5bf","#f2d4d6","#f8e6e3"],"pattern":"cluster-local pastel variation","amplitude":0.18,"heightCorrelation":0.15},
    "textureResolution":1024,"textureProjection":{"mode":"uv","repeat":[3,3],"anisotropy":2,"texelDensityIntent":"Keep petals crisp at the reference review distance."},
    "surfaceFrequencyBands":[{"id":"macro","frequency":2,"amplitude":0.18,"role":"cluster value grouping"},{"id":"meso","frequency":7,"amplitude":0.08,"role":"petal cup variation"},{"id":"micro","frequency":24,"amplitude":0.025,"role":"soft matte highlight breakup"}],
    "roughness":{"base":0.62,"variation":0.1,"map":"independent-petal-roughness","localResponse":"slightly satin near petal centers, matte at edges"},"metalness":{"base":0,"variation":0},"normal":{"pattern":"shallow petal cup","strength":0.12,"scale":12,"space":"tangent"},"bump":{"pattern":"none","amplitude":0,"scale":1},"displacement":{"pattern":"none","amplitude":0,"scale":1,"silhouetteAffects":False},"ambientOcclusion":{"cavityStrength":0.16,"contactShadowBias":0.25,"notes":"Small AO at flower centers."},"wear":{"edgeWear":0,"scratches":[],"chips":[]},"dirt":{"amount":0,"cavityBias":0,"color":"#8e6875"},"localOverrides":[{"id":"petal-center","region":"flower center","roughness":0.48,"color":"#f5b6a4","evidenceRefs":FULL_EVIDENCE}],"notes":"Opaque thin petals; keep centers warmer without making the flower glossy."}
leaf = {
    "id":"leaf","name":"Emerging leaves","type":"standard","shaderModel":"MeshStandardMaterial / PBR approximation","qualityTier":"reference","baseColor":"#8d9069","color":"#8d9069","albedo":{"dominant":"#8d9069","secondary":["#727852","#ad9a63","#69774e"],"samplingNotes":"Sparse copper-green young leaves appear around blossom tips."},"colorVariation":{"palette":["#69774e","#727852","#8d9069","#ad9a63"],"pattern":"per-leaf seasonal variation","amplitude":0.2,"heightCorrelation":0.2},"textureResolution":1024,"textureProjection":{"mode":"uv","repeat":[2,2],"anisotropy":2,"texelDensityIntent":"Keep pointed leaf silhouettes stable."},"surfaceFrequencyBands":[{"id":"macro","frequency":2,"amplitude":0.18,"role":"leaf color family"},{"id":"meso","frequency":6,"amplitude":0.09,"role":"central vein plane"},{"id":"micro","frequency":18,"amplitude":0.03,"role":"matte leaf breakup"}],"roughness":{"base":0.72,"variation":0.12,"map":"independent-leaf-roughness","localResponse":"slightly satin along the central vein"},"metalness":{"base":0,"variation":0},"normal":{"pattern":"central leaf vein","strength":0.14,"scale":10,"space":"tangent"},"bump":{"pattern":"none","amplitude":0,"scale":1},"displacement":{"pattern":"none","amplitude":0,"scale":1,"silhouetteAffects":False},"ambientOcclusion":{"cavityStrength":0.12,"contactShadowBias":0.2,"notes":"Low AO; leaves are thin and open."},"wear":{"edgeWear":0,"scratches":[],"chips":[]},"dirt":{"amount":0.02,"cavityBias":0.05,"color":"#4d583c"},"localOverrides":[{"id":"copper-emergence","region":"new spring leaves","color":"#ad9a63","roughness":0.68,"evidenceRefs":FULL_EVIDENCE}],"notes":"Young leaves are sparse accents, not a dense green canopy."}
ground = {
    "id":"ground","name":"Ground and fallen petals","type":"standard","shaderModel":"MeshStandardMaterial / PBR approximation","qualityTier":"reference","baseColor":"#eadfd3","color":"#eadfd3","albedo":{"dominant":"#eadfd3","secondary":["#f5eee7","#d9c7bd"],"samplingNotes":"Warm ivory background and sparse detached petals."},"colorVariation":{"palette":["#d9c7bd","#eadfd3","#f5eee7"],"pattern":"soft warm neutral field","amplitude":0.08,"heightCorrelation":0},"textureResolution":1024,"textureProjection":{"mode":"uv","repeat":[1,1],"anisotropy":1,"texelDensityIntent":"Keep ground neutral and free of visible tiling."},"surfaceFrequencyBands":[{"id":"macro","frequency":1,"amplitude":0.05,"role":"warm background field"},{"id":"meso","frequency":3,"amplitude":0.025,"role":"soft ground breakup"},{"id":"micro","frequency":8,"amplitude":0.01,"role":"minimal matte noise"}],"roughness":{"base":0.94,"variation":0.04,"map":"independent-ground-roughness","localResponse":"matte background with slightly darker contact region"},"metalness":{"base":0,"variation":0},"normal":{"pattern":"none","strength":0,"scale":1,"space":"tangent"},"bump":{"pattern":"none","amplitude":0,"scale":1},"displacement":{"pattern":"none","amplitude":0,"scale":1,"silhouetteAffects":False},"ambientOcclusion":{"cavityStrength":0.22,"contactShadowBias":0.22,"notes":"Subtle contact shadow below root flare."},"wear":{"edgeWear":0,"scratches":[],"chips":[]},"dirt":{"amount":0.02,"cavityBias":0.1,"color":"#b9a59b"},"localOverrides":[{"id":"petal-ground-accent","region":"sparse fallen petals around roots","color":"#eab5bf","roughness":0.82,"evidenceRefs":FULL_EVIDENCE}],"notes":"A neutral presentation field; no scene clutter."}

spec["scores"] = {"object_isolation": 3, "silhouette_readability": 3, "depth_inference": 2, "primitive_decomposition": 3, "material_procedurality": 3, "occlusion_risk": 2, "interaction_fit": 3}
spec["preSpecAssessment"]["complexity"]["scores"] = {"silhouetteComplexity": 3, "componentCount": 3, "hierarchyDepth": 3, "repetitionDensity": 3, "materialLayerCount": 3, "localDetailDensity": 3, "occlusionRisk": 2, "actionReadinessNeed": 3}
spec["preSpecAssessment"]["unknownsToResolveBeforeImplementation"] = []
detail_kind_map = {"form-and-material":"contour", "attachment":"contour", "structure":"contour", "repetition":"ridge", "silhouette":"contour", "botanical-detail":"contour", "ground-accent":"contour"}
for detail in spec["preSpecAssessment"]["detailInventory"]["details"]:
    detail["kind"] = detail_kind_map.get(detail.get("kind"), "contour")
spec["coordinateFrame"] = {"front":"camera-facing side in the reference image", "up":"image up direction", "scaleReference":"tree height = 6 world units", "axes":{"x":"lateral branch spread", "y":"trunk vertical", "z":"front/back depth inferred from branch overlap"}}
spec["silhouette"] = {"boundingShape":"broad spreading rounded-to-vase crown over a tapered trunk and root flare", "aspectRatios":[{"name":"tree height to crown width","value":1.0,"confidence":0.9},{"name":"trunk base to total height","value":0.12,"confidence":0.8}], "symmetry":"asymmetric with approximate bilateral spread but no radial repetition", "dominantCurves":["tapered trunk axis","arching primary scaffolds","alternating lateral branches","fine twiglet perimeter"], "negativeSpaces":["open V between primary scaffolds","gaps around visible trunk fork","small voids between blossom groups"], "landmarks":["root flare at lower center","five primary scaffold origins","highest blossom tips near upper third"]}
reference_pbr = {
    "bark": {"version":"1.0","sourceImage":"detail-crops/zone-r2c1.png","extractor":"forge/stage1_intake/extract_pbr_evidence.py","method":"single-image pixel evidence extraction","verdict":"pass-with-limit","hardLimit":"Single-view stylized inference; maps are evidence, not inverse-rendered truth.","usable":False,"confidence":0.86,"estimatedFidelity":0.86,"targetThreshold":0.7,"maps":{"albedo":{"path":"pbr/bark/bark_albedo.png"},"roughness":{"path":"pbr/bark/bark_roughness.png"},"height":{"path":"pbr/bark/bark_height.png"},"normal":{"path":"pbr/bark/bark_normal.png"},"ao":{"path":"pbr/bark/bark_ao.png"}}},
    "petal": {"version":"1.0","sourceImage":"detail-crops/zone-r0c1.png","extractor":"forge/stage1_intake/extract_pbr_evidence.py","method":"single-image pixel evidence extraction","verdict":"pass-with-limit","hardLimit":"Single-view stylized inference; maps are evidence, not inverse-rendered truth.","usable":False,"confidence":0.86,"estimatedFidelity":0.86,"targetThreshold":0.7,"maps":{"albedo":{"path":"pbr/petal/petal_albedo.png"},"roughness":{"path":"pbr/petal/petal_roughness.png"},"height":{"path":"pbr/petal/petal_height.png"},"normal":{"path":"pbr/petal/petal_normal.png"},"ao":{"path":"pbr/petal/petal_ao.png"}}},
    "leaf": {"version":"1.0","sourceImage":"detail-crops/zone-r0c0.png","extractor":"forge/stage1_intake/extract_pbr_evidence.py","method":"single-image pixel evidence extraction","verdict":"pass-with-limit","hardLimit":"Leaf pixels are sparse in the reference crop; runtime uses the authored copper-green palette.","usable":False,"confidence":0.86,"estimatedFidelity":0.86,"targetThreshold":0.7,"maps":{"albedo":{"path":"pbr/leaf/leaf_albedo.png"},"roughness":{"path":"pbr/leaf/leaf_roughness.png"},"height":{"path":"pbr/leaf/leaf_height.png"},"normal":{"path":"pbr/leaf/leaf_normal.png"},"ao":{"path":"pbr/leaf/leaf_ao.png"}}},
    "ground": {"version":"1.0","sourceImage":"detail-crops/zone-r2c0.png","extractor":"forge/stage1_intake/extract_pbr_evidence.py","method":"single-image pixel evidence extraction","verdict":"pass-with-limit","hardLimit":"Ground crop is presentation evidence; runtime keeps the field neutral and matte.","usable":False,"confidence":0.86,"estimatedFidelity":0.86,"targetThreshold":0.7,"maps":{"albedo":{"path":"pbr/ground/ground_albedo.png"},"roughness":{"path":"pbr/ground/ground_roughness.png"},"height":{"path":"pbr/ground/ground_height.png"},"normal":{"path":"pbr/ground/ground_normal.png"},"ao":{"path":"pbr/ground/ground_ao.png"}}},
}
bark["referencePbr"] = reference_pbr["bark"]
petal["referencePbr"] = reference_pbr["petal"]
leaf["referencePbr"] = reference_pbr["leaf"]
ground["referencePbr"] = reference_pbr["ground"]
recipe_map = {
    "bark": recipe((111, 90, 74), (89, 72, 61), "wood", 0.95, (149, 126, 104)),
    "petal": recipe((242, 212, 214), (218, 181, 191), "unknown", 0.91, (248, 230, 227)),
    "leaf": recipe((141, 144, 105), (114, 120, 82), "unknown", 0.84, (173, 154, 99)),
    "ground": recipe((234, 223, 211), (217, 199, 189), "unknown", 0.86, (245, 238, 231)),
}

components = []
root = component("root", "Trunk", "macro", "tube", "bark", "continuous-sculpt", "The trunk is one continuous organic volume with a curved tapering path; a tube path preserves 3D curvature better than a primitive cylinder.", transform={"position":[0,-3.0,0],"rotation":[0,0,0],"scale":[1,1,1]}, dimensions={"width":1.3,"height":3.6,"depth":1.1,"units":"world-relative","confidence":0.96}, geometry_descriptor={"topologyIntent":"curved tapered trunk with faceted tube rings","tubePath":{"points":[[0,0,0],[0.04,0.7,0],[-0.08,1.5,0.02],[0.08,2.4,0.0],[-0.02,3.4,0.0]],"radius":0.38,"radialSegments":8,"closed":False},"edgeTreatment":{"type":"none","bevelRadius":0,"segments":1},"deformationStack":["root flare transition","deterministic bark plane variation"],"uvStrategy":"generated procedural coordinates","normalStrategy":"flat-shaded faceted normals"}, role="root", local_features=[feature("trunk","Tapered multi-ring trunk with visible faceted bark planes.","curved volume and planar bark shading",0.96),feature("canopy-voids","Open gaps remain readable through the scaffold network.","preserve negative-space silhouette",0.93)], importance=1.0, confidence=0.96)
components.append(root)
components.append(component("root-flare", "Buttress mass", "macro", "ellipsoid", "bark", "continuous-sculpt", "The root flare is a continuous organic swell at the trunk base, represented by an ellipsoid rather than a box or cylinder.", parent="root", transform={"position":[0,0.06,0],"rotation":[0,0,0],"scale":[1.65,0.46,1.1]}, dimensions={"width":1.7,"height":0.55,"depth":1.2,"units":"world-relative","confidence":0.84}, role="base-accent", local_features=[feature("root-flare","Angular buttress-like roots contact the ground at the trunk base.","lower silhouette and ground contact",0.88)], importance=0.82, confidence=0.84))

primary = [
    ("primary-left",[-0.05,2.45,0.0],[-2.25,3.55,0.08],0.25,0.12),
    ("primary-right",[0.05,2.5,-0.02],[2.25,3.53,-0.02],0.25,0.12),
    ("primary-top",[0.0,3.15,0.03],[0.42,5.05,-0.04],0.23,0.095),
    ("primary-mid-left",[-0.03,2.2,0.03],[-1.65,2.98,-0.06],0.21,0.105),
    ("primary-mid-right",[0.03,2.25,0.0],[1.65,3.01,0.05],0.21,0.105),
]
for args in primary:
    components.append(branch(args[0], "root", args[1], args[2], args[3], args[4], "macro", importance=0.92))
components[2]["localFeatures"].append(feature("primary-scaffolds","Broad arching primary scaffolds create the spreading crown.","macro silhouette and branch hierarchy",0.95))

secondaries = [
    ("secondary-left-low","primary-left",[0.0,0.62,0.0],[-0.85,1.18,0.05],0.12,0.06),
    ("secondary-left-high","primary-left",[0.05,1.32,0.02],[-0.65,1.98,-0.06],0.11,0.05),
    ("secondary-left-outer","primary-left",[0.0,1.92,0.0],[-0.98,2.42,0.08],0.105,0.045),
    ("secondary-left-inner","primary-left",[0.15,0.94,0.02],[-0.45,1.55,-0.04],0.095,0.04),
    ("secondary-right-low","primary-right",[0.0,0.62,0.0],[0.85,1.18,0.04],0.12,0.06),
    ("secondary-right-high","primary-right",[0.05,1.32,-0.02],[0.65,1.98,0.02],0.11,0.05),
    ("secondary-right-outer","primary-right",[0.0,1.92,0.0],[0.98,2.42,0.08],0.105,0.045),
    ("secondary-right-inner","primary-right",[0.15,0.94,-0.02],[0.45,1.55,-0.04],0.095,0.04),
    ("secondary-top-left","primary-top",[0.0,0.45,0.0],[-0.72,1.08,0.05],0.105,0.045),
    ("secondary-top-right","primary-top",[0.0,0.92,0.0],[0.72,1.58,-0.02],0.105,0.045),
    ("secondary-top-left-outer","primary-top",[0.0,0.78,0.0],[-0.92,1.38,0.06],0.09,0.038),
    ("secondary-top-right-outer","primary-top",[0.0,1.18,0.0],[0.94,1.72,-0.04],0.09,0.038),
    ("secondary-mid-left","primary-mid-left",[0.0,0.45,0.0],[-0.72,0.96,0.02],0.1,0.045),
    ("secondary-mid-right","primary-mid-right",[0.0,0.45,0.0],[0.72,0.96,-0.02],0.1,0.045),
    ("secondary-mid-left-outer","primary-mid-left",[0.0,1.0,0.0],[-0.92,1.48,0.05],0.09,0.038),
    ("secondary-mid-right-outer","primary-mid-right",[0.0,1.0,0.0],[0.92,1.48,-0.05],0.09,0.038),
]
for args in secondaries:
    components.append(branch(args[0], args[1], args[2], args[3], args[4], args[5], "meso", importance=0.78))
components[6]["localFeatures"].append(feature("secondary-branches","Secondary branches alternate along the primary scaffolds with varied angles.","meso branch rhythm",0.9))

twig_specs = [
    ("twig-left-low-a","secondary-left-low",[0.0,0.3,0.0],[-0.36,0.56,0.03]),
    ("twig-left-low-b","secondary-left-low",[0.0,0.7,0.0],[0.18,0.94,-0.03]),
    ("twig-left-high-a","secondary-left-high",[0.0,0.34,0.0],[-0.3,0.62,0.05]),
    ("twig-left-outer-a","secondary-left-outer",[0.0,0.34,0.0],[-0.4,0.6,0.04]),
    ("twig-left-outer-b","secondary-left-outer",[0.0,0.76,0.0],[0.18,1.04,-0.03]),
    ("twig-left-inner-a","secondary-left-inner",[0.0,0.3,0.0],[-0.3,0.58,0.04]),
    ("twig-right-low-a","secondary-right-low",[0.0,0.3,0.0],[0.36,0.56,0.03]),
    ("twig-right-low-b","secondary-right-low",[0.0,0.7,0.0],[-0.18,0.94,-0.03]),
    ("twig-right-high-a","secondary-right-high",[0.0,0.34,0.0],[0.3,0.62,0.04]),
    ("twig-right-outer-a","secondary-right-outer",[0.0,0.34,0.0],[0.4,0.6,0.04]),
    ("twig-right-outer-b","secondary-right-outer",[0.0,0.76,0.0],[-0.18,1.04,-0.03]),
    ("twig-right-inner-a","secondary-right-inner",[0.0,0.3,0.0],[0.3,0.58,-0.04]),
    ("twig-top-left-a","secondary-top-left",[0.0,0.25,0.0],[-0.34,0.56,0.02]),
    ("twig-top-right-a","secondary-top-right",[0.0,0.3,0.0],[0.34,0.62,-0.02]),
    ("twig-top-left-outer-a","secondary-top-left-outer",[0.0,0.32,0.0],[-0.36,0.62,0.03]),
    ("twig-top-right-outer-a","secondary-top-right-outer",[0.0,0.34,0.0],[0.36,0.64,-0.03]),
    ("twig-mid-left-a","secondary-mid-left",[0.0,0.25,0.0],[-0.32,0.52,0.04]),
    ("twig-mid-right-a","secondary-mid-right",[0.0,0.25,0.0],[0.32,0.54,-0.04]),
    ("twig-mid-left-outer-a","secondary-mid-left-outer",[0.0,0.28,0.0],[-0.36,0.56,0.03]),
    ("twig-mid-right-outer-a","secondary-mid-right-outer",[0.0,0.28,0.0],[0.36,0.56,-0.03]),
]
for args in twig_specs:
    components.append(branch(args[0], args[1], args[2], args[3], 0.055, 0.022, "micro", importance=0.62))
components[-1]["localFeatures"].append(feature("twiglets","Fine terminal twiglets carry the smallest repeated botanical details.","micro edge silhouette and attachment points",0.87))

flower_profile = [[0,-0.24],[0.065,-0.089],[0.228,-0.074],[0.105,0.034],[0.141,0.194],[0,0.11],[-0.141,0.194],[-0.105,0.034],[-0.228,-0.074],[-0.065,-0.089]]
leaf_profile = [[0,-0.25],[-0.13,-0.03],[-0.06,0.22],[0,0.3],[0.06,0.22],[0.13,-0.03]]
flower_index = 0
leaf_index = 0
for twig_id, position in [
    ("twig-left-low-a",[-0.04,0.25,0.06]),("twig-left-low-b",[0.04,0.24,-0.03]),("twig-left-high-a",[-0.03,0.26,0.04]),
    ("twig-left-outer-a",[-0.04,0.27,0.04]),("twig-left-outer-b",[0.04,0.25,-0.03]),("twig-left-inner-a",[-0.03,0.25,0.04]),
    ("twig-right-low-a",[0.04,0.25,0.05]),("twig-right-low-b",[-0.04,0.24,-0.02]),("twig-right-high-a",[0.03,0.26,0.03]),
    ("twig-right-outer-a",[0.04,0.27,0.04]),("twig-right-outer-b",[-0.04,0.25,-0.03]),("twig-right-inner-a",[0.03,0.25,-0.04]),
    ("twig-top-left-a",[-0.03,0.25,0.02]),("twig-top-right-a",[0.03,0.25,-0.02]),("twig-top-left-outer-a",[-0.04,0.26,0.03]),("twig-top-right-outer-a",[0.04,0.26,-0.03]),
    ("twig-mid-left-a",[-0.03,0.23,0.03]),("twig-mid-right-a",[0.03,0.23,-0.03]),("twig-mid-left-outer-a",[-0.04,0.24,0.03]),("twig-mid-right-outer-a",[0.04,0.24,-0.03]),
]:
    components.append(component(f"flower-{flower_index}", f"Flower cluster {flower_index}", "micro", "extrude", "petal", "conforming-shell", "A thin petal surface follows a small blossom form; the flower is a readable shell rather than a spherical mass.", parent=twig_id, transform={"position":position,"rotation":[0.2,flower_index*0.47,flower_index*0.31],"scale":[0.92,0.92,0.92]}, dimensions={"width":0.34,"height":0.42,"depth":0.06,"units":"world-relative","confidence":0.86}, geometry_descriptor=extrude_profile(flower_profile,0.045), role="flower-cluster", local_features=[feature("blossom-clusters","Individual five-petal flowers appear in loose clusters along twig tips.","micro blossom geometry and petal palette",0.91)], importance=0.58, confidence=0.86))
    flower_index += 1
    secondary_position = [position[0] * 0.56, position[1] + 0.13, position[2] - 0.04]
    components.append(component(f"flower-{flower_index}", f"Flower cluster {flower_index}", "micro", "extrude", "petal", "conforming-shell", "A second offset blossom opens the terminal cluster without forming a dense spherical mass.", parent=twig_id, transform={"position":secondary_position,"rotation":[0.35,flower_index*0.61,flower_index*0.29],"scale":[0.74,0.74,0.74]}, dimensions={"width":0.34,"height":0.42,"depth":0.06,"units":"world-relative","confidence":0.84}, geometry_descriptor=extrude_profile(flower_profile,0.045), role="flower-cluster", local_features=[feature("blossom-clusters","Individual five-petal flowers appear in loose clusters along twig tips.","micro blossom geometry and petal palette",0.91)], importance=0.54, confidence=0.84))
    flower_index += 1
    tertiary_position = [position[0] * -0.45, position[1] + 0.18, position[2] + 0.06]
    components.append(component(f"flower-{flower_index}", f"Flower cluster {flower_index}", "micro", "extrude", "petal", "conforming-shell", "A smaller third blossom completes the terminal cluster while preserving visible gaps between flowers.", parent=twig_id, transform={"position":tertiary_position,"rotation":[0.5,flower_index*0.53,flower_index*0.23],"scale":[0.58,0.58,0.58]}, dimensions={"width":0.34,"height":0.42,"depth":0.06,"units":"world-relative","confidence":0.82}, geometry_descriptor=extrude_profile(flower_profile,0.045), role="flower-cluster", local_features=[feature("blossom-clusters","Individual five-petal flowers appear in loose clusters along twig tips.","micro blossom geometry and petal palette",0.91)], importance=0.48, confidence=0.82))
    flower_index += 1
    if leaf_index % 2 == 0:
        components.append(component(f"leaf-{leaf_index}", f"Leaf sprig {leaf_index}", "micro", "extrude", "leaf", "conforming-shell", "A leaf is a thin surface shell with a pointed silhouette attached near a twig tip.", parent=twig_id, transform={"position":[position[0]*0.7,position[1]*0.82,position[2]+0.05],"rotation":[0.1,leaf_index*0.63,0.35 if leaf_index%4==0 else -0.35],"scale":[0.9,0.9,0.9]}, dimensions={"width":0.26,"height":0.56,"depth":0.03,"units":"world-relative","confidence":0.82}, geometry_descriptor=extrude_profile(leaf_profile,0.018), role="leaf-sprig", local_features=[feature("leaf-sprigs","Sparse pointed copper-green leaves emerge around blossom groups.","micro leaf silhouette and seasonal color accent",0.86)], importance=0.42, confidence=0.82))
    leaf_index += 1

components.append(component("ground-petal-accents", "Fallen petal accents", "micro", "plane-card", "petal", "conforming-shell", "Detached petals are thin ground-contact shells and do not define the tree volume.", parent="root", transform={"position":[0,-0.06,0.08],"rotation":[-1.57,0,0],"scale":[0.45,0.45,0.45]}, dimensions={"width":0.3,"height":0.16,"depth":0.01,"units":"world-relative","confidence":0.8}, geometry_descriptor=extrude_profile([[0,-0.08],[0.08,0],[0,0.1],[-0.08,0]],0.01), role="ground-accent", local_features=[feature("ground-petal-accents","Sparse detached petals ground the tree without adding clutter.","small matte ground accents",0.8)], importance=0.3, confidence=0.8))

spec["componentTree"] = components
spec["repetitionSystems"] = [{"id":"ground-petal-scatter","name":"Sparse ground petals","level":"micro","parent":"root","primitive":"plane-card","material":"petal","count":18,"instanceScale":[0.08,0.02,0.12],"placement":{"mode":"radial","axis":[0,1,0],"radius":3.7,"startAngleDeg":8},"geometry":{"kind":"fallen-petal","buildsGeometry":True},"buildsGeometry":True,"realization":"instanced-geometry","evidenceRefs":FULL_EVIDENCE}]
spec["featureReviewTargets"] = [
    {"id":"blockout-scaffold-silhouette","name":"Tapered trunk, root flare, and five primary scaffolds","tier":"critical","passIds":["blockout"],"minimumScore":0.8,"mustPass":True,"componentRefs":["root","root-flare","primary-left","primary-right","primary-top","primary-mid-left","primary-mid-right"],"evidenceRefs":FULL_EVIDENCE},
    {"id":"overall-silhouette","name":"Broad spreading sakura silhouette and open canopy","tier":"critical","passIds":["form-refinement"],"minimumScore":0.8,"mustPass":True,"componentRefs":["root","primary-left","primary-right","primary-top","primary-mid-left","primary-mid-right"],"evidenceRefs":FULL_EVIDENCE},
    {"id":"primary-structure","name":"Trunk, scaffold, lateral and twig hierarchy","tier":"critical","passIds":["structural-pass","form-refinement"],"minimumScore":0.78,"mustPass":True,"componentRefs":["root","primary-left","primary-right","secondary-left-low","secondary-right-low","twig-left-low-a","twig-right-low-a"],"evidenceRefs":FULL_EVIDENCE},
    {"id":"blossom-system","name":"Five-petal blossoms distributed along twiglets","tier":"critical","passIds":["form-refinement","material-pass"],"minimumScore":0.76,"mustPass":True,"componentRefs":["flower-0","flower-4","flower-8"],"evidenceRefs":FULL_EVIDENCE},
    {"id":"emerging-leaves","name":"Sparse pointed young leaves around bloom tips","tier":"important","passIds":["form-refinement","material-pass"],"minimumScore":0.7,"mustPass":False,"componentRefs":["leaf-0","leaf-2","leaf-4"],"evidenceRefs":FULL_EVIDENCE},
    {"id":"faceted-materials","name":"Bark, petal, leaf and ground material separation","tier":"critical","passIds":["material-pass","surface-pass","lighting-pass"],"minimumScore":0.74,"mustPass":True,"componentRefs":["root","flower-0","leaf-0","ground-petal-accents"],"evidenceRefs":FULL_EVIDENCE},
]
all_ids = [c["id"] for c in components]
macro_ids = [c["id"] for c in components if c["level"] == "macro"]
meso_ids = [c["id"] for c in components if c["level"] in {"macro","meso"}]
spec["buildPasses"] = [
    {"id":"blockout","goal":"Match trunk, root flare, primary scaffold silhouette, and main negative spaces.","componentRefs":macro_ids,"acceptance":["Silhouette reads correctly without flower materials.","Root and five primary scaffolds are present.","Browser screenshot and side-by-side review recorded."]},
    {"id":"structural-pass","goal":"Build the branch hierarchy with stable attachment contracts.","componentRefs":meso_ids,"acceptance":["Macro and meso branch systems are present.","Every branch attachment has parentSocket, localStart/localEnd, overlap, and gapTolerance.","Browser screenshot and side-by-side review recorded."]},
    {"id":"form-refinement","goal":"Add twiglets, blossom shells, leaf cards, and canopy distribution.","componentRefs":all_ids,"acceptance":["Fine twiglets and individually readable blossom/leaf forms are present.","Open canopy gaps remain visible from multiple views.","Browser screenshot and side-by-side review recorded."]},
    {"id":"material-pass","goal":"Match the reference-derived bark, petal, leaf, and warm neutral ground response.","componentRefs":all_ids,"acceptance":["Materials have independent albedo, roughness, normal and AO intent.","PBR evidence or explicit single-image inference limitation is recorded.","Browser screenshot and side-by-side review recorded."]},
    {"id":"surface-pass","goal":"Add restrained faceted and local surface variation without turning the tree into noise.","componentRefs":all_ids,"acceptance":["Grazing light shows bark planes and petal cups without plastic highlights.","Browser screenshot and side-by-side review recorded."]},
    {"id":"lighting-pass","goal":"Make the trunk, petals, leaves, and ground readable under neutral and reference-like light.","componentRefs":all_ids,"acceptance":["Key, fill, rim/environment, exposure, tone mapping and contact shadow are documented.","Browser screenshot and side-by-side review recorded."]},
    {"id":"interaction-pass","goal":"Keep stable pivots, sockets, colliders, and branch groups ready for gentle animation.","componentRefs":all_ids,"acceptance":["Runtime node map and branch pivots are present.","Browser screenshot and side-by-side review recorded."]},
    {"id":"optimization-pass","goal":"Protect real-time performance with instanced accents and a documented budget.","componentRefs":all_ids,"acceptance":["Repeated ground petals are instanced and performance budget is recorded."]},
]
spec["qualityTargets"]["reviewViewpoints"] = ["front-three-quarter","side-orbit","top-oblique","low-angle-root"]
spec["qualityTargets"]["mustMatch"] = ["broad spreading sakura silhouette and open canopy gaps","trunk → scaffold → lateral → twig hierarchy","individual pale five-petal blossom clusters","sparse emerging copper-green leaves","faceted matte bark and warm pastel material separation"]
spec["lookDevTargets"]["screenshotReview"] = ["Compare branch silhouette and negative spaces.","Compare blossom cluster distribution and individual petal readability.","Compare bark facet response under neutral and grazing light.","Compare warm ivory background and contact shadow.","Capture front-three-quarter, side-orbit, and low-angle-root renders."]
spec["lookDevTargets"]["qualityPriority"] = "balanced"
spec["lookDevTargets"]["materialPass"]["referencePbrExtraction"]["requiredWhenSourceImagePresent"] = False
spec["lookDevTargets"]["materialPass"]["referencePbrExtraction"]["acceptedLimitation"] = "PBR extraction is recorded as evidence with 0.86 confidence, but the runtime model uses authored procedural materials because the source is a stylized single view."
spec["lightingFromPhoto"] = [
    {"type":"key light","direction":"upper front-left, broad soft source","color":"warm ivory daylight","intensity":"moderate; preserve pale petals without clipping"},
    {"type":"fill light","direction":"front and slightly above camera","color":"warm neutral","intensity":"low; keep trunk fork readable"},
    {"type":"rim or environment light","direction":"soft rear hemisphere","color":"pale warm cream","intensity":"subtle; separate blossom edges from background"},
    {"type":"exposure and tone mapping","exposure":"slightly below neutral to preserve petal value range","toneMapping":"ACESFilmic or equivalent filmic mapping","background":"warm ivory field"},
    {"type":"contact shadow","behavior":"soft ground contact beneath roots and sparse petal accents; no hard cast shadow"},
]
spec["proceduralStrategy"] = [
    "Use endpoint-attached tapered branch segments for the trunk-to-twig network; do not collapse the tree into a single mesh.",
    "Use individually named blossom extrusions and pointed leaf shells for the identity-defining micro system.",
    "Use deterministic geometry and instanced ground-petal accents to protect frame time.",
    "Keep the low-poly style in radial segment counts, planar shading, and controlled material variation rather than dense faceted noise.",
]
spec["animationAnchors"] = [{"id":"root-sway","component":"root","axis":[0,0,1],"amplitude":0.012,"frequency":0.18},{"id":"branch-sway","component":"primary-left","axis":[0,0,1],"amplitude":0.018,"frequency":0.26},{"id":"petal-fall","component":"ground-petal-accents","axis":[0,1,0],"amplitude":0.04,"frequency":0.4}]
spec["assumptions"] = ["Single-image reconstruction; rear branch depth and hidden roots are inferred.","The target is a real-time browser prop for Seed Journal, not a botanical measurement or photogrammetric asset.","Somei Yoshino-inspired spring bloom is the closest visual reference family; cultivar identity is not claimed."]
spec["performanceBudget"] = {"fpsTarget":60,"maxDrawCalls":24,"maxVisibleTriangles":65000,"instancingRequiredFor":["ground-petal-scatter"],"lodStrategy":"reduce blossom and leaf component visibility first on low quality; preserve trunk/scaffolds.","notes":"The current low-poly tree is a visual prop; retain the existing app fallback and reduced-motion behavior when integrating."}
SPEC_PATH.write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"AUTHORED_COMPONENTS={len(components)} MATERIALS={len(spec['materials'])} REPETITIONS={len(spec['repetitionSystems'])}")
