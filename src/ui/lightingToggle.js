import { LIGHT_MODES, applyLightMode, getCurrentMode } from '../scene/lighting.js';

const toggleEl = document.getElementById('lighting-toggle');
const liveLabel = document.getElementById('live-time-label');

let renderer = null;
let liveTimeInterval = null;

/**
 * Initialize the lighting toggle buttons.
 * @param {THREE.WebGLRenderer} rendererRef
 */
export function initLightingToggle(rendererRef) {
  renderer = rendererRef;

  const buttons = toggleEl.querySelectorAll('.light-btn');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      setMode(mode);
    });
  });

  // Start live clock
  updateLiveClock();
  liveTimeInterval = setInterval(updateLiveClock, 1000);

  // Set initial active state
  updateButtonStates(LIGHT_MODES.LIVE);
}

/**
 * Switch lighting mode.
 */
function setMode(mode) {
  applyLightMode(mode, renderer);
  updateButtonStates(mode);
}

/**
 * Update button active states.
 */
function updateButtonStates(activeMode) {
  const buttons = toggleEl.querySelectorAll('.light-btn');
  buttons.forEach((btn) => {
    if (btn.dataset.mode === activeMode) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

/**
 * Update the live clock display.
 */
function updateLiveClock() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  if (liveLabel) {
    liveLabel.textContent = `${hours}:${minutes}`;
  }
}
