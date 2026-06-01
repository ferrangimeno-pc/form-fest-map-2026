/**
 * Maps RUNTIME mesh names → location IDs.
 *
 * These are the names Three.js GLTFLoader produces at runtime, NOT the raw
 * GLTF node names. Naming rules (see GLTFLoader.js):
 *   - Single-prim nodes: final Mesh.name = NODE name (line 4279 override).
 *   - Multi-prim nodes: each child Mesh.name = MESH name with a shared
 *     createUniqueName counter suffix (`base`, `_1`, `_2`, …). The counter
 *     is shared with nodeName reservations, so a prior reservation can
 *     push prims to start at `_1`.
 *
 * Source of truth for verifying a swap: run `npm run validate-model` and
 * load the map in the browser. See memory/glb_mesh_map.md for the full
 * reference.
 */
export const MODEL_MAP = {
  // ── STAGES ───────────────────────────────────────────────────────────────
  'Roundcube_1':      'apse',
  'Roundcube_2':      'apse',
  'Roundcube001_1':   'apse',
  'Roundcube001_2':   'apse',
  'Cylinder':         'amphitheater',
  'Cylinder001':      'amphitheater',
  'Cube_1':           'amphitheater',
  'Cube_2':           'amphitheater',
  'Cube_3':           'amphitheater',
  'Cube001_1':        'pool',
  'Cube001_2':        'pool',
  'Cube001_3':        'pool',
  'Cube001_4':        'pool',          // water shader target (water.js)
  'Cylinder002_1':    'vaults',
  'Cylinder002_2':    'vaults',
  // Envelop — shade/gazebo structure in front of the amphitheater (node
  // "Hill Shades", single-prim, mesh Cube.018).
  'Hill_Shades':      'envelop',

  // ── FOOD ─────────────────────────────────────────────────────────────────
  'Cube002_1':        'cafe',
  'Cube002_2':        'cafe',
  // Three GLTF nodes (Cube.003/.004/.006) share mesh "Cube.005" → 6 runtime prims.
  // NOTE (01/06/2026 model): a NEW node literally named "Cube.005" (mesh Cube.015)
  // now reserves the "Cube005" base name in GLTFLoader's phase-1 nodeName pass, so
  // the cafe prims shift up by one and start at `Cube005_1` (was `Cube005`). The
  // bare "Cube005" runtime name no longer exists. The new node's own prims surface
  // as `Cube015`/`Cube015_1` (see below). Verified via scripts/runtime-names.mjs.
  'Cube005_1':        'cafe',
  'Cube005_2':        'cafe',
  'Cube005_3':        'cafe',
  'Cube005_4':        'cafe',
  'Cube005_5':        'cafe',
  'Cube005_6':        'cafe',
  // OSM background footprint adjacent to the cafe cluster.
  // Naming quirk: GLTF node is "map.osm_buildings.004" but its mesh-def is
  // named "map.osm_buildings.009" — Three.js names the multi-prim children
  // after the mesh-def, so runtime keys are `maposm_buildings009_N` even
  // though the visual footprint sits at the cafe (verified at runtime:
  // bbox center -5.71, 0.93 vs cafe pin -6.07, 0.88). DO NOT change to
  // `maposm_buildings004_N` — those keys don't exist at runtime.
  'maposm_buildings009_1': 'cafe',
  'maposm_buildings009_2': 'cafe',
  'maposm_buildings009_3': 'cafe',
  'Roundcube002_1':   'foundry',
  'Roundcube002_2':   'foundry',
  'Roundcube003_1':   'foundry',
  'Roundcube003_2':   'foundry',
  'Roundcube004':     'foundry',
  // Bodega — node "Large Tent" uses mesh "Cone.001" (single-prim).
  // Three.js sanitizeNodeName() converts the space to underscore.
  'Large_Tent':       'bodega',

  // ── SHOP — same mesh as the GitHub release: map.osm_buildings.008 (3 prims)
  // at scaled (-4.03, 1.40, -0.55).
  'maposm_buildings008_1': 'shop',
  'maposm_buildings008_2': 'shop',
  'maposm_buildings008_3': 'shop',

  // ── GLAMPING — single-prim node "Placement_CampingTents" (mesh "Vert")
  // (renamed from the previous "camping" location).
  // Stray `CampingTent` cone is hidden via HIDDEN_MESHES in model.js.
  'Placement_CampingTents': 'glamping',

  // ── GLAMPING RVs — van cluster from node "Placement_ParkingLot.001" ──────
  // (mesh "Cube.017", 2 prims) at scaled (-6.22, 1.30, -5.48). The old 11-vehicle
  // cluster is now hidden via HIDDEN_MESHES (residual from previous export).
  'Cube017':          'glamping-rvs',
  'Cube017_1':        'glamping-rvs',

  // ── CAR CAMPING — parking-lot surface at the northern edge of the site
  // (single-prim node "Placement_ParkingLot", scaled center ~(-8.81, 1.32, -7.83)).
  'Placement_ParkingLot': 'car-camping',

  // ── RESTROOMS ────────────────────────────────────────────────────────────
  'BathroomGA002':    'restrooms-1',
  'BathroomGA003':    'restrooms-1',
  'BathroomGA012':    'restrooms-2',
  'BathroomGA001':    'restrooms-2',

  // ── GUEST SERVICES — GS sub-cluster of map.osm_buildings.011 ─────────────
  // The 011 GLTF node spans 3 separate building groups. model.js splits it at
  // load time into _gs (the road-junction cluster near bodega) and _nonGS.
  'maposm_buildings011_1_gs': 'guest-services',
  'maposm_buildings011_2_gs': 'guest-services',
  'maposm_buildings011_3_gs': 'guest-services',
  // New in 01/06/2026 model — two standalone guest-services structures north of
  // the GS cluster (client-confirmed).
  // Soteria Safe Space — node "Large Tent.001" (mesh Cone.002, single-prim) →
  // runtime "Large_Tent001" (space + dot sanitized to underscores).
  'Large_Tent001':    'soteria',
  // Medical — node "Cube.005" (mesh Cube.015, 2 prims) → runtime Cube015/_1.
  // NOTE: this node's name also bumps the cafe Cube005_* prims up by one (see FOOD).
  'Cube015':          'medical',
  'Cube015_1':        'medical',

  // ── BARS — two explicit BarLocation nodes in the 23/04/2026 model ────────
  // bar-1: BarLocation.000 (mesh Cube.003, 2 prims)
  'Cube003_1':        'bar-1',
  'Cube003_2':        'bar-1',
  // bar-2: BarLocation.001 (mesh Cube.004, 2 prims)
  'Cube004_1':        'bar-2',
  'Cube004_2':        'bar-2',
};

/**
 * Dual-section meshes — a single model object that belongs to TWO locations in
 * two different categories. The mesh keeps its primary mapping (MODEL_MAP) for
 * default color, hover, and idle identity; the alternate below only takes over
 * while ITS category is the active one (pin label, highlight color, and popup all
 * switch to the alternate).
 *
 *  - bar-2 (BarLocation.001 / Cube004_1+_2, beside the Soteria tent): default
 *    "Bar" (pink, BARS); becomes "Grab and Go" (green) while FOOD is selected.
 *  - bodega (Large Tent / Large_Tent): default "Bodega" (green, FOOD); highlights
 *    with the SHOP color while SHOP is selected (same name "Bodega").
 *
 *   mesh -> { id: alternate locationId, category: category that activates it }
 */
export const DUAL_SECTION_MESHES = {
  'Cube004_1': { id: 'grab-and-go', category: 'food' },
  'Cube004_2': { id: 'grab-and-go', category: 'food' },
  'Large_Tent': { id: 'bodega-shop', category: 'shop' },
};

/**
 * All meshes mapped to a location, unioning the primary map with any dual-section
 * meshes whose alternate is this location. Context-free — returns every mesh the
 * location can ever own. Use for camera-fit and for highlighting the locations of
 * the currently-active category (where only one of a mesh's two owners is ever in
 * the active set).
 */
export function getObjectsForLocation(locationId) {
  const names = Object.entries(MODEL_MAP)
    .filter(([, id]) => id === locationId)
    .map(([objName]) => objName);
  for (const [name, dual] of Object.entries(DUAL_SECTION_MESHES)) {
    if (dual.id === locationId) names.push(name);
  }
  return names;
}

/**
 * Resolve a mesh to its location for the CURRENT context. A dual-section mesh
 * resolves to its alternate location only while that alternate's category is the
 * active one; otherwise it resolves to its primary owner. Drives hover/click.
 */
export function getLocationForObject(objectName, activeCategoryId = null) {
  const dual = DUAL_SECTION_MESHES[objectName];
  if (dual && activeCategoryId === dual.category) return dual.id;
  return MODEL_MAP[objectName] || null;
}

/**
 * Meshes a location "owns" in the CURRENT context — used by the idle/hover tint
 * loops that iterate EVERY location, where a dual mesh's two owners would
 * otherwise both try to tint it. A dual mesh belongs to its alternate only while
 * that alternate's category is active; otherwise it stays with its primary owner.
 */
export function getContextMeshNames(locationId, activeCategoryId = null) {
  const names = [];
  // Primary meshes — skip any currently overridden by an active dual elsewhere.
  for (const [name, id] of Object.entries(MODEL_MAP)) {
    if (id !== locationId) continue;
    const dual = DUAL_SECTION_MESHES[name];
    if (dual && activeCategoryId === dual.category && dual.id !== locationId) continue;
    names.push(name);
  }
  // Dual meshes this location owns while its category is active.
  for (const [name, dual] of Object.entries(DUAL_SECTION_MESHES)) {
    if (dual.id === locationId && activeCategoryId === dual.category) names.push(name);
  }
  return names;
}
