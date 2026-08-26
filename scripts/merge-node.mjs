/**
 * Copies named node(s) — with their mesh/material dependencies — from a
 * source glTF into a target glTF, writing a merged .gltf (+ resources) to
 * an output directory.
 *
 * Use case: an artist drop where only ONE object changed/was added, so the
 * full Blender re-export pipeline isn't warranted. Merge the new node into
 * the last known-good export, then run the normal cleanup → optimize steps.
 *
 * If the copied material's name matches an existing material in the target,
 * the copy is rewired to the target's material (avoids duplicates).
 *
 * Run:  node scripts/merge-node.mjs <target.gltf> <source.gltf> <out-dir> <nodeName> [nodeName2 ...]
 * Then: node scripts/cleanup-model.mjs "<out-dir>/<target-name>.gltf" <tmp-dir>
 *       node scripts/optimize-model.mjs "<tmp-dir>/<target-name>.gltf"
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { copyToDocument } from '@gltf-transform/functions';
import { resolve, basename } from 'path';
import { mkdirSync } from 'fs';

const [targetArg, sourceArg, outDirArg, ...nodeNames] = process.argv.slice(2);
if (!targetArg || !sourceArg || !outDirArg || nodeNames.length === 0) {
  console.error('Usage: node scripts/merge-node.mjs <target.gltf> <source.gltf> <out-dir> <nodeName> [...]');
  process.exit(1);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const target = await io.read(resolve(targetArg));
const source = await io.read(resolve(sourceArg));

const scene = target.getRoot().getDefaultScene() || target.getRoot().listScenes()[0];

for (const name of nodeNames) {
  const srcNode = source.getRoot().listNodes().find((n) => n.getName() === name);
  if (!srcNode) {
    console.error(`Node not found in source: ${name}`);
    process.exit(1);
  }
  if (target.getRoot().listNodes().some((n) => n.getName() === name)) {
    console.error(`Node already exists in target: ${name}`);
    process.exit(1);
  }

  const copied = copyToDocument(target, source, [srcNode]).get(srcNode);
  scene.addChild(copied);

  // Rewire copied materials to same-named target materials where possible.
  const mesh = copied.getMesh();
  for (const prim of mesh ? mesh.listPrimitives() : []) {
    const mat = prim.getMaterial();
    if (!mat) continue;
    const existing = target
      .getRoot()
      .listMaterials()
      .find((m) => m !== mat && m.getName() === mat.getName());
    if (existing) {
      prim.setMaterial(existing);
      mat.dispose();
      console.log(`  ${name}: material rewired to existing "${existing.getName()}"`);
    }
  }

  const t = copied.getTranslation();
  console.log(`  Merged node "${name}" (translation ${t.map((v) => v.toFixed(2)).join(', ')})`);
}

const outDir = resolve(outDirArg);
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, basename(resolve(targetArg)));
await io.write(outPath, target);
console.log(`Written: ${outPath}`);
