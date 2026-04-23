/**
 * Converts GLTF+BIN → Draco-compressed GLB.
 * Run: npm run optimize-model -- <input.gltf>
 * Defaults to the most-recent updated-* folder under public/assets/model.
 */
import gltfPipeline from 'gltf-pipeline';
const { gltfToGlb } = gltfPipeline;
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUTPUT_GLB = resolve(ROOT, 'public', 'assets', 'model', 'formFestMap.glb');

function findDefaultGltf() {
  const modelDir = resolve(ROOT, 'public', 'assets', 'model');
  const candidates = readdirSync(modelDir)
    .filter((n) => statSync(resolve(modelDir, n)).isDirectory() && n.startsWith('updated'))
    .sort()
    .reverse();
  for (const dir of candidates) {
    const full = resolve(modelDir, dir);
    const gltf = readdirSync(full).find((n) => n.endsWith('.gltf'));
    if (gltf) return resolve(full, gltf);
  }
  throw new Error('No .gltf found in public/assets/model/updated* folders');
}

async function main() {
  const inputGltf = process.argv[2] ? resolve(process.argv[2]) : findDefaultGltf();
  const resourceDirectory = dirname(inputGltf) + '/';

  console.log('Input  :', inputGltf);
  console.log('Output :', OUTPUT_GLB);

  const gltf = JSON.parse(readFileSync(inputGltf, 'utf8'));

  const results = await gltfToGlb(gltf, {
    resourceDirectory,
    dracoOptions: {
      compressionLevel: 10,
      quantizePositionBits: 14,
      quantizeNormalBits: 10,
      quantizeTexcoordBits: 12,
      quantizeColorBits: 8,
      quantizeGenericBits: 12,
      unifiedQuantization: false,
    },
  });

  writeFileSync(OUTPUT_GLB, results.glb);

  const outSize = results.glb.length;
  console.log(`Done. Output: ${(outSize / 1024 / 1024).toFixed(2)} MB (${outSize.toLocaleString()} bytes)`);
}

main().catch((err) => {
  console.error('Model optimization failed:', err);
  process.exit(1);
});
