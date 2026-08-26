/**
 * Fixes a flat, ground-decal mesh whose triangles have inconsistent winding
 * (e.g. Blender Grease Pencil text converted to mesh): rewinds every triangle
 * whose geometric normal points down (-Y in local space) and sets all vertex
 * normals to straight up. Needed because the app renders FrontSide-only
 * (Session 12 GPU pass), so reversed faces are backface-culled from above.
 *
 * Only valid for meshes that are flat in local XZ and meant to face +Y.
 *
 * Run: node scripts/fix-flat-winding.mjs <input.gltf|.glb> <nodeName> [output]
 *      (writes in place when no output is given)
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { resolve } from 'path';

const [inputArg, nodeName, outArg] = process.argv.slice(2);
if (!inputArg || !nodeName) {
  console.error('Usage: node scripts/fix-flat-winding.mjs <input.gltf|.glb> <nodeName> [output]');
  process.exit(1);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(resolve(inputArg));

const node = doc.getRoot().listNodes().find((n) => n.getName() === nodeName);
const mesh = node?.getMesh();
if (!mesh) {
  console.error(`Node/mesh not found: ${nodeName}`);
  process.exit(1);
}

for (const prim of mesh.listPrimitives()) {
  const indices = prim.getIndices();
  const position = prim.getAttribute('POSITION');
  const normal = prim.getAttribute('NORMAL');
  const idx = indices.getArray().slice();
  const pos = position.getArray();

  let flipped = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const [a, b, c] = [idx[i] * 3, idx[i + 1] * 3, idx[i + 2] * 3];
    const ux = pos[b] - pos[a], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vz = pos[c + 2] - pos[a + 2];
    // Y of cross(U, V) for a flat-in-XZ triangle: uz*vx - ux*vz
    const ny = uz * vx - ux * vz;
    if (ny < 0) {
      const tmp = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = tmp;
      flipped++;
    }
  }
  indices.setArray(idx);

  if (normal) {
    const nrm = normal.getArray().slice();
    for (let i = 0; i < nrm.length; i += 3) {
      nrm[i] = 0; nrm[i + 1] = 1; nrm[i + 2] = 0;
    }
    normal.setArray(nrm);
  }
  console.log(`  ${nodeName}: rewound ${flipped}/${idx.length / 3} triangles, normals set to +Y`);
}

const outPath = resolve(outArg || inputArg);
await io.write(outPath, doc);
console.log(`Written: ${outPath}`);
