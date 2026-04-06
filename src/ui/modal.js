const overlayEl = document.getElementById('modal-overlay');
const bodyEl = document.getElementById('modal-body');
const closeBtn = document.getElementById('modal-close');

let isOpen = false;

/**
 * Initialize modal events.
 */
export function initModal() {
  closeBtn.addEventListener('click', closeModal);

  // Close on overlay click (outside modal)
  overlayEl.addEventListener('click', (e) => {
    if (e.target === overlayEl) {
      closeModal();
    }
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
  html += `<h1 class="modal-title">${location.name}</h1>`;

  // Photo
  if (location.photo) {
    html += `<img class="modal-photo" src="${location.photo}" alt="${location.name}" loading="lazy" />`;
  } else {
    // Placeholder
    html += `<div class="modal-photo" style="display:flex;align-items:center;justify-content:center;color:#999;font-family:var(--font-ui);font-size:0.8rem;">Photo coming soon</div>`;
  }

  // Sections
  if (location.sections && location.sections.length > 0) {
    location.sections.forEach((section) => {
      html += `
        <div class="modal-section">
          <h2 class="modal-section-title">${section.title}</h2>
          <p class="modal-section-body">${section.body}</p>
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
      html += `<li><span class="modal-schedule-time">${entry.time}</span> ${entry.artist}</li>`;
    });
    html += `</ul></div>`;
  }

  bodyEl.innerHTML = html;

  // Always start at the top — prevents leftover scroll from a previous location
  bodyEl.scrollTop = 0;

  // Show modal
  overlayEl.classList.remove('hidden');
  isOpen = true;

  // Prevent body scroll (map behind)
  document.body.style.overflow = 'hidden';

  // Focus close button for accessibility
  setTimeout(() => closeBtn.focus(), 100);
}

/**
 * Close the modal.
 */
export function closeModal() {
  overlayEl.classList.add('hidden');
  isOpen = false;
  document.body.style.overflow = '';
}

export function isModalOpen() { return isOpen; }
