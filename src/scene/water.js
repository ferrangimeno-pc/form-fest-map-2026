import * as THREE from 'three';

/** Pool mesh name in the GLTF — 4th primitive of Cube.001 (has 'water' material) */
const POOL_MESH = 'Cube001_4';

let waterMaterial = null;

/**
 * Animated water shader material for the pool surface.
 * Uses layered sine-wave vertex displacement + scrolling noise fragment shader.
 */
function createWaterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime:         { value: 0 },
      uDeepColor:    { value: new THREE.Color('#1a6e9e') },
      uShallowColor: { value: new THREE.Color('#5bb8d4') },
      uFoamColor:    { value: new THREE.Color('#a8dde9') },
      uSunDir:       { value: new THREE.Vector3(0.5, 0.77, 0.4).normalize() },
      uSunColor:     { value: new THREE.Color('#FFE0A0') },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec2  vUv;
      varying vec3  vWorldPos;
      varying vec3  vWorldNormal;

      void main() {
        vUv = uv;
        vec3 pos = position;

        // Three overlapping sine waves for natural ripple
        pos.y += sin(pos.x * 6.0 + uTime * 1.4) * 0.012;
        pos.y += sin(pos.z * 5.0 + uTime * 1.1) * 0.010;
        pos.y += sin(pos.x * 3.5 + pos.z * 4.0 + uTime * 0.9) * 0.007;

        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        vWorldPos = worldPos.xyz;
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);

        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3  uDeepColor;
      uniform vec3  uShallowColor;
      uniform vec3  uFoamColor;
      uniform vec3  uSunDir;
      uniform vec3  uSunColor;
      varying vec2  vUv;
      varying vec3  vWorldPos;
      varying vec3  vWorldNormal;

      // Smooth value noise
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i),           hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }

      // FBM — 2 octaves (good detail, lower GPU cost)
      float fbm(vec2 p) {
        return noise(p) * 0.6 + noise(p * 2.0) * 0.4;
      }

      void main() {
        // Use world-space XZ for uniform noise (avoids stretched mesh UVs)
        vec2 wUv = vWorldPos.xz;
        vec2 uv1 = wUv * 12.0 + vec2( uTime * 0.06,  uTime * 0.04);
        vec2 uv2 = wUv *  9.0 + vec2(-uTime * 0.05,  uTime * 0.08);

        float n = (fbm(uv1) + fbm(uv2)) * 0.5;

        // Blend deep → shallow → foam
        vec3 color = mix(uDeepColor, uShallowColor, n);
        color = mix(color, uFoamColor, smoothstep(0.65, 0.85, n) * 0.5);

        // Animated normal from noise gradient (single layer — cheaper, still smooth)
        float eps = 0.08;
        vec2 uvMid = (uv1 + uv2) * 0.5;
        float nx = fbm(uvMid + vec2(eps, 0.0)) - fbm(uvMid - vec2(eps, 0.0));
        float nz = fbm(uvMid + vec2(0.0, eps)) - fbm(uvMid - vec2(0.0, eps));
        vec3 surfNormal = normalize(vWorldNormal + vec3(nx, 0.0, nz) * 0.6);

        // Diffuse lighting from sun direction
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float diff = max(dot(surfNormal, uSunDir), 0.0);
        color += uSunColor * diff * 0.08;

        // Specular highlight from sun (tighter, subtler)
        vec3 halfDir = normalize(uSunDir + viewDir);
        float spec = pow(max(dot(surfNormal, halfDir), 0.0), 128.0);
        color += uSunColor * spec * 0.25;

        // Fresnel — edges reflect more (brighter at grazing angles)
        float fresnel = pow(1.0 - max(dot(viewDir, surfNormal), 0.0), 3.0);
        color = mix(color, uShallowColor * 1.2, fresnel * 0.35);

        // Subtle specular sparkles
        float sparkle = smoothstep(0.88, 1.0, noise(uv1 * 2.5 + uTime * 0.3));
        color += sparkle * 0.15;

        gl_FragColor = vec4(color, mix(0.88, 0.95, fresnel));
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/**
 * Find the pool mesh and replace its material with the animated water shader.
 * @param {object} meshes - indexed mesh map from model.js (via getMesh)
 */
export function initWater(getMeshFn) {
  const poolMesh = getMeshFn(POOL_MESH);
  if (!poolMesh) {
    console.warn('[Water] Pool mesh not found:', POOL_MESH);
    return;
  }

  waterMaterial = createWaterMaterial();
  poolMesh.material = waterMaterial;
  poolMesh.castShadow = false;
  poolMesh.receiveShadow = false;
  // Prevent restoreAllMeshes / dimMeshesExcept from overwriting the water shader
  poolMesh.userData.protectedMaterial = true;

  console.log('[Water] Animated water material applied to', POOL_MESH);
}

/**
 * Update water animation. Call each frame with elapsed time in seconds.
 * @param {number} elapsedTime
 */
export function updateWater(elapsedTime) {
  if (waterMaterial) {
    waterMaterial.uniforms.uTime.value = elapsedTime;
  }
}

/**
 * Sync water sun direction and color with the scene lighting.
 * @param {THREE.DirectionalLight} sunLight
 */
export function updateWaterLighting(sunLight) {
  if (!waterMaterial || !sunLight) return;
  waterMaterial.uniforms.uSunDir.value.copy(sunLight.position).normalize();
  waterMaterial.uniforms.uSunColor.value.copy(sunLight.color);
}
