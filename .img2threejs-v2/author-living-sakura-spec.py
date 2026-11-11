import copy
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SPEC_PATH = ROOT / "object-sculpt-spec.json"
spec = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
component_template = copy.deepcopy(spec["componentTree"][0])
material_template = copy.deepcopy(spec["materials"][0])
EVIDENCE = ["full-object"]
authored_inventory = json.loads(
    (ROOT / "detail-inventory-authored.json").read_text(encoding="utf-8")
)["detailInventory"]


def color_recipe(material_id):
    palettes = {
        "bark": ("rgba(106, 81, 71, 1)", "rgba(73, 58, 54, 1)", "wood"),
        "petal-pale": ("rgba(245, 222, 223, 1)", "rgba(234, 183, 194, 1)", "petal"),
        "petal-rose": ("rgba(231, 168, 184, 1)", "rgba(204, 120, 150, 1)", "petal"),
        "leaf": ("rgba(125, 131, 91, 1)", "rgba(95, 112, 75, 1)", "leaf"),
        "ground": ("rgba(240, 231, 223, 1)", "rgba(220, 205, 196, 1)", "ground"),
    }
    dominant, secondary, material_class = palettes[material_id]
    return {
        "materialClass": material_class,
        "materialClassConfidence": 0.9,
        "dominantAlbedo": dominant,
        "secondaryAlbedo": secondary,
        "colorGradient": {
            "type": "linear",
            "axis": [0.2, 1],
            "stops": [
                {"offset": 0, "color": secondary},
                {"offset": 0.55, "color": dominant},
                {"offset": 1, "color": dominant},
            ],
        },
    }


def feature(feature_id, description, geometry_effect, placement="reference-derived local region"):
    return {
        "id": feature_id,
        "description": description,
        "placement": placement,
        "approximateSize": "object-relative",
        "orientation": "follows the local botanical frame",
        "materialEffect": "preserve observed local albedo and roughness variation",
        "geometryEffect": geometry_effect,
        "confidence": 0.9,
    }


def action_profile(role, sockets=None):
    return {
        "animationRole": role,
        "pivot": {
            "mode": "center" if role == "root" else "socket",
            "localPosition": [0, 0, 0],
            "axis": [0, 0, 1],
            "confidence": 0.92,
        },
        "transformChannels": {
            "translate": True,
            "rotate": True,
            "scale": True,
            "bend": role in {"root", "trunk", "leader", "branch", "twig"},
            "twist": role in {"leader", "branch", "twig"},
            "detach": False,
            "visibility": True,
            "materialState": True,
        },
        "sockets": sockets or [],
        "collider": {
            "type": "capsule" if role in {"trunk", "leader", "branch", "twig"} else "box",
            "offset": [0, 0, 0],
            "scale": [1, 1, 1],
            "isTrigger": role in {"blossom-anchor", "canopy-window"},
            "notes": "Simplified interaction proxy; never used as the visible form.",
        },
        "constraints": [],
        "destruction": {
            "breakable": False,
            "fractureGroup": "living-sakura",
            "seamRefs": [],
            "detachableFragments": [],
            "breakImpulse": 0,
            "debrisMaterial": "bark",
        },
    }


def attachment(parent, start, end, base_radius, end_radius):
    return {
        "parentId": parent,
        "parentSocket": f"{parent}:growth-surface",
        "localStart": start,
        "localEnd": end,
        "contactType": "overlap",
        "embedDepth": max(0.025, base_radius * 0.28),
        "overlap": max(0.03, base_radius * 0.32),
        "gapTolerance": 0.008,
        "baseRadius": base_radius,
        "endRadius": end_radius,
        "evidenceRefs": EVIDENCE,
    }


def component(component_id, name, level, role, material, parent=None, start=None, end=None,
              base_radius=0.1, end_radius=0.04, local_features=None, importance=0.8):
    item = copy.deepcopy(component_template)
    is_branch = role in {"trunk", "leader", "branch", "twig"}
    item.update({
        "id": component_id,
        "name": name,
        "level": level,
        "role": role,
        "importance": importance,
        "confidence": 0.9,
        "primitive": "tube" if is_branch else "ellipsoid",
        "topologyClass": "fiber-strand" if is_branch else "continuous-sculpt",
        "topologyRationale": (
            "A tapered curved tube preserves botanical continuity, parent-local attachment, and wind pivots."
            if is_branch else
            "A low-poly continuous volume establishes grounded organic mass without radial spikes."
        ),
        "parent": parent,
        "attachment": attachment(parent, start, end, base_radius, end_radius) if parent else None,
        "dimensions": {
            "width": base_radius * 2,
            "height": 1 if not (start and end) else sum((end[i] - start[i]) ** 2 for i in range(3)) ** 0.5,
            "depth": base_radius * 2,
            "units": "world-relative",
            "confidence": 0.9,
        },
        "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
        "geometryDescriptor": {
            "topologyIntent": "faceted parent-local cubic tube with pipe-area taper" if is_branch else "faceted asymmetric root flare",
            "tubePath": {"points": [start or [0, 0, 0], end or [0, 1, 0]], "radius": base_radius, "radialSegments": 7, "closed": False} if is_branch else None,
            "edgeTreatment": {"type": "none", "bevelRadius": 0, "segments": 1},
            "deformationStack": ["deterministic bend", "subtle axial irregularity"] if is_branch else ["asymmetric buttress deformation"],
            "uvStrategy": "stable object-space procedural coordinates",
            "normalStrategy": "faceted normals with restrained planar variation",
        },
        "actionProfile": action_profile(role, [{"id": "growth-surface", "localPosition": end or [0, 1, 0], "localRotation": [0, 0, 0], "purpose": "botanical child attachment"}]),
        "material": material,
        "materialLayers": [material],
        "colorMaterialRecipe": color_recipe(material),
        "localFeatures": local_features or [],
        "surfaceDetail": {
            "macroRoughness": 0.82,
            "microRoughness": 0.12,
            "bumpAmplitude": 0.035 if material == "bark" else 0.01,
            "normalPattern": "longitudinal bark planes" if material == "bark" else "shallow organic cup",
            "displacementPattern": "none",
            "occlusionPattern": "parent junction and contact AO",
            "edgeWearPattern": "subtle raised-plane value shift",
            "notes": "Silhouette remains geometry-led; surface effects stay restrained.",
        },
        "evidenceRefs": EVIDENCE,
        "fidelityTier": level,
        "deformations": [],
        "joints": [],
        "seams": [],
    })
    return item


def material(material_id, name, colors, roughness, normal_pattern, note):
    item = copy.deepcopy(material_template)
    item.update({
        "id": material_id,
        "name": name,
        "qualityTier": "reference",
        "baseColor": colors[0],
        "color": colors[0],
        "albedo": {"dominant": colors[0], "secondary": colors[1:], "samplingNotes": note},
        "colorVariation": {"palette": colors, "pattern": "deterministic organ-local variation", "amplitude": 0.16, "heightCorrelation": 0.2},
        "textureResolution": 1024,
        "textureProjection": {"mode": "object", "repeat": [2, 3], "anisotropy": 4, "texelDensityIntent": "stable across differently scaled botanical organs"},
        "surfaceFrequencyBands": [
            {"id": "macro", "frequency": 2, "amplitude": 0.3, "role": "broad value planes"},
            {"id": "meso", "frequency": 10, "amplitude": 0.14, "role": "organ structure and shallow relief"},
            {"id": "micro", "frequency": 42, "amplitude": 0.045, "role": "grazing highlight breakup"},
        ],
        "roughness": {"base": roughness, "variation": 0.1, "map": "independent-procedural-roughness", "localResponse": "cavities stay matte; raised planes carry a soft highlight"},
        "metalness": {"base": 0, "variation": 0},
        "normal": {"pattern": normal_pattern, "strength": 0.22, "scale": 18, "space": "tangent"},
        "bump": {"pattern": normal_pattern, "amplitude": 0.025, "scale": 24},
        "displacement": {"pattern": "none", "amplitude": 0, "scale": 1, "silhouetteAffects": False},
        "ambientOcclusion": {"cavityStrength": 0.28, "contactShadowBias": 0.3, "notes": "only at genuine overlaps and flower centers"},
        "wear": {"edgeWear": 0.03, "scratches": [], "chips": []},
        "dirt": {"amount": 0.03, "cavityBias": 0.15, "color": colors[-1]},
        "localOverrides": [{"id": f"{material_id}-local", "region": "reference-visible local accents", "roughness": min(1, roughness + 0.06), "evidenceRefs": EVIDENCE}],
        "notes": note,
    })
    return item


spec["scores"] = {
    "object_isolation": 3,
    "silhouette_readability": 3,
    "depth_inference": 2,
    "primitive_decomposition": 3,
    "material_procedurality": 3,
    "occlusion_risk": 2,
    "interaction_fit": 3,
}
spec["preSpecAssessment"]["unknownsToResolveBeforeImplementation"] = []
spec["preSpecAssessment"]["detailInventory"] = authored_inventory
spec["referenceCamera"].update({"solved": True, "fovDegrees": 34, "positionHint": [0, 3.8, 11.5], "note": "Near-orthographic editorial product framing; verify against front reference and three-quarter orbit."})
spec["coordinateFrame"] = {"front": "positive z toward camera", "up": "positive y", "scaleReference": "mature tree height = 7.4 world units", "axes": {"x": "crown spread", "y": "height", "z": "three authored depth layers"}}
spec["silhouette"] = {
    "boundingShape": "asymmetric spreading-vase crown, width 1.16 times height, over an aged 4-degree leaning trunk",
    "aspectRatios": [{"name": "crown width to total height", "value": 1.16, "confidence": 0.92}, {"name": "crown depth to width", "value": 0.24, "confidence": 0.82}],
    "symmetry": "deliberately asymmetric: left/right crown mass differs about 14 percent",
    "dominantCurves": ["aged leaning trunk", "long low leftward sweep", "shorter counter-leader", "drooping terminal fans"],
    "negativeSpaces": ["large upper-left window", "central fork window", "right-middle window", "open air below signature sweep"],
    "landmarks": ["grounded root flare", "two unequal leaders", "signature low sweeping bough", "three protected canopy windows"],
}
spec["viewEvidence"][0].update({"observations": ["leaning aged trunk and exposed fork", "large low sweeping bough", "irregular layered blossom masses with visible wood", "warm ivory ground and sparse fallen petals"], "confidence": 0.9})

materials = [
    material("bark", "Warm faceted Sakura bark", ["#6a5147", "#493a36", "#8b6c5a", "#a7836e"], 0.86, "longitudinal bark grain and horizontal lenticel interruptions", "Warm brown-grey bark sampled from trunk planes; rough, never plastic."),
    material("petal-pale", "Pale blush petals", ["#f5dedf", "#fff1ec", "#eab7c2", "#d98fa5"], 0.68, "shallow five-petal cups", "Near-white blush petals with warm pink centers."),
    material("petal-rose", "Rose accent petals", ["#e7a8b8", "#f1c5cd", "#cc7896", "#f7dce0"], 0.65, "shallow five-petal cups", "Restrained rose accents create depth without a uniform pink cloud."),
    material("leaf", "Emerging copper-green leaves", ["#7d835b", "#a28f5d", "#5f704b", "#b39b68"], 0.74, "central vein and lightly serrated plane", "Sparse pointed spring leaves, limited to a small supporting role."),
    material("ground", "Warm ivory garden field", ["#f0e7df", "#fbf5ef", "#dccdc4", "#cbb9ae"], 0.95, "fine matte paper grain", "Quiet warm field with soft contact shadow; no scene clutter."),
]
spec["materials"] = materials

components = [
    component("root", "Living Sakura root rig", "macro", "root", "bark", local_features=[feature("grounded-root-flare", "Broad irregular buttress roots merge into the trunk and ground plane.", "asymmetric low-poly root flare", "lower center")], importance=1),
    component("trunk-lower", "Aged leaning lower trunk", "macro", "trunk", "bark", "root", [0, 0, 0], [0.28, 2.7, 0.04], 0.52, 0.32, [feature("aged-trunk", "The trunk leans four degrees and changes plane rather than rising as a central pole.", "curved faceted taper")], 1),
    component("leader-dominant", "Dominant right leader", "macro", "leader", "bark", "trunk-lower", [0, 0, 0], [1.25, 3.7, -0.22], 0.31, 0.105, [feature("unequal-leaders", "The dominant leader carries more crown mass and rises higher than its counter leader.", "unequal bifurcation")], 0.98),
    component("leader-subordinate", "Subordinate left leader", "macro", "leader", "bark", "trunk-lower", [0, 0, 0], [-0.95, 2.95, 0.3], 0.25, 0.085, [feature("unequal-leaders", "The shorter leader opens the central fork window.", "unequal bifurcation")], 0.94),
    component("primary-sweep", "Signature low sweeping bough", "macro", "branch", "bark", "trunk-lower", [0, 0, 0], [-4.6, 1.45, 0.32], 0.29, 0.055, [feature("signature-low-bough", "A long low bough sweeps left, lifts gently, then terminates with a slight descent.", "identity-defining asymmetric arc")], 1),
]

primary_specs = [
    ("primary-left-high", "leader-subordinate", [-2.65, 1.65, -0.42]),
    ("primary-left-back", "leader-subordinate", [-1.85, 2.2, -1.05]),
    ("primary-crown", "leader-dominant", [-0.25, 2.85, 0.2]),
    ("primary-right-high", "leader-dominant", [2.6, 2.05, -0.28]),
    ("primary-right-low", "trunk-lower", [3.45, 1.8, 0.62]),
    ("primary-front", "leader-dominant", [1.35, 1.75, 1.18]),
]
for index, (component_id, parent, end) in enumerate(primary_specs):
    components.append(component(component_id, component_id.replace("-", " ").title(), "macro", "branch", "bark", parent, [0, 0, 0], end, 0.2 - index * 0.012, 0.05, [feature("primary-bough", "One of six unequal crown-defining boughs.", "curved tapered scaffold")], 0.91))

secondary_parents = ["primary-sweep", "primary-left-high", "primary-left-back", "primary-crown", "primary-right-high", "primary-right-low"]
for index in range(20):
    parent = secondary_parents[index % len(secondary_parents)]
    side = -1 if index % 2 == 0 else 1
    layer = (index % 3) - 1
    end = [side * (0.75 + (index % 4) * 0.18), 0.62 + (index % 5) * 0.18, layer * 0.42]
    components.append(component(f"secondary-{index:02d}", f"Secondary branch {index + 1}", "meso", "branch", "bark", parent, [0, 0, 0], end, 0.09, 0.025, [feature("secondary-rhythm", "Alternating, non-radial secondary branch with a clear parent junction.", "meso branch rhythm")], 0.74))

for index in range(12):
    parent = f"secondary-{index:02d}"
    side = -1 if index % 2 == 0 else 1
    components.append(component(f"twig-anchor-{index:02d}", f"Terminal twig anchor {index + 1}", "micro", "twig", "bark", parent, [0, 0, 0], [side * 0.42, 0.55, ((index % 3) - 1) * 0.18], 0.035, 0.009, [feature("drooping-terminal", "Fine terminal path carries a flower cluster and may descend slightly at its tip.", "fine edge silhouette")], 0.62))

spec["componentTree"] = components
spec["repetitionSystems"] = [
    {"id": "tertiary-twig-network", "name": "Parent-local tertiary twig network", "level": "micro", "parent": "secondary-00", "primitive": "tube", "material": "bark", "count": 72, "instanceScale": [1, 1, 1], "placement": {"mode": "botanical-address", "depthLayers": 3, "protectedWindowCount": 3}, "geometry": {"kind": "tapered-cubic-tube", "buildsGeometry": True}, "buildsGeometry": True, "realization": "batched-geometry", "evidenceRefs": EVIDENCE},
    {"id": "blossom-clusters", "name": "Loose Sakura flower clusters", "level": "micro", "parent": "twig-anchor-00", "primitive": "extrude", "material": "petal-pale", "count": 280, "instanceScale": [0.8, 1.15, 0.8], "placement": {"mode": "terminal-clusters", "flowersPerCluster": [3, 7], "budsPerCluster": [1, 4], "protectedWindows": True}, "geometry": {"kind": "five-petal-cupped-flower", "buildsGeometry": True}, "buildsGeometry": True, "realization": "instanced-geometry", "evidenceRefs": EVIDENCE},
    {"id": "memory-blossoms", "name": "Permanent equal-importance memory blossoms", "level": "micro", "parent": "twig-anchor-00", "primitive": "extrude", "material": "petal-rose", "count": 48, "instanceScale": [1, 1, 1], "placement": {"mode": "stable-botanical-address", "history": "unbounded", "activeProjection": "bounded"}, "geometry": {"kind": "five-petal-memory-flower", "buildsGeometry": True}, "buildsGeometry": True, "realization": "instanced-geometry", "evidenceRefs": EVIDENCE},
    {"id": "emerging-leaves", "name": "Sparse pointed spring leaves", "level": "micro", "parent": "twig-anchor-00", "primitive": "extrude", "material": "leaf", "count": 96, "instanceScale": [0.75, 1.2, 0.45], "placement": {"mode": "terminal-pairs", "ratioToFlowers": 0.12}, "geometry": {"kind": "pointed-serrated-leaf", "buildsGeometry": True}, "buildsGeometry": True, "realization": "instanced-geometry", "evidenceRefs": EVIDENCE},
    {"id": "rare-falling-petals", "name": "Rare non-looping falling petals", "level": "micro", "parent": "root", "primitive": "plane-card", "material": "petal-pale", "count": 12, "instanceScale": [0.08, 0.02, 0.12], "placement": {"mode": "temporal-pool", "cadenceSeconds": [8, 18]}, "geometry": {"kind": "single-petal", "buildsGeometry": True}, "buildsGeometry": True, "realization": "pooled-instanced-geometry", "evidenceRefs": EVIDENCE},
]

spec["featureReviewTargets"] = [
    {"id": "leafless-silhouette", "name": "Aged trunk, unequal leaders, signature sweep and three crown windows", "tier": "critical", "passIds": ["blockout", "structural-pass"], "minimumScore": 0.82, "mustPass": True, "componentRefs": ["root", "trunk-lower", "leader-dominant", "leader-subordinate", "primary-sweep"], "evidenceRefs": EVIDENCE},
    {"id": "botanical-hierarchy", "name": "Continuous parent-local taper from trunk through terminal twigs", "tier": "critical", "passIds": ["structural-pass", "form-refinement"], "minimumScore": 0.8, "mustPass": True, "componentRefs": ["trunk-lower", "leader-dominant", "primary-sweep", "secondary-00", "twig-anchor-00"], "evidenceRefs": EVIDENCE},
    {"id": "blossom-language", "name": "Readable loose five-petal clusters with buds and restrained leaves", "tier": "critical", "passIds": ["form-refinement", "material-pass"], "minimumScore": 0.8, "mustPass": True, "componentRefs": ["twig-anchor-00"], "evidenceRefs": EVIDENCE},
    {"id": "living-motion", "name": "Delayed hierarchical wind and localized response", "tier": "critical", "passIds": ["interaction-pass"], "minimumScore": 0.78, "mustPass": True, "componentRefs": ["trunk-lower", "primary-sweep", "twig-anchor-00"], "evidenceRefs": EVIDENCE},
]
all_ids = [item["id"] for item in components]
macro_ids = [item["id"] for item in components if item["level"] == "macro"]
meso_ids = [item["id"] for item in components if item["level"] in {"macro", "meso"}]
spec["buildPasses"] = [
    {"id": "blockout", "goal": "Prove the leafless identity silhouette and crown windows.", "componentRefs": macro_ids, "acceptance": ["Asymmetric Sakura reads without blossoms.", "Signature low bough and unequal leaders are unmistakable.", "Three crown windows survive front and three-quarter views."]},
    {"id": "structural-pass", "goal": "Build exact parent-local branch hierarchy and taper.", "componentRefs": meso_ids, "acceptance": ["All branch roots overlap their parent sockets.", "Pipe-area taper has no pinched or floating junctions.", "Side and rear views retain intentional volume."]},
    {"id": "form-refinement", "goal": "Add tertiary rhythm, blossom clusters, leaves and protected negative space.", "componentRefs": all_ids, "acceptance": ["Peak bloom keeps 25–35 percent crown negative space.", "35–45 percent of wood remains visible.", "Flowers read individually rather than as foam."]},
    {"id": "material-pass", "goal": "Match warm bark, blush petals, rose depth accents, sparse leaves and ivory field.", "componentRefs": all_ids, "acceptance": ["No plastic highlights.", "Petal values remain differentiated without clipping.", "Procedural channels are independent."]},
    {"id": "surface-pass", "goal": "Add restrained bark planes, lenticels, petal cups and leaf veins.", "componentRefs": all_ids, "acceptance": ["Relief survives grazing light.", "Surface noise never obscures low-poly form."]},
    {"id": "lighting-pass", "goal": "Create calm editorial daylight and grounded contact.", "componentRefs": all_ids, "acceptance": ["Trunk fork remains readable.", "Background separates pale petals.", "Shadows remain soft and quiet."]},
    {"id": "interaction-pass", "goal": "Prove breathing, hierarchical wind, focus response and growth reveal pivots.", "componentRefs": all_ids, "acceptance": ["Motion amplitude decreases toward heavy wood.", "Reduced-motion freezes decorative motion.", "Focus response is local, not whole-tree yaw."]},
    {"id": "optimization-pass", "goal": "Bound render cost without capping perceived history.", "componentRefs": all_ids, "acceptance": ["Repeated organs are instanced.", "Complete history remains addressable.", "Long histories produce visible age and memory development."]},
]
spec["qualityTargets"].update({"fpsTarget": 60, "reviewViewpoints": ["front-reference", "front-three-quarter", "side", "rear", "leafless-silhouette"], "mustMatch": ["aged asymmetric silhouette", "signature low sweeping bough", "three protected crown windows", "loose five-petal Sakura clusters", "visible woody architecture at peak bloom", "calm living motion"]})
spec["lookDevTargets"]["qualityPriority"] = "balanced"
spec["lookDevTargets"]["materialPass"]["referencePbrExtraction"]["requiredWhenSourceImagePresent"] = False
spec["lookDevTargets"]["materialPass"]["referencePbrExtraction"]["acceptedLimitation"] = "The reference is a stylized single-view art target. Runtime materials use authored procedural response; extracted pixels are not treated as inverse-rendered PBR truth."
spec["lookDevTargets"]["screenshotReview"] = ["Compare leafless silhouette first.", "Compare peak-bloom negative space and visible wood.", "Review front, three-quarter, side and rear.", "Record 30-second motion study and simple/deep reveal studies."]
spec["lightingFromPhoto"] = [
    {"type": "key light", "direction": "upper front-left", "color": "warm daylight", "intensity": "broad and moderate"},
    {"type": "fill light", "direction": "camera-right", "color": "warm neutral", "intensity": "low"},
    {"type": "rim light", "direction": "rear upper hemisphere", "color": "pale peach cream", "intensity": "subtle"},
    {"type": "exposure", "toneMapping": "ACES filmic", "exposure": "protect pale petals", "background": "warm ivory"},
    {"type": "contact shadow", "behavior": "soft root contact only; no hard theatrical shadow"},
]
spec["proceduralStrategy"] = ["Build a stable parent-first branch graph from a root seed.", "Use cubic tapered tubes with exact attachment sampling.", "Instance five-petal flowers, buds and leaves in loose terminal clusters.", "Reserve three crown windows before organ placement.", "Use bounded active geometry with unbounded permanent botanical addresses, visible age, and memory lineage."]
spec["animationAnchors"] = [
    {"id": "trunk-breath", "component": "trunk-lower", "maxDegrees": 0.3, "cycleSeconds": 12},
    {"id": "primary-wind", "component": "primary-sweep", "maxDegrees": 0.8, "delaySeconds": 0.18},
    {"id": "twig-wind", "component": "twig-anchor-00", "maxDegrees": 3.2, "delaySeconds": 0.42},
    {"id": "growth-reveal", "component": "twig-anchor-00", "durationSeconds": 4.2, "localOnly": True},
]
spec["assumptions"] = ["The source is an art-direction target, not a botanical scan.", "Hidden rear topology is conservatively inferred and must pass orbit review.", "A bounded renderer may aggregate old detail, but completed journals and perceived development never expire or cap."]
spec["performanceBudget"] = {"qualityPriority": "balanced", "fpsTarget": 60, "maxDrawCalls": 20, "maxVisibleTriangles": 85000, "maxActiveHitRegions": 36, "instancingRequiredFor": ["blossom-clusters", "memory-blossoms", "emerging-leaves", "rare-falling-petals"], "lodStrategy": "reduce ambient organs before memory blossoms or primary silhouette", "notes": "Performance bounds are implementation details, never a visible maturity ceiling."}

detail_map = {
    "crown-left-break": ("contour", "signature-low-bough"),
    "crown-top-break": ("contour", "unequal-leaders"),
    "crown-right-depth": ("contour", "primary-bough"),
    "low-sweeping-bough": ("contour", "signature-low-bough"),
    "leader-fork": ("seam", "unequal-leaders"),
    "branch-window-right": ("contour", "primary-bough"),
    "root-contact-left": ("contour", "grounded-root-flare"),
    "faceted-trunk": ("ridge", "bark-local"),
    "root-contact-right": ("stain", "ground-local"),
    "five-petal-language": ("contour", "drooping-terminal"),
    "cluster-staging": ("contour", "drooping-terminal"),
    "spring-leaf-accents": ("contour", "drooping-terminal"),
}
for detail in spec["preSpecAssessment"]["detailInventory"]["details"]:
    detail_id = detail.get("id", "")
    kind, ref = detail_map.get(detail_id, ("contour", "aged-trunk"))
    detail["kind"] = kind
    detail["mapsTo"] = {"type": "component.localFeatures", "ref": ref}
    detail["implementationRef"] = "component.localFeatures or repetitionSystems"
    detail["status"] = "mapped"

SPEC_PATH.write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"AUTHORED_COMPONENTS={len(components)} MATERIALS={len(materials)} REPETITIONS={len(spec['repetitionSystems'])}")
