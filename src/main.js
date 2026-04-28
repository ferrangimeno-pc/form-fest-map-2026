import { Clock, Box3, Vector3 } from 'three';
import { initEngine } from './scene/engine.js';
import { loadModel, getMeshNames, getMesh, highlightMeshes, restoreAllMeshes, dimMeshesExcept } from './scene/model.js';
import { initWater, updateWater, updateWaterLighting } from './scene/water.js';
import { initLighting, updateLighting, updateFogForDistance, getSunLight, getCurrentMode, LIGHT_MODES, setExposure } from './scene/lighting.js';
import { initControls, updateControls, flyTo, resetCamera, getControls } from './scene/controls.js';
import { initPostProcessing, renderPostProcessing, updateBloomForDistance, setCategoryBloom, tickBloomLerp } from './scene/postprocessing.js';
import { updateProgress, hideLoader, showLoaderError } from './ui/loader.js';
import { initCategories } from './ui/categories.js';
import { initPinRenderer, showPins, hidePins, renderPins } from './ui/pins.js';
import { initModal, openModal } from './ui/modal.js';
import { initLightingToggle } from './ui/lightingToggle.js';
import { initRaycast, updateRaycast, clearHoverState, applyIdleTints } from './ui/raycast.js';
import { initEntryOverlay, showEntryOverlay } from './ui/entryOverlay.js';
import { setActiveCategory } from './ui/categories.js';
// DEV-only imports — tree-shaken out of production builds
let initHdriPanel = null;
let initMeshLabels = null;
if (import.meta.env.DEV) {
  ({ initHdriPanel } = await import('./ui/hdriPanel.js'));
  ({ initMeshLabels } = await import('./ui/devMeshLabels.js'));
}
import { CATEGORIES } from './config/categories.js';
import { MODEL_MAP, getObjectsForLocation } from './config/modelMap.js';
import locationsData from './data/locations.json';

const container = document.getElementById('map-container');

/** Probe for WebGL (1 or 2). Some embedded webviews / very old browsers lack it. */
function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) {
    return false;
  }
}

async function init() {
  // 0. Bail early if WebGL isn't available — showLoaderError surfaces the message.
  if (!hasWebGL()) {
    throw new Error("Your browser doesn't support 3D graphics. Try a modern browser like Chrome, Edge, Firefox, or Safari.");
  }

  // 1. Initialize engine (renderer, scene, camera)
  const { renderer, scene, camera, isWebGPU } = await initEngine(container);

  // 2. Initialize controls
  initControls(camera, renderer.domElement);

  // 3. Initialize pin overlay + dev mesh label overlay
  initPinRenderer(container);
  if (import.meta.env.DEV) initMeshLabels?.(container);

  // 4. Load model + HDRI in parallel
  const [model] = await Promise.all([
    loadModel(scene, (p) => updateProgress('model', p)),
    initLighting(scene, renderer, (p) => updateProgress('hdri', p)),
  ]);

  // 5. Initialize post-processing (bloom + grain)
  initPostProcessing(renderer, scene, camera);

  // 5b. Animated water on the pool surface
  initWater(getMesh);

  // DEV-only: mesh name logging, scene + camera globals for console debugging
  if (import.meta.env.DEV) {
    console.log('[Main] Available mesh names for modelMap.js:', getMeshNames());
    window.__debugScene = scene;
    window.__debugCamera = camera;
    window.__debugRenderer = renderer;
    model.traverse((child) => {
      if (child.isMesh) {
        const box = new Box3().setFromObject(child);
        const size = new Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 3) {
          console.warn(`[Debug] Large mesh: "${child.name}" — size: ${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)}`);
        }
      }
    });
  }

  // 6. Building hover + click raycasting
  initRaycast(container, scene, camera, locationsData, (locationId) => {
    const location = locationsData.locations.find((l) => l.id === locationId);
    if (!location) return;

    // Select the category if not already active, then open the modal
    setActiveCategory(location.category);
    handleCategoryChange(location.category, scene, camera, renderer);
    openModal(location);
  });

  // 6b. Apply default 25% category-color tint to all clickable buildings
  applyIdleTints();

  // 7. Hide loader, then reveal entry overlay
  hideLoader();

  // 7. Initialize UI
  initModal();
  initEntryOverlay();  // must init before show (wires DOM refs + event listeners)
  showEntryOverlay();
  initLightingToggle(renderer);
  if (import.meta.env.DEV) initHdriPanel?.(renderer, { sunLight: getSunLight() });

  // 8. Initialize categories with interaction handler
  initCategories((categoryId) => {
    handleCategoryChange(categoryId, scene, camera, renderer);
  });

  // 9. Wait one frame so the browser finishes layout (critical on mobile first-load
  // where 100dvh and safe-area calculations settle after script execution).
  await new Promise((resolve) => requestAnimationFrame(resolve));

  // 10. Start render loop — capped to ~60 fps.
  // On high-refresh-rate displays (120/144/165 Hz) Three's rAF loop would
  // otherwise render every vsync, pegging the GPU. The visual gain above
  // 60 fps is imperceptible for this scene; the power/heat cost is not.
  // Cap at ~62 fps (16 ms floor) so 60 Hz monitors still hit every vsync
  // — the `- 1` leaves slack for rAF timing jitter.
  const clock = new Clock();
  const FRAME_MIN_MS = 1000 / 60 - 1;
  let lastFrameTime = 0;

  function animate(now = 0) {
    requestAnimationFrame(animate);
    if (now - lastFrameTime < FRAME_MIN_MS) return;
    lastFrameTime = now;

    const dt = clock.getDelta();
    const elapsed = clock.elapsedTime;

    updateControls(dt);
    updateRaycast();
    updateLighting(dt, renderer);
    updateWater(elapsed);
    updateWaterLighting(getSunLight());

    // Smoothly lerp bloom between normal/category states, then scale by distance
    tickBloomLerp(dt);
    const camDist = camera.position.distanceTo(getControls().target);
    updateBloomForDistance(camDist, dt);

    // Mobile only: reduce fog density as camera zooms out
    updateFogForDistance(camDist);

    renderPostProcessing(elapsed);

    // Update pin positions AFTER the main render.
    // The composer's render pass updates camera matrices,
    // so projecting with the camera now gives exact screen positions.
    renderPins(scene, camera);
  }
  animate();

  // Pin positions are updated every frame in the animation loop (after renderer.render()),
  // which keeps camera matrices fully in sync. No separate change listener needed.
}

/**
 * Handle category selection: highlight objects, show pins, fly camera.
 */
function handleCategoryChange(categoryId, scene, camera, renderer) {
  // Clear hover state first (restores saved materials, removes hover pin)
  clearHoverState();
  // Reset everything (restoreAllMeshes also clears any hover emissive state)
  restoreAllMeshes();
  hidePins(scene);

  if (!categoryId) {
    // No category selected — reset to overview with 25% idle tints
    applyIdleTints();
    setCategoryBloom(false);
    if (getCurrentMode() === LIGHT_MODES.NIGHT) setExposure(renderer, 0.72);
    resetCamera(camera);
    return;
  }

  // Get category config
  const category = CATEGORIES.find((c) => c.id === categoryId);
  if (!category) return;

  // Get locations for this category
  const locations = locationsData.locations.filter((loc) => loc.category === categoryId);
  if (locations.length === 0) return;

  // Highlight 3D objects
  const allObjectNames = [];
  locations.forEach((loc) => {
    const objNames = getObjectsForLocation(loc.id);
    allObjectNames.push(...objNames);
    highlightMeshes(objNames, category.highlightColor);
  });

  // Apply idle tints to non-highlighted clickable buildings so they stay
  // subtly coloured instead of being dimmed to grey.
  // Night mode: scene is already dark — skip tinting and don't reduce bloom
  // (bloom is what keeps the night scene readable; reducing it causes near-blackout).
  // Stages + Camping cover large areas and zoom out far — boost exposure in night mode
  // so the wider view stays readable.
  const NIGHT_EXPOSURE_BOOST_CATEGORIES = new Set(['stages', 'camping']);
  if (allObjectNames.length > 0) {
    const isNight = getCurrentMode() === LIGHT_MODES.NIGHT;
    if (!isNight) {
      applyIdleTints();
      // Re-apply 100% highlight on top (applyIdleTints overwrites them at 35%)
      locations.forEach((loc) => {
        highlightMeshes(getObjectsForLocation(loc.id), category.highlightColor);
      });
    } else if (NIGHT_EXPOSURE_BOOST_CATEGORIES.has(categoryId)) {
      setExposure(renderer, 1.2);
    } else {
      setExposure(renderer, 0.72); // restore normal night exposure for other categories
    }
    setCategoryBloom(!isNight);
  }

  // Pre-compile all new materials now so no shader stutter hits mid-frame
  renderer.compile(scene, camera);

  // Show pin labels
  showPins(locations, scene, (locationId) => {
    // Pin clicked → open modal
    const location = locationsData.locations.find((l) => l.id === locationId);
    if (location) {
      openModal(location);
    }
  });

  // Auto-zoom camera to fit ALL pins for this category
  _fitCameraToLocations(locations, camera);
}

/**
 * Compute a camera position that fits all location pins into view.
 */
function _fitCameraToLocations(locations, camera) {
  if (locations.length === 0) return;

  // Mobile portrait aspect has far less horizontal room than desktop 16:9, so
  // every category (including single-location) is fitted via a mesh-bbox aware
  // routine that pulls the camera back as aspect narrows. Desktop keeps its
  // hand-tuned presets.
  const isMobileNow = window.innerWidth < 768;
  if (isMobileNow) {
    _fitCameraMobile(locations, camera);
    return;
  }

  if (locations.length === 1) {
    // Desktop single location: fly to its preset camera position
    flyTo(camera, {
      position: locations[0].cameraPosition,
      target: locations[0].cameraTarget,
    });
    return;
  }

  // Multiple locations: compute bounding box of all pinPositions
  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  locations.forEach(({ pinPosition }) => {
    minX = Math.min(minX, pinPosition.x);
    maxX = Math.max(maxX, pinPosition.x);
    minZ = Math.min(minZ, pinPosition.z);
    maxZ = Math.max(maxZ, pinPosition.z);
  });

  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const spanX   = maxX - minX;
  const spanZ   = maxZ - minZ;

  // Measure category bar height for viewport compensation.
  const barEl   = document.getElementById('categories-bar');
  const barH    = barEl ? barEl.getBoundingClientRect().height : 100;
  const screenH = container.clientHeight;
  const barFraction = Math.min(barH / screenH, 0.45);

  // Camera distance: pull back proportionally so all pins fit in the available viewport.
  const span            = Math.max(spanX, spanZ, 1.0);
  const barCompensation = 1 / (1 - barFraction);
  const distance        = Math.min(Math.max(span * 1.7 * barCompensation + 2, 4), 14);

  // --- Screen-space horizontal centering ---
  // For our 45° NE camera, screen-right direction in world XZ = (-1/√2, 0, +1/√2).
  // A pin's screen-X position is proportional to (z - x).
  // The world-XZ center doesn't always match the screen-X center (e.g. when one
  // pin is far in -Z like Envelop, it swings the screen-X balance sideways).
  const screenXVals = locations.map(({ pinPosition: p }) => p.z - p.x);
  const screenXCtr  = (Math.min(...screenXVals) + Math.max(...screenXVals)) / 2;
  const worldCtrSX  = centerZ - centerX; // world-XZ center's screen-X
  const sxOffset    = screenXCtr - worldCtrSX;

  // Shift target in screen-right direction to align horizontal center of pins with screen center.
  // Moving target by (adjX, adjZ) = s*(-1/√2, +1/√2) changes screen-X by sxOffset.
  const adjX = -sxOffset / 2;
  const adjZ = +sxOffset / 2;

  // --- Vertical compensation for bottom bar ---
  // Shift target toward camera in XZ (+0.707, +0.707) — perpendicular to screen-right
  // so it doesn't disturb the horizontal centering. This pushes pins upward on screen.
  const barVertOffset = barFraction * distance * 0.35;
  const targetX = centerX + adjX + barVertOffset * 0.707;
  const targetZ = centerZ + adjZ + barVertOffset * 0.707;

  // Camera positioned relative to the corrected target (keeps exact 45° NE view angle).
  const camX = targetX + distance * 0.5;
  const camY = distance * 0.9;
  const camZ = targetZ + distance * 0.5;

  flyTo(camera, {
    position: { x: camX, y: camY, z: camZ },
    target:   { x: targetX, y: 1.8, z: targetZ },
  });
}

/**
 * Mobile-only: fit camera using the union bbox of the actual meshes for every
 * location in the category (falling back to a small box around the pin for
 * locations with no mapped mesh). Distance scales with camera aspect so the
 * narrow portrait viewport pulls the camera back enough to keep the meshes
 * centered and fully visible.
 */
function _fitCameraMobile(locations, camera) {
  const box = new Box3();
  locations.forEach((loc) => {
    let touched = false;
    getObjectsForLocation(loc.id).forEach((name) => {
      const mesh = getMesh(name);
      if (mesh) { box.expandByObject(mesh); touched = true; }
    });
    if (!touched) {
      const p = loc.pinPosition;
      box.expandByPoint(new Vector3(p.x - 0.3, p.y - 0.2, p.z - 0.3));
      box.expandByPoint(new Vector3(p.x + 0.3, p.y + 0.2, p.z + 0.3));
    }
  });
  if (box.isEmpty()) return;

  const size = new Vector3();   box.getSize(size);
  const center = new Vector3(); box.getCenter(center);

  // Bar compensation (category bar sits at bottom)
  const barEl   = document.getElementById('categories-bar');
  const barH    = barEl ? barEl.getBoundingClientRect().height : 120;
  const screenH = container.clientHeight;
  const barFraction     = Math.min(barH / screenH, 0.40);
  const barCompensation = 1 / (1 - barFraction);

  // Aspect-aware distance: at 45° FOV the visible half-width = dist*tan(22.5°)*aspect,
  // half-height = dist*tan(22.5°). Camera pitch ≈ 45° NE-down so the XZ plane projects
  // to screen with span.x → horizontal, (span.z·cos45 + span.y·sin45) → vertical.
  const fov         = (camera.fov || 45) * Math.PI / 180;
  const aspect      = Math.max(camera.aspect || 0.46, 0.3);
  const tanHalfFov  = Math.tan(fov / 2);
  const vertWorld   = size.z * Math.cos(Math.PI / 4) + size.y * Math.sin(Math.PI / 4);
  const horizWorld  = size.x;
  const distForWidth  = (horizWorld / 2) / (tanHalfFov * aspect);
  const distForHeight = (vertWorld  / 2) / tanHalfFov;
  const margin      = 1.45; // padding so mesh isn't flush against the edges
  const distance    = Math.min(
    Math.max(Math.max(distForWidth, distForHeight) * margin * barCompensation, 5),
    16
  );

  // Target = bbox center, shifted toward camera so bottom bar doesn't cover content.
  const barVertOffset = barFraction * distance * 0.35;
  const targetX = center.x + barVertOffset * 0.707;
  const targetZ = center.z + barVertOffset * 0.707;
  const targetY = Math.max(center.y, 0.8); // lift above ground

  // 45° NE-down camera relative to target (matches desktop view angle).
  const camX = targetX + distance * 0.5;
  const camY = distance * 0.9;
  const camZ = targetZ + distance * 0.5;

  flyTo(camera, {
    position: { x: camX, y: camY, z: camZ },
    target:   { x: targetX, y: targetY, z: targetZ },
  });
}

// Boot
init().catch((err) => {
  console.error('[Main] Initialization failed:', err);
  showLoaderError(err);
});
