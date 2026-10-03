let activeAiAbortController = null;
let activeTestAbortController = null;
// State management
const state = {
  currentSubredditQuery: '',
  subreddits: [],
  sort: 'all',
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
const btnFetch = document.getElementById('btn-fetch');
const fetchSpinner = document.getElementById('fetch-spinner');
const fetchIcon = document.getElementById('fetch-icon');
const fetchPctBadge = document.getElementById('fetch-pct-badge');
const globalProgressTrack = document.getElementById('global-progress-track');
const globalProgressBar = document.getElementById('global-progress-bar');
const stageLoadingOverlay = document.getElementById('stage-loading-overlay');
const stageLoadingText = document.getElementById('stage-loading-text');
const stageLoadingPct = document.getElementById('stage-loading-pct');
const stageLoadingMeterFill = document.getElementById('stage-loading-meter-fill');
const aiBtnProgressBar = document.getElementById('ai-btn-progress-bar');
const aiBtnLabel = document.getElementById('ai-btn-label');
const aiPctBadge = document.getElementById('ai-pct-badge');

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
const btnIgnore = document.getElementById('btn-ignore-img');
const btnDeleteImg = document.getElementById('btn-delete-img');
const btnQuickDeleteStage = document.getElementById('btn-quick-delete-stage');
const btnSaveNext = document.getElementById('btn-save-next');

const redditPostTitle = document.getElementById('reddit-post-title');
const annotationCaption = document.getElementById('annotation-caption');
const btnClearCaption = document.getElementById('btn-clear-caption');
const btnClearBboxes = document.getElementById('btn-clear-bboxes');
const btnAiPrompt = document.getElementById("btn-ai-prompt");
// const aiBtnLabel already declared above
  const inlineModelSelect = document.getElementById("inline-model-select");
const aiSpinner = document.getElementById("ai-spinner");
const geminiKeyModal = document.getElementById("gemini-key-modal");
const inputGeminiApiKey = document.getElementById("input-gemini-api-key");
const selectGeminiModel = document.getElementById("select-gemini-model");
const inputOpenAiApiKey = document.getElementById("input-openai-api-key");
const selectOpenAiModel = document.getElementById("select-openai-model");
const inputGroqApiKey = document.getElementById("input-groq-api-key");
const selectGroqModel = document.getElementById("select-groq-model");
const inputClaudeApiKey = document.getElementById("input-claude-api-key");
const selectClaudeModel = document.getElementById("select-claude-model");
const tabProviderGemini = document.getElementById("tab-provider-gemini");
const tabProviderOpenai = document.getElementById("tab-provider-openai");
const tabProviderClaude = document.getElementById("tab-provider-claude");
const tabProviderGroq = document.getElementById("tab-provider-groq");
const sectionGeminiConfig = document.getElementById("section-gemini-config");
const sectionOpenaiConfig = document.getElementById("section-openai-config");
const sectionClaudeConfig = document.getElementById("section-claude-config");
const sectionGroqConfig = document.getElementById("section-groq-config");
const tabProviderHuggingface = document.getElementById("tab-provider-huggingface");
const sectionHuggingfaceConfig = document.getElementById("section-huggingface-config");
const inputHuggingfaceApiKey = document.getElementById("input-huggingface-api-key");
const selectHuggingfaceModel = document.getElementById("select-huggingface-model");

const btnAiCompare = document.getElementById("btn-ai-compare");
const compareModal = document.getElementById("compare-modal");
const btnCloseCompareModal = document.getElementById("btn-close-compare-modal");
const btnCancelCompare = document.getElementById("btn-cancel-compare");
const btnExecuteComparison = document.getElementById("btn-execute-comparison");
const compareSpinner = document.getElementById("compare-spinner");
const compareBtnText = document.getElementById("compare-btn-text");
const compareResultsGrid = document.getElementById("compare-results-grid");
const checkCompareGemini = document.getElementById("check-compare-gemini");
const checkCompareOpenai = document.getElementById("check-compare-openai");
const checkCompareClaude = document.getElementById("check-compare-claude");
const checkCompareGroq = document.getElementById("check-compare-groq");
const btnOpenAiSettingsTop = document.getElementById("btn-open-ai-settings-top");
const btnAiSettingsPanel = document.getElementById("btn-ai-settings-panel");
const btnAuthorGuide = document.getElementById("btn-author-guide");
const guideModal = document.getElementById("guide-modal");
const btnCloseGuideModal = document.getElementById("btn-close-guide-modal");
const btnOpenSettingsFromGuide = document.getElementById("btn-open-settings-from-guide");
const btnCloseGeminiModal = document.getElementById("btn-close-gemini-modal");
const btnCancelGeminiKey = document.getElementById("btn-cancel-gemini-key");
const btnSaveGeminiKey = document.getElementById("btn-save-gemini-key");
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

const errorModal = document.getElementById('error-modal');
const errorModalTitle = document.getElementById('error-modal-title');
const errorModalBadge = document.getElementById('error-modal-badge');
const errorModalMessage = document.getElementById('error-modal-message');
const errorModalHintText = document.getElementById('error-modal-hint-text');
const btnCloseErrorModal = document.getElementById('btn-close-error-modal');
const btnErrorModalOk = document.getElementById('btn-error-modal-ok');

function showErrorModal(message, title = 'SYSTEM NOTICE', badge = 'NOTICE', hint = '') {
  if (!errorModal) {
    alert(message);
    return;
  }
  if (errorModalTitle) errorModalTitle.textContent = title;
  if (errorModalBadge) errorModalBadge.textContent = badge;
  if (errorModalMessage) errorModalMessage.textContent = message;
  
  if (hint && errorModalHintText) {
    errorModalHintText.textContent = hint;
    document.getElementById('error-modal-hint-box').style.display = 'block';
  } else if (errorModalHintText) {
    document.getElementById('error-modal-hint-box').style.display = 'none';
  }

  errorModal.classList.add('open');
}

function closeErrorModal() {
  if (errorModal) errorModal.classList.remove('open');
}


// Init
// Smooth Page Boot Curtain Controller
window.addEventListener('load', () => {
  const bootCurtain = document.getElementById('page-boot-curtain');
  if (bootCurtain) {
    setTimeout(() => {
      bootCurtain.classList.add('loaded');
      setTimeout(() => bootCurtain.remove(), 700);
    }, 450);
  }
});

// Init
window.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  renderClassChips();
  if (typeof syncInlineModelSelect === 'function') syncInlineModelSelect();
  // DO NOT pre-fetch anything! Start in clean standby state as requested.
  inputSubreddit.focus();
});

// Event Listeners
function setupEventListeners() {
  // Brand Header Logo & Title triggers Guide Modal
  const brandLogoWrap = document.querySelector('.brand-logo-wrap');
  if (brandLogoWrap) {
    brandLogoWrap.style.cursor = 'pointer';
    brandLogoWrap.title = 'Click to open REDDIZ User Guide & API Keys';
    brandLogoWrap.addEventListener('click', () => {
      if (guideModal) guideModal.classList.add('open');
    });
  }
  if (btnAuthorGuide) {
    btnAuthorGuide.addEventListener('click', () => {
      if (guideModal) guideModal.classList.add('open');
    });
  }
  if (btnCloseGuideModal) {
    btnCloseGuideModal.addEventListener('click', () => {
      if (guideModal) guideModal.classList.remove('open');
    });
  }
  if (btnOpenSettingsFromGuide) {
    btnOpenSettingsFromGuide.addEventListener('click', () => {
      if (guideModal) guideModal.classList.remove('open');
      openGeminiModal();
    });
  }
  if (guideModal) {
    guideModal.addEventListener('click', (e) => {
      if (e.target === guideModal) guideModal.classList.remove('open');
    });
  }
  btnFetch.addEventListener('click', () => {
    fetchSubreddits(inputSubreddit.value.trim());
  });

  inputSubreddit.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      fetchSubreddits(inputSubreddit.value.trim());
    }
  });



  // Navigation
  btnPrev.addEventListener('click', () => navigateImage(-1));
  btnBack.addEventListener('click', () => navigateImage(-1));
  btnNext.addEventListener('click', () => navigateImage(1));
  btnSaveNext.addEventListener('click', () => saveAndNext());
  if (btnIgnore) btnIgnore.addEventListener('click', () => ignoreAndNext());
  if (btnDeleteImg) btnDeleteImg.addEventListener('click', () => deleteImageFromQueue(state.currentIndex));
  if (btnQuickDeleteStage) btnQuickDeleteStage.addEventListener('click', () => deleteImageFromQueue(state.currentIndex));
  const btnQuickDownloadStage = document.getElementById('btn-quick-download-stage');
  if (btnQuickDownloadStage) btnQuickDownloadStage.addEventListener('click', () => downloadCurrentStageImage());

  // Keyboard navigation: UP/DOWN for vertical gallery, LEFT/RIGHT for images, ENTER for save, X for ignore
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      if (e.target === tagInput && e.key === 'Enter') {
        e.preventDefault();
        addTag(tagInput.value.trim());
        tagInput.value = '';
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      navigateImage(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      navigateImage(1);
    } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      navigateImage(-1);
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      navigateImage(1);
    } else if (e.key === 'Enter') {
      saveAndNext();
    } else if (e.key === 'x' || e.key === 'X') {
      ignoreAndNext();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteImageFromQueue(state.currentIndex);
    }
  });

  // Mouse wheel over filmstrip scrolls vertical strip
  if (filmstrip) {
    filmstrip.addEventListener('wheel', (e) => {
      e.stopPropagation();
    }, { passive: true });
  }

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

  newClassInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      btnAddClass.click();
    }
  });

  // Annotation text changes
  if (btnClearCaption) {
    btnClearCaption.addEventListener('click', () => {
      annotationCaption.value = '';
      const annot = state.annotations[state.currentIndex];
      if (annot) {
        annot.caption = '';
        inheritedPill.style.display = 'none';
      }
      annotationCaption.focus();
    });
  }

  // Synchronize inline AI model dropdown with current stored provider & model
  function syncInlineModelSelect() {
    if (!inlineModelSelect) return;
    var ap = localStorage.getItem("ai_active_provider") || "gemini";
    var am = localStorage.getItem(ap + "_model");
    if (!am) {
      if (ap === "gemini") am = "gemini-3.8-flash";
      else if (ap === "openai") am = "gpt-4o";
      else if (ap === "claude") am = "claude-3-5-sonnet-20241022";
      else if (ap === "groq") am = "llama-3.2-11b-vision-preview";
    }
    var targetVal = ap + ":" + am;
    for (var i = 0; i < inlineModelSelect.options.length; i++) {
      if (inlineModelSelect.options[i].value === targetVal) {
        inlineModelSelect.selectedIndex = i;
        return;
      }
    }
  }

  // AI Prompt Handlers with inline model selector
  if (inlineModelSelect) {
    inlineModelSelect.addEventListener("change", () => {
      var parts = inlineModelSelect.value.split(":");
      var provider = parts[0];
      var model = parts[1];
      localStorage.setItem("ai_active_provider", provider);
      localStorage.setItem(provider + "_model", model);
      var key = localStorage.getItem(provider + "_api_key") || "";
      if (!key) {
        openGeminiModal(provider);
      }
    });
  }

  if (btnAiPrompt) {
    btnAiPrompt.addEventListener("click", () => {
      const currentItem = state.images[state.currentIndex];
      if (!currentItem) {
        showErrorModal("Please fetch a subreddit and select an image from the vertical gallery first before generating an AI prompt.", "NO IMAGE SELECTED", "CLIENT STATE", "Enter a subreddit name at the top bar and click FETCH MEDIA.");
        return;
      }
      var provider = "gemini";
      var model = "gemini-3.8-flash";
      if (inlineModelSelect && inlineModelSelect.value) {
        var parts = inlineModelSelect.value.split(":");
        provider = parts[0] || "gemini";
        model = parts[1] || "gemini-3.8-flash";
      } else {
        provider = localStorage.getItem("ai_active_provider") || "gemini";
        model = localStorage.getItem(provider + "_model") || "gemini-3.8-flash";
      }
      localStorage.setItem("ai_active_provider", provider);
      localStorage.setItem(provider + "_model", model);
      const savedKey = localStorage.getItem(provider + "_api_key");
      if (!savedKey) {
        openGeminiModal(provider);
      } else {
        generateAiPrompt(savedKey, model, provider);
      }
    });
  }

  const btnAiStop = document.getElementById("btn-ai-stop");
  if (btnAiStop) {
    btnAiStop.addEventListener("click", () => {
      if (activeAiAbortController) {
        activeAiAbortController.abort();
        activeAiAbortController = null;
      }
    });
  }

  if (btnCloseGeminiModal) {
    btnCloseGeminiModal.addEventListener('click', () => geminiKeyModal.classList.remove('open'));
  }
  if (btnCancelGeminiKey) {
    btnCancelGeminiKey.addEventListener('click', () => geminiKeyModal.classList.remove('open'));
  }
  if (btnSaveGeminiKey) {
    
  // LIVE AI MODEL TEST BENCH
  const btnTestAiModel = document.getElementById("btn-test-ai-model");
  const aiTestSpinner = document.getElementById("ai-test-spinner");
  const aiTestBtnLabel = document.getElementById("ai-test-btn-label");
  const aiTestStatus = document.getElementById("ai-test-status");
  const aiTestResultBox = document.getElementById("ai-test-result-box");
  const aiTestResultMeta = document.getElementById("ai-test-result-meta");
  const aiTestOutput = document.getElementById("ai-test-output");

  const btnTestAiStop = document.getElementById("btn-test-ai-stop");
  if (btnTestAiStop) {
    btnTestAiStop.addEventListener("click", () => {
      if (activeTestAbortController) {
        activeTestAbortController.abort();
        activeTestAbortController = null;
      }
    });
  }

  if (btnTestAiModel) {
    btnTestAiModel.addEventListener("click", async () => {
      const ap = localStorage.getItem("ai_active_provider") || "gemini";
      let key = "";
      let model = "";
      if (ap === "gemini") {
        key = (inputGeminiApiKey ? inputGeminiApiKey.value.trim() : "") || localStorage.getItem("gemini_api_key") || "";
        model = (selectGeminiModel ? selectGeminiModel.value : "") || localStorage.getItem("gemini_model") || "gemini-3.8-flash";
      } else if (ap === "openai") {
        key = (inputOpenAiApiKey ? inputOpenAiApiKey.value.trim() : "") || localStorage.getItem("openai_api_key") || "";
        model = (selectOpenAiModel ? selectOpenAiModel.value : "") || localStorage.getItem("openai_model") || "gpt-4o";
      } else if (ap === "claude") {
        key = (inputClaudeApiKey ? inputClaudeApiKey.value.trim() : "") || localStorage.getItem("claude_api_key") || "";
        model = (selectClaudeModel ? selectClaudeModel.value : "") || localStorage.getItem("claude_model") || "claude-3-5-sonnet-20241022";
      } else if (ap === "groq") {
        key = (inputGroqApiKey ? inputGroqApiKey.value.trim() : "") || localStorage.getItem("groq_api_key") || "";
        model = (selectGroqModel ? selectGroqModel.value : "") || localStorage.getItem("groq_model") || "llama-3.2-11b-vision-preview";
      } else if (ap === "huggingface") {
        key = (inputHuggingfaceApiKey ? inputHuggingfaceApiKey.value.trim() : "") || localStorage.getItem("huggingface_api_key") || "";
        model = (selectHuggingfaceModel ? selectHuggingfaceModel.value : "") || localStorage.getItem("huggingface_model") || "Salesforce/blip-image-captioning-large";
      }

      if (!key) {
        if (aiTestStatus) {
          aiTestStatus.style.display = "inline-block";
          aiTestStatus.className = "ai-test-status-badge error";
          aiTestStatus.textContent = "MISSING API KEY";
        }
        if (aiTestResultBox) aiTestResultBox.style.display = "block";
        if (aiTestResultMeta) aiTestResultMeta.textContent = ap.toUpperCase() + " / " + model;
        if (aiTestOutput) aiTestOutput.textContent = "Please enter your " + ap.toUpperCase() + " API key in the field above before testing.";
        return;
      }

      btnTestAiModel.disabled = true;
      if (aiTestSpinner) aiTestSpinner.style.display = "inline-block";
      if (aiTestBtnLabel) aiTestBtnLabel.textContent = "TESTING...";
      if (aiTestStatus) {
        aiTestStatus.style.display = "inline-block";
        aiTestStatus.className = "ai-test-status-badge running";
        aiTestStatus.textContent = "PINGING MODEL...";
      }
      if (aiTestResultBox) aiTestResultBox.style.display = "none";

      const startTime = performance.now();
      const testPixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
      let testEndpoint = "/api/" + ap + "-prompt";
      if (ap === "huggingface") testEndpoint = "/api/huggingface-prompt";

      activeTestAbortController = new AbortController();
      const btnTestAiStop = document.getElementById("btn-test-ai-stop");
      if (btnTestAiStop) btnTestAiStop.style.display = "inline-flex";
      try {
        const res = await fetch(testEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: key, imageUrl: testPixel, model: model, provider: ap }),
          signal: activeTestAbortController.signal
        });
        const elapsed = Math.round(performance.now() - startTime);
        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error || ("HTTP " + res.status));
        }

        if (aiTestStatus) {
          aiTestStatus.style.display = "inline-block";
          aiTestStatus.className = "ai-test-status-badge success";
          aiTestStatus.textContent = "STATUS 200 OK (" + elapsed + "ms)";
        }
        if (aiTestResultBox) aiTestResultBox.style.display = "block";
        if (aiTestResultMeta) {
          aiTestResultMeta.innerHTML = "<span>" + ap.toUpperCase() + " &bull; " + model + "</span><span>LATENCY: " + elapsed + "ms</span>";
        }
        if (aiTestOutput) {
          aiTestOutput.textContent = (data.caption || "Model responded successfully (empty caption returned).").trim();
        }
      } catch (err) {
        const elapsed = Math.round(performance.now() - startTime);
        if (aiTestStatus) {
          aiTestStatus.style.display = "inline-block";
          aiTestStatus.className = "ai-test-status-badge error";
          aiTestStatus.textContent = "TEST FAILED (" + elapsed + "ms)";
        }
        if (aiTestResultBox) aiTestResultBox.style.display = "block";
        if (aiTestResultMeta) {
          aiTestResultMeta.innerHTML = "<span style=\"color:var(--swiss-red);\">ERROR: " + ap.toUpperCase() + " &bull; " + model + "</span><span>" + elapsed + "ms</span>";
        }
        if (aiTestOutput) {
          aiTestOutput.textContent = err.message || "Unknown error occurred during test.";
        }
      } finally {
        btnTestAiModel.disabled = false;
        if (aiTestSpinner) aiTestSpinner.style.display = "none";
        if (aiTestBtnLabel) aiTestBtnLabel.textContent = "▶ TEST ACTIVE MODEL";
      }
    });
  }

  btnSaveGeminiKey.addEventListener("click", () => {
      var ap = localStorage.getItem("ai_active_provider") || "gemini";
      var gKey = inputGeminiApiKey ? inputGeminiApiKey.value.trim() : "";
      var oKey = inputOpenAiApiKey ? inputOpenAiApiKey.value.trim() : "";
      var cKey = inputClaudeApiKey ? inputClaudeApiKey.value.trim() : "";
      var rKey = inputGroqApiKey ? inputGroqApiKey.value.trim() : "";
      if (gKey) localStorage.setItem("gemini_api_key", gKey);
      if (oKey) localStorage.setItem("openai_api_key", oKey);
      if (cKey) localStorage.setItem("claude_api_key", cKey);
      if (rKey) localStorage.setItem('groq_api_key', rKey);
      var hfKey = inputHuggingfaceApiKey ? inputHuggingfaceApiKey.value.trim() : '';
      var hfModel = selectHuggingfaceModel ? selectHuggingfaceModel.value.trim() : '';
      if (hfKey) localStorage.setItem('huggingface_api_key', hfKey);
      if (hfModel) localStorage.setItem('huggingface_model', hfModel);
      if (selectGeminiModel) localStorage.setItem("gemini_model", selectGeminiModel.value);
      if (selectOpenAiModel) localStorage.setItem("openai_model", selectOpenAiModel.value);
      if (selectClaudeModel) localStorage.setItem("claude_model", selectClaudeModel.value);
      if (selectGroqModel) localStorage.setItem("groq_model", selectGroqModel.value);
      geminiKeyModal.classList.remove("open");
      if (typeof syncInlineModelSelect === "function") syncInlineModelSelect();
      var activeKey = localStorage.getItem(ap + "_api_key");
      var activeModel = localStorage.getItem(ap + "_model");
      if (activeKey) {
        generateAiPrompt(activeKey, activeModel, ap);
      }
    });
  }
// removed extra brace
  if (btnClearBboxes) {
    btnClearBboxes.addEventListener('click', () => {
      const annot = state.annotations[state.currentIndex];
      if (annot) {
        annot.bboxes = [];
        renderBboxList();
        redrawCanvas();
      }
    });
  }

  annotationCaption.addEventListener('input', () => {
    const annot = state.annotations[state.currentIndex];
    if (annot) {
      annot.caption = annotationCaption.value;
      inheritedPill.style.display = 'none';
    }
  });

  // Export Modal
  btnOpenExport.addEventListener('click', openExportModal);
  btnCloseModal.addEventListener('click', () => exportModal.classList.remove('open'));
  btnCancelExport.addEventListener('click', () => exportModal.classList.remove('open'));
  btnConfirmDownload.addEventListener('click', downloadDatasetZip);

  if (btnCloseErrorModal) btnCloseErrorModal.addEventListener('click', closeErrorModal);
  if (btnErrorModalOk) btnErrorModalOk.addEventListener('click', closeErrorModal);
  const btnErrorOpenSettings = document.getElementById('btn-error-open-settings');
  if (btnErrorOpenSettings) {
    btnErrorOpenSettings.addEventListener('click', () => {
      closeErrorModal();
      openGeminiModal();
    });
  }
  if (errorModal) {
    errorModal.addEventListener('click', (e) => {
      if (e.target === errorModal) closeErrorModal();
    });
  }


  document.querySelectorAll('.format-swiss-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.format-swiss-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      state.exportFormat = card.getAttribute('data-format');
    });
  });

  // AI Settings buttons - both header top button and panel button open the modal
  if (btnOpenAiSettingsTop) {
    btnOpenAiSettingsTop.addEventListener('click', () => openGeminiModal());
  }
  if (btnAiSettingsPanel) {
    btnAiSettingsPanel.addEventListener('click', () => openGeminiModal());
  }

  // Provider Tab Switching inside AI Settings modal
  window._switchProviderTab = switchProviderTab;
  function switchProviderTab(provider) {
    const tabs = { gemini: tabProviderGemini, openai: tabProviderOpenai, claude: tabProviderClaude, groq: tabProviderGroq, huggingface: tabProviderHuggingface };
    const sections = { gemini: sectionGeminiConfig, openai: sectionOpenaiConfig, claude: sectionClaudeConfig, groq: sectionGroqConfig, huggingface: sectionHuggingfaceConfig };
    Object.keys(tabs).forEach(k => {
      if (tabs[k]) {
        if (k === provider) {
          tabs[k].classList.add("active-tab");
          tabs[k].style.background = "#000000";
          tabs[k].style.color = "#ffffff";
          tabs[k].style.fontWeight = "900";
        } else {
          tabs[k].classList.remove("active-tab");
          tabs[k].style.background = "#f0f0ee";
          tabs[k].style.color = "#666666";
          tabs[k].style.fontWeight = "700";
        }
      }
      if (sections[k]) sections[k].style.display = k === provider ? "block" : "none";
    });
    localStorage.setItem("ai_active_provider", provider);
  }

  if (tabProviderGemini) tabProviderGemini.addEventListener('click', () => switchProviderTab('gemini'));
  if (tabProviderOpenai) tabProviderOpenai.addEventListener('click', () => switchProviderTab('openai'));
  if (tabProviderClaude) tabProviderClaude.addEventListener('click', () => switchProviderTab('claude'));
  if (tabProviderGroq) tabProviderGroq.addEventListener('click', () => switchProviderTab('groq'));
  if (tabProviderHuggingface) tabProviderHuggingface.addEventListener('click', () => switchProviderTab('huggingface'));

  // Close AI modal on backdrop click
  if (geminiKeyModal) {
    geminiKeyModal.addEventListener('click', (e) => {
      if (e.target === geminiKeyModal) geminiKeyModal.classList.remove('open');
    });
  }

  setupBboxCanvas();
}
// Fetch Subreddits (supports single or multiple comma/space/plus-separated queries)

// Smooth Progress Simulation Helpers
function startGlobalProgress(initialText = "WEAVING DATASET...") {
  if (globalProgressTrack) globalProgressTrack.classList.add("active");
  if (fetchPctBadge) {
    fetchPctBadge.style.display = "inline-block";
    fetchPctBadge.textContent = "0%";
  }
  if (stageLoadingOverlay) {
    stageLoadingOverlay.classList.add("active");
    if (stageLoadingText) stageLoadingText.textContent = initialText;
    if (stageLoadingPct) stageLoadingPct.textContent = "0%";
    if (stageLoadingMeterFill) stageLoadingMeterFill.style.width = "0%";
  }

  // Animated Web Ring references
  const r1 = document.getElementById("web-ring-1");
  const r2 = document.getElementById("web-ring-2");
  const r3 = document.getElementById("web-ring-3");
  function updateWebRings(pct) {
    if (r1) r1.style.strokeDashoffset = Math.max(0, 200 - (pct / 33) * 200);
    if (r2) r2.style.strokeDashoffset = pct > 33 ? Math.max(0, 200 - ((pct - 33) / 33) * 200) : 200;
    if (r3) r3.style.strokeDashoffset = pct > 66 ? Math.max(0, 200 - ((pct - 66) / 34) * 200) : 200;
  }
  updateWebRings(5);

  let currentPct = 5;
  if (globalProgressBar) globalProgressBar.style.width = "5%";
  if (stageLoadingMeterFill) stageLoadingMeterFill.style.width = "5%";

  const interval = setInterval(() => {
    if (currentPct < 92) {
      const step = Math.max(1, Math.floor((96 - currentPct) / 8));
      currentPct += step;
      if (globalProgressBar) globalProgressBar.style.width = currentPct + "%";
      if (stageLoadingMeterFill) stageLoadingMeterFill.style.width = currentPct + "%";
      if (fetchPctBadge) fetchPctBadge.textContent = currentPct + "%";
      if (stageLoadingPct) stageLoadingPct.textContent = currentPct + "%";
      updateWebRings(currentPct);
    }
  }, 120);

  const finishHandler = () => {
    clearInterval(interval);
    currentPct = 100;
    if (globalProgressBar) globalProgressBar.style.width = "100%";
    if (stageLoadingMeterFill) stageLoadingMeterFill.style.width = "100%";
    if (fetchPctBadge) fetchPctBadge.textContent = "100%";
    if (stageLoadingPct) stageLoadingPct.textContent = "100%";
    updateWebRings(100);
    setTimeout(() => {
      if (globalProgressTrack) globalProgressTrack.classList.remove("active");
      if (globalProgressBar) globalProgressBar.style.width = "0%";
      if (fetchPctBadge) fetchPctBadge.style.display = "none";
      if (stageLoadingOverlay) stageLoadingOverlay.classList.remove("active");
    }, 380);
  };

  return {
    finish: finishHandler,
    complete: finishHandler,
    abort: () => {
      clearInterval(interval);
      if (globalProgressTrack) globalProgressTrack.classList.remove("active");
      if (globalProgressBar) globalProgressBar.style.width = "0%";
      if (fetchPctBadge) fetchPctBadge.style.display = "none";
      if (stageLoadingOverlay) stageLoadingOverlay.classList.remove("active");
    }
  };
}
function startAiPromptProgress() {
  if (aiBtnProgressBar) aiBtnProgressBar.style.width = '0%';
  if (aiPctBadge) {
    aiPctBadge.style.display = 'inline-block';
    aiPctBadge.textContent = '0%';
  }
  if (aiBtnLabel) aiBtnLabel.textContent = 'ANALYZING...';

  let currentPct = 5;
  if (aiBtnProgressBar) aiBtnProgressBar.style.width = '5%';

  const interval = setInterval(() => {
    if (currentPct < 90) {
      const step = Math.max(1, Math.floor((95 - currentPct) / 12));
      currentPct += step;
      if (aiBtnProgressBar) aiBtnProgressBar.style.width = currentPct + '%';
      if (aiPctBadge) aiPctBadge.textContent = currentPct + '%';
    }
  }, 160);

  return {
    finish: () => {
      clearInterval(interval);
      if (aiBtnProgressBar) aiBtnProgressBar.style.width = '100%';
      if (aiPctBadge) aiPctBadge.textContent = '100%';
      setTimeout(() => {
        if (aiBtnProgressBar) aiBtnProgressBar.style.width = '0%';
        if (aiPctBadge) aiPctBadge.style.display = 'none';
        if (aiBtnLabel) aiBtnLabel.textContent = 'âš¡ AI PROMPT';
      }, 400);
    },
    abort: () => {
      clearInterval(interval);
      if (aiBtnProgressBar) aiBtnProgressBar.style.width = '0%';
      if (aiPctBadge) aiPctBadge.style.display = 'none';
      if (aiBtnLabel) aiBtnLabel.textContent = 'âš¡ AI PROMPT';
    }
  };
}

async function fetchSubreddits(query) {
  if (!query) {
    showErrorModal('Please enter at least one subreddit name to fetch images from (e.g. streetphotography, cats, wallpapers).', 'QUERY EMPTY', 'INPUT VALIDATION', 'Separate multiple subreddits with commas or spaces.');
    return;
  }

  state.currentSubredditQuery = query;
  
  state.sort = 'hot';

  const progressCtrl = startGlobalProgress('FETCHING SUBREDDIT MEDIA...');
  btnFetch.disabled = true;
  fetchSpinner.style.display = 'inline-block';
  fetchIcon.textContent = 'FETCHING...';

  try {
    const res = await fetch(`/api/fetch-subreddit?subreddit=${encodeURIComponent(query)}&sort=${state.sort}&limit=100`);
    const data = await res.json();

    if (!data.success || !data.images || data.images.length === 0) {
      showErrorModal(data.error || 'No images could be retrieved. The subreddit may be private, banned, empty, or misspelled.', 'FETCH FAILED', 'REDDIT API', 'Verify that the subreddit exists and has public image posts.');
      return;
    }

    const isAppending = state.images && state.images.length > 0;
    
    if (isAppending) {
      const startIdx = state.images.length;
      data.images.forEach((img, i) => {
        img.index = startIdx + i;
        state.images.push(img);
      });
      data.subreddits.forEach(s => {
        if (!state.subreddits.includes(s)) state.subreddits.push(s);
      });
      renderFilmstrip();
      updateProgress();
    } else {
      state.images = data.images;
      state.subreddits = data.subreddits || [query];
      state.currentIndex = 0;
      state.annotations = {};
      state.lastAnnotation = null;

      renderFilmstrip();
      loadImage(0);
      updateProgress();
    }

    if (data.warnings && data.warnings.length > 0) {
      console.warn('Some subreddits had warnings:', data.warnings);
    }
  } catch (err) {
    console.error('Fetch error:', err);
    showErrorModal(err.message, 'FETCH ERROR', 'NETWORK / RATE LIMIT', 'Reddit may be temporarily rate-limiting requests or your internet connection was interrupted. Please wait a few seconds and try again.');
  } finally {
    if (progressCtrl && typeof progressCtrl.complete === 'function') progressCtrl.complete();
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

  // Highlight filmstrip item and scroll into view
  document.querySelectorAll('.vertical-gallery-strip .thumb-cell').forEach((el, idx) => {
    el.classList.toggle('active', idx === index);
  });
  const activeThumb = document.querySelector(`.vertical-gallery-strip .thumb-cell[data-index="${index}"]`);
  if (activeThumb) activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

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
          bboxes: [],
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

    renderCurrentForm();
    redrawCanvas();
    updateStatusBadge();
  };

  activeImage.onerror = () => {
    console.error('Failed to load image:', item.proxyUrl);
    // Mark as skipped or broken placeholder
    activeImage.style.display = 'none';
    imagePlaceholder.style.display = 'block';
    imagePlaceholder.innerHTML = `
      <p style="color: #ff3300; font-family: 'Space Mono', monospace; font-weight: bold;">[ IMAGE LOAD ERROR ]</p>
      <p style="font-size: 0.8rem; margin-top: 6px;">Hotlink blocked or media deleted on Reddit.</p>
    `;
  };
}

function generateDefaultCaption(title) {
  if (!title) return '';
  // Clean up reddit-isms like [OC], (f), resolution tags, etc.
  return title
    .replace(/\[\s*oc\s*\]/gi, '')
    .replace(/\(\s*oc\s*\)/gi, '')
    .replace(/\[\d+\s*x\s*\d+\]/gi, '')
    .replace(/\(\d+\s*x\s*\d+\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderCurrentForm() {
  const annot = state.annotations[state.currentIndex] || { caption: '', tags: [], bboxes: [] };
  annotationCaption.value = annot.caption || '';
  renderTags();
  renderBboxList();
}

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

  // Touch support for mobile devices
  bboxCanvas.addEventListener('touchstart', (e) => {
    if (!activeImage.src || e.touches.length === 0) return;
    const touch = e.touches[0];
    const rect = bboxCanvas.getBoundingClientRect();
    const x = (touch.clientX - rect.left) / rect.width;
    const y = (touch.clientY - rect.top) / rect.height;
    state.isDrawing = true;
    state.drawStart = { x, y };
    state.currentBox = { x, y, width: 0, height: 0, label: state.activeClass };
    e.preventDefault();
  }, { passive: false });

  bboxCanvas.addEventListener('touchmove', (e) => {
    if (!state.isDrawing || e.touches.length === 0) return;
    const touch = e.touches[0];
    const rect = bboxCanvas.getBoundingClientRect();
    const currentX = (touch.clientX - rect.left) / rect.width;
    const currentY = (touch.clientY - rect.top) / rect.height;
    const startX = state.drawStart.x;
    const startY = state.drawStart.y;
    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    state.currentBox = {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
      width: Math.min(1 - x, width),
      height: Math.min(1 - y, height),
      label: state.activeClass
    };
    redrawCanvas();
    e.preventDefault();
  }, { passive: false });

  window.addEventListener('touchend', () => {
    if (!state.isDrawing) return;
    state.isDrawing = false;
    if (state.currentBox && state.currentBox.width > 0.02 && state.currentBox.height > 0.02) {
      const annot = state.annotations[state.currentIndex];
      if (annot) {
        if (!annot.bboxes) annot.bboxes = [];
        annot.bboxes.push(state.currentBox);
        renderBboxList();
      }
    }
    state.currentBox = null;
    redrawCanvas();
  });

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
    const currentX = (e.clientX - rect.left) / rect.width;
    const currentY = (e.clientY - rect.top) / rect.height;

    const startX = state.drawStart.x;
    const startY = state.drawStart.y;

    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    state.currentBox = {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
      width: Math.min(1 - x, width),
      height: Math.min(1 - y, height),
      label: state.activeClass
    };

    redrawCanvas();
  });

  window.addEventListener('mouseup', () => {
    if (!state.isDrawing) return;
    state.isDrawing = false;

    if (state.currentBox && state.currentBox.width > 0.02 && state.currentBox.height > 0.02) {
      const annot = state.annotations[state.currentIndex];
      if (annot) {
        if (!annot.bboxes) annot.bboxes = [];
        annot.bboxes.push(state.currentBox);
        renderBboxList();
      }
    }

    state.currentBox = null;
    redrawCanvas();
  });
}

function resizeCanvasToImage() {
  if (!activeImage || !activeImage.src) return;
  const rect = stageWrapper.getBoundingClientRect();
  bboxCanvas.width = rect.width;
  bboxCanvas.height = rect.height;
  redrawCanvas();
}

function redrawCanvas() {
  const w = bboxCanvas.width;
  const h = bboxCanvas.height;
  ctx.clearRect(0, 0, w, h);

  const annot = state.annotations[state.currentIndex];
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

// Vertical Gallery Filmstrip rendering
function renderFilmstrip() {
  filmstrip.innerHTML = '';
  state.images.forEach((item, idx) => {
    const thumb = document.createElement('div');
    thumb.className = `thumb-cell ${idx === state.currentIndex ? 'active' : ''}`;
    thumb.setAttribute('data-index', idx);
    thumb.innerHTML = `
      <img src="${item.proxyUrl}" alt="thumb" loading="lazy">
      <button type="button" class="thumb-remove-btn" title="Delete image from queue" data-delete-idx="${idx}">&times;</button>
    `;
    thumb.addEventListener('click', (e) => {
      if (e.target.closest('.thumb-remove-btn')) return;
      saveCurrentAnnotationState(false);
      loadImage(idx);
    });
    const removeBtn = thumb.querySelector('.thumb-remove-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteImageFromQueue(idx);
      });
    }
    filmstrip.appendChild(thumb);
  });
}

// Save Current Image & Advance
function saveCurrentAnnotationState(explicitSave = false) {
  const annot = state.annotations[state.currentIndex];
  if (annot) {
    annot.caption = annotationCaption.value.trim();
    if (explicitSave && !annot.isIgnored) {
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

function showSaveToast(message = "ANNOTATION SAVED") {
  const existing = document.getElementById("save-toast-banner");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.id = "save-toast-banner";
  toast.className = "save-toast-banner";
  toast.innerHTML = `<span style="display:inline-block;width:8px;height:8px;background:#00aa44;box-shadow:0 0 6px #00aa44;"></span><span>${message}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 2400);
}

function saveAndNext() {
  saveCurrentAnnotationState(true);
  if (state.currentIndex < state.images.length - 1) {
    loadImage(state.currentIndex + 1);
  } else {
    showSaveToast("FINAL IMAGE ANNOTATION SAVED [USE EXPORT ZIP WHEN READY]");
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

function clearStageForEmptyQueue() {
  if (activeImage) {
    activeImage.src = '';
    activeImage.style.display = 'none';
  }
  if (imagePlaceholder) {
    imagePlaceholder.style.display = 'flex';
    imagePlaceholder.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;">
        <span class="material-symbols-rounded" style="font-size:36px;color:var(--swiss-text-dim);">imagesmode</span>
        <p style="color:var(--swiss-text-dim);font-weight:700;font-family:'Space Mono',monospace;">[ READY FOR INPUT ]</p>
        <p style="color:var(--swiss-text-muted);font-size:0.85rem;max-width:280px;line-height:1.4;">Load image sets using subreddit name(s) above or paste your image from clipboard here (Ctrl+V).</p>
      </div>
    `;
  }
  if (bboxCanvas) {
    const bCtx = bboxCanvas.getContext('2d');
    if (bCtx) bCtx.clearRect(0, 0, bboxCanvas.width, bboxCanvas.height);
  }
  if (imageCounter) imageCounter.textContent = 'INDEX 00 / 00 [9:16 CROP]';
  if (redditPostTitle) redditPostTitle.textContent = 'No image selected';
  if (annotationCaption) annotationCaption.value = '';
  if (tagsContainer) tagsContainer.innerHTML = '';
  if (bboxList) bboxList.innerHTML = '// NO BOUNDING BOXES DRAWN';
  if (btnOpenExport) btnOpenExport.disabled = true;
  if (statusIndicator) {
    statusIndicator.className = 'status-dot';
    statusIndicator.style.background = '';
  }
  const stageContainer = document.getElementById('stage-container');
  if (stageContainer) stageContainer.classList.remove('image-ignored');
}

function deleteImageFromQueue(targetIndex) {
  if (typeof targetIndex !== 'number' || targetIndex < 0 || targetIndex >= state.images.length) return;
  const deletedItem = state.images[targetIndex];
  const itemTitle = deletedItem ? (deletedItem.title || 'IMAGE') : 'IMAGE';

  // Remove from state.images
  state.images.splice(targetIndex, 1);

  // Cleanly rebuild annotations map
  const newAnnotations = {};
  let newIdx = 0;
  for (let i = 0; i <= state.images.length; i++) {
    if (i === targetIndex) continue;
    if (state.annotations[i]) {
      newAnnotations[newIdx] = state.annotations[i];
    }
    newIdx++;
  }
  state.annotations = newAnnotations;

  // Re-index remaining images
  state.images.forEach((item, i) => {
    item.index = i;
  });

  // If queue is completely empty
  if (state.images.length === 0) {
    state.currentIndex = -1;
    renderFilmstrip();
    clearStageForEmptyQueue();
    updateProgress();
    showSaveToast("IMAGE DELETED (QUEUE IS NOW EMPTY)");
    return;
  }

  // Adjust active index and re-load
  let nextIdx = state.currentIndex;
  if (targetIndex === state.currentIndex) {
    nextIdx = Math.min(targetIndex, state.images.length - 1);
  } else if (targetIndex < state.currentIndex) {
    nextIdx = Math.max(0, state.currentIndex - 1);
  } else {
    nextIdx = Math.min(state.currentIndex, state.images.length - 1);
  }

  state.currentIndex = nextIdx;
  renderFilmstrip();
  loadImage(nextIdx);
  updateProgress();
  showSaveToast(`DELETED: ${itemTitle.substring(0, 24).toUpperCase()}`);
}

function navigateImage(delta) {
  saveCurrentAnnotationState(false);
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

  const thumb = document.querySelector(`.vertical-gallery-strip .thumb-cell[data-index="${state.currentIndex}"]`);
  if (thumb) {
    thumb.classList.toggle('is-annotated', !!isAnnot);
    thumb.classList.toggle('is-ignored', !!isIgnored);
  }
}

function updateProgress() {
  const total = state.images.length;
  if (total === 0) {
    if (headerProgressCount) headerProgressCount.textContent = '0/0 ANNOTATED';
    if (footerProgressPct) footerProgressPct.textContent = '0%';
    if (btnOpenExport) btnOpenExport.disabled = true;
    return;
  }

  const count = Object.values(state.annotations).filter(a => a && a.isAnnotated && !a.isIgnored).length;
  const pct = Math.round((count / total) * 100);

  if (headerProgressCount) headerProgressCount.textContent = `${count}/${total} ANNOTATED`;
  if (footerProgressPct) footerProgressPct.textContent = `${pct}%`;

  if (btnOpenExport) btnOpenExport.disabled = total === 0;
}

// Direct single-image download
function downloadCurrentStageImage() {
  if (state.currentIndex < 0 || state.currentIndex >= state.images.length) return;
  const item = state.images[state.currentIndex];
  if (!item) return;

  const url = item.originalUrl || item.proxyUrl;
  const filename = item.filename || `image_${state.currentIndex + 1}.${item.ext || 'jpg'}`;

  if (url.startsWith('data:')) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showSaveToast(`DOWNLOADING ${filename.toUpperCase()}`);
    return;
  }

  fetch(item.proxyUrl || url)
    .then(res => res.blob())
    .then(blob => {
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
      showSaveToast(`DOWNLOADING ${filename.toUpperCase()}`);
    })
    .catch(err => {
      console.warn('Direct blob fetch failed, falling back to window.open:', err);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      a.remove();
      showSaveToast(`OPENING IMAGE IN NEW TAB`);
    });
}

// Export Dataset Modal & Download
function openExportModal() {
  const total = state.images.length;
  if (total === 0) return;
  modalSubName.textContent = state.subreddits.map(s => `r/${s}`).join(', ') || state.currentSubredditQuery || 'custom_dataset';
  const count = Object.values(state.annotations).filter(a => a && a.isAnnotated && !a.isIgnored).length;
  modalTotalImages.textContent = `${total} images (${count} annotated)`;
  modalClassesList.textContent = state.classes.join(', ');
  exportModal.classList.add('open');
}

async function downloadDatasetZip() {
  btnConfirmDownload.disabled = true;
  downloadSpinner.style.display = 'inline-block';
  downloadIcon.textContent = 'BUILDING ARCHIVE...';

  try {
    if (state.images.length === 0) {
      showErrorModal('No images loaded in session. Please fetch images or paste an image first.', 'DATASET EMPTY', 'NO IMAGES', 'Enter subreddit names or press Ctrl+V to paste an image.');
      return;
    }

    const items = [];
    state.images.forEach((img, idx) => {
      const annot = state.annotations[idx] || {};
      if (!annot.isIgnored) {
        items.push({
          id: img.id || `img_${idx}`,
          filename: img.filename || `image_${String(idx + 1).padStart(4, '0')}.${img.ext || 'jpg'}`,
          originalUrl: img.originalUrl || img.proxyUrl,
          proxyUrl: img.proxyUrl || img.originalUrl,
          title: img.title || `Image ${idx + 1}`,
          subreddit: img.subreddit || (state.subreddits[0] || 'dataset'),
          annotation: {
            caption: annot.caption || generateDefaultCaption(img.title),
            tags: (annot.tags && annot.tags.length > 0) ? annot.tags : [img.subreddit || 'photo'],
            bboxes: annot.bboxes || [],
            imageWidth: annot.imageWidth || (activeImage.naturalWidth || 1000),
            imageHeight: annot.imageHeight || (activeImage.naturalHeight || 1000)
          }
        });
      }
    });

    if (items.length === 0) {
      showErrorModal('All images in your queue are marked as ignored. Please un-ignore at least one image to export.', 'NO ACTIVE IMAGES', 'ALL IGNORED', 'Navigate to an image and click SAVE & NEXT.');
      return;
    }

    const payload = {
      subreddit: state.subreddits.join('_') || 'custom_dataset',
      items: items,
      format: state.exportFormat || 'yolo',
      classes: state.classes
    };

    const response = await fetch('/api/export-dataset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Server error while packaging dataset' }));
      throw new Error(err.error || 'Server error while packaging dataset');
    }

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `reddit_${(state.subreddits.join('_') || 'dataset').replace(/[^a-zA-Z0-9_-]/g, '_')}_dataset.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(downloadUrl);

    exportModal.classList.remove('open');
    showSaveToast('DATASET ARCHIVE DOWNLOADED SUCCESSFULLY');
  } catch (err) {
    console.error('Download error:', err);
    showErrorModal(`Failed to package and download your dataset: ${err.message}`, 'EXPORT FAILED', 'SERVER ERROR', 'Ensure images are loaded and try exporting again.');
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





function openGeminiModal(preferredProvider) {
  if (inputGeminiApiKey) inputGeminiApiKey.value = localStorage.getItem('gemini_api_key') || '';
  if (inputOpenAiApiKey) inputOpenAiApiKey.value = localStorage.getItem('openai_api_key') || '';
  if (inputClaudeApiKey) inputClaudeApiKey.value = localStorage.getItem('claude_api_key') || '';
  if (inputGroqApiKey) inputGroqApiKey.value = localStorage.getItem("groq_api_key") || "";
  if (inputHuggingfaceApiKey) inputHuggingfaceApiKey.value = localStorage.getItem("huggingface_api_key") || "";
  if (selectHuggingfaceModel) selectHuggingfaceModel.value = localStorage.getItem("huggingface_model") || "Salesforce/blip-image-captioning-large";
  if (selectGeminiModel) selectGeminiModel.value = localStorage.getItem('gemini_model') || 'gemini-3.8-flash';
  if (selectOpenAiModel) selectOpenAiModel.value = localStorage.getItem('openai_model') || 'gpt-4o';
  if (selectClaudeModel) selectClaudeModel.value = localStorage.getItem('claude_model') || 'claude-3-5-sonnet-20241022';
  if (selectGroqModel) selectGroqModel.value = localStorage.getItem('groq_model') || 'llama-3.2-11b-vision-preview';
  var ap = preferredProvider || localStorage.getItem('ai_active_provider') || 'gemini';
  if (typeof window._switchProviderTab === 'function') { window._switchProviderTab(ap); }
  else { ['gemini','openai','claude','groq','huggingface'].forEach(function(k) { var t=document.getElementById('tab-provider-'+k); var s=document.getElementById('section-'+k+'-config'); if(t){t.style.background=k===ap?'var(--swiss-black)':'#f0f0ee';t.style.color=k===ap?'#fff':'#666';} if(s)s.style.display=k===ap?'block':'none'; }); }
  geminiKeyModal.classList.add('open');
  var ai = document.getElementById('input-' + ap + '-api-key');
  if (ai) setTimeout(function() { ai.focus(); }, 80);
}

async function generateAiPrompt(apiKey, model, provider) {
  if (!provider) provider = localStorage.getItem('ai_active_provider') || 'gemini';
  if (!model) model = localStorage.getItem(provider + '_model') || 'gemini-3.8-flash';
  if (!apiKey) apiKey = localStorage.getItem(provider + '_api_key') || '';
  var currentItem = state.images[state.currentIndex];
  if (!currentItem) return;
  activeAiAbortController = new AbortController();
  btnAiPrompt.disabled = true;
  const btnAiStopElem = document.getElementById('btn-ai-stop');
  if (btnAiStopElem) btnAiStopElem.style.display = 'inline-flex';
  if (aiSpinner) aiSpinner.style.display = 'inline-block';
  if (aiBtnLabel) aiBtnLabel.textContent = 'ANALYZING...';
  var endpointMap = { gemini: '/api/gemini-prompt', openai: '/api/openai-prompt', claude: '/api/claude-prompt', groq: '/api/groq-prompt', huggingface: '/api/huggingface-prompt' };
  var endpoint = endpointMap[provider] || '/api/gemini-prompt';
  const scanShroud = document.getElementById('ai-scan-shroud');
  const scanHudText = document.getElementById('ai-scan-hud-text');
  if (scanShroud) {
    if (scanHudText) scanHudText.textContent = (provider.toUpperCase()) + ' SCANNING PIXELS...';
    scanShroud.classList.add('active');
  }
  try {
    var response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: apiKey, imageUrl: currentItem.proxyUrl, model: model, provider: provider }), signal: activeAiAbortController.signal });
    var data = await response.json();
    if (!response.ok || !data.success) {
      if (data.error && (data.error.includes('API key not valid') || data.error.includes('Incorrect API key') || data.error.includes('invalid_api_key'))) {
        localStorage.removeItem(provider + '_api_key');
        showErrorModal('Your ' + provider + ' API key is invalid. Please re-enter it in AI Settings.', 'INVALID API KEY', 'AUTHENTICATION', 'Click AI SETTINGS and update your key.');
        openGeminiModal(provider); return;
      }
      throw new Error(data.error || 'Failed to generate caption with ' + provider);
    }
    const captionText = (data.caption || '').trim();
    // 1. Update STATE first so any re-render reads correct value
    if (!state.annotations[state.currentIndex]) {
      state.annotations[state.currentIndex] = { bboxes: [], tags: [], caption: '', isAnnotated: false };
    }
    var annot = state.annotations[state.currentIndex];
    annot.caption = captionText;
    annot.isAnnotated = true;
    state.lastAnnotation = { bboxes: [...annot.bboxes], tags: [...annot.tags], caption: captionText };
    // 2. Update DOM immediately
    if (annotationCaption) { annotationCaption.value = captionText; }
    if (inheritedPill) inheritedPill.style.display = 'none';
    updateStatusBadge();
    updateProgress();
    renderFilmstrip();
    // 3. Deferred guarantee — re-apply after any microtask/rerender side-effects
    setTimeout(function() {
      if (annotationCaption && state.annotations[state.currentIndex]) {
        annotationCaption.value = state.annotations[state.currentIndex].caption || '';
      }
    }, 50);
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('AI prompt analysis aborted by user.');
      return;
    }
    console.error('AI prompt error (' + provider + '):', err);
    var pn = { gemini: 'GEMINI', openai: 'OPENAI', claude: 'CLAUDE', groq: 'GROQ', huggingface: 'HUGGING FACE' };
    var errMsg = err.message || 'Unknown error';
    var hint = 'Check your API key in AI SETTINGS or try another model/provider.';
    if (errMsg.toLowerCase().includes('high demand') || errMsg.toLowerCase().includes('overloaded') || errMsg.toLowerCase().includes('429') || errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('rate')) {
      hint = 'The AI provider is experiencing high demand. Wait a moment and try again. Consider switching providers in AI SETTINGS.';
    }
    showErrorModal(errMsg, 'AI PROMPT FAILED', (pn[provider]||provider.toUpperCase()) + ' VISION ERROR', hint);
  } finally {
    activeAiAbortController = null;
    const scanShroud = document.getElementById('ai-scan-shroud');
    if (scanShroud) scanShroud.classList.remove('active');
    const btnAiStopElem = document.getElementById('btn-ai-stop');
    if (btnAiStopElem) btnAiStopElem.style.display = 'none';
    btnAiPrompt.disabled = false;
    if (aiSpinner) aiSpinner.style.display = 'none';
    if (aiBtnLabel) aiBtnLabel.textContent = 'AI PROMPT';
  }
}




// Side Panel Drag-to-Resize Implementation
(function setupPanelResizer() {
  const resizer = document.getElementById('panel-resizer');
  const panel = document.querySelector('.editorial-side-panel');
  if (!resizer || !panel) return;

  // Restore saved width
  const savedWidth = localStorage.getItem('reddiz_panel_width');
  if (savedWidth) {
    const w = parseInt(savedWidth, 10);
    if (w >= 220 && w <= 450) {
      panel.style.width = w + 'px';
    } else {
      panel.style.width = '280px';
    }
  } else {
    panel.style.width = '280px';
  }

  let isDragging = false;
  let startX = 0;
  let startWidth = 0;

  resizer.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startWidth = panel.getBoundingClientRect().width;
    resizer.classList.add('resizing');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const delta = startX - e.clientX;
    let newWidth = startWidth + delta;
    if (newWidth < 220) newWidth = 220;
    if (newWidth > 650) newWidth = 650;
    panel.style.width = newWidth + 'px';
  });

  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    resizer.classList.remove('resizing');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    const finalWidth = Math.round(panel.getBoundingClientRect().width);
    localStorage.setItem('reddiz_panel_width', finalWidth);
  });

  // Double click resizer to reset to compact default 280px
  resizer.addEventListener('dblclick', () => {
    panel.style.width = '280px';
    localStorage.setItem('reddiz_panel_width', 280);
  });
})();


// ==========================================================================
// MANUAL MEDIA UPLOAD CONTROLLER (LOCAL FILES + URL WITH LIVE PREVIEW)
// ==========================================================================
(function setupManualUpload() {
  window.openUploadModal = function() {
    switchUploadTab("local");
    const uploadModal = document.getElementById("upload-modal");
    if (uploadModal) uploadModal.classList.add("open");
  };
  const btnOpenUpload = document.getElementById("btn-open-upload");
  const uploadModal = document.getElementById("upload-modal");
  const btnCloseUploadModal = document.getElementById("btn-close-upload-modal");
  const btnCancelUpload = document.getElementById("btn-cancel-upload");
  const tabUploadLocal = document.getElementById("tab-upload-local");
  const tabUploadUrl = document.getElementById("tab-upload-url");
  const sectionUploadLocal = document.getElementById("section-upload-local");
  const sectionUploadUrl = document.getElementById("section-upload-url");
  const uploadDropzone = document.getElementById("upload-dropzone");
  const inputLocalFiles = document.getElementById("input-local-files");
  const inputUploadUrl = document.getElementById("input-upload-url");
  const btnAddUrlPreview = document.getElementById("btn-add-url-preview");
  const uploadPreviewContainer = document.getElementById("upload-preview-container");
  const uploadPreviewGrid = document.getElementById("upload-preview-grid");
  const uploadQueueCount = document.getElementById("upload-queue-count");
  const btnClearUploadQueue = document.getElementById("btn-clear-upload-queue");
  const btnCommitUpload = document.getElementById("btn-commit-upload");

  let uploadQueue = []; // array of { title, author, originalUrl, proxyUrl, filename, ext, subreddit, isLocal }

  function switchUploadTab(tab) {
    if (tab === "local") {
      tabUploadLocal.classList.add("active-tab");
      tabUploadLocal.style.background = "#000000";
      tabUploadLocal.style.color = "#ffffff";
      tabUploadLocal.style.fontWeight = "900";
      tabUploadUrl.classList.remove("active-tab");
      tabUploadUrl.style.background = "#f0f0ee";
      tabUploadUrl.style.color = "#666666";
      tabUploadUrl.style.fontWeight = "700";
      sectionUploadLocal.style.display = "block";
      sectionUploadUrl.style.display = "none";
    } else {
      tabUploadUrl.classList.add("active-tab");
      tabUploadUrl.style.background = "#000000";
      tabUploadUrl.style.color = "#ffffff";
      tabUploadUrl.style.fontWeight = "900";
      tabUploadLocal.classList.remove("active-tab");
      tabUploadLocal.style.background = "#f0f0ee";
      tabUploadLocal.style.color = "#666666";
      tabUploadLocal.style.fontWeight = "700";
      sectionUploadUrl.style.display = "block";
      sectionUploadLocal.style.display = "none";
      if (inputUploadUrl) setTimeout(() => inputUploadUrl.focus(), 80);
    }
  }

  if (tabUploadLocal) tabUploadLocal.addEventListener("click", () => switchUploadTab("local"));
  if (tabUploadUrl) tabUploadUrl.addEventListener("click", () => switchUploadTab("url"));

  function updatePreviewQueueUI() {
    if (!uploadPreviewContainer || !uploadPreviewGrid) return;
    if (uploadQueue.length === 0) {
      uploadPreviewContainer.style.display = "none";
      uploadPreviewGrid.innerHTML = "";
      if (btnCommitUpload) {
        btnCommitUpload.disabled = true;
        btnCommitUpload.textContent = "+ ADD TO SESSION";
      }
      return;
    }

    uploadPreviewContainer.style.display = "block";
    if (uploadQueueCount) uploadQueueCount.textContent = uploadQueue.length;
    if (btnCommitUpload) {
      btnCommitUpload.disabled = false;
      btnCommitUpload.textContent = `+ ADD ${uploadQueue.length} ${uploadQueue.length === 1 ? "IMAGE" : "IMAGES"} TO SESSION`;
    }

    uploadPreviewGrid.innerHTML = "";
    uploadQueue.forEach((item, idx) => {
      const card = document.createElement("div");
      card.className = "upload-preview-item";
      card.title = item.title;
      card.innerHTML = `
        <img src="${item.proxyUrl}" alt="preview">
        <button type="button" class="upload-preview-remove" data-remove-idx="${idx}" title="Remove image">&times;</button>
      `;
      uploadPreviewGrid.appendChild(card);
    });

    uploadPreviewGrid.querySelectorAll(".upload-preview-remove").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const removeIdx = parseInt(btn.getAttribute("data-remove-idx"), 10);
        uploadQueue.splice(removeIdx, 1);
        updatePreviewQueueUI();
      });
    });
  }

  function handleFileSelection(files) {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file, i) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        const nameParts = file.name.split(".");
        const ext = nameParts.length > 1 ? nameParts.pop().toLowerCase() : "jpg";
        const title = nameParts.join(".") || `uploaded_image_${Date.now()}_${i}`;
        uploadQueue.push({
          id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          title: title,
          author: "local_upload",
          originalUrl: dataUrl,
          proxyUrl: dataUrl,
          filename: `${title}.${ext}`,
          ext: ext,
          subreddit: "manual_upload",
          isLocal: true
        });
        updatePreviewQueueUI();
      };
      reader.readAsDataURL(file);
    });
  }

  if (uploadDropzone && inputLocalFiles) {
    uploadDropzone.addEventListener("click", () => inputLocalFiles.click());
    inputLocalFiles.addEventListener("change", (e) => {
      handleFileSelection(e.target.files);
      inputLocalFiles.value = "";
    });

    uploadDropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      uploadDropzone.classList.add("dragover");
    });
    uploadDropzone.addEventListener("dragleave", () => {
      uploadDropzone.classList.remove("dragover");
    });
    uploadDropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      uploadDropzone.classList.remove("dragover");
      handleFileSelection(e.dataTransfer.files);
    });
  }

  function handleUrlAdd() {
    if (!inputUploadUrl) return;
    const url = inputUploadUrl.value.trim();
    if (!url) return;

    let testImg = new Image();
    testImg.onload = () => {
      const cleanUrl = url.split("?")[0];
      const parts = cleanUrl.split("/");
      const lastPart = parts[parts.length - 1] || `web_image_${Date.now()}`;
      const extMatch = lastPart.match(/\.(jpe?g|png|webp|avif|gif)$/i);
      const ext = extMatch ? extMatch[1].toLowerCase() : "jpg";
      const title = lastPart.replace(/\.[^.]+$/, "") || "web_uploaded_photo";

      const proxyUrl = url.startsWith("data:") ? url : `/api/proxy-image?url=${encodeURIComponent(url)}`;
      uploadQueue.push({
        id: `url_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title: title,
        author: "web_link",
        originalUrl: url,
        proxyUrl: proxyUrl,
        filename: `${title}.${ext}`,
        ext: ext,
        subreddit: "web_upload",
        isLocal: false
      });
      inputUploadUrl.value = "";
      updatePreviewQueueUI();
    };
    testImg.onerror = () => {
      const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(url)}`;
      let proxyImg = new Image();
      proxyImg.onload = () => {
        uploadQueue.push({
          id: `url_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          title: "web_uploaded_image",
          author: "web_link",
          originalUrl: url,
          proxyUrl: proxyUrl,
          filename: `web_image_${Date.now()}.jpg`,
          ext: "jpg",
          subreddit: "web_upload",
          isLocal: false
        });
        inputUploadUrl.value = "";
        updatePreviewQueueUI();
      };
      proxyImg.onerror = () => {
        showErrorModal("Unable to load image from the provided link. Please ensure the link is direct, publicly accessible, and points to a valid image format.", "URL LOAD FAILED", "LINK ERROR", "Try right-clicking the image on the web and choosing 'Copy image address'.");
      };
      proxyImg.src = proxyUrl;
    };
    testImg.src = url;
  }

  if (btnAddUrlPreview) btnAddUrlPreview.addEventListener("click", handleUrlAdd);
  if (inputUploadUrl) {
    inputUploadUrl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleUrlAdd();
      }
    });
  }

  if (btnClearUploadQueue) {
    btnClearUploadQueue.addEventListener("click", () => {
      uploadQueue = [];
      updatePreviewQueueUI();
    });
  }

  // Open & Close Modal
  if (btnOpenUpload) {
    btnOpenUpload.addEventListener("click", () => {
      switchUploadTab("local");
      if (uploadModal) uploadModal.classList.add("open");
    });
  }
  if (btnCloseUploadModal) {
    btnCloseUploadModal.addEventListener("click", () => {
      if (uploadModal) uploadModal.classList.remove("open");
    });
  }
  if (btnCancelUpload) {
    btnCancelUpload.addEventListener("click", () => {
      if (uploadModal) uploadModal.classList.remove("open");
    });
  }

  // Commit items into main session state
  if (btnCommitUpload) {
    btnCommitUpload.addEventListener("click", () => {
      if (uploadQueue.length === 0) return;
      const initialEmpty = state.images.length === 0;
      const startIdx = state.images.length;

      uploadQueue.forEach((item, i) => {
        item.index = startIdx + i;
        state.images.push(item);
      });

      if (!state.subreddits.includes("manual_upload")) {
        state.subreddits.push("manual_upload");
      }

      renderFilmstrip();
      if (initialEmpty) {
        loadImage(0);
      } else {
        loadImage(startIdx);
      }
      updateProgress();
      if (typeof updateStatusBadge === "function") updateStatusBadge();

      showSaveToast(`+${uploadQueue.length} IMAGES ADDED TO SESSION`);
      uploadQueue = [];
      updatePreviewQueueUI();
      if (uploadModal) uploadModal.classList.remove("open");
    });
  }

  // Handle global paste events for images
  window.addEventListener("paste", (e) => {
    // Only intercept if we aren't typing in an input or textarea
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    const imageFiles = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length === 0) return;
    e.preventDefault();

    // Check if the upload modal is currently open
    const uploadModal = document.getElementById("upload-modal");
    const isModalOpen = uploadModal && uploadModal.classList.contains("open");

    if (isModalOpen) {
      handleFileSelection(imageFiles);
      showSaveToast(`📋 ${imageFiles.length} IMAGE${imageFiles.length > 1 ? 'S' : ''} ADDED TO UPLOAD PREVIEW`);
      return;
    }

    // Direct paste into active session
    let processedCount = 0;
    const initialEmpty = state.images.length === 0;
    const startIndex = state.images.length;

    imageFiles.forEach((file, idx) => {
      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        const dataUrl = loadEvt.target.result;
        const now = Date.now();
        const ext = file.type ? file.type.split('/')[1] || 'png' : 'png';
        const title = (file.name && file.name !== 'image.png' && file.name !== 'blob')
          ? file.name.replace(/\.[^.]+$/, '')
          : `pasted_image_${now}_${idx + 1}`;
        const filename = `${title}.${ext}`;

        const newImageItem = {
          id: `pasted_${now}_${Math.random().toString(36).slice(2, 7)}`,
          title: title,
          author: "clipboard",
          originalUrl: dataUrl,
          proxyUrl: dataUrl,
          filename: filename,
          ext: ext,
          subreddit: "clipboard",
          isLocal: true,
          index: state.images.length
        };

        state.images.push(newImageItem);
        if (!state.subreddits.includes("clipboard")) {
          state.subreddits.push("clipboard");
        }

        processedCount++;
        if (processedCount === imageFiles.length) {
          renderFilmstrip();
          if (initialEmpty) {
            loadImage(0);
          } else {
            loadImage(startIndex);
          }
          updateProgress();
          updateStatusBadge();
          showSaveToast(`📋 ${imageFiles.length === 1 ? 'IMAGE PASTED FROM CLIPBOARD (+1 ADDED TO QUEUE)' : `+${imageFiles.length} IMAGES PASTED FROM CLIPBOARD`}`);
        }
      };
      reader.readAsDataURL(file);
    });
  });
})();

// ==========================================================================
// LOCAL BACKUPS VAULT (DATE/TIMESTAMP + IMAGE COUNT + RESTORE MANAGER)
// ==========================================================================
const BACKUP_STORAGE_KEY = 'reddiz_saved_backups_v2';

function getSavedBackups() {
  try {
    const raw = localStorage.getItem(BACKUP_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.error('Error reading backups from localStorage:', e);
    return [];
  }
}

function persistBackups(list) {
  try {
    localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Error saving backups to localStorage:', e);
  }
}

function saveCurrentSessionBackup() {
  if (!state.images || state.images.length === 0) {
    showErrorModal("Your current queue is empty. Load or paste images before creating a backup.", "BACKUP EMPTY", "NO IMAGES IN QUEUE", "Search subreddits or paste images using Ctrl+V.");
    return;
  }

  const now = new Date();
  const dateFormatted = now.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const totalImages = state.images.length;
  const annotatedCount = Object.values(state.annotations).filter(a => a && a.isAnnotated && !a.isIgnored).length;
  const subredditsList = state.subreddits && state.subreddits.length > 0 ? state.subreddits : ['custom_session'];

  const newBackup = {
    id: `backup_${now.getTime()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: dateFormatted,
    timestampISO: now.toISOString(),
    imageCount: totalImages,
    annotatedCount: annotatedCount,
    subreddits: [...subredditsList],
    state: {
      images: state.images,
      annotations: state.annotations,
      subreddits: state.subreddits,
      classes: state.classes,
      currentIndex: state.currentIndex,
      sort: state.sort || 'new'
    }
  };

  const backups = getSavedBackups();
  backups.unshift(newBackup); // latest at top
  if (backups.length > 20) backups.pop();
  persistBackups(backups);

  // Maintain quick backup cache
  localStorage.setItem('reddiz_backup', JSON.stringify(newBackup.state));

  showSaveToast(`💾 BACKUP SAVED • ${dateFormatted} • ${totalImages} IMAGES`);
  renderBackupVaultList();
}

function renderBackupVaultList() {
  const container = document.getElementById('backup-vault-list');
  const summary = document.getElementById('vault-summary-text');
  if (!container) return;

  const backups = getSavedBackups();
  if (summary) summary.textContent = `${backups.length} SAVED BACKUP${backups.length === 1 ? '' : 'S'} IN BROWSER`;

  if (backups.length === 0) {
    container.innerHTML = `
      <div style="padding: 36px 20px; text-align: center; border: 2px dashed var(--swiss-border-hairline); background: #fafafa;">
        <span class="material-symbols-rounded" style="font-size: 42px; color: var(--swiss-text-dim); margin-bottom: 8px;">inventory_2</span>
        <h4 style="font-family: 'Space Mono', monospace; font-size: 0.95rem; font-weight: 700; margin-bottom: 6px;">NO SAVED BACKUPS YET</h4>
        <p style="font-size: 0.82rem; color: var(--swiss-text-muted); max-width: 340px; margin: 0 auto 16px; line-height: 1.4;">
          Click the blue <strong>SAVE</strong> button in the top bar to snapshot your current work with a date &amp; timestamp and image count.
        </p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  backups.forEach(item => {
    const card = document.createElement('div');
    card.className = 'vault-item-card';
    const subList = (item.subreddits || []).map(s => `r/${s}`).join(', ') || 'custom_session';

    card.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
          <span style="font-family: 'Space Mono', monospace; font-weight: 700; font-size: 0.95rem; color: #111;">
            ${escapeHtml(item.timestamp)}
          </span>
          <span class="vault-badge vault-badge-count">
            ${item.imageCount} IMAGES
          </span>
          <span class="vault-badge vault-badge-annotated">
            ${item.annotatedCount} ANNOTATED
          </span>
        </div>
        <div style="font-size: 0.78rem; color: var(--swiss-text-muted); font-family: 'Space Mono', monospace;">
          Sources: <strong style="color: #222;">${escapeHtml(subList)}</strong>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
        <button type="button" class="btn-restore-vault-item reddiz-btn-blue" data-id="${item.id}" style="padding: 7px 14px; font-size: 0.78rem;">
          LOAD BACKUP &rarr;
        </button>
        <button type="button" class="btn-delete-vault-item footer-btn btn-delete" data-id="${item.id}" style="padding: 7px 12px; font-size: 0.78rem;">
          DELETE
        </button>
      </div>
    `;

    card.querySelector('.btn-restore-vault-item').addEventListener('click', () => {
      restoreBackupById(item.id);
    });

    card.querySelector('.btn-delete-vault-item').addEventListener('click', () => {
      deleteBackupById(item.id);
    });

    container.appendChild(card);
  });
}

function restoreBackupById(backupId) {
  const backups = getSavedBackups();
  const target = backups.find(b => b.id === backupId);
  if (!target || !target.state) {
    showErrorModal("Could not find the requested backup snapshot.", "RESTORE FAILED", "STORAGE ERROR", "The backup may have been deleted.");
    return;
  }

  try {
    const backupState = target.state;
    state.images = backupState.images || [];
    state.annotations = backupState.annotations || {};
    state.subreddits = backupState.subreddits || [];
    state.classes = backupState.classes || ['subject', 'foreground', 'background'];
    state.currentIndex = backupState.currentIndex || 0;
    if (backupState.sort) state.sort = backupState.sort;

    if (typeof renderClassChips === 'function') renderClassChips();
    if (typeof renderFilmstrip === 'function') renderFilmstrip();
    if (state.images.length > 0) {
      if (typeof loadImage === 'function') loadImage(state.currentIndex);
    } else {
      if (typeof clearStageForEmptyQueue === 'function') clearStageForEmptyQueue();
    }
    if (typeof updateProgress === 'function') updateProgress();
    if (typeof updateStatusBadge === 'function') updateStatusBadge();

    const vaultModal = document.getElementById('backup-vault-modal');
    if (vaultModal) vaultModal.classList.remove('open');

    showSaveToast(`RESTORED BACKUP: ${target.timestamp} (${target.imageCount} IMAGES)`);
  } catch (err) {
    console.error('Failed to restore backup:', err);
    showErrorModal(`Failed to restore backup: ${err.message}`, "RESTORE FAILED", "PARSING ERROR", "Ensure local storage is accessible.");
  }
}

function deleteBackupById(backupId) {
  let backups = getSavedBackups();
  backups = backups.filter(b => b.id !== backupId);
  persistBackups(backups);
  renderBackupVaultList();
  showSaveToast("BACKUP SNAPSHOT DELETED");
}

function openBackupVaultModal() {
  renderBackupVaultList();
  const vaultModal = document.getElementById('backup-vault-modal');
  if (vaultModal) vaultModal.classList.add('open');
}

function closeBackupVaultModal() {
  const vaultModal = document.getElementById('backup-vault-modal');
  if (vaultModal) vaultModal.classList.remove('open');
}

window.addEventListener('DOMContentLoaded', () => {
  // Wire Save Backup button (and legacy alias)
  const btnSaveBackup = document.getElementById('btn-save-backup');
  const btnSyncLocal = document.getElementById('btn-sync-local');
  if (btnSaveBackup) {
    btnSaveBackup.addEventListener('click', saveCurrentSessionBackup);
  } else if (btnSyncLocal) {
    btnSyncLocal.addEventListener('click', saveCurrentSessionBackup);
  }

  // Wire Load Backup button
  const btnOpenLoadBackup = document.getElementById('btn-open-load-backup');
  if (btnOpenLoadBackup) {
    btnOpenLoadBackup.addEventListener('click', openBackupVaultModal);
  }

  // Wire Vault Modal buttons
  const btnCloseBackupVault = document.getElementById('btn-close-backup-vault');
  const btnCloseBackupVaultBottom = document.getElementById('btn-close-backup-vault-bottom');
  const btnVaultSaveNew = document.getElementById('btn-vault-save-new');
  const vaultModal = document.getElementById('backup-vault-modal');

  if (btnCloseBackupVault) btnCloseBackupVault.addEventListener('click', closeBackupVaultModal);
  if (btnCloseBackupVaultBottom) btnCloseBackupVaultBottom.addEventListener('click', closeBackupVaultModal);
  if (btnVaultSaveNew) btnVaultSaveNew.addEventListener('click', saveCurrentSessionBackup);

  if (vaultModal) {
    vaultModal.addEventListener('click', (e) => {
      if (e.target === vaultModal) closeBackupVaultModal();
    });
  }

  // Sync Fetch & Upload Button widths with Buy Me a Coffee & Author cells
  function syncFetchButtonWidth() {
    const bmacCell = document.querySelector('.bmac-cell') || document.querySelector('.btn-bmac');
    const fetchBtn = document.getElementById('btn-fetch');
    if (bmacCell && fetchBtn) {
      const w = Math.round(bmacCell.getBoundingClientRect().width);
      if (w > 0) {
        document.documentElement.style.setProperty('--bmac-width', `${w}px`);
        fetchBtn.style.width = `${w}px`;
        fetchBtn.style.minWidth = `${w}px`;
      }
    }

    const authorCell = document.querySelector('.author-cell');
    const uploadBtn = document.getElementById('btn-open-upload');
    if (authorCell && uploadBtn) {
      const aw = Math.round(authorCell.getBoundingClientRect().width);
      if (aw > 0) {
        uploadBtn.style.width = `${aw}px`;
        uploadBtn.style.minWidth = `${aw}px`;
      }
    }
  }

  syncFetchButtonWidth();
  window.addEventListener('resize', syncFetchButtonWidth);
  window.addEventListener('load', syncFetchButtonWidth);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(syncFetchButtonWidth);
  }
});

