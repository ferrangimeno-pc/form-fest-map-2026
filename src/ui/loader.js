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

/**
 * Replace the loader's progress UI with an error card + Retry button.
 * Keeps the dark backdrop so the user never sees a broken canvas behind it.
 */
export function showLoaderError(err) {
  if (!loaderEl) return;
  const content = loaderEl.querySelector('.loader-content');
  if (!content) return;
  const message = err && err.message ? err.message : 'Something went wrong while loading the map.';
  content.classList.add('loader-content--error');
  content.innerHTML = `
    <h1 class="loader-error__title">Couldn't load the map</h1>
    <p class="loader-error__body">${message.replace(/[<>&]/g, (c) => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</p>
    <button type="button" class="loader-error__retry" id="loader-retry">Retry</button>
  `;
  const retryBtn = content.querySelector('#loader-retry');
  if (retryBtn) retryBtn.addEventListener('click', () => window.location.reload());
}
