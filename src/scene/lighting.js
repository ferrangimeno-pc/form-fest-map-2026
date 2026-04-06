import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const HDRI_PATH = 'assets/hdri/desert.hdr';

/** Lighting modes */
export const LIGHT_MODES = {
  LIVE: 'live',
  DAY: 'day',
  NIGHT: 'night',
};

// Sun presets per mode
const SUN_PRESETS = {
  day: {
    color: new THREE.Color('#FFE0A0'),
    intensity: 3,
    elevation: 50,
    azimuth: 160, // sun from south-east — consistent shadows falling north-west
    exposure: 1,
    ambientIntensity: 0.4,
    ambientColor: new THREE.Color('#9AB0D0'),
    shadowOpacity: 0.5,
    fogDensity: 0.10,                          // dusty haze in daylight
    fogColor: new THREE.Color('#6b5a45'),      // warm sandy brown
  },
  night: {
    color: new THREE.Color('#A0B8D8'),  // cooler, brighter moonlight blue
    intensity: 1.8,                     // enough to show terrain + shadows
    elevation: 35,                      // slightly higher — cleaner shadow angle
    azimuth: 90,
    exposure: 0.72,                     // lifted — scene stays readable at night
    ambientIntensity: 0.45,             // more fill so surfaces don't disappear
    ambientColor: new THREE.Color('#2A3A5A'), // deep blue night sky fill
    shadowOpacity: 0.3,
    fogDensity: 0.085,                        // slightly less thick
    fogColor: new THREE.Color('#2e2820'),      // dark brown, lifted from near-black
  },
};

let sunLight = null;
let ambientLight = null;
let envMap = null;
let _scene = null;
let currentMode = LIGHT_MODES.LIVE;

// Throttle live mode updates (sun moves slowly, no need for 60fps recalc)
let _liveTimer = 0;

// Lerp state for smooth transitions
let lerpTarget = null;
let lerpFrom = null;   // snapshot of preset values at transition start
let lerpProgress = 1;
const LERP_DURATION = 1.0; // seconds

/**
 * Initialize HDRI environment and sun light.
 * @param {THREE.Scene} scene
 * @param {THREE.WebGLRenderer|WebGPURenderer} renderer
 * @param {(progress: number) => void} onProgress
 */
export async function initLighting(scene, renderer, onProgress) {
  _scene = scene;
  // Load HDRI
  const rgbeLoader = new RGBELoader();
  envMap = await new Promise((resolve, reject) => {
    rgbeLoader.load(
      HDRI_PATH,
      (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = texture;
        scene.environmentIntensity = 0.3;
        scene.background = new THREE.Color('#6b5a45');
        scene.fog = new THREE.FogExp2('#6b5a45', 0.08); // overwritten by applyLightMode below
        resolve(texture);
      },
      (xhr) => {
        if (xhr.total > 0) onProgress(xhr.loaded / xhr.total);
      },
      reject
    );
  });

  // Directional light (sun/moon)
  sunLight = new THREE.DirectionalLight(0xffffff, 3.0);
  sunLight.castShadow = true;

  // Shadow map config
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 30;
  sunLight.shadow.camera.left = -8;
  sunLight.shadow.camera.right = 8;
  sunLight.shadow.camera.top = 8;
  sunLight.shadow.camera.bottom = -8;
  sunLight.shadow.bias = -0.001;
  sunLight.shadow.normalBias = 0.02;
  sunLight.shadow.radius = 2;

  scene.add(sunLight);
  scene.add(sunLight.target);

  // Ambient fill
  ambientLight = new THREE.AmbientLight(0xFFF8F0, 0.4);
  scene.add(ambientLight);

  // Apply initial lighting state
  applyLightMode(LIGHT_MODES.LIVE, renderer);

  console.log('[Lighting] HDRI + sun light initialized');
}

/**
 * Calculate sun position from elevation and azimuth angles.
 */
function sunPositionFromAngles(elevationDeg, azimuthDeg, distance = 10) {
  const elRad = THREE.MathUtils.degToRad(elevationDeg);
  const azRad = THREE.MathUtils.degToRad(azimuthDeg);
  return new THREE.Vector3(
    distance * Math.cos(elRad) * Math.sin(azRad),
    distance * Math.sin(elRad),
    distance * Math.cos(elRad) * Math.cos(azRad)
  );
}

/**
 * Get sun preset based on the hour (0-23).
 * Interpolates between day and night for sunrise/sunset.
 */
function getPresetForHour(hour) {
  const day = SUN_PRESETS.day;
  const night = SUN_PRESETS.night;

  // Day/night cycle tuned for festival hours:
  // 6-7: sunrise transition
  // 7-18: full day
  // 18-21: sunset transition (gradual 3hr dusk)
  // 21-6: full night
  let t; // 0 = full night, 1 = full day
  if (hour >= 7 && hour < 18) {
    t = 1;
  } else if (hour >= 21 || hour < 6) {
    t = 0;
  } else if (hour >= 6 && hour < 7) {
    t = hour - 6; // sunrise 0→1
  } else {
    t = 1 - (hour - 18) / 3; // sunset 1→0 over 3hrs
  }

  // Azimuth follows the sun arc (East→South→West)
  const azimuth = 90 + (hour / 24) * 360; // simple rotation

  return {
    color: new THREE.Color().lerpColors(night.color, day.color, t),
    intensity: THREE.MathUtils.lerp(night.intensity, day.intensity, t),
    elevation: THREE.MathUtils.lerp(night.elevation, day.elevation, t),
    azimuth: azimuth % 360,
    exposure: THREE.MathUtils.lerp(night.exposure, day.exposure, t),
    ambientIntensity: THREE.MathUtils.lerp(night.ambientIntensity, day.ambientIntensity, t),
    ambientColor: new THREE.Color().lerpColors(night.ambientColor, day.ambientColor, t),
    shadowOpacity: THREE.MathUtils.lerp(night.shadowOpacity, day.shadowOpacity, t),
    fogDensity: THREE.MathUtils.lerp(night.fogDensity, day.fogDensity, t),
    fogColor: new THREE.Color().lerpColors(night.fogColor, day.fogColor, t),
  };
}

/**
 * Apply a lighting mode immediately or start a smooth transition.
 */
export function applyLightMode(mode, renderer, immediate = false) {
  currentMode = mode;

  let preset;
  if (mode === LIGHT_MODES.DAY) {
    preset = SUN_PRESETS.day;
  } else if (mode === LIGHT_MODES.NIGHT) {
    preset = SUN_PRESETS.night;
  } else {
    // Live: calculate from current time
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    preset = getPresetForHour(hour);
  }

  if (immediate) {
    applyPreset(preset, renderer);
  } else {
    // Snapshot current light state as the lerp start point
    lerpFrom = {
      color:            sunLight ? sunLight.color.clone() : preset.color,
      intensity:        sunLight?.intensity ?? preset.intensity,
      elevation:        preset.elevation, // no easy reverse — use target
      azimuth:          preset.azimuth,
      exposure:         renderer.toneMappingExposure ?? preset.exposure,
      ambientIntensity: ambientLight?.intensity ?? preset.ambientIntensity,
      ambientColor:     ambientLight ? ambientLight.color.clone() : preset.ambientColor,
      shadowOpacity:    sunLight?.shadow.opacity ?? preset.shadowOpacity,
      fogDensity:       _scene?.fog?.density ?? preset.fogDensity,
      fogColor:         _scene?.fog ? _scene.fog.color.clone() : preset.fogColor,
    };
    lerpTarget = { preset, renderer };
    lerpProgress = 0;
  }
}

/**
 * Apply a preset directly (no transition).
 */
function applyPreset(preset, renderer) {
  if (!sunLight) return;

  sunLight.color.copy(preset.color);
  sunLight.intensity = preset.intensity;
  sunLight.position.copy(sunPositionFromAngles(preset.elevation, preset.azimuth));
  sunLight.shadow.opacity = preset.shadowOpacity;

  ambientLight.color.copy(preset.ambientColor);
  ambientLight.intensity = preset.ambientIntensity;

  if (renderer.toneMappingExposure !== undefined) {
    renderer.toneMappingExposure = preset.exposure;
  }

  // Update fog density and color
  if (_scene?.fog && preset.fogDensity !== undefined) {
    _scene.fog.density = preset.fogDensity;
    _scene.fog._baseDensity = preset.fogDensity; // reference for mobile zoom scaling
    _scene.fog.color.copy(preset.fogColor);
    _scene.background.copy(preset.fogColor); // keep background in sync with fog
  }
}

/**
 * Lerp between two presets by t (0=from, 1=to).
 */
function lerpPresets(from, to, t) {
  return {
    color:           new THREE.Color().lerpColors(from.color, to.color, t),
    intensity:       THREE.MathUtils.lerp(from.intensity, to.intensity, t),
    elevation:       THREE.MathUtils.lerp(from.elevation, to.elevation, t),
    azimuth:         THREE.MathUtils.lerp(from.azimuth, to.azimuth, t),
    exposure:        THREE.MathUtils.lerp(from.exposure, to.exposure, t),
    ambientIntensity:THREE.MathUtils.lerp(from.ambientIntensity, to.ambientIntensity, t),
    ambientColor:    new THREE.Color().lerpColors(from.ambientColor, to.ambientColor, t),
    shadowOpacity:   THREE.MathUtils.lerp(from.shadowOpacity, to.shadowOpacity, t),
    fogDensity:      THREE.MathUtils.lerp(from.fogDensity ?? 0.08, to.fogDensity ?? 0.08, t),
    fogColor:        new THREE.Color().lerpColors(from.fogColor ?? new THREE.Color('#6b5a45'), to.fogColor ?? new THREE.Color('#6b5a45'), t),
  };
}

/**
 * Call each frame to update smooth transitions and live-time updates.
 * @param {number} deltaTime - seconds since last frame
 * @param {THREE.WebGLRenderer} renderer
 */
export function updateLighting(deltaTime, renderer) {
  // Smooth transition
  if (lerpTarget && lerpProgress < 1) {
    lerpProgress = Math.min(1, lerpProgress + deltaTime / LERP_DURATION);
    const t = smoothstep(lerpProgress);
    const interpolated = lerpFrom
      ? lerpPresets(lerpFrom, lerpTarget.preset, t)
      : lerpTarget.preset;
    applyPreset(interpolated, lerpTarget.renderer);

    if (lerpProgress >= 1) {
      lerpFrom = null;
      lerpTarget = null;
    }
  }

  // In live mode, recalculate sun position every ~2 seconds (sun moves slowly)
  if (currentMode === LIGHT_MODES.LIVE && lerpProgress >= 1) {
    _liveTimer += deltaTime;
    if (_liveTimer >= 2) {
      _liveTimer = 0;
      const now = new Date();
      const hour = now.getHours() + now.getMinutes() / 60;
      const preset = getPresetForHour(hour);
      applyPreset(preset, renderer);
    }
  }
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

/**
 * On mobile, thin the fog as the camera zooms out so the scene doesn't go
 * dark at max distance. No-op on desktop (>= 768px).
 * Call every frame after updateControls().
 * @param {number} camDist - camera.position.distanceTo(controls.target)
 */
export function updateFogForDistance(camDist) {
  if (!_scene?.fog || window.innerWidth >= 768) return;

  // Fog scaling kicks in beyond NEAR_DIST and drops to MIN_SCALE at FAR_DIST.
  // Range matches mobile minDistance (4) → maxDistance (16).
  const NEAR_DIST = 7;   // below this, full preset density
  const FAR_DIST  = 16;  // at max zoom-out, MIN_SCALE density
  const MIN_SCALE = 0.40; // 40% of preset at farthest zoom

  const t = Math.max(0, Math.min(1, (camDist - NEAR_DIST) / (FAR_DIST - NEAR_DIST)));
  const scale = 1.0 - t * (1.0 - MIN_SCALE); // linear falloff from 1.0 → MIN_SCALE

  const base = _scene.fog._baseDensity ?? _scene.fog.density;
  _scene.fog.density = base * scale;
}

/**
 * Get current light state (for HDRI dev panel).
 */
export function getLightState() {
  return {
    mode: currentMode,
    sunIntensity: sunLight?.intensity ?? 0,
    ambientIntensity: ambientLight?.intensity ?? 0,
    exposure: 1.0,
  };
}

/**
 * Direct setters for HDRI dev panel.
 */
export function setHdriRotation(radians) {
  if (envMap) {
    // Rotate the environment map
    // Note: Three.js doesn't directly rotate equirect maps,
    // so we rotate the scene background offset
  }
}

export function setExposure(renderer, value) {
  renderer.toneMappingExposure = value;
}

export function setEnvironmentIntensity(value) {
  if (_scene) _scene.environmentIntensity = value;
}

export function setShadowRadius(value) {
  if (sunLight) sunLight.shadow.radius = value;
}

export function setSunIntensity(value) {
  if (sunLight) sunLight.intensity = value;
}

export function setAmbientIntensity(value) {
  if (ambientLight) ambientLight.intensity = value;
}

export function getSunLight() { return sunLight; }
export function getAmbientLight() { return ambientLight; }
export function getCurrentMode() { return currentMode; }
