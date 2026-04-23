const overlayEl = document.getElementById('modal-overlay');
const bodyEl = document.getElementById('modal-body');
const closeBtn = document.getElementById('modal-close');

let isOpen = false;
// Guards the backdrop-to-close handler against the synthetic `click` Chrome
// dispatches right after a `touchend` that opened the modal. Without this, a
// tap on a mesh whose pin doesn't cover it (pool / amphitheater) opens the
// modal and then the follow-up click lands on the freshly-visible overlay
// backdrop and immediately closes it. Any click within this many ms of the
// open is swallowed.
let openedAt = 0;
const OPEN_CLICK_GUARD_MS = 400;

/** Escape HTML entities to prevent XSS when rendering location data. */
const _escDiv = document.createElement('div');
function esc(str) {
  _escDiv.textContent = str ?? '';
  return _escDiv.innerHTML;
}

/**
 * Initialize modal events.
 */
export function initModal() {
  closeBtn.addEventListener('click', closeModal);

  // Close on overlay click (outside modal). Guarded against the follow-up
  // synthetic click that fires right after a touch-open (see openedAt comment).
  overlayEl.addEventListener('click', (e) => {
    if (e.target !== overlayEl) return;
    if (performance.now() - openedAt < OPEN_CLICK_GUARD_MS) return;
    closeModal();
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) {
      closeModal();
    }
  });
}

/**
 * Open the modal with a location's data.
 * @param {Object} location - Location object from JSON
 */
export function openModal(location) {
  if (!location) return;

  // Build modal content
  let html = '';

  // Title
  html += `<h1 class="modal-title">${esc(location.name)}</h1>`;

  // Photo
  if (location.photo) {
    html += `<img class="modal-photo" src="${esc(location.photo)}" alt="${esc(location.name)}" loading="lazy" />`;
  } else {
    html += `<div class="modal-photo" style="display:flex;align-items:center;justify-content:center;color:#999;font-family:var(--font-ui);font-size:0.8rem;">Photo coming soon</div>`;
  }

  // Sections
  if (location.sections && location.sections.length > 0) {
    location.sections.forEach((section) => {
      html += `
        <div class="modal-section">
          <h2 class="modal-section-title">${esc(section.title)}</h2>
          <p class="modal-section-body">${esc(section.body)}</p>
        </div>
      `;
    });
  }

  // Programming / Schedule
  if (location.programming && location.programming.length > 0) {
    html += `
      <div class="modal-section">
        <h2 class="modal-section-title">Programming</h2>
        <ul class="modal-schedule">
    `;
    location.programming.forEach((entry) => {
      html += `<li><span class="modal-schedule-time">${esc(entry.time)}</span> ${esc(entry.artist)}</li>`;
    });
    html += `</ul></div>`;
  }

  bodyEl.innerHTML = html;

  // Always start at the top — prevents leftover scroll from a previous location
  bodyEl.scrollTop = 0;

  // Show modal — add .open to trigger entrance transitions
  overlayEl.classList.add('open');
  isOpen = true;
  openedAt = performance.now();

  // Prevent body scroll (map behind)
  document.body.style.overflow = 'hidden';

  // Focus close button for accessibility
  setTimeout(() => closeBtn.focus(), 100);
}

/**
 * Close the modal.
 */
export function closeModal() {
  overlayEl.classList.remove('open');
  isOpen = false;
  document.body.style.overflow = '';
}

export function isModalOpen() { return isOpen; }
