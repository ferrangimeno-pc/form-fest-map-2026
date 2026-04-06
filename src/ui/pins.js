import * as THREE from 'three';

let container = null;
let overlayEl = null;
const pins = new Map(); // locationId → { el, position3D }

// Reusable vector (avoid GC)
const _v3 = new THREE.Vector3();

/**
 * Initialize the pin overlay container.
 * @param {HTMLElement} containerEl
 */
export function initPinRenderer(containerEl) {
  container = containerEl;

  overlayEl = document.createElement('div');
  overlayEl.id = 'pin-overlay';
  overlayEl.style.cssText = `
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
    pointer-events: none;
    z-index: 10;
    overflow: hidden;
    will-change: transform;
  `;
  container.appendChild(overlayEl);

  return overlayEl;
}

/**
 * Create pin labels for locations in a category.
 * @param {Array} locations - Array of location objects from JSON
 * @param {THREE.Scene} scene - unused, kept for API compat
 * @param {(locationId: string) => void} onClick
 */
export function showPins(locations, scene, onClick) {
  hidePins(scene);

  locations.forEach((loc) => {
    const el = document.createElement('div');
    el.className = 'pin-label';
    el.textContent = loc.name;
    el.style.pointerEvents = 'auto';

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick(loc.id);
    });

    overlayEl.appendChild(el);

    pins.set(loc.id, {
      el,
      position3D: new THREE.Vector3(
        loc.pinPosition.x,
        loc.pinPosition.y,
        loc.pinPosition.z
      ),
    });
  });
}

/**
 * Remove all pins.
 */
export function hidePins(scene) {
  pins.forEach(({ el }) => {
    if (el.parentNode) el.parentNode.removeChild(el);
  });
  pins.clear();
}

/**
 * Show a single hover pin without disturbing existing category pins.
 * Uses the reserved '__hover__' key in the pins map.
 *
 * JS sets `style.transform` on the element every frame for screen positioning.
 * The entrance/exit animations use the CSS standalone `translate` property instead,
 * which stacks on top of `transform` without any conflict — the whole pin (label +
 * ::after stem) animates together cleanly.
 */
export function showHoverPin(location, onClick) {
  hideHoverPin();

  const el = document.createElement('div');
  // No animation class yet — element starts invisible while renderPins
  // locks it into the correct screen position for one full paint cycle.
  el.className = 'pin-label';
  el.style.opacity = '0';
  el.style.pointerEvents = 'auto';

  const textEl = document.createElement('span');
  textEl.className = 'pin-label__text';
  textEl.textContent = location.name;
  el.appendChild(textEl);

  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick(location.id);
  });

  overlayEl.appendChild(el);
  pins.set('__hover__', {
    el,
    position3D: new THREE.Vector3(
      location.pinPosition.x,
      location.pinPosition.y,
      location.pinPosition.z
    ),
  });

  // Double-rAF: first frame positions the element (renderPins runs),
  // second frame the browser has painted it into a compositor layer.
  // Only then do we trigger the animation — no mid-animation layer promotion,
  // no JS-transform vs CSS-animation conflict on frame 0.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      // Guard: pin may have been removed while we waited (fast mouse movement)
      const entry = pins.get('__hover__');
      if (!entry || entry.el !== el) return;
      el.style.opacity = '';
      el.classList.add('pin-label--hover');
    });
  });
}

/**
 * Remove only the hover pin with an exit animation, leaving category pins intact.
 */
export function hideHoverPin() {
  const entry = pins.get('__hover__');
  if (!entry) return;

  // Pull out of map immediately — stops renderPins from updating it each frame.
  pins.delete('__hover__');

  const { el } = entry;
  if (!el.isConnected) return;

  // Swap entrance → exit animation, then remove from DOM once it finishes.
  el.classList.remove('pin-label--hover');
  el.classList.add('pin-label--leaving');
  el.addEventListener('animationend', () => {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, { once: true });
}

/**
 * Update pin screen positions by projecting 3D→2D.
 * Uses transform-based positioning (GPU-composited) instead of left/top.
 * Called after renderer.render() so camera matrices are already current.
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 */
export function renderPins(scene, camera) {
  if (pins.size === 0) return;

  const w = container.clientWidth;
  const h = container.clientHeight;
  if (w === 0 || h === 0) return;

  // Ensure matrixWorldInverse is current (safety for Three.js v170+
  // where Camera.updateMatrixWorld may not auto-invert)
  camera.updateMatrixWorld(true);
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

  pins.forEach(({ el, position3D }) => {
    // Standard Three.js projection: world → NDC
    _v3.set(position3D.x, position3D.y, position3D.z);
    _v3.project(camera);

    // Behind camera
    if (_v3.z > 1) {
      el.style.display = 'none';
      return;
    }

    // NDC (-1..1) to screen pixels
    const sx = ( _v3.x * 0.5 + 0.5) * w;
    const sy = (-_v3.y * 0.5 + 0.5) * h;

    // Use transform for positioning (GPU-composited, avoids layout thrash).
    // First translate positions the pin point, second centers the label above it.
    el.style.display = '';
    el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, calc(-100% - 1.5rem - 30px))`;
  });
}

export function getPinRenderer() { return overlayEl; }
