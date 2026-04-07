import * as THREE from 'three';

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
  const isDesktop = container.clientWidth >= 768;
  if (isDesktop) {
    camera.position.set(-0.888, 4.228, 5.781);
    camera.lookAt(0.0, 0.0, 0.0);
  } else {
    camera.position.set(8.083, 8.083, 8.083);
    camera.lookAt(0, 0, 0);
  }

  // Using WebGL renderer for maximum compatibility.
  // Three.js v170 WebGPU renderer requires node-based materials for lights/shadows,
  // which is incompatible with standard DirectionalLight/AmbientLight.
  // WebGPU support can be added in a future phase once Three.js stabilizes the API.
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  useWebGPU = false;
  console.log('[Engine] Using WebGL renderer');

  // Common renderer config
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  if (renderer.shadowMap) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
