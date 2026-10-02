// State management
const state = {
  currentSubredditQuery: '',
  subreddits: [],
  sort: 'hot',
  images: [], // array of { index, id, title, author, originalUrl, proxyUrl, filename, ext, subreddit }
  currentIndex: 0,
  annotations: {}, // map of index -> { caption, tags: [], bboxes: [], isAnnotated, isIgnored, imageWidth, imageHeight }
  classes: ['subject', 'foreground', 'background'],
  activeClass: 'subject',
  exportFormat: 'yolo',
  isDrawing: false,
  drawStart: null,
  currentBox: null,
  lastAnnotation: null
};

const CLASS_COLORS = [
  '#000000', '#ff3300', '#0055ff', '#00aa55', '#9900ee', '#e67e22', '#16a085', '#d35400'
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
const currentSubIndicator = document.getElementById('current-sub-indicator');

const btnPrev = document.getElementById('btn-prev-img');
const btnNext = document.getElementById('btn-next-img');
const btnBack = document.getElementById('btn-back');
const btnIgnore = document.getElementById('btn-ignore-img');
const btnSaveNext = document.getElementById('btn-save-next');

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
  setupEventListeners();
  renderClassChips();
  // DO NOT fetch any default subreddit! Let the user search for themselves.
  inputSubreddit.focus();
});

// Event Listeners
function setupEventListeners() {
  btnFetch.addEventListener('click', () => {
    fetchSubreddits(inputSubreddit.value.trim());
  });

  inputSubreddit.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      fetchSubreddits(inputSubreddit.value.trim());
    }
  });

  selectSort.addEventListener('change', () => {
    state.sort = selectSort.value;
    if (inputSubreddit.value.trim()) {
      fetchSubreddits(inputSubreddit.value.trim());
    }
  });

  // Navigation
  btnPrev.addEventListener('click', () => navigateImage(-1));
  btnBack.addEventListener('click', () => navigateImage(-1));
  btnNext.addEventListener('click', () => navigateImage(1));
  btnSaveNext.addEventListener('click', () => saveAndNext());
  if (btnIgnore) btnIgnore.addEventListener('click', () => ignoreAndNext());

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
    } else if (e.key === 'x' || e.key === 'X' || e.key === 'Delete') {
      ignoreAndNext();
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

  // Canvas drawing
  setupBboxCanvas();

  // Export Modal
  btnOpenExport.addEventListener('click', openExportModal);
  btnCloseModal.addEventListener('click', () => exportModal.classList.remove('open'));
  btnCancelExport.addEventListener('click', () => exportModal.classList.remove('open'));

  document.querySelectorAll('.format-swiss-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.format-swiss-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      state.exportFormat = card.getAttribute('data-format');
    });
  });

  btnConfirmDownload.addEventListener('click', downloadDatasetZip);
}

// Fetch Subreddit(s) with multi-query support
async function fetchSubreddits(query) {
  if (!query) {
    alert('Please enter one or more subreddits (e.g. "cats" or "cats, EarthPorn").');
    return;
  }

  state.currentSubredditQuery = query;
  btnFetch.disabled = true;
  fetchSpinner.style.display = 'inline-block';
  fetchIcon.textContent = 'FETCHING...';

  try {
    const res = await fetch(`/api/fetch-subreddit?subreddit=${encodeURIComponent(query)}&sort=${state.sort}&limit=25`);
    const data = await res.json();

    if (!data.success || !data.images || data.images.length === 0) {
      alert(`No images found for "${query}". Error: ${data.error || 'Check spelling or verify subreddits are active.'}`);
      return;
    }

    state.images = data.images;
    state.subreddits = data.subreddits || [query];
    state.currentIndex = 0;
    state.annotations = {};
    state.lastAnnotation = null;

    if (currentSubIndicator) {
      currentSubIndicator.textContent = state.subreddits.map(s => `r/${s}`).join(' + ');
    }

    renderFilmstrip();
    loadImage(0);
    updateProgress();

    if (data.warnings && data.warnings.length > 0) {
      console.warn('Some subreddits had warnings:', data.warnings);
    }
  } catch (err) {
    console.error('Fetch error:', err);
    alert(`Failed to fetch: ${err.message}. Please check your connection or wait a few moments.`);
  } finally {
    btnFetch.disabled = false;
    fetchSpinner.style.display = 'none';
    fetchIcon.textContent = 'FETCH MEDIA';
  }
}

// Load Image into view
function loadImage(index) {
  if (index < 0 || index >= state.images.length) return;
  state.currentIndex = index;

  const item = state.images[index];
  imagePlaceholder.style.display = 'none';
  activeImage.style.display = 'block';

  // Highlight filmstrip item
  document.querySelectorAll('.thumb-cell').forEach((el, idx) => {
    el.classList.toggle('active', idx === index);
  });
  const activeThumb = document.querySelector(`.thumb-cell[data-index="${index}"]`);
  if (activeThumb) activeThumb.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });

  // Update Counters & Titles
  imageCounter.textContent = `INDEX ${String(index + 1).padStart(2, '0')} / ${String(state.images.length).padStart(2, '0')}`;
  redditPostTitle.textContent = `${item.title} (in r/${item.subreddit}, by ${item.author || 'anon'})`;

  // Set image source via proxy
  activeImage.src = item.proxyUrl;

  activeImage.onload = () => {
    resizeCanvasToImage();

    // Check if this image already has annotations
    if (!state.annotations[index]) {
      // Inherit previous annotation if available
      if (state.lastAnnotation) {
        state.annotations[index] = {
          caption: state.lastAnnotation.caption || generateDefaultCaption(item.title),
          tags: [...state.lastAnnotation.tags],
          bboxes: state.lastAnnotation.bboxes ? state.lastAnnotation.bboxes.map(b => ({ ...b })) : [],
          isAnnotated: false,
          isIgnored: false,
          imageWidth: activeImage.naturalWidth,
          imageHeight: activeImage.naturalHeight
        };
        inheritedPill.style.display = 'inline-block';
      } else {
        state.annotations[index] = {
          caption: generateDefaultCaption(item.title),
          tags: [item.subreddit ? item.subreddit.toLowerCase() : 'photo'],
          bboxes: [],
          isAnnotated: false,
          isIgnored: false,
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

  activeImage.onerror = () => {
    console.warn('Image load error for', item.originalUrl);
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
  const existingBadges = tagsContainer.querySelectorAll('.swiss-tag');
  existingBadges.forEach(b => b.remove());

  annot.tags.forEach(tag => {
    const badge = document.createElement('div');
    badge.className = 'swiss-tag';
    badge.innerHTML = `
      <span>${escapeHtml(tag)}</span>
      <button type="button" data-tag="${escapeHtml(tag)}">&times;</button>
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
    bboxList.innerHTML = `<span style="font-family: 'Space Mono', monospace; font-size: 0.75rem; color: var(--swiss-text-dim);">// NO BOUNDING BOXES DRAWN</span>`;
    return;
  }

  annot.bboxes.forEach((box, idx) => {
    const color = getClassColor(box.label);
    const item = document.createElement('div');
    item.className = 'bbox-ruled-item';
    item.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="display:inline-block; width:8px; height:8px; background:${color};"></span>
        <strong>${escapeHtml(box.label)}</strong>
        <span style="color: var(--swiss-text-dim); font-size: 0.72rem;">[${Math.round(box.width * 100)}% x ${Math.round(box.height * 100)}%]</span>
      </div>
      <button type="button" data-idx="${idx}">&times; DEL</button>
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
    chip.className = `swiss-tag ${c === state.activeClass ? 'active' : ''}`;
    chip.style.cursor = 'pointer';
    chip.style.border = c === state.activeClass ? '2px solid red' : '1px solid #000';
    const color = getClassColor(c);
    chip.innerHTML = `
      <span style="display:inline-block; width:6px; height:6px; background:${color}; margin-right:4px;"></span>
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

  if (annot && annot.bboxes) {
    annot.bboxes.forEach(box => {
      drawBox(box, w, h, false);
    });
  }

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
  ctx.fillStyle = `${color}20`;

  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeRect(bx, by, bw, bh);

  ctx.fillStyle = '#000000';
  ctx.fillRect(bx, by - 18, Math.min(bw, 100), 18);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 11px "Space Mono", monospace';
  ctx.fillText(box.label, bx + 4, by - 5);
}

// Filmstrip rendering
function renderFilmstrip() {
  filmstrip.innerHTML = '';
  state.images.forEach((item, idx) => {
    const thumb = document.createElement('div');
    thumb.className = `thumb-cell ${idx === state.currentIndex ? 'active' : ''}`;
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
    if (!annot.isIgnored) {
      annot.isAnnotated = true;
    }
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

function ignoreAndNext() {
  const annot = state.annotations[state.currentIndex];
  if (annot) {
    annot.isIgnored = true;
    annot.isAnnotated = false;
  }
  updateStatusBadge();
  updateProgress();
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

function updateStatusBadge() {
  const annot = state.annotations[state.currentIndex];
  const isAnnot = annot && annot.isAnnotated && !annot.isIgnored;
  const isIgnored = annot && annot.isIgnored;

  if (statusIndicator) {
    statusIndicator.className = `status-dot ${isAnnot ? 'annotated' : ''}`;
    if (isIgnored) statusIndicator.style.background = '#ff3333';
    else statusIndicator.style.background = '';
  }

  const stageContainer = document.getElementById('stage-container');
  if (stageContainer) {
    stageContainer.classList.toggle('image-ignored', !!isIgnored);
  }

  const thumb = document.querySelector(`.thumb-cell[data-index="${state.currentIndex}"]`);
  if (thumb) {
    thumb.classList.toggle('is-annotated', !!isAnnot);
    thumb.classList.toggle('is-ignored', !!isIgnored);
  }
}

function updateProgress() {
  const total = state.images.length;
  if (total === 0) return;

  const count = Object.values(state.annotations).filter(a => a.isAnnotated && !a.isIgnored).length;
  const pct = Math.round((count / total) * 100);

  headerProgressCount.textContent = `${count} / ${total} ANNOTATED`;
  footerProgressPct.textContent = `${pct}%`;

  btnOpenExport.disabled = count === 0;
}

// Export Dataset Modal & Download
function openExportModal() {
  modalSubName.textContent = state.subreddits.map(s => `r/${s}`).join(', ') || state.currentSubredditQuery;
  const count = Object.values(state.annotations).filter(a => a.isAnnotated && !a.isIgnored).length;
  modalTotalImages.textContent = `${count} images`;
  modalClassesList.textContent = state.classes.join(', ');
  exportModal.classList.add('open');
}

async function downloadDatasetZip() {
  btnConfirmDownload.disabled = true;
  downloadSpinner.style.display = 'inline-block';
  downloadIcon.textContent = 'BUILDING ARCHIVE...';

  try {
    const items = [];
    state.images.forEach((img, idx) => {
      const annot = state.annotations[idx];
      if (annot && annot.isAnnotated && !annot.isIgnored) {
        items.push({
          id: img.id,
          filename: img.filename,
          originalUrl: img.originalUrl,
          title: img.title,
          subreddit: img.subreddit,
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
      subreddit: state.subreddits.join('_'),
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
    a.download = `reddit_${state.subreddits.join('_')}_dataset.zip`;
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
    downloadIcon.textContent = 'GENERATE & DOWNLOAD ZIP';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}