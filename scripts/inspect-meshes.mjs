// Diagnostic: walk the GLB and print every mesh node's name, bbox, center, size, and triangle count.
// Used to find camping / glamping / glamping-rvs geometry after the model swap.
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GLB = resolve(__dirname, '../public/assets/model/formFestMap.glb');

const io = new NodeIO()
  .registerExtensions(KHRONOS_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  });

const doc = await io.read(GLB);
const root = doc.getRoot();
const SCALE = 0.027;

function getNodeWorldMatrix(node) {
  // gltf-transform doesn't expose world matrix directly; compute manually
  const chain = [];
  let cur = node;
  while (cur) {
    chain.unshift(cur);
    const parents = cur.listParents().filter(p => p.propertyType === 'Node');
    cur = parents[0] || null;
  }
  // multiply matrices
  const mat = mat4Identity();
  for (const n of chain) {
    const t = n.getTranslation();
    const r = n.getRotation();
    const s = n.getScale();
    const m = mat4Compose(t, r, s);
    mat4Multiply(mat, m);
  }
  return mat;
}
function mat4Identity(){return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];}
function mat4Compose(t,r,s){
  const [x,y,z,w]=r;
  const x2=x+x,y2=y+y,z2=z+z;
  const xx=x*x2,xy=x*y2,xz=x*z2;
  const yy=y*y2,yz=y*z2,zz=z*z2;
  const wx=w*x2,wy=w*y2,wz=w*z2;
  const [sx,sy,sz]=s;
  return [
    (1-(yy+zz))*sx,(xy+wz)*sx,(xz-wy)*sx,0,
    (xy-wz)*sy,(1-(xx+zz))*sy,(yz+wx)*sy,0,
    (xz+wy)*sz,(yz-wx)*sz,(1-(xx+yy))*sz,0,
    t[0],t[1],t[2],1,
  ];
}
function mat4Multiply(a,b){
  const r=new Array(16);
  for(let i=0;i<4;i++)for(let j=0;j<4;j++){
    r[i*4+j]=a[0*4+j]*b[i*4+0]+a[1*4+j]*b[i*4+1]+a[2*4+j]*b[i*4+2]+a[3*4+j]*b[i*4+3];
  }
  for(let i=0;i<16;i++)a[i]=r[i];
  return a;
}
function transformPoint(m, p){
  const [x,y,z]=p;
  return [
    m[0]*x+m[4]*y+m[8]*z+m[12],
    m[1]*x+m[5]*y+m[9]*z+m[13],
    m[2]*x+m[6]*y+m[10]*z+m[14],
  ];
}

const rows = [];
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const world = getNodeWorldMatrix(node);
  let min=[Infinity,Infinity,Infinity], max=[-Infinity,-Infinity,-Infinity];
  let triCount=0;
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    const arr = pos.getArray();
    const count = pos.getCount();
    for (let i=0;i<count;i++){
      const p=[arr[i*3],arr[i*3+1],arr[i*3+2]];
      const w=transformPoint(world,p);
      for(let k=0;k<3;k++){
        if(w[k]<min[k])min[k]=w[k];
        if(w[k]>max[k])max[k]=w[k];
      }
    }
    const idx=prim.getIndices();
    triCount += idx ? idx.getCount()/3 : count/3;
  }
  const cx=(min[0]+max[0])/2, cy=(min[1]+max[1])/2, cz=(min[2]+max[2])/2;
  const sx=max[0]-min[0], sy=max[1]-min[1], sz=max[2]-min[2];
  rows.push({
    name: node.getName(),
    prims: mesh.listPrimitives().length,
    tris: Math.round(triCount),
    // Scaled world coords (post 0.027)
    cx:+(cx*SCALE).toFixed(3), cy:+(cy*SCALE).toFixed(3), cz:+(cz*SCALE).toFixed(3),
    sx:+(sx*SCALE).toFixed(3), sy:+(sy*SCALE).toFixed(3), sz:+(sz*SCALE).toFixed(3),
  });
}

// Sort by Z descending (south→north) then X
rows.sort((a,b)=>a.cz-b.cz || a.cx-b.cx);

console.log('name'.padEnd(32),'prims'.padStart(5),'tris'.padStart(7), 'cx'.padStart(8),'cy'.padStart(6),'cz'.padStart(8), 'sx'.padStart(6),'sy'.padStart(6),'sz'.padStart(6));
for (const r of rows) {
  console.log(
    r.name.padEnd(32),
    String(r.prims).padStart(5),
    String(r.tris).padStart(7),
    String(r.cx).padStart(8),
    String(r.cy).padStart(6),
    String(r.cz).padStart(8),
    String(r.sx).padStart(6),
    String(r.sy).padStart(6),
    String(r.sz).padStart(6),
  );
}

// Also group by "high triangle count" candidates — the camping tent grid should be hundreds+ of tents
console.log('\n--- TOP 15 BY TRIANGLE COUNT ---');
[...rows].sort((a,b)=>b.tris-a.tris).slice(0,15).forEach(r=>{
  console.log(r.name.padEnd(32), 'tris=',String(r.tris).padStart(7), 'center=(', r.cx, r.cy, r.cz, ') size=(', r.sx, r.sy, r.sz, ')');
});

// Look for anything in the camping/glamping area (z < -2, x between -7 and -2)
console.log('\n--- IN CAMPING/GLAMPING AREA (z<-2) ---');
rows.filter(r=>r.cz<-2).forEach(r=>{
  console.log(r.name.padEnd(32), 'tris=',String(r.tris).padStart(7), 'center=(', r.cx, r.cy, r.cz, ') size=(', r.sx, r.sy, r.sz, ')');
});
