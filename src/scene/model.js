import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const MODEL_PATH = 'assets/model/formFestMap.glb';

/**
 * Meshes to hide after loading.
 * These are unwanted objects from the Blender export (bounding volumes, default cubes, etc.)
 * Add mesh names here to hide them. Easy to update when the model is re-exported.
 */
const HIDDEN_MESHES = [
  'Cube', // Default Blender cube left in scene
];

/**
 * Meshes that must NOT cast shadows.
 * Roads/paths sit on the terrain — they receive shadows from buildings
 * but should never cast shadows themselves (avoids floating-road shadow artifacts).
 */
const NO_SHADOW_CAST = [
  'maposm_roads_residential',
  'Road_Trimmed',
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

            // Render both sides of all faces — fixes disappearing walls,
            // water, and thin geometry when viewed from the back.
            // Shadow maps only need front faces — halves shadow pass fragment work.
            // Handles both single materials and material arrays.
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((mat) => {
              if (mat) {
                mat.side = THREE.DoubleSide;
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
              child.material = child.material.map(m => { const c = m.clone(); c.side = THREE.DoubleSide; c.shadowSide = THREE.FrontSide; return c; });
            } else {
              child.userData.originalMaterial = child.material.clone();
              const ownedMat = child.material.clone();
              ownedMat.side = THREE.DoubleSide;
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
            console.log(`[Model] Hidden unwanted mesh: "${name}"`);
          }
        });

        // Disable shadow casting on road/path meshes
        NO_SHADOW_CAST.forEach((name) => {
          const mesh = meshes[name];
          if (mesh) {
            mesh.castShadow = false;
            console.log(`[Model] Shadow cast disabled: "${name}"`);
          }
        });

        // Terrain self-shadowing fix: use BackSide shadow casting so the
        // natural offset between back faces and the lit surface lets
        // terrain slopes cast visible shadows on themselves.
        const terrain = meshes['Terrain_Step_Terrace_CamrCop'];
        if (terrain) {
          const mats = Array.isArray(terrain.material) ? terrain.material : [terrain.material];
          mats.forEach((mat) => { if (mat) mat.shadowSide = THREE.BackSide; });
          console.log('[Model] Terrain shadowSide set to BackSide for self-shadowing');
        }

        scene.add(modelRoot);
        dracoLoader.dispose();

        console.log(`[Model] Loaded. Meshes indexed: ${Object.keys(meshes).length}`);
        console.log('[Model] Mesh names:', Object.keys(meshes));

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
