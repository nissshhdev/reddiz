// State management
const state = {
  currentSubreddit: 'EarthPorn',
  sort: 'hot',
  images: [], // array of { index, id, title, author, originalUrl, proxyUrl, filename, ext }
  currentIndex: 0,
  annotations: {}, // map of index -> { caption, tags: [], bboxes: [], isAnnotated, imageWidth, imageHeight }
  classes: ['subject', 'foreground', 'background'],
  activeClass: 'subject',
  exportFormat: 'yolo',
  isDrawing: false,
  drawStart: null,
  currentBox: null,
  lastAnnotation: null // stores the previous image's annotation to copy as default
};

// Material 3 Harmonious Palette for Bounding Boxes
const CLASS_COLORS = [
  '#a8c7fa', // M3 Primary
  '#a6ee98', // M3 Tertiary (Green)
  '#f2b8b5', // M3 Error (Coral Red)
  '#fdd663', // M3 Warning (Yellow)
  '#d7aefb', // M3 Violet
  '#c2e7ff', // M3 Light Blue
  '#fcad70', // M3 Orange
  '#80cbc4'  // M3 Teal
];

function getClassColor(className) {
  const idx = state.classes.indexOf(className);
  return CLASS_COLORS[(idx >= 0 ? idx : 0) % CLASS_COLORS.length];
}

// DOM Elements
const inputSubreddit = document.getElementById('input-subreddit');
const selectSort = document.getElementById('select-sort');
const btnFetch = document.getElementById('btn-fetch');
const fetchSpinner = document.getElementById('fetch-spinner');
const fetchIcon = document.getElementById('fetch-icon');

const activeImage = document.getElementById('active-image');
const bboxCanvas = document.getElementById('bbox-canvas');
const ctx = bboxCanvas.getContext('2d');
const imagePlaceholder = document.getElementById('image-placeholder');
const stageWrapper = document.getElementById('stage-wrapper');
const imageCounter = document.getElementById('image-counter');
const statusIndicator = document.getElementById('status-indicator');
const filmstrip = document.getElementById('filmstrip');

const btnPrev = document.getElementById('btn-prev-img');
const btnNext = document.getElementById('btn-next-img');
const btnBack = document.getElementById('btn-back');
const btnSaveNext = document.getElementById('btn-save-next');
const btnReset = document.getElementById('btn-reset-current');

const redditPostTitle = document.getElementById('reddit-post-title');
const annotationCaption = document.getElementById('annotation-caption');
const tagsContainer = document.getElementById('tags-container');
const tagInput = document.getElementById('tag-input');
const classChips = document.getElementById('class-chips');
const newClassInput = document.getElementById('new-class-input');
const btnAddClass = document.getElementById('btn-add-class');
const bboxList = document.getElementById('bbox-list');
const inheritedPill = document.getElementById('inherited-pill');

const headerProgressCount = document.getElementById('header-progress-count');
const footerProgressPct = document.getElementById('footer-progress-pct');
const progressFill = document.getElementById('progress-fill');

const btnOpenExport = document.getElementById('btn-open-export');
const exportModal = document.getElementById('export-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelExport = document.getElementById('btn-cancel-export');
const btnConfirmDownload = document.getElementById('btn-confirm-download');
const downloadSpinner = document.getElementById('download-spinner');
const downloadIcon = document.getElementById('download-icon');

const modalSubName = document.getElementById('modal-sub-name');
const modalTotalImages = document.getElementById('modal-total-images');
const modalClassesList = document.getElementById('modal-classes-list');

// Init
window.addEventListener('DOMContentLoaded', () => {
  setupRippleEffects();
  setupEventListeners();
  renderClassChips();
  // Automatically fetch initial preset
  fetchSubreddit(state.currentSubreddit);
});

// Material Fluid Ripple Effect
function setupRippleEffects() {
  document.addEventListener('click', (e) => {
    const target = e.target.closest('.ripple-surface');
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    const size = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`;

    target.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  });
}

// Event Listeners
function setupEventListeners() {
  btnFetch.addEventListener('click', () => {
    fetchSubreddit(inputSubreddit.value.trim());
  });

  inputSubreddit.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') fetchSubreddit(inputSubreddit.value.trim());
  });

  selectSort.addEventListener('change', () => {
    state.sort = selectSort.value;
    fetchSubreddit(inputSubreddit.value.trim());
  });

  // Preset pills
  document.querySelectorAll('.m3-filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.m3-filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const sub = chip.getAttribute('data-sub');
      inputSubreddit.value = sub;
      fetchSubreddit(sub);
    });
  });

  // Navigation
  btnPrev.addEventListener('click', () => navigateImage(-1));
  btnBack.addEventListener('click', () => navigateImage(-1));
  btnNext.addEventListener('click', () => navigateImage(1));
  btnSaveNext.addEventListener('click', () => saveAndNext());
  btnReset.addEventListener('click', resetCurrentAnnotation);

  // Keyboard navigation
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      if (e.target === tagInput && e.key === 'Enter') {
        e.preventDefault();
        addTag(tagInput.value.trim());
        tagInput.value = '';
      }
      return;
    }

    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      navigateImage(-1);
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      navigateImage(1);
    } else if (e.key === 'Enter') {
      saveAndNext();
    }
  });

  // Tag Input
  tagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput.value.trim());
      tagInput.value = '';
    }
  });

  // Add Class
  btnAddClass.addEventListener('click', () => {
    const val = newClassInput.value.trim();
    if (val && !state.classes.includes(val)) {
      state.classes.push(val);
      state.activeClass = val;
      newClassInput.value = '';
      renderClassChips();
    }
  });

  // Canvas drawing for bounding boxes
  setupBboxCanvas();

  // Export Modal
  btnOpenExport.addEventListener('click', openExportModal);
  btnCloseModal.addEventListener('click', () => exportModal.classList.remove('open'));
  btnCancelExport.addEventListener('click', () => exportModal.classList.remove('open'));

  document.querySelectorAll('.format-m3-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.format-m3-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      state.exportFormat = card.getAttribute('data-format');
    });
  });

  btnConfirmDownload.addEventListener('click', downloadDatasetZip);
}

// Fetch Images from Subreddit API
async function fetchSubreddit(sub) {
  if (!sub) return;
  state.currentSubreddit = sub;
  btnFetch.disabled = true;
  fetchSpinner.style.display = 'inline-block';
  fetchIcon.style.display = 'none';

  try {
    const res = await fetch(`/api/fetch-subreddit?subreddit=${encodeURIComponent(sub)}&sort=${state.sort}&limit=50`);
    const data = await res.json();

    if (!data.success || !data.images || data.images.length === 0) {
      alert(`No images found in r/${sub}. The subreddit might be text-only, banned, or private.`);
      return;
    }

    state.images = data.images;
    state.currentIndex = 0;
    state.annotations = {};
    state.lastAnnotation = null;

    renderFilmstrip();
    loadImage(0);
    updateProgress();
  } catch (err) {
    console.error('Error fetching subreddit:', err);
    alert('Failed to connect to Reddit server. Please verify your connection.');
  } finally {
    btnFetch.disabled = false;
    fetchSpinner.style.display = 'none';
    fetchIcon.style.display = 'inline-block';
  }
}

// Load Image into view with smooth fluid transition
function loadImage(index) {
  if (index < 0 || index >= state.images.length) return;
  state.currentIndex = index;

  const item = state.images[index];
  imagePlaceholder.style.display = 'none';
  activeImage.style.display = 'block';

  // Smooth entrance animation
  stageWrapper.classList.remove('animating-in');
  void stageWrapper.offsetWidth; // trigger reflow
  stageWrapper.classList.add('animating-in');

  // Highlight filmstrip item
  document.querySelectorAll('.filmstrip-thumb').forEach((el, idx) => {
    el.classList.toggle('active', idx === index);
  });
  const activeThumb = document.querySelector(`.filmstrip-thumb[data-index="${index}"]`);
  if (activeThumb) activeThumb.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });

  // Update Counters & Titles
  imageCounter.textContent = `Image ${index + 1} of ${state.images.length}`;
  redditPostTitle.textContent = `${item.title} (by ${item.author || 'anon'})`;

  // Set image source via proxy
  activeImage.src = item.proxyUrl;

  activeImage.onload = () => {
    resizeCanvasToImage();

    // Check if this image already has annotations
    if (!state.annotations[index]) {
      // Inherit previous annotation if available! (CORE USER REQUIREMENT)
      if (state.lastAnnotation) {
        state.annotations[index] = {
          caption: state.lastAnnotation.caption || generateDefaultCaption(item.title),
          tags: [...state.lastAnnotation.tags],
          bboxes: state.lastAnnotation.bboxes ? state.lastAnnotation.bboxes.map(b => ({ ...b })) : [],
          isAnnotated: false,
          imageWidth: activeImage.naturalWidth,
          imageHeight: activeImage.naturalHeight
        };
        inheritedPill.style.display = 'inline-flex';
      } else {
        // First image default initialization
        state.annotations[index] = {
          caption: generateDefaultCaption(item.title),
          tags: [state.currentSubreddit.toLowerCase(), 'photo'],
          bboxes: [],
          isAnnotated: false,
          imageWidth: activeImage.naturalWidth,
          imageHeight: activeImage.naturalHeight
        };
        inheritedPill.style.display = 'none';
      }
    } else {
      inheritedPill.style.display = 'none';
    }

    renderAnnotationForm();
    redrawCanvas();
    updateStatusBadge();
  };
}

function generateDefaultCaption(title) {
  if (!title) return '';
  return title.replace(/\[.*?\]|\(.*?\)/g, '').trim();
}

// Annotation Form Rendering
function renderAnnotationForm() {
  const annot = state.annotations[state.currentIndex] || { caption: '', tags: [], bboxes: [] };
  annotationCaption.value = annot.caption || '';
  renderTags();
  renderBboxList();
}

// Tags Management
function renderTags() {
  const annot = state.annotations[state.currentIndex] || { tags: [] };
  const existingBadges = tagsContainer.querySelectorAll('.tag-m3-badge');
  existingBadges.forEach(b => b.remove());

  annot.tags.forEach(tag => {
    const badge = document.createElement('div');
    badge.className = 'tag-m3-badge';
    badge.innerHTML = `
      <span>${escapeHtml(tag)}</span>
      <button type="button" data-tag="${escapeHtml(tag)}"><span class="material-symbols-rounded">close</span></button>
    `;
    badge.querySelector('button').addEventListener('click', () => removeTag(tag));
    tagsContainer.insertBefore(badge, tagInput);
  });
}

function addTag(tag) {
  if (!tag) return;
  const annot = state.annotations[state.currentIndex];
  if (!annot) return;
  if (!annot.tags) annot.tags = [];
  if (!annot.tags.includes(tag)) {
    annot.tags.push(tag);
    renderTags();
  }
}

function removeTag(tag) {
  const annot = state.annotations[state.currentIndex];
  if (!annot || !annot.tags) return;
  annot.tags = annot.tags.filter(t => t !== tag);
  renderTags();
}

// Bounding Box List Rendering
function renderBboxList() {
  const annot = state.annotations[state.currentIndex] || { bboxes: [] };
  bboxList.innerHTML = '';

  if (!annot.bboxes || annot.bboxes.length === 0) {
    bboxList.innerHTML = `<span style="font-size: 0.78rem; color: var(--md-sys-color-outline); font-style: italic;">No bounding boxes drawn. Drag cursor over image to add.</span>`;
    return;
  }

  annot.bboxes.forEach((box, idx) => {
    const color = getClassColor(box.label);
    const item = document.createElement('div');
    item.className = 'bbox-m3-card';
    item.innerHTML = `
      <div style="display: flex; align-items: center;">
        <span class="bbox-color-indicator" style="background: ${color};"></span>
        <strong style="color: var(--md-sys-color-on-surface);">${escapeHtml(box.label)}</strong>
        <span style="color: var(--md-sys-color-outline); margin-left: 8px; font-size: 0.75rem;">(${Math.round(box.width * 100)}% × ${Math.round(box.height * 100)}%)</span>
      </div>
      <button type="button" class="m3-btn m3-btn-outlined" style="height: 26px; padding: 0 8px; font-size: 0.72rem; color: var(--md-sys-color-error); border-color: rgba(242, 184, 181, 0.3);" data-idx="${idx}">Delete</button>
    `;
    item.querySelector('button').addEventListener('click', () => {
      annot.bboxes.splice(idx, 1);
      renderBboxList();
      redrawCanvas();
    });
    bboxList.appendChild(item);
  });
}

// Classes Chips
function renderClassChips() {
  classChips.innerHTML = '';
  state.classes.forEach(c => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `m3-filter-chip ripple-surface ${c === state.activeClass ? 'active' : ''}`;
    const color = getClassColor(c);
    chip.innerHTML = `
      <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${color};"></span>
      ${escapeHtml(c)}
    `;

    chip.addEventListener('click', () => {
      state.activeClass = c;
      renderClassChips();
    });
    classChips.appendChild(chip);
  });
}

// Canvas & Drawing Logic
function setupBboxCanvas() {
  window.addEventListener('resize', resizeCanvasToImage);

  bboxCanvas.addEventListener('mousedown', (e) => {
    if (!activeImage.src) return;
    const rect = bboxCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    state.isDrawing = true;
    state.drawStart = { x, y };
    state.currentBox = { x, y, width: 0, height: 0, label: state.activeClass };
  });

  bboxCanvas.addEventListener('mousemove', (e) => {
    if (!state.isDrawing) return;
    const rect = bboxCanvas.getBoundingClientRect();
    const curX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const curY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    const x = Math.min(state.drawStart.x, curX);
    const y = Math.min(state.drawStart.y, curY);
    const width = Math.abs(curX - state.drawStart.x);
    const height = Math.abs(curY - state.drawStart.y);

    state.currentBox = { x, y, width, height, label: state.activeClass };
    redrawCanvas();
  });

  bboxCanvas.addEventListener('mouseup', () => {
    if (!state.isDrawing) return;
    state.isDrawing = false;

    if (state.currentBox && state.currentBox.width > 0.02 && state.currentBox.height > 0.02) {
      const annot = state.annotations[state.currentIndex];
      if (!annot.bboxes) annot.bboxes = [];
      annot.bboxes.push(state.currentBox);
      renderBboxList();
    }
    state.currentBox = null;
    redrawCanvas();
  });
}

function resizeCanvasToImage() {
  const w = activeImage.clientWidth;
  const h = activeImage.clientHeight;
  if (w && h) {
    bboxCanvas.width = w;
    bboxCanvas.height = h;
    bboxCanvas.style.width = `${w}px`;
    bboxCanvas.style.height = `${h}px`;
    redrawCanvas();
  }
}

function redrawCanvas() {
  ctx.clearRect(0, 0, bboxCanvas.width, bboxCanvas.height);
  const annot = state.annotations[state.currentIndex];
  const w = bboxCanvas.width;
  const h = bboxCanvas.height;

  // Draw saved boxes
  if (annot && annot.bboxes) {
    annot.bboxes.forEach(box => {
      drawBox(box, w, h, false);
    });
  }

  // Draw active drawing box
  if (state.currentBox) {
    drawBox(state.currentBox, w, h, true);
  }
}

function drawBox(box, w, h, isLive) {
  const color = getClassColor(box.label);
  const bx = box.x * w;
  const by = box.y * h;
  const bw = box.width * w;
  const bh = box.height * h;

  ctx.strokeStyle = color;
  ctx.lineWidth = isLive ? 2 : 2.5;
  ctx.fillStyle = `${color}25`;

  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeRect(bx, by, bw, bh);

  // Label tag chip on top of bounding box
  ctx.fillStyle = color;
  const labelWidth = Math.min(bw, 100);
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(bx, by - 22, labelWidth, 22, [4, 4, 0, 0]) : ctx.rect(bx, by - 22, labelWidth, 22);
  ctx.fill();

  ctx.fillStyle = '#0842a0'; // contrast text
  ctx.font = '700 11px "Strichpunkt Sans", system-ui, sans-serif';
  ctx.fillText(box.label, bx + 6, by - 7);
}

// Filmstrip rendering
function renderFilmstrip() {
  filmstrip.innerHTML = '';
  state.images.forEach((item, idx) => {
    const thumb = document.createElement('div');
    thumb.className = `filmstrip-thumb ${idx === state.currentIndex ? 'active' : ''}`;
    thumb.setAttribute('data-index', idx);
    thumb.innerHTML = `<img src="${item.proxyUrl}" alt="thumb" loading="lazy">`;
    thumb.addEventListener('click', () => {
      saveCurrentAnnotationState();
      loadImage(idx);
    });
    filmstrip.appendChild(thumb);
  });
}

// Save Current Image & Advance
function saveCurrentAnnotationState() {
  const annot = state.annotations[state.currentIndex];
  if (annot) {
    annot.caption = annotationCaption.value.trim();
    annot.isAnnotated = true;
    // Update the last annotation state to be inherited for subsequent images
    state.lastAnnotation = {
      caption: annot.caption,
      tags: [...(annot.tags || [])],
      bboxes: (annot.bboxes || []).map(b => ({ ...b }))
    };
  }
  updateStatusBadge();
  updateProgress();
}

function saveAndNext() {
  saveCurrentAnnotationState();
  if (state.currentIndex < state.images.length - 1) {
    loadImage(state.currentIndex + 1);
  } else {
    openExportModal();
  }
}

function navigateImage(delta) {
  saveCurrentAnnotationState();
  const nextIdx = state.currentIndex + delta;
  if (nextIdx >= 0 && nextIdx < state.images.length) {
    loadImage(nextIdx);
  }
}

function resetCurrentAnnotation() {
  state.annotations[state.currentIndex] = {
    caption: '',
    tags: [],
    bboxes: [],
    isAnnotated: false,
    imageWidth: activeImage.naturalWidth,
    imageHeight: activeImage.naturalHeight
  };
  renderAnnotationForm();
  redrawCanvas();
  updateStatusBadge();
  updateProgress();
}

function updateStatusBadge() {
  const annot = state.annotations[state.currentIndex];
  const isAnnot = annot && annot.isAnnotated;
  statusIndicator.className = `m3-dot ${isAnnot ? 'annotated' : ''}`;

  const thumb = document.querySelector(`.filmstrip-thumb[data-index="${state.currentIndex}"]`);
  if (thumb) {
    thumb.classList.toggle('is-annotated', !!isAnnot);
  }
}

function updateProgress() {
  const total = state.images.length;
  if (total === 0) return;

  const count = Object.values(state.annotations).filter(a => a.isAnnotated).length;
  const pct = Math.round((count / total) * 100);

  headerProgressCount.textContent = `${count} / ${total}`;
  footerProgressPct.textContent = `${pct}%`;
  progressFill.style.width = `${pct}%`;

  btnOpenExport.disabled = count === 0;
}

// Export Dataset Modal & Download
function openExportModal() {
  modalSubName.textContent = `r/${state.currentSubreddit}`;
  const count = Object.values(state.annotations).filter(a => a.isAnnotated).length;
  modalTotalImages.textContent = `${count} images`;
  modalClassesList.textContent = state.classes.join(', ');
  exportModal.classList.add('open');
}

async function downloadDatasetZip() {
  btnConfirmDownload.disabled = true;
  downloadSpinner.style.display = 'inline-block';
  downloadIcon.style.display = 'none';

  try {
    const items = [];
    state.images.forEach((img, idx) => {
      const annot = state.annotations[idx];
      if (annot && annot.isAnnotated) {
        items.push({
          id: img.id,
          filename: img.filename,
          originalUrl: img.originalUrl,
          title: img.title,
          annotation: {
            caption: annot.caption,
            tags: annot.tags,
            bboxes: annot.bboxes,
            imageWidth: annot.imageWidth,
            imageHeight: annot.imageHeight
          }
        });
      }
    });

    if (items.length === 0) {
      alert('Please annotate at least one image before downloading.');
      return;
    }

    const payload = {
      subreddit: state.currentSubreddit,
      items: items,
      format: state.exportFormat,
      classes: state.classes
    };

    const response = await fetch('/api/export-dataset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Server error while packaging dataset');
    }

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `reddit_${state.currentSubreddit}_dataset.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(downloadUrl);

    exportModal.classList.remove('open');
  } catch (err) {
    console.error('Download error:', err);
    alert(`Failed to download dataset ZIP: ${err.message}`);
  } finally {
    btnConfirmDownload.disabled = false;
    downloadSpinner.style.display = 'none';
    downloadIcon.style.display = 'inline-block';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
