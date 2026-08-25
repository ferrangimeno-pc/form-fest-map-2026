import { Clock, Box3, Vector3, Raycaster } from 'three';
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

// Touch devices have no hover state, so the "tap building → modal opens with no
// map context" experience is disorienting. On touch we render every pin from the
// start so users can see what they're tapping. Desktop/mouse users keep the
// existing reveal-on-category UX.
const IS_TOUCH = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

function showAllPinsForTouch(scene) {
  if (!IS_TOUCH) return;
  // Skip `secondary` locations (dual-section identities like "Grab and Go" that
  // share a mesh/position with a primary pin) so they don't overlap by default.
  // They surface when their own category is selected.
  const pinnable = locationsData.locations.filter((l) => !l.secondary);
  showPins(pinnable, scene, (locationId) => {
    const location = locationsData.locations.find((l) => l.id === locationId);
    if (location) openModal(location);
  });
}

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

  // 6c. Snap every pin to the surface under it. Pin stems anchor exactly at
  // pinPosition (renderPins), so a hand-authored y that misses the mesh top
  // leaves the flag visibly floating — a recurring error whenever the model
  // or a pin moves. Raycast straight down at each pin's x/z against the
  // location's own meshes (terrain for pin-only locations) and overwrite y.
  snapPinHeights();

  // Touch devices: pre-render all pins so users see tap targets.
  showAllPinsForTouch(scene);

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

/** Terrain meshes used as the raycast fallback for pin-only locations. */
const TERRAIN_MESH_NAMES = [
  'Terrain_Step_Terrace_CamCrop',
  'Terrain_Terraced_CamCrop001',
  'Terrain_Terraced_CamCrop002',
];

/**
 * Overwrite each location's pinPosition.y with the actual surface height at
 * its x/z — location meshes first, terrain as fallback (pin-only locations,
 * or pins authored beside their building). Runs once after model load.
 */
function snapPinHeights() {
  const raycaster = new Raycaster();
  const down = new Vector3(0, -1, 0);
  const terrain = TERRAIN_MESH_NAMES.map((n) => getMesh(n)).filter(Boolean);

  locationsData.locations.forEach((loc) => {
    const own = getObjectsForLocation(loc.id).map((n) => getMesh(n)).filter(Boolean);
    raycaster.set(new Vector3(loc.pinPosition.x, 50, loc.pinPosition.z), down);
    let hits = own.length > 0 ? raycaster.intersectObjects(own, false) : [];
    if (hits.length === 0) hits = raycaster.intersectObjects(terrain, false);
    if (hits.length > 0) {
      loc.pinPosition.y = hits[0].point.y + 0.02;
    } else if (import.meta.env.DEV) {
      console.warn(`[Pins] snapPinHeights: no surface under "${loc.id}" — keeping authored y`);
    }
  });
}

/**
 * Hand-tuned desktop camera poses that replace the pin-bbox auto-fit for
 * categories whose pin cloud auto-fits badly. Restrooms spans the whole site
 * diagonally — the auto-fit frames it as a tall vertical strip; this preset
 * shows the full map laid out horizontally instead (client-requested).
 *
 * The restrooms pose was solved photogrammetrically from the client's
 * reference screenshot (pin-stem anchors → camera fit, rms 2.5 px): a low
 * south view looking north, radius ~11 so distance fog stays mild. Note this
 * azimuth differs from the default 45° NE view — that is intentional.
 */
const CATEGORY_VIEW_PRESETS = {
  restrooms: {
    position: { x: -7.27, y: 7.79, z: 6.86 },
    target:   { x: -4.21, y: 1.8, z: -1.83 },
  },
  // Solved from the client's Camp reference screenshot (rms 1.6 px).
  camping: {
    position: { x: -10.94, y: 7.37, z: 4.79 },
    target:   { x: -6.02, y: 1.8, z: -4.34 },
  },
};

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
    // Touch: bring the full pin set back when leaving a category.
    showAllPinsForTouch(scene);
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

  // Desktop: hand-tuned preset wins over the auto-fit when one exists.
  const preset = CATEGORY_VIEW_PRESETS[locations[0].category];
  if (preset) {
    flyTo(camera, preset);
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
  // Cap raised 14 → 20 (18/08/2026): the Restrooms span now reaches from the
  // core out to car camping and needs ~19 to fit all four pins.
  const distance        = Math.min(Math.max(span * 1.7 * barCompensation + 2, 4), 20);

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
  // The camera is a fixed 45° NE-down view (position = target + d·(0.5, 0.9, 0.5)),
  // so SCREEN axes in world XZ are diagonal, not axis-aligned:
  //   screen-right   ∝ sx = (x − z)/√2
  //   ground "depth" ∝ dp = (x + z)/√2   (projects onto screen-vertical)
  const S2 = Math.SQRT2;
  const sxOf = (x, z) => (x - z) / S2;
  const dpOf = (x, z) => (x + z) / S2;

  // Per-location EXTREME POINTS sampled from real mesh vertices — world AABB
  // corners are phantom for rotated meshes (the diagonal car-camping lot's box
  // corner sits in empty desert, which skewed the Camp centering). Sampling
  // actual geometry keeps both the framing and the centering honest.
  const pins = [];        // { loc } for label constraints
  const extremePts = [];  // world Vector3s that bound the content on screen
  let sxMin = Infinity, sxMax = -Infinity, dpMin = Infinity, dpMax = -Infinity;
  let yMin = Infinity, yMax = -Infinity;
  const v = new Vector3();
  locations.forEach((loc) => {
    let ptSxMin = null, ptSxMax = null, ptDpMin = null, ptDpMax = null, ptYMax = null;
    let bSxMin = Infinity, bSxMax = -Infinity, bDpMin = Infinity, bDpMax = -Infinity, bYMax = -Infinity;
    const take = (wx, wy, wz) => {
      const sx = sxOf(wx, wz), dp = dpOf(wx, wz);
      if (sx < bSxMin) { bSxMin = sx; ptSxMin = new Vector3(wx, wy, wz); }
      if (sx > bSxMax) { bSxMax = sx; ptSxMax = new Vector3(wx, wy, wz); }
      if (dp < bDpMin) { bDpMin = dp; ptDpMin = new Vector3(wx, wy, wz); }
      if (dp > bDpMax) { bDpMax = dp; ptDpMax = new Vector3(wx, wy, wz); }
      if (wy > bYMax)  { bYMax = wy;  ptYMax  = new Vector3(wx, wy, wz); }
      sxMin = Math.min(sxMin, sx); sxMax = Math.max(sxMax, sx);
      dpMin = Math.min(dpMin, dp); dpMax = Math.max(dpMax, dp);
      yMin = Math.min(yMin, wy); yMax = Math.max(yMax, wy);
    };
    let touched = false;
    getObjectsForLocation(loc.id).forEach((name) => {
      const mesh = getMesh(name);
      const posAttr = mesh?.geometry?.attributes?.position;
      if (!posAttr) return;
      touched = true;
      const stride = Math.max(1, Math.floor(posAttr.count / 400));
      for (let i = 0; i < posAttr.count; i += stride) {
        v.fromBufferAttribute(posAttr, i).applyMatrix4(mesh.matrixWorld);
        take(v.x, v.y, v.z);
      }
    });
    if (!touched) {
      const p = loc.pinPosition;
      take(p.x - 0.3, p.y - 0.2, p.z - 0.3);
      take(p.x + 0.3, p.y + 0.2, p.z + 0.3);
    }
    [ptSxMin, ptSxMax, ptDpMin, ptDpMax, ptYMax].forEach((pt) => { if (pt) extremePts.push(pt); });
    pins.push({ loc });
  });
  if (pins.length === 0 || !isFinite(sxMin)) return;

  let sxCtr = (sxMin + sxMax) / 2; // both centers refined by the probe loop below
  let dpCtr = (dpMin + dpMax) / 2;

  // Safe frame: the top HUD (Back button, clock/day-night toggle, and the DEV
  // HDRI panel while it exists) and the bottom category bar both eat into the
  // usable viewport — labels must land BETWEEN them, not just on screen
  // (client bug 25/08/2026: the car-camping restroom's label hid under the HUD).
  const screenH = container.clientHeight;
  const screenW = container.clientWidth || window.innerWidth;
  let topUiPx = 0;
  ['back-btn', 'lighting-toggle', 'hdri-panel'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el || el.offsetParent === null) return; // hidden (e.g. dev panel in prod)
    topUiPx = Math.max(topUiPx, el.getBoundingClientRect().bottom);
  });
  const barEl = document.getElementById('categories-bar');
  const botUiPx = barEl ? screenH - barEl.getBoundingClientRect().top : 120;
  const PAD = 10;
  const topLim = 1 - (2 * (topUiPx + PAD)) / screenH;                       // NDC ceiling
  const botLim = -1 + (2 * (Math.min(botUiPx, 0.4 * screenH) + PAD)) / screenH; // NDC floor
  const LIM = 0.97; // horizontal NDC safe frame (small edge padding)

  const fov        = (camera.fov || 45) * Math.PI / 180;
  const aspect     = Math.max(camera.aspect || 0.46, 0.3);
  const tanHalfFov = Math.tan(fov / 2);

  // Initial estimate from spans at the target's depth (probe loop refines).
  const distForWidth  = Math.max(((sxMax - sxMin) / 2) * 1.08, 1.0) / (tanHalfFov * aspect);
  const vertWorld     = (dpMax - dpMin) * Math.cos(Math.PI / 4) + (yMax - yMin) * Math.sin(Math.PI / 4);
  const distForHeight = ((vertWorld / 2) * 1.15 / tanHalfFov) * (2 / Math.max(topLim - botLim, 0.8));

  // Cap 48 (was 16 pre-25/08/2026): Camp needs ~40, Restrooms ~17 with this
  // math. updateFogForDistance's second falloff segment keeps wide views
  // readable; flyTo expands controls.maxDistance to the destination radius.
  const MAX_DIST = 48;
  let distance = Math.min(Math.max(Math.max(distForWidth, distForHeight), 5), MAX_DIST);

  // Camera pose for a given distance/centers: target = screen-space center
  // mapped back to world (x = (sx+dp)/√2, z = (dp−sx)/√2); 45° NE-down offset.
  const yMid = Math.max((yMin + yMax) / 2, 0.8);
  const mkPose = (dist) => {
    const targetX = (sxCtr + dpCtr) / S2;
    const targetZ = (dpCtr - sxCtr) / S2;
    return {
      position: { x: targetX + dist * 0.5, y: dist * 0.9, z: targetZ + dist * 0.5 },
      target:   { x: targetX, y: yMid, z: targetZ },
    };
  };

  // Measure the content's projected NDC interval at a pose: real extreme
  // points + every pin anchor with its label extents (fixed pixel sizes).
  const probe = camera.clone();
  const measure = (pose) => {
    probe.position.set(pose.position.x, pose.position.y, pose.position.z);
    probe.lookAt(pose.target.x, pose.target.y, pose.target.z);
    probe.updateMatrixWorld(true);
    let L = Infinity, R = -Infinity, T = -Infinity, B = Infinity;
    extremePts.forEach((pt) => {
      const p = pt.clone().project(probe);
      L = Math.min(L, p.x); R = Math.max(R, p.x);
      T = Math.max(T, p.y); B = Math.min(B, p.y);
    });
    pins.forEach(({ loc }) => {
      const p = loc.pinPosition;
      const ndc = new Vector3(p.x, p.y, p.z).project(probe);
      const labelHalfNdc = (34 + (loc.name?.length || 8) * 8) / screenW;
      L = Math.min(L, ndc.x - labelHalfNdc);
      R = Math.max(R, ndc.x + labelHalfNdc);
      T = Math.max(T, ndc.y + (2 * 110) / screenH); // stem + label above anchor
      B = Math.min(B, ndc.y);
    });
    return { L, R, T, B };
  };

  // Refine: perspective swings near-side content wider than the at-target-depth
  // estimate, so each pass (a) RECENTERS both axes on the measured midpoint —
  // horizontal against the screen edges, vertical against the HUD-safe band —
  // and (b) zooms out only for whatever recentering can't absorb.
  for (let i = 0; i < 5; i++) {
    const { L, R, T, B } = measure(mkPose(distance));
    const kx = distance * tanHalfFov * aspect;       // world-per-NDC horizontally at target
    const ky = (distance * tanHalfFov) / 0.707;      // ground-dp per vertical NDC (pitch≈45°)
    sxCtr += ((L + R) / 2) * kx;
    dpCtr -= ((T + B) / 2 - (topLim + botLim) / 2) * ky; // +dp moves content UP on screen
    const scale = Math.max((R - L) / (2 * LIM), (T - B) / Math.max(topLim - botLim, 0.5), 1);
    if (scale <= 1.005 && i > 0) break;
    distance = Math.min(distance * scale, MAX_DIST);
  }

  const finalPose = mkPose(distance);
  if (import.meta.env.DEV) {
    // Verification dump: content interval + per-pin label extents in NDC at
    // the destination. L/R must be within ±0.97; every top ≤ topLim (HUD-safe).
    const { L, R, T, B } = measure(finalPose);
    const report = pins.map(({ loc }) => {
      const p = loc.pinPosition;
      const ndc = new Vector3(p.x, p.y, p.z).project(probe); // probe still at finalPose
      const labelHalfNdc = (34 + (loc.name?.length || 8) * 8) / screenW;
      return {
        id: loc.id,
        left: +(ndc.x - labelHalfNdc).toFixed(2),
        right: +(ndc.x + labelHalfNdc).toFixed(2),
        top: +(ndc.y + (2 * 110) / screenH).toFixed(2),
      };
    });
    console.log('[FitMobile]', JSON.stringify({
      distance: +distance.toFixed(1),
      topLim: +topLim.toFixed(2), botLim: +botLim.toFixed(2),
      content: { L: +L.toFixed(2), R: +R.toFixed(2), T: +T.toFixed(2), B: +B.toFixed(2) },
      report,
    }));
  }
  flyTo(camera, finalPose);
}

// Boot
init().catch((err) => {
  console.error('[Main] Initialization failed:', err);
  showLoaderError(err);
});
