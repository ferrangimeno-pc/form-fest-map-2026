let _overlayEl, _exploreBtnEl, _backBtnEl;

/**
 * Wire up the entry overlay controls.
 * Must be called after DOM is ready.
 */
export function initEntryOverlay() {
  _overlayEl    = document.getElementById('entry-overlay');
  _exploreBtnEl = document.getElementById('explore-btn');
  _backBtnEl    = document.getElementById('back-btn');

  _exploreBtnEl.addEventListener('click', _dismiss);
  _backBtnEl.addEventListener('click', _restore);
}

/**
 * Reveal the entry overlay — called from main.js once loading is complete.
 * The overlay starts opacity:0/visibility:hidden; this adds .visible to fade it in.
 */
export function showEntryOverlay() {
  if (!_overlayEl) return;
  _overlayEl.classList.add('visible');
}

/** Dismiss overlay → reveal map. */
function _dismiss() {
  _overlayEl.classList.remove('visible');

  // Back button appears after overlay has finished fading out (0.65s transition).
  // Using setTimeout here rather than transitionend to avoid needing to target a
  // specific transitioning property — cleaner and matches the actual visual timing.
  setTimeout(() => {
    _backBtnEl.classList.add('visible');
  }, 500);
}

/** Restore overlay → hide map controls. */
function _restore() {
  _backBtnEl.classList.remove('visible');

  // Defer one tick so the back-button removal transition commits before the
  // overlay starts fading in — prevents a visual flash where both are visible.
  // setTimeout(0) is used instead of rAF because rAF is paused in hidden tabs.
  setTimeout(() => {
    _overlayEl.classList.add('visible');
  }, 0);
}
