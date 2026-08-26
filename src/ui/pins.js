import * as THREE from 'three';
import { CATEGORIES } from '../config/categories.js';

let container = null;
let overlayEl = null;
const pins = new Map(); // locationId → { el, position3D, ...adaptive fields }

// Reusable vector (avoid GC)
const _v3 = new THREE.Vector3();

// --- Adaptive overview pins (touch/mobile only) ---
// The all-pins-by-default touch view renders every location as a small
// category-colored dot, and promotes dots to full label chips only where
// there's screen room. The rule when labels contend for the same space:
// CLOSEST TO THE CAMERA WINS — labels live in the foreground and recede
// into dots with distance, so zooming toward an area labels it.
// A dot the user tapped (modal opened from it) is force-promoted and stays
// a full pin until another dot is tapped or the pin set is rebuilt.
const CATEGORY_COLOR = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.color]));

const STEM_PX = 54;     // 1.5rem (24px) + 30px — keep in sync with .pin-label::after
const DECLUTTER_MS = 150; // throttle for the label-collision pass
const PROMOTE_PAD = 8;  // extra clearance required to GAIN a label…
const KEEP_PAD = -2;    // …but keep an existing one until it truly collides (hysteresis)
const MAX_LABELS = 5;   // pacing cap: at most this many labels at once (nearest first)
const DEPTH_CUTOFF = 0.6; // only the nearest 60% of the visible depth range may label
let _hasAdaptive = false;
let _lastDeclutter = 0;
let _forcedId = null;   // locationId whose label is user-selected (dot was tapped)

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
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `Open ${loc.name}`);
    el.setAttribute('tabindex', '0');
    el.innerHTML = `<span class="pin-label__text">${loc.name}</span><svg class="pin-label__arrow" width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M4 1L9 6L4 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
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
 * Touch/mobile overview: create an adaptive pin per location — a category-colored
 * dot at the exact pin point, plus a regular label chip that renderPins' declutter
 * pass reveals only where there's screen room. Dot ↔ chip transitions are pure CSS
 * (`.pin-anchor--dot` class toggle), so promotions/demotions animate smoothly.
 * @param {Array} locations
 * @param {THREE.Scene} scene - unused, kept for API compat
 * @param {(locationId: string) => void} onClick
 */
export function showOverviewPins(locations, scene, onClick) {
  hidePins(scene);

  locations.forEach((loc, i) => {
    const el = document.createElement('div');
    el.className = 'pin-anchor pin-anchor--dot';
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `Open ${loc.name}`);
    el.setAttribute('tabindex', '0');
    el.style.animationDelay = `${i * 25}ms`; // staggered dot entrance

    const dot = document.createElement('span');
    dot.className = 'pin-anchor__dot';
    dot.style.setProperty('--dot-color', CATEGORY_COLOR[loc.category] || '#FFFFFF');
    el.appendChild(dot);

    const chip = document.createElement('div');
    chip.className = 'pin-label';
    chip.innerHTML = `<span class="pin-label__text">${loc.name}</span><svg class="pin-label__arrow" width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M4 1L9 6L4 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    el.appendChild(chip);

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      // Tapping a dot promotes it to a full pin (mirrors desktop, where the
      // clicked location always ends up with a visible label) and keeps it
      // promoted so the user retains context after closing the modal.
      _forcedId = loc.id;
      _lastDeclutter = 0; // re-evaluate on the next rendered frame
      onClick(loc.id);
    });

    overlayEl.appendChild(el);

    pins.set(loc.id, {
      el,
      chipEl: chip,
      position3D: new THREE.Vector3(
        loc.pinPosition.x,
        loc.pinPosition.y,
        loc.pinPosition.z
      ),
      id: loc.id,
      adaptive: true,
      labeled: false,
      visible: false,
      depth: 0,
      order: i,
      sx: 0,
      sy: 0,
    });
  });

  _hasAdaptive = true;
  _forcedId = null;
  _lastDeclutter = 0; // force a declutter pass on the next rendered frame
}

/**
 * Remove all pins.
 */
export function hidePins(scene) {
  pins.forEach(({ el }) => {
    if (el.parentNode) el.parentNode.removeChild(el);
  });
  pins.clear();
  _hasAdaptive = false;
  _forcedId = null;
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
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', `Open ${location.name}`);
  el.setAttribute('tabindex', '0');
  el.style.opacity = '0';
  el.style.pointerEvents = 'auto';

  const textEl = document.createElement('span');
  textEl.className = 'pin-label__text';
  textEl.textContent = location.name;
  el.appendChild(textEl);

  const arrowEl = document.createElement('span');
  arrowEl.className = 'pin-label__arrow';
  arrowEl.innerHTML = '<svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M4 1L9 6L4 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  el.appendChild(arrowEl);

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

  pins.forEach((entry) => {
    const { el, position3D } = entry;
    // Standard Three.js projection: world → NDC
    _v3.set(position3D.x, position3D.y, position3D.z);
    // World distance to camera (linear — NDC z compresses far distances,
    // which would skew the declutter pass's percentage-based depth cutoff).
    entry.depth = _v3.distanceTo(camera.position);
    _v3.project(camera);

    // Behind camera
    if (_v3.z > 1) {
      el.style.display = 'none';
      entry.visible = false;
      return;
    }

    // NDC (-1..1) to screen pixels
    const sx = ( _v3.x * 0.5 + 0.5) * w;
    const sy = (-_v3.y * 0.5 + 0.5) * h;
    entry.sx = sx;
    entry.sy = sy;
    entry.visible = true;

    // Use transform for positioning (GPU-composited, avoids layout thrash).
    // Regular pins: second translate centers the label chip above the point.
    // Adaptive pins: the anchor IS the point — children offset themselves in CSS
    // (dot centered on it, chip suspended stem-height above), so dot↔chip
    // morphs can be CSS-transitioned without fighting this per-frame transform.
    el.style.display = '';
    el.style.transform = entry.adaptive
      ? `translate(${sx}px, ${sy}px)`
      : `translate(${sx}px, ${sy}px) translate(-50%, calc(-100% - 1.5rem - 30px))`;
  });

  if (_hasAdaptive) {
    const now = performance.now();
    if (now - _lastDeclutter >= DECLUTTER_MS) {
      _lastDeclutter = now;
      _declutterLabels(w, h);
    }
  }
}

/**
 * Decide which adaptive pins show their full label chip vs just the dot.
 * Greedy placement in CAMERA-DISTANCE order (closest first — the user-facing
 * rule: near pins are full labels, far ones recede into dots): a label is
 * shown only if its screen rect (measured from the real chip element) fits
 * inside the HUD-safe band and hits neither an already-placed label nor any
 * other pin's dot (dots must always stay visible/tappable). The user-tapped
 * pin (_forcedId) is placed first and shown unconditionally. Asymmetric
 * padding (PROMOTE_PAD vs KEEP_PAD) gives hysteresis so labels don't flicker
 * at the threshold while the camera drifts.
 */
function _declutterLabels(w, h) {
  const items = [];
  pins.forEach((entry) => {
    if (!entry.adaptive) return;
    if (!entry.visible) { _setLabeled(entry, false); return; }
    items.push(entry);
  });
  if (items.length === 0) return;

  // Usable vertical band: below the top HUD, above the category bar
  // (same elements _fitCameraMobile treats as the safe frame).
  let topLim = 4;
  ['back-btn', 'lighting-toggle', 'hdri-panel'].forEach((id) => {
    const hud = document.getElementById(id);
    if (!hud || hud.offsetParent === null) return; // hidden (dev panel in prod)
    topLim = Math.max(topLim, hud.getBoundingClientRect().bottom + 4);
  });
  const barEl = document.getElementById('categories-bar');
  const botLim = barEl ? barEl.getBoundingClientRect().top - 4 : h - 4;

  // The tapped pin goes first (always wins), then nearest-to-camera, then
  // authored order as a deterministic tiebreak. Currently-labeled pins get a
  // small depth bonus (5% of the visible range) so two pins trading rank at
  // the cap boundary don't make their labels flap while the camera drifts.
  let dMin = Infinity, dMax = -Infinity;
  items.forEach((e) => {
    dMin = Math.min(dMin, e.depth);
    dMax = Math.max(dMax, e.depth);
  });
  const dRange = dMax - dMin;
  const stick = dRange * 0.05;
  const sortDepth = (e) => e.depth - (e.labeled ? stick : 0);
  items.sort((a, b) =>
    ((a.id === _forcedId ? 0 : 1) - (b.id === _forcedId ? 0 : 1)) ||
    (sortDepth(a) - sortDepth(b)) ||
    (a.order - b.order)
  );

  const DOT_R = 9;
  const placed = [];
  items.forEach((entry, idx) => {
    // Stack nearer pins above farther ones so a nearer label actually covers
    // a farther dot (not the other way around). Sorted order = depth order.
    entry.el.style.zIndex = String(500 - idx);
    const forced = entry.id === _forcedId;
    // Strict distance rule: pins beyond the nearest DEPTH_CUTOFF of the
    // visible depth range stay dots even when the cap has room, and at most
    // MAX_LABELS labels show at once — the rest is discovered by zooming.
    if (!forced &&
        (placed.length >= MAX_LABELS ||
         (dRange > 1e-6 && entry.depth - dMin > dRange * DEPTH_CUTOFF))) {
      _setLabeled(entry, false);
      return;
    }
    const chipW = entry.chipEl.offsetWidth || 60;
    const chipH = entry.chipEl.offsetHeight || 24;
    const pad = forced ? 0 : (entry.labeled ? KEEP_PAD : PROMOTE_PAD);
    const rect = {
      left:   entry.sx - chipW / 2 - pad,
      right:  entry.sx + chipW / 2 + pad,
      top:    entry.sy - STEM_PX - chipH - pad,
      bottom: entry.sy - STEM_PX + pad,
    };
    const inBounds =
      rect.left >= 4 && rect.right <= w - 4 &&
      rect.top >= topLim && rect.bottom <= botLim;
    // Consistent with nearest-wins: a label may cover a FARTHER pin's dot
    // (it re-emerges on zoom-in), but never a nearer one.
    const coversDot = items.some((o) =>
      o !== entry &&
      o.depth <= entry.depth &&
      rect.left < o.sx + DOT_R && rect.right > o.sx - DOT_R &&
      rect.top < o.sy + DOT_R && rect.bottom > o.sy - DOT_R
    );
    const collides = placed.some((r) =>
      rect.left < r.right && rect.right > r.left &&
      rect.top < r.bottom && rect.bottom > r.top
    );
    const show = forced || (inBounds && !coversDot && !collides);
    _setLabeled(entry, show);
    if (show) {
      placed.push({
        left:   entry.sx - chipW / 2,
        right:  entry.sx + chipW / 2,
        top:    entry.sy - STEM_PX - chipH,
        bottom: entry.sy - STEM_PX,
      });
    }
  });
}

function _setLabeled(entry, labeled) {
  if (entry.labeled === labeled) return;
  entry.labeled = labeled;
  entry.el.classList.toggle('pin-anchor--dot', !labeled);
}

/**
 * Add a hover highlight class to an existing category pin (arrow nudge, no slide).
 */
export function highlightPin(locationId) {
  const entry = pins.get(locationId);
  if (!entry) return false;
  entry.el.classList.add('pin-label--active-hover');
  return true;
}

/**
 * Remove hover highlight from an existing category pin.
 */
export function unhighlightPin(locationId) {
  const entry = pins.get(locationId);
  if (!entry) return;
  entry.el.classList.remove('pin-label--active-hover');
}

export function getPinRenderer() { return overlayEl; }
