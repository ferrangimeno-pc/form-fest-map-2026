import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let controls = null;
let flyToAnimation = null;

// Camera limits
const LIMITS = {
  minDistance: 4,
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
  // Desktop: wider overview of the full site
  desktop: {
    position: { x: -0.888, y: 4.228, z: 5.781 },
    target:   { x: 0.0,   y: 0.0,   z: 0.0   },
  },
  // Mobile: pulled back overview
  mobile: {
    position: { x: 8.083, y: 8.083, z: 8.083 },
    target:   { x: 0, y: 0, z: 0 },
  },
};

/**
 * Return the appropriate default camera config based on screen width.
 */
export function getDefaultCamera() {
  return window.innerWidth >= 768 ? DEFAULTS.desktop : DEFAULTS.mobile;
}

// Pan boundaries (keep map in view)
const PAN_BOUNDS = {
  min: new THREE.Vector3(-6, -1, -6),
  max: new THREE.Vector3(6, 3, 6),
};

/**
 * Initialize OrbitControls with limits.
 * @param {THREE.Camera} camera
 * @param {HTMLElement} domElement
 * @returns {OrbitControls}
 */
export function initControls(camera, domElement) {
  controls = new OrbitControls(camera, domElement);

  // Apply limits
  controls.minDistance = LIMITS.minDistance;
  controls.maxDistance = LIMITS.maxDistance;
  controls.minPolarAngle = LIMITS.minPolarAngle;
  controls.maxPolarAngle = LIMITS.maxPolarAngle;
  controls.enablePan = LIMITS.enablePan;
  controls.panSpeed = LIMITS.panSpeed;
  controls.rotateSpeed = LIMITS.rotateSpeed;
  controls.zoomSpeed = LIMITS.zoomSpeed;
  controls.enableDamping = LIMITS.enableDamping;
  controls.dampingFactor = LIMITS.dampingFactor;

  // Touch settings for mobile
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
