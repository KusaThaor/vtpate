/**
 * manager.js - VTPATE Crawl & Packaging Studio
 * Manifest V3 CSP Compliant (Zero inline scripts, zero eval)
 * Features: Anti-Bot Login Session Check, Manual Parser Tuning, Buttons Storage Center, Python Human Timing Simulation
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Lucide icons if available
  if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
    lucide.createIcons();
  }

  // --- UI Elements ---
  // Header & Status
  const crawlStageBadge = document.getElementById('crawl-stage');
  const serviceWorkerStatus = document.getElementById('serviceWorkerStatus');
  const themeSelect = document.getElementById('themeSelect');

  // --- Theme Selection & Persistence (User Custom Palette vs Classic) ---
  function applyTheme(themeName) {
    let validTheme = themeName;
    if (!['custom-palette', 'palette-pastel', 'dark-classic'].includes(validTheme)) {
      validTheme = 'custom-palette';
    }
    document.documentElement.setAttribute('data-theme', validTheme);
    document.body.classList.remove('theme-palette-custom', 'theme-palette-pastel', 'theme-dark-classic', 'theme-dark');
    if (validTheme === 'custom-palette') {
      document.body.classList.add('theme-palette-custom');
    } else if (validTheme === 'palette-pastel') {
      document.body.classList.add('theme-palette-pastel');
    } else {
      document.body.classList.add('theme-dark-classic');
    }
    if (themeSelect && themeSelect.value !== validTheme) {
      themeSelect.value = validTheme;
    }
    const indicatorDot = document.getElementById('themeIndicatorDot');
    if (indicatorDot) {
      if (validTheme === 'palette-pastel') {
        indicatorDot.style.backgroundColor = '#915e56';
      } else if (validTheme === 'custom-palette') {
        indicatorDot.style.backgroundColor = '#2db0b1';
      } else {
        indicatorDot.style.backgroundColor = '#0284c7';
      }
    }
  }

  // Load saved theme or default to custom-palette
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['vtpate_theme'], (res) => {
        const savedTheme = res?.vtpate_theme || 'custom-palette';
        applyTheme(savedTheme);
      });
    } else {
      const localTheme = localStorage.getItem('vtpate_theme') || 'custom-palette';
      applyTheme(localTheme);
    }
  } catch (err) {
    applyTheme('custom-palette');
  }

  if (themeSelect) {
    themeSelect.addEventListener('change', (e) => {
      const newTheme = e.target.value;
      applyTheme(newTheme);
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ vtpate_theme: newTheme });
        }
        localStorage.setItem('vtpate_theme', newTheme);
      } catch (err) {
        console.warn('Could not persist theme:', err);
      }
    });
  }

  // Input & Parser Detection
  const inputNovelUrl = document.getElementById('inputNovelUrl');
  const btnFetchMetadata = document.getElementById('btnFetchMetadata');
  const detectedParserBadge = document.getElementById('detectedParserBadge');

  // Section 1.5: Auth & Anti-Bot Session Check
  const sessionStatusBadge = document.getElementById('sessionStatusBadge');
  const loginDomainInput = document.getElementById('login-domain');
  const loginUrlInput = document.getElementById('login-url');
  const loginUserInput = document.getElementById('login-user');
  const loginPassInput = document.getElementById('login-pass');
  const btnTogglePassword = document.getElementById('btn-toggle-password');
  const btnOpenLoginTab = document.getElementById('btn-open-login-tab');
  const btnCheckCookies = document.getElementById('btn-check-cookies');
  const btnSaveCredentials = document.getElementById('btn-save-credentials');

  // Section 2: Crawl Profile & Python Human Timing
  const crawlModeSelect = document.getElementById('crawl-mode');
  const concurrencyInput = document.getElementById('concurrency');
  const delayInput = document.getElementById('delay');
  const jitterCheckbox = document.getElementById('jitter');
  const pageLoadWaitInput = document.getElementById('page-load-wait');
  const readingWpmInput = document.getElementById('reading-wpm');
  const enableWpmDelayCheckbox = document.getElementById('enable-wpm-delay');
  const maxWaitSecondsInput = document.getElementById('max-wait-seconds');
  const interChapterDelayInput = document.getElementById('inter-chapter-delay');
  const recheckWaitSecondsInput = document.getElementById('recheck-wait-seconds');
  const quickMaxWaitInput = document.getElementById('quick-max-wait');
  const quickFixedWaitInput = document.getElementById('quick-fixed-wait');
  const quickRecheckWaitInput = document.getElementById('quick-recheck-wait');
  const quickEnableWpmCheckbox = document.getElementById('quick-enable-wpm');
  const btnSkipWait = document.getElementById('btn-skip-wait');
  const btnQuickSkipWait = document.getElementById('btn-quick-skip-wait');
  const breakIntervalInput = document.getElementById('break-interval');
  const breakSecondsInput = document.getElementById('break-seconds');
  const visibleTabCrawlCheckbox = document.getElementById('visible-tab-crawl');
  const backgroundChaptersCheckbox = document.getElementById('background-chapters-crawl');
  const autoRetryFailedCheckbox = document.getElementById('auto-retry-failed-crawl');
  const includeInlineImagesCheckbox = document.getElementById('include-inline-images');
  const autoPauseOnSleepCheckbox = document.getElementById('auto-pause-on-sleep');
  const maxConsecutiveErrorsSelect = document.getElementById('max-consecutive-errors');
  const epubSplitSizeSelect = document.getElementById('epub-split-size');
  const autoFillPlaceholdersCheckbox = document.getElementById('auto-fill-placeholders');
  const autoSkipErrorsCheckbox = document.getElementById('auto-skip-errors-crawl');
  const quickSkipErrorsCheckbox = document.getElementById('quick-skip-errors');

  // Sleep & Circuit Breaker Alerts
  const sleepOrErrorAlertNotice = document.getElementById('sleepOrErrorAlertNotice');
  const sleepAlertTitle = document.getElementById('sleepAlertTitle');
  const sleepAlertDesc = document.getElementById('sleepAlertDesc');
  const btnAlertResumeCrawl = document.getElementById('btn-alert-resume-crawl');
  const btnAlertRetryFailed = document.getElementById('btn-alert-retry-failed');

  // Section 2.5: Manual Parser Tuning Selectors
  const selectorStoryTitle = document.getElementById('selector-story-title');
  const selectorAuthor = document.getElementById('selector-author');
  const selectorCover = document.getElementById('selector-cover');
  const selectorDesc = document.getElementById('selector-desc');
  const selectorChapterList = document.getElementById('selector-chapter-list');
  const selectorChapterTitle = document.getElementById('selector-chapter-title');
  const selectorChapterContent = document.getElementById('selector-chapter-content');
  const selectorClassesToRemove = document.getElementById('selector-classes-to-remove');
  const selectorNextChapterBtn = document.getElementById('selector-next-chapter-btn');
  const btnApplySelectors = document.getElementById('btn-apply-selectors');
  const btnTestChapter = document.getElementById('btn-test-chapter');
  const btnResetSelectors = document.getElementById('btn-reset-selectors');

  // Test Chapter Preview
  const testPreviewContainer = document.getElementById('testPreviewContainer');
  const testPreviewChapterTitle = document.getElementById('testPreviewChapterTitle');
  const testPreviewWordCount = document.getElementById('testPreviewWordCount');
  const testPreviewContent = document.getElementById('testPreviewContent');
  const btnCloseTestPreview = document.getElementById('btn-close-test-preview');

  // Section 2.8: Storage & Profile Management (Buttons Center)
  const btnSaveProfile = document.getElementById('btn-save-profile');
  const btnLoadProfile = document.getElementById('btn-load-profile');
  const btnSaveCheckpoint = document.getElementById('btn-save-checkpoint');
  const btnRestoreCheckpoint = document.getElementById('btn-restore-checkpoint');
  const btnExportProfiles = document.getElementById('btn-export-profiles');
  const btnImportProfiles = document.getElementById('btn-import-profiles');
  const importJsonFileInput = document.getElementById('importJsonFileInput');
  const btnDeleteProfile = document.getElementById('btn-delete-profile');
  const savedProfileChips = document.getElementById('savedProfileChips');

  // Metadata Fields
  const novelTitleInput = document.getElementById('novel-title');
  const novelAuthorInput = document.getElementById('novel-author');
  const novelDescInput = document.getElementById('novel-desc');
  const coverImage = document.getElementById('coverImage');
  const coverPlaceholder = document.getElementById('coverPlaceholder');
  const novelCoverUrlInput = document.getElementById('novel-cover-url');
  const btnApplyCoverUrl = document.getElementById('btn-apply-cover-url');
  const btnGenerateCover = document.getElementById('btn-generate-cover');

  // Chapter Selection
  const totalChaptersCount = document.getElementById('totalChaptersCount');
  const btnSelectAll = document.getElementById('btn-select-all');
  const btnDeselectAll = document.getElementById('btn-deselect-all');
  const btnReverse = document.getElementById('btn-reverse');
  const btnManualChapters = document.getElementById('btn-manual-chapters');
  const rangeFromInput = document.getElementById('range-from');
  const rangeToInput = document.getElementById('range-to');
  const btnApplyRange = document.getElementById('btn-apply-range');
  const chapterListContainer = document.getElementById('chapter-list');

  // Multi-page Pagination Selectors
  const paginationTypeSelect = document.getElementById('pagination-type');
  const paginationPatternInput = document.getElementById('pagination-pattern');
  const nextPageSelectorInput = document.getElementById('next-page-selector');
  const maxPaginationPagesInput = document.getElementById('max-pagination-pages');
  const useTabForTocCheckbox = document.getElementById('use-tab-for-toc');

  // Manual Chapter Input Modal Elements
  const manualChaptersModal = document.getElementById('manualChaptersModal');
  const btnCloseManualModal = document.getElementById('btn-close-manual-modal');
  const btnCancelManual = document.getElementById('btn-cancel-manual');
  const btnApplyManualChapters = document.getElementById('btn-apply-manual-chapters');
  const manualChaptersTextarea = document.getElementById('manualChaptersTextarea');
  const manualChaptersCountBadge = document.getElementById('manualChaptersCountBadge');
  const btnClearManualText = document.getElementById('btn-clear-manual-text');

  // Anti-Crawler Noise, Invisible Text & Empty Chapter Controls
  const cleanInvisibleTextCheckbox = document.getElementById('clean-invisible-text');
  const emptyChapterPlaceholderInput = document.getElementById('empty-chapter-placeholder');
  const inputCustomRemoval = document.getElementById('input-custom-removal');
  const btnAddRemoval = document.getElementById('btn-add-removal');
  const customRemovalsChips = document.getElementById('customRemovalsChips');
  const inputCustomRegex = document.getElementById('input-custom-regex');
  const btnAddRegex = document.getElementById('btn-add-regex');
  const customRegexChips = document.getElementById('customRegexChips');

  // Custom Font Controls for Obfuscated HTML
  const customFontEnabledCheckbox = document.getElementById('custom-font-enabled');
  const customFontFileInput = document.getElementById('custom-font-file');
  const customFontNameInput = document.getElementById('custom-font-name');
  const customFontStatusBadge = document.getElementById('custom-font-status');
  const btnClearFont = document.getElementById('btn-clear-font');

  // Section 5.5: EPUB Doctor & Auto-Repair Elements
  const repairFileInput = document.getElementById('repair-epub-file');
  const btnSelectRepairEpub = document.getElementById('btn-select-repair-epub');
  const repairFileName = document.getElementById('repairFileName');
  const repairResultsBox = document.getElementById('repairResultsBox');
  const repairBookTitle = document.getElementById('repairBookTitle');
  const repairBookAuthor = document.getElementById('repairBookAuthor');
  const repairChapterCountBadge = document.getElementById('repairChapterCountBadge');
  const repairDiagnosisList = document.getElementById('repairDiagnosisList');
  const repairOptInvisible = document.getElementById('repair-opt-invisible');
  const repairOptEmpty = document.getElementById('repair-opt-empty');
  const repairOptXml = document.getElementById('repair-opt-xml');
  const repairOptMimetype = document.getElementById('repair-opt-mimetype');
  const repairOptCustomFont = document.getElementById('repair-opt-custom-font');
  const btnRunRepairEpub = document.getElementById('btn-run-repair-epub');
  const repairStatusText = document.getElementById('repairStatusText');

  // Text-to-HTML & Dirty HTML Cleaner Elements
  const tabCleaner = document.getElementById('tab-cleaner');
  const panelCleaner = document.getElementById('panel-cleaner');
  const cleanerTargetBanner = document.getElementById('cleaner-target-banner');
  const cleanerTargetText = document.getElementById('cleaner-target-text');
  const btnCancelTargetRescue = document.getElementById('btn-cancel-target-rescue');
  const cleanerModeAuto = document.getElementById('cleaner-mode-auto');
  const cleanerModeText = document.getElementById('cleaner-mode-text');
  const cleanerModeHtml = document.getElementById('cleaner-mode-html');
  const cleanerInput = document.getElementById('cleaner-input');
  const cleanerInputChars = document.getElementById('cleaner-input-chars');
  const cleanerDetectedBadge = document.getElementById('cleaner-detected-badge');
  const cleanerAutoClean = document.getElementById('cleaner-auto-clean');
  const btnCleanerPaste = document.getElementById('btn-cleaner-paste');
  const btnCleanerClear = document.getElementById('btn-cleaner-clear');
  const btnCleanerSampleText = document.getElementById('btn-cleaner-sample-text');
  const btnCleanerSampleDirty = document.getElementById('btn-cleaner-sample-dirty');
  const cleanerFileInput = document.getElementById('cleaner-file-input');
  const cleanerOptMicro = document.getElementById('cleaner-opt-micro');
  const cleanerOptInvisible = document.getElementById('cleaner-opt-invisible');
  const cleanerOptStripStyles = document.getElementById('cleaner-opt-strip-styles');
  const cleanerOptStripJunk = document.getElementById('cleaner-opt-strip-junk');
  const cleanerOptCleanAttrs = document.getElementById('cleaner-opt-clean-attrs');
  const cleanerOptAutoParagraphs = document.getElementById('cleaner-opt-auto-paragraphs');
  const cleanerOptXhtml = document.getElementById('cleaner-opt-xhtml');
  const cleanerOptHeadings = document.getElementById('cleaner-opt-headings');
  const cleanerOptQuotes = document.getElementById('cleaner-opt-quotes');
  const cleanerCustomRemovals = document.getElementById('cleaner-custom-removals');
  const btnRunClean = document.getElementById('btn-run-clean');
  const cleanerResultsBox = document.getElementById('cleaner-results-box');
  const cleanerStatParas = document.getElementById('cleaner-stat-paras');
  const cleanerStatWords = document.getElementById('cleaner-stat-words');
  const cleanerStatChars = document.getElementById('cleaner-stat-chars');
  const cleanerStatCleaned = document.getElementById('cleaner-stat-cleaned');
  const btnViewCode = document.getElementById('btn-view-code');
  const btnViewPreview = document.getElementById('btn-view-preview');
  const cleanerCodeViewContainer = document.getElementById('cleaner-code-view-container');
  const cleanerPreviewViewContainer = document.getElementById('cleaner-preview-view-container');
  const cleanerOutputCode = document.getElementById('cleaner-output-code');
  const cleanerOutputPreview = document.getElementById('cleaner-output-preview');
  const btnCopyCleanHtml = document.getElementById('btn-copy-clean-html');
  const btnDownloadCleanHtml = document.getElementById('btn-download-clean-html');
  const btnSaveAsChapter = document.getElementById('btn-save-as-chapter');
  const cleanerTargetChapterSelect = document.getElementById('cleaner-target-chapter-select');
  const btnPatchTargetChapter = document.getElementById('btn-patch-target-chapter');
  const btnModeAuto = document.getElementById('btn-mode-auto');
  const btnModeText = document.getElementById('btn-mode-text');
  const btnModeHtml = document.getElementById('btn-mode-html');
  const btnPresetEpub = document.getElementById('btn-preset-epub');
  const btnPresetUltra = document.getElementById('btn-preset-ultra');
  const btnToggleAdvanced = document.getElementById('btn-toggle-advanced');
  const cleanerAdvancedDrawer = document.getElementById('cleaner-advanced-drawer');
  const advancedToggleIcon = document.getElementById('advanced-toggle-icon');
  const themeBtnWhite = document.getElementById('theme-btn-white');
  const themeBtnSepia = document.getElementById('theme-btn-sepia');
  const themeBtnDark = document.getElementById('theme-btn-dark');

  // Crawl Controls
  const btnStart = document.getElementById('btn-start');
  const btnPause = document.getElementById('btn-pause');
  const btnStop = document.getElementById('btn-stop');
  const btnReloadTab = document.getElementById('btn-reload-tab');
  const btnRecheckTab = document.getElementById('btn-recheck-tab');
  const btnSkipPass = document.getElementById('btn-skip-pass');
  const btnNoticeSkipPass = document.getElementById('btn-notice-skip-pass');
  const passwordAlertNotice = document.getElementById('passwordAlertNotice');
  let recoveryBusy = false;
  const btnExport = document.getElementById('btn-export');
  const btnAddToLibrary = document.getElementById('btn-add-to-library');
  const btnQuickAddToLibrary = document.getElementById('btn-quick-add-to-library');

  // Library Panel Elements
  const btnLibUpdateAll = document.getElementById('btn-lib-update-all');
  const btnLibClearAll = document.getElementById('btn-lib-clear-all');
  const btnLibExportAll = document.getElementById('btn-lib-export-all');
  const btnLibImportAll = document.getElementById('btn-lib-import-all');
  const libImportFileInput = document.getElementById('lib-import-file-input');
  const btnLibUploadEpub = document.getElementById('btn-lib-upload-epub');
  const libUploadEpubInput = document.getElementById('lib-upload-epub-input');
  const libShowAdvancedOptionsCheckbox = document.getElementById('LibShowAdvancedOptionsCheckbox');
  const libDownloadEpubAfterUpdateCheckbox = document.getElementById('LibDownloadEpubAfterUpdateCheckbox');
  const libNovelsList = document.getElementById('libNovelsList');
  const libEmptyPlaceholder = document.getElementById('libEmptyPlaceholder');
  const libRenderLoading = document.getElementById('libRenderLoading');
  const libStorageUsageBadge = document.getElementById('lib-storage-usage-badge');
  const libTotalNovelsBadge = document.getElementById('lib-total-novels-badge');
  const libAdvancedAddListSection = document.getElementById('libAdvancedAddListSection');
  const libAddListToLibraryTextarea = document.getElementById('libAddListToLibraryTextarea');
  const btnLibAddList = document.getElementById('btn-lib-add-list');
  const tabLibraryButton = document.getElementById('tab-library');

  // Progress & Stats
  const crawlProgressBar = document.getElementById('crawlProgressBar');
  const progressPercentage = document.getElementById('progress-percentage');
  const progressSpeed = document.getElementById('progress-speed');
  const progressEta = document.getElementById('progress-eta');
  const progressWaitTimer = document.getElementById('progress-wait-timer');
  const activeWorkersBadge = document.getElementById('active-workers');
  const chapterSearchInput = document.getElementById('chapter-search');

  // Failed Chapters Table
  const failedSection = document.getElementById('failedSection');
  const failedTableBody = document.getElementById('failedChaptersBody');
  const failedCountBadge = document.getElementById('failedCountBadge');
  const btnRetryFailed = document.getElementById('btn-retry-failed');

  // Log Console
  const activityLog = document.getElementById('activityLog');

  // --- State Architecture ---
  const state = {
    currentStage: 'IDLE', // 'IDLE' | 'FETCHING_TOC' | 'CRAWLING' | 'PACKAGING' | 'COMPLETED'
    currentUrl: '',
    currentDomain: '',
    currentParser: null,
    novelMetadata: null,
    chapters: [], // Array of { id, chapterNumber, title, url, selected }
    downloadedChapters: new Map(), // chapterNumber -> ChapterContent
    failedChapters: [], // Array of { id, chapterNumber, title, url, error, timestamp, attempts }
    activeWorkers: 0,
    isPaused: false,
    crawlStartTime: 0,
    crawlEngine: null,
    waitDeadline: null,
    waitDurationSec: 0,
    lastEtaSec: 0,
    lastSpeed: 0,
    liveTimerInterval: null,
    pausedRemainingWait: null,
    customRemovalsList: ['.ads', '.ad-banner', '.watermark', 'font[color="white"]', 'font[color="#ffffff"]'],
    customRegexList: [],
    customCoverBlob: null,
    customCoverUrl: '',
    customFont: null, // { enabled, name, filename, dataBase64, mimeType }
    selectedRepairFile: null, // File object for EPUB Doctor
    sessionManager: typeof SessionManager !== 'undefined' ? new SessionManager() : null,
    profileManager: typeof ProfileManager !== 'undefined' ? new ProfileManager() : null,
    libraryManager: typeof LibraryManager !== 'undefined' ? new LibraryManager() : null,
    _updatingLibraryNovelId: null,
    _autoDownloadAfterUpdate: false,
    _autoSaveToLibraryOnFinish: false
  };

  // --- Helper Methods ---
  function appendLog(message, type = 'info') {
    if (!activityLog) return;
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const timestamp = new Date().toLocaleTimeString();
    entry.textContent = `[${timestamp}] ${message}`;
    const isAtBottom = activityLog.scrollHeight - activityLog.scrollTop - activityLog.clientHeight <= 32;
    activityLog.appendChild(entry);
    if (isAtBottom) activityLog.scrollTop = activityLog.scrollHeight;
  }

  function setStage(nextStage) {
    const validStages = ['IDLE', 'FETCHING_TOC', 'CRAWLING', 'PACKAGING', 'COMPLETED'];
    if (!validStages.includes(nextStage)) return;

    state.currentStage = nextStage;
    if (crawlStageBadge) {
      crawlStageBadge.textContent = {
        IDLE: 'Sẵn sàng', FETCHING_TOC: 'Đang lấy mục lục', CRAWLING: 'Đang tải',
        PACKAGING: 'Đang tạo EPUB', COMPLETED: 'Hoàn tất'
      }[nextStage];
      crawlStageBadge.className = 'badge';
      switch (nextStage) {
        case 'IDLE':
          crawlStageBadge.classList.add('badge-neutral');
          break;
        case 'FETCHING_TOC':
        case 'PACKAGING':
          crawlStageBadge.classList.add('badge-warning');
          break;
        case 'CRAWLING':
        case 'COMPLETED':
          crawlStageBadge.classList.add('badge-success');
          break;
      }
    }
  }

  function clampConcurrency(val) {
    const n = Math.floor(Number(val));
    if (isNaN(n) || n < 1) return 1;
    if (n > 10) return 10;
    return n;
  }

  function clampDelay(val) {
    const d = Math.round(Number(val));
    if (isNaN(d) || d < 0) return 0;
    if (d > 5000) return 5000;
    return d;
  }

  function getDomainFromUrl(url) {
    if (!url) return '';
    try {
      const u = new URL(url);
      return u.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return '';
    }
  }

  function extractChapterNumber(obj) {
    if (!obj) return null;
    if (typeof obj.chapterNumber === 'number' && !isNaN(obj.chapterNumber)) return obj.chapterNumber;
    const str = String(obj.title || obj.chapterNumber || obj.id || '');
    const m = str.match(/(?:chương|c|hồi|tiết|bài|chapter|ep|ch|#)\s*(\d+(?:\.\d+)?)/i) || str.match(/(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : null;
  }

  function compareChapters(a, b) {
    const chapterIndexMap = new Map();
    if (state.novelMetadata?.chapters) {
      state.novelMetadata.chapters.forEach((ch, idx) => {
        if (ch.chapterNumber !== undefined) chapterIndexMap.set(Number(ch.chapterNumber), idx);
        if (ch.id !== undefined) chapterIndexMap.set(String(ch.id), idx);
      });
    }

    const idxA = chapterIndexMap.get(Number(a?.chapterNumber)) ?? chapterIndexMap.get(String(a?.id));
    const idxB = chapterIndexMap.get(Number(b?.chapterNumber)) ?? chapterIndexMap.get(String(b?.id));
    if (idxA !== undefined && idxB !== undefined) return idxA - idxB;

    const numA = extractChapterNumber(a);
    const numB = extractChapterNumber(b);
    if (numA !== null && numB !== null && numA !== numB) return numA - numB;

    const collator = typeof Intl !== 'undefined' && Intl.Collator
      ? new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
      : null;

    if (collator) {
      const tA = String(a?.title || a?.chapterNumber || a?.id || '');
      const tB = String(b?.title || b?.chapterNumber || b?.id || '');
      return collator.compare(tA, tB);
    }
    return 0;
  }

  function getCustomSelectorsFromUI() {
    return {
      storyTitle: selectorStoryTitle?.value.trim() || '',
      author: selectorAuthor?.value.trim() || '',
      cover: selectorCover?.value.trim() || '',
      description: selectorDesc?.value.trim() || '',
      chapterList: selectorChapterList?.value.trim() || '',
      chapterTitle: selectorChapterTitle?.value.trim() || '',
      chapterContent: selectorChapterContent?.value.trim() || '',
      classesToRemove: selectorClassesToRemove?.value.trim() || '',
      nextChapterBtn: selectorNextChapterBtn?.value.trim() || '',
      cleanInvisibleText: cleanInvisibleTextCheckbox ? cleanInvisibleTextCheckbox.checked : true,
      emptyChapterPlaceholder: emptyChapterPlaceholderInput?.value.trim() || '<p>pass</p>',
      customRemovalsList: state.customRemovalsList ? state.customRemovalsList.slice() : []
    };
  }

  function renderRemovalsChips() {
    if (!customRemovalsChips) return;
    customRemovalsChips.innerHTML = '';
    if (!state.customRemovalsList || state.customRemovalsList.length === 0) {
      customRemovalsChips.innerHTML = '<span class="removals-empty-hint">Chưa có thẻ rác tùy chọn nào (mặc định sẽ lọc chữ trắng, font 0px, display:none).</span>';
      return;
    }
    const fragment = document.createDocumentFragment();
    state.customRemovalsList.forEach((sel, index) => {
      const chip = document.createElement('span');
      chip.className = 'removal-chip';
      chip.textContent = sel + ' ';

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'removal-chip-remove';
      removeBtn.innerHTML = '&times;';
      removeBtn.title = 'Xóa selector này';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.customRemovalsList.splice(index, 1);
        renderRemovalsChips();
        applyManualSelectors();
        if (state.currentDomain) {
          saveProfileForDomain(state.currentDomain);
        }
      });

      chip.appendChild(removeBtn);
      fragment.appendChild(chip);
    });
    customRemovalsChips.appendChild(fragment);
  }

  function renderRegexChips() {
    if (!customRegexChips) return;
    customRegexChips.innerHTML = '';
    if (!state.customRegexList || state.customRegexList.length === 0) {
      customRegexChips.innerHTML = '<span class="removals-empty-hint">Chưa có biểu thức Regex lọc rác nào.</span>';
      return;
    }
    const fragment = document.createDocumentFragment();
    state.customRegexList.forEach((regexStr, index) => {
      const chip = document.createElement('span');
      chip.className = 'removal-chip regex-chip';
      chip.textContent = '/' + regexStr + '/i ';

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'removal-chip-remove';
      removeBtn.innerHTML = '&times;';
      removeBtn.title = 'Xóa Regex này';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.customRegexList.splice(index, 1);
        renderRegexChips();
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ vtpate_custom_regex_list: state.customRegexList });
        }
      });

      chip.appendChild(removeBtn);
      fragment.appendChild(chip);
    });
    customRegexChips.appendChild(fragment);
  }

  function applyCustomRegexClean(html) {
    if (!html || !state.customRegexList || !state.customRegexList.length) return html;
    let res = html;
    for (const pattern of state.customRegexList) {
      if (!pattern) continue;
      try {
        const rx = new RegExp(pattern, 'gi');
        res = res.replace(rx, '');
      } catch (e) {}
    }
    return res;
  }

  async function generateAutoCoverBlob(title, author) {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 800, 1200);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.5, '#1e293b');
    grad.addColorStop(1, '#0b1329');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 800, 1200);

    // Decorative outer border
    ctx.strokeStyle = 'rgba(217, 119, 6, 0.6)';
    ctx.lineWidth = 8;
    ctx.strokeRect(30, 30, 740, 1140);

    // Decorative inner thin border
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(44, 44, 712, 1112);

    // Corner decorative accents
    const corners = [
      [50, 50], [750, 50], [50, 1150], [750, 1150]
    ];
    ctx.fillStyle = '#fbbf24';
    corners.forEach(([cx, cy]) => {
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();
    });

    // Top Header Badge
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillStyle = '#f59e0b';
    ctx.fillText('✦ VTPATE NOVEL EDITIONS ✦', 400, 130);

    // Center divider line top
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
    ctx.beginPath();
    ctx.moveTo(250, 160);
    ctx.lineTo(550, 160);
    ctx.stroke();

    // Book Title (auto wrap)
    const bookTitle = (title || 'TIỂU THUYẾT WEB').toUpperCase();
    ctx.font = 'bold 44px sans-serif';
    ctx.fillStyle = '#ffffff';

    const words = bookTitle.split(/\s+/);
    const lines = [];
    let currentLine = '';
    const maxWidth = 640;

    for (let w = 0; w < words.length; w++) {
      const testLine = currentLine ? (currentLine + ' ' + words[w]) : words[w];
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = words[w];
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    const lineHeight = 58;
    const totalTitleHeight = lines.length * lineHeight;
    let titleY = Math.max(380, 550 - (totalTitleHeight / 2));

    lines.forEach((line) => {
      ctx.fillText(line, 400, titleY);
      titleY += lineHeight;
    });

    // Divider line below title
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(280, titleY + 30);
    ctx.lineTo(520, titleY + 30);
    ctx.stroke();

    // Author
    const bookAuthor = author || 'Tác giả chưa rõ';
    ctx.font = 'italic 30px sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('Tác giả: ' + bookAuthor, 400, titleY + 80);

    // Bottom banner
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('ẤN BẢN ĐIỆN TỬ EPUB TIÊU CHUẨN', 400, 1080);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/jpeg', 0.92);
    });
  }

  function updateCustomFontUI() {
    if (!customFontStatusBadge) return;
    if (state.customFont && state.customFont.filename) {
      customFontStatusBadge.textContent = `Đã nạp: ${state.customFont.filename} (${state.customFont.name || 'NovelCustomFont'})`;
      customFontStatusBadge.className = 'badge badge-success';
      if (btnClearFont) btnClearFont.style.display = 'inline-flex';
      if (customFontEnabledCheckbox) customFontEnabledCheckbox.checked = state.customFont.enabled !== false;
      if (customFontNameInput && state.customFont.name) customFontNameInput.value = state.customFont.name;
    } else {
      customFontStatusBadge.textContent = 'Chưa nạp font chữ riêng';
      customFontStatusBadge.className = 'badge badge-neutral';
      if (btnClearFont) btnClearFont.style.display = 'none';
      if (customFontEnabledCheckbox) customFontEnabledCheckbox.checked = false;
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function applyCustomSelectorsToUI(sel = {}) {
    if (selectorStoryTitle) selectorStoryTitle.value = sel.storyTitle || '';
    if (selectorAuthor) selectorAuthor.value = sel.author || '';
    if (selectorCover) selectorCover.value = sel.cover || '';
    if (selectorDesc) selectorDesc.value = sel.description || '';
    if (selectorChapterList) selectorChapterList.value = sel.chapterList || '';
    if (selectorChapterTitle) selectorChapterTitle.value = sel.chapterTitle || '';
    if (selectorChapterContent) selectorChapterContent.value = sel.chapterContent || '';
    if (selectorClassesToRemove) selectorClassesToRemove.value = sel.classesToRemove || '';
    if (selectorNextChapterBtn) selectorNextChapterBtn.value = sel.nextChapterBtn || '';
    if (cleanInvisibleTextCheckbox && sel.cleanInvisibleText !== undefined) {
      cleanInvisibleTextCheckbox.checked = Boolean(sel.cleanInvisibleText);
    }
    if (emptyChapterPlaceholderInput && sel.emptyChapterPlaceholder) {
      emptyChapterPlaceholderInput.value = sel.emptyChapterPlaceholder;
    }
    if (Array.isArray(sel.customRemovalsList)) {
      state.customRemovalsList = sel.customRemovalsList.slice();
      renderRemovalsChips();
    }
  }

  function applyManualSelectors() {
    const selectors = getCustomSelectorsFromUI();
    if (state.currentParser && typeof state.currentParser.setCustomSelectors === 'function') {
      state.currentParser.setCustomSelectors(selectors);
      appendLog('Đã áp dụng CSS Selectors tùy chỉnh vào Parser hiện tại.');
    }
    return selectors;
  }

  function detectParser(url) {
    if (!url) {
      if (detectedParserBadge) {
        detectedParserBadge.textContent = 'Chưa phát hiện';
        detectedParserBadge.className = 'badge badge-neutral';
      }
      state.currentParser = null;
      state.currentDomain = '';
      if (loginDomainInput) loginDomainInput.value = '';
      return null;
    }

    const domain = getDomainFromUrl(url);
    state.currentDomain = domain;
    if (loginDomainInput) loginDomainInput.value = domain;

    if (typeof ParserRegistry !== 'undefined' && typeof ParserRegistry.getParser === 'function') {
      try {
        const parser = ParserRegistry.getParser(url);
        if (parser) {
          state.currentParser = parser;
          if (detectedParserBadge) {
            detectedParserBadge.textContent = `${parser.name || domain}`;
            detectedParserBadge.className = 'badge badge-success';
          }
          applyManualSelectors();
          return parser;
        }
      } catch (err) {
        console.warn('[VTPATE Manager] Error resolving parser from registry:', err);
      }
    }

    // Direct fallback recognition
    if (domain.includes('inkitt.com')) {
      if (detectedParserBadge) {
        detectedParserBadge.textContent = 'Inkitt Specialized Parser';
        detectedParserBadge.className = 'badge badge-success';
      }
      state.currentParser = typeof InkittParser !== 'undefined' ? new InkittParser() : null;
      applyManualSelectors();
      return state.currentParser;
    }

    if (domain.includes('wattpad.com')) {
      if (detectedParserBadge) {
        detectedParserBadge.textContent = 'Wattpad Specialized Parser';
        detectedParserBadge.className = 'badge badge-success';
      }
      state.currentParser = typeof WattpadParser !== 'undefined' ? new WattpadParser() : null;
      applyManualSelectors();
      return state.currentParser;
    }

    if (detectedParserBadge) {
      detectedParserBadge.textContent = `Generic Heuristic Parser (${domain || 'web'})`;
      detectedParserBadge.className = 'badge badge-neutral';
    }
    state.currentParser = typeof GenericParser !== 'undefined' ? new GenericParser() : null;
    applyManualSelectors();
    return state.currentParser;
  }

  // --- Profile Storage Synchronization ---
  async function loadProfileForDomain(domain) {
    if (!domain || !state.profileManager) return;
    try {
      const profile = await state.profileManager.getProfile(domain);
      if (profile) {
        if (concurrencyInput) concurrencyInput.value = profile.concurrency || 4;
        if (delayInput) delayInput.value = profile.delayMs !== undefined ? profile.delayMs : 1000;
        if (jitterCheckbox) jitterCheckbox.checked = profile.jitter !== false;
        if (crawlModeSelect) crawlModeSelect.value = profile.mode || 'fetch';
        if (visibleTabCrawlCheckbox) visibleTabCrawlCheckbox.checked = profile.visibleTab !== false;

        // Python Human Simulation Timing
        if (pageLoadWaitInput) pageLoadWaitInput.value = profile.pageLoadWaitMs !== undefined ? profile.pageLoadWaitMs : 2000;
        if (readingWpmInput) readingWpmInput.value = profile.readingWpm || 650;
        if (enableWpmDelayCheckbox) enableWpmDelayCheckbox.checked = profile.enableWpmDelay !== false;
        if (quickEnableWpmCheckbox) quickEnableWpmCheckbox.checked = profile.enableWpmDelay !== false;
        if (maxWaitSecondsInput) maxWaitSecondsInput.value = profile.maxWaitSeconds !== undefined ? profile.maxWaitSeconds : 30;
        if (quickMaxWaitInput) quickMaxWaitInput.value = profile.maxWaitSeconds !== undefined ? profile.maxWaitSeconds : 30;
        if (interChapterDelayInput) interChapterDelayInput.value = profile.interChapterDelaySeconds !== undefined ? profile.interChapterDelaySeconds : 3;
        if (quickFixedWaitInput) quickFixedWaitInput.value = profile.interChapterDelaySeconds !== undefined ? profile.interChapterDelaySeconds : 3;
        if (recheckWaitSecondsInput) recheckWaitSecondsInput.value = profile.recheckWaitSeconds !== undefined ? profile.recheckWaitSeconds : 10;
        if (quickRecheckWaitInput) quickRecheckWaitInput.value = profile.recheckWaitSeconds !== undefined ? profile.recheckWaitSeconds : 10;
        if (breakIntervalInput) breakIntervalInput.value = profile.periodicBreakInterval !== undefined ? profile.periodicBreakInterval : 10;
        if (breakSecondsInput) breakSecondsInput.value = profile.periodicBreakSeconds !== undefined ? profile.periodicBreakSeconds : 5;

        // Custom Selectors
        if (profile.customSelectors) {
          applyCustomSelectorsToUI(profile.customSelectors);
          if (state.currentParser && typeof state.currentParser.setCustomSelectors === 'function') {
            state.currentParser.setCustomSelectors(profile.customSelectors);
          }
        }

        // Multi-page Pagination Settings
        if (paginationTypeSelect) paginationTypeSelect.value = profile.paginationType || 'auto';
        if (paginationPatternInput) paginationPatternInput.value = profile.paginationPattern || '';
        if (nextPageSelectorInput) nextPageSelectorInput.value = profile.nextPageSelector || '';
        if (maxPaginationPagesInput) maxPaginationPagesInput.value = profile.maxPaginationPages || 50;
        if (useTabForTocCheckbox) useTabForTocCheckbox.checked = profile.useTabForToc !== undefined ? Boolean(profile.useTabForToc) : (profile.mode === 'tab');

        // Noise & Invisible Text Cleaner Settings
        if (cleanInvisibleTextCheckbox) {
          cleanInvisibleTextCheckbox.checked = profile.cleanInvisibleText !== false;
        }
        if (autoFillPlaceholdersCheckbox) {
          autoFillPlaceholdersCheckbox.checked = profile.autoFillPlaceholders !== false;
        }
        if (autoSkipErrorsCheckbox) {
          autoSkipErrorsCheckbox.checked = profile.autoSkipErrors !== false;
        }
        if (quickSkipErrorsCheckbox) {
          quickSkipErrorsCheckbox.checked = profile.autoSkipErrors !== false;
        }
        if (emptyChapterPlaceholderInput) {
          emptyChapterPlaceholderInput.value = profile.emptyChapterPlaceholder || '<p>pass</p>';
        }
        if (Array.isArray(profile.customRemovalsList)) {
          state.customRemovalsList = profile.customRemovalsList.slice();
        } else if (profile.customSelectors?.classesToRemove) {
          state.customRemovalsList = profile.customSelectors.classesToRemove.split(',').map((s) => s.trim()).filter(Boolean);
        }
        renderRemovalsChips();

        // Custom Font Settings
        if (profile.customFont) {
          state.customFont = { ...profile.customFont };
          updateCustomFontUI();
        } else {
          state.customFont = null;
          updateCustomFontUI();
        }

        // Account / Credentials
        if (profile.account) {
          if (loginUrlInput && profile.account.loginUrl) loginUrlInput.value = profile.account.loginUrl;
          if (loginUserInput) loginUserInput.value = profile.account.email || profile.account.username || '';
          if (loginPassInput) loginPassInput.value = profile.account.password || '';
        }

        appendLog(`Đã tải cấu hình Crawl Profile & Selectors cho domain: ${domain}`);
      }
    } catch (err) {
      console.warn('[VTPATE Manager] Error loading profile:', err);
    }
  }

  async function saveProfileForDomain(domain) {
    if (!domain || !state.profileManager) return;
    try {
      const profileData = {
        concurrency: clampConcurrency(concurrencyInput?.value || 4),
        delayMs: clampDelay(delayInput?.value || 1000),
        jitter: Boolean(jitterCheckbox?.checked),
        mode: crawlModeSelect?.value === 'tab' ? 'tab' : 'fetch',
        visibleTab: visibleTabCrawlCheckbox ? Boolean(visibleTabCrawlCheckbox.checked) : true,
        pageLoadWaitMs: parseInt(pageLoadWaitInput?.value, 10) || 2000,
        readingWpm: parseInt(readingWpmInput?.value, 10) || 650,
        enableWpmDelay: Boolean(enableWpmDelayCheckbox?.checked),
        maxWaitSeconds: parseInt(maxWaitSecondsInput?.value ?? quickMaxWaitInput?.value ?? 30, 10),
        interChapterDelaySeconds: parseInt(interChapterDelayInput?.value ?? quickFixedWaitInput?.value ?? 3, 10),
        recheckWaitSeconds: parseInt(recheckWaitSecondsInput?.value ?? quickRecheckWaitInput?.value ?? 10, 10),
        periodicBreakInterval: parseInt(breakIntervalInput?.value, 10) || 0,
        periodicBreakSeconds: parseInt(breakSecondsInput?.value, 10) || 0,
        paginationType: paginationTypeSelect?.value || 'auto',
        paginationPattern: paginationPatternInput?.value?.trim() || '',
        nextPageSelector: nextPageSelectorInput?.value?.trim() || '',
        maxPaginationPages: parseInt(maxPaginationPagesInput?.value, 10) || 50,
        useTabForToc: Boolean(useTabForTocCheckbox?.checked),
        cleanInvisibleText: cleanInvisibleTextCheckbox ? cleanInvisibleTextCheckbox.checked : true,
        autoFillPlaceholders: autoFillPlaceholdersCheckbox ? Boolean(autoFillPlaceholdersCheckbox.checked) : true,
        autoSkipErrors: quickSkipErrorsCheckbox ? Boolean(quickSkipErrorsCheckbox.checked) : Boolean(autoSkipErrorsCheckbox?.checked),
        emptyChapterPlaceholder: emptyChapterPlaceholderInput?.value.trim() || '<p>pass</p>',
        customRemovalsList: state.customRemovalsList ? state.customRemovalsList.slice() : [],
        customFont: state.customFont ? { ...state.customFont, enabled: Boolean(customFontEnabledCheckbox?.checked), name: customFontNameInput?.value.trim() || 'NovelCustomFont' } : null,
        customSelectors: getCustomSelectorsFromUI(),
        account: {
          loginUrl: loginUrlInput?.value.trim() || '',
          email: loginUserInput?.value.trim() || '',
          username: loginUserInput?.value.trim() || '',
          password: loginPassInput?.value || ''
        }
      };

      await state.profileManager.saveProfile(domain, profileData);
      appendLog(`Đã lưu toàn bộ Profile, Selectors & Đăng nhập cho domain: ${domain}`, 'success');
      await renderProfileChips();
    } catch (err) {
      console.warn('[VTPATE Manager] Error saving profile:', err);
    }
  }

  // --- Saved Profiles Quick Chips ---
  async function renderProfileChips() {
    if (!savedProfileChips || !state.profileManager) return;
    try {
      const allProfiles = (typeof state.profileManager.getAllProfiles === 'function')
        ? await state.profileManager.getAllProfiles()
        : (typeof state.profileManager.listProfiles === 'function')
        ? await state.profileManager.listProfiles()
        : {};
      const domains = Object.keys(allProfiles || {});

      if (domains.length === 0) {
        savedProfileChips.innerHTML = '<span class="empty-chips">Chưa có cấu hình nào được lưu. Bấm "Lưu cấu hình trang" để lưu lại.</span>';
        return;
      }

      savedProfileChips.innerHTML = '';
      const fragment = document.createDocumentFragment();

      domains.forEach((dom) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `profile-chip ${dom === state.currentDomain ? 'active' : ''}`;
        chip.innerHTML = `<i data-lucide="globe"></i> <span>${dom}</span>`;
        chip.addEventListener('click', async () => {
          state.currentDomain = dom;
          if (loginDomainInput) loginDomainInput.value = dom;
          await loadProfileForDomain(dom);

          document.querySelectorAll('.profile-chip').forEach((c) => c.classList.remove('active'));
          chip.classList.add('active');
          if (typeof lucide !== 'undefined') lucide.createIcons();
        });
        fragment.appendChild(chip);
      });

      savedProfileChips.appendChild(fragment);
      if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
      console.warn('[VTPATE Manager] Error rendering profile chips:', err);
    }
  }

  // --- Anti-Bot & Cookies Session Verification ---
  async function checkLoginSession(domain) {
    const targetDomain = domain || state.currentDomain || getDomainFromUrl(inputNovelUrl?.value.trim());
    if (!targetDomain) {
      appendLog('Chưa có domain để kiểm tra cookie phiên đăng nhập.', 'warning');
      alert('Vui lòng nhập URL truyện hoặc chọn domain trước.');
      return;
    }

    appendLog(`Đang kiểm tra cookie phiên cho domain: ${targetDomain}...`);
    if (sessionStatusBadge) {
      sessionStatusBadge.className = 'badge badge-warning';
      sessionStatusBadge.textContent = 'Đang quét cookie...';
    }

    if (typeof chrome !== 'undefined' && chrome.cookies && typeof chrome.cookies.getAll === 'function') {
      try {
        const cleanDomain = targetDomain.replace(/^www\./, '');
        const cookies = await chrome.cookies.getAll({ domain: cleanDomain });
        const dotCookies = await chrome.cookies.getAll({ domain: '.' + cleanDomain });
        const allCookies = [...cookies, ...dotCookies];
        const uniqueNames = Array.from(new Set(allCookies.map((c) => c.name)));

        if (uniqueNames.length > 0) {
          const hasSecurityClearance = uniqueNames.some((name) =>
            /cf_clearance|turnstile|session|token|auth|logged|login|user/i.test(name)
          );
          if (sessionStatusBadge) {
            sessionStatusBadge.className = 'badge badge-success';
            sessionStatusBadge.textContent = `Đã xác thực (${uniqueNames.length} cookies${hasSecurityClearance ? ' - Phiên sẵn sàng' : ''})`;
          }
          appendLog(`Xác thực phiên thành công! Tìm thấy ${uniqueNames.length} cookies (${uniqueNames.slice(0, 5).join(', ')}${uniqueNames.length > 5 ? '...' : ''}).`, 'success');
        } else {
          if (sessionStatusBadge) {
            sessionStatusBadge.className = 'badge badge-warning';
            sessionStatusBadge.textContent = 'Chưa có cookie phiên';
          }
          appendLog(`Không tìm thấy cookie nào cho domain ${cleanDomain}. Hãy bấm "Mở Web Đăng Nhập / Vượt Bot" để đăng nhập trước.`, 'warning');
        }
      } catch (err) {
        if (sessionStatusBadge) {
          sessionStatusBadge.className = 'badge badge-neutral';
          sessionStatusBadge.textContent = 'Lỗi truy cập cookies';
        }
        appendLog(`Lỗi kiểm tra cookies: ${err.message}`, 'error');
      }
    } else {
      if (sessionStatusBadge) {
        sessionStatusBadge.className = 'badge badge-neutral';
        sessionStatusBadge.textContent = 'Cookies API không khả dụng';
      }
      appendLog('Chrome cookies API không khả dụng trong ngữ cảnh này.', 'warning');
    }
  }

  async function openLoginTab() {
    let targetUrl = loginUrlInput?.value.trim();
    if (!targetUrl) {
      if (state.currentUrl) {
        targetUrl = state.currentUrl;
      } else if (state.currentDomain) {
        targetUrl = `https://${state.currentDomain}`;
      } else if (inputNovelUrl && inputNovelUrl.value.trim()) {
        targetUrl = inputNovelUrl.value.trim();
      }
    }

    if (!targetUrl) {
      appendLog('Vui lòng nhập URL truyện hoặc đường dẫn đăng nhập.', 'warning');
      alert('Vui lòng nhập URL truyện hoặc đường dẫn đăng nhập.');
      return;
    }

    appendLog(`Đang mở tab trình duyệt để đăng nhập / giải Turnstile: ${targetUrl}`);
    if (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.create === 'function') {
      try {
        await chrome.tabs.create({ url: targetUrl, active: true });
        appendLog('Tab đã mở! Sau khi đăng nhập xong, hãy quay lại Studio này và bấm "Kiểm Tra Phiên Đăng Nhập".', 'info');
      } catch (e) {
        window.open(targetUrl, '_blank');
      }
    } else {
      window.open(targetUrl, '_blank');
    }
  }

  // --- Test Chapter Format Preview ---
  async function testChapterPreview() {
    if (state.chapters.length === 0) {
      const url = inputNovelUrl ? inputNovelUrl.value.trim() : '';
      if (!url) {
        appendLog('Vui lòng nhập URL truyện và bấm "Trích xuất Thông tin" trước.', 'warning');
        alert('Vui lòng nhập URL truyện trước khi đọc thử.');
        return;
      }
      appendLog('Đang trích xuất mục lục truyện để lấy chương mẫu...');
      await fetchNovelMetadata();
      if (state.chapters.length === 0) {
        appendLog('Không trích xuất được danh sách chương.', 'error');
        return;
      }
    }

    const testChapter = state.chapters.find((c) => c.selected) || state.chapters[0];
    if (!testChapter) {
      appendLog('Không tìm thấy chương nào trong danh sách để đọc thử.', 'error');
      return;
    }

    appendLog(`Đang tải & đọc thử chương mẫu #${testChapter.chapterNumber}: "${testChapter.title}"...`);
    if (btnTestChapter) btnTestChapter.disabled = true;

    try {
      applyManualSelectors();

      const parser = state.currentParser || (typeof GenericParser !== 'undefined' ? new GenericParser() : null);
      let contentHtml = '';
      let chapterTitle = testChapter.title;

      const mode = crawlModeSelect?.value || 'fetch';
      if (mode === 'tab' && typeof TabDownloader !== 'undefined') {
        const downloader = new TabDownloader({
          pageLoadWaitMs: parseInt(pageLoadWaitInput?.value, 10) || 2000
        });
        await downloader.initialize();
        try {
          const res = await parser.fetchChapter(testChapter, downloader);
          contentHtml = res.contentHtml;
          chapterTitle = res.title || chapterTitle;
        } finally {
          await downloader.cleanup();
        }
      } else {
        const downloader = typeof FetchDownloader !== 'undefined' ? new FetchDownloader() : null;
        const res = await parser.fetchChapter(testChapter, downloader);
        contentHtml = res.contentHtml;
        chapterTitle = res.title || chapterTitle;
      }

      contentHtml = applyCustomRegexClean(contentHtml);
      const textOnly = contentHtml.replace(/<[^>]*>/g, ' ');
      const wordCount = textOnly.split(/\s+/).filter(Boolean).length;

      if (testPreviewChapterTitle) {
        testPreviewChapterTitle.textContent = `Chương #${testChapter.chapterNumber}: ${chapterTitle}`;
      }
      if (testPreviewWordCount) {
        testPreviewWordCount.textContent = `${wordCount.toLocaleString()} từ`;
      }
      if (testPreviewContent) {
        testPreviewContent.innerHTML = contentHtml || '<p class="empty-state">Không có nội dung văn bản nào được trích xuất. Hãy kiểm tra lại Selector Chapter Content.</p>';
        if (state.customFont && state.customFont.dataBase64) {
          let styleEl = document.getElementById('dynamicCustomFontFace');
          if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'dynamicCustomFontFace';
            document.head.appendChild(styleEl);
          }
          const fName = state.customFont.name || 'NovelCustomFont';
          styleEl.textContent = `@font-face { font-family: "${fName}"; src: url("${state.customFont.dataBase64}"); }`;
          testPreviewContent.style.fontFamily = `"${fName}", Georgia, Cambria, serif`;
        } else {
          testPreviewContent.style.fontFamily = '';
        }
      }
      if (testPreviewContainer) {
        testPreviewContainer.style.display = 'block';
        testPreviewContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      appendLog(`Đọc thử thành công chương #${testChapter.chapterNumber} (${wordCount} từ). Đã hiển thị xem trước định dạng ngay trên trang!`, 'success');
    } catch (err) {
      appendLog(`Lỗi khi đọc thử chương mẫu: ${err.message}`, 'error');
      alert(`Lỗi đọc thử chương mẫu: ${err.message}`);
    } finally {
      if (btnTestChapter) btnTestChapter.disabled = false;
    }
  }

  // --- Storage Action Handlers (Buttons Center) ---
  async function exportProfilesBackup() {
    if (!state.profileManager) return;
    try {
      const jsonStr = await state.profileManager.exportProfiles();
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
      const filename = `vtpate_profiles_backup_${Date.now()}.json`;

      if (typeof chrome !== 'undefined' && chrome.downloads && typeof chrome.downloads.download === 'function') {
        const blobUrl = URL.createObjectURL(blob);
        await chrome.downloads.download({ url: blobUrl, filename, saveAs: true });
      } else {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      appendLog(`Đã xuất toàn bộ profile ra file "${filename}".`, 'success');
    } catch (err) {
      appendLog(`Lỗi xuất file profile JSON: ${err.message}`, 'error');
    }
  }

  async function handleImportJsonFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file || !state.profileManager) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const count = await state.profileManager.importProfiles(text);
        appendLog(`Đã nạp thành công ${count} profile vào bộ nhớ.`, 'success');
        alert(`Đã nạp thành công ${count} profile.`);
        await renderProfileChips();
        if (state.currentDomain) {
          await loadProfileForDomain(state.currentDomain);
        }
      } catch (err) {
        appendLog(`Lỗi nạp file profile JSON: ${err.message}`, 'error');
        alert(`Lỗi nạp file JSON: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function showChapterInventory(titles, message) {
    const list = document.getElementById('chapter-inventory');
    list.replaceChildren();
    for (const title of titles) {
      const item = document.createElement('li');
      item.textContent = title;
      list.appendChild(item);
    }
    document.getElementById('chapter-inventory-status').textContent = message;
  }

  function showDownloadedChapters() {
    const chapterIndexMap = new Map();
    if (Array.isArray(state.chapters) && state.chapters.length > 0) {
      state.chapters.forEach((ch, idx) => {
        if (ch.chapterNumber !== undefined) chapterIndexMap.set(Number(ch.chapterNumber), idx);
        if (ch.id !== undefined) chapterIndexMap.set(String(ch.id), idx);
      });
    }

    function extractNum(ch) {
      if (!ch) return null;
      if (typeof ch.chapterNumber === 'number' && !isNaN(ch.chapterNumber)) return ch.chapterNumber;
      const str = String(ch.chapterNumber || ch.title || ch.id || '');
      const m = str.match(/(?:chuong|chapter|chap|c|phần|part)?\s*(\d+(?:\.\d+)?)/i);
      return m ? parseFloat(m[1]) : null;
    }

    const collator = typeof Intl !== 'undefined' && Intl.Collator
      ? new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
      : null;

    function compareChapters(a, b) {
      const idxA = chapterIndexMap.get(Number(a?.chapterNumber)) ?? chapterIndexMap.get(String(a?.id));
      const idxB = chapterIndexMap.get(Number(b?.chapterNumber)) ?? chapterIndexMap.get(String(b?.id));
      if (idxA !== undefined && idxB !== undefined) return idxA - idxB;

      const numA = extractNum(a);
      const numB = extractNum(b);
      if (numA !== null && numB !== null && numA !== numB) return numA - numB;

      if (collator) {
        const tA = String(a?.title || a?.chapterNumber || a?.id || '');
        const tB = String(b?.title || b?.chapterNumber || b?.id || '');
        return collator.compare(tA, tB);
      }
      return 0;
    }

    const chapters = [...state.downloadedChapters.values()].sort(compareChapters);
    const failedList = (state.failedChapters || []).filter(f => !state.downloadedChapters.has(f.chapterNumber));
    let statusMsg = `${chapters.length} chương đang có nội dung để xuất EPUB.`;
    if (failedList.length > 0) {
      statusMsg += ` (Lưu ý: Có ${failedList.length} chương gặp lỗi chưa tải: #${failedList.map(f => f.chapterNumber).join(', #')}. Khi xuất EPUB hệ thống sẽ tự động chèn giữ chỗ và xếp lại đúng thứ tự liền mạch).`;
    }
    showChapterInventory(chapters.map(ch => `#${ch.chapterNumber} — ${ch.title || 'Chưa có tiêu đề'}`), statusMsg);
    if (typeof updateCleanerChapterDropdown === 'function') {
      updateCleanerChapterDropdown();
    }
  }

  document.getElementById('btn-show-downloaded').addEventListener('click', showDownloadedChapters);

  const btnCleanDuplicateChapters = document.getElementById('btn-clean-duplicate-chapters');
  if (btnCleanDuplicateChapters) {
    btnCleanDuplicateChapters.addEventListener('click', async () => {
      if (!state.downloadedChapters || state.downloadedChapters.size === 0) {
        alert('Chưa có chương nào được tải để kiểm tra trùng lặp.');
        return;
      }

      function extractActualNum(item) {
        if (!item) return null;
        const title = String(item.title || '');
        const mTitle = title.match(/(?:chương|chuong|chapter|chap|c\.)\s*(\d+(?:\.\d+)?)/i);
        if (mTitle) return parseFloat(mTitle[1]);

        const html = String(item.contentHtml || '');
        const mHeading = html.match(/<(?:h[1-4]|div|p|span|button)[^>]*>(?:[^<]*?)(?:chương|chuong|chapter|chap|c\.)\s*(\d+(?:\.\d+)?)/i);
        if (mHeading) return parseFloat(mHeading[1]);

        const mPrefix = title.match(/^\s*(\d+(?:\.\d+)?)\s*[:\.\-–—\s]/);
        if (mPrefix) return parseFloat(mPrefix[1]);

        return null;
      }

      // 1. Collect all entries with metadata
      const allEntries = [];
      for (const [key, item] of state.downloadedChapters.entries()) {
        const slotKey = Number(key);
        const titleKey = (item.title || '').trim().toLowerCase();
        const cleanText = (item.contentHtml || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        const snippet = cleanText.slice(0, 300);
        const actualNum = extractActualNum(item);

        allEntries.push({ key, slotKey, item, titleKey, snippet, cleanText, actualNum });
      }

      // 2. Group items that share identical snippet (>= 60 chars) or title (>= 10 chars)
      const groups = new Map();
      const assignedGroup = new Map();
      let nextGroupId = 1;

      for (let i = 0; i < allEntries.length; i++) {
        const e1 = allEntries[i];
        if (!assignedGroup.has(e1)) {
          const gid = nextGroupId++;
          assignedGroup.set(e1, gid);
          groups.set(gid, [e1]);

          for (let j = i + 1; j < allEntries.length; j++) {
            const e2 = allEntries[j];
            if (assignedGroup.has(e2)) continue;

            const sameSnippet = e1.snippet.length >= 60 && e2.snippet.length >= 60 && e1.snippet === e2.snippet;
            const sameTitle = e1.titleKey.length >= 10 && e2.titleKey.length >= 10 && e1.titleKey === e2.titleKey;

            if (sameSnippet || sameTitle) {
              assignedGroup.set(e2, gid);
              groups.get(gid).push(e2);
            }
          }
        }
      }

      const duplicateChaps = []; // { dupKey, origKey, title, actualNum, reason }
      const movedChaps = [];      // { fromKey, toKey, item, actualNum }

      // 3. For each group with multiple members: find keeper matching its actualNum
      for (const [gid, members] of groups.entries()) {
        if (members.length <= 1) continue;

        // Choose the keeper: the member whose STT (slotKey) strictly matches actualNum
        let keeper = members.find(m => m.actualNum !== null && m.slotKey === m.actualNum);

        // Fallback: pick member closest to actualNum or minimum slotKey
        if (!keeper) {
          keeper = members.reduce((best, cur) => {
            if (!best) return cur;
            if (cur.actualNum !== null && best.actualNum !== null) {
              const diffCur = Math.abs(cur.slotKey - cur.actualNum);
              const diffBest = Math.abs(best.slotKey - best.actualNum);
              if (diffCur < diffBest) return cur;
            }
            return cur.slotKey < best.slotKey ? cur : best;
          }, null);
        }

        // All OTHER members in this group are DUPLICATES that mistakenly took keeper's content
        for (const m of members) {
          if (m === keeper) continue;
          duplicateChaps.push({
            dupKey: m.key,
            origKey: keeper.key,
            title: m.item.title,
            actualNum: m.actualNum,
            reason: m.actualNum !== null && m.actualNum !== m.slotKey
              ? `STT #${m.key} nhưng nội dung thực tế là Chương ${m.actualNum} (trùng với STT #${keeper.key})`
              : `Nội dung trùng lặp hoàn toàn với STT #${keeper.key}`
          });
        }
      }

      // 4. Standalone mismatched entries (where actualNum !== slotKey)
      const handledDupKeys = new Set(duplicateChaps.map(d => String(d.dupKey)));
      for (const e of allEntries) {
        if (handledDupKeys.has(String(e.key))) continue;

        if (e.actualNum !== null && e.actualNum !== e.slotKey) {
          const targetSlotExists = state.downloadedChapters.has(e.actualNum);
          if (targetSlotExists) {
            duplicateChaps.push({
              dupKey: e.key,
              origKey: e.actualNum,
              title: e.item.title,
              actualNum: e.actualNum,
              reason: `STT #${e.key} nhưng nội dung là Chương ${e.actualNum} (STT #${e.actualNum} đã có dữ liệu)`
            });
          } else {
            movedChaps.push({
              fromKey: e.key,
              toKey: e.actualNum,
              item: e.item,
              actualNum: e.actualNum
            });
          }
        }
      }

      if (duplicateChaps.length === 0 && movedChaps.length === 0) {
        alert('Tuyệt vời! Toàn bộ số chương đã khớp đúng 100% với Số Thứ Tự (STT) và không có chương nào bị trùng lặp nội dung.');
        return;
      }

      let msg = 'Hệ thống đã đối chiếu Số Thứ Tự (STT) với Số Chương thực tế:\n';
      if (duplicateChaps.length > 0) {
        msg += `\n📌 Phát hiện ${duplicateChaps.length} chương bị trùng lặp / lệch STT cần lọc bỏ:\n`;
        msg += duplicateChaps.map(d => `• ${d.reason}`).join('\n');
      }
      if (movedChaps.length > 0) {
        msg += `\n\n🔄 Phát hiện ${movedChaps.length} chương bị lệch STT được chuyển về đúng vị trí:\n`;
        msg += movedChaps.map(m => `• Chuyển nội dung từ STT #${m.fromKey} về đúng STT #${m.toKey} (và đưa #${m.fromKey} vào danh sách cần tải lại)`).join('\n');
      }
      msg += '\n\nBạn có muốn thực hiện xử lý ngay không?';

      const confirmAction = confirm(msg);
      if (!confirmAction) return;

      // Execute moves
      for (const m of movedChaps) {
        state.downloadedChapters.delete(m.fromKey);
        const itemCopy = { ...m.item, chapterNumber: m.toKey, id: `ch-${m.toKey}` };
        state.downloadedChapters.set(m.toKey, itemCopy);

        if (!state.failedChapters.some(f => (f.chapterNumber ?? f.id) == m.fromKey)) {
          const orig = (state.chapters || []).find(c => (c.chapterNumber ?? c.id) == m.fromKey);
          state.failedChapters.push({
            id: orig?.id || m.fromKey,
            chapterNumber: m.fromKey,
            title: orig?.title || `Chương ${m.fromKey}`,
            url: orig?.url || '',
            error: `Nội dung trước đây bị lấy nhầm của Chương #${m.toKey}. Đã chuyển dữ liệu sang STT #${m.toKey} và chờ tải lại đúng Chương #${m.fromKey}.`,
            attempts: 1,
            timestamp: new Date().toISOString()
          });
        }
      }

      // Execute duplicate removals
      for (const d of duplicateChaps) {
        const item = state.downloadedChapters.get(d.dupKey);
        state.downloadedChapters.delete(d.dupKey);
        if (!state.failedChapters.some(f => (f.chapterNumber ?? f.id) == d.dupKey)) {
          const orig = (state.chapters || []).find(c => (c.chapterNumber ?? c.id) == d.dupKey);
          state.failedChapters.push({
            id: orig?.id || item?.id || d.dupKey,
            chapterNumber: d.dupKey,
            title: orig?.title || item?.title || `Chương ${d.dupKey}`,
            url: orig?.url || item?.url || '',
            error: d.reason || `Nội dung bị trùng lặp với Chương #${d.origKey}. Đã lọc bỏ để tải lại.`,
            attempts: 1,
            timestamp: new Date().toISOString()
          });
        }
      }

      showDownloadedChapters();
      renderFailedTable();
      updateCleanerChapterDropdown();
      await persistCrawlCheckpoint(state.isPaused ? 'paused' : 'ready');
      appendLog(`🧹 Đã xử lý: Lọc bỏ ${duplicateChaps.length} chương trùng và chuyển ${movedChaps.length} chương về đúng vị trí!`, 'warning');
      alert(`Đã xử lý thành công!\nCác chương cần lấy lại nội dung chuẩn đã được chuyển sang tab "Tải và nhật ký" (mục Chương tải lỗi).\nBạn chỉ cần bấm "Tải lại các chương lỗi" để crawler lấy nội dung chính xác.`);
    });
  }
  document.getElementById('inspect-epub').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const zip = await JSZip.loadAsync(file);
      const parseXml = text => new DOMParser().parseFromString(text, 'application/xml');
      const container = parseXml(await zip.file('META-INF/container.xml').async('string'));
      const packagePath = container.querySelector('rootfile').getAttribute('full-path');
      const packageDoc = parseXml(await zip.file(packagePath).async('string'));
      const titles = [];
      for (const ref of packageDoc.querySelectorAll('spine itemref')) {
        const item = [...packageDoc.querySelectorAll('manifest item')].find(el => el.id === ref.getAttribute('idref'));
        if (!item) continue;
        const resolved = new URL(item.getAttribute('href'), 'https://epub.local/' + packagePath);
        const entry = zip.file(decodeURIComponent(resolved.pathname.slice(1)));
        if (!entry) throw new Error('Thiếu trang trong EPUB');
        const doc = new DOMParser().parseFromString(await entry.async('string'), 'text/html');
        titles.push(doc.querySelector('h1, h2, h3')?.textContent.trim() || doc.title || item.getAttribute('href'));
      }
      showChapterInventory(titles, `${file.name} — ${titles.length} mục theo thứ tự đọc, gồm cả bìa và lời giới thiệu nếu có.`);
    } catch (error) {
      showChapterInventory([], 'Không đọc được EPUB. ' + error.message);
    }
    event.target.value = '';
  });

  document.getElementById('btn-clear-story-checkpoint').addEventListener('click', async () => {
    if (state.crawlEngine?.isRunning) {
      alert('Hãy bấm Dừng hẳn và chờ phiên tải kết thúc trước khi xóa điểm dừng.');
      return;
    }
    const url = state.currentUrl || inputNovelUrl?.value.trim();
    if (!url) return alert('Hãy nạp truyện cần tải lại trước.');
    try {
      await checkpointWrites;
      await state.sessionManager?.clearCheckpoint();
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        try {
          await chrome.storage.local.remove(['vtpate_crawl_session', 'vtpate_checkpoint', 'vtpate_checkpoint_meta']);
        } catch (_) {}
      }
      state.downloadedChapters.clear();
      state.failedChapters = [];
      state.chapters.forEach(ch => { ch.selected = true; });
      state.crawlEngine = null;
      renderChapterList();
      renderFailedTable();
      showDownloadedChapters();
      if (btnExport) btnExport.disabled = true;
      if (btnStart) { btnStart.disabled = false; btnStart.textContent = 'Bắt đầu tải truyện'; }
      lastCheckpointSaved = true;
      setSaveStatus('Đã xóa điểm dừng và giải phóng bộ nhớ. Bắt đầu tải để lưu tiến trình mới.');
      setStage('IDLE');
      appendLog('🧹 Đã xóa tiến trình cũ và giải phóng bộ nhớ lưu trữ trình duyệt!', 'info');
      alert('Đã xóa điểm dừng thành công và giải phóng toàn bộ bộ nhớ lưu trữ!');
    } catch (error) {
      appendLog(error.message, 'error');
    }
  });

  const btnFreeStorage = document.getElementById('btn-free-storage');
  if (btnFreeStorage) {
    btnFreeStorage.addEventListener('click', async () => {
      const confirmClean = confirm('Bạn có muốn dọn dẹp các bản lưu tạm và giải phóng bộ nhớ tiện ích không?\n(Cấu hình profile trang web của bạn vẫn được giữ nguyên).');
      if (!confirmClean) return;

      try {
        if (state.sessionManager) {
          await state.sessionManager.clearCheckpoint();
        }
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          await chrome.storage.local.remove(['vtpate_crawl_session', 'vtpate_checkpoint', 'vtpate_checkpoint_meta']);
        }
        setSaveStatus('Bộ nhớ đã được dọn sạch.');
        appendLog('🧹 Đã giải phóng bộ nhớ lưu trữ trình duyệt thành công!', 'success');
        alert('Đã dọn dẹp và giải phóng bộ nhớ lưu trữ thành công! Bạn có thể tiếp tục tải truyện bình thường.');
      } catch (err) {
        alert('Lỗi khi dọn bộ nhớ: ' + err.message);
      }
    });
  }

  function setSaveStatus(message) {
    const element = document.getElementById('progress-save-status');
    if (element) element.textContent = message;
  }

  function handleCheckpointFailure(detail = '') {
    setSaveStatus('⚠️ Bộ nhớ trình duyệt đạt giới hạn. Đang lưu an toàn vào RAM.');
    appendLog('⚠️ Bộ nhớ lưu trữ tiện ích đạt giới hạn (Storage Quota). Toàn bộ nội dung chương vẫn được giữ an toàn trong RAM. Bạn có thể bấm "Tải tệp tiến trình" hoặc xuất EPUB khi hoàn tất.' + (detail ? ' (' + detail + ')' : ''), 'warning');
  }

  async function applySavedCheckpoint(checkpoint) {
    const saved = SessionManager.validateBackup({ format: 'vtpate-progress', version: 1, checkpoint });
    if (state.crawlEngine?.isRunning) throw new Error('Hãy dừng phiên tải trước khi khôi phục.');
    state.currentUrl = saved.novelUrl;
    if (inputNovelUrl) inputNovelUrl.value = saved.novelUrl;
    state.novelMetadata = { ...saved.metadata };
    if (novelTitleInput) novelTitleInput.value = saved.metadata.title;
    if (novelAuthorInput) novelAuthorInput.value = saved.metadata.author || '';
    if (novelDescInput) novelDescInput.value = saved.metadata.description || '';
    if (coverImage) {
      coverImage.removeAttribute('src');
      coverImage.style.display = 'none';
    }
    if (coverPlaceholder) coverPlaceholder.style.display = 'flex';
    state.downloadedChapters = new Map(saved.downloadedChapters.map(ch => [ch.chapterNumber, ch]));
    const pending = new Set(saved.pendingIndices);
    state.chapters = saved.chapters.map(ch => ({ ...ch,
      selected: pending.has(ch.chapterNumber) && !state.downloadedChapters.has(ch.chapterNumber)
    }));
    state.failedChapters = (saved.failedChapters || []).filter(ch => !state.downloadedChapters.has(ch.chapterNumber));
    state.crawlEngine = null;
    state.isPaused = false;
    const profile = saved.crawlProfile || {};
    for (const [input, key] of [
      [typeof crawlModeSelect !== 'undefined' ? crawlModeSelect : null, 'mode'],
      [typeof concurrencyInput !== 'undefined' ? concurrencyInput : null, 'concurrency'],
      [typeof delayInput !== 'undefined' ? delayInput : null, 'delayMs'],
      [typeof pageLoadWaitInput !== 'undefined' ? pageLoadWaitInput : null, 'pageLoadWaitMs'],
      [typeof readingWpmInput !== 'undefined' ? readingWpmInput : null, 'readingWpm'],
      [typeof maxWaitSecondsInput !== 'undefined' ? maxWaitSecondsInput : null, 'maxWaitSeconds'],
      [typeof quickMaxWaitInput !== 'undefined' ? quickMaxWaitInput : null, 'maxWaitSeconds'],
      [typeof interChapterDelayInput !== 'undefined' ? interChapterDelayInput : null, 'interChapterDelaySeconds'],
      [typeof quickFixedWaitInput !== 'undefined' ? quickFixedWaitInput : null, 'interChapterDelaySeconds'],
      [typeof recheckWaitSecondsInput !== 'undefined' ? recheckWaitSecondsInput : null, 'recheckWaitSeconds'],
      [typeof quickRecheckWaitInput !== 'undefined' ? quickRecheckWaitInput : null, 'recheckWaitSeconds'],
      [typeof breakIntervalInput !== 'undefined' ? breakIntervalInput : null, 'periodicBreakInterval'],
      [typeof breakSecondsInput !== 'undefined' ? breakSecondsInput : null, 'periodicBreakSeconds']
    ]) {
      if (input && profile[key] !== undefined) input.value = profile[key];
    }
    for (const [input, key] of [
      [typeof jitterCheckbox !== 'undefined' ? jitterCheckbox : null, 'jitter'],
      [typeof visibleTabCrawlCheckbox !== 'undefined' ? visibleTabCrawlCheckbox : null, 'visibleTab'],
      [typeof enableWpmDelayCheckbox !== 'undefined' ? enableWpmDelayCheckbox : null, 'enableWpmDelay'],
      [typeof quickEnableWpmCheckbox !== 'undefined' ? quickEnableWpmCheckbox : null, 'enableWpmDelay'],
      [typeof autoFillPlaceholdersCheckbox !== 'undefined' ? autoFillPlaceholdersCheckbox : null, 'autoFillPlaceholders'],
      [typeof autoSkipErrorsCheckbox !== 'undefined' ? autoSkipErrorsCheckbox : null, 'autoSkipErrors'],
      [typeof quickSkipErrorsCheckbox !== 'undefined' ? quickSkipErrorsCheckbox : null, 'autoSkipErrors']
    ]) {
      if (input && profile[key] !== undefined) input.checked = Boolean(profile[key]);
    }
    applyCustomSelectorsToUI(profile.customSelectors || {});
    detectParser(saved.novelUrl);
    state.customFont = saved.customFont || null;
    updateCustomFontUI();
    renderChapterList();
    renderFailedTable();
    showDownloadedChapters();
    const remaining = state.chapters.filter(ch => ch.selected).length;
    if (btnStart) {
      btnStart.disabled = state.chapters.every(ch => state.downloadedChapters.has(ch.chapterNumber));
      btnStart.textContent = remaining ? `Tải tiếp ${remaining} chương còn thiếu` :
        (btnStart.disabled ? 'Đã tải đủ chương' : 'Chọn chương để tải tiếp');
    }
    if (btnExport) btnExport.disabled = state.downloadedChapters.size === 0;
    if (btnPause) { btnPause.disabled = true; btnPause.textContent = 'Tạm dừng'; }
    if (btnStop) btnStop.disabled = true;
    if (rangeFromInput) rangeFromInput.value = '1';
    if (rangeToInput) rangeToInput.value = String(state.chapters.length);
    updateProgressUI(state.downloadedChapters.size, state.downloadedChapters.size + remaining, state.failedChapters.length, 0, 0);
    setStage('IDLE');
    setSaveStatus(`Đã khôi phục ${state.downloadedChapters.size} chương đã lưu; còn ${remaining} chương đã chọn cần tải. Bấm Tải tiếp để chạy.`);
    appendLog(`Đã khôi phục phiên “${saved.metadata.title}” từ dữ liệu đã lưu: ${state.downloadedChapters.size} chương có nội dung, ${remaining} chương còn chờ.`, 'success');
    activateManagerTab('download');
  }

  async function exportProgressBackup() {
    try {
      let checkpoint;
      if (state.chapters.length) {
        // Export RAM content even when browser storage is full or unavailable.
        checkpoint = buildCheckpointPayload('backup');
      } else {
        await checkpointWrites;
        checkpoint = await state.sessionManager?.getCheckpoint();
      }
      const backup = { format: 'vtpate-progress', version: 1, checkpoint };
      SessionManager.validateBackup(backup);
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const filename = `VTPATE-tien-trinh-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      try {
        if (typeof chrome !== 'undefined' && chrome.downloads?.download) {
          await chrome.downloads.download({ url, filename, saveAs: true });
        } else {
          const link = document.createElement('a');
          link.href = url; link.download = filename; link.click();
        }
        appendLog('Đã gửi yêu cầu lưu tệp tiến trình. Kiểm tra mục tải xuống; tệp chứa mục lục, nội dung chương và cấu hình để nhập lại trên lần cài khác.', 'success');
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch (error) {
      appendLog('Không xuất được tiến trình: ' + error.message, 'error');
    }
  }

  async function importProgressBackup(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (state.crawlEngine?.isRunning) throw new Error('Hãy dừng phiên đang tải trước khi nhập tiến trình.');
      const checkpoint = SessionManager.validateBackup(JSON.parse(await file.text()));
      if (state.chapters.length && !confirm('Thay phiên đang hiển thị bằng tệp tiến trình này? Hãy tải tệp tiến trình hiện tại trước nếu bạn muốn giữ cả hai.')) return;
      await checkpointWrites;
      if (!await state.sessionManager?.saveCheckpoint(checkpoint)) throw new Error('Không lưu được tệp nhập vào bộ nhớ. Phiên hiện tại được giữ nguyên.');
      await applySavedCheckpoint(checkpoint);
      lastCheckpointSaved = true;
    } catch (error) {
      appendLog('Không nhập được tiến trình: ' + error.message, 'error');
    } finally {
      input.value = '';
    }
  }

  function getCrawlProfile() {
    const maxWaitVal = maxWaitSecondsInput?.value ?? quickMaxWaitInput?.value;
    const fixedWaitVal = interChapterDelayInput?.value ?? quickFixedWaitInput?.value;
    const recheckWaitVal = recheckWaitSecondsInput?.value ?? quickRecheckWaitInput?.value;
    return {
      concurrency: clampConcurrency(concurrencyInput?.value || 4),
      delayMs: clampDelay(delayInput?.value || 1000),
      jitter: Boolean(jitterCheckbox?.checked),
      mode: crawlModeSelect?.value === 'tab' ? 'tab' : 'fetch',
      visibleTab: visibleTabCrawlCheckbox ? Boolean(visibleTabCrawlCheckbox.checked) : true,
      backgroundChapters: backgroundChaptersCheckbox ? Boolean(backgroundChaptersCheckbox.checked) : true,
      autoRetryFailed: autoRetryFailedCheckbox ? Boolean(autoRetryFailedCheckbox.checked) : true,
      includeInlineImages: includeInlineImagesCheckbox ? Boolean(includeInlineImagesCheckbox.checked) : true,
      autoPauseOnSleep: autoPauseOnSleepCheckbox ? Boolean(autoPauseOnSleepCheckbox.checked) : true,
      maxConsecutiveErrors: (quickSkipErrorsCheckbox?.checked || autoSkipErrorsCheckbox?.checked)
        ? 0
        : (maxConsecutiveErrorsSelect ? parseInt(maxConsecutiveErrorsSelect.value, 10) : 3),
      autoSkipErrors: quickSkipErrorsCheckbox ? Boolean(quickSkipErrorsCheckbox.checked) : Boolean(autoSkipErrorsCheckbox?.checked),
      autoFillPlaceholders: autoFillPlaceholdersCheckbox ? Boolean(autoFillPlaceholdersCheckbox.checked) : true,
      epubSplitSize: parseInt(epubSplitSizeSelect?.value, 10) || 0,
      pageLoadWaitMs: parseInt(pageLoadWaitInput?.value, 10) || 2000,
      readingWpm: parseInt(readingWpmInput?.value, 10) || 650,
      enableWpmDelay: quickEnableWpmCheckbox ? Boolean(quickEnableWpmCheckbox.checked) : Boolean(enableWpmDelayCheckbox?.checked),
      maxWaitSeconds: maxWaitVal !== undefined && maxWaitVal !== '' ? Math.max(0, parseInt(maxWaitVal, 10)) : 30,
      interChapterDelaySeconds: fixedWaitVal !== undefined && fixedWaitVal !== '' ? Math.max(0, parseInt(fixedWaitVal, 10)) : 3,
      recheckWaitSeconds: recheckWaitVal !== undefined && recheckWaitVal !== '' ? Math.max(3, parseInt(recheckWaitVal, 10)) : 10,
      periodicBreakInterval: parseInt(breakIntervalInput?.value, 10) || 0,
      periodicBreakSeconds: parseInt(breakSecondsInput?.value, 10) || 0,
      customSelectors: getCustomSelectorsFromUI()
    };
  }

  let checkpointWrites = Promise.resolve();
  let checkpointWriteCount = 0;
  let lastCheckpointSaved = true;
  function buildCheckpointPayload(status) {
    return {
      schemaVersion: 2,
      metadata: {
        title: novelTitleInput?.value.trim() || state.novelMetadata?.title || '',
        author: novelAuthorInput?.value.trim() || state.novelMetadata?.author || '',
        description: novelDescInput?.value || state.novelMetadata?.description || '',
        coverUrl: state.novelMetadata?.coverUrl || ''
      },
      chapters: state.chapters.map(ch => ({ ...ch })),
      crawlProfile: getCrawlProfile(),
      customFont: state.customFont || null,
      failedChapters: state.failedChapters.map(ch => ({ ...ch })),
      novelUrl: state.currentUrl || inputNovelUrl?.value.trim() || '',
      completedIndices: [...state.downloadedChapters.keys()],
      downloadedChapters: [...state.downloadedChapters.values()],
      pendingIndices: state.chapters.filter(ch => ch.selected && !state.downloadedChapters.has(ch.chapterNumber)).map(ch => ch.chapterNumber),
      status,
      total: state.chapters.length
    };
  }

  function persistCrawlCheckpoint(status) {
    if (!state.chapters.length) return Promise.resolve(false);
    const payload = buildCheckpointPayload(status);
    checkpointWriteCount++;
    setSaveStatus('Đang ghi tiến trình xuống bộ nhớ…');
    checkpointWrites = checkpointWrites.then(async () => {
      try {
        const saved = await state.sessionManager?.saveCheckpoint(payload);
        lastCheckpointSaved = Boolean(saved);
        if (!saved) {
          handleCheckpointFailure();
        } else {
          setSaveStatus(`Đã lưu ${payload.downloadedChapters.length}/${payload.total} chương · ${new Date().toLocaleTimeString()}. Mở lại tiện ích để tải tiếp.`);
        }
        return Boolean(saved);
      } catch (error) {
        lastCheckpointSaved = false;
        handleCheckpointFailure(error.message);
        return false;
      } finally {
        checkpointWriteCount--;
      }
    });
    return checkpointWrites;
  }

  async function saveManualCheckpoint() {
    if (!state.sessionManager) return;
    const completedIndices = [...state.downloadedChapters.keys()];
    const pendingIndices = state.chapters.filter(ch => ch.selected && !state.downloadedChapters.has(ch.chapterNumber));
    const saved = await persistCrawlCheckpoint('saved_checkpoint');
    if (!saved) {
      appendLog('Không lưu được điểm dừng vào bộ nhớ trình duyệt. Hãy xuất EPUB để giữ nội dung đã tải.', 'error');
      return;
    }
    appendLog(`Đã lưu điểm dừng Checkpoint: ${completedIndices.length} chương đã tải, ${pendingIndices.length} chương đang chờ.`, 'success');
    alert(`Đã lưu điểm dừng thành công!\nĐã tải: ${completedIndices.length} chương\nĐang chờ: ${pendingIndices.length} chương`);
  }

  async function restoreManualCheckpoint() {
    if (state.crawlEngine?.isRunning) return alert('Hãy dừng phiên tải trước khi khôi phục điểm dừng.');
    if (!state.sessionManager) return;
    const checkpoint = await state.sessionManager.getCheckpoint();
    if (!checkpoint) {
      appendLog('Không tìm thấy điểm dừng nào được lưu.', 'warning');
      alert('Không tìm thấy điểm dừng nào được lưu.');
      return;
    }

    if (checkpoint.schemaVersion === 2) {
      await applySavedCheckpoint(checkpoint);
      return;
    }

    appendLog(`Đang khôi phục điểm dừng cho URL: ${checkpoint.novelUrl || 'Chưa rõ'}...`);
    if (checkpoint.novelUrl && inputNovelUrl) {
      inputNovelUrl.value = checkpoint.novelUrl;
      detectParser(checkpoint.novelUrl);
    }

    if (checkpoint.novelUrl) {
      await fetchNovelMetadata({ skipCheckpointSave: true });
    }

    if (state.chapters.length > 0 && Array.isArray(checkpoint.completedIndices)) {
      state.downloadedChapters = new Map((checkpoint.downloadedChapters || []).map(ch => [ch.chapterNumber, ch]));
      const completedSet = new Set(state.downloadedChapters.keys());
      if (!checkpoint.downloadedChapters) appendLog('Điểm dừng cũ chỉ lưu số chương. Cần tải lại nội dung để xuất EPUB đầy đủ.', 'warning');
      showDownloadedChapters();
      if (btnExport) btnExport.disabled = state.downloadedChapters.size === 0;
      state.chapters.forEach((c) => {
        if (completedSet.has(c.chapterNumber)) {
          c.selected = false;
        }
      });
      renderChapterList();
      appendLog(`Đã khôi phục điểm dừng: Đã loại bỏ ${completedSet.size} chương đã tải. Còn lại ${state.chapters.filter((c) => c.selected).length} chương cần tải tiếp.`, 'success');
      await persistCrawlCheckpoint('restored');
      alert(`Khôi phục điểm dừng thành công!\nCòn lại ${state.chapters.filter((c) => c.selected).length} chương cần tải tiếp.`);
    }
  }

  async function deleteDomainProfile() {
    const domain = state.currentDomain || loginDomainInput?.value.trim();
    if (!domain || !state.profileManager) {
      alert('Chưa chọn domain để xóa.');
      return;
    }

    if (confirm(`Bạn có chắc chắn muốn xóa toàn bộ cấu hình, selector và tài khoản đã lưu của domain "${domain}"?`)) {
      await state.profileManager.deleteProfile(domain);
      appendLog(`Đã xóa cấu hình profile của domain: ${domain}`, 'warning');
      await renderProfileChips();
    }
  }

  // --- Chapter Selection & UI Rendering ---
  function sanitizeChapterTitle(title) {
    if (!title || typeof title !== 'string') return '';
    let str = title.trim();
    // 1. Tách số và tên chương bị dính liền: vd "Chương 69Hòa Minh." -> "Chương 69: Hòa Minh."
    str = str.replace(/^(Chương|Chapter|Chap|Hồi|Tiết)\s*(\d+(?:\.\d+)?)\s*([A-ZÀ-Ỹa-zà-ỹ].*)$/i, (m, prefix, num, rest) => {
      if (/^[:\-–—\.]/.test(rest.trim())) {
        return `${prefix} ${num} ${rest.trim()}`;
      }
      return `${prefix} ${num}: ${rest.trim()}`;
    });
    // 2. Lọc bỏ chuỗi số rác ở đuôi (lượt xem, like, cmt, view, timestamp)
    str = str.replace(/\.\s*\d{2,15}$/, '.');
    str = str.replace(/\s*[-–—|•·/]?\s*\b\d{3,15}\b\s*$/, '');
    str = str.replace(/\s*[-–—|•·/]?\s*\d+\s*(?:lượt đọc|views?|đọc|likes?|thích|bình luận|comments?|cmt|words?|từ)\s*$/i, '');
    str = str.replace(/\s+/g, ' ').trim();
    return str;
  }

  function renderChapterList() {
    if (!chapterListContainer) return;
    if (state.chapters.length === 0) {
      chapterListContainer.innerHTML = `
        <div class="empty-state">
          <p style="margin-bottom: 8px;">Chưa nạp danh sách chương. Vui lòng nhập URL truyện ở trên và bấm "Trích xuất Thông tin".</p>
          <div style="margin-top: 10px;">
            <button type="button" id="btn-empty-manual-input" class="btn btn-primary btn-sm">
              <i data-lucide="edit-3"></i> Nhập link chương thủ công
            </button>
          </div>
        </div>
      `;
      const btnEmptyManual = document.getElementById('btn-empty-manual-input');
      if (btnEmptyManual && manualChaptersModal) {
        btnEmptyManual.addEventListener('click', () => {
          manualChaptersModal.style.display = 'flex';
          updateManualChaptersCount();
          if (typeof lucide !== 'undefined') lucide.createIcons();
        });
      }
      if (typeof lucide !== 'undefined') lucide.createIcons();
      return;
    }

    chapterListContainer.innerHTML = '';
    const fragment = document.createDocumentFragment();

    state.chapters.forEach((chapter, index) => {
      const row = document.createElement('div');
      row.className = 'chapter-row';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `ch-check-${index}`;
      checkbox.checked = Boolean(chapter.selected);
      checkbox.addEventListener('change', (e) => {
        chapter.selected = e.target.checked;
      });

      const label = document.createElement('label');
      label.htmlFor = `ch-check-${index}`;
      label.className = 'chapter-title-text';
      label.textContent = `#${chapter.chapterNumber}: ${chapter.title || 'Chương không tên'}`;

      row.appendChild(checkbox);
      row.appendChild(label);
      fragment.appendChild(row);
    });

    chapterListContainer.appendChild(fragment);
    if (totalChaptersCount) {
      totalChaptersCount.textContent = String(state.chapters.length);
    }
  }

  async function grabChapterFromActiveTab(item) {
    if (!item) return;
    const num = item.chapterNumber ?? item.id;
    appendLog(`Đang trích xuất nội dung từ tab đọc truyện cho Chương #${num}...`, 'info');

    let tabId = state.crawlEngine?.downloader?.tabId;
    if (!tabId && typeof chrome !== 'undefined' && chrome.tabs) {
      try {
        const tabs = await chrome.tabs.query({});
        const activeTabs = tabs.filter(t => t.active);
        const readerTab = activeTabs.find(t => t.url && (t.url.includes('/reader') || t.url.includes('giatocvuongtai.com'))) ||
          tabs.find(t => t.url && (t.url.includes('/reader') || t.url.includes('giatocvuongtai.com'))) ||
          activeTabs.find(t => t.url && !t.url.startsWith('chrome-extension://')) ||
          tabs.find(t => t.url && !t.url.startsWith('chrome-extension://'));
        if (readerTab) tabId = readerTab.id;
        else if (tabs.length > 0) tabId = tabs[0].id;
      } catch (_) {}
    }

    if (!tabId) {
      alert('Không tìm thấy tab đang mở. Hãy mở tab đọc truyện rồi thử lại.');
      return;
    }

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const sels = [
            'div.reader-demo-body',
            '#chapter-content',
            '.chapter-c',
            '.chapter-content',
            '.reading-content',
            '.entry-content',
            'article',
            '.content'
          ];
          let el = null;
          for (const s of sels) {
            const found = document.querySelector(s);
            if (found && found.textContent.trim().length > 50) {
              el = found;
              break;
            }
          }
          const heading = document.querySelector('h2.reader-demo-chapter-heading, h2.chapter-title, h1');
          const bodyText = el ? el.innerHTML : (document.body ? document.body.innerHTML : '');
          return {
            contentHtml: bodyText,
            title: heading ? heading.textContent.trim() : '',
            url: location.href,
            textLength: el ? el.textContent.trim().length : (document.body ? document.body.innerText.trim().length : 0)
          };
        }
      });

      const res = results?.[0]?.result;
      if (!res || !res.contentHtml || res.textLength < 50) {
        alert('Không tìm thấy nội dung truyện trên tab. Hãy chắc chắn tab đang hiển thị văn bản chương truyện rồi thử lại.');
        return;
      }

      let cleanHtml = res.contentHtml;
      if (typeof HtmlCleaner !== 'undefined') {
        cleanHtml = HtmlCleaner.process(cleanHtml).cleanHtml;
      }

      if (res.title) {
        const m = res.title.match(/(?:chương|chuong|chapter|chap|c\.)\s*(\d+(?:\.\d+)?)/i);
        if (m && parseFloat(m[1]) !== Number(num)) {
          const confirmMismatch = confirm(`⚠️ CẢNH BÁO LỆCH CHƯƠNG:\nTab đang mở hiển thị: "${res.title}" (Chương ${m[1]}),\nnhưng bạn đang bấm lấy cho Chương #${num}.\n\nBạn có CHẮC CHẮN muốn lưu nội dung này vào Chương #${num} không?`);
          if (!confirmMismatch) return;
        }
      }

      const chapterObj = {
        id: `tab-grab-${num}`,
        chapterNumber: num,
        title: res.title || item.title || `Chương ${num}`,
        contentHtml: cleanHtml,
        manuallyRepaired: true
      };

      state.downloadedChapters.set(num, chapterObj);
      state.failedChapters = state.failedChapters.filter(f => (f.chapterNumber ?? f.id) != num);

      renderFailedTable();
      showDownloadedChapters();
      updateCleanerChapterDropdown();
      if (btnExport) btnExport.disabled = false;
      await persistCrawlCheckpoint(state.isPaused ? 'paused' : 'ready');

      appendLog(`Lấy từ tab thành công: Đã lưu Chương #${num} (${res.textLength} ký tự) vào sách và gỡ khỏi danh sách lỗi!`, 'success');
      alert(`Đã lấy thành công Chương #${num} từ tab đang mở và đưa vào sách!`);
    } catch (err) {
      appendLog(`Lỗi khi lấy từ tab: ${err.message}`, 'error');
      alert(`Lỗi trích xuất: ${err.message}`);
    }
  }

  function renderFailedTable() {
    if (!failedTableBody || !failedSection) return;

    if (state.failedChapters.length === 0) {
      failedSection.style.display = 'none';
      failedTableBody.innerHTML = '';
      if (failedCountBadge) failedCountBadge.textContent = '0';
      return;
    }

    failedSection.style.display = 'block';
    if (failedCountBadge) {
      failedCountBadge.textContent = String(state.failedChapters.length);
    }

    failedTableBody.innerHTML = '';
    const fragment = document.createDocumentFragment();

    state.failedChapters.forEach((item) => {
      const tr = document.createElement('tr');

      const tdNum = document.createElement('td');
      tdNum.textContent = String(item.chapterNumber || item.id || '--');

      const tdTitle = document.createElement('td');
      tdTitle.textContent = item.title || 'Chưa rõ';

      const tdError = document.createElement('td');
      tdError.className = 'error-tag';
      tdError.title = item.error || '';
      const [primaryError, ...details] = (item.error || 'Lỗi không xác định').split('\n');
      tdError.textContent = primaryError;
      if (details.length > 0) {
        const diagDiv = document.createElement('div');
        diagDiv.style.fontSize = '10px';
        diagDiv.style.opacity = '0.85';
        diagDiv.style.marginTop = '3px';
        diagDiv.style.fontWeight = 'normal';
        diagDiv.style.wordBreak = 'break-all';
        diagDiv.textContent = details.join(' ');
        tdError.appendChild(diagDiv);
      }

      const tdAttempts = document.createElement('td');
      tdAttempts.textContent = String(item.attempts || 1);

      const tdTime = document.createElement('td');
      const timeStr = typeof item.timestamp === 'string' ? item.timestamp : new Date(item.timestamp || Date.now()).toLocaleTimeString();
      tdTime.textContent = timeStr;

      const tdAction = document.createElement('td');
      const btnRescue = document.createElement('button');
      btnRescue.type = 'button';
      btnRescue.className = 'btn btn-secondary btn-sm';
      btnRescue.innerHTML = '<i data-lucide="edit-3"></i> Cứu chương';
      btnRescue.title = 'Mở Sheet Làm Sạch để dán text/HTML giải cứu chương này';
      btnRescue.addEventListener('click', () => {
        openCleanerForChapter(item);
      });
      tdAction.appendChild(btnRescue);

      const btnGrabTab = document.createElement('button');
      btnGrabTab.type = 'button';
      btnGrabTab.className = 'btn btn-primary btn-sm';
      btnGrabTab.style.marginLeft = '5px';
      btnGrabTab.innerHTML = '<i data-lucide="download-cloud"></i> Lấy từ tab đang mở';
      btnGrabTab.title = 'Trích xuất trực tiếp nội dung đang hiển thị trên tab đọc truyện';
      btnGrabTab.addEventListener('click', async () => {
        await grabChapterFromActiveTab(item);
      });
      tdAction.appendChild(btnGrabTab);

      tr.appendChild(tdNum);
      tr.appendChild(tdTitle);
      tr.appendChild(tdError);
      tr.appendChild(tdAttempts);
      tr.appendChild(tdTime);
      tr.appendChild(tdAction);

      fragment.appendChild(tr);
    });

    failedTableBody.appendChild(fragment);
    if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
      try {
        lucide.createIcons();
      } catch (_) {}
    }
    if (typeof updateCleanerChapterDropdown === 'function') {
      updateCleanerChapterDropdown();
    }
  }

  function formatEtaText(etaSec) {
    if (!isFinite(etaSec) || etaSec <= 0) return 'Thời gian còn lại: --:--';
    const hours = Math.floor(etaSec / 3600);
    const mins = Math.floor((etaSec % 3600) / 60);
    const secs = Math.ceil(etaSec % 60);
    if (hours > 0) {
      return `Thời gian còn lại: ${hours}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
    }
    return `Thời gian còn lại: ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
  }

  function formatDurationText(sec) {
    if (!isFinite(sec) || sec <= 0) return '--:--';
    const hours = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = Math.ceil(sec % 60);
    if (hours > 0) {
      return `${hours}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
    }
    return `${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
  }

  function startLiveCountdown() {
    if (state.liveTimerInterval) return;
    state.liveTimerInterval = setInterval(() => {
      // 1. Live Countdown for Wait Time (show cả phút và giây, KHÔNG ghi vào nhật ký)
      if (progressWaitTimer) {
        if (state.waitDeadline && state.crawlEngine?.isRunning && !state.crawlEngine?.isCancelled) {
          const now = Date.now();
          const remainingSec = Math.max(0, Math.ceil((state.waitDeadline - now) / 1000));
          if (remainingSec > 0) {
            const mins = Math.floor(remainingSec / 60);
            const secs = remainingSec % 60;
            const timeStr = `${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
            let prefix = '⏳ Chờ tải tiếp:';
            if (state.isPaused) {
              prefix = '⏸ Tạm dừng chờ:';
            } else if (state.waitReason === 'recheck') {
              prefix = '⏳ Kiểm tra HTML:';
            }
            progressWaitTimer.textContent = `${prefix} ${timeStr}`;
            progressWaitTimer.style.display = 'inline-flex';
            if (btnQuickSkipWait) btnQuickSkipWait.style.display = 'inline-flex';
            if (btnSkipWait) btnSkipWait.disabled = false;
          } else {
            progressWaitTimer.style.display = 'none';
            if (btnQuickSkipWait) btnQuickSkipWait.style.display = 'none';
            if (btnSkipWait) btnSkipWait.disabled = true;
          }
        } else {
          progressWaitTimer.style.display = 'none';
          if (btnQuickSkipWait) btnQuickSkipWait.style.display = 'none';
          if (btnSkipWait) btnSkipWait.disabled = true;
        }
      }

      // 2. Continuous ETA Countdown (Thời gian còn lại: đếm ngược từng giây khi đang tải)
      if (state.crawlEngine?.isRunning && !state.isPaused && state.lastEtaSec > 0) {
        state.lastEtaSec = Math.max(0, state.lastEtaSec - 1);
        if (progressEta) {
          progressEta.textContent = formatEtaText(state.lastEtaSec);
        }
      }
    }, 1000);
  }

  function updateProgressUI(completed, total, failed = 0, speed = 0, etaSec = 0, activeWorkers = null) {
    const percentage = (!total || total <= 0) ? 0 : Math.min(100, Math.round((completed / total) * 100));

    if (crawlProgressBar) {
      crawlProgressBar.style.width = `${percentage}%`;
    }

    if (progressPercentage) {
      progressPercentage.textContent = `${percentage}% (${completed}/${total} chương)`;
    }

    if (progressSpeed) {
      let speedStr = '0.0';
      if (speed > 0) {
        if (speed >= 0.1) {
          speedStr = speed.toFixed(1);
        } else if (speed >= 0.01) {
          speedStr = speed.toFixed(2);
        } else {
          speedStr = speed.toFixed(3);
        }
      }
      progressSpeed.textContent = `Tốc độ: ${speedStr} ch/s`;
    }

    state.lastSpeed = speed;
    if (etaSec > 0) {
      state.lastEtaSec = etaSec;
    }

    if (progressEta) {
      if (state.crawlEngine?.isRunning) {
        if (state.lastEtaSec > 0) {
          progressEta.textContent = formatEtaText(state.lastEtaSec);
        } else {
          progressEta.textContent = 'Thời gian còn lại: Đang tính...';
        }
      } else if (state.isPaused && state.lastEtaSec > 0) {
        progressEta.textContent = `${formatEtaText(state.lastEtaSec)} (Tạm dừng)`;
      } else if (!state.lastEtaSec || state.lastEtaSec <= 0) {
        const remaining = Math.max(0, total - completed);
        if (remaining > 0) {
          const estSec = remaining * 15;
          progressEta.textContent = `Ước tính: ${formatDurationText(estSec)}`;
        } else {
          progressEta.textContent = 'Thời gian còn lại: --:--';
        }
      } else {
        progressEta.textContent = formatEtaText(state.lastEtaSec);
      }
    }

    if (activeWorkers !== null && typeof activeWorkers === 'number') {
      state.activeWorkers = activeWorkers;
    } else if (state.crawlEngine?.isRunning) {
      state.activeWorkers = state.crawlEngine.activeWorkers ?? 1;
    } else {
      state.activeWorkers = 0;
    }

    if (activeWorkersBadge) {
      activeWorkersBadge.textContent = `Luồng hoạt động: ${state.activeWorkers}`;
    }
  }

  // --- Novel Metadata Fetching ---
  async function fetchNovelMetadata({ skipCheckpointSave = false } = {}) {
    const url = inputNovelUrl ? inputNovelUrl.value.trim() : '';
    if (!url) {
      appendLog('Vui lòng nhập URL truyện hợp lệ.', 'error');
      return;
    }

    if (state.crawlEngine?.isRunning) {
      alert('Hãy dừng phiên tải hiện tại trước khi nạp truyện.');
      return;
    }
    if (state.currentUrl !== url) {
      state.downloadedChapters.clear();
      state.failedChapters = [];
      state.chapters = [];
      showDownloadedChapters();
      renderFailedTable();
      if (btnExport) btnExport.disabled = true;
    }
    state.currentUrl = url;
    const parser = detectParser(url);
    if (!parser) {
      appendLog('Không tìm thấy parser phù hợp cho URL này.', 'error');
      return;
    }

    setStage('FETCHING_TOC');
    appendLog(`Bắt đầu trích xuất mục lục & thông tin tác phẩm từ: ${url}`);
    if (btnFetchMetadata) btnFetchMetadata.disabled = true;

    let tabDownloader = null;
    try {
      const isSpaSite = url.includes('giatocvuongtai.com') || Boolean(useTabForTocCheckbox?.checked) || crawlModeSelect?.value === 'tab';

      const paginationOpts = {
        paginationType: paginationTypeSelect?.value || 'auto',
        paginationPattern: paginationPatternInput?.value?.trim() || '',
        nextPageSelector: nextPageSelectorInput?.value?.trim() || '',
        maxPaginationPages: parseInt(maxPaginationPagesInput?.value, 10) || 50,
        onPageProgress: ({ page, totalChapters, newChapters }) => {
          appendLog(`📑 Đang quét mục lục trang ${page}: tìm thấy ${totalChapters} chương${newChapters !== undefined ? ` (mới +${newChapters})` : ''}...`);
        }
      };

      let metadata = null;
      const isVisibleTab = visibleTabCrawlCheckbox ? Boolean(visibleTabCrawlCheckbox.checked) : true;

      if (isSpaSite && typeof TabDownloader !== 'undefined') {
        appendLog('🌐 Kích hoạt Tab trình duyệt để nạp JavaScript & tự động quét đa trang SPA (giatocvuongtai, ...)...');
        const waitMs = parseInt(pageLoadWaitInput?.value, 10) || 2500;
        tabDownloader = new TabDownloader({ pageLoadWaitMs: waitMs, visibleTab: isVisibleTab });
        await tabDownloader.initialize();
        metadata = await parser.fetchMetadata(url, {
          ...paginationOpts,
          downloader: tabDownloader,
          useTabForToc: true,
          isSpa: true,
          pageLoadWaitMs: waitMs
        });
      } else {
        metadata = await parser.fetchMetadata(url, paginationOpts);

        // Auto-fallback: if static fetch returns 0 chapters and TabDownloader is available, retry via Tab
        if ((!metadata.chapters || metadata.chapters.length === 0) && typeof TabDownloader !== 'undefined') {
          appendLog('⚠️ Quét tĩnh trả về 0 chương (trang có thể là SPA hoặc dùng JS render mục lục). Đang tự động chuyển sang chế độ quét bằng Tab trình duyệt...', 'warning');
          const waitMs = parseInt(pageLoadWaitInput?.value, 10) || 2500;
          tabDownloader = new TabDownloader({ pageLoadWaitMs: waitMs, visibleTab: isVisibleTab });
          await tabDownloader.initialize();
          metadata = await parser.fetchMetadata(url, {
            ...paginationOpts,
            downloader: tabDownloader,
            useTabForToc: true,
            isSpa: true,
            pageLoadWaitMs: waitMs
          });
          if (useTabForTocCheckbox) useTabForTocCheckbox.checked = true;
        }
      }

      state.novelMetadata = metadata;

      // Clean title & author
      let cleanTitle = (metadata.title || '').replace(/\s*[-–—|•·]\s*(?:Gia Tộc Vượng Tài|giatocvuongtai\.com|Truyện Full|truyenfull.*|Wattpad|Inkitt|Đọc truyện online|Full)$/i, '').trim();
      let cleanAuthor = (metadata.author || '').trim();
      if (/(?:chương|lượt đọc|bình luận|vượng tài|tổng số từ|đăng ngày|cập nhật|hoàn thành)/i.test(cleanAuthor) || cleanAuthor.length > 50) {
        cleanAuthor = '';
      }

      if (novelTitleInput) novelTitleInput.value = cleanTitle || metadata.title || '';
      if (novelAuthorInput) novelAuthorInput.value = cleanAuthor || 'Tác giả chưa rõ';
      if (novelDescInput) novelDescInput.value = metadata.description || '';

      if (metadata.coverUrl) {
        if (novelCoverUrlInput && !novelCoverUrlInput.value) {
          novelCoverUrlInput.value = metadata.coverUrl;
        }
        if (coverImage) {
          coverImage.src = metadata.coverUrl;
          coverImage.style.display = 'block';
        }
        if (coverPlaceholder) coverPlaceholder.style.display = 'none';
      }

      const rawChapters = Array.isArray(metadata.chapters) ? metadata.chapters : [];
      state.chapters = rawChapters.map((c, idx) => ({
        id: c.id || `ch-${idx + 1}`,
        chapterNumber: c.chapterNumber !== undefined ? c.chapterNumber : idx + 1,
        title: sanitizeChapterTitle(c.title) || `Chương ${idx + 1}`,
        url: c.url || url,
        selected: !state.downloadedChapters.has(c.chapterNumber !== undefined ? c.chapterNumber : idx + 1)
      }));

      renderChapterList();

      if (rangeFromInput) rangeFromInput.value = '1';
      if (rangeToInput) rangeToInput.value = String(state.chapters.length || 1);

      if (btnStart) {
        btnStart.disabled = state.chapters.length === 0;
        btnStart.textContent = 'Bắt đầu tải truyện';
      }

      if (state.chapters.length > 0) {
        appendLog(`Trích xuất thành công: "${metadata.title}" (${state.chapters.length} chương).`, 'success');
      } else {
        appendLog(`Không tìm thấy chương nào trong mục lục. Bạn có thể kiểm tra CSS selector hoặc bấm "Nhập link thủ công" để dán trực tiếp danh sách chương!`, 'warning');
      }
      setStage('IDLE');

      // Sync domain profile & quick chips
      if (state.currentDomain) {
        await loadProfileForDomain(state.currentDomain);
      }
      if (state.chapters.length && !skipCheckpointSave) await persistCrawlCheckpoint('ready');
    } catch (err) {
      appendLog(`Lỗi trích xuất thông tin truyện: ${err.message}`, 'error');
      appendLog('💡 Mẹo khi trang web chặn không crawl được: Bạn có thể bấm "Nhập thủ công" để dán danh sách link, hoặc dùng tab "Chuyển Text & Làm Sạch HTML" để dán nội dung copy và xuất EPUB.', 'warning');
      setStage('IDLE');
    } finally {
      if (tabDownloader) {
        try {
          await tabDownloader.cleanup();
        } catch (cleanErr) {
          console.warn('[VTPATE Manager] Error cleaning up tab downloader:', cleanErr);
        }
      }
      if (btnFetchMetadata) btnFetchMetadata.disabled = false;
    }
  }

  // --- Chapter Selection Event Handlers ---
  if (btnReverse) {
    btnReverse.addEventListener('click', () => {
      if (state.chapters.length > 0) {
        state.chapters.reverse();
        renderChapterList();
        appendLog('Đã đảo thứ tự danh sách chương.');
      }
    });
  }

  if (btnSelectAll) {
    btnSelectAll.addEventListener('click', () => {
      state.chapters.forEach((c) => (c.selected = true));
      renderChapterList();
      appendLog('Đã chọn toàn bộ danh sách chương.');
    });
  }

  if (btnDeselectAll) {
    btnDeselectAll.addEventListener('click', () => {
      state.chapters.forEach((c) => (c.selected = false));
      renderChapterList();
      appendLog('Đã bỏ chọn toàn bộ danh sách chương.');
    });
  }

  if (btnApplyRange) {
    btnApplyRange.addEventListener('click', () => {
      const fromVal = parseInt(rangeFromInput?.value, 10);
      let toVal = parseInt(rangeToInput?.value, 10);
      const total = state.chapters.length;

      if (isNaN(fromVal) || isNaN(toVal) || fromVal < 1 || toVal < 1) {
        appendLog('Giá trị khoảng chương không hợp lệ.', 'error');
        return;
      }

      if (fromVal > toVal) {
        const errorMsg = 'Giá trị "Từ chương" không được lớn hơn "Đến chương"';
        appendLog(errorMsg, 'error');
        alert(errorMsg);
        return;
      }

      if (toVal > total) {
        toVal = total;
        if (rangeToInput) rangeToInput.value = String(total);
      }

      state.chapters.forEach((c) => {
        const num = c.chapterNumber;
        c.selected = num >= fromVal && num <= toVal;
      });

      renderChapterList();
      appendLog(`Đã áp dụng chọn khoảng chương từ ${fromVal} đến ${toVal}.`);
    });
  }

  // --- Manual Chapters Modal Handling ---
  function updateManualChaptersCount() {
    if (!manualChaptersTextarea || !manualChaptersCountBadge) return;
    const text = manualChaptersTextarea.value || '';
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    let count = 0;
    lines.forEach((line) => {
      let candidateUrl = line;
      if (line.includes('|')) {
        const parts = line.split('|');
        candidateUrl = parts[parts.length - 1].trim();
      }
      if (/^https?:\/\//i.test(candidateUrl) || /^\//.test(candidateUrl)) {
        count++;
      }
    });
    manualChaptersCountBadge.textContent = `${count} link được nhận diện`;
    manualChaptersCountBadge.className = count > 0 ? 'badge badge-success' : 'badge badge-neutral';
  }

  if (btnManualChapters && manualChaptersModal) {
    btnManualChapters.addEventListener('click', () => {
      manualChaptersModal.style.display = 'flex';
      if (manualChaptersTextarea && !manualChaptersTextarea.value.trim() && state.chapters.length > 0) {
        manualChaptersTextarea.value = state.chapters.map((c) => `${c.title} | ${c.url}`).join('\n');
      }
      updateManualChaptersCount();
      if (typeof lucide !== 'undefined') lucide.createIcons();
    });
  }

  if (manualChaptersTextarea) {
    manualChaptersTextarea.addEventListener('input', updateManualChaptersCount);
  }

  if (btnClearManualText && manualChaptersTextarea) {
    btnClearManualText.addEventListener('click', () => {
      manualChaptersTextarea.value = '';
      updateManualChaptersCount();
    });
  }

  const manualPatternUrl = document.getElementById('manual-pattern-url');
  const manualPatternFrom = document.getElementById('manual-pattern-from');
  const manualPatternTo = document.getElementById('manual-pattern-to');
  const btnGeneratePatternLinks = document.getElementById('btn-generate-pattern-links');

  if (btnGeneratePatternLinks && manualChaptersTextarea) {
    btnGeneratePatternLinks.addEventListener('click', () => {
      let pattern = manualPatternUrl ? manualPatternUrl.value.trim() : '';
      if (!pattern) {
        if (state.currentUrl) {
          pattern = state.currentUrl.replace(/\/+$/, '') + '/chuong-{n}';
          if (manualPatternUrl) manualPatternUrl.value = pattern;
        } else {
          alert('Vui lòng nhập định dạng link mẫu, ví dụ: https://domain.com/truyen/chuong-{n}');
          return;
        }
      }

      if (!pattern.includes('{n}')) {
        pattern = pattern.replace(/\/+$/, '') + '/chuong-{n}';
        if (manualPatternUrl) manualPatternUrl.value = pattern;
      }

      const from = parseInt(manualPatternFrom?.value, 10) || 1;
      const to = parseInt(manualPatternTo?.value, 10) || 50;

      if (from > to) {
        alert('Số chương "Từ" phải nhỏ hơn hoặc bằng "Đến".');
        return;
      }

      const generated = [];
      for (let i = from; i <= to; i++) {
        const u = pattern.replace(/\{n\}/g, String(i));
        generated.push(`Chương ${i} | ${u}`);
      }

      const currentVal = manualChaptersTextarea.value.trim();
      manualChaptersTextarea.value = currentVal ? `${currentVal}\n${generated.join('\n')}` : generated.join('\n');
      updateManualChaptersCount();
      appendLog(`Đã sinh nhanh ${generated.length} liên kết chương từ ${from} đến ${to}.`);
    });
  }

  if (btnCloseManualModal && manualChaptersModal) {
    btnCloseManualModal.addEventListener('click', () => {
      manualChaptersModal.style.display = 'none';
    });
  }

  if (btnCancelManual && manualChaptersModal) {
    btnCancelManual.addEventListener('click', () => {
      manualChaptersModal.style.display = 'none';
    });
  }

  if (btnApplyManualChapters && manualChaptersModal) {
    btnApplyManualChapters.addEventListener('click', () => {
      const text = manualChaptersTextarea ? manualChaptersTextarea.value || '' : '';
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      const newChapters = [];
      let baseOrigin = 'https://example.com';
      try {
        if (state.currentUrl) {
          baseOrigin = new URL(state.currentUrl).origin;
        } else if (inputNovelUrl && inputNovelUrl.value.trim()) {
          baseOrigin = new URL(inputNovelUrl.value.trim()).origin;
        }
      } catch (e) {}

      lines.forEach((line) => {
        let title = '';
        let url = line;
        if (line.includes('|')) {
          const parts = line.split('|');
          title = parts.slice(0, -1).join('|').trim();
          url = parts[parts.length - 1].trim();
        }

        if (!url) return;

        // Convert root-relative to absolute
        if (url.startsWith('/')) {
          url = baseOrigin + url;
        }

        if (/^https?:\/\//i.test(url)) {
          const nextIndex = newChapters.length + 1;
          newChapters.push({
            id: `ch-${nextIndex}`,
            chapterNumber: nextIndex,
            title: title || `Chương ${nextIndex}`,
            url,
            selected: true
          });
        }
      });

      if (newChapters.length === 0) {
        alert('Không tìm thấy đường dẫn chương hợp lệ nào.\nVui lòng dán danh sách URL (mỗi dòng 1 link bắt đầu bằng http:// hoặc https://).');
        return;
      }

      state.chapters = newChapters;
      renderChapterList();

      if (rangeFromInput) rangeFromInput.value = '1';
      if (rangeToInput) rangeToInput.value = String(state.chapters.length);
      if (btnStart) btnStart.disabled = false;

      manualChaptersModal.style.display = 'none';
      appendLog(`Đã cập nhật thủ công ${newChapters.length} chương vào danh sách!`, 'success');
      alert(`Đã nạp thành công ${newChapters.length} chương vào danh sách.`);
    });
  }

  // --- Crawl Lifecycle Management ---
  async function startCrawl() {
    if (state.starting || state.crawlEngine?.isRunning) return;
    state.starting = true;
    try {
      await startSelectedCrawl();
    } finally {
      state.starting = false;
    }
  }

  async function startSelectedCrawl() {
    const titleVal = novelTitleInput ? novelTitleInput.value.trim() : '';
    if (!titleVal) {
      const errMsg = 'Tên truyện không được để trống';
      appendLog(errMsg, 'error');
      alert(errMsg);
      return;
    }

    const selectedChapters = state.chapters.filter((c) => c.selected && !state.downloadedChapters.has(c.chapterNumber));
    if (selectedChapters.length === 0) {
      appendLog('Chưa có chương nào được chọn để tải.', 'warning');
      alert('Vui lòng chọn ít nhất một chương để tải.');
      return;
    }

    if (state.currentDomain) {
      await saveProfileForDomain(state.currentDomain);
    }

    try {
      await persistCrawlCheckpoint('ready');
    } catch (_) {}

    hideSleepOrErrorAlert();
    activateManagerTab('download');
    setStage('CRAWLING');
    state.isPaused = false;
    state.crawlStartTime = Date.now();
    state.failedChapters = [];
    renderFailedTable();

    if (btnStart) btnStart.disabled = true;
    if (btnPause) {
      btnPause.disabled = false;
      btnPause.innerHTML = '<i data-lucide="pause"></i> Tạm dừng';
    }
    if (btnStop) btnStop.disabled = false;
    if (btnExport) btnExport.disabled = true;
    if (btnAddToLibrary) btnAddToLibrary.disabled = false;
    if (btnQuickAddToLibrary) btnQuickAddToLibrary.style.display = 'inline-flex';

    const crawlProfile = getCrawlProfile();

    const modeLabel = crawlProfile.mode === 'tab' ? 'qua thẻ trình duyệt, từng chương' : `trực tiếp, ${crawlProfile.concurrency} chương song song`;
    appendLog(`Bắt đầu tải ${selectedChapters.length} chương (${modeLabel}). Thời gian chờ cơ sở ${crawlProfile.delayMs} mili giây.`);

    if (typeof CrawlEngine !== 'undefined') {
      startLiveCountdown();
      state.crawlEngine = new CrawlEngine({
        profileManager: state.profileManager,
        onWaitTick: ({ remainingSec, totalSec, reason }) => {
          if (remainingSec > 0) {
            state.waitDeadline = Date.now() + remainingSec * 1000;
            state.waitDurationSec = totalSec;
            state.waitReason = reason || '';
            if (progressWaitTimer) {
              const mins = Math.floor(remainingSec / 60);
              const secs = remainingSec % 60;
              const timeStr = `${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
              const prefix = reason === 'recheck' ? '⏳ Kiểm tra HTML:' : '⏳ Chờ tải tiếp:';
              progressWaitTimer.textContent = `${prefix} ${timeStr}`;
              progressWaitTimer.style.display = 'inline-flex';
            }
            if (btnQuickSkipWait) btnQuickSkipWait.style.display = 'inline-flex';
            if (btnSkipWait) btnSkipWait.disabled = false;
          } else {
            state.waitDeadline = null;
            state.waitReason = '';
            if (progressWaitTimer) {
              progressWaitTimer.style.display = 'none';
            }
            if (btnQuickSkipWait) btnQuickSkipWait.style.display = 'none';
            if (btnSkipWait) btnSkipWait.disabled = true;
          }
        },
        onProgress: (p) => {
          if (p.currentChapter?.id === 'pause') {
            appendLog(p.currentChapter.title);
            if (p.currentChapter.waitDeadline) {
              state.waitDeadline = p.currentChapter.waitDeadline;
              state.waitDurationSec = p.currentChapter.waitDurationSec || 0;
              state.waitReason = '';
            }
          } else if (p.currentChapter?.id === 'recheck') {
            appendLog(p.currentChapter.title, 'warning');
            if (p.currentChapter.waitDeadline) {
              state.waitDeadline = p.currentChapter.waitDeadline;
              state.waitDurationSec = p.currentChapter.waitDurationSec || 0;
              state.waitReason = 'recheck';
            }
          } else if (p.currentChapter) {
            state.waitDeadline = null;
            state.waitReason = '';
          }
          updateRecoveryControls();
          updateProgressUI(
            state.downloadedChapters.size,
            state.chapters.filter(ch => ch.selected || state.downloadedChapters.has(ch.chapterNumber)).length,
            p.failed,
            p.speed,
            p.eta,
            p.activeWorkers
          );
        },
        onError: ({ chapter, error }) => {
          const failRecord = {
            id: chapter.id,
            chapterNumber: chapter.chapterNumber,
            title: chapter.title,
            url: chapter.url,
            error: error || 'Lỗi tải qua mạng',
            timestamp: new Date().toISOString(),
            attempts: 1
          };
          state.failedChapters.push(failRecord);
          renderFailedTable();

          const errorStr = String(error || 'Lỗi tải qua mạng');
          const [primaryError, ...extraLines] = errorStr.split('\n');
          appendLog(`Lỗi tải chương #${chapter.chapterNumber} (${chapter.title}): ${primaryError}`, 'error');
          for (const line of extraLines) {
            if (line.trim()) {
              appendLog(line.trim(), 'warning');
            }
          }
        },
        onChapterComplete: async ({ chapter, result }) => {
          state.downloadedChapters.set(chapter.chapterNumber, result);
          showDownloadedChapters();
          if (btnExport) btnExport.disabled = false;
          if (btnAddToLibrary) btnAddToLibrary.disabled = false;
          if (btnQuickAddToLibrary) btnQuickAddToLibrary.style.display = 'inline-flex';
          await persistCrawlCheckpoint(state.isPaused ? 'paused' : 'crawling');
        },
        onCircuitBreaker: async (info) => {
          state.isPaused = true;
          if (btnPause) {
            btnPause.textContent = 'Tiếp tục';
            btnPause.disabled = false;
          }
          await persistCrawlCheckpoint('paused');
          updateRecoveryControls();
          const reasonTitle = info.reason === 'offline' ? '⚠️ Mất kết nối Internet' : '🛑 Đã dừng khẩn cấp (Circuit Breaker)';
          const reasonDesc = info.message || `Đã gặp sự cố liên tiếp ${info.consecutiveFailures} chương. Toàn bộ tiến trình đã được lưu an toàn.`;
          appendLog(`[BẢO VỆ TIẾN TRÌNH] ${reasonDesc}`, 'error');
          showSleepOrErrorAlert(reasonTitle, reasonDesc);
        }
      });

      try {
        await state.crawlEngine.startCrawl({
          parser: state.currentParser,
          chapters: selectedChapters,
          domain: state.currentDomain,
          profile: crawlProfile
        });

        if (state.crawlEngine.isCancelled) {
          await persistCrawlCheckpoint('stopped');
          setStage('IDLE');
          if (btnExport) btnExport.disabled = state.downloadedChapters.size === 0;
          return;
        }

        await persistCrawlCheckpoint('completed');

        if (autoRetryFailedCheckbox && autoRetryFailedCheckbox.checked && state.failedChapters.length > 0) {
          appendLog(`Tự động quét lại ${state.failedChapters.length} chương lỗi (Auto-retry)...`, 'info');
          await retryFailedChapters();
        }

        appendLog(`Đã hoàn tất tải. Đã tải: ${state.downloadedChapters.size} chương, lỗi: ${state.failedChapters.length} chương.`, 'success');
        setStage('COMPLETED');
        if (btnExport) btnExport.disabled = state.downloadedChapters.size === 0;
        if (btnAddToLibrary) btnAddToLibrary.disabled = state.downloadedChapters.size === 0;

        if (state._updatingLibraryNovelId) {
          const novelId = state._updatingLibraryNovelId;
          state._updatingLibraryNovelId = null;
          await saveCurrentCrawledToLibrary(false);
          appendLog('✅ Đã cập nhật xong truyện trong thư viện tạm!', 'success');
          if (state._autoDownloadAfterUpdate) {
            await downloadNovelFromLibrary(novelId);
          }
        } else if (state._autoSaveToLibraryOnFinish) {
          state._autoSaveToLibraryOnFinish = false;
          await saveCurrentCrawledToLibrary(false);
        }
      } catch (crawlErr) {
        appendLog(`Tiến trình tải gặp lỗi: ${crawlErr.message}`, 'error');
        setStage('IDLE');
      } finally {
        if (btnStart) btnStart.disabled = false;
        if (btnPause) btnPause.disabled = true;
        if (btnQuickAddToLibrary) btnQuickAddToLibrary.style.display = 'none';
        updateRecoveryControls();
        if (btnStop) btnStop.disabled = true;
      }
    } else {
      appendLog('Không tìm thấy lớp CrawlEngine trong môi trường.', 'error');
      setStage('IDLE');
    }
  }

  // Recovery never starts a new crawl or clears downloaded chapters.
  function updateRecoveryControls() {
    const engine = state.crawlEngine;
    const available = engine?.isRunning && !engine.isCancelled &&
      engine.activeProfile?.mode === 'tab' && engine.downloader?.currentUrl && !recoveryBusy;
    if (btnReloadTab) btnReloadTab.disabled = !available;
    const isWaitingChallenge = Boolean(engine?.downloader?.isWaitingForChallenge);
    const isWaitingPassword = Boolean(engine?.downloader?.isWaitingForPassword);
    if (btnRecheckTab) btnRecheckTab.disabled = !available ||
      !(engine.isPaused || isWaitingChallenge || isWaitingPassword);
    if (typeof btnSkipPass !== 'undefined' && btnSkipPass) btnSkipPass.disabled = !available || !isWaitingPassword;
    if (typeof passwordAlertNotice !== 'undefined' && passwordAlertNotice) {
      passwordAlertNotice.style.display = (available && isWaitingPassword) ? 'flex' : 'none';
    }
  }

  function handleSkipPassword() {
    const engine = state.crawlEngine;
    if (engine && engine.downloader && typeof engine.downloader.skipPasswordCurrentChapter === 'function') {
      appendLog('Đã chọn bỏ qua nhập mật khẩu cho chương hiện tại. Hệ thống sẽ lưu chương rỗng với nội dung <p>pass</p> và chuyển sang chương tiếp theo.', 'warning');
      engine.downloader.skipPasswordCurrentChapter();
      if (passwordAlertNotice) passwordAlertNotice.style.display = 'none';
      if (btnSkipPass) btnSkipPass.disabled = true;
    }
  }

  function showSleepOrErrorAlert(title, message) {
    if (typeof sleepOrErrorAlertNotice !== 'undefined' && sleepOrErrorAlertNotice) {
      if (typeof sleepAlertTitle !== 'undefined' && sleepAlertTitle) sleepAlertTitle.textContent = title;
      if (typeof sleepAlertDesc !== 'undefined' && sleepAlertDesc) sleepAlertDesc.textContent = message;
      sleepOrErrorAlertNotice.style.display = 'flex';
    }
  }

  function hideSleepOrErrorAlert() {
    if (typeof sleepOrErrorAlertNotice !== 'undefined' && sleepOrErrorAlertNotice) {
      sleepOrErrorAlertNotice.style.display = 'none';
    }
  }

  async function recoverCurrentTab(reload) {
    const engine = state.crawlEngine;
    if (recoveryBusy || !engine?.isRunning || engine.isCancelled ||
        engine.activeProfile?.mode !== 'tab' || !engine.downloader?.currentUrl) return;
    recoveryBusy = true;
    updateRecoveryControls();
    try {
      if (reload) {
        engine.pause();
        state.isPaused = true;
        if (btnPause) btnPause.textContent = 'Tiếp tục';
        if (btnPause) btnPause.disabled = true;
        await persistCrawlCheckpoint('paused');
        if (engine.isCancelled) return;
        await engine.downloader.reloadCurrentChapter();
        appendLog('Đã tải lại thẻ của chương hiện tại và giữ tạm dừng. Hãy kiểm tra trên thẻ truyện, rồi bấm “Kiểm tra và tiếp tục”. Các chương đã lưu được giữ nguyên.');
      } else {
        engine.resume();
        state.isPaused = false;
        if (btnPause) btnPause.textContent = 'Tạm dừng';
        engine.downloader.retryCurrentChapter();
        appendLog('Đang kiểm tra lại tại vị trí đang chờ. Chương chưa lưu sẽ được lấy khi nội dung sẵn sàng; chương đã lưu tiếp tục phần thời gian nghỉ còn lại.');
      }
    } catch (error) {
      appendLog(`Không thể tải lại thẻ: ${error.message}. Phiên vẫn được giữ để bạn kiểm tra.`, 'error');
    } finally {
      recoveryBusy = false;
      if (btnPause) btnPause.disabled = !engine.isRunning || engine.isCancelled;
      updateRecoveryControls();
    }
  }

  // --- Pause & Resume Support ---
  async function togglePause() {
    if (!state.crawlEngine) return;

    if (!state.isPaused) {
      state.isPaused = true;
      if (state.waitDeadline) {
        state.pausedRemainingWait = Math.max(0, state.waitDeadline - Date.now());
      }
      state.crawlEngine.pause();
      if (btnPause) {
        btnPause.innerHTML = '<i data-lucide="play"></i> Tiếp tục';
      }
      updateRecoveryControls();
      appendLog('Đã tạm dừng. Thời gian nghỉ được giữ lại để bạn kiểm tra. Đang lưu điểm dừng...');

      await persistCrawlCheckpoint('paused');
    } else {
      state.isPaused = false;
      if (state.pausedRemainingWait) {
        state.waitDeadline = Date.now() + state.pausedRemainingWait;
        state.pausedRemainingWait = null;
      }
      state.crawlEngine.resume();
      if (btnPause) {
        btnPause.innerHTML = '<i data-lucide="pause"></i> Tạm dừng';
      }
      state.crawlEngine.downloader?.retryCurrentChapter?.();
      updateRecoveryControls();
      appendLog('Tiếp tục tải từ vị trí đang chờ.');
    }
  }

  function stopCrawl() {
    if (state.crawlEngine?.isRunning) {
      state.crawlEngine.cancel();
      state.isPaused = false;
      state.waitDeadline = null;
      state.lastEtaSec = 0;
      if (progressWaitTimer) progressWaitTimer.style.display = 'none';
      appendLog('Đã yêu cầu dừng tải. Đang lưu nội dung đã tải.');
      void persistCrawlCheckpoint('stopping');
      if (btnPause) btnPause.disabled = true;
      updateRecoveryControls();
      if (btnStop) btnStop.disabled = true;
      if (btnExport) btnExport.disabled = state.downloadedChapters.size === 0;
    }
  }

  // --- Re-fetch Failed Chapters Action ---
  async function retryFailedChapters() {
    if (state.crawlEngine?.isRunning || state.failedChapters.length === 0) {
      return;
    }

    appendLog(`Bắt đầu tải lại ${state.failedChapters.length} chương lỗi.`);
    hideSleepOrErrorAlert();
    if (btnRetryFailed) btnRetryFailed.disabled = true;

    const queueToRetry = [...state.failedChapters];
    const profile = state.crawlEngine?.activeProfile;
    const retryEngine = new CrawlEngine({
      profileManager: state.profileManager,
      onWaitTick: ({ remainingSec, totalSec, reason }) => {
        if (remainingSec > 0) {
          state.waitDeadline = Date.now() + remainingSec * 1000;
          state.waitDurationSec = totalSec;
          state.waitReason = reason || '';
          if (progressWaitTimer) {
            const mins = Math.floor(remainingSec / 60);
            const secs = remainingSec % 60;
            const timeStr = `${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
            const prefix = reason === 'recheck' ? '⏳ Kiểm tra HTML:' : '⏳ Chờ tải tiếp:';
            progressWaitTimer.textContent = `${prefix} ${timeStr}`;
            progressWaitTimer.style.display = 'inline-flex';
          }
          if (btnQuickSkipWait) btnQuickSkipWait.style.display = 'inline-flex';
          if (btnSkipWait) btnSkipWait.disabled = false;
        } else {
          state.waitDeadline = null;
          state.waitReason = '';
          if (progressWaitTimer) {
            progressWaitTimer.style.display = 'none';
          }
          if (btnQuickSkipWait) btnQuickSkipWait.style.display = 'none';
          if (btnSkipWait) btnSkipWait.disabled = true;
        }
      },
      onProgress: (p) => {
        updateRecoveryControls();
        if (p.currentChapter?.id === 'pause') {
          appendLog(p.currentChapter.title);
        } else if (p.currentChapter?.id === 'recheck') {
          appendLog(p.currentChapter.title, 'warning');
        }
        updateProgressUI(
          state.downloadedChapters.size,
          state.chapters.filter(ch => ch.selected || state.downloadedChapters.has(ch.chapterNumber)).length,
          state.failedChapters.length,
          p.speed,
          p.eta,
          p.activeWorkers
        );
      },
      onChapterComplete: async ({ chapter, result }) => {
        state.downloadedChapters.set(chapter.chapterNumber, result);
          showDownloadedChapters();
        state.failedChapters = state.failedChapters.filter((item) => item !== chapter);
        await persistCrawlCheckpoint('retrying');
        appendLog(`Đã tải lại chương #${chapter.chapterNumber}: "${chapter.title}".`, 'success');
      },
      onError: ({ chapter, error }) => {
        chapter.attempts = (chapter.attempts || 1) + 1;
        chapter.error = error || 'Không tải được chương';
        chapter.timestamp = new Date().toISOString();
        renderFailedTable();

        const errorStr = String(chapter.error);
        const [primaryError, ...extraLines] = errorStr.split('\n');
        appendLog(`Không tải được chương #${chapter.chapterNumber}: ${primaryError}`, 'error');
        for (const line of extraLines) {
          if (line.trim()) {
            appendLog(line.trim(), 'warning');
          }
        }
      },
      onCircuitBreaker: async (info) => {
        state.isPaused = true;
        if (btnPause) {
          btnPause.textContent = 'Tiếp tục';
          btnPause.disabled = false;
        }
        await persistCrawlCheckpoint('paused');
        updateRecoveryControls();
        const reasonTitle = info.reason === 'offline' ? '⚠️ Mất kết nối Internet' : '🛑 Đã dừng khẩn cấp (Circuit Breaker)';
        const reasonDesc = info.message || `Đã gặp sự cố liên tiếp ${info.consecutiveFailures} chương. Toàn bộ tiến trình đã được lưu an toàn.`;
        appendLog(`[BẢO VỆ TIẾN TRÌNH] ${reasonDesc}`, 'error');
        showSleepOrErrorAlert(reasonTitle, reasonDesc);
      }
    });

    state.crawlEngine = retryEngine;
    state.isPaused = false;
    if (btnPause) {
      btnPause.disabled = false;
      btnPause.textContent = 'Tạm dừng';
    }
    if (btnExport) btnExport.disabled = true;
    if (btnStart) btnStart.disabled = true;
    if (btnStop) btnStop.disabled = false;
    try {
      await retryEngine.startCrawl({
        parser: state.currentParser,
        chapters: queueToRetry,
        domain: state.currentDomain,
        profile
      });
    } catch (error) {
      appendLog(`Không thể tải lại: ${error.message}`, 'error');
    } finally {
      await persistCrawlCheckpoint(retryEngine.isCancelled ? 'stopped' : 'completed');
      if (btnPause) btnPause.disabled = true;
        updateRecoveryControls();
      if (btnStart) btnStart.disabled = false;
      if (btnStop) btnStop.disabled = true;
    }
    renderFailedTable();

    if (btnRetryFailed) btnRetryFailed.disabled = false;
    if (btnExport) btnExport.disabled = state.downloadedChapters.size === 0;
    appendLog(`Hoàn tất tải lại. Còn lại ${state.failedChapters.length} chương lỗi.`);
  }

  // --- Export EPUB Action ---
  async function exportEpub() {
    if (state.downloadedChapters.size === 0) {
      appendLog('Chưa có nội dung chương nào để xuất EPUB.', 'warning');
      return;
    }

    setStage('PACKAGING');
    appendLog('Đang tạo và đóng gói file EPUB chuẩn IDPF OCF/OPS...');
    if (btnExport) btnExport.disabled = true;

    try {
      let coverBlob = state.customCoverBlob || state.novelMetadata?.coverBlob || null;
      if (!coverBlob && typeof generateAutoCoverBlob === 'function') {
        try {
          coverBlob = await generateAutoCoverBlob(
            novelTitleInput?.value.trim() || state.novelMetadata?.title || 'Truyện Web',
            novelAuthorInput?.value.trim() || state.novelMetadata?.author || 'Tác giả'
          );
        } catch (e) {}
      }

      const chapterIndexMap = new Map();
      if (Array.isArray(state.chapters) && state.chapters.length > 0) {
        state.chapters.forEach((ch, idx) => {
          if (ch.chapterNumber !== undefined) chapterIndexMap.set(Number(ch.chapterNumber), idx);
          if (ch.id !== undefined) chapterIndexMap.set(String(ch.id), idx);
        });
      }

      function extractNum(ch) {
        if (!ch) return null;
        if (typeof ch.chapterNumber === 'number' && !isNaN(ch.chapterNumber)) return ch.chapterNumber;
        const str = String(ch.chapterNumber || ch.title || ch.id || '');
        const m = str.match(/(?:chuong|chapter|chap|c|phần|part)?\s*(\d+(?:\.\d+)?)/i);
        return m ? parseFloat(m[1]) : null;
      }

      const collator = typeof Intl !== 'undefined' && Intl.Collator
        ? new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
        : null;

      function compareChapters(a, b) {
        const idxA = chapterIndexMap.get(Number(a?.chapterNumber)) ?? chapterIndexMap.get(String(a?.id));
        const idxB = chapterIndexMap.get(Number(b?.chapterNumber)) ?? chapterIndexMap.get(String(b?.id));
        if (idxA !== undefined && idxB !== undefined) return idxA - idxB;

        const numA = extractNum(a);
        const numB = extractNum(b);
        if (numA !== null && numB !== null && numA !== numB) return numA - numB;

        if (collator) {
          const tA = String(a?.title || a?.chapterNumber || a?.id || '');
          const tB = String(b?.title || b?.chapterNumber || b?.id || '');
          return collator.compare(tA, tB);
        }
        return 0;
      }

      const splitSize = parseInt(epubSplitSizeSelect?.value, 10) || 0;
      const packerOptions = {
        includeIntroChapter: true,
        includeInlineImages: includeInlineImagesCheckbox ? Boolean(includeInlineImagesCheckbox.checked) : true,
        splitSize: splitSize,
        customRegexList: state.customRegexList || [],
        cleanInvisibleText: cleanInvisibleTextCheckbox ? cleanInvisibleTextCheckbox.checked : true,
        emptyPlaceholder: emptyChapterPlaceholderInput?.value.trim() || '<p>pass</p>',
        customRemovals: state.customRemovalsList || [],
        customFont: (customFontEnabledCheckbox?.checked && state.customFont && state.customFont.filename) ? state.customFont : null
      };

      let allChaptersToPack = Array.from(state.downloadedChapters.values());

      const shouldAutoFillPlaceholders = autoFillPlaceholdersCheckbox ? autoFillPlaceholdersCheckbox.checked : true;
      if (shouldAutoFillPlaceholders && state.failedChapters && state.failedChapters.length > 0) {
        let insertedCount = 0;
        for (const failedItem of state.failedChapters) {
          const chNum = failedItem.chapterNumber || failedItem.id;
          if (!state.downloadedChapters.has(chNum)) {
            const escapeFn = typeof escapeHtml === 'function' ? escapeHtml : (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            allChaptersToPack.push({
              id: failedItem.id || `failed-${chNum}`,
              chapterNumber: chNum,
              title: failedItem.title || `Chương ${chNum}`,
              contentHtml: `<div class="chapter-placeholder"><p><em>[Chương này gặp lỗi khi tải từ trang nguồn: ${escapeFn(failedItem.error || 'Trang chưa có nội dung')}. Đã tự động giữ chỗ để bảo toàn mạch thứ tự chương.]</em></p>${packerOptions.emptyPlaceholder || '<p>pass</p>'}</div>`,
              isPlaceholder: true
            });
            insertedCount++;
          }
        }
        if (insertedCount > 0) {
          appendLog(`ℹ️ Đã tự động xếp chỗ cho ${insertedCount} chương bị lỗi vào đúng thứ tự trong EPUB để sách liền mạch.`, 'warning');
        }
      }

      allChaptersToPack.sort(compareChapters);
      const sortedChapters = allChaptersToPack;

      const metadata = {
        title: novelTitleInput?.value.trim() || state.novelMetadata?.title || 'Truyện Web',
        author: novelAuthorInput?.value.trim() || state.novelMetadata?.author || 'Tác giả',
        description: novelDescInput?.value.trim() || state.novelMetadata?.description || '',
        coverBlob: coverBlob,
        coverFilename: 'cover.jpg',
        novelUrl: state.currentUrl || inputNovelUrl?.value.trim() || '',
        totalChapters: sortedChapters.length
      };

      if (packerOptions.customFont) {
        appendLog(`Đang nhúng Custom Font vào EPUB: ${packerOptions.customFont.filename} (${packerOptions.customFont.name})...`);
      }

      if (typeof EpubPacker !== 'undefined') {
        const volumes = typeof EpubPacker.createSplitEpub === 'function'
          ? await EpubPacker.createSplitEpub(metadata, sortedChapters, packerOptions)
          : [{ volume: 1, totalVolumes: 1, blob: await EpubPacker.createEpub(metadata, sortedChapters, packerOptions), filename: `${metadata.title.replace(/[\\/:*?"<>|]/g, '_')}.epub` }];

        for (let v = 0; v < volumes.length; v++) {
          const vol = volumes[v];
          const filename = vol.filename;
          const epubBlob = vol.blob;

          if (typeof chrome !== 'undefined' && chrome.downloads && typeof chrome.downloads.download === 'function') {
            const blobUrl = URL.createObjectURL(epubBlob);
            await chrome.downloads.download({
              url: blobUrl,
              filename,
              saveAs: volumes.length === 1
            });
          } else {
            const blobUrl = URL.createObjectURL(epubBlob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }

          if (volumes.length > 1) {
            appendLog(`[Quyển ${vol.volume}/${vol.totalVolumes}] Đã tạo EPUB "${filename}" (Chương ${vol.fromChapter} - ${vol.toChapter}).`, 'success');
          } else {
            appendLog(`Đã tạo EPUB "${filename}" và gửi yêu cầu lưu tới trình duyệt.`, 'success');
          }
        }
        setStage('COMPLETED');
      } else {
        throw new Error('EpubPacker class is not available in environment');
      }
    } catch (exportErr) {
      appendLog(`Lỗi đóng gói file EPUB: ${exportErr.message}`, 'error');
      setStage('IDLE');
    } finally {
      if (btnExport) btnExport.disabled = false;
    }
  }

  // --- Offline Temporary EPUB Library Handlers (Cloned from WebToEpub) ---
  async function saveCurrentCrawledToLibrary(keepCrawling = true) {
    if (!state.libraryManager) {
      appendLog('Không thể khởi tạo LibraryManager trong môi trường.', 'error');
      return;
    }
    const allCompleted = Array.from(state.downloadedChapters.values());
    if (allCompleted.length === 0) {
      appendLog('ℹ️ Chưa có chương nào tải xong để lưu vào thư viện tạm.', 'warning');
      return;
    }

    const unsaved = allCompleted.filter(c => !c.savedToLibrary);
    if (unsaved.length === 0) {
      appendLog(`ℹ️ Tất cả ${allCompleted.length} chương đã tải đều đã được lưu an toàn trong thư viện tạm.`, 'info');
      return;
    }

    appendLog(`📚 Đang đóng gói và lưu ${unsaved.length} chương vào thư viện tạm...`, 'info');

    try {
      const sortedChapters = [...allCompleted].sort(compareChapters);
      const url = state.currentUrl || inputNovelUrl?.value.trim() || '';
      const title = novelTitleInput?.value.trim() || state.novelMetadata?.title || 'Truyện Web';
      const author = novelAuthorInput?.value.trim() || state.novelMetadata?.author || 'Tác giả';
      const description = novelDescInput?.value.trim() || state.novelMetadata?.description || '';
      const coverBlob = state.customCoverBlob || state.novelMetadata?.coverBlob || null;

      const metadata = {
        title,
        author,
        description,
        coverBlob,
        coverFilename: 'cover.jpg',
        novelUrl: url,
        totalChapters: sortedChapters.length
      };

      const packerOptions = {
        splitSize: 0,
        customFont: state.customFont && state.customFont.enabled ? state.customFont : null,
        emptyPlaceholder: getPlaceholderOption()
      };

      let epubBlob = null;
      if (typeof EpubPacker !== 'undefined') {
        epubBlob = await EpubPacker.createEpub(metadata, sortedChapters, packerOptions);
      } else {
        throw new Error('EpubPacker không khả dụng');
      }

      const filename = `${title.replace(/[\\/:*?"<>|]/g, '_')}.epub`;

      await state.libraryManager.saveToLibrary({
        url,
        filename,
        title,
        author,
        description,
        coverBlob,
        epubBlob,
        isMerge: true,
        newChaptersCount: 0
      });

      // Mark all completed as saved
      allCompleted.forEach(c => c.savedToLibrary = true);

      appendLog(`✅ Đã lưu ${allCompleted.length} chương vào thư viện tạm (mới thêm: +${unsaved.length}).`, 'success');

      if (btnAddToLibrary) {
        btnAddToLibrary.innerHTML = `<i data-lucide="bookmark-check"></i> Đã lưu thư viện (${allCompleted.length} ch)`;
      }

      await renderLibraryNovels();
    } catch (err) {
      appendLog(`Lỗi lưu vào thư viện tạm: ${err.message}`, 'error');
    }
  }

  async function handleAddToLibraryClick() {
    if (state.crawlEngine?.isRunning) {
      await saveCurrentCrawledToLibrary(true);
    } else {
      const allCompleted = Array.from(state.downloadedChapters.values());
      const unsaved = allCompleted.filter(c => !c.savedToLibrary);
      if (unsaved.length > 0 || allCompleted.length > 0) {
        await saveCurrentCrawledToLibrary(false);
      } else {
        // No chapters downloaded yet
        if (inputNovelUrl?.value.trim()) {
          appendLog('Bắt đầu tải truyện để tự động lưu vào thư viện tạm...', 'info');
          state._autoSaveToLibraryOnFinish = true;
          await startCrawl();
        } else {
          alert('Vui lòng nhập địa chỉ truyện và tải ít nhất 1 chương trước khi lưu vào thư viện.');
        }
      }
    }
  }

  async function renderLibraryNovels() {
    if (!state.libraryManager || !libNovelsList) return;

    if (libRenderLoading) libRenderLoading.style.display = 'block';
    if (libEmptyPlaceholder) libEmptyPlaceholder.style.display = 'none';

    try {
      const novels = await state.libraryManager.getAllNovels();
      const bytesInUse = await state.libraryManager.getBytesInUse();
      const mbUsed = (bytesInUse / (1024 * 1024)).toFixed(2);
      const kbUsed = Math.round(bytesInUse / 1024);

      if (libStorageUsageBadge) {
        libStorageUsageBadge.textContent = bytesInUse > 1024 * 1024 ? `Dung lượng: ${mbUsed} MB` : `Dung lượng: ${kbUsed} KB`;
      }
      if (libTotalNovelsBadge) {
        libTotalNovelsBadge.textContent = `${novels.length} truyện`;
      }

      if (novels.length === 0) {
        if (libEmptyPlaceholder) libEmptyPlaceholder.style.display = 'block';
        libNovelsList.innerHTML = '';
        return;
      }

      const showAdvanced = Boolean(libShowAdvancedOptionsCheckbox?.checked);
      if (libAdvancedAddListSection) {
        libAdvancedAddListSection.style.display = showAdvanced ? 'block' : 'none';
      }

      libNovelsList.innerHTML = '';

      novels.forEach((novel, index) => {
        const card = document.createElement('div');
        card.className = 'lib-novel-card';
        card.id = `lib-card-${novel.id}`;

        // Left cover
        const coverWrapper = document.createElement('div');
        coverWrapper.className = 'lib-card-cover-wrapper';

        if (novel.cover) {
          const img = document.createElement('img');
          img.className = 'lib-card-cover-img';
          img.src = novel.cover;
          img.alt = novel.title || 'Bìa truyện';
          coverWrapper.appendChild(img);
        } else {
          const noCover = document.createElement('div');
          noCover.className = 'lib-card-no-cover';
          noCover.innerHTML = '<i data-lucide="image"></i><span>No image<br>available</span>';
          coverWrapper.appendChild(noCover);
        }

        // Right content
        const content = document.createElement('div');
        content.className = 'lib-card-content';

        // Action buttons row (Delete EPUB, Update, Download EPUB)
        const actionsRow = document.createElement('div');
        actionsRow.className = 'lib-card-actions';

        if (showAdvanced) {
          const btnUp = document.createElement('button');
          btnUp.type = 'button';
          btnUp.className = 'btn btn-secondary btn-xs';
          btnUp.innerHTML = '↑';
          btnUp.title = 'Di chuyển lên';
          btnUp.disabled = index === 0;
          btnUp.addEventListener('click', async () => {
            await state.libraryManager.changeOrder(novel.id, -1);
            await renderLibraryNovels();
          });
          actionsRow.appendChild(btnUp);

          const btnDown = document.createElement('button');
          btnDown.type = 'button';
          btnDown.className = 'btn btn-secondary btn-xs';
          btnDown.innerHTML = '↓';
          btnDown.title = 'Di chuyển xuống';
          btnDown.disabled = index === novels.length - 1;
          btnDown.addEventListener('click', async () => {
            await state.libraryManager.changeOrder(novel.id, 1);
            await renderLibraryNovels();
          });
          actionsRow.appendChild(btnDown);
        }

        const btnDelete = document.createElement('button');
        btnDelete.type = 'button';
        btnDelete.className = 'btn btn-danger btn-sm';
        btnDelete.innerHTML = '<i data-lucide="trash-2"></i> Delete EPUB';
        btnDelete.addEventListener('click', async () => {
          if (confirm(`Bạn có chắc chắn muốn xóa "${novel.title || novel.filename}" khỏi thư viện tạm?`)) {
            await state.libraryManager.deleteNovel(novel.id);
            appendLog(`🗑️ Đã xóa truyện "${novel.title}" khỏi thư viện tạm.`, 'info');
            await renderLibraryNovels();
          }
        });
        actionsRow.appendChild(btnDelete);

        const btnUpdate = document.createElement('button');
        btnUpdate.type = 'button';
        btnUpdate.className = 'btn btn-primary btn-sm';
        btnUpdate.innerHTML = '<i data-lucide="refresh-cw"></i> Update';
        btnUpdate.title = 'Kiểm tra và tải các chương mới cập nhật cho truyện này';
        btnUpdate.addEventListener('click', () => updateNovelFromLibrary(novel.id));
        actionsRow.appendChild(btnUpdate);

        const btnDownload = document.createElement('button');
        btnDownload.type = 'button';
        btnDownload.className = 'btn btn-success btn-sm';
        btnDownload.innerHTML = '<i data-lucide="download"></i> Download EPUB';
        btnDownload.title = 'Tải file EPUB lưu trong thư viện về máy tính';
        btnDownload.addEventListener('click', () => downloadNovelFromLibrary(novel.id));
        actionsRow.appendChild(btnDownload);

        if (novel.newChapterCount && novel.newChapterCount !== '0' && novel.newChapterCount !== '-1') {
          const badge = document.createElement('span');
          badge.className = 'lib-new-chapter-badge';
          badge.innerHTML = `<i data-lucide="sparkles"></i> +${novel.newChapterCount} chương mới`;
          actionsRow.appendChild(badge);
        }

        content.appendChild(actionsRow);

        // Story URL Row
        const urlRow = document.createElement('div');
        urlRow.className = 'lib-field-row';
        const urlLabel = document.createElement('span');
        urlLabel.className = 'lib-field-label';
        urlLabel.textContent = 'Story URL';
        const urlGroup = document.createElement('div');
        urlGroup.className = 'lib-field-input-group';
        const urlInput = document.createElement('input');
        urlInput.type = 'url';
        urlInput.value = novel.url || '';
        urlInput.placeholder = 'https://...';
        urlInput.addEventListener('change', async () => {
          await state.libraryManager.updateMetadata(novel.id, { url: urlInput.value.trim() });
        });
        urlGroup.appendChild(urlInput);

        const btnOpenUrl = document.createElement('button');
        btnOpenUrl.type = 'button';
        btnOpenUrl.className = 'btn btn-secondary btn-xs';
        btnOpenUrl.innerHTML = '<i data-lucide="external-link"></i> Mở';
        btnOpenUrl.title = 'Mở liên kết truyện trên trình duyệt';
        btnOpenUrl.addEventListener('click', () => {
          if (novel.url) {
            if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
              chrome.tabs.create({ url: novel.url });
            } else {
              window.open(novel.url, '_blank');
            }
          }
        });
        urlGroup.appendChild(btnOpenUrl);
        urlRow.appendChild(urlLabel);
        urlRow.appendChild(urlGroup);
        content.appendChild(urlRow);

        // Filename Row
        const fileRow = document.createElement('div');
        fileRow.className = 'lib-field-row';
        const fileLabel = document.createElement('span');
        fileLabel.className = 'lib-field-label';
        fileLabel.textContent = 'Filename';
        const fileGroup = document.createElement('div');
        fileGroup.className = 'lib-field-input-group';
        const fileInput = document.createElement('input');
        fileInput.type = 'text';
        fileInput.value = novel.filename || '';
        fileInput.placeholder = 'Ten_truyen.epub';
        fileInput.addEventListener('change', async () => {
          await state.libraryManager.updateMetadata(novel.id, { filename: fileInput.value.trim() });
        });
        fileGroup.appendChild(fileInput);
        fileRow.appendChild(fileLabel);
        fileRow.appendChild(fileGroup);
        content.appendChild(fileRow);

        // Advanced Metadata Expandable
        if (showAdvanced) {
          const advBox = document.createElement('div');
          advBox.className = 'lib-advanced-meta-box';

          const grid = document.createElement('div');
          grid.className = 'lib-advanced-meta-grid';

          const titleInput = document.createElement('input');
          titleInput.type = 'text';
          titleInput.value = novel.title || '';
          titleInput.placeholder = 'Tên truyện...';
          titleInput.addEventListener('change', async () => {
            await state.libraryManager.updateMetadata(novel.id, { title: titleInput.value.trim() });
          });

          const authorInput = document.createElement('input');
          authorInput.type = 'text';
          authorInput.value = novel.author || '';
          authorInput.placeholder = 'Tác giả...';
          authorInput.addEventListener('change', async () => {
            await state.libraryManager.updateMetadata(novel.id, { author: authorInput.value.trim() });
          });

          grid.appendChild(titleInput);
          grid.appendChild(authorInput);
          advBox.appendChild(grid);

          const descArea = document.createElement('textarea');
          descArea.className = 'form-control';
          descArea.rows = 2;
          descArea.value = novel.description || '';
          descArea.placeholder = 'Giới thiệu truyện...';
          descArea.addEventListener('change', async () => {
            await state.libraryManager.updateMetadata(novel.id, { description: descArea.value.trim() });
          });
          advBox.appendChild(descArea);

          content.appendChild(advBox);
        }

        card.appendChild(coverWrapper);
        card.appendChild(content);
        libNovelsList.appendChild(card);
      });

      if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
        try { lucide.createIcons(); } catch (_) {}
      }
    } catch (renderErr) {
      appendLog(`Lỗi nạp thư viện truyện: ${renderErr.message}`, 'error');
    } finally {
      if (libRenderLoading) libRenderLoading.style.display = 'none';
    }
  }

  async function updateNovelFromLibrary(id) {
    if (!state.libraryManager) return;
    const novel = await state.libraryManager.getNovel(id);
    if (!novel || !novel.url) {
      alert('Truyện này không có Story URL để cập nhật.');
      return;
    }

    appendLog(`🔄 Bắt đầu kiểm tra và cập nhật chương mới cho "${novel.title || novel.filename}"...`, 'info');

    // Populate URL and navigate to story tab
    if (inputNovelUrl) inputNovelUrl.value = novel.url;
    activateManagerTab('story');

    try {
      await fetchNovelMetadata();
      state._updatingLibraryNovelId = id;
      state._autoDownloadAfterUpdate = Boolean(libDownloadEpubAfterUpdateCheckbox?.checked);

      appendLog(`Đã tải danh sách chương từ web (${state.chapters.length} chương). Bắt đầu cào để cập nhật vào thư viện...`, 'info');
      await startCrawl();
    } catch (err) {
      appendLog(`Lỗi khi cập nhật truyện từ thư viện: ${err.message}`, 'error');
    }
  }

  async function downloadNovelFromLibrary(id) {
    if (!state.libraryManager) return;
    try {
      appendLog('Đang chuẩn bị file EPUB từ thư viện...', 'info');
      const { blob, filename } = await state.libraryManager.getDownloadableBlob(id);

      if (typeof chrome !== 'undefined' && chrome.downloads && typeof chrome.downloads.download === 'function') {
        const blobUrl = URL.createObjectURL(blob);
        await chrome.downloads.download({
          url: blobUrl,
          filename,
          saveAs: true
        });
      } else {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      appendLog(`✅ Đã tải file EPUB "${filename}" về máy tính thành công.`, 'success');
    } catch (err) {
      appendLog(`Lỗi tải file EPUB từ thư viện: ${err.message}`, 'error');
    }
  }

  async function updateAllLibraryNovels() {
    if (!state.libraryManager) return;
    const ids = await state.libraryManager.getStorageIds();
    if (ids.length === 0) {
      alert('Thư viện hiện đang trống, không có truyện để cập nhật.');
      return;
    }

    if (btnLibUpdateAll) btnLibUpdateAll.disabled = true;
    appendLog(`🔄 Bắt đầu cập nhật toàn bộ ${ids.length} truyện trong thư viện...`, 'info');

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const novel = await state.libraryManager.getNovel(id);
      if (!novel || !novel.url) continue;

      appendLog(`[${i + 1}/${ids.length}] Đang cập nhật: ${novel.title || novel.url}...`, 'info');
      try {
        if (inputNovelUrl) inputNovelUrl.value = novel.url;
        await fetchNovelMetadata();
        state._updatingLibraryNovelId = id;
        state._autoDownloadAfterUpdate = Boolean(libDownloadEpubAfterUpdateCheckbox?.checked);
        await startCrawl();
      } catch (err) {
        appendLog(`Không thể cập nhật truyện #${id} (${novel.title}): ${err.message}`, 'warning');
      }
    }

    if (btnLibUpdateAll) btnLibUpdateAll.disabled = false;
    appendLog('🎉 Đã hoàn tất cập nhật tất cả truyện trong thư viện!', 'success');
    await renderLibraryNovels();
  }

  async function clearAllLibraryNovels() {
    if (!state.libraryManager) return;
    if (confirm('Bạn có chắc chắn muốn XÓA TOÀN BỘ truyện trong thư viện tạm không? Hành động này không thể hoàn tác.')) {
      await state.libraryManager.clearLibrary();
      appendLog('🧹 Đã xóa toàn bộ truyện trong thư viện tạm!', 'warning');
      await renderLibraryNovels();
    }
  }

  async function exportLibraryBackup() {
    if (!state.libraryManager) return;
    try {
      const jsonStr = await state.libraryManager.exportLibraryJson();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const filename = `VTPATE_Library_Backup_${new Date().toISOString().slice(0, 10)}.json`;

      if (typeof chrome !== 'undefined' && chrome.downloads && typeof chrome.downloads.download === 'function') {
        const blobUrl = URL.createObjectURL(blob);
        await chrome.downloads.download({ url: blobUrl, filename, saveAs: true });
      } else {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      appendLog(`💾 Đã xuất file sao lưu thư viện: "${filename}".`, 'success');
    } catch (err) {
      appendLog(`Lỗi xuất thư viện: ${err.message}`, 'error');
    }
  }

  async function handleImportLibraryFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file || !state.libraryManager) return;
    try {
      appendLog(`Đang nhập thư viện từ tệp ${file.name}...`, 'info');
      const text = await file.text();
      const count = await state.libraryManager.importLibraryJson(text);
      appendLog(`📥 Đã nhập thành công thư viện (${count} truyện hiện có).`, 'success');
      await renderLibraryNovels();
      event.target.value = '';
    } catch (err) {
      appendLog(`Lỗi nhập thư viện: ${err.message}`, 'error');
      alert(`Không thể nhập thư viện: ${err.message}`);
    }
  }

  async function handleUploadEpubToLibrary(event) {
    const file = event.target.files && event.target.files[0];
    if (!file || !state.libraryManager) return;
    try {
      appendLog(`Đang phân tích và nạp file EPUB "${file.name}" vào thư viện...`, 'info');
      let title = file.name.replace(/\.epub$/i, '');
      let author = 'Chưa rõ';
      let description = '';

      if (typeof EpubRepairer !== 'undefined') {
        try {
          const diag = await EpubRepairer.inspectEpub(file);
          if (diag.title) title = diag.title;
          if (diag.author) author = diag.author;
        } catch (_) {}
      }

      await state.libraryManager.saveToLibrary({
        url: '',
        filename: file.name,
        title,
        author,
        description,
        epubBlob: file,
        isMerge: false
      });

      appendLog(`✅ Đã nạp thành công file EPUB "${title}" vào thư viện tạm!`, 'success');
      await renderLibraryNovels();
      event.target.value = '';
    } catch (err) {
      appendLog(`Lỗi nạp file EPUB vào thư viện: ${err.message}`, 'error');
      alert(`Không thể nạp file EPUB: ${err.message}`);
    }
  }

  async function handleAddBulkListToLibrary() {
    if (!libAddListToLibraryTextarea || !state.libraryManager) return;
    const lines = libAddListToLibraryTextarea.value.split('\n').map(s => s.trim()).filter(s => s && s.startsWith('http'));
    if (lines.length === 0) {
      alert('Vui lòng nhập ít nhất một URL truyện hợp lệ.');
      return;
    }

    appendLog(`Đang thêm ${lines.length} truyện vào thư viện tạm...`, 'info');
    for (const url of lines) {
      try {
        const domain = new URL(url).hostname;
        await state.libraryManager.saveToLibrary({
          url,
          filename: `${domain}_story.epub`,
          title: `Truyện (${domain})`,
          author: 'Chưa rõ',
          isMerge: false
        });
      } catch (_) {}
    }

    libAddListToLibraryTextarea.value = '';
    appendLog(`✅ Đã thêm ${lines.length} truyện vào danh sách thư viện tạm.`, 'success');
    await renderLibraryNovels();
  }

  // --- EPUB Doctor & Auto-Repair Engine Handlers ---
  async function handleSelectRepairFile(file) {
    if (!file) return;
    state.selectedRepairFile = file;

    if (repairFileName) {
      repairFileName.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
    }
    if (repairResultsBox) {
      repairResultsBox.style.display = 'flex';
    }
    if (repairStatusText) {
      repairStatusText.textContent = 'Đang giải nén & chẩn đoán lỗi...';
    }

    appendLog(`Bác Sĩ EPUB: Đang kiểm tra cấu trúc file: ${file.name}...`);

    try {
      if (typeof EpubRepairer === 'undefined') {
        throw new Error('EpubRepairer chưa được nạp');
      }

      const diagnosis = await EpubRepairer.inspectEpub(file);

      if (repairBookTitle) repairBookTitle.textContent = diagnosis.title || file.name;
      if (repairBookAuthor) repairBookAuthor.textContent = ` - ${diagnosis.author || 'Tác giả chưa rõ'}`;
      if (repairChapterCountBadge) repairChapterCountBadge.textContent = `${diagnosis.chapterCount} chương`;

      if (repairDiagnosisList) {
        repairDiagnosisList.innerHTML = '';
        if (diagnosis.issues.length === 0) {
          const cleanEl = document.createElement('div');
          cleanEl.className = 'repair-diagnosis-item clean';
          cleanEl.innerHTML = '<i data-lucide="check-circle-2"></i> <span>Cấu trúc cơ bản tốt. Sẵn sàng quét sâu để loại bỏ chữ ẩn và chuẩn hóa XHTML.</span>';
          repairDiagnosisList.appendChild(cleanEl);
        } else {
          diagnosis.issues.forEach((iss) => {
            const itemEl = document.createElement('div');
            itemEl.className = 'repair-diagnosis-item warn';
            itemEl.innerHTML = `<i data-lucide="alert-triangle"></i> <span>${iss}</span>`;
            repairDiagnosisList.appendChild(itemEl);
          });
        }
      }

      // If custom font is already configured in UI/profile, pre-check custom font option
      if (repairOptCustomFont) {
        repairOptCustomFont.checked = Boolean(state.customFont && state.customFont.filename && state.customFont.enabled !== false);
      }

      if (repairStatusText) {
        repairStatusText.textContent = `Phát hiện ${diagnosis.chapterCount} chương. Đã sẵn sàng bấm "Bắt Đầu Sửa".`;
      }
      appendLog(`Chẩn đoán hoàn tất: Tìm thấy ${diagnosis.chapterCount} chương (${diagnosis.issues.length} cảnh báo cần xử lý).`, 'info');
      if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
      appendLog(`Lỗi khi chẩn đoán file EPUB: ${err.message}`, 'error');
      if (repairStatusText) repairStatusText.textContent = `Lỗi: ${err.message}`;
    }
  }

  async function runEpubRepair() {
    if (!state.selectedRepairFile) {
      alert('Vui lòng chọn file EPUB cần sửa lỗi trước.');
      return;
    }

    if (btnRunRepairEpub) btnRunRepairEpub.disabled = true;
    if (repairStatusText) repairStatusText.textContent = 'Đang tiến hành làm sạch và sửa chữa...';
    appendLog(`Bác Sĩ EPUB: Bắt đầu làm sạch sâu cho file: ${state.selectedRepairFile.name}...`);

    try {
      const repairOpts = {
        cleanInvisibleText: repairOptInvisible ? repairOptInvisible.checked : true,
        fallbackEmpty: repairOptEmpty ? repairOptEmpty.checked : true,
        emptyPlaceholder: emptyChapterPlaceholderInput?.value.trim() || '<p>pass</p>',
        customRemovals: state.customRemovalsList || [],
        customFont: (repairOptCustomFont?.checked && state.customFont && state.customFont.filename) ? state.customFont : null,
        onProgress: ({ current, total, chapter, isEmpty }) => {
          if (repairStatusText) {
            repairStatusText.textContent = `Đang xử lý chương ${current}/${total}: ${chapter}${isEmpty ? ' (Đã chèn pass)' : ''}...`;
          }
        }
      };

      const result = await EpubRepairer.repairEpub(state.selectedRepairFile, repairOpts);
      const filename = result.filename;
      const stats = result.stats;

      // Trigger download of repaired EPUB
      if (typeof chrome !== 'undefined' && chrome.downloads && typeof chrome.downloads.download === 'function') {
        const blobUrl = URL.createObjectURL(result.blob);
        await chrome.downloads.download({
          url: blobUrl,
          filename,
          saveAs: true
        });
      } else {
        const blobUrl = URL.createObjectURL(result.blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }

      const msg = `Sửa file EPUB thành công!\n` +
        `• Tổng số chương: ${stats.totalChapters}\n` +
        `• Đoạn chữ trắng / chữ ẩn đã xóa: ${stats.hiddenNoiseRemoved}\n` +
        `• Chương rỗng đã chèn <p>pass</p>: ${stats.emptyChaptersFilled}\n` +
        `• Ký tự XML điều khiển lỗi đã loại bỏ: ${stats.controlCharsRemoved}\n` +
        `• Nhúng font chữ mã hoá: ${stats.fontInjected ? 'Có' : 'Không'}\n` +
        `• File tải về: ${filename}`;

      appendLog(`Sửa file EPUB hoàn tất xuất sắc: Đã làm sạch ${stats.totalChapters} chương, lưu thành "${filename}".`, 'success');
      if (repairStatusText) repairStatusText.textContent = `Hoàn tất! Đã xuất: ${filename}`;
      alert(msg);
    } catch (err) {
      appendLog(`Lỗi trong tiến trình sửa file EPUB: ${err.message}`, 'error');
      if (repairStatusText) repairStatusText.textContent = `Lỗi: ${err.message}`;
      alert(`Lỗi sửa file: ${err.message}`);
    } finally {
      if (btnRunRepairEpub) btnRunRepairEpub.disabled = false;
    }
  }

  // Bind EPUB Repair events
  if (btnSelectRepairEpub && repairFileInput) {
    btnSelectRepairEpub.addEventListener('click', () => {
      repairFileInput.click();
    });
  }

  if (repairFileInput) {
    repairFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        handleSelectRepairFile(file);
      }
    });
  }

  if (btnRunRepairEpub) {
    btnRunRepairEpub.addEventListener('click', runEpubRepair);
  }

  // --- Event Bindings ---
  if (inputNovelUrl) {
    inputNovelUrl.addEventListener('input', (e) => {
      detectParser(e.target.value.trim());
    });
  }

  if (btnFetchMetadata) {
    btnFetchMetadata.addEventListener('click', fetchNovelMetadata);
  }

  // Password toggle show/hide
  if (btnTogglePassword && loginPassInput) {
    btnTogglePassword.addEventListener('click', () => {
      const isPass = loginPassInput.type === 'password';
      loginPassInput.type = isPass ? 'text' : 'password';
      btnTogglePassword.innerHTML = isPass ? '<i data-lucide="eye-off"></i>' : '<i data-lucide="eye"></i>';
      if (typeof lucide !== 'undefined') lucide.createIcons();
    });
  }

  // Auth & Session Check buttons
  if (btnOpenLoginTab) {
    btnOpenLoginTab.addEventListener('click', openLoginTab);
  }

  if (btnCheckCookies) {
    btnCheckCookies.addEventListener('click', () => checkLoginSession(state.currentDomain));
  }

  if (btnSaveCredentials) {
    btnSaveCredentials.addEventListener('click', () => {
      const domain = state.currentDomain || loginDomainInput?.value.trim();
      if (!domain) {
        alert('Vui lòng chọn hoặc nhập domain trước khi lưu.');
        return;
      }
      saveProfileForDomain(domain);
    });
  }

  // Manual Selectors buttons
  if (btnApplySelectors) {
    btnApplySelectors.addEventListener('click', () => {
      applyManualSelectors();
      if (state.currentDomain) {
        saveProfileForDomain(state.currentDomain);
      }
      appendLog('Đã lưu và kích hoạt bộ selector CSS thủ công.', 'success');
      alert('Đã áp dụng các selector CSS thủ công.');
    });
  }

  if (btnTestChapter) {
    btnTestChapter.addEventListener('click', testChapterPreview);
  }

  if (btnResetSelectors) {
    btnResetSelectors.addEventListener('click', () => {
      applyCustomSelectorsToUI({});
      if (state.currentParser && typeof state.currentParser.setCustomSelectors === 'function') {
        state.currentParser.setCustomSelectors(null);
      }
      appendLog('Đã khôi phục parser về chế độ nhận diện Heuristic tự động.');
    });
  }

  if (btnCloseTestPreview && testPreviewContainer) {
    btnCloseTestPreview.addEventListener('click', () => {
      testPreviewContainer.style.display = 'none';
    });
  }

  // Noise & Removal Tags Handling
  function addCustomRemovalFromInput() {
    if (!inputCustomRemoval) return;
    const val = inputCustomRemoval.value.trim();
    if (!val) return;
    const parts = val.split(',').map((s) => s.trim()).filter(Boolean);
    parts.forEach((sel) => {
      if (!state.customRemovalsList.includes(sel)) {
        state.customRemovalsList.push(sel);
      }
    });
    inputCustomRemoval.value = '';
    renderRemovalsChips();
    applyManualSelectors();
    if (state.currentDomain) {
      saveProfileForDomain(state.currentDomain);
    }
    appendLog(`Đã thêm ${parts.length} selector vào danh sách lọc rác tự động.`, 'success');
  }

  if (btnAddRemoval) {
    btnAddRemoval.addEventListener('click', addCustomRemovalFromInput);
  }

  if (inputCustomRemoval) {
    inputCustomRemoval.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addCustomRemovalFromInput();
      }
    });
  }

  // Custom Font Handling for Obfuscated HTML
  if (customFontFileInput) {
    customFontFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        const fontName = (customFontNameInput?.value.trim()) || 'NovelCustomFont';
        state.customFont = {
          enabled: true,
          name: fontName,
          filename: file.name,
          dataBase64: dataUrl,
          mimeType: file.type || (file.name.endsWith('.woff2') ? 'font/woff2' : (file.name.endsWith('.woff') ? 'font/woff' : (file.name.endsWith('.otf') ? 'font/otf' : 'font/ttf')))
        };
        updateCustomFontUI();
        appendLog(`Đã nạp file font: ${file.name} (${Math.round(file.size / 1024)} KB) cho HTML mã hoá.`, 'success');
        if (state.currentDomain) {
          saveProfileForDomain(state.currentDomain);
        }
      };
      reader.onerror = (err) => {
        appendLog(`Lỗi đọc file font: ${err.message}`, 'error');
      };
      reader.readAsDataURL(file);
    });
  }

  if (btnClearFont) {
    btnClearFont.addEventListener('click', () => {
      state.customFont = null;
      if (customFontFileInput) customFontFileInput.value = '';
      updateCustomFontUI();
      appendLog('Đã hủy cấu hình custom font.');
      if (state.currentDomain) {
        saveProfileForDomain(state.currentDomain);
      }
    });
  }

  if (customFontEnabledCheckbox) {
    customFontEnabledCheckbox.addEventListener('change', () => {
      if (state.customFont) {
        state.customFont.enabled = customFontEnabledCheckbox.checked;
        if (state.currentDomain) {
          saveProfileForDomain(state.currentDomain);
        }
      }
    });
  }

  if (customFontNameInput) {
    customFontNameInput.addEventListener('input', () => {
      if (state.customFont) {
        state.customFont.name = customFontNameInput.value.trim() || 'NovelCustomFont';
      }
    });
  }

  // Storage Center Buttons
  if (btnSaveProfile) {
    btnSaveProfile.addEventListener('click', () => {
      const domain = state.currentDomain || loginDomainInput?.value.trim();
      if (!domain) {
        alert('Vui lòng nhập URL hoặc domain trước.');
        return;
      }
      saveProfileForDomain(domain);
    });
  }

  if (btnLoadProfile) {
    btnLoadProfile.addEventListener('click', () => {
      const domain = state.currentDomain || loginDomainInput?.value.trim();
      if (!domain) {
        alert('Vui lòng nhập URL hoặc domain trước.');
        return;
      }
      loadProfileForDomain(domain);
    });
  }

  document.getElementById('btn-save-progress-now')?.addEventListener('click', saveManualCheckpoint);
  document.getElementById('btn-export-progress')?.addEventListener('click', exportProgressBackup);
  document.getElementById('import-progress-file')?.addEventListener('change', importProgressBackup);
  window.addEventListener('beforeunload', event => {
    if (checkpointWriteCount > 0 || !lastCheckpointSaved) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  if (btnSaveCheckpoint) {
    btnSaveCheckpoint.addEventListener('click', saveManualCheckpoint);
  }

  if (btnRestoreCheckpoint) {
    btnRestoreCheckpoint.addEventListener('click', restoreManualCheckpoint);
  }

  if (btnExportProfiles) {
    btnExportProfiles.addEventListener('click', exportProfilesBackup);
  }

  if (btnImportProfiles && importJsonFileInput) {
    btnImportProfiles.addEventListener('click', () => {
      importJsonFileInput.click();
    });
  }

  if (importJsonFileInput) {
    importJsonFileInput.addEventListener('change', handleImportJsonFile);
  }

  if (btnDeleteProfile) {
    btnDeleteProfile.addEventListener('click', deleteDomainProfile);
  }

  // Crawl Action buttons
  if (btnStart) {
    btnStart.addEventListener('click', startCrawl);
  }

  btnReloadTab?.addEventListener('click', () => recoverCurrentTab(true));
  btnRecheckTab?.addEventListener('click', () => recoverCurrentTab(false));
  btnSkipPass?.addEventListener('click', handleSkipPassword);
  btnNoticeSkipPass?.addEventListener('click', handleSkipPassword);

  btnAlertResumeCrawl?.addEventListener('click', () => {
    hideSleepOrErrorAlert();
    if (state.crawlEngine && state.crawlEngine.isPaused) {
      state.crawlEngine.resume();
      state.isPaused = false;
      if (btnPause) {
        btnPause.textContent = 'Tạm dừng';
        btnPause.disabled = false;
      }
      updateRecoveryControls();
    }
  });

  btnAlertRetryFailed?.addEventListener('click', () => {
    hideSleepOrErrorAlert();
    retryFailedChapters();
  });

  if (btnPause) {
    btnPause.addEventListener('click', togglePause);
  }

  if (btnStop) {
    btnStop.addEventListener('click', stopCrawl);
  }

  if (btnRetryFailed) {
    btnRetryFailed.addEventListener('click', retryFailedChapters);
  }

  const handleSkipWait = () => {
    if (state.crawlEngine && typeof state.crawlEngine.skipWait === 'function') {
      appendLog('⚡ Người dùng đã bấm bỏ qua thời gian chờ, tiến hành tải ngay chương kế tiếp...');
      state.crawlEngine.skipWait();
    }
  };
  btnSkipWait?.addEventListener('click', handleSkipWait);
  btnQuickSkipWait?.addEventListener('click', handleSkipWait);

  // Sync Quick Wait Bar <-> Settings Panel
  quickMaxWaitInput?.addEventListener('input', () => {
    if (maxWaitSecondsInput) maxWaitSecondsInput.value = quickMaxWaitInput.value;
  });
  maxWaitSecondsInput?.addEventListener('input', () => {
    if (quickMaxWaitInput) quickMaxWaitInput.value = maxWaitSecondsInput.value;
  });

  quickFixedWaitInput?.addEventListener('input', () => {
    if (interChapterDelayInput) interChapterDelayInput.value = quickFixedWaitInput.value;
  });
  interChapterDelayInput?.addEventListener('input', () => {
    if (quickFixedWaitInput) quickFixedWaitInput.value = interChapterDelayInput.value;
  });

  quickRecheckWaitInput?.addEventListener('input', () => {
    if (recheckWaitSecondsInput) recheckWaitSecondsInput.value = quickRecheckWaitInput.value;
  });
  recheckWaitSecondsInput?.addEventListener('input', () => {
    if (quickRecheckWaitInput) quickRecheckWaitInput.value = recheckWaitSecondsInput.value;
  });

  quickEnableWpmCheckbox?.addEventListener('change', () => {
    if (enableWpmDelayCheckbox) enableWpmDelayCheckbox.checked = quickEnableWpmCheckbox.checked;
  });
  enableWpmDelayCheckbox?.addEventListener('change', () => {
    if (quickEnableWpmCheckbox) quickEnableWpmCheckbox.checked = enableWpmDelayCheckbox.checked;
  });

  quickSkipErrorsCheckbox?.addEventListener('change', () => {
    if (autoSkipErrorsCheckbox) autoSkipErrorsCheckbox.checked = quickSkipErrorsCheckbox.checked;
  });
  autoSkipErrorsCheckbox?.addEventListener('change', () => {
    if (quickSkipErrorsCheckbox) quickSkipErrorsCheckbox.checked = autoSkipErrorsCheckbox.checked;
  });

  if (btnExport) {
    btnExport.addEventListener('click', exportEpub);
  }

  if (btnAddToLibrary) {
    btnAddToLibrary.addEventListener('click', handleAddToLibraryClick);
  }
  if (btnQuickAddToLibrary) {
    btnQuickAddToLibrary.addEventListener('click', handleAddToLibraryClick);
  }

  // Library Panel Global Action Handlers
  btnLibUpdateAll?.addEventListener('click', updateAllLibraryNovels);
  btnLibClearAll?.addEventListener('click', clearAllLibraryNovels);
  btnLibExportAll?.addEventListener('click', exportLibraryBackup);
  btnLibImportAll?.addEventListener('click', () => libImportFileInput?.click());
  libImportFileInput?.addEventListener('change', handleImportLibraryFile);
  btnLibUploadEpub?.addEventListener('click', () => libUploadEpubInput?.click());
  libUploadEpubInput?.addEventListener('change', handleUploadEpubToLibrary);
  libShowAdvancedOptionsCheckbox?.addEventListener('change', renderLibraryNovels);
  btnLibAddList?.addEventListener('click', handleAddBulkListToLibrary);

  // Tab switch listener to render library
  document.querySelectorAll('[data-manager-tab="library"]').forEach(btn => {
    btn.addEventListener('click', renderLibraryNovels);
  });

  // Real-time Live Settings Synchronizer during Active Session
  let _liveSettingsDebounceTimer = null;
  function applyLiveSettingsToRunningEngine() {
    if (state.crawlEngine && state.crawlEngine.isRunning) {
      const liveProfile = getCrawlProfile();
      state.crawlEngine.updateLiveSettings(liveProfile);

      clearTimeout(_liveSettingsDebounceTimer);
      _liveSettingsDebounceTimer = setTimeout(() => {
        appendLog(`⚡ Đã tự động áp dụng cài đặt mới vào phiên tải đang chạy: Luồng=${liveProfile.concurrency}, Nghỉ=${liveProfile.delayMs}ms, Chờ=${liveProfile.interChapterDelaySeconds}s, Ảnh=${liveProfile.includeInlineImages ? 'Bật' : 'Tắt'}`, 'info');
      }, 400);
    }
  }

  const liveSettingElements = [
    concurrencyInput,
    delayInput,
    jitterCheckbox,
    crawlModeSelect,
    includeInlineImagesCheckbox,
    visibleTabCrawlCheckbox,
    backgroundChaptersCheckbox,
    autoRetryFailedCheckbox,
    autoPauseOnSleepCheckbox,
    maxConsecutiveErrorsSelect,
    autoSkipErrorsCheckbox,
    quickSkipErrorsCheckbox,
    autoFillPlaceholdersCheckbox,
    maxWaitSecondsInput,
    quickMaxWaitInput,
    interChapterDelayInput,
    quickFixedWaitInput,
    recheckWaitSecondsInput,
    quickRecheckWaitInput,
    enableWpmDelayCheckbox,
    quickEnableWpmCheckbox,
    readingWpmInput,
    breakIntervalInput,
    breakSecondsInput,
    pageLoadWaitInput,
    selectorChapterContent,
    selectorChapterTitle,
    selectorClassesToRemove,
    selectorNextChapterBtn
  ];

  liveSettingElements.forEach(el => {
    if (!el) return;
    el.addEventListener('change', applyLiveSettingsToRunningEngine);
    if (el.tagName === 'INPUT' && (el.type === 'number' || el.type === 'range' || el.type === 'text')) {
      el.addEventListener('input', applyLiveSettingsToRunningEngine);
    }
  });

  // Screen Off / System Lock Detection via chrome.idle API
  // CHỈ ghi nhận và tạm ngưng khi màn hình máy tính thực sự bị tắt / khóa máy (Screen Off / System Locked).
  // Khi bạn chuyển sang tab khác làm việc, hệ thống hoàn toàn KHÔNG coi là ngủ và crawler vẫn cào ngầm bình thường!
  async function handleScreenLocked() {
    const profile = getCrawlProfile();
    if (profile.autoPauseOnSleep !== false) {
      if (state.crawlEngine && state.crawlEngine.isRunning && !state.crawlEngine.isPaused && !state.crawlEngine.isCancelled) {
        appendLog('💤 Màn hình máy tính đã tắt / khóa màn hình (Screen Off). Hệ thống tự động lưu tiến trình và tạm dừng cào...', 'warning');
        state.crawlEngine.pause();
        state.isPaused = true;
        if (btnPause) {
          btnPause.textContent = 'Tiếp tục';
          btnPause.disabled = false;
        }
        await persistCrawlCheckpoint('paused');
        updateRecoveryControls();
        showSleepOrErrorAlert('💤 Màn hình máy tính đã tắt', 'Màn hình máy tính đã tắt hoặc khóa máy. Toàn bộ tiến trình cào truyện đã được tự động lưu an toàn và tạm dừng.');
      }
    }
  }

  if (typeof chrome !== 'undefined' && chrome.idle && chrome.idle.onStateChanged) {
    chrome.idle.onStateChanged.addListener((newState) => {
      // newState có 3 trạng thái: 'active', 'idle', 'locked'
      // 'locked': Màn hình máy tính tắt (turn off display) hoặc người dùng khóa máy (Win+L / sleep)
      // Khi người dùng chỉ chuyển tab làm việc, newState vẫn là 'active' -> KHÔNG bao giờ bị dừng nhầm!
      if (newState === 'locked') {
        handleScreenLocked();
      }
    });
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.action === 'SCREEN_LOCKED') {
        handleScreenLocked();
      }
    });
  }

  // Network Offline / Online Listeners
  if (typeof window !== 'undefined') {
    window.addEventListener('offline', async () => {
      const profile = getCrawlProfile();
      if (profile.autoPauseOnSleep !== false) {
        if (state.crawlEngine && state.crawlEngine.isRunning && !state.crawlEngine.isPaused && !state.crawlEngine.isCancelled) {
          appendLog('⚠️ Thiết bị mất kết nối mạng Internet (Offline). Hệ thống tự động lưu tiến trình và tạm dừng cào...', 'warning');
          state.crawlEngine.pause();
          state.isPaused = true;
          if (btnPause) {
            btnPause.textContent = 'Tiếp tục';
            btnPause.disabled = false;
          }
          await persistCrawlCheckpoint('paused');
          updateRecoveryControls();
          showSleepOrErrorAlert('⚠️ Mất kết nối Internet', 'Thiết bị vừa ngắt kết nối mạng (Offline). Toàn bộ dữ liệu đã được lưu an toàn và tạm dừng cào.');
        }
      }
    });

    window.addEventListener('online', () => {
      appendLog('🌐 Đã khôi phục kết nối Internet. Bạn có thể bấm "Tiếp tục" hoặc "Tải lại các chương lỗi".', 'info');
    });
  }

  // Profile input change listeners
  if (concurrencyInput) {
    concurrencyInput.addEventListener('change', () => {
      concurrencyInput.value = clampConcurrency(concurrencyInput.value);
    });
  }

  if (delayInput) {
    delayInput.addEventListener('change', () => {
      delayInput.value = clampDelay(delayInput.value);
    });
  }

  // Custom Cover URL & Generator Handlers
  if (btnApplyCoverUrl && novelCoverUrlInput) {
    btnApplyCoverUrl.addEventListener('click', async () => {
      const url = novelCoverUrlInput.value.trim();
      if (!url) {
        alert('Vui lòng nhập URL ảnh bìa.');
        return;
      }
      try {
        appendLog(`Đang tải ảnh bìa từ URL: ${url}...`, 'info');
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        state.customCoverBlob = blob;
        state.customCoverUrl = url;
        if (!state.novelMetadata) state.novelMetadata = {};
        state.novelMetadata.coverBlob = blob;
        state.novelMetadata.coverUrl = url;

        const objectUrl = URL.createObjectURL(blob);
        if (coverImage) {
          coverImage.src = objectUrl;
          coverImage.style.display = 'block';
        }
        if (coverPlaceholder) {
          coverPlaceholder.style.display = 'none';
        }
        appendLog('Đã áp dụng và nạp ảnh bìa thành công!', 'success');
      } catch (err) {
        appendLog(`Không thể tải ảnh bìa từ URL: ${err.message}. Sẽ hiển thị trực tiếp liên kết trên thẻ ảnh.`, 'warning');
        if (coverImage) {
          coverImage.src = url;
          coverImage.style.display = 'block';
        }
        if (coverPlaceholder) {
          coverPlaceholder.style.display = 'none';
        }
        if (!state.novelMetadata) state.novelMetadata = {};
        state.novelMetadata.coverUrl = url;
      }
    });
  }

  if (btnGenerateCover) {
    btnGenerateCover.addEventListener('click', async () => {
      const title = novelTitleInput ? novelTitleInput.value.trim() : (state.novelMetadata?.title || 'Tiêu Đề Truyện');
      const author = novelAuthorInput ? novelAuthorInput.value.trim() : (state.novelMetadata?.author || 'Tác Giả Chưa Rõ');
      appendLog('Đang tạo ảnh bìa tự động bằng Canvas...', 'info');
      try {
        const blob = await generateAutoCoverBlob(title, author);
        if (blob) {
          state.customCoverBlob = blob;
          if (!state.novelMetadata) state.novelMetadata = {};
          state.novelMetadata.coverBlob = blob;
          const objectUrl = URL.createObjectURL(blob);
          if (coverImage) {
            coverImage.src = objectUrl;
            coverImage.style.display = 'block';
          }
          if (coverPlaceholder) {
            coverPlaceholder.style.display = 'none';
          }
          appendLog('Đã tạo và áp dụng ảnh bìa tự động thành công!', 'success');
        }
      } catch (err) {
        appendLog(`Lỗi tạo ảnh bìa tự động: ${err.message}`, 'error');
      }
    });
  }

  // Custom Regex Cleaner Handlers
  if (btnAddRegex && inputCustomRegex) {
    btnAddRegex.addEventListener('click', () => {
      const val = inputCustomRegex.value.trim();
      if (!val) return;
      try {
        new RegExp(val, 'gi');
      } catch (e) {
        alert('Biểu thức Regex không hợp lệ: ' + e.message);
        return;
      }
      if (!state.customRegexList) state.customRegexList = [];
      if (!state.customRegexList.includes(val)) {
        state.customRegexList.push(val);
        renderRegexChips();
        inputCustomRegex.value = '';
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ vtpate_custom_regex_list: state.customRegexList });
        }
        appendLog(`Đã thêm Regex lọc rác: /${val}/i`, 'info');
      }
    });
    inputCustomRegex.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        btnAddRegex.click();
      }
    });
  }

  // Initialize removals chips, regex chips & custom font UI
  renderRemovalsChips();
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    try {
      const storedRegex = await chrome.storage.local.get('vtpate_custom_regex_list');
      if (storedRegex && Array.isArray(storedRegex.vtpate_custom_regex_list)) {
        state.customRegexList = storedRegex.vtpate_custom_regex_list;
      }
    } catch (e) {}
  }
  renderRegexChips();
  updateCustomFontUI();

  // Initialize saved profile chips on load
  await renderProfileChips();

  // ==========================================
  // MULTI-STORY / BATCH CRAWLER SYSTEM
  // ==========================================
  const batchState = {
    queue: [], // Array of story items
    runningIds: new Set(),
    activeEngines: new Map(), // storyId -> CrawlEngine
    autoExport: true,
    concurrency: 2
  };

  const btnBatchAdd = document.getElementById('btnBatchAdd');
  const btnBatchStartAll = document.getElementById('btnBatchStartAll');
  const btnBatchPauseAll = document.getElementById('btnBatchPauseAll');
  const btnBatchStopAll = document.getElementById('btnBatchStopAll');
  const btnBatchClearDone = document.getElementById('btnBatchClearDone');
  const btnBatchClearAll = document.getElementById('btnBatchClearAll');
  const batchUrlsInput = document.getElementById('batchUrlsInput');
  const batchConcurrencySelect = document.getElementById('batchConcurrencySelect');
  const batchAutoExportCheck = document.getElementById('batchAutoExportCheck');
  const batchQueueContainer = document.getElementById('batchQueueContainer');
  const batchEmptyNotice = document.getElementById('batchEmptyNotice');
  const batchTotalBadge = document.getElementById('batchTotalBadge');
  const batchRunningBadge = document.getElementById('batchRunningBadge');
  const batchCompletedBadge = document.getElementById('batchCompletedBadge');
  const batchQueueCount = document.getElementById('batchQueueCount');

  function sanitizeFilename(name) {
    return (name || 'truyen')
      .replace(/[\/\\:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function loadBatchQueue() {
    try {
      if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
        const stored = await chrome.storage.local.get(['vtpate_batch_queue', 'vtpate_batch_settings']);
        if (stored?.vtpate_batch_queue && Array.isArray(stored.vtpate_batch_queue)) {
          batchState.queue = stored.vtpate_batch_queue.map(item => ({
            ...item,
            status: (item.status === 'downloading' || item.status === 'fetching_toc') ? 'paused' : item.status
          }));
        }
        if (stored?.vtpate_batch_settings) {
          if (stored.vtpate_batch_settings.concurrency) {
            batchState.concurrency = stored.vtpate_batch_settings.concurrency;
            if (batchConcurrencySelect) batchConcurrencySelect.value = String(batchState.concurrency);
          }
          if (stored.vtpate_batch_settings.autoExport !== undefined) {
            batchState.autoExport = stored.vtpate_batch_settings.autoExport;
            if (batchAutoExportCheck) batchAutoExportCheck.checked = batchState.autoExport;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load batch queue:', e);
    }
    renderBatchQueue();
  }

  async function persistBatchQueue() {
    try {
      if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
        const serializable = batchState.queue.map(item => ({
          id: item.id,
          url: item.url,
          domain: item.domain,
          title: item.title,
          author: item.author,
          coverUrl: item.coverUrl,
          status: item.status,
          totalChapters: item.totalChapters || 0,
          downloadedCount: item.downloadedCount || 0,
          percentage: item.percentage || 0,
          speed: item.speed || 0,
          eta: item.eta || 0,
          addedAt: item.addedAt,
          updatedAt: Date.now(),
          error: item.error || null
        }));
        await chrome.storage.local.set({
          vtpate_batch_queue: serializable,
          vtpate_batch_settings: {
            concurrency: batchState.concurrency,
            autoExport: batchState.autoExport
          }
        });
      }
    } catch (e) {
      console.warn('Failed to persist batch queue:', e);
    }
  }

  function renderBatchQueue() {
    const total = batchState.queue.length;
    const running = batchState.queue.filter(i => i.status === 'downloading' || i.status === 'fetching_toc').length;
    const completed = batchState.queue.filter(i => i.status === 'completed').length;

    if (batchTotalBadge) batchTotalBadge.textContent = `Tổng: ${total}`;
    if (batchRunningBadge) batchRunningBadge.textContent = `Đang tải: ${running}`;
    if (batchCompletedBadge) batchCompletedBadge.textContent = `Đã xong: ${completed}`;
    if (batchQueueCount) batchQueueCount.textContent = String(total);

    if (batchEmptyNotice) {
      batchEmptyNotice.style.display = total === 0 ? 'block' : 'none';
    }

    if (!batchQueueContainer) return;
    batchQueueContainer.innerHTML = '';

    batchState.queue.forEach(item => {
      const card = document.createElement('div');
      card.className = `batch-item-card ${batchState.runningIds.has(item.id) ? 'is-active' : ''}`;
      card.id = `batch-card-${item.id}`;

      let statusClass = 'batch-status-queued';
      let statusText = 'Chờ tải';
      if (item.status === 'fetching_toc') {
        statusClass = 'batch-status-fetching';
        statusText = 'Đang lấy mục lục...';
      } else if (item.status === 'ready') {
        statusClass = 'batch-status-queued';
        statusText = `Sẵn sàng (${item.totalChapters} ch)`;
      } else if (item.status === 'downloading') {
        statusClass = 'batch-status-downloading';
        statusText = `Đang tải: ${item.percentage || 0}%`;
      } else if (item.status === 'paused') {
        statusClass = 'batch-status-paused';
        statusText = 'Tạm dừng';
      } else if (item.status === 'completed') {
        statusClass = 'batch-status-completed';
        statusText = 'Hoàn tất ✓';
      } else if (item.status === 'error') {
        statusClass = 'batch-status-error';
        statusText = item.error ? `Lỗi: ${item.error}` : 'Lỗi tải';
      }

      const isRunning = batchState.runningIds.has(item.id);
      const isCompleted = item.status === 'completed';
      const fillClass = isCompleted ? 'completed' : (item.status === 'error' ? 'error' : '');
      const pct = item.percentage || 0;
      const dlCount = item.downloadedCount || 0;
      const totCount = item.totalChapters || 0;
      const speedStr = (item.speed > 0) ? `Tốc độ: ${(item.speed >= 0.1 ? item.speed.toFixed(1) : item.speed.toFixed(2))} ch/s` : '';
      const etaStr = (item.eta > 0) ? `Còn: ${formatEtaText(item.eta).replace('Thời gian còn lại: ', '')}` : '';

      card.innerHTML = `
        <div class="batch-item-header">
          <div class="batch-item-info">
            <h3 class="batch-item-title">${escapeHtml(item.title || item.url)}</h3>
            <div class="batch-item-meta">
              <span class="batch-meta-author">${escapeHtml(item.author || 'Tác giả chưa rõ')}</span>
              <span class="badge badge-neutral">${escapeHtml(item.domain || '')}</span>
              <span class="batch-status-tag ${statusClass}">${statusText}</span>
            </div>
          </div>
          <div class="batch-item-actions">
            <button type="button" class="btn btn-sm btn-secondary btn-batch-open" title="Mở truyện này vào màn hình quản lý chính">
              <i data-lucide="external-link"></i> Mở
            </button>
            <button type="button" class="btn btn-sm ${isRunning ? 'btn-warning' : 'btn-success'} btn-batch-toggle" ${isCompleted ? 'disabled' : ''} title="${isRunning ? 'Tạm dừng' : 'Tải truyện này'}">
              <i data-lucide="${isRunning ? 'pause' : 'play'}"></i> ${isRunning ? 'Tạm dừng' : 'Tải'}
            </button>
            <button type="button" class="btn btn-sm btn-primary btn-batch-export" ${dlCount > 0 ? '' : 'disabled'} title="Đóng gói và tải file EPUB">
              <i data-lucide="package"></i> EPUB
            </button>
            <button type="button" class="btn btn-sm btn-danger btn-batch-remove" title="Xóa khỏi hàng đợi">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </div>
        <div class="batch-item-progress">
          <div class="batch-progress-bar-bg">
            <div class="batch-progress-bar-fill ${fillClass}" style="width: ${pct}%;"></div>
          </div>
          <div class="batch-item-stats">
            <span>${pct}% (${dlCount}/${totCount} chương)</span>
            <span>${speedStr}</span>
            <span>${etaStr}</span>
          </div>
        </div>
      `;

      card.querySelector('.btn-batch-open')?.addEventListener('click', () => openBatchStoryInMain(item.id));
      card.querySelector('.btn-batch-toggle')?.addEventListener('click', () => toggleBatchStory(item.id));
      card.querySelector('.btn-batch-export')?.addEventListener('click', () => exportBatchStory(item.id));
      card.querySelector('.btn-batch-remove')?.addEventListener('click', () => removeBatchStory(item.id));

      batchQueueContainer.appendChild(card);
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  async function addBatchUrls(urlsText) {
    if (!urlsText || !urlsText.trim()) return;
    const lines = urlsText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    let addedCount = 0;

    for (const url of lines) {
      if (!url.startsWith('http://') && !url.startsWith('https://')) continue;
      if (batchState.queue.some(i => i.url === url)) continue;

      let domain = '';
      try { domain = new URL(url).hostname; } catch {}

      const newItem = {
        id: 'story_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        url,
        domain,
        title: 'Đang nạp thông tin...',
        author: '',
        coverUrl: '',
        status: 'queued',
        totalChapters: 0,
        downloadedCount: 0,
        percentage: 0,
        speed: 0,
        eta: 0,
        chapters: [],
        addedAt: Date.now()
      };

      batchState.queue.push(newItem);
      addedCount++;
      fetchBatchItemMetadata(newItem);
    }

    if (addedCount > 0) {
      appendLog(`Đã thêm ${addedCount} truyện vào Hàng đợi tải nhiều.`, 'success');
      if (batchUrlsInput) batchUrlsInput.value = '';
      await persistBatchQueue();
      renderBatchQueue();
    }
  }

  async function fetchBatchItemMetadata(item) {
    item.status = 'fetching_toc';
    renderBatchQueue();
    try {
      const parser = detectParser(item.url);
      if (!parser) throw new Error('Không có parser phù hợp');
      const meta = await parser.fetchMetadata(item.url);
      item.title = meta.title || item.url;
      item.author = meta.author || '';
      item.coverUrl = meta.coverUrl || '';
      item.chapters = (meta.chapters || []).map(ch => ({ ...ch, selected: true }));
      item.totalChapters = item.chapters.length;
      item.status = 'ready';

      const existingChs = await loadBatchDownloadedChapters(item.id);
      if (existingChs && Object.keys(existingChs).length > 0) {
        item.downloadedCount = Object.keys(existingChs).length;
        item.percentage = item.totalChapters > 0 ? Math.round((item.downloadedCount / item.totalChapters) * 100) : 0;
        if (item.downloadedCount >= item.totalChapters && item.totalChapters > 0) {
          item.status = 'completed';
        }
      }
    } catch (err) {
      item.status = 'error';
      item.error = err.message;
    }
    await persistBatchQueue();
    renderBatchQueue();
  }

  async function loadBatchDownloadedChapters(storyId) {
    try {
      if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
        const key = `vtpate_batch_story_${storyId}`;
        const stored = await chrome.storage.local.get([key]);
        return stored[key]?.chapters || {};
      }
    } catch {}
    return {};
  }

  async function saveBatchDownloadedChapter(storyId, chapterNumber, chapterContent, metadata) {
    try {
      if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
        const key = `vtpate_batch_story_${storyId}`;
        const stored = await chrome.storage.local.get([key]);
        const data = stored[key] || { metadata, chapters: {} };
        data.metadata = metadata;
        data.chapters[chapterNumber] = chapterContent;
        data.updatedAt = Date.now();
        await chrome.storage.local.set({ [key]: data });
      }
    } catch (e) {
      console.warn('Failed to save batch chapter:', e);
    }
  }

  async function dispatchBatchQueue() {
    const runningCount = batchState.runningIds.size;
    const maxConcurrency = batchState.concurrency || 2;
    if (runningCount >= maxConcurrency) return;

    const availableSlots = maxConcurrency - runningCount;
    const candidates = batchState.queue.filter(i => (i.status === 'queued' || i.status === 'ready' || i.status === 'paused') && !batchState.runningIds.has(i.id));

    for (let i = 0; i < Math.min(availableSlots, candidates.length); i++) {
      const item = candidates[i];
      startBatchStory(item.id);
    }
  }

  async function startBatchStory(storyId) {
    const item = batchState.queue.find(i => i.id === storyId);
    if (!item || batchState.runningIds.has(storyId)) return;

    if (!item.chapters || !item.chapters.length) {
      await fetchBatchItemMetadata(item);
      if (!item.chapters || !item.chapters.length) return;
    }

    batchState.runningIds.add(storyId);
    item.status = 'downloading';
    renderBatchQueue();

    const existingChapters = await loadBatchDownloadedChapters(storyId);
    item.downloadedCount = Object.keys(existingChapters).length;

    const pendingChapters = item.chapters.filter(ch => !existingChapters[ch.chapterNumber]);
    if (pendingChapters.length === 0) {
      item.status = 'completed';
      item.percentage = 100;
      batchState.runningIds.delete(storyId);
      await persistBatchQueue();
      renderBatchQueue();
      if (batchState.autoExport) {
        await exportBatchStory(storyId);
      }
      dispatchBatchQueue();
      return;
    }

    appendLog(`[Batch] Bắt đầu tải: "${item.title}" (${pendingChapters.length}/${item.totalChapters} chương còn lại).`);

    const parser = detectParser(item.url);
    const domain = item.domain || '';
    const crawlProfile = getCrawlProfile();
    const batchFailed = [];

    const engine = new CrawlEngine({
      profileManager: state.profileManager,
      onProgress: (p) => {
        item.downloadedCount = Object.keys(existingChapters).length + p.completed;
        item.percentage = item.totalChapters > 0 ? Math.round((item.downloadedCount / item.totalChapters) * 100) : 0;
        item.speed = p.speed;
        item.eta = p.eta;
        renderBatchQueue();
      },
      onChapterComplete: async ({ chapter, result }) => {
        existingChapters[chapter.chapterNumber] = result;
        await saveBatchDownloadedChapter(storyId, chapter.chapterNumber, result, {
          title: item.title,
          author: item.author,
          coverUrl: item.coverUrl,
          novelUrl: item.url,
          chapters: item.chapters
        });
        item.downloadedCount = Object.keys(existingChapters).length;
        item.percentage = item.totalChapters > 0 ? Math.round((item.downloadedCount / item.totalChapters) * 100) : 0;
        await persistBatchQueue();
        renderBatchQueue();
      },
      onError: ({ chapter, error }) => {
        batchFailed.push(chapter);
        appendLog(`[Batch] Lỗi chương #${chapter.chapterNumber} của "${item.title}": ${error}`, 'error');
      }
    });

    batchState.activeEngines.set(storyId, engine);

    try {
      await engine.startCrawl({
        parser,
        chapters: pendingChapters,
        domain,
        profile: crawlProfile
      });

      if (!engine.isCancelled && batchFailed.length > 0 && autoRetryFailedCheckbox && autoRetryFailedCheckbox.checked) {
        appendLog(`[Batch] Tự động quét lại ${batchFailed.length} chương lỗi của "${item.title}"...`, 'info');
        const retryChapters = [...batchFailed];
        batchFailed.length = 0;
        const retryEngine = new CrawlEngine({
          profileManager: state.profileManager,
          onChapterComplete: async ({ chapter, result }) => {
            existingChapters[chapter.chapterNumber] = result;
            await saveBatchDownloadedChapter(storyId, chapter.chapterNumber, result, {
              title: item.title,
              author: item.author,
              coverUrl: item.coverUrl,
              novelUrl: item.url,
              chapters: item.chapters
            });
            item.downloadedCount = Object.keys(existingChapters).length;
            item.percentage = item.totalChapters > 0 ? Math.round((item.downloadedCount / item.totalChapters) * 100) : 0;
            await persistBatchQueue();
            renderBatchQueue();
          }
        });
        try {
          await retryEngine.startCrawl({
            parser,
            chapters: retryChapters,
            domain,
            profile: crawlProfile
          });
        } catch (e) {}
      }

      if (engine.isCancelled) {
        item.status = 'paused';
      } else {
        item.status = 'completed';
        item.percentage = 100;
        appendLog(`[Batch] Đã tải xong truyện: "${item.title}"!`, 'success');
        if (batchState.autoExport) {
          await exportBatchStory(storyId);
        }
      }
    } catch (err) {
      item.status = 'error';
      item.error = err.message;
      appendLog(`[Batch] Lỗi khi tải "${item.title}": ${err.message}`, 'error');
    } finally {
      batchState.runningIds.delete(storyId);
      batchState.activeEngines.delete(storyId);
      await persistBatchQueue();
      renderBatchQueue();
      dispatchBatchQueue();
    }
  }

  function toggleBatchStory(storyId) {
    const item = batchState.queue.find(i => i.id === storyId);
    if (!item) return;

    if (batchState.runningIds.has(storyId)) {
      const engine = batchState.activeEngines.get(storyId);
      if (engine) engine.cancel();
      batchState.runningIds.delete(storyId);
      item.status = 'paused';
      renderBatchQueue();
      persistBatchQueue();
    } else {
      startBatchStory(storyId);
    }
  }

  async function exportBatchStory(storyId) {
    const item = batchState.queue.find(i => i.id === storyId);
    if (!item) return;

    const data = await loadBatchDownloadedChapters(storyId);
    const chapterMap = data || {};
    const chapters = Object.values(chapterMap).sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));

    if (!chapters.length) {
      alert(`Truyện "${item.title}" chưa có chương nào được tải.`);
      return;
    }

    appendLog(`[Batch] Đang đóng gói EPUB cho truyện "${item.title}" (${chapters.length} chương)...`);

    try {
      let coverBlob = item.coverBlob || null;
      if (!coverBlob && typeof generateAutoCoverBlob === 'function') {
        try {
          coverBlob = await generateAutoCoverBlob(item.title || 'Truyện chữ', item.author || 'Tác giả');
        } catch (e) {}
      }

      const metadata = {
        title: item.title || 'Truyện chữ',
        author: item.author || 'Tác giả',
        coverUrl: item.coverUrl || '',
        coverBlob: coverBlob,
        coverFilename: 'cover.jpg',
        novelUrl: item.url || '',
        description: `Tải từ: ${item.url}`,
        totalChapters: chapters.length
      };

      const splitSize = parseInt(epubSplitSizeSelect?.value, 10) || 0;
      const packerOptions = {
        includeIntroChapter: true,
        includeInlineImages: includeInlineImagesCheckbox ? Boolean(includeInlineImagesCheckbox.checked) : true,
        splitSize: splitSize,
        customRegexList: state.customRegexList || [],
        customFont: state.customFont
      };

      const volumes = typeof EpubPacker.createSplitEpub === 'function'
        ? await EpubPacker.createSplitEpub(metadata, chapters, packerOptions)
        : [{ volume: 1, totalVolumes: 1, blob: await EpubPacker.createEpub(metadata, chapters, packerOptions), filename: `${sanitizeFilename(metadata.title)} - ${sanitizeFilename(metadata.author)}.epub` }];

      for (let v = 0; v < volumes.length; v++) {
        const vol = volumes[v];
        const filename = vol.filename;
        const blob = vol.blob;

        if (typeof chrome !== 'undefined' && chrome.downloads && typeof chrome.downloads.download === 'function') {
          const url = URL.createObjectURL(blob);
          chrome.downloads.download({ url, filename, saveAs: false }, () => {
            setTimeout(() => URL.revokeObjectURL(url), 10000);
          });
        } else {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = filename;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        }
        if (volumes.length > 1) {
          appendLog(`[Batch] [Quyển ${vol.volume}/${vol.totalVolumes}] Đã tạo file EPUB "${filename}"!`, 'success');
        } else {
          appendLog(`[Batch] Đã tạo file EPUB "${filename}" thành công!`, 'success');
        }
      }
    } catch (err) {
      appendLog(`[Batch] Lỗi đóng gói EPUB cho "${item.title}": ${err.message}`, 'error');
    }
  }

  async function openBatchStoryInMain(storyId) {
    const item = batchState.queue.find(i => i.id === storyId);
    if (!item) return;

    if (state.crawlEngine?.isRunning) {
      alert('Vui lòng dừng phiên tải hiện tại trên tab chính trước khi mở truyện khác.');
      return;
    }

    if (inputNovelUrl) inputNovelUrl.value = item.url;
    state.currentUrl = item.url;
    state.novelMetadata = {
      title: item.title,
      author: item.author,
      coverUrl: item.coverUrl,
      totalChapters: item.totalChapters
    };
    if (novelTitleInput) novelTitleInput.value = item.title;
    if (novelAuthorInput) novelAuthorInput.value = item.author;

    if (item.chapters && item.chapters.length) {
      state.chapters = item.chapters.map(ch => ({ ...ch }));
    }
    const downloadedMap = await loadBatchDownloadedChapters(storyId);
    state.downloadedChapters = new Map();
    for (const [k, v] of Object.entries(downloadedMap)) {
      state.downloadedChapters.set(Number(k), v);
    }

    renderChapterList();
    showDownloadedChapters();
    if (btnExport) btnExport.disabled = state.downloadedChapters.size === 0;

    activateManagerTab('story');
    appendLog(`Đã nạp truyện "${item.title}" vào màn hình quản lý chính. Có ${state.downloadedChapters.size}/${state.chapters.length} chương đã tải.`);
  }

  async function removeBatchStory(storyId) {
    const item = batchState.queue.find(i => i.id === storyId);
    if (!item) return;

    if (batchState.runningIds.has(storyId)) {
      const engine = batchState.activeEngines.get(storyId);
      if (engine) engine.cancel();
      batchState.runningIds.delete(storyId);
    }

    batchState.queue = batchState.queue.filter(i => i.id !== storyId);
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      await chrome.storage.local.remove([`vtpate_batch_story_${storyId}`]);
    }
    await persistBatchQueue();
    renderBatchQueue();
  }

  function initBatchUI() {
    btnBatchAdd?.addEventListener('click', () => {
      addBatchUrls(batchUrlsInput?.value || '');
    });

    btnBatchStartAll?.addEventListener('click', () => {
      dispatchBatchQueue();
    });

    btnBatchPauseAll?.addEventListener('click', () => {
      for (const [storyId, engine] of batchState.activeEngines.entries()) {
        engine.cancel();
        const item = batchState.queue.find(i => i.id === storyId);
        if (item) item.status = 'paused';
      }
      batchState.runningIds.clear();
      renderBatchQueue();
      persistBatchQueue();
      appendLog('[Batch] Đã tạm dừng toàn bộ truyện đang tải.');
    });

    btnBatchStopAll?.addEventListener('click', () => {
      for (const [storyId, engine] of batchState.activeEngines.entries()) {
        engine.cancel();
        const item = batchState.queue.find(i => i.id === storyId);
        if (item) item.status = 'queued';
      }
      batchState.runningIds.clear();
      renderBatchQueue();
      persistBatchQueue();
      appendLog('[Batch] Đã dừng toàn bộ truyện.');
    });

    btnBatchClearDone?.addEventListener('click', async () => {
      batchState.queue = batchState.queue.filter(i => i.status !== 'completed');
      await persistBatchQueue();
      renderBatchQueue();
      appendLog('[Batch] Đã xóa các truyện hoàn tất khỏi hàng đợi.');
    });

    btnBatchClearAll?.addEventListener('click', async () => {
      if (!confirm('Bạn có chắc chắn muốn xóa toàn bộ hàng đợi?')) return;
      for (const engine of batchState.activeEngines.values()) {
        engine.cancel();
      }
      batchState.runningIds.clear();
      batchState.activeEngines.clear();
      batchState.queue = [];
      await persistBatchQueue();
      renderBatchQueue();
      appendLog('[Batch] Đã xóa toàn bộ hàng đợi.');
    });

    batchConcurrencySelect?.addEventListener('change', () => {
      batchState.concurrency = parseInt(batchConcurrencySelect.value, 10) || 2;
      persistBatchQueue();
      dispatchBatchQueue();
    });

    batchAutoExportCheck?.addEventListener('change', () => {
      batchState.autoExport = Boolean(batchAutoExportCheck.checked);
      persistBatchQueue();
    });

    if (chapterSearchInput) {
      chapterSearchInput.addEventListener('input', () => {
        const query = chapterSearchInput.value.trim().toLowerCase();
        const items = document.querySelectorAll('#chapter-list .chapter-item, #chapter-list tr');
        items.forEach(el => {
          if (!query) {
            el.style.display = '';
          } else {
            const text = (el.textContent || '').toLowerCase();
            el.style.display = text.includes(query) ? '' : 'none';
          }
        });
      });
    }

    loadBatchQueue();
  }

  // Initialize Batch UI
  initBatchUI();

  // --- Text to HTML & Clean HTML Studio Logic ---
  state.cleanerTargetChapter = null;

  function updateCleanerCharCount() {
    if (!cleanerInput || !cleanerInputChars || !cleanerDetectedBadge) return;
    const val = cleanerInput.value;
    cleanerInputChars.textContent = `${val.length} ký tự`;

    if (!val.trim()) {
      cleanerDetectedBadge.className = 'badge badge-neutral';
      cleanerDetectedBadge.textContent = 'Chưa có dữ liệu';
    } else {
      const isHtml = typeof HtmlCleaner !== 'undefined'
        ? HtmlCleaner.isHtml(val)
        : /<\/?(?:p|div|span|h[1-6]|br|hr|b|strong|i|em|font|table|ul|ol|li)\b[^>]*>/i.test(val);
      cleanerDetectedBadge.className = isHtml ? 'badge badge-warning' : 'badge badge-success';
      cleanerDetectedBadge.textContent = isHtml ? 'Mã HTML' : 'Văn bản thô (Text)';
    }
  }

  function updateCleanerChapterDropdown() {
    if (!cleanerTargetChapterSelect) return;
    const currentVal = cleanerTargetChapterSelect.value;
    cleanerTargetChapterSelect.innerHTML = '<option value="">-- Chọn chương để cứu --</option>';

    // 1. First add failed chapters with warning indicator
    if (state.failedChapters && state.failedChapters.length > 0) {
      const optGroupFailed = document.createElement('optgroup');
      optGroupFailed.label = '⚠️ Các chương đang bị lỗi';
      state.failedChapters.forEach((item) => {
        const num = item.chapterNumber ?? item.id;
        const opt = document.createElement('option');
        opt.value = String(num);
        opt.textContent = `[Lỗi] Chương #${num}: ${item.title || 'Chưa rõ'}`;
        optGroupFailed.appendChild(opt);
      });
      cleanerTargetChapterSelect.appendChild(optGroupFailed);
    }

    // 2. Add chapters from novel metadata/TOC if present
    if (state.chapters && state.chapters.length > 0) {
      const optGroupAll = document.createElement('optgroup');
      optGroupAll.label = '📑 Danh sách chương truyện';
      state.chapters.forEach((ch) => {
        const num = ch.chapterNumber ?? ch.id;
        const isDownloaded = state.downloadedChapters.has(num);
        const opt = document.createElement('option');
        opt.value = String(num);
        opt.textContent = `${isDownloaded ? '✓' : '○'} Chương #${num}: ${ch.title || ''}`;
        optGroupAll.appendChild(opt);
      });
      cleanerTargetChapterSelect.appendChild(optGroupAll);
    }

    if (currentVal) {
      cleanerTargetChapterSelect.value = currentVal;
    } else if (state.cleanerTargetChapter) {
      const targetNum = state.cleanerTargetChapter.chapterNumber ?? state.cleanerTargetChapter.id;
      cleanerTargetChapterSelect.value = String(targetNum);
    }
  }

  function openCleanerForChapter(item) {
    if (!item) return;
    state.cleanerTargetChapter = item;
    const num = item.chapterNumber ?? item.id;

    if (cleanerTargetBanner && cleanerTargetText) {
      cleanerTargetText.textContent = `Đang cứu Chương #${num}: ${item.title || 'Chưa rõ'}`;
      cleanerTargetBanner.style.display = 'block';
    }

    updateCleanerChapterDropdown();
    if (cleanerTargetChapterSelect) {
      cleanerTargetChapterSelect.value = String(num);
    }

    // Switch tab
    if (typeof activateManagerTab === 'function') {
      activateManagerTab('cleaner', true);
    }

    if (cleanerInput) {
      cleanerInput.focus();
    }

    appendLog(`Đã chuyển sang tab Làm Sạch để cứu Chương #${num}. Hãy dán văn bản/HTML rồi bấm "Lưu vào chương".`, 'warning');
  }

  function runCleanProcess() {
    if (!cleanerInput) return;
    const rawVal = cleanerInput.value;
    if (!rawVal.trim()) {
      if (cleanerResultsBox) cleanerResultsBox.style.display = 'none';
      return;
    }

    const mode = document.querySelector('input[name="cleanerMode"]:checked')?.value || 'auto';
    const customRemovalsStr = cleanerCustomRemovals?.value?.trim() || '';
    const customRemovalsList = customRemovalsStr ? customRemovalsStr.split(',').map(s => s.trim()).filter(Boolean) : [];

    const options = {
      mode,
      stripStyles: cleanerOptStripStyles ? cleanerOptStripStyles.checked : true,
      removeMicroText: cleanerOptMicro ? cleanerOptMicro.checked : true,
      removeInvisible: cleanerOptInvisible ? cleanerOptInvisible.checked : true,
      removeJunkTags: cleanerOptStripJunk ? cleanerOptStripJunk.checked : true,
      cleanAttributes: cleanerOptCleanAttrs ? cleanerOptCleanAttrs.checked : true,
      normalizeParagraphs: cleanerOptAutoParagraphs ? cleanerOptAutoParagraphs.checked : true,
      selfCloseVoidTags: cleanerOptXhtml ? cleanerOptXhtml.checked : true,
      detectHeadings: cleanerOptHeadings ? cleanerOptHeadings.checked : true,
      detectQuotes: cleanerOptQuotes ? cleanerOptQuotes.checked : true,
      customRemovals: customRemovalsList,
      customWatermarks: customRemovalsList,
      emptyPlaceholder: '<p>pass</p>'
    };

    let result;
    if (typeof HtmlCleaner !== 'undefined') {
      result = HtmlCleaner.process(rawVal, options);
    } else {
      // Fallback
      let clean = BaseParser.cleanInvisibleAndCamouflageText(rawVal, customRemovalsList);
      clean = BaseParser.sanitizeHtml(clean);
      result = {
        success: true,
        detectedType: /<[a-z]/i.test(rawVal) ? 'html' : 'text',
        cleanHtml: clean,
        stats: {
          originalLength: rawVal.length,
          cleanedLength: clean.length,
          paragraphCount: (clean.match(/<p\b/gi) || []).length || 1,
          wordCount: clean.replace(/<[^>]*>/g, '').split(/\s+/).filter(Boolean).length,
          characterCount: clean.replace(/<[^>]*>/g, '').trim().length,
          removedItems: { tinyFonts: 0, invisibleElements: 0, scriptsAndStyles: 0, junkAttributes: 0, watermarks: 0 }
        }
      };
    }

    const { cleanHtml, stats } = result;

    if (cleanerOutputCode) cleanerOutputCode.value = cleanHtml;
    if (cleanerOutputPreview) cleanerOutputPreview.innerHTML = cleanHtml;

    if (cleanerStatParas) cleanerStatParas.textContent = `${stats.paragraphCount} đoạn`;
    if (cleanerStatWords) cleanerStatWords.textContent = `${stats.wordCount} từ`;
    if (cleanerStatChars) cleanerStatChars.textContent = `${stats.characterCount} ký tự`;

    const totalJunk = (stats.removedItems.tinyFonts || 0) +
      (stats.removedItems.invisibleElements || 0) +
      (stats.removedItems.scriptsAndStyles || 0) +
      (stats.removedItems.junkAttributes || 0) +
      (stats.removedItems.watermarks || 0);

    if (cleanerStatCleaned) {
      cleanerStatCleaned.textContent = `Đã dọn ${totalJunk} mục rác`;
      cleanerStatCleaned.className = totalJunk > 0 ? 'badge badge-warning' : 'badge badge-success';
    }

    if (cleanerResultsBox) cleanerResultsBox.style.display = 'flex';

    const statusBadge = document.getElementById('cleaner-status-badge');
    if (statusBadge) {
      statusBadge.textContent = 'Đã làm sạch';
      statusBadge.className = 'badge badge-success';
    }

    if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
      try { lucide.createIcons(); } catch (_) {}
    }
  }

  function initCleanerUI() {
    updateCleanerChapterDropdown();

    function setCleanerMode(mode) {
      [btnModeAuto, btnModeText, btnModeHtml].forEach(b => b?.classList.remove('active'));
      if (mode === 'auto') {
        btnModeAuto?.classList.add('active');
        if (cleanerModeAuto) cleanerModeAuto.checked = true;
      } else if (mode === 'text') {
        btnModeText?.classList.add('active');
        if (cleanerModeText) cleanerModeText.checked = true;
      } else if (mode === 'html') {
        btnModeHtml?.classList.add('active');
        if (cleanerModeHtml) cleanerModeHtml.checked = true;
      }
      if (cleanerInput?.value?.trim()) runCleanProcess();
    }

    btnModeAuto?.addEventListener('click', () => setCleanerMode('auto'));
    btnModeText?.addEventListener('click', () => setCleanerMode('text'));
    btnModeHtml?.addEventListener('click', () => setCleanerMode('html'));

    btnPresetEpub?.addEventListener('click', () => {
      btnPresetEpub.classList.add('active');
      btnPresetUltra?.classList.remove('active');
      if (cleanerOptMicro) cleanerOptMicro.checked = true;
      if (cleanerOptInvisible) cleanerOptInvisible.checked = true;
      if (cleanerOptStripStyles) cleanerOptStripStyles.checked = true;
      if (cleanerOptStripJunk) cleanerOptStripJunk.checked = true;
      if (cleanerOptCleanAttrs) cleanerOptCleanAttrs.checked = true;
      if (cleanerOptAutoParagraphs) cleanerOptAutoParagraphs.checked = true;
      if (cleanerOptXhtml) cleanerOptXhtml.checked = true;
      if (cleanerOptHeadings) cleanerOptHeadings.checked = true;
      if (cleanerOptQuotes) cleanerOptQuotes.checked = true;
      appendLog('Đã chọn cấu hình [Chuẩn EPUB] tối ưu cho máy đọc sách.');
      if (cleanerInput?.value?.trim()) runCleanProcess();
    });

    btnPresetUltra?.addEventListener('click', () => {
      btnPresetUltra.classList.add('active');
      btnPresetEpub?.classList.remove('active');
      if (cleanerOptMicro) cleanerOptMicro.checked = true;
      if (cleanerOptInvisible) cleanerOptInvisible.checked = true;
      if (cleanerOptStripStyles) cleanerOptStripStyles.checked = true;
      if (cleanerOptStripJunk) cleanerOptStripJunk.checked = true;
      if (cleanerOptCleanAttrs) cleanerOptCleanAttrs.checked = true;
      if (cleanerOptAutoParagraphs) cleanerOptAutoParagraphs.checked = true;
      if (cleanerOptXhtml) cleanerOptXhtml.checked = true;
      if (cleanerOptHeadings) cleanerOptHeadings.checked = true;
      if (cleanerOptQuotes) cleanerOptQuotes.checked = true;
      appendLog('Đã chọn cấu hình [Siêu sạch] (tẩy sạch toàn bộ style, inline tag, class rác).');
      if (cleanerInput?.value?.trim()) runCleanProcess();
    });

    btnToggleAdvanced?.addEventListener('click', () => {
      if (!cleanerAdvancedDrawer) return;
      const isHidden = cleanerAdvancedDrawer.style.display === 'none';
      cleanerAdvancedDrawer.style.display = isHidden ? 'block' : 'none';
      if (advancedToggleIcon) advancedToggleIcon.textContent = isHidden ? '▴' : '▾';
    });

    function setReaderTheme(theme) {
      [themeBtnWhite, themeBtnSepia, themeBtnDark].forEach(b => b?.classList.remove('active'));
      cleanerOutputPreview?.classList.remove('theme-white', 'theme-sepia', 'theme-dark');
      if (theme === 'white') {
        themeBtnWhite?.classList.add('active');
        cleanerOutputPreview?.classList.add('theme-white');
      } else if (theme === 'sepia') {
        themeBtnSepia?.classList.add('active');
        cleanerOutputPreview?.classList.add('theme-sepia');
      } else if (theme === 'dark') {
        themeBtnDark?.classList.add('active');
        cleanerOutputPreview?.classList.add('theme-dark');
      }
    }

    themeBtnWhite?.addEventListener('click', () => setReaderTheme('white'));
    themeBtnSepia?.addEventListener('click', () => setReaderTheme('sepia'));
    themeBtnDark?.addEventListener('click', () => setReaderTheme('dark'));

    cleanerInput?.addEventListener('input', () => {
      updateCleanerCharCount();
      if (cleanerAutoClean?.checked) {
        clearTimeout(state._cleanerDebounce);
        state._cleanerDebounce = setTimeout(runCleanProcess, 300);
      }
    });

    cleanerInput?.addEventListener('paste', () => {
      setTimeout(() => {
        updateCleanerCharCount();
        if (cleanerAutoClean?.checked) {
          runCleanProcess();
        }
      }, 50);
    });

    document.querySelectorAll('input[name="cleanerMode"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        if (cleanerInput?.value?.trim()) {
          runCleanProcess();
        }
      });
    });

    btnRunClean?.addEventListener('click', runCleanProcess);

    btnCancelTargetRescue?.addEventListener('click', () => {
      state.cleanerTargetChapter = null;
      if (cleanerTargetBanner) cleanerTargetBanner.style.display = 'none';
      if (cleanerTargetChapterSelect) cleanerTargetChapterSelect.value = '';
    });

    btnCleanerClear?.addEventListener('click', () => {
      if (cleanerInput) cleanerInput.value = '';
      if (cleanerOutputCode) cleanerOutputCode.value = '';
      if (cleanerOutputPreview) {
        cleanerOutputPreview.innerHTML = `
          <div style="text-align: center; padding: 40px 20px; color: inherit; opacity: 0.65;">
            <div style="font-size: 36px; margin-bottom: 12px;">📖</div>
            <h4 style="font-size: 16px; margin-bottom: 8px;">Khu Vực Xem Trước Trang Đọc Sách</h4>
            <p style="text-indent: 0; text-align: center; font-size: 14px; margin-bottom: 6px;">
              Dán văn bản hoặc bấm <strong>"Mẫu Text"</strong> / <strong>"Mẫu HTML lỗi"</strong> bên trái để xem kết quả trực quan tại đây.
            </p>
            <span style="font-size: 12px; opacity: 0.8;">Hỗ trợ chuẩn hóa ngắt đoạn &lt;p&gt;, gạch đầu dòng đối thoại, tiêu đề chương và tẩy sạch bẫy chống cào.</span>
          </div>`;
      }
      if (cleanerStatParas) cleanerStatParas.textContent = '0 đoạn';
      if (cleanerStatWords) cleanerStatWords.textContent = '0 từ';
      if (cleanerStatChars) cleanerStatChars.textContent = '0 ký tự';
      if (cleanerStatCleaned) {
        cleanerStatCleaned.textContent = 'Đã dọn 0 mục rác';
        cleanerStatCleaned.className = 'badge badge-warning';
      }
      updateCleanerCharCount();
      const statusBadge = document.getElementById('cleaner-status-badge');
      if (statusBadge) {
        statusBadge.textContent = 'Sẵn sàng';
        statusBadge.className = 'badge badge-neutral';
      }
    });

    btnCleanerPaste?.addEventListener('click', async () => {
      if (navigator.clipboard && navigator.clipboard.readText) {
        try {
          const clipText = await navigator.clipboard.readText();
          if (clipText && cleanerInput) {
            cleanerInput.value = clipText;
            updateCleanerCharCount();
            if (cleanerAutoClean?.checked) runCleanProcess();
            appendLog('Đã dán nội dung từ clipboard vào công cụ làm sạch.');
            return;
          }
        } catch (_) {}
      }
      cleanerInput?.focus();
      appendLog('Hãy nhấn Ctrl+V để dán nội dung vào ô nhập.');
    });

    btnCleanerSampleText?.addEventListener('click', () => {
      if (!cleanerInput) return;
      cleanerInput.value = `Chương 1: Khởi Đầu Mới

Trời vừa rạng sáng, Lâm Phong đã thức dậy từ trên giường gỗ. Hắn mở cửa sổ, đón nhận từng luồng gió sớm trong lành thổi vào khuôn mặt.
Cảnh sắc Thanh Vân Trấn hiện ra mờ ảo dưới làn sương sớm mai, từng tiếng chim hót líu lo rộn rã.

- Ngươi đã chuẩn bị sẵn sàng cho chuyến đi lên tông môn chưa? - Một giọng nói trầm ấm từ sau lưng vang lên.
Lâm Phong quay đầu lại, nhìn thấy phụ thân đang đứng tựa cửa mỉm cười.

"Con đã sẵn sàng từ lâu rồi," Lâm Phong tự tin gật đầu đáp.`;
      if (cleanerModeAuto) cleanerModeAuto.checked = true;
      updateCleanerCharCount();
      runCleanProcess();
      appendLog('Đã nạp văn bản thô mẫu (Text thô) để thử nghiệm.');
    });

    btnCleanerSampleDirty?.addEventListener('click', () => {
      if (!cleanerInput) return;
      cleanerInput.value = `<div class="chapter-content" style="font-family: Arial, sans-serif; font-size: 16px; line-height: 28px; color: rgb(51, 51, 51); background-color: rgb(255, 255, 255);">
  <script>console.log("ads tracking");</script>
  <style>.ads-banner { color: red; }</style>
  <p style="margin: 0px 0px 15px; font-size: 15px;">
    Lâm Phong vung trường kiếm lên, một đạo kiếm quang rực rỡ xé toang hư không.
    <span style="font-size: 0px;">chữ chống cào bẫy 1</span>
    <span style="font-size: 1px">từ rác li ti</span>
    <span style="font-size: 0.1em">từ rác em</span>
    <font size="1">font size 1 rác</font>
    <span style="color: #ffffff">chữ trắng ẩn ngụy trang</span>
    <span style="color: white">chữ trắng 2</span>
    <span style="display: none">display none trap</span>
    <span style="visibility: hidden">hidden trap</span>
    <span style="opacity: 0">opacity 0 trap</span>
  </p>
  <div class="watermark" style="position: absolute; left: -9999px;">Trang web bản quyền giả mạo</div>
  <p onclick="alert('click')">
    Đối phương lùi lại ba bước, ánh mắt tràn đầy sự <b>kinh hãi</b> và <i>bất khả tư nghị</i> trước <u>uy lực</u> của kiếm pháp.
  </p>
  <iframe src="https://ads.example.com"></iframe>
  <form><input type="hidden" value="track"/></form>
  <br><br>
  <font color="#ffffff">chữ trắng cuối trang</font>
</div>`;
      if (cleanerModeAuto) cleanerModeAuto.checked = true;
      updateCleanerCharCount();
      runCleanProcess();
      appendLog('Đã nạp mã HTML lỗi mẫu (có chữ nhỏ li ti, bẫy rác, màu trắng, ads).');
    });

    cleanerFileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (cleanerInput && evt.target?.result) {
          cleanerInput.value = evt.target.result;
          updateCleanerCharCount();
          if (cleanerAutoClean?.checked) runCleanProcess();
          appendLog(`Đã nạp nội dung từ file "${file.name}" (${file.size} bytes).`, 'success');
        }
      };
      reader.readAsText(file, 'utf-8');
      cleanerFileInput.value = '';
    });

    const copyCleanSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    btnCopyCleanHtml?.addEventListener('click', async () => {
      const code = cleanerOutputCode?.value || '';
      if (!code) return;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(code);
        } else if (cleanerOutputCode) {
          cleanerOutputCode.select();
          document.execCommand('copy');
        }
        btnCopyCleanHtml.innerHTML = '<i data-lucide="check"></i> Đã sao chép!';
        if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
          lucide.createIcons();
        }
        setTimeout(() => {
          btnCopyCleanHtml.innerHTML = `${copyCleanSvg} Sao chép HTML sạch`;
        }, 2000);
      } catch (err) {
        appendLog('Không thể sao chép tự động: ' + err.message, 'warning');
      }
    });

    btnDownloadCleanHtml?.addEventListener('click', () => {
      const code = cleanerOutputCode?.value || '';
      if (!code) return;
      const blob = new Blob([code], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'chuong-sach-sach-se.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      appendLog('Đã tải xuống file chuong-sach-sach-se.html');
    });

    btnViewCode?.addEventListener('click', () => {
      btnViewCode.classList.add('active');
      btnViewPreview?.classList.remove('active');
      if (cleanerCodeViewContainer) cleanerCodeViewContainer.style.display = 'block';
      if (cleanerPreviewViewContainer) cleanerPreviewViewContainer.style.display = 'none';
    });

    btnViewPreview?.addEventListener('click', () => {
      btnViewPreview.classList.add('active');
      btnViewCode?.classList.remove('active');
      if (cleanerCodeViewContainer) cleanerCodeViewContainer.style.display = 'none';
      if (cleanerPreviewViewContainer) cleanerPreviewViewContainer.style.display = 'block';
    });

    btnSaveAsChapter?.addEventListener('click', async () => {
      const cleanHtml = cleanerOutputCode?.value?.trim() || '';
      if (!cleanHtml) {
        appendLog('Chưa có nội dung sạch. Hãy dán text/HTML và làm sạch trước.', 'warning');
        return;
      }

      // Determine next chapter number
      let maxNum = 0;
      for (const k of state.downloadedChapters.keys()) {
        const n = Number(k);
        if (!isNaN(n) && n > maxNum) maxNum = n;
      }
      if (state.chapters && state.chapters.length > maxNum) {
        maxNum = state.chapters.length;
      }
      const newNum = maxNum + 1;

      // Detect title from first heading or default
      const headingMatch = cleanHtml.match(/<h[1-6]\b[^>]*>(.*?)<\/h[1-6]>/i);
      const title = headingMatch ? headingMatch[1].replace(/<[^>]*>/g, '').trim() : `Chương ${newNum}`;

      const chapterObj = {
        id: `manual-ch-${newNum}`,
        chapterNumber: newNum,
        title: title,
        contentHtml: cleanHtml,
        manuallyAdded: true
      };

      state.downloadedChapters.set(newNum, chapterObj);

      // Add to state.chapters if not present
      if (!state.chapters) state.chapters = [];
      if (!state.chapters.some(ch => ch.chapterNumber === newNum)) {
        state.chapters.push({
          id: chapterObj.id,
          chapterNumber: newNum,
          title: title,
          url: '',
          selected: true
        });
      }

      if (!state.novelMetadata) {
        state.novelMetadata = {
          title: novelTitleInput?.value?.trim() || 'Truyện Nhập Thủ Công',
          author: novelAuthorInput?.value?.trim() || 'Tác giả',
          description: novelDescInput?.value?.trim() || 'Bộ truyện được tổng hợp và làm sạch bằng VTPATE.'
        };
      }

      showDownloadedChapters();
      renderChapterList();
      updateCleanerChapterDropdown();
      if (btnExport) btnExport.disabled = false;
      await persistCrawlCheckpoint('ready');

      appendLog(`Đã thêm thành công Chương #${newNum} ("${title}") vào truyện!`, 'success');
      alert(`Đã thêm Chương #${newNum} ("${title}") vào dữ liệu truyện thành công! Bạn có thể xuất EPUB bất cứ lúc nào.`);
    });

    btnPatchTargetChapter?.addEventListener('click', async () => {
      const cleanHtml = cleanerOutputCode?.value?.trim() || '';
      if (!cleanHtml) {
        appendLog('Chưa có nội dung sạch. Hãy dán text/HTML và làm sạch trước.', 'warning');
        return;
      }

      const selectedVal = cleanerTargetChapterSelect?.value;
      if (!selectedVal) {
        alert('Vui lòng chọn chương bạn muốn gán nội dung vào (từ danh sách thả xuống).');
        return;
      }

      const targetNum = Number(selectedVal) || selectedVal;

      // Find chapter title
      let chTitle = `Chương ${targetNum}`;
      const foundInFailed = state.failedChapters.find(f => (f.chapterNumber ?? f.id) == targetNum);
      const foundInChapters = (state.chapters || []).find(c => (c.chapterNumber ?? c.id) == targetNum);
      if (foundInFailed && foundInFailed.title) chTitle = foundInFailed.title;
      else if (foundInChapters && foundInChapters.title) chTitle = foundInChapters.title;

      const chapterObj = {
        id: `repaired-ch-${targetNum}`,
        chapterNumber: targetNum,
        title: chTitle,
        contentHtml: cleanHtml,
        manuallyRepaired: true
      };

      state.downloadedChapters.set(targetNum, chapterObj);

      // Remove from failed chapters
      state.failedChapters = state.failedChapters.filter(f => (f.chapterNumber ?? f.id) != targetNum);

      // Clear target banner if matched
      if (state.cleanerTargetChapter && (state.cleanerTargetChapter.chapterNumber ?? state.cleanerTargetChapter.id) == targetNum) {
        state.cleanerTargetChapter = null;
        if (cleanerTargetBanner) cleanerTargetBanner.style.display = 'none';
      }

      renderFailedTable();
      showDownloadedChapters();
      updateCleanerChapterDropdown();
      if (btnExport) btnExport.disabled = false;
      await persistCrawlCheckpoint(state.isPaused ? 'paused' : 'ready');

      appendLog(`Cứu chương thành công: Đã lưu nội dung sạch vào Chương #${targetNum} và xóa khỏi danh sách lỗi!`, 'success');
      alert(`Đã cứu Chương #${targetNum} thành công! Chương đã được xóa khỏi danh sách lỗi và đưa vào sách.`);
    });
  }

  // Initialize Cleaner UI
  initCleanerUI();

  // Initialize Offline Temporary Library
  try {
    await renderLibraryNovels();
  } catch (_) {}

  // Start live timer interval for countdown display (wait timer and ETA)
  startLiveCountdown();

  // Restore complete local snapshots before contacting the novel site.
  const urlParams = new URLSearchParams(window.location.search);
  const paramUrl = urlParams.get('url');
  try {
    const saved = await state.sessionManager?.getCheckpoint();
    if (saved?.schemaVersion === 2 && (!paramUrl || paramUrl === saved.novelUrl)) {
      await applySavedCheckpoint(saved);
    } else if (paramUrl && inputNovelUrl) {
      inputNovelUrl.value = paramUrl;
      detectParser(paramUrl);
      await fetchNovelMetadata();
    } else if (saved) {
      setSaveStatus('Có điểm dừng từ bản cũ. Bấm Khôi phục điểm dừng để nạp lại.');
      appendLog('Tìm thấy điểm dừng từ bản cũ; mở mục Chương đã tải và lưu trữ để khôi phục.');
    }
  } catch (error) {
    appendLog('Chưa khôi phục được phiên đã lưu: ' + error.message + '. Dữ liệu đã lưu chưa bị xóa.', 'error');
  }

  // Ping background service worker
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
      const statusResp = await chrome.runtime.sendMessage({ action: 'GET_STATUS' });
      if (statusResp && statusResp.success) {
        appendLog(`Kết nối Service Worker thành công (Version: ${statusResp.version}).`);
      }
    }
  } catch (swErr) {
    if (serviceWorkerStatus) {
      serviceWorkerStatus.className = 'badge badge-neutral';
      serviceWorkerStatus.textContent = 'Service Worker Ngoại tuyến';
    }
  }
});
