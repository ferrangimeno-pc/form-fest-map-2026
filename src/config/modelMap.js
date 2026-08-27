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
  // Envelop (18/08/2026): PIN-ONLY, placed just west of the cafe complex
  // (client-directed). No mesh in the model (the "Old Envelop Tent" object is
  // hidden in Blender and stripped by scripts/cleanup-model.mjs). The former
  // envelop mesh "Hill_Shades" is now the Slab hangout.

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
  // 18/08/2026: mesh map.osm_buildings.009 now has 2 prims (was 3).
  // 27/08/2026: the unrelated NODE "map.osm_buildings.009" (a pool-area
  // structure) was deleted by the artist, freeing the "maposm_buildings009"
  // base name — these prims shift DOWN to bare + _1 (were _1/_2).
  'maposm_buildings009':   'cafe',
  'maposm_buildings009_1': 'cafe',
  // The cafe's BIG top structure — new node "map.osm_buildings.016" (mesh
  // map.osm_buildings.018, 3 prims) stacked on the 009 footprint at
  // scaled (-5.71, 0.93). Without these the main cafe building doesn't
  // highlight.
  'maposm_buildings018':   'cafe',
  'maposm_buildings018_1': 'cafe',
  'maposm_buildings018_2': 'cafe',
  'Roundcube002_1':   'foundry',
  'Roundcube002_2':   'foundry',
  'Roundcube003_1':   'foundry',
  'Roundcube003_2':   'foundry',
  'Roundcube004':     'foundry',
  // Bodega removed entirely in the 18/08/2026 update (node "Large Tent" is
  // gone from the model, and the bodega/bodega-shop entries are deleted).
  // Oasis — 25/08/2026 model has THREE Durango tents in a north–south row NW
  // of the Apse. Client-directed: the TOP TWO (north, z −1.25 / −0.88) are
  // the Oasis; the bottom tent (Durango_Tent003) is The Shop Bar (see BARS).
  'Durango_Tent001':  'oasis',
  'Durango_Tent002':  'oasis',
  // Food Trucks — new node "Cube.007" (mesh Cube.004, 2 prims) in the
  // 27/08/2026 model: a row of four food trucks near the car-campground
  // entrance (world −9.60, −10.57). The "Cube004" base name is reserved by
  // the cafe node "Cube.004" in GLTFLoader's phase-1 pass, so the prims
  // surface as _1/_2. (The mesh-def name "Cube.004" previously belonged to
  // the removed bar-2 — unrelated, just Blender name recycling.)
  'Cube004_1':        'food-trucks',
  'Cube004_2':        'food-trucks',

  // ── SHOP — same building as before (map.osm_buildings.008, 3 prims) at
  // scaled (-4.03, 1.40, -0.55); the location is now NAMED "Lab" (18/08/2026)
  // while the category/tab stays "Shop". The id stays 'shop' for stability.
  'maposm_buildings008_1': 'shop',
  'maposm_buildings008_2': 'shop',
  'maposm_buildings008_3': 'shop',

  // ── HANGOUTS (new category 18/08/2026) ───────────────────────────────────
  // Pool moved here from STAGES (see above — meshes unchanged).
  // Spotify Lounge — single-prim node "Spotify Lounge" (mesh Cone.004),
  // NE of bar-1 at raw (-88, -48).
  'Spotify_Lounge':   'spotify-lounge',
  // Slab — the stepped shade structure SW of the amphitheater (node
  // "Hill Shades", mesh Cube.018). This was envelop's mesh until 18/08/2026;
  // client confirmed it is the Slab hangout.
  'Hill_Shades':      'slab',
  // Rooftop — the flat-roof complex east of the amphitheater bowl (node
  // "map.osm_buildings.015", mesh map.osm_buildings.017, 3 prims).
  // 25/08/2026: a NEW node literally named "map.osm_buildings.017" (the
  // nucleus mesh, see below) reserves the "maposm_buildings017" base name in
  // GLTFLoader's phase-1 pass, so these prims shift to _1/_2/_3 (the bare
  // name no longer exists). The complex's new wall geometry (node .013 →
  // maposm_buildings013_1/_2) stays unmapped scenery — only the roof pad
  // highlights, matching client-approved visuals.
  'maposm_buildings017_1': 'rooftop',
  'maposm_buildings017_2': 'rooftop',
  'maposm_buildings017_3': 'rooftop',
  // Nucleus — no longer pin-only (25/08/2026): the artist added a small mesh
  // attached to the Lab's NE edge (node "map.osm_buildings.017", mesh-def
  // map.osm_buildings.012, 2 prims at world −3.91, −0.91).
  'maposm_buildings012_1': 'nucleus',
  'maposm_buildings012_2': 'nucleus',

  // ── GLAMPING — single-prim node "Placement_CampingTents" (mesh "Cone")
  // (renamed from the previous "camping" location). The stray CampingTent
  // cone and the old 11-vehicle cluster are gone from the 25/08/2026 model
  // entirely (HIDDEN_MESHES in model.js is now empty).
  'Placement_CampingTents': 'glamping',

  // ── GLAMPING RVs — van cluster from node "Placement_ParkingLot.001" ──────
  // (mesh "Cube.034", 2 prims, real RV models — unchanged since 18/08/2026).
  'Cube034':          'glamping-rvs',
  'Cube034_1':        'glamping-rvs',

  // ── CAR CAMPING — parking-lot surface at the northern edge of the site
  // (single-prim node "Placement_ParkingLot", scaled center ~(-8.81, 1.32, -7.83)).
  'Placement_ParkingLot': 'car-camping',

  // ── RESTROOMS ────────────────────────────────────────────────────────────
  'BathroomGA002':    'restrooms-1',
  'BathroomGA003':    'restrooms-1',
  'BathroomGA012':    'restrooms-2',
  'BathroomGA001':    'restrooms-2',
  // New in 18/08/2026 model — two additional restroom structures:
  // restrooms-3 near the old envelop hill (raw -80, 37), restrooms-4 out in
  // car camping (raw -337, -332). Single-prim nodes.
  'BathroomGA004':    'restrooms-3',
  'BathroomGA005':    'restrooms-4',

  // ── GUEST SERVICES — GS sub-cluster of map.osm_buildings.011 ─────────────
  // The 011 GLTF node spans 3 separate building groups. model.js splits it at
  // load time into _gs (the road-junction cluster near bodega) and _nonGS.
  'maposm_buildings011_1_gs': 'guest-services',
  'maposm_buildings011_2_gs': 'guest-services',
  'maposm_buildings011_3_gs': 'guest-services',
  // Soteria Safe Space REMOVED 27/08/2026 (client request) — the artist also
  // deleted its small cube from the map.osm_buildings.011 geometry, so the
  // load-time soteria carve in model.js is gone too (only GS is carved now).
  // Medical — node "Cube.005" (mesh Cube.015, 2 prims) → runtime Cube015/_1.
  // NOTE: this node's name also bumps the cafe Cube005_* prims up by one (see FOOD).
  'Cube015':          'medical',
  'Cube015_1':        'medical',

  // ── BARS ─────────────────────────────────────────────────────────────────
  // bar-1: BarLocation.000 (mesh Cube.003, 2 prims). Sits on the CAD's
  // "ARCO NUCLEUS" building complex.
  'Cube003_1':        'bar-1',
  'Cube003_2':        'bar-1',
  // Oasis bar — new node "BarLocation.001" (mesh Cube.031, 2 prims) in the
  // 27/08/2026 model, just east of the Durango tents (world −5.12, −0.20).
  // The node NAME recycles the bar-2 node removed 18/08/2026, but it is new
  // geometry. Mesh base "Cube031" is unreserved → prims are bare + _1.
  'Cube031':          'oasis-bar',
  'Cube031_1':        'oasis-bar',
  // The Shop Bar and Craft Beer — the BOTTOM (southernmost, z −0.52) of the
  // three Durango tents. The top two are the Oasis (see FOOD).
  'Durango_Tent003':  'the-shop-bar',
};

/**
 * Dual-section meshes — a single model object that belongs to TWO locations in
 * two different categories. The mesh keeps its primary mapping (MODEL_MAP) for
 * default color, hover, and idle identity; the alternate below only takes over
 * while ITS category is the active one (pin label, highlight color, and popup all
 * switch to the alternate).
 *
 *   mesh -> { id: alternate locationId, category: category that activates it }
 *
 * 18/08/2026: currently EMPTY — the two former dual-section locations
 * (grab-and-go on bar-2, bodega-shop on bodega) were removed along with
 * their host meshes. The mechanism stays for future use.
 */
export const DUAL_SECTION_MESHES = {};

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
