import {
  setExposure, setSunIntensity, setAmbientIntensity, setEnvironmentIntensity, setShadowRadius,
  setSunElevation, setSunAzimuth, setSunColor, setAmbientColor, setFogDensity, setFogColor, setShadowOpacity,
  applyLightMode, getPreset, LIGHT_MODES,
} from '../scene/lighting.js';
import { toggleMeshLabels } from './devMeshLabels.js';

const panelEl   = document.getElementById('hdri-panel');
const panelBody = document.getElementById('hdri-panel-body');
const toggleBtn = document.getElementById('hdri-panel-toggle');

let renderer    = null;
let lights      = null;
let isCollapsed = true;
let activeMode  = 'day'; // 'day' | 'night' — which preset the panel edits

// Per-preset controls — sliders reload when toggling Day / Night
const PRESET_CONTROLS = [
  { id: 'sunColor',         label: 'Sun Color',         type: 'color' },
  { id: 'sunIntensity',     label: 'Sun Intensity',     type: 'range', min: 0,    max: 8,   step: 0.1   },
  { id: 'sunElevation',     label: 'Sun Elevation',     type: 'range', min: 0,    max: 90,  step: 1     },
  { id: 'sunAzimuth',       label: 'Sun Azimuth',       type: 'range', min: 0,    max: 360, step: 1     },
  { id: 'exposure',         label: 'Exposure',          type: 'range', min: 0,    max: 3,   step: 0.05  },
  { id: 'ambientColor',     label: 'Ambient Color',     type: 'color' },
  { id: 'ambientIntensity', label: 'Ambient Intensity', type: 'range', min: 0,    max: 2,   step: 0.05  },
  { id: 'shadowOpacity',    label: 'Shadow Opacity',    type: 'range', min: 0,    max: 1,   step: 0.05  },
  { id: 'fogDensity',       label: 'Fog Density',       type: 'range', min: 0,    max: 0.5, step: 0.005 },
  { id: 'fogColor',         label: 'Fog Color',         type: 'color' },
];

// Global controls — shared across presets
const GLOBAL_CONTROLS = [
  { id: 'shadowBias',       label: 'Shadow Bias',        type: 'range', min: -0.005, max: 0, step: 0.0005, default: -0.001 },
  { id: 'shadowNormalBias', label: 'Shadow Normal Bias', type: 'range', min: 0,     max: 0.1,  step: 0.005, default: 0.02   },
  { id: 'shadowRadius',     label: 'Shadow Softness',    type: 'range', min: 0,     max: 8,    step: 0.5,   default: 2      },
  { id: 'envIntensity',     label: 'HDRI Env Intensity', type: 'range', min: 0,     max: 3,    step: 0.05,  default: 0.3    },
  { id: 'toneMappingType',  label: 'Tone Mapping',       type: 'range', min: 0,     max: 5,    step: 1,     default: 4      },
];

export function initHdriPanel(rendererRef, lightsRef) {
  renderer = rendererRef;
  lights   = lightsRef;

  panelEl.classList.remove('hidden');

  toggleBtn.addEventListener('click', () => {
    isCollapsed = !isCollapsed;
    panelBody.style.display = isCollapsed ? 'none' : 'block';
  });

  // ── Build HTML ──────────────────────────────────────────────────────────────

  let html = '';

  // Day / Night preset toggle
  html += `
    <div style="display:flex;gap:0.25rem;margin-bottom:0.5rem">
      <button id="mode-day-btn" style="flex:1;padding:0.35rem;border:none;border-radius:0.25rem;cursor:pointer;font-size:0.7rem;font-weight:700;background:var(--color-brand);color:#fff">DAY</button>
      <button id="mode-night-btn" style="flex:1;padding:0.35rem;border:none;border-radius:0.25rem;cursor:pointer;font-size:0.7rem;font-weight:700;background:rgba(255,255,255,0.12);color:#888">NIGHT</button>
    </div>
    <div style="font-size:0.6rem;color:#666;margin-bottom:0.4rem;text-transform:uppercase;letter-spacing:0.06em">Preset Values</div>
  `;

  // Preset controls
  PRESET_CONTROLS.forEach((ctrl) => {
    if (ctrl.type === 'color') {
      html += `
        <div class="dev-control">
          <label style="display:flex;justify-content:space-between;align-items:center">
            <span>${ctrl.label}</span>
            <input type="color" id="ctrl-${ctrl.id}" value="#ffffff"
              style="width:2rem;height:1.4rem;border:none;padding:0;cursor:pointer;background:none;border-radius:0.2rem" />
          </label>
        </div>
      `;
    } else {
      html += `
        <div class="dev-control">
          <label>
            <span>${ctrl.label}</span>
            <span class="dev-control-value" id="val-${ctrl.id}">—</span>
          </label>
          <input type="range" id="ctrl-${ctrl.id}"
            min="${ctrl.min}" max="${ctrl.max}" step="${ctrl.step}" value="${ctrl.min}" />
        </div>
      `;
    }
  });

  // Global controls separator
  html += `<div style="font-size:0.6rem;color:#666;margin:0.6rem 0 0.4rem;text-transform:uppercase;letter-spacing:0.06em">Global Values</div>`;

  GLOBAL_CONTROLS.forEach((ctrl) => {
    html += `
      <div class="dev-control">
        <label>
          <span>${ctrl.label}</span>
          <span class="dev-control-value" id="val-${ctrl.id}">${ctrl.default}</span>
        </label>
        <input type="range" id="ctrl-${ctrl.id}"
          min="${ctrl.min}" max="${ctrl.max}" step="${ctrl.step}" value="${ctrl.default}" />
      </div>
    `;
  });

  // Mesh labels toggle
  html += `<button id="mesh-labels-btn" style="
    width:100%;margin-top:0.5rem;padding:0.4rem;
    background:#FFD700;color:#000;border:none;
    border-radius:0.25rem;cursor:pointer;font-size:0.7rem;font-weight:700
  ">🏷 Show Mesh Labels</button>`;

  // Apply to source (label reflects active mode)
  html += `<button id="hdri-export-btn" style="
    width:100%;margin-top:0.4rem;padding:0.4rem;
    background:var(--color-brand);color:#fff;border:none;
    border-radius:0.25rem;cursor:pointer;font-size:0.7rem;font-weight:600
  ">Apply to Source (DAY)</button>`;

  panelBody.innerHTML = html;

  // ── Load initial preset values ───────────────────────────────────────────────
  loadPresetIntoSliders('day');

  // ── Events ───────────────────────────────────────────────────────────────────

  document.getElementById('mode-day-btn').addEventListener('click',   () => switchMode('day'));
  document.getElementById('mode-night-btn').addEventListener('click', () => switchMode('night'));

  PRESET_CONTROLS.forEach((ctrl) => {
    const input = document.getElementById(`ctrl-${ctrl.id}`);
    if (ctrl.type === 'color') {
      input.addEventListener('input', () => applyControl(ctrl.id, input.value));
    } else {
      const valEl = document.getElementById(`val-${ctrl.id}`);
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        valEl.textContent = v;
        applyControl(ctrl.id, v);
      });
    }
  });

  GLOBAL_CONTROLS.forEach((ctrl) => {
    const input = document.getElementById(`ctrl-${ctrl.id}`);
    const valEl = document.getElementById(`val-${ctrl.id}`);
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      valEl.textContent = v;
      applyControl(ctrl.id, v);
    });
  });

  document.getElementById('mesh-labels-btn').addEventListener('click', () => {
    const showing = toggleMeshLabels();
    const btn = document.getElementById('mesh-labels-btn');
    btn.textContent      = showing ? '🏷 Hide Mesh Labels' : '🏷 Show Mesh Labels';
    btn.style.background = showing ? '#FF4500' : '#FFD700';
    btn.style.color      = showing ? '#fff'    : '#000';
  });

  document.getElementById('hdri-export-btn').addEventListener('click', () =>
    applyToSource(document.getElementById('hdri-export-btn'))
  );

  panelBody.style.display = 'none';
}

// ── Mode toggle ───────────────────────────────────────────────────────────────

function switchMode(mode) {
  activeMode = mode;

  // Apply preset to scene immediately (no lerp) so you see it right away
  applyLightMode(mode === 'day' ? LIGHT_MODES.DAY : LIGHT_MODES.NIGHT, renderer, true);

  // Reload sliders from the stored preset values
  loadPresetIntoSliders(mode);

  // Button styles
  const dayBtn   = document.getElementById('mode-day-btn');
  const nightBtn = document.getElementById('mode-night-btn');
  dayBtn.style.background   = mode === 'day'   ? 'var(--color-brand)'      : 'rgba(255,255,255,0.12)';
  dayBtn.style.color        = mode === 'day'   ? '#fff'                    : '#888';
  nightBtn.style.background = mode === 'night' ? '#4A6FA5'                 : 'rgba(255,255,255,0.12)';
  nightBtn.style.color      = mode === 'night' ? '#fff'                    : '#888';

  document.getElementById('hdri-export-btn').textContent = `Apply to Source (${mode.toUpperCase()})`;
}

function loadPresetIntoSliders(mode) {
  const p = getPreset(mode);

  const vals = {
    sunColor:         '#' + p.color.getHexString(),
    sunIntensity:     p.intensity,
    sunElevation:     p.elevation,
    sunAzimuth:       p.azimuth,
    exposure:         p.exposure,
    ambientColor:     '#' + p.ambientColor.getHexString(),
    ambientIntensity: p.ambientIntensity,
    shadowOpacity:    p.shadowOpacity,
    fogDensity:       p.fogDensity,
    fogColor:         '#' + p.fogColor.getHexString(),
  };

  PRESET_CONTROLS.forEach((ctrl) => {
    const input = document.getElementById(`ctrl-${ctrl.id}`);
    if (!input) return;
    input.value = vals[ctrl.id];
    if (ctrl.type === 'range') {
      const valEl = document.getElementById(`val-${ctrl.id}`);
      if (valEl) valEl.textContent = vals[ctrl.id];
    }
  });
}

// ── Live control application ──────────────────────────────────────────────────

function applyControl(id, value) {
  switch (id) {
    case 'sunColor':         setSunColor(value);             break;
    case 'sunIntensity':     setSunIntensity(value);         break;
    case 'sunElevation':     setSunElevation(value);         break;
    case 'sunAzimuth':       setSunAzimuth(value);           break;
    case 'exposure':         setExposure(renderer, value);   break;
    case 'ambientColor':     setAmbientColor(value);         break;
    case 'ambientIntensity': setAmbientIntensity(value);     break;
    case 'shadowOpacity':    setShadowOpacity(value);        break;
    case 'fogDensity':       setFogDensity(value);           break;
    case 'fogColor':         setFogColor(value);             break;
    case 'shadowBias':       if (lights?.sunLight) lights.sunLight.shadow.bias = value;       break;
    case 'shadowNormalBias': if (lights?.sunLight) lights.sunLight.shadow.normalBias = value; break;
    case 'shadowRadius':     setShadowRadius(value);         break;
    case 'envIntensity':     setEnvironmentIntensity(value); break;
    case 'toneMappingType': {
      const mappings = [0, 1, 2, 3, 4, 6]; // THREE tone mapping constants
      renderer.toneMapping = mappings[Math.round(value)] ?? 4;
      break;
    }
  }
}

// ── Apply to source ───────────────────────────────────────────────────────────

async function applyToSource(btn) {
  const settings = { mode: activeMode };

  PRESET_CONTROLS.forEach((ctrl) => {
    const input = document.getElementById(`ctrl-${ctrl.id}`);
    settings[ctrl.id] = ctrl.type === 'color' ? input.value : parseFloat(input.value);
  });
  GLOBAL_CONTROLS.forEach((ctrl) => {
    settings[ctrl.id] = parseFloat(document.getElementById(`ctrl-${ctrl.id}`).value);
  });

  btn.textContent = 'Applying…';
  btn.disabled    = true;

  try {
    const res  = await fetch('/__dev/apply-settings', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(settings),
    });
    const data = await res.json();
    if (data.ok) {
      btn.textContent      = `✓ Applied (${activeMode.toUpperCase()})!`;
      btn.style.background = '#2ecc71';
      setTimeout(() => {
        btn.textContent      = `Apply to Source (${activeMode.toUpperCase()})`;
        btn.style.background = 'var(--color-brand)';
        btn.disabled         = false;
      }, 2000);
    } else throw new Error('Server error');
  } catch {
    btn.textContent      = '✗ Failed';
    btn.style.background = '#e74c3c';
    setTimeout(() => {
      btn.textContent      = `Apply to Source (${activeMode.toUpperCase()})`;
      btn.style.background = 'var(--color-brand)';
      btn.disabled         = false;
    }, 2000);
  }
}
