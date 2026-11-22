// src/storage/session-manager.js
// Persistent Crawl Session & Checkpoint Manager in chrome.storage.local

class SessionManager {
  /**
   * @param {string} [storageKey='vtpate_crawl_session'] - Local storage key for session checkpoints
   */
  constructor(storageKey = 'vtpate_crawl_session') {
    this.storageKey = storageKey || 'vtpate_crawl_session';
    this._memoryFallback = new Map();
  }

  /**
   * Check if chrome.storage.local is available in current environment
   * @returns {boolean}
   */
  _hasChromeStorage() {
    try {
      return (
        typeof chrome !== 'undefined' &&
        Boolean(chrome?.storage?.local) &&
        typeof chrome.storage.local.get === 'function' &&
        typeof chrome.storage.local.set === 'function'
      );
    } catch {
      return false;
    }
  }

  /**
   * Persist crawl checkpoint state to storage
   * @param {object} checkpointData - State object (novelUrl, completedIndices, pendingIndices, status, etc.)
   * @returns {Promise<boolean>}
   */
  async saveCheckpoint(checkpointData) {
    if (!checkpointData || typeof checkpointData !== 'object') {
      return false;
    }

    const payload = {
      ...JSON.parse(JSON.stringify(checkpointData)),
      updatedAt: Date.now()
    };

    if (this._hasChromeStorage()) {
      try {
        await chrome.storage.local.set({
          [this.storageKey]: payload
        });
        return true;
      } catch (err) {
        console.warn('[SessionManager] Failed to write to chrome.storage.local, using memory fallback:', err);
        this._memoryFallback.set(this.storageKey, payload);
        return false;
      }
    } else {
      this._memoryFallback.set(this.storageKey, payload);
      // RAM is not a successful durable save.
      return false;
    }
  }

  static validateBackup(value) {
    if (value?.format !== 'vtpate-progress' || value.version !== 1) {
      throw new Error('Tệp không phải bản sao tiến trình VTPATE được hỗ trợ.');
    }
    const data = value.checkpoint;
    const validUrl = url => {
      try { return ['http:', 'https:'].includes(new URL(url).protocol); } catch { return false; }
    };
    if (data?.schemaVersion !== 2 || !validUrl(data.novelUrl) ||
        !Array.isArray(data.chapters) || !data.chapters.length ||
        !Array.isArray(data.downloadedChapters) || !Array.isArray(data.pendingIndices) ||
        !data.metadata || typeof data.metadata.title !== 'string') {
      throw new Error('Tệp tiến trình thiếu thông tin truyện, mục lục hoặc nội dung đã lưu.');
    }
    const numbers = new Set();
    for (const ch of data.chapters) {
      if (!Number.isFinite(ch.chapterNumber) || numbers.has(ch.chapterNumber) || !validUrl(ch.url) || typeof ch.title !== 'string') {
        throw new Error('Mục lục trong tệp tiến trình không hợp lệ hoặc bị trùng chương.');
      }
      numbers.add(ch.chapterNumber);
    }
    const saved = new Set();
    for (const ch of data.downloadedChapters) {
      if (!numbers.has(ch.chapterNumber) || saved.has(ch.chapterNumber) || typeof ch.contentHtml !== 'string') {
        throw new Error('Nội dung chương trong tệp tiến trình không hợp lệ.');
      }
      saved.add(ch.chapterNumber);
    }
    if (data.pendingIndices.some(number => !numbers.has(number))) {
      throw new Error('Danh sách chương chờ không khớp mục lục.');
    }
    return JSON.parse(JSON.stringify(data));
  }

  /**
   * Retrieve active crawl checkpoint state
   * @returns {Promise<object|null>}
   */
  async getCheckpoint() {
    if (this._hasChromeStorage()) {
      try {
        const stored = await chrome.storage.local.get([this.storageKey]);
        const data = stored ? stored[this.storageKey] : null;
        if (!data) {
          return null;
        }
        if (typeof data === 'string') {
          try {
            return JSON.parse(data);
          } catch {
            return null;
          }
        }
        return (typeof data === 'object') ? data : null;
      } catch (err) {
        console.warn('[SessionManager] Failed to read from chrome.storage.local:', err);
        return this._memoryFallback.get(this.storageKey) || null;
      }
    } else {
      return this._memoryFallback.get(this.storageKey) || null;
    }
  }

  /**
   * Clear active crawl checkpoint from storage
   * @returns {Promise<boolean>}
   */
  async clearCheckpoint() {
    this._memoryFallback.delete(this.storageKey);

    if (this._hasChromeStorage()) {
      try {
        await chrome.storage.local.remove([this.storageKey]);
        return true;
      } catch (err) {
        console.warn('[SessionManager] Failed to clear from chrome.storage.local:', err);
        return false;
      }
    }
    return true;
  }
}

// CommonJS and browser / VM context export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SessionManager };
}
if (typeof window !== 'undefined') {
  window.SessionManager = SessionManager;
}
if (typeof globalThis !== 'undefined') {
  globalThis.SessionManager = SessionManager;
}
if (typeof global !== 'undefined') {
  global.SessionManager = SessionManager;
}
