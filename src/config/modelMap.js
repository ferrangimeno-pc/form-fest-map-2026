/**
 * Maps GLTF mesh names → location IDs.
 * Multi-material meshes load as separate objects with _1, _2, _3 suffixes.
 * All variants of the same building are mapped to the same location.
 */
export const MODEL_MAP = {
  // --- Stages ---
  'Roundcube':    'apse',
  'Roundcube001': 'apse',
  'Cylinder001':  'amphitheater',
  'Cylinder':     'amphitheater',   // inner cylinder of amphitheater bowl
  'Plane':      'pool',        // blue water surface of the pool
  'Cube002_1':  'pool',        // pool building structure
  'Cube002_2':  'pool',
  'Cube002_3':  'pool',
  'Circle':       'envelop',        // bowl/dish shape of Envelop stage
  'Cylinder002_1': 'vaults',
  'Cylinder002_2': 'vaults',

  // --- Food ---
  'Cube003': 'cafe',
  'Cube004': 'cafe',
  'Cube005': 'cafe',
  'Cube006': 'cafe',
  'Cube007': 'cafe',
  'maposm_buildings009_1': 'cafe',
  'maposm_buildings009_2': 'cafe',
  'maposm_buildings009_3': 'cafe',
  'Roundcube002':  'foundry',
  'Roundcube003':  'foundry',
  'Roundcube004':  'foundry',
  'Cone001':       'bodega',

  // --- Shop ---
  'maposm_buildings008_1': 'shop',
  'maposm_buildings008_2': 'shop',
  'maposm_buildings008_3': 'shop',

  // --- Camping ---
  'PF_Pickup_Low': 'camping',
  'Cube011_1':     'glamping-rvs',
  'Cube011_2':     'glamping-rvs',
  'Cube009_1':     'glamping',
  'Cube009_2':     'glamping',
  'Cone':          'glamping',

  // --- Restrooms ---
  'BathroomGA002': 'restrooms-1',
  'BathroomGA003': 'restrooms-1',
  'BathroomGA012': 'restrooms-2',
  'BathroomGA001': 'restrooms-2',

  // --- Guest Services ---
  'maposm_buildings001':   'guest-services',
  'maposm_buildings001_1': 'guest-services',
  'maposm_buildings001_2': 'guest-services',

  // --- Bars ---
  'Cube010_1': 'bar-1',
  'Cube010_2': 'bar-1',
  'Cube008_1': 'bar-2',
  'Cube008_2': 'bar-2',
};

/**
 * Reverse lookup: locationId → array of mesh names.
 */
export function getObjectsForLocation(locationId) {
  return Object.entries(MODEL_MAP)
    .filter(([, id]) => id === locationId)
    .map(([objName]) => objName);
}

/**
 * Get locationId from a mesh name.
 */
export function getLocationForObject(objectName) {
  return MODEL_MAP[objectName] || null;
}
