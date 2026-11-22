// src/storage/profile-manager.js
// Per-Domain Crawl Configuration Storage in chrome.storage.local
// Multi-page Pagination & Pre-configured Domain Profiles

class ProfileManager {
  constructor(options = {}) {
    this.keyPrefix = options.keyPrefix || 'profile_';
  }

  getDefaultProfile(domain = '') {
    const cleanDomain = this._normalizeDomain(domain);

    const base = {
      concurrency: 3,
      delayMs: 500,
      jitter: true,
      mode: 'fetch',
      customHeaders: {},
      // Human simulation timing (như bản Python)
      readingWpm: 650,
      enableWpmDelay: true,
      maxWaitSeconds: 30,
      interChapterDelaySeconds: 3,
      recheckWaitSeconds: 10,
      periodicBreakInterval: 10,
      periodicBreakSeconds: 5,
      pageLoadWaitMs: 2000,
      visibleTab: true,
      useTabForToc: false,
      autoPauseOnSleep: true,
      sleepThresholdMinutes: 5,
      maxConsecutiveErrors: 3,
      // Phân trang mục lục đa trang
      paginationType: 'auto', // 'auto' | 'url_pattern' | 'next_button' | 'none'
      paginationPattern: '',  // e.g. 'trang-{page}/' hoặc '?page={page}'
      nextPageSelector: '',   // e.g. '.pagination .next a, a.next, //button[contains(text(), "Sau")]'
      maxPaginationPages: 50,
      // Tùy chỉnh CSS Selectors thủ công
      customSelectors: {
        storyTitle: '',
        author: '',
        cover: '',
        description: '',
        chapterList: '',
        chapterTitle: '',
        chapterContent: '',
        classesToRemove: '',
        nextChapterBtn: ''
      },
      // Xử lý nội dung rác, định dạng ẩn & bẫy chống cào
      cleanInvisibleText: true,
      autoFillPlaceholders: true,
      autoSkipErrors: true,
      emptyChapterPlaceholder: '<p>pass</p>',
      customRemovalsList: [],
      // Custom Font cho HTML mã hoá (Font chữ lạ)
      customFont: {
        enabled: false,
        name: 'NovelCustomFont',
        filename: '',
        dataBase64: '',
        mimeType: 'font/woff2'
      },
      // Thông tin đăng nhập domain
      account: {
        loginUrl: '',
        email: '',
        password: '',
        autoLogin: false
      }
    };

    if (cleanDomain.includes('giatocvuongtai.com')) {
      base.mode = 'tab';
      base.visibleTab = true;
      base.useTabForToc = true;
      base.pageLoadWaitMs = 2500;
      base.maxWaitSeconds = 30;
      base.interChapterDelaySeconds = 3;
      base.recheckWaitSeconds = 10;
      base.paginationType = 'next_button';
      base.nextPageSelector = '//button[contains(text(), "Sau")], .btn-next';
      base.customSelectors.storyTitle = 'h1.detail-hero-title, h1.story-title, h1';
      base.customSelectors.author = '.detail-byline__item strong, .detail-byline__item, .detail-stat-card--author a, a[href*="/tac-gia/"], .author';
      base.customSelectors.cover = '.detail-hero-cover img, .book-thumb img, .cover img';
      base.customSelectors.description = '.detail-synopsis-content, .desc-text';
      base.customSelectors.chapterList = '.chapter-list-item--link, .chapter-list-item a, .chapter-item a, .chapter-list a';
      base.customSelectors.chapterTitle = 'h2.reader-demo-chapter-heading, h2.chapter-title, h1';
      base.customSelectors.chapterContent = 'div.reader-demo-body, #chapter-content';
      base.customSelectors.nextChapterBtn = 'button.reader-demo-footer-btn--next, [aria-label="Chương sau"], .reader-demo-footer-btn--next';
      base.account.loginUrl = 'https://giatocvuongtai.com/register';
      base.account.email = 'thanhsacvuduc123@gmail.com';
      base.account.password = 'Thaor0345333661.';
      base.account.autoLogin = true;
    } else if (cleanDomain.includes('truyenfull')) {
      base.mode = 'fetch';
      base.concurrency = 4;
      base.delayMs = 400;
      base.paginationType = 'url_pattern';
      base.paginationPattern = 'trang-{page}/';
      base.nextPageSelector = '.pagination .next a, a.next';
      base.maxPaginationPages = 100;
      base.customSelectors.storyTitle = 'h1.title, h1.story-title';
      base.customSelectors.author = '.author a, .author';
      base.customSelectors.cover = '.books img, .book-info img, meta[property="og:image"]';
      base.customSelectors.description = '.desc-text';
      base.customSelectors.chapterList = '.list-chapter a, #list-chapter a';
      base.customSelectors.chapterTitle = 'h2.chapter-title, h1';
      base.customSelectors.chapterContent = '.chapter-c, #chapter-content';
    }

    return base;
  }

  _normalizeDomain(domain) {
    if (!domain || typeof domain !== 'string') {
      return 'default';
    }
    let clean = domain.trim().toLowerCase();
    try {
      if (clean.includes('://')) {
        clean = new URL(clean).hostname;
      }
    } catch {
      clean = clean.replace(/^[a-z]+:\/\//i, '');
    }
    clean = clean.replace(/:\d+$/, '').replace(/^\/+|\/+$/g, '');
    return clean || 'default';
  }

  _getStorageKey(cleanDomain) {
    return `${this.keyPrefix}${cleanDomain}`;
  }

  _sanitizeProfile(rawProfile, baseDefaults = null) {
    const defaults = baseDefaults || this.getDefaultProfile();
    const source = (rawProfile && typeof rawProfile === 'object') ? rawProfile : {};
    const merged = { ...defaults, ...source };

    let concurrency = Number(merged.concurrency);
    if (isNaN(concurrency)) {
      concurrency = defaults.concurrency;
    }
    concurrency = Math.max(1, Math.min(10, Math.round(concurrency)));

    let delayMs = Number(merged.delayMs);
    if (isNaN(delayMs)) {
      delayMs = defaults.delayMs;
    }
    delayMs = Math.max(0, Math.min(5000, Math.round(delayMs)));

    const jitter = merged.jitter !== false;
    const mode = (merged.mode === 'tab') ? 'tab' : 'fetch';
    const customHeaders = (merged.customHeaders && typeof merged.customHeaders === 'object')
      ? { ...merged.customHeaders }
      : {};

    const readingWpm = Math.max(100, Math.min(2000, Number(merged.readingWpm) || 650));
    const enableWpmDelay = merged.enableWpmDelay !== false;
    const periodicBreakInterval = Math.max(0, Math.min(100, Number(merged.periodicBreakInterval) || 10));
    const periodicBreakSeconds = Math.max(0, Math.min(60, Number(merged.periodicBreakSeconds) || 5));
    const pageLoadWaitMs = Math.max(500, Math.min(15000, Number(merged.pageLoadWaitMs) || 2000));
    const useTabForToc = Boolean(merged.useTabForToc);

    const paginationType = (merged.paginationType || defaults.paginationType || 'auto').trim().toLowerCase();
    const paginationPattern = (merged.paginationPattern !== undefined ? merged.paginationPattern : defaults.paginationPattern || '').trim();
    const nextPageSelector = (merged.nextPageSelector !== undefined ? merged.nextPageSelector : defaults.nextPageSelector || '').trim();
    const maxPaginationPages = Math.max(1, Math.min(500, Number(merged.maxPaginationPages) || defaults.maxPaginationPages || 50));

    const customSelectors = (merged.customSelectors && typeof merged.customSelectors === 'object')
      ? { ...defaults.customSelectors, ...merged.customSelectors }
      : { ...defaults.customSelectors };

    const account = (merged.account && typeof merged.account === 'object')
      ? { ...defaults.account, ...merged.account }
      : { ...defaults.account };

    return {
      concurrency,
      delayMs,
      jitter,
      mode,
      customHeaders,
      readingWpm,
      enableWpmDelay,
      periodicBreakInterval,
      periodicBreakSeconds,
      pageLoadWaitMs,
      useTabForToc,
      autoPauseOnSleep: merged.autoPauseOnSleep !== false,
      sleepThresholdMinutes: (merged.sleepThresholdMinutes !== undefined) ? Math.max(0, Math.min(60, Number(merged.sleepThresholdMinutes))) : 5,
      maxConsecutiveErrors: (merged.maxConsecutiveErrors !== undefined) ? Math.max(0, Math.min(50, Number(merged.maxConsecutiveErrors))) : 3,
      paginationType,
      paginationPattern,
      nextPageSelector,
      maxPaginationPages,
      customSelectors,
      account
    };
  }

  async getProfile(domain) {
    return this.getProfileForDomain(domain);
  }

  async getProfileForDomain(domain) {
    const defaults = this.getDefaultProfile(domain);
    if (!domain) {
      return defaults;
    }

    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      return defaults;
    }

    const cleanDomain = this._normalizeDomain(domain);
    const storageKey = this._getStorageKey(cleanDomain);

    const lookupKeys = [storageKey, cleanDomain, domain];
    const stored = await chrome.storage.local.get(lookupKeys);

    const rawData = stored[storageKey] || stored[cleanDomain] || stored[domain];
    if (!rawData) {
      return defaults;
    }

    return this._sanitizeProfile(rawData, defaults);
  }

  async saveProfile(domain, profileData) {
    if (!domain) {
      throw new Error('Valid domain is required to save profile');
    }

    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      throw new Error('Chrome storage local API is not available');
    }

    const cleanDomain = this._normalizeDomain(domain);
    const storageKey = this._getStorageKey(cleanDomain);

    const sanitized = this._sanitizeProfile(profileData, this.getDefaultProfile(cleanDomain));

    await chrome.storage.local.set({
      [storageKey]: sanitized
    });

    return sanitized;
  }

  async deleteProfile(domain) {
    if (!domain) {
      return;
    }

    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      return;
    }

    const cleanDomain = this._normalizeDomain(domain);
    const storageKey = this._getStorageKey(cleanDomain);

    await chrome.storage.local.remove([storageKey, cleanDomain, domain]);
  }

  async listProfiles() {
    const defaults = this.getDefaultProfile();
    const profiles = {};

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const allData = await chrome.storage.local.get(null);
      const prefix = this.keyPrefix;

      for (const [key, value] of Object.entries(allData || {})) {
        if (key.startsWith(prefix)) {
          const domain = key.substring(prefix.length);
          profiles[domain] = this._sanitizeProfile(value, this.getDefaultProfile(domain));
        }
      }
    }

    // Default pre-seeded presets if storage is empty
    if (Object.keys(profiles).length === 0) {
      profiles['giatocvuongtai.com'] = this.getDefaultProfile('giatocvuongtai.com');
      profiles['truyenfull.vn'] = this.getDefaultProfile('truyenfull.vn');
    }

    return profiles;
  }

  async getAllProfiles() {
    return this.listProfiles();
  }

  async exportProfiles() {
    const profiles = await this.listProfiles();
    return JSON.stringify({
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      profiles
    }, null, 2);
  }

  async importProfiles(jsonStringOrObject) {
    let parsed = jsonStringOrObject;
    if (typeof jsonStringOrObject === 'string') {
      try {
        parsed = JSON.parse(jsonStringOrObject);
      } catch (err) {
        throw new Error('Dữ liệu JSON không hợp lệ: ' + err.message);
      }
    }

    const profiles = parsed.profiles || parsed;
    if (!profiles || typeof profiles !== 'object') {
      throw new Error('Không tìm thấy danh sách profile trong file JSON');
    }

    let count = 0;
    for (const [domain, profileData] of Object.entries(profiles)) {
      if (domain && typeof profileData === 'object') {
        await this.saveProfile(domain, profileData);
        count++;
      }
    }
    return count;
  }
}

// UMD / CommonJS / Global export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ProfileManager };
}
if (typeof window !== 'undefined') {
  window.ProfileManager = ProfileManager;
}
if (typeof globalThis !== 'undefined') {
  globalThis.ProfileManager = ProfileManager;
}
