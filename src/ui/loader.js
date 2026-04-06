const loaderEl = document.getElementById('loader');
const barEl = document.getElementById('loader-bar');
const textEl = document.getElementById('loader-text');

let modelProgress = 0;
let hdriProgress = 0;

/**
 * Update the loading bar. Combines model + HDRI progress.
 */
export function updateProgress(source, value) {
  if (source === 'model') modelProgress = value;
  if (source === 'hdri') hdriProgress = value;

  // Model = 70% of total, HDRI = 30%
  const total = modelProgress * 0.7 + hdriProgress * 0.3;
  const percent = Math.round(total * 100);

  if (barEl) barEl.style.width = `${percent}%`;
  if (textEl) textEl.textContent = `Loading map... ${percent}%`;
}

/**
 * Hide the loading screen with a fade-out animation.
 */
export function hideLoader() {
  if (loaderEl) {
    loaderEl.classList.add('fade-out');
    setTimeout(() => {
      loaderEl.style.display = 'none';
    }, 600);
  }
}
