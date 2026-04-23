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
  // NOTE: in the 23/04/2026 model, "Cube.003"/".004" are ALSO used as mesh names
  // by the BarLocation.* nodes, but their node reservations pre-claim those slots.
  'Cube005':          'cafe',
  'Cube005_1':        'cafe',
  'Cube005_2':        'cafe',
  'Cube005_3':        'cafe',
  'Cube005_4':        'cafe',
  'Cube005_5':        'cafe',
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

  // ── BARS — two explicit BarLocation nodes in the 23/04/2026 model ────────
  // bar-1: BarLocation.000 (mesh Cube.003, 2 prims)
  'Cube003_1':        'bar-1',
  'Cube003_2':        'bar-1',
  // bar-2: BarLocation.001 (mesh Cube.004, 2 prims)
  'Cube004_1':        'bar-2',
  'Cube004_2':        'bar-2',
};

export function getObjectsForLocation(locationId) {
  return Object.entries(MODEL_MAP)
    .filter(([, id]) => id === locationId)
    .map(([objName]) => objName);
}

export function getLocationForObject(objectName) {
  return MODEL_MAP[objectName] || null;
}
