import { CATEGORIES } from '../config/categories.js';

const barEl = document.getElementById('categories-bar');
let activeCategory = null;
let onCategoryChange = null;

/**
 * Initialize category buttons in the bottom bar.
 * @param {(categoryId: string|null) => void} onChange
 */
export function initCategories(onChange) {
  onCategoryChange = onChange;

  CATEGORIES.forEach((cat) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cat-btn';
    btn.textContent = cat.label;
    btn.dataset.category = cat.id;
    btn.setAttribute('aria-label', `Filter by ${cat.label}`);
    btn.setAttribute('aria-pressed', 'false');

    btn.addEventListener('click', () => {
      handleCategoryClick(cat.id);
    });

    barEl.appendChild(btn);
  });
}

/**
 * Handle category button click — toggle behavior.
 */
function handleCategoryClick(categoryId) {
  if (activeCategory === categoryId) {
    // Deselect
    setActiveCategory(null);
  } else {
    setActiveCategory(categoryId);
  }
}

/**
 * Set the active category programmatically.
 */
export function setActiveCategory(categoryId) {
  activeCategory = categoryId;

  // Update bar state class for dimming inactive buttons
  barEl.classList.toggle('has-active', !!activeCategory);

  // Update button styles
  const buttons = barEl.querySelectorAll('.cat-btn');
  buttons.forEach((btn) => {
    const catId = btn.dataset.category;
    const cat = CATEGORIES.find((c) => c.id === catId);

    if (catId === activeCategory) {
      btn.classList.add('active');
      btn.style.backgroundColor = cat.color;
      btn.style.color = '#FFFFFF';
      btn.setAttribute('aria-pressed', 'true');
    } else {
      btn.classList.remove('active');
      btn.style.backgroundColor = '';
      btn.style.color = '';
      btn.setAttribute('aria-pressed', 'false');
    }
  });

  if (onCategoryChange) {
    onCategoryChange(activeCategory);
  }
}

export function getActiveCategory() {
  return activeCategory;
}
