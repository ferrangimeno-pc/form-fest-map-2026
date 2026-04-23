import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const MODEL_PATH = 'assets/model/formFestMap.glb';

/**
 * Meshes to hide after loading — residual scatter from the 23/04/2026 export:
 *   - `CampingTent` — stray cone that isn't part of the tent cluster.
 *   - 11 small vehicle nodes (`Truck`/`Van`/`Car`/`Hatchback` + suffixed). The
 *     parking-lot surface (`Placement_ParkingLot`) stays visible as scenery;
 *     the RV pin maps to the `Placement_ParkingLot.001` van cluster.
 */
const HIDDEN_MESHES = [
  'CampingTent',
  'Truck', 'Van', 'Car', 'Hatchback',
  'Truck001', 'Van001', 'Car001', 'Hatchback002',
  'Car002', 'Car003', 'Car005',
];

/**
 * Substrings that mark a mesh as genuinely needing DoubleSide rendering —
 * thin fabric, foliage cards, flags, water surface, paper-like props.
 * Everything else defaults to FrontSide, which halves fragment shader
 * invocations for closed solids like buildings, terrain, RVs, and roads.
 *
 * Any material with alphaTest > 0 (alpha-cutout foliage) is also forced to
 * DoubleSide regardless of name — that covers tree leaf cards reliably even
 * if the mesh naming doesn't match.
 */
const DOUBLE_SIDED_PATTERNS = [
  'Tent',        // CampingTents, glamping canvas
  'Tree',        // tree cards / foliage
  'Foliage',
  'Leaf',
  'Flag',
  'Banner',
  'Cloth',
  'Fabric',
  'Canopy',
  'Water',       // pool water (already custom shader, but belt-and-braces)
  'Cube001_4',   // explicit pool mesh name
];

/** Returns true if a mesh name or any of its materials require DoubleSide. */
function needsDoubleSide(mesh) {
  if (mesh.name && DOUBLE_SIDED_PATTERNS.some((p) => mesh.name.includes(p))) return true;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return mats.some((m) => m && m.alphaTest && m.alphaTest > 0);
}

/**
 * Meshes that must NOT cast shadows.
 * Roads/paths sit on the terrain — they receive shadows from buildings
 * but should never cast shadows themselves (avoids floating-road shadow artifacts).
 */
const NO_SHADOW_CAST = [
  'maposm_roads_residential',
  'Road_Trimmed',
  'Plane002',   // parking/road surface planes — same treatment as roads
  'Plane003',
];

let modelRoot = null;
let meshes = {};

/**
 * Load the GLB model with Draco support and progress tracking.
 * @param {THREE.Scene} scene
 * @param {(progress: number) => void} onProgress - 0..1
 * @returns {Promise<THREE.Group>}
 */
export async function loadModel(scene, onProgress) {
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('/draco/');
  dracoLoader.setDecoderConfig({ type: 'js' });

  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);

  return new Promise((resolve, reject) => {
    loader.load(
      MODEL_PATH,
      (gltf) => {
        modelRoot = gltf.scene;

        // Enable shadows on all meshes and index them by name
        modelRoot.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;

            // Side mode: FrontSide by default — halves fragment shader work for
            // closed solids (terrain, buildings, RVs, roads). DoubleSide is
            // opted-in per mesh via DOUBLE_SIDED_PATTERNS or any material with
            // alphaTest > 0 (catches foliage cards). shadowSide is always
            // FrontSide — shadow maps only need front faces regardless.
            const sideMode = needsDoubleSide(child) ? THREE.DoubleSide : THREE.FrontSide;

            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((mat) => {
              if (mat) {
                mat.side = sideMode;
                mat.shadowSide = THREE.FrontSide;
                // Fix Blender export artifact: opaque materials are often incorrectly
                // marked as transparent, causing render sorting issues.
                // EXCEPTION: materials with alphaTest > 0 (e.g. tree foliage) legitimately
                // need alpha cutout — don't strip transparency from those.
                if (mat.alphaTest === 0) {
                  mat.transparent = false;
                  mat.depthWrite = true;
                  mat.opacity = 1.0;
                }
              }
            });

            // Re-enable frustum culling — let the GPU skip off-screen meshes.
            // Large/offset geometry that was disappearing was likely a bounding
            // sphere issue; Three.js recomputes bounds on load so this should be fine.
            child.frustumCulled = true;

            // Store original material for highlight/restore, then replace with
            // an owned clone so no GLTF-shared materials remain. This makes
            // material disposal safe when highlighting/dimming categories.
            if (Array.isArray(child.material)) {
              child.userData.originalMaterial = child.material.map(m => m.clone());
              child.material = child.material.map(m => { const c = m.clone(); c.side = sideMode; c.shadowSide = THREE.FrontSide; return c; });
            } else {
              child.userData.originalMaterial = child.material.clone();
              const ownedMat = child.material.clone();
              ownedMat.side = sideMode;
              ownedMat.shadowSide = THREE.FrontSide;
              child.material = ownedMat;
            }

            // Index by name for config mapping
            if (child.name) {
              meshes[child.name] = child;
            }
          }
        });

        // Hide unwanted meshes
        HIDDEN_MESHES.forEach((name) => {
          const mesh = meshes[name];
          if (mesh) {
            mesh.visible = false;
            if (import.meta.env.DEV) console.log(`[Model] Hidden unwanted mesh: "${name}"`);
          }
        });

        // Disable shadow casting on road/path meshes
        NO_SHADOW_CAST.forEach((name) => {
          const mesh = meshes[name];
          if (mesh) {
            mesh.castShadow = false;
            if (import.meta.env.DEV) console.log(`[Model] Shadow cast disabled: "${name}"`);
          }
        });

        // Terrain self-shadowing fix: use BackSide shadow casting so the
        // natural offset between back faces and the lit surface lets
        // terrain slopes cast visible shadows on themselves.
        const terrain = meshes['Terrain_Step_Terrace_CamCrop'];
        if (terrain) {
          const mats = Array.isArray(terrain.material) ? terrain.material : [terrain.material];
          mats.forEach((mat) => { if (mat) mat.shadowSide = THREE.BackSide; });
        }

        // Scale correction: new model was exported at ~37× larger scale
        // (Blender cm vs m unit mismatch). Factor derived from old/new bounds ratio.
        // TODO: ask artist to re-export with "Apply Unit" enabled in Blender to remove this.
        modelRoot.scale.setScalar(0.027);

        scene.add(modelRoot);
        dracoLoader.dispose();

        // Force matrixWorld computation before the split (it's normally lazy-updated
        // on the first render, but we need correct world positions right now).
        modelRoot.updateMatrixWorld(true);

        // Split maposm_buildings011 into GS sub-cluster and non-GS remainder
        split011Meshes();

        // Fix terraced paved areas that export ~2× brighter than the main terrain.
        // NOTE: Vert001/Vert001_1 are children of Placement_Tree_Maple, and
        // Vert002/Vert002_1 are children of Placement_Tree_Cyprus — do NOT touch them.
        const TERRAIN_COLOR = new THREE.Color(0.268, 0.260, 0.244);
        const makeTerrainMat = () => new THREE.MeshStandardMaterial({
          color: TERRAIN_COLOR,
          metalness: 0,
          roughness: 0.85,
          envMapIntensity: 0,
          side: THREE.DoubleSide,
          shadowSide: THREE.FrontSide,
        });

        [
          'Terrain_Terraced_CamCrop001', 'Terrain_Terraced_CamCrop002',
        ].forEach((name) => {
          const mesh = meshes[name];
          if (!mesh) return;
          const newMat = makeTerrainMat();
          mesh.material = newMat;
          mesh.userData.originalMaterial = newMat.clone();
        });

        console.log(`[Model] Loaded. Meshes indexed: ${Object.keys(meshes).length}`);
        if (import.meta.env.DEV) console.log('[Model] Mesh names:', Object.keys(meshes));

        if (onProgress) onProgress(1);
        resolve(modelRoot);
      },
      (xhr) => {
        if (xhr.total > 0 && onProgress) {
          onProgress(xhr.loaded / xhr.total);
        }
      },
      (err) => {
        console.error('[Model] Load failed:', err);
        reject(err);
      }
    );
  });
}


/**
 * Split a mesh's geometry into two parts: triangles whose world-space (x,z)
 * centroid falls inside `box`, and everything else.
 * Returns { inside: BufferGeometry|null, outside: BufferGeometry|null }.
 *
 * The 011 OSM building mesh spans multiple physically separate sub-clusters.
 * This lets us isolate just the Guest-Services cluster at load time without
 * requiring a Blender re-export.
 */
function splitGeometryByWorldBox(geometry, matrixWorld, box) {
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const uv  = geometry.attributes.uv;
  const idx = geometry.index;
  const mw  = matrixWorld.elements;

  const triCount = idx ? idx.count / 3 : pos.count / 3;

  const buckets = { inside: [], outside: [] };
  for (let t = 0; t < triCount; t++) {
    const i0 = idx ? idx.getX(t * 3)     : t * 3;
    const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    // World-space centroid (x, z only needed for the box test)
    let cx = 0, cz = 0;
    for (const vi of [i0, i1, i2]) {
      const lx = pos.getX(vi), ly = pos.getY(vi), lz = pos.getZ(vi);
      cx += mw[0] * lx + mw[4] * ly + mw[8]  * lz + mw[12];
      cz += mw[2] * lx + mw[6] * ly + mw[10] * lz + mw[14];
    }
    cx /= 3; cz /= 3;
    const key = (cx >= box.xMin && cx <= box.xMax && cz >= box.zMin && cz <= box.zMax)
      ? 'inside' : 'outside';
    buckets[key].push(i0, i1, i2);
  }

  function buildGeo(indices) {
    if (!indices.length) return null;
    const vertMap = new Map();
    const positions = [], normals = nor ? [] : null, uvs = uv ? [] : null;
    const newIdx = [];
    let nextV = 0;
    for (const vi of indices) {
      if (!vertMap.has(vi)) {
        vertMap.set(vi, nextV++);
        positions.push(pos.getX(vi), pos.getY(vi), pos.getZ(vi));
        if (normals) normals.push(nor.getX(vi), nor.getY(vi), nor.getZ(vi));
        if (uvs)     uvs.push(uv.getX(vi), uv.getY(vi));
      }
      newIdx.push(vertMap.get(vi));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (normals) geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    if (uvs)     geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(newIdx);
    return geo;
  }

  return { inside: buildGeo(buckets.inside), outside: buildGeo(buckets.outside) };
}

/**
 * Split the maposm_buildings011 primitives into Guest-Services and non-GS meshes.
 * The 011 GLTF node spans three physically separate building sub-clusters.
 * We isolate only the sub-cluster at the road junction (Cluster B, near bodega/bar area)
 * so only those buildings light up when Guest Services is selected.
 *
 * Mesh naming:
 *   maposm_buildings011_N      → kept as the non-GS portion (still indexed, not in modelMap)
 *   maposm_buildings011_N_gs   → GS-only portion (added to meshes index, mapped in modelMap)
 */
function split011Meshes() {
  // World-space (post 0.027 scale) bounding box enclosing the GS sub-cluster only.
  // Cluster B: x ∈ [-5.1, -4.0], z ∈ [-2.1, -0.9]
  const GS_BOX = { xMin: -5.1, xMax: -4.0, zMin: -2.1, zMax: -0.9 };

  ['maposm_buildings011_1', 'maposm_buildings011_2', 'maposm_buildings011_3'].forEach((name) => {
    const src = meshes[name];
    if (!src) return;

    const { inside, outside } = splitGeometryByWorldBox(src.geometry, src.matrixWorld, GS_BOX);

    function makeMesh(geo, newName) {
      if (!geo) return;
      const mat = Array.isArray(src.userData.originalMaterial)
        ? src.userData.originalMaterial.map(m => { const c = m.clone(); c.side = THREE.DoubleSide; c.shadowSide = THREE.FrontSide; return c; })
        : (() => { const c = src.userData.originalMaterial.clone(); c.side = THREE.DoubleSide; c.shadowSide = THREE.FrontSide; return c; })();
      const m = new THREE.Mesh(geo, mat);
      m.name = newName;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = true;
      m.userData.originalMaterial = Array.isArray(mat) ? mat.map(x => x.clone()) : mat.clone();
      src.parent.add(m);
      meshes[newName] = m;
    }

    makeMesh(inside,  name + '_gs');
    makeMesh(outside, name + '_nonGS');

    // Remove original split-source mesh from the scene and index;
    // its geometry is now covered by the two new meshes.
    src.parent.remove(src);
    delete meshes[name];
  });
}

/**
 * Get a mesh by its GLTF object name.
 */
export function getMesh(name) {
  return meshes[name] || null;
}

/**
 * Get all indexed mesh names.
 */
export function getMeshNames() {
  return Object.keys(meshes);
}

/**
 * Get the model root group.
 */
export function getModelRoot() {
  return modelRoot;
}

/**
 * Dispose a mesh's current material(s), freeing GPU resources.
 * Skips originalMaterial and protectedMaterial to avoid double-free.
 */
function disposeMeshMaterial(mesh) {
  if (!mesh.material || mesh.userData.protectedMaterial) return;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  mats.forEach((m) => { if (m && m.dispose) m.dispose(); });
}

/**
 * Clone a material (or array of materials) preserving DoubleSide + FrontSide shadows.
 */
function cloneMaterial(material) {
  if (Array.isArray(material)) {
    return material.map((m) => {
      const c = m.clone();
      c.side = THREE.DoubleSide;
      c.shadowSide = THREE.FrontSide;
      return c;
    });
  }
  const c = material.clone();
  c.side = THREE.DoubleSide;
  c.shadowSide = THREE.FrontSide;
  return c;
}

/**
 * Tint meshes by lerping original material color toward a category color.
 * @param {string[]} names - GLTF object names
 * @param {number} color - Hex category color
 * @param {number} intensity - 0..1 blend factor (0 = original, 1 = full category color)
 */
export function tintMeshes(names, color, intensity) {
  const catColor = new THREE.Color(color);
  names.forEach((name) => {
    const mesh = meshes[name];
    if (!mesh || mesh.userData.protectedMaterial) return;
    const origMats = Array.isArray(mesh.userData.originalMaterial)
      ? mesh.userData.originalMaterial
      : [mesh.userData.originalMaterial];
    if (!origMats[0]) return;
    const newMats = origMats.map((mat) => {
      const c = mat.clone();
      c.color.lerp(catColor, intensity);
      c.emissive.copy(catColor);
      c.emissiveIntensity = intensity * 0.2;
      c.side = THREE.DoubleSide;
      c.shadowSide = THREE.FrontSide;
      return c;
    });
    disposeMeshMaterial(mesh);
    mesh.material = Array.isArray(mesh.userData.originalMaterial) ? newMats : newMats[0];
  });
}

/**
 * Highlight meshes by setting emissive color.
 * @param {string[]} names - GLTF object names
 * @param {number} color - Hex color (e.g., 0xFF6B35)
 */
export function highlightMeshes(names, color) {
  names.forEach((name) => {
    const mesh = meshes[name];
    if (!mesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const newMats = mats.map((mat) => {
      const c = mat.clone();
      c.color = new THREE.Color(color);
      c.emissive = new THREE.Color(color);
      c.emissiveIntensity = 0.2;
      c.side = THREE.DoubleSide;
      c.shadowSide = THREE.FrontSide;
      return c;
    });
    disposeMeshMaterial(mesh);
    mesh.material = Array.isArray(mesh.material) ? newMats : newMats[0];
  });
}

/**
 * Restore all meshes to original materials.
 */
export function restoreAllMeshes() {
  Object.values(meshes).forEach((mesh) => {
    if (mesh.userData.protectedMaterial) return;
    if (mesh.userData.originalMaterial) {
      disposeMeshMaterial(mesh);
      mesh.material = cloneMaterial(mesh.userData.originalMaterial);
    }
  });
}

/**
 * Dim all meshes except specified ones.
 * @param {string[]} exceptNames - Mesh names to NOT dim
 * @param {number} dimAmount - 0..1 how much to darken
 */
export function dimMeshesExcept(exceptNames, dimAmount = 0.18) {
  const exceptSet = new Set(exceptNames);
  Object.entries(meshes).forEach(([name, mesh]) => {
    if (exceptSet.has(name)) return;
    if (mesh.userData.protectedMaterial) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const newMats = mats.map((mat) => {
      const c = mat.clone();
      c.color.multiplyScalar(1 - dimAmount);
      c.side = THREE.DoubleSide;
      c.shadowSide = THREE.FrontSide;
      return c;
    });
    disposeMeshMaterial(mesh);
    mesh.material = Array.isArray(mesh.material) ? newMats : newMats[0];
  });
}
