import * as THREE from 'three';
import { getCurrentMode, LIGHT_MODES } from './lighting.js';
import { onResizeSubscribe } from './engine.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

/**
 * Earth-tone color grading shader.
 * Warms highlights, adds ochre/sienna to midtones, cools shadows slightly.
 */
const EarthColorGrading = {
  uniforms: {
    tDiffuse: { value: null },
    warmth: { value: 0.12 },        // warm shift intensity
    contrast: { value: 1.08 },      // subtle contrast boost
    saturation: { value: 1.05 },    // slight saturation lift
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float warmth;
    uniform float contrast;
    uniform float saturation;
    varying vec2 vUv;

    vec3 adjustSaturation(vec3 color, float sat) {
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      return mix(vec3(luma), color, sat);
    }

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 color = texel.rgb;

      // Contrast — pivot around midpoint
      color = (color - 0.5) * contrast + 0.5;

      // Warm tint — push highlights toward amber, shadows toward cool blue
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      vec3 warmTint = vec3(1.06, 1.0, 0.92);   // warm amber for highlights
      vec3 coolTint = vec3(0.94, 0.96, 1.04);   // cool blue for shadows
      vec3 tint = mix(coolTint, warmTint, smoothstep(0.2, 0.7, luma));
      color *= mix(vec3(1.0), tint, warmth * 3.0);

      // Saturation
      color = adjustSaturation(color, saturation);

      // Clamp
      color = clamp(color, 0.0, 1.0);

      gl_FragColor = vec4(color, texel.a);
    }
  `,
};

/**
 * Animated film grain shader.
 * Adds per-frame random noise weighted toward midtones (less visible in shadows/highlights).
 */
const FilmGrain = {
  uniforms: {
    tDiffuse:   { value: null },
    uTime:      { value: 0 },
    uIntensity: { value: 0.055 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uIntensity;
    varying vec2 vUv;

    float random(vec2 p) {
      return fract(sin(dot(p + fract(uTime * 0.01), vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      float grain = random(vUv) * uIntensity;

      // Weight grain to midtones — fades in shadows and highlights
      float luma = dot(texel.rgb, vec3(0.299, 0.587, 0.114));
      float mask = luma * (1.0 - luma) * 4.0;

      texel.rgb += (grain - uIntensity * 0.5) * mask;
      gl_FragColor = texel;
    }
  `,
};

let composer = null;
let grainPass = null;
let bloomPass = null;

/**
 * Initialize post-processing pipeline with bloom + color grading.
 */
export function initPostProcessing(renderer, scene, camera) {
  composer = new EffectComposer(renderer);

  // Use the renderer's current size (matches container, set by engine.js ResizeObserver)
  const size = renderer.getSize(new THREE.Vector2());

  // Base render pass
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // Bloom — subtle glow on bright highlights (half resolution for GPU savings)
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(Math.floor(size.x / 2), Math.floor(size.y / 2)),
    0.40,   // strength
    0.55,   // radius
    0.65    // threshold
  );
  composer.addPass(bloomPass);

  // Color grading — earth tones
  const colorGradePass = new ShaderPass(EarthColorGrading);
  composer.addPass(colorGradePass);

  // SMAA — runs before film grain so it only sees clean geometry edges,
  // not the grain noise (which would cause it to smear random pixels as "edges")
  const smaaPass = new SMAAPass(size.x, size.y);
  composer.addPass(smaaPass);

  // Film grain — added last so SMAA never processes it
  grainPass = new ShaderPass(FilmGrain);
  composer.addPass(grainPass);

  // Output pass — handles tone mapping + color space conversion
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  // Handle resize — driven by engine.js ResizeObserver (container-relative, not window)
  onResizeSubscribe((w, h) => {
    composer.setSize(w, h);
    bloomPass.setSize(Math.floor(w / 2), Math.floor(h / 2));
    smaaPass.setSize(w, h);
  });

  return composer;
}

/**
 * Render one frame through the post-processing pipeline.
 * @param {number} elapsedTime - total elapsed seconds (for grain animation)
 */
export function renderPostProcessing(elapsedTime = 0) {
  if (grainPass) {
    grainPass.uniforms.uTime.value = elapsedTime;
  }
  if (composer) {
    composer.render();
  }
}

// Bloom base values (lerped between when category active state changes)
const BLOOM_NORMAL   = { threshold: 0.65, strength: 0.40 };
const BLOOM_CATEGORY = { threshold: 0.45, strength: 0.30 };
// Night mode: lower threshold so dark surfaces still catch glow,
// and higher strength floor so close-up zooms don't kill the glow entirely.
const BLOOM_NIGHT    = { threshold: 0.45, strength: 0.55 };
const BLOOM_LERP_SPEED = 0.8; // units per second — higher = faster transition
let   bloomLerpT = 0; // 0 = normal, 1 = category active

/**
 * Adjust bloom strength based on camera distance and smoothly lerp
 * between normal/category-active states.
 * @param {number} camDist - distance from camera to look-at target
 * @param {number} dt      - delta time in seconds
 */
export function updateBloomForDistance(camDist, dt = 0) {
  if (!bloomPass) return;

  bloomLerpT = Math.min(Math.max(bloomLerpT, 0), 1);

  // Night mode uses its own bloom profile — more glow, lower threshold,
  // ignores category lerp (no dimming in night mode so no compensation needed).
  if (getCurrentMode() === LIGHT_MODES.NIGHT) {
    const distT = Math.min(Math.max((camDist - 2) / 10, 0), 1);
    bloomPass.strength  = BLOOM_NIGHT.strength - 0.10 + distT * 0.20;
    bloomPass.threshold = BLOOM_NIGHT.threshold;
    return;
  }

  const threshold = BLOOM_NORMAL.threshold + (BLOOM_CATEGORY.threshold - BLOOM_NORMAL.threshold) * bloomLerpT;
  const baseStrength = BLOOM_NORMAL.strength + (BLOOM_CATEGORY.strength - BLOOM_NORMAL.strength) * bloomLerpT;

  // Map distance range [2, 12] → ±0.15 strength variation around base
  const distT = Math.min(Math.max((camDist - 2) / 10, 0), 1);
  bloomPass.strength  = baseStrength - 0.15 + distT * 0.30;
  bloomPass.threshold = threshold;
}

/**
 * Call when a category is selected/deselected so bloom compensates for the dimmed scene.
 * @param {boolean} active
 */
export function setCategoryBloom(active) {
  _bloomTargetActive = active;
}

/**
 * Advance the bloom lerp. Call each frame with delta time.
 * @param {number} dt
 */
export function tickBloomLerp(dt) {
  const target = _bloomTargetActive ? 1 : 0;
  const dir = target - bloomLerpT;
  const step = BLOOM_LERP_SPEED * dt;
  if (Math.abs(dir) <= step) {
    bloomLerpT = target;
  } else {
    bloomLerpT += Math.sign(dir) * step;
  }
}

let _bloomTargetActive = false;

/**
 * Get the composer instance.
 */
export function getComposer() {
  return composer;
}
