/**
 * GLB Model Validator — cross-checks a GLB file against all hardcoded mesh
 * dependencies in the codebase. Catches silent breakage before it ships.
 *
 * Run:  npm run validate-model
 * Or:   node scripts/validate-model.mjs [path-to-glb]
 *
 * Exit code 0 = all checks pass, 1 = warnings/errors found.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Mesh dependencies (mirrors the source files exactly) ─────────────────────

/** src/config/modelMap.js — every key must exist in the GLB */
const MODEL_MAP_MESHES = [
  'Roundcube', 'Roundcube001', 'Cylinder001', 'Cylinder',
  'Cube001_1', 'Cube001_2', 'Cube001_3',
  'Plane', 'Cube002_1', 'Cube002_2', 'Cube002_3',
  'Circle', 'Cylinder002_1', 'Cylinder002_2',
  'Cube003', 'Cube004', 'Cube005', 'Cube006', 'Cube007',
  'maposm_buildings009_1', 'maposm_buildings009_2', 'maposm_buildings009_3',
  'Roundcube002', 'Roundcube003', 'Roundcube004',
  'Cone001',
  'maposm_buildings008_1', 'maposm_buildings008_2', 'maposm_buildings008_3',
  'PF_Pickup_Low',
  'Cube011_1', 'Cube011_2',
  'Cube009_1', 'Cube009_2', 'Cone',
  'BathroomGA002', 'BathroomGA003', 'BathroomGA012', 'BathroomGA001',
  'maposm_buildings001', 'maposm_buildings001_1', 'maposm_buildings001_2',
  'Cube010_1', 'Cube010_2',
  'Cube008_1', 'Cube008_2',
];

/** src/scene/model.js — HIDDEN_MESHES */
const HIDDEN_MESHES = ['Cube'];

/** src/scene/model.js — NO_SHADOW_CAST */
const NO_SHADOW_CAST = ['maposm_roads_residential', 'Road_Trimmed'];

/** src/scene/model.js — terrain mesh for BackSide self-shadows */
const TERRAIN_MESH = 'Terrain_Step_Terrace_CamrCop';

/** src/scene/water.js — pool surface that gets the water shader */
const POOL_MESH = 'Plane';

/** All mesh names the code references */
const ALL_EXPECTED = new Set([
  ...MODEL_MAP_MESHES,
  ...HIDDEN_MESHES,
  ...NO_SHADOW_CAST,
  TERRAIN_MESH,
  POOL_MESH,
]);

// ── GLB parser ───────────────────────────────────────────────────────────────

/**
 * Mirrors Three.js PropertyBinding.sanitizeNodeName():
 * strips dots and some reserved characters so the runtime mesh name matches.
 * e.g. "Roundcube.001" → "Roundcube001", "map.osm_buildings.009" → "maposm_buildings009"
 */
function sanitizeName(name) {
  return name.replace(/[.\[\]]/g, '');
}

/**
 * For multi-primitive meshes, Three.js may name children using either the
 * node name or the mesh definition name, depending on whether they differ
 * and on internal collision resolution (createUniqueName). Suffixes can be
 * `_1/_2/_3` for all children, OR `base/_1/_2` (base name without suffix
 * for the first primitive).
 *
 * Rather than replicating every edge case, we generate ALL plausible names
 * from both sources. A code-expected name is "found" if it appears anywhere
 * in this set. False negatives are far worse than false positives here —
 * a missed rename silently breaks interactivity.
 */
function expandMultiPrim(baseName, primCount) {
  const names = new Set();
  // Pattern A: _1, _2, _3 (all suffixed)
  for (let i = 1; i <= primCount; i++) names.add(`${baseName}_${i}`);
  // Pattern B: base, _1, _2 (first unsuffixed)
  names.add(baseName);
  for (let i = 1; i < primCount; i++) names.add(`${baseName}_${i}`);
  return names;
}

function extractMeshNames(glbPath) {
  const buf = readFileSync(glbPath);

  // GLB header: magic(4) + version(4) + length(4)
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546C67) {
    throw new Error(`Not a valid GLB file (magic: 0x${magic.toString(16)})`);
  }

  // First chunk must be JSON
  const chunkLength = buf.readUInt32LE(12);
  const chunkType = buf.readUInt32LE(16);
  if (chunkType !== 0x4E4F534A) {
    throw new Error('First GLB chunk is not JSON');
  }

  const json = JSON.parse(buf.slice(20, 20 + chunkLength).toString('utf8'));

  // Collect all plausible runtime mesh names from both node and mesh-def names.
  const meshNames = new Set();
  const nodeNames = [];
  const nameMap = new Map(); // sanitized → raw description (for report)

  if (json.nodes) {
    for (const node of json.nodes) {
      if (node.name) nodeNames.push(node.name);
      if (node.mesh !== undefined && node.name) {
        const gltfMesh = json.meshes?.[node.mesh];
        const primCount = gltfMesh?.primitives?.length ?? 1;

        const nodeSan = sanitizeName(node.name);
        const meshSan = gltfMesh?.name ? sanitizeName(gltfMesh.name) : nodeSan;

        if (primCount === 1) {
          // Single primitive: Three.js uses the node name
          meshNames.add(nodeSan);
          nameMap.set(nodeSan, node.name);
        } else {
          // Multi-primitive: generate names from BOTH node and mesh-def names
          const fromNode = expandMultiPrim(nodeSan, primCount);
          const fromMesh = expandMultiPrim(meshSan, primCount);
          for (const n of fromNode) {
            meshNames.add(n);
            nameMap.set(n, `${node.name} [multi-prim, from node]`);
          }
          for (const n of fromMesh) {
            meshNames.add(n);
            nameMap.set(n, `${gltfMesh.name} [multi-prim, from mesh def]`);
          }
        }
      }
    }
  }

  return { meshNames, nodeNames, nameMap, json };
}

// ── Validation ───────────────────────────────────────────────────────────────

function validate(glbPath) {
  console.log(`\n  GLB Model Validator`);
  console.log(`  ${'─'.repeat(50)}`);
  console.log(`  File: ${glbPath}\n`);

  let meshNames, nodeNames, nameMap, json;
  try {
    ({ meshNames, nodeNames, nameMap, json } = extractMeshNames(glbPath));
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
    process.exit(1);
  }

  console.log(`  Total nodes in GLB:          ${nodeNames.length}`);
  console.log(`  Mesh names (after sanitize): ${meshNames.size}`);
  console.log(`  Expected by code:            ${ALL_EXPECTED.size}\n`);

  let warnings = 0;
  let errors = 0;

  // ── Check 1: Missing meshes (code expects them but GLB doesn't have them)
  console.log('  CHECK 1: Missing meshes (code expects, GLB missing)');
  console.log('  ' + '─'.repeat(50));

  const missingInteractive = MODEL_MAP_MESHES.filter((n) => !meshNames.has(n));
  if (missingInteractive.length > 0) {
    errors += missingInteractive.length;
    console.log(`  ✗ ${missingInteractive.length} interactive mesh(es) MISSING:`);
    missingInteractive.forEach((n) => console.log(`      - ${n}`));
    console.log('    → These buildings will have NO hover/click/highlight.\n');
  } else {
    console.log('  ✓ All interactive meshes present.\n');
  }

  // Special meshes
  const specialChecks = [
    { name: TERRAIN_MESH, role: 'Terrain (self-shadow)', file: 'model.js' },
    { name: POOL_MESH, role: 'Pool water surface', file: 'water.js' },
    ...NO_SHADOW_CAST.map((n) => ({ name: n, role: 'Road (no-shadow-cast)', file: 'model.js' })),
    ...HIDDEN_MESHES.map((n) => ({ name: n, role: 'Hidden mesh', file: 'model.js' })),
  ];

  console.log('  CHECK 2: Special meshes');
  console.log('  ' + '─'.repeat(50));
  for (const { name, role, file } of specialChecks) {
    if (meshNames.has(name)) {
      console.log(`  ✓ ${name}  →  ${role}`);
    } else {
      // Hidden meshes are just warnings; others are errors
      if (HIDDEN_MESHES.includes(name)) {
        warnings++;
        console.log(`  ~ ${name}  →  ${role} (OK if intentionally removed)`);
      } else {
        errors++;
        console.log(`  ✗ ${name}  →  ${role} MISSING  [${file}]`);
      }
    }
  }
  console.log();

  // ── Check 3: New meshes (in GLB but not referenced by code)
  // Show only genuinely novel nodes — filter out generated multi-prim variants
  // that exist purely from the dual-naming expansion.
  console.log('  CHECK 3: Unrecognized nodes (in GLB, not in code)');
  console.log('  ' + '─'.repeat(50));

  // Build a set of unique GLB node names (single source of truth from the file)
  const glbNodeMeshNames = new Set();
  if (json.nodes) {
    for (const node of json.nodes) {
      if (node.mesh !== undefined && node.name) {
        glbNodeMeshNames.add(sanitizeName(node.name));
      }
    }
  }
  // A node is "unrecognized" if its sanitized name doesn't appear as a prefix
  // of any expected mesh name (accounts for _1/_2/_3 suffixes)
  const unrecognizedNodes = [...glbNodeMeshNames].filter((nodeName) => {
    // Direct match
    if (ALL_EXPECTED.has(nodeName)) return false;
    // Check if any expected name starts with this node name + "_"
    for (const exp of ALL_EXPECTED) {
      if (exp.startsWith(nodeName + '_') || exp === nodeName) return false;
    }
    return true;
  });

  if (unrecognizedNodes.length > 0) {
    warnings += unrecognizedNodes.length;
    console.log(`  ~ ${unrecognizedNodes.length} GLB node(s) not referenced by code:`);
    unrecognizedNodes.forEach((n) => console.log(`      - ${n}`));
    console.log('    → These are non-interactive. Add to modelMap.js if they should be clickable.\n');
  } else {
    console.log('  ✓ No unrecognized nodes.\n');
  }

  // ── Check 4: Draco compression
  console.log('  CHECK 4: Draco compression');
  console.log('  ' + '─'.repeat(50));
  const hasDraco = json.extensionsUsed?.includes('KHR_draco_mesh_compression') ||
                   json.extensionsRequired?.includes('KHR_draco_mesh_compression');
  if (hasDraco) {
    console.log('  ✓ KHR_draco_mesh_compression detected.\n');
  } else {
    warnings++;
    console.log('  ~ No Draco compression. File will be larger than necessary.');
    console.log('    → Export with Draco enabled in Blender glTF settings.\n');
  }

  // ── Check 5: File size
  console.log('  CHECK 5: File size');
  console.log('  ' + '─'.repeat(50));
  const stats = readFileSync(glbPath);
  const sizeMB = stats.length / 1024 / 1024;
  if (sizeMB > 20) {
    warnings++;
    console.log(`  ~ ${sizeMB.toFixed(2)} MB — consider optimizing (target < 15 MB).`);
  } else {
    console.log(`  ✓ ${sizeMB.toFixed(2)} MB`);
  }
  console.log();

  // ── Summary
  console.log('  ' + '═'.repeat(50));
  if (errors === 0 && warnings === 0) {
    console.log('  ✓ ALL CHECKS PASSED — model is ready for integration.\n');
  } else {
    if (errors > 0) console.log(`  ✗ ${errors} ERROR(S) — must fix before deployment.`);
    if (warnings > 0) console.log(`  ~ ${warnings} WARNING(S) — review recommended.`);
    console.log();
  }

  process.exit(errors > 0 ? 1 : 0);
}

// ── Entry point ──────────────────────────────────────────────────────────────

const glbPath = process.argv[2] || resolve(ROOT, 'public', 'assets', 'model', 'formFestMap.glb');
validate(glbPath);
