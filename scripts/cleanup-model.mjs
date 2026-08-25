/**
 * Cleans a raw Blender glTF export before Draco compression (script-side
 * stand-in for cleanup that should ideally happen in the .blend itself):
 *
 *   1. Deletes working-file leftovers that must not ship — duplicate
 *      full-map terrain stacks, road-profile curves, reference empties.
 *   2. Decimates known ultra-heavy decorative meshes (trail-rock scatter,
 *      trailer, trees, car-camping scatter) via meshoptimizer.
 *   3. Prunes all resources orphaned by the above.
 *
 * Updated for the 25/08/2026 "Form Festival 2026_20" export; the removal
 * and simplify lists below are per-export and should be reviewed whenever
 * a new .blend export arrives (compare against the previous export with
 * scripts/inspect-all.mjs, and re-check node names).
 *
 * 25/08/2026 note: the export is now produced by us via
 * scripts/blender-export-visible.py (use_visible=True), so the hidden-object
 * leakage the 18/08 list stripped (terrain stacks, profile curves, backups —
 * see git history) can no longer occur. Only export artifacts remain.
 *
 * Run:  node scripts/cleanup-model.mjs <input.gltf> <output-dir>
 * Then: node scripts/optimize-model.mjs "<output-dir>/<name>.gltf"
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, weldPrimitive, simplifyPrimitive, compactPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { resolve, basename } from 'path';
import { mkdirSync } from 'fs';

/**
 * Export artifacts that must not ship (exact node names).
 *
 * Ground truth: scripts/blender-hidden-objects.py run headlessly against the
 * .blend (`/Applications/Blender.app/Contents/MacOS/Blender -b <file.blend>
 * --python scripts/blender-hidden-objects.py`) lists every object hidden via
 * eye/render/collection. The 25/08/2026 export (ours, visible-only) leaked
 * NO hidden objects — verified node-by-node against that audit. What remains
 * are meshless empty nodes: visible CURVE objects that export as bare
 * transform nodes with zero geometry.
 *
 * NOTE: 'Durango Tent.001/.002/.003' are render-hidden but eye-VISIBLE in
 * Blender, so they export and SHIP deliberately (Oasis/The Shop tents —
 * same pattern as the old CampingTent).
 */
const NODES_TO_REMOVE = [
  // Visible road-track curves with no mesh after export — empty nodes.
  'map.osm_roads_track.001',
  'map.osm_roads_track.002',
  'map.osm_roads_track.004',
  'map.osm_roads_track.005',
];

/**
 * Heavy decorative meshes to decimate, keyed by NODE name (mesh names are
 * not unique in this export). ratio = target fraction of triangles kept.
 *
 * mode:
 *   'standard' — quality quadric simplify; respects topology. Fails on
 *                meshes made of many tiny disconnected islands.
 *   'prune'    — standard + removes islands smaller than `error` (relative
 *                to mesh extent). Used for the trailer's greeble parts.
 *   'sloppy'   — vertex-clustering; ignores topology entirely. Only option
 *                for scatter meshes (e.g. the car-camping cars) whose
 *                islands sit at the same scale as the Prune cliff. Expect
 *                blockier silhouettes — fine for distant props.
 */
const SIMPLIFY_TARGETS = {
  'Placement_TrailRockScatter.000': { ratio: 0.08, error: 0.05, mode: 'standard' }, // 1.22M tris (audit P1)
  // Car-camping cars (Placement_ParkingLot, 177k tris) are deliberately NOT
  // simplified: sloppy mode turned them into blobs even at ratio 0.5 (visual
  // QA 18/08/2026), standard/prune modes can't reduce them (tiny disconnected
  // islands), and the post-cleanup scene has ample budget. If they ever need
  // reducing, it's a Blender-side decimate for the artist.
};

function meshTris(mesh) {
  let tris = 0;
  for (const prim of mesh.listPrimitives()) {
    const indices = prim.getIndices();
    const pos = prim.getAttribute('POSITION');
    tris += indices ? indices.getCount() / 3 : pos ? pos.getCount() / 3 : 0;
  }
  return Math.round(tris);
}

function docTris(doc) {
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes()) tris += meshTris(mesh);
  return tris;
}

async function main() {
  const [inputArg, outDirArg] = process.argv.slice(2);
  if (!inputArg || !outDirArg) {
    console.error('Usage: node scripts/cleanup-model.mjs <input.gltf> <output-dir>');
    process.exit(1);
  }
  const input = resolve(inputArg);
  const outDir = resolve(outDirArg);
  mkdirSync(outDir, { recursive: true });

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(input);
  const trisBefore = docTris(doc);

  // ── 1. Remove working-file nodes ──────────────────────────────────────────
  let removed = 0;
  for (const node of doc.getRoot().listNodes()) {
    if (!NODES_TO_REMOVE.includes(node.getName())) continue;
    if (node.listChildren().length > 0) {
      console.warn(`  SKIP (has children): ${node.getName()}`);
      continue;
    }
    node.dispose();
    removed++;
  }
  console.log(`Removed ${removed}/${NODES_TO_REMOVE.length} listed nodes.`);

  // ── 2. Decimate heavy decorative meshes ───────────────────────────────────
  await MeshoptSimplifier.ready;
  for (const [nodeName, opts] of Object.entries(SIMPLIFY_TARGETS)) {
    const node = doc.getRoot().listNodes().find((n) => n.getName() === nodeName);
    const mesh = node?.getMesh();
    if (!mesh) {
      console.warn(`  SKIP simplify (node/mesh not found): ${nodeName}`);
      continue;
    }
    const before = meshTris(mesh);
    for (const prim of mesh.listPrimitives()) {
      weldPrimitive(prim);
      if (opts.mode === 'standard') {
        simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: opts.ratio, error: opts.error });
      } else {
        const idxAcc = prim.getIndices();
        const idx = new Uint32Array(idxAcc.getArray());
        const pos = new Float32Array(prim.getAttribute('POSITION').getArray());
        const target = Math.floor((idx.length * opts.ratio) / 3) * 3;
        const [newIdx] =
          opts.mode === 'sloppy'
            ? MeshoptSimplifier.simplifySloppy(idx, pos, 3, null, target, opts.error)
            : MeshoptSimplifier.simplify(idx, pos, 3, target, opts.error, ['Prune']);
        idxAcc.setArray(newIdx);
        compactPrimitive(prim); // drop vertices orphaned by the manual index swap
      }
    }
    console.log(
      `  Simplified ${nodeName} [${opts.mode}]: ${before.toLocaleString()} → ${meshTris(mesh).toLocaleString()} tris (target ×${opts.ratio})`
    );
  }

  // ── 3. Prune orphaned meshes/materials/textures/accessors ────────────────
  await doc.transform(prune());

  const trisAfter = docTris(doc);
  console.log(`Triangles: ${trisBefore.toLocaleString()} → ${trisAfter.toLocaleString()}`);

  const outPath = resolve(outDir, basename(input));
  await io.write(outPath, doc);
  console.log(`Written: ${outPath}`);
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
