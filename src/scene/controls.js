import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let controls = null;
let flyToAnimation = null;

// Camera limits (mobile gets more zoom-out room)
const isMobile = () => window.innerWidth < 768;
const LIMITS = {
  // Larger minDistance clamps how far the user can zoom in — prevents clipping
  // into building geometry when pinching/scrolling on either breakpoint.
  minDistance: 5,
  maxDistance: 10,
  minPolarAngle: THREE.MathUtils.degToRad(10),  // almost top-down
  maxPolarAngle: THREE.MathUtils.degToRad(75),   // never below horizon
  enablePan: true,
  panSpeed: 0.8,
  rotateSpeed: 0.5,
  zoomSpeed: 1.0,
  enableDamping: true,
  dampingFactor: 0.08,
};

// Default camera positions per breakpoint
const DEFAULTS = {
  // Desktop: wider overview of the full site, framed on the festival core
  // (bbox of all interactive meshes centers at ~(-3.13, -, -1.87)).
  desktop: {
    position: { x: -4.1, y: 4.3, z: 4.4 },
    target:   { x: -3.2, y: 0.0, z: -1.4 },
  },
  // Mobile: computed dynamically in getDefaultCamera() from current viewport
  // aspect so fluid browser widths / orientation changes always stay framed.
  // These static values are an approximate reference for a 375x812 device.
  mobile: {
    position: { x: -4.4, y: 7.2, z: 6.1 },
    target:   { x: -3.2, y: 0.0, z: -2.4 },
  },
};

/**
 * Return the appropriate default camera config based on screen width.
 * Desktop uses the hand-tuned preset. Mobile is computed from the current
 * viewport aspect so the festival core stays framed on any browser size
 * (fluid width, orientation change, safe-area shifts).
 */
export function getDefaultCamera() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w >= 768) return DEFAULTS.desktop;

  // Mobile: camera rotated ~20° clockwise and pitched down to 45° so the
  // festival's long NE↔SW diagonal aligns with the portrait viewport's vertical
  // axis. That shrinks the content's *horizontal* screen span from ~9.6 units
  // (at yaw -8°) to ~5.25, which fits mobile portrait aspects with moderate
  // distance and without heavy horizontal cropping.
  //
  // Interactive content spans:
  //   x ∈ [-8.81, -0.39], z ∈ [-7.83, +1.18], y ∈ [0.3, 1.7]
  const fov    = 45 * Math.PI / 180;
  const pitch  = 45 * Math.PI / 180;
  const yaw    = 20 * Math.PI / 180;
  const aspect = Math.max(w / h, 0.35);

  // Precomputed screen-space spans for the NE-camera at pitch 45°, yaw +20°.
  // Horizontal ≈ 5.25 (pool/cafe on one side, car-camping on the other),
  // Vertical ≈ 7.93 (car-camping top → cafe/foundry bottom after projection).
  const horizontalScreenSpan = 5.25;
  const verticalScreenSpan   = 7.93;

  const distH = (horizontalScreenSpan / 2) / (Math.tan(fov / 2) * aspect);
  const distV = (verticalScreenSpan   / 2) /  Math.tan(fov / 2);

  // 40% margin — wider breathing room around content.
  const distance = Math.min(Math.max(Math.max(distH, distV) * 1.40, 12), 24);

  // Target = interactive-content midpoint, lifted slightly so the vertical
  // centre of the content (car-camping above target, cafe below) lands at
  // viewport center.
  const tx = -4.6, ty = 0.8, tz = -3.3;
  const camY  = distance * Math.sin(pitch);
  const horiz = distance * Math.cos(pitch);
  const dx    = horiz * Math.sin(yaw);
  const dz    = horiz * Math.cos(yaw);

  return {
    position: { x: tx + dx, y: camY, z: tz + dz },
    target:   { x: tx,      y: ty,   z: tz      },
  };
}

// Pan boundaries (keep map in view)
// Scene extent: x[-15.67, 7.71] z[-12.29, 10.90]
// Interactive targets span x[-7.84 (RVs) → 0 (pool)] z[-8.13 (RVs) → 1.21 (cafe)].
// Bounds widened so fly-to the southern cluster (camping, glamping, glamping-rvs)
// and the eastern stages can actually complete without clamping the target.
const PAN_BOUNDS = {
  min: new THREE.Vector3(-10, -1, -10),
  max: new THREE.Vector3(4, 3, 4),
};

/**
 * Initialize OrbitControls with limits.
 * @param {THREE.Camera} camera
 * @param {HTMLElement} domElement
 * @returns {OrbitControls}
 */
export function initControls(camera, domElement) {
  controls = new OrbitControls(camera, domElement);

  // Apply limits — mobile gets more zoom-out headroom
  controls.minDistance = LIMITS.minDistance;
  // Mobile portrait aspect needs room for much larger distances so the whole
  // festival can fit horizontally (see getDefaultCamera computation).
  controls.maxDistance = isMobile() ? 26 : LIMITS.maxDistance;
  controls.minPolarAngle = LIMITS.minPolarAngle;
  controls.maxPolarAngle = LIMITS.maxPolarAngle;
  controls.enablePan = LIMITS.enablePan;
  controls.panSpeed = LIMITS.panSpeed;
  controls.rotateSpeed = LIMITS.rotateSpeed;
  controls.zoomSpeed = LIMITS.zoomSpeed;
  controls.enableDamping = LIMITS.enableDamping;
  controls.dampingFactor = LIMITS.dampingFactor;

  // Desktop mouse: left = pan, right = rotate, middle = zoom
  controls.mouseButtons = {
    LEFT:   THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT:  THREE.MOUSE.ROTATE,
  };

  // Touch settings for mobile (unchanged)
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN,
  };

  // Initial target matches the default camera for this screen size
  const def = getDefaultCamera();
  controls.target.set(def.target.x, def.target.y, def.target.z);
  controls.update();

  console.log('[Controls] OrbitControls initialized with limits');
  return controls;
}

/**
 * Animate camera to a specific position/target.
 * @param {THREE.Camera} camera
 * @param {{ position: THREE.Vector3, target: THREE.Vector3 }} destination
 * @param {number} duration - seconds
 * @returns {Promise<void>}
 */
export function flyTo(camera, destination, duration = 1.2) {
  // Cancel any running fly-to
  if (flyToAnimation) {
    flyToAnimation.cancel = true;
  }

  return new Promise((resolve) => {
    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    const endPos = new THREE.Vector3(
      destination.position.x,
      destination.position.y,
      destination.position.z
    );
    const endTarget = new THREE.Vector3(
      destination.target.x,
      destination.target.y,
      destination.target.z
    );

    let elapsed = 0;
    const anim = { cancel: false };
    flyToAnimation = anim;

    const tick = (dt) => {
      if (anim.cancel) {
        resolve();
        return;
      }

      elapsed += dt;
      const t = Math.min(elapsed / duration, 1);
      const eased = easeInOutCubic(t);

      camera.position.lerpVectors(startPos, endPos, eased);
      controls.target.lerpVectors(startTarget, endTarget, eased);
      controls.update();

      if (t >= 1) {
        flyToAnimation = null;
        resolve();
      }
    };

    anim.tick = tick;
  });
}

/**
 * Reset camera to default overview position (desktop or mobile).
 */
export function resetCamera(camera, duration = 1.0) {
  return flyTo(camera, getDefaultCamera(), duration);
}

/**
 * Update controls + fly-to animation. Call each frame.
 * @param {number} deltaTime - seconds
 */
export function updateControls(deltaTime) {
  // Update fly-to animation
  if (flyToAnimation && flyToAnimation.tick) {
    flyToAnimation.tick(deltaTime);
  }

  // Clamp pan target within bounds
  if (controls) {
    controls.target.clamp(PAN_BOUNDS.min, PAN_BOUNDS.max);
    controls.update();
  }
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function getControls() { return controls; }
