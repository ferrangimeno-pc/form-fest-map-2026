// Full GLB node dump — INCLUDING empty/parent nodes and hierarchy.
// Goal: find ALL geometry, including nodes whose MESH might be inherited via
// instancing or whose children have meshes.
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GLB = resolve(__dirname, '../public/assets/model/formFestMap.glb');

// --- 1) Print raw JSON chunk ---
const buf = readFileSync(GLB);
const chunkLength = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + chunkLength).toString('utf8'));

console.log('=== RAW GLTF NODES (' + json.nodes.length + ') ===');
json.nodes.forEach((n, i) => {
  const hasMesh = n.mesh !== undefined;
  const meshInfo = hasMesh ? `mesh=${n.mesh} (${json.meshes[n.mesh]?.primitives?.length ?? '?'} prims, name="${json.meshes[n.mesh]?.name ?? ''}")` : '(no mesh)';
  const children = n.children ? ` children=[${n.children.join(',')}]` : '';
  const t = n.translation ? ` t=[${n.translation.map(v=>v.toFixed(2)).join(',')}]` : '';
  const s = n.scale ? ` s=[${n.scale.map(v=>v.toFixed(2)).join(',')}]` : '';
  console.log(`[${i}] "${n.name ?? '(unnamed)'}"  ${meshInfo}${t}${s}${children}`);
});

console.log('\n=== SCENES ===');
json.scenes?.forEach((s, i) => {
  console.log(`scene[${i}] "${s.name ?? ''}" roots=[${s.nodes?.join(',') ?? ''}]`);
});

console.log('\n=== MESHES (' + (json.meshes?.length ?? 0) + ') ===');
json.meshes?.forEach((m, i) => {
  const prims = m.primitives.map((p, j) => `prim${j}(mat=${p.material})`).join(', ');
  console.log(`mesh[${i}] "${m.name ?? ''}" → ${prims}`);
});

// Count parent->child relationships
const parentMap = new Map(); // childIdx -> parentIdx
json.nodes.forEach((n, i) => {
  if (n.children) n.children.forEach((c) => parentMap.set(c, i));
});

console.log('\n=== NODE HIERARCHY ROOTS ===');
json.nodes.forEach((n, i) => {
  if (!parentMap.has(i)) {
    console.log(`root: [${i}] "${n.name}" ${n.mesh !== undefined ? '(has mesh)' : ''} ${n.children ? `→ ${n.children.length} children` : ''}`);
  }
});

// Look for anything with "tent", "camp", "rv", "trailer", "glamp", "placement" in name
console.log('\n=== NODES MATCHING camping/glamping keywords ===');
const keywords = /tent|camp|rv|trailer|glamp|placement|vert/i;
json.nodes.forEach((n, i) => {
  if (n.name && keywords.test(n.name)) {
    const parent = parentMap.get(i);
    const parentName = parent !== undefined ? json.nodes[parent]?.name : '(root)';
    console.log(`[${i}] "${n.name}" parent=${parentName} mesh=${n.mesh ?? 'NONE'} children=${n.children?.length ?? 0}`);
  }
});

// Also: anything with mesh assigned that I might have missed
console.log('\n=== ALL MESH-BEARING NODES ===');
const meshNodes = json.nodes.filter(n => n.mesh !== undefined);
console.log(`Count: ${meshNodes.length} (inspector found this many)`);
