/**
 * DEV TOOL: Mesh Label Overlay
 * Shows the name of every 3D mesh floating above it in the scene.
 * Use this to identify which mesh name corresponds to which real-world location,
 * then update pinPosition in locations.json and modelMap.js accordingly.
 */
import * as THREE from 'three';

let labelOverlay = null;
let labels = [];
let running = false;
let rafId = null;
const _v3 = new THREE.Vector3();

/**
 * Call once at startup to create the overlay container.
 * @param {HTMLElement} container - #map-container
 */
export function initMeshLabels(container) {
  labelOverlay = document.createElement('div');
  labelOverlay.id = 'mesh-label-overlay';
  labelOverlay.style.cssText = `
    position: absolute; top: 0; left: 0;
    width: 100%; height: 100%;
    pointer-events: none;
    z-index: 20;
    overflow: hidden;
    display: none;
  `;
  container.appendChild(labelOverlay);
}

/**
 * Toggle mesh labels on/off.
 * @returns {boolean} true if now showing
 */
export function toggleMeshLabels() {
  if (running) {
    _hide();
    return false;
  } else {
    _show();
    return true;
  }
}

export function isMeshLabelsVisible() { return running; }

function _show() {
  const scene = window.__debugScene;
  if (!scene || !labelOverlay) return;

  labelOverlay.style.display = '';
  labels = [];

  const seen = new Set();
  scene.traverse((child) => {
    if (!child.isMesh || !child.name || child.name === 'Cube') return;

    // Skip multi-material duplicates (same name, just different material index)
    const baseName = child.name.replace(/_\d+$/, '');
    if (seen.has(baseName)) return;
    seen.add(baseName);

    const wp = new THREE.Vector3();
    child.getWorldPosition(wp);
    // Offset Y up so label appears above the mesh surface
    wp.y += 0.5;

    const el = document.createElement('div');
    el.textContent = baseName;
    el.style.cssText = `
      position: absolute; left: 0; top: 0;
      background: rgba(0, 0, 0, 0.75);
      color: #FFD700;
      font-family: monospace;
      font-size: 0.55rem;
      font-weight: bold;
      padding: 0.15rem 0.35rem;
      border-radius: 0.2rem;
      white-space: nowrap;
      pointer-events: none;
      will-change: transform;
      border: 1px solid rgba(255,215,0,0.4);
    `;
    labelOverlay.appendChild(el);
    labels.push({ el, worldPos: wp });
  });

  running = true;
  _loop();
}

function _hide() {
  running = false;
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  if (labelOverlay) {
    labelOverlay.style.display = 'none';
    labelOverlay.innerHTML = '';
  }
  labels = [];
}

function _loop() {
  if (!running) return;

  const camera = window.__debugCamera;
  if (camera && labelOverlay) {
    const w = labelOverlay.parentElement.clientWidth;
    const h = labelOverlay.parentElement.clientHeight;

    if (w && h) {
      camera.updateMatrixWorld(true);
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

      labels.forEach(({ el, worldPos }) => {
        _v3.copy(worldPos);
        _v3.project(camera);

        if (_v3.z > 1) { el.style.display = 'none'; return; }

        const sx = (_v3.x * 0.5 + 0.5) * w;
        const sy = (-_v3.y * 0.5 + 0.5) * h;

        el.style.display = '';
        el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%)`;
      });
    }
  }

  rafId = requestAnimationFrame(_loop);
}
