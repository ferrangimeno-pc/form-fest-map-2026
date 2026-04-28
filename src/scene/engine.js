import * as THREE from 'three';
import { getDefaultCamera } from './controls.js';

let renderer, scene, camera;
let useWebGPU = false;
let resizeObserver = null;
const resizeCallbacks = [];

/**
 * Initialize the Three.js engine: scene, camera, renderer.
 * Tries WebGPU first, falls back to WebGL.
 * @param {HTMLElement} container - The DOM element to attach the canvas to.
 * @returns {{ renderer, scene, camera }}
 */
export async function initEngine(container) {
  // Scene
  scene = new THREE.Scene();

  // Camera — initial position depends on screen size (desktop vs mobile)
  const aspect = container.clientWidth / container.clientHeight;
  camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
  const def = getDefaultCamera();
  camera.position.set(def.position.x, def.position.y, def.position.z);
  camera.lookAt(def.target.x, def.target.y, def.target.z);

  // Using WebGL renderer for maximum compatibility.
  // Three.js v170 WebGPU renderer requires node-based materials for lights/shadows,
  // which is incompatible with standard DirectionalLight/AmbientLight.
  // WebGPU support can be added in a future phase once Three.js stabilizes the API.
  // antialias:false — EffectComposer renders into its own RT, so renderer MSAA
  // is unused but still allocates an MSAA framebuffer. SMAA (desktop) handles AA.
  // preserveDrawingBuffer:false — we never read back the canvas; keeping it true
  // blocks browser buffer-discard optimisations and costs a frame copy.
  renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: false });
  useWebGPU = false;
  if (import.meta.env.DEV) console.log('[Engine] Using WebGL renderer');

  // Pixel ratio capped at 1.5 on both desktop and mobile. On retina/4K
  // displays this is ~44% fewer fragments than DPR 2 with negligible
  // visual difference once SMAA (desktop) / grain (mobile) have run.
  const dprCap = 1.5;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  if (renderer.shadowMap) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // The scene is static (no moving meshes) — only the sun moves, and only
    // every ~2s in live mode. Disable auto-update so Three doesn't re-render
    // the 2048² shadow map every frame. lighting.js flags it dirty whenever
    // the sun position/intensity actually changes. Huge GPU save on rotate.
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true; // render shadow once at startup
  }

  container.appendChild(renderer.domElement);

  // Handle resize via ResizeObserver — fires on initial layout settle AND whenever
  // the container size changes (embed resize, orientation change, browser chrome shift).
  // This replaces window.addEventListener('resize') which misses the critical first-load
  // layout settle on mobile Safari/Chrome, causing a distorted render.
  const onResize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return; // container not visible yet
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    // Notify other systems (post-processing, etc.)
    for (const cb of resizeCallbacks) cb(w, h);
  };
  resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(container);

  return { renderer, scene, camera, isWebGPU: useWebGPU };
}

export function getRenderer() { return renderer; }
export function getScene() { return scene; }
export function getCamera() { return camera; }
export function isWebGPU() { return useWebGPU; }
/** Register a callback that fires on every container resize with (width, height). */
export function onResizeSubscribe(cb) { resizeCallbacks.push(cb); }
