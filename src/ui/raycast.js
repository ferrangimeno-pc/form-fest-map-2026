import * as THREE from 'three';
import { MODEL_MAP, getLocationForObject } from '../config/modelMap.js';
import { CATEGORIES } from '../config/categories.js';
import { getMesh, getModelRoot } from '../scene/model.js';
import { getActiveCategory } from './categories.js';
import { showHoverPin, hideHoverPin } from './pins.js';

const raycaster  = new THREE.Raycaster();
const _mouse     = new THREE.Vector2();

// Reusable vector for screen-space proximity projection
const _worldPos  = new THREE.Vector3();

/**
 * Pixel radius for proximity snap — expands effective hit area for small
 * buildings without adding any scene geometry.
 * Intentionally small enough that adjacent buildings don't bleed into each other.
 */
const PROXIMITY_PX = 28;

let _container   = null;
let _camera      = null;
let _scene       = null;
let _locationsData   = null;
let _onBuildingClick = null;

let hoveredLocationId = null;
let _hoverPinShown    = false;

// Hover stabiliser — only commit to a new hover target after it is hit
// HOVER_HOLD_FRAMES consecutive frames. Prevents 1-frame flicker when the
// cursor grazes a mesh edge between two locations.
const HOVER_HOLD_FRAMES = 2;
let _hoverCandidate      = null; // locationId being considered
let _hoverCandidateCount = 0;    // consecutive frames it has been hit

// Only raycast when the mouse actually moves
let _mouseDirty = false;
let _lastMouseX = 0;
let _lastMouseY = 0;

// Mouse: ignore drags (> 6 px travel between mousedown and click)
let _mouseDownX = 0;
let _mouseDownY = 0;
const MOUSE_SLOP = 6;

// Last known client coords — needed for screen-space proximity fallback
let _lastClientX = 0;
let _lastClientY = 0;

// Touch: ignore pans (> 12 px travel)
let _touchStartX = 0;
let _touchStartY = 0;
const TOUCH_SLOP = 12;

/**
 * Initialize building hover + click raycasting.
 * @param {HTMLElement} container
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {object} locationsData  - the full locations JSON object
 * @param {(locationId: string) => void} onBuildingClick
 */
export function initRaycast(container, scene, camera, locationsData, onBuildingClick) {
  _container       = container;
  _scene           = scene;
  _camera          = camera;
  _locationsData   = locationsData;
  _onBuildingClick = onBuildingClick;

  container.addEventListener('mousedown',  _onMouseDown);
  container.addEventListener('mousemove',  _onMouseMove);
  container.addEventListener('click',      _onClick);
  container.addEventListener('touchstart', _onTouchStart, { passive: true });
  container.addEventListener('touchend',   _onTouchEnd,   { passive: true });
}

/**
 * Call once per frame from the render loop — does the actual raycast.
 */
export function updateRaycast() {
  if (!_mouseDirty) return;
  _mouseDirty = false;

  const hit       = _raycastLocation(_lastMouseX, _lastMouseY, _lastClientX, _lastClientY);
  const rawId     = hit?.locationId ?? null;

  // ── Hover stabiliser ────────────────────────────────────────────────────────
  // Only commit to a new location after HOVER_HOLD_FRAMES consecutive hits.
  // Single-frame edge grazes are ignored, eliminating the jump/flicker.
  if (rawId === _hoverCandidate) {
    _hoverCandidateCount++;
  } else {
    _hoverCandidate      = rawId;
    _hoverCandidateCount = 1;
  }

  const newId = _hoverCandidateCount >= HOVER_HOLD_FRAMES ? rawId : hoveredLocationId;
  // ────────────────────────────────────────────────────────────────────────────

  if (newId !== hoveredLocationId) {
    if (hoveredLocationId) _clearHover(hoveredLocationId);
    if (newId)             _applyHover(newId);
    hoveredLocationId = newId;
  }

  _container.style.cursor = newId ? 'pointer' : '';
}

/**
 * Call when a category is selected so stale hover state is wiped.
 */
export function clearHoverState() {
  if (hoveredLocationId) _clearHover(hoveredLocationId);
  hoveredLocationId = null;
  _container.style.cursor = '';
}

// ─── Hover helpers ────────────────────────────────────────────────────────────

function _getCategory(location) {
  return CATEGORIES.find((c) => c.id === location.category) ?? null;
}

function _getMeshesForLocation(locationId) {
  return Object.entries(MODEL_MAP)
    .filter(([, id]) => id === locationId)
    .map(([name]) => getMesh(name))
    .filter(Boolean);
}

function _applyHover(locationId) {
  const location = _locationsData.locations.find((l) => l.id === locationId);
  if (!location) return;

  const category = _getCategory(location);
  if (!category) return;

  const activeCategory = getActiveCategory();
  const isAlreadyActive = activeCategory === location.category;

  // If this building is already highlighted at 100% (its category is active),
  // don't change its material — just let the cursor show pointer.
  if (!isAlreadyActive) {
    // 70% of the category colour
    const hoverColor = new THREE.Color(category.highlightColor).multiplyScalar(0.7);

    _getMeshesForLocation(locationId).forEach((mesh) => {
      if (mesh.userData.protectedMaterial) return;
      // Save current material so we can restore on hover-out
      mesh.userData._hoverSavedMaterial = mesh.material;

      const mats    = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const newMats = mats.map((mat) => {
        const c = mat.clone();
        c.color.copy(hoverColor);
        c.emissive = new THREE.Color(category.highlightColor);
        c.emissiveIntensity = 0.1; // softer than the active 0.2
        c.side = THREE.DoubleSide;
        return c;
      });
      mesh.material = Array.isArray(mesh.material) ? newMats : newMats[0];
    });

    // Show hover pin only if the location has a pin position defined
    if (location.pinPosition) {
      showHoverPin(location, (id) => {
        if (_onBuildingClick) _onBuildingClick(id);
      });
      _hoverPinShown = true;
    }
  }
}

function _clearHover(locationId) {
  const location = _locationsData.locations.find((l) => l.id === locationId);
  if (!location) return;

  const activeCategory = getActiveCategory();
  const wasAlreadyActive = activeCategory === location.category;

  if (!wasAlreadyActive) {
    // Restore saved materials, disposing the hover clones
    _getMeshesForLocation(locationId).forEach((mesh) => {
      if (mesh.userData.protectedMaterial) return;
      if (mesh.userData._hoverSavedMaterial !== undefined) {
        // Dispose the temporary hover material before restoring
        const old = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        old.forEach((m) => { if (m && m.dispose) m.dispose(); });
        mesh.material = mesh.userData._hoverSavedMaterial;
        delete mesh.userData._hoverSavedMaterial;
      }
    });

    // Remove hover pin
    if (_hoverPinShown) {
      hideHoverPin();
      _hoverPinShown = false;
    }
  }
}

// ─── Raycasting ───────────────────────────────────────────────────────────────

function _ndcFromClient(clientX, clientY) {
  const rect = _container.getBoundingClientRect();
  return {
    x:  ((clientX - rect.left) / rect.width)  * 2 - 1,
    y: -((clientY - rect.top)  / rect.height) * 2 + 1,
  };
}

function _raycastLocation(x, y, clientX, clientY) {
  _mouse.set(x, y);
  raycaster.setFromCamera(_mouse, _camera);
  // Only test the model root (skips lights, helpers, fog, etc.)
  const root = getModelRoot();
  if (!root) return null;
  const hits = raycaster.intersectObjects(root.children, true);
  for (const hit of hits) {
    const locationId = getLocationForObject(hit.object.name);
    if (locationId) return { locationId, mesh: hit.object };
  }
  // Fallback: screen-space proximity — snaps to the nearest location centroid
  // within PROXIMITY_PX pixels. No extra scene geometry, pure 2D math.
  return _nearestByProximity(clientX, clientY);
}

/**
 * Project each location's primary mesh centroid to screen pixels.
 * Returns the nearest location within PROXIMITY_PX, or null.
 * Only checks the first mesh listed per location to avoid double-counting.
 */
function _nearestByProximity(clientX, clientY) {
  const rect = _container.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  const threshold2 = PROXIMITY_PX * PROXIMITY_PX;

  const seen = new Set();
  let best = null;
  let bestDist2 = threshold2;

  for (const [meshName, locationId] of Object.entries(MODEL_MAP)) {
    if (seen.has(locationId)) continue; // one centroid per location
    seen.add(locationId);

    const mesh = getMesh(meshName);
    if (!mesh) continue;

    // World-space centroid → NDC → pixels
    mesh.getWorldPosition(_worldPos);
    _worldPos.project(_camera);

    const sx = (_worldPos.x *  0.5 + 0.5) * w;
    const sy = (_worldPos.y * -0.5 + 0.5) * h;

    const dx = clientX - rect.left - sx;
    const dy = clientY - rect.top  - sy;
    const d2 = dx * dx + dy * dy;

    if (d2 < bestDist2) {
      bestDist2 = d2;
      best = { locationId, mesh };
    }
  }

  return best;
}

// ─── Event handlers ──────────────────────────────────────────────────────────

function _onMouseMove(e) {
  // Ignore moves over UI elements — only track hover on the canvas itself
  if (!e.target.closest('canvas')) {
    if (hoveredLocationId) {
      _clearHover(hoveredLocationId);
      hoveredLocationId = null;
    }
    _container.style.cursor = '';
    return;
  }
  const { x, y } = _ndcFromClient(e.clientX, e.clientY);
  _lastMouseX = x;
  _lastMouseY = y;
  _lastClientX = e.clientX;
  _lastClientY = e.clientY;
  _mouseDirty = true;
}

function _onMouseDown(e) {
  _mouseDownX = e.clientX;
  _mouseDownY = e.clientY;
}

function _onClick(e) {
  // Ignore clicks that originated on UI elements (buttons, overlays, etc.)
  if (!e.target.closest('canvas')) return;
  // Ignore if the mouse travelled more than MOUSE_SLOP pixels — it was a drag
  const dx = e.clientX - _mouseDownX;
  const dy = e.clientY - _mouseDownY;
  if (Math.sqrt(dx * dx + dy * dy) > MOUSE_SLOP) return;
  const { x, y } = _ndcFromClient(e.clientX, e.clientY);
  const hit = _raycastLocation(x, y, e.clientX, e.clientY);
  if (hit && _onBuildingClick) _onBuildingClick(hit.locationId);
}

function _onTouchStart(e) {
  if (e.touches.length !== 1) return;
  _touchStartX = e.touches[0].clientX;
  _touchStartY = e.touches[0].clientY;
}

function _onTouchEnd(e) {
  if (e.changedTouches.length !== 1) return;
  // Ignore taps on UI elements
  if (!e.target.closest('canvas')) return;
  const dx = e.changedTouches[0].clientX - _touchStartX;
  const dy = e.changedTouches[0].clientY - _touchStartY;
  if (Math.sqrt(dx * dx + dy * dy) > TOUCH_SLOP) return;

  const cx = e.changedTouches[0].clientX;
  const cy = e.changedTouches[0].clientY;
  const { x, y } = _ndcFromClient(cx, cy);
  const hit = _raycastLocation(x, y, cx, cy);
  if (hit && _onBuildingClick) _onBuildingClick(hit.locationId);
}
