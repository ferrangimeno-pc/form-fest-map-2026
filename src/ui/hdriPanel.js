import { setExposure, setSunIntensity, setAmbientIntensity, setEnvironmentIntensity, setShadowRadius } from '../scene/lighting.js';
import { toggleMeshLabels } from './devMeshLabels.js';

const panelEl = document.getElementById('hdri-panel');
const panelBody = document.getElementById('hdri-panel-body');
const toggleBtn = document.getElementById('hdri-panel-toggle');

let renderer = null;
let isCollapsed = true;

// DEV controls config
const CONTROLS = [
  { id: 'exposure', label: 'Exposure', min: 0, max: 3, step: 0.05, default: 1.0 },
  { id: 'sunIntensity', label: 'Sun Intensity', min: 0, max: 8, step: 0.1, default: 3.0 },
  { id: 'ambientIntensity', label: 'Ambient Intensity', min: 0, max: 2, step: 0.05, default: 0.4 },
  { id: 'shadowBias', label: 'Shadow Bias', min: -0.01, max: 0.01, step: 0.001, default: -0.001 },
  { id: 'shadowNormalBias', label: 'Shadow Normal Bias', min: 0, max: 0.1, step: 0.005, default: 0.02 },
  { id: 'toneMappingType', label: 'Tone Mapping', min: 0, max: 5, step: 1, default: 4 },
  { id: 'envIntensity', label: 'HDRI Env Intensity', min: 0, max: 3, step: 0.05, default: 0.3 },
  { id: 'shadowRadius', label: 'Shadow Softness', min: 0, max: 8, step: 0.5, default: 2 },
];

/**
 * Initialize the HDRI dev controls panel.
 * @param {THREE.WebGLRenderer} rendererRef
 * @param {{ sunLight: THREE.DirectionalLight }} lights
 */
export function initHdriPanel(rendererRef, lights) {
  renderer = rendererRef;

  // Show the panel (remove hidden class)
  panelEl.classList.remove('hidden');

  // Toggle collapse
  toggleBtn.addEventListener('click', () => {
    isCollapsed = !isCollapsed;
    if (isCollapsed) {
      panelEl.classList.add('hidden');
      panelEl.classList.remove('hidden'); // keep header visible
      panelBody.style.display = 'none';
    } else {
      panelBody.style.display = 'block';
    }
  });

  // Build controls
  let html = '';
  CONTROLS.forEach((ctrl) => {
    html += `
      <div class="dev-control">
        <label>
          <span>${ctrl.label}</span>
          <span class="dev-control-value" id="val-${ctrl.id}">${ctrl.default}</span>
        </label>
        <input type="range"
          id="ctrl-${ctrl.id}"
          min="${ctrl.min}"
          max="${ctrl.max}"
          step="${ctrl.step}"
          value="${ctrl.default}"
        />
      </div>
    `;
  });

  // Mesh label toggle — shows every mesh name floating above its 3D position
  html += `<button id="mesh-labels-btn" style="
    width:100%;margin-top:0.5rem;padding:0.4rem;
    background:#FFD700;color:#000;border:none;
    border-radius:0.25rem;cursor:pointer;font-size:0.7rem;font-weight:700;
  ">🏷 Show Mesh Labels</button>`;

  // Apply-to-source button — writes current slider values back into source files
  html += `<button id="hdri-export-btn" style="
    width:100%;margin-top:0.5rem;padding:0.4rem;
    background:var(--color-brand);color:#fff;border:none;
    border-radius:0.25rem;cursor:pointer;font-size:0.7rem;font-weight:600;
  ">Apply to Source</button>`;

  panelBody.innerHTML = html;

  // Bind events
  CONTROLS.forEach((ctrl) => {
    const input = document.getElementById(`ctrl-${ctrl.id}`);
    const valueLabel = document.getElementById(`val-${ctrl.id}`);

    input.addEventListener('input', () => {
      const val = parseFloat(input.value);
      valueLabel.textContent = val;
      applyDevControl(ctrl.id, val, lights);
    });
  });

  // Mesh label toggle button
  const meshLabelsBtn = document.getElementById('mesh-labels-btn');
  meshLabelsBtn.addEventListener('click', () => {
    const showing = toggleMeshLabels();
    meshLabelsBtn.textContent = showing ? '🏷 Hide Mesh Labels' : '🏷 Show Mesh Labels';
    meshLabelsBtn.style.background = showing ? '#FF4500' : '#FFD700';
    meshLabelsBtn.style.color = showing ? '#fff' : '#000';
  });

  // Apply-to-source button
  const exportBtn = document.getElementById('hdri-export-btn');
  exportBtn.addEventListener('click', async () => {
    const settings = {};
    CONTROLS.forEach((ctrl) => {
      settings[ctrl.id] = parseFloat(document.getElementById(`ctrl-${ctrl.id}`).value);
    });

    exportBtn.textContent = 'Applying…';
    exportBtn.disabled = true;

    try {
      const res = await fetch('/__dev/apply-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.ok) {
        exportBtn.textContent = '✓ Applied to source!';
        exportBtn.style.background = '#2ecc71';
        setTimeout(() => {
          exportBtn.textContent = 'Apply to Source';
          exportBtn.style.background = 'var(--color-brand)';
          exportBtn.disabled = false;
        }, 2000);
      } else {
        throw new Error('Server error');
      }
    } catch (e) {
      exportBtn.textContent = '✗ Failed';
      exportBtn.style.background = '#e74c3c';
      setTimeout(() => {
        exportBtn.textContent = 'Apply to Source';
        exportBtn.style.background = 'var(--color-brand)';
        exportBtn.disabled = false;
      }, 2000);
    }
  });

  // Start collapsed
  panelBody.style.display = 'none';
}

/**
 * Apply a dev control value.
 */
function applyDevControl(id, value, lights) {
  switch (id) {
    case 'exposure':
      setExposure(renderer, value);
      break;
    case 'sunIntensity':
      setSunIntensity(value);
      break;
    case 'ambientIntensity':
      setAmbientIntensity(value);
      break;
    case 'shadowBias':
      if (lights.sunLight) lights.sunLight.shadow.bias = value;
      break;
    case 'shadowNormalBias':
      if (lights.sunLight) lights.sunLight.shadow.normalBias = value;
      break;
    case 'toneMappingType': {
      // 0=None, 1=Linear, 2=Reinhard, 3=Cineon, 4=ACESFilmic, 5=AgX
      const mappings = [0, 1, 2, 3, 4, 6]; // THREE.js tone mapping constants
      renderer.toneMapping = mappings[Math.round(value)] ?? 4;
      break;
    }
    case 'envIntensity':
      setEnvironmentIntensity(value);
      break;
    case 'shadowRadius':
      setShadowRadius(value);
      break;
  }
}
