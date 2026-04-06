/**
 * Converts GLTF+BIN → GLB (single binary file).
 * Run: npm run optimize-model
 */
import gltfPipeline from 'gltf-pipeline';
const { gltfToGlb } = gltfPipeline;
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const INPUT_GLTF = resolve(ROOT, '3d map', 'formFestMap.gltf');
const OUTPUT_GLB = resolve(ROOT, 'public', 'assets', 'model', 'formFestMap.glb');

async function main() {
  console.log('Reading GLTF:', INPUT_GLTF);
  const gltf = JSON.parse(readFileSync(INPUT_GLTF, 'utf8'));

  const options = {
    resourceDirectory: resolve(ROOT, '3d map') + '/',
  };

  console.log('Converting to GLB...');
  const results = await gltfToGlb(gltf, options);

  writeFileSync(OUTPUT_GLB, results.glb);

  const inputBinSize = readFileSync(resolve(ROOT, '3d map', 'formFestMap.bin')).length;
  const outputSize = results.glb.length;

  console.log('Done!');
  console.log(`  Input BIN:  ${(inputBinSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Output GLB: ${(outputSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Output:     ${OUTPUT_GLB}`);
}

main().catch((err) => {
  console.error('Model optimization failed:', err);
  process.exit(1);
});
