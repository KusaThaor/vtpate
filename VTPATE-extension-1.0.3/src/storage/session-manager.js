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

  _openIDB() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open('vtpate_storage_db', 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('checkpoints')) {
            db.createObjectStore('checkpoints');
          }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  async _saveIDB(key, val) {
    const db = await this._openIDB();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('checkpoints', 'readwrite');
        const store = tx.objectStore('checkpoints');
        store.put(val, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) {
        resolve(false);
      }
    });
  }

  async _getIDB(key) {
    const db = await this._openIDB();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('checkpoints', 'readonly');
        const store = tx.objectStore('checkpoints');
        const req = store.get(key);
        req.onsuccess = (e) => resolve(e.target.result || null);
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
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

    let serialized = null;
    try {
      serialized = JSON.parse(JSON.stringify(checkpointData, (key, value) => {
        // Prevent binary buffer objects from being turned into broken empty objects {}
        if (value && typeof value === 'object') {
          if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) return undefined;
          if (typeof Uint8Array !== 'undefined' && value instanceof Uint8Array) return undefined;
          if (typeof Blob !== 'undefined' && value instanceof Blob) return undefined;
        }
        return value;
      }));
    } catch (_) {
      serialized = { ...checkpointData };
    }

    const payload = {
      ...serialized,
      updatedAt: Date.now()
    };

    let chromeSaved = false;
    if (this._hasChromeStorage()) {
      try {
        await chrome.storage.local.set({
          [this.storageKey]: payload
        });
        chromeSaved = true;
      } catch (err) {
        console.warn('[SessionManager] chrome.storage.local quota exceeded, saving lightweight metadata and using IndexedDB:', err.message);
        // If quota exceeded, wipe oversized previous key and save lightweight metadata to chrome.storage
        try {
          await chrome.storage.local.remove([this.storageKey]);
          const lightPayload = {
            ...payload,
            downloadedChapters: Array.isArray(payload.downloadedChapters)
              ? payload.downloadedChapters.map(ch => ({
                  id: ch.id,
                  chapterNumber: ch.chapterNumber,
                  title: ch.title,
                  url: ch.url
                }))
              : []
          };
          await chrome.storage.local.set({ [this.storageKey]: lightPayload });
          chromeSaved = true;
        } catch (_) {}
      }
    }

    let idbSaved = false;
    try {
      idbSaved = await this._saveIDB(this.storageKey, payload);
    } catch (_) {}

    this._memoryFallback.set(this.storageKey, payload);

    return Boolean(chromeSaved || idbSaved || this._memoryFallback.has(this.storageKey));
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
    let idbData = null;
    try {
      idbData = await this._getIDB(this.storageKey);
    } catch (_) {}

    let data = null;
    if (this._hasChromeStorage()) {
      try {
        const stored = await chrome.storage.local.get([this.storageKey]);
        data = stored ? stored[this.storageKey] : null;
      } catch (err) {
        console.warn('[SessionManager] Failed to read from chrome.storage.local:', err);
      }
    }

    if (!data) data = idbData;
    if (!data) data = this._memoryFallback.get(this.storageKey) || null;

    if (!data) return null;

    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        return null;
      }
    }

    if (typeof data !== 'object') return null;

    // Merge contentHtml from IndexedDB if chrome.storage.local was stripped to lightweight
    if (idbData && idbData !== data && Array.isArray(idbData.downloadedChapters) && Array.isArray(data.downloadedChapters)) {
      const idbMap = new Map(idbData.downloadedChapters.map(ch => [ch.chapterNumber, ch]));
      data.downloadedChapters.forEach(ch => {
        if (!ch.contentHtml && idbMap.has(ch.chapterNumber)) {
          ch.contentHtml = idbMap.get(ch.chapterNumber).contentHtml;
        }
      });
    }

    return data;
  }

  /**
   * Clear active crawl checkpoint from storage
   * @returns {Promise<boolean>}
   */
  async clearCheckpoint() {
    this._memoryFallback.delete(this.storageKey);

    let ok = false;
    if (this._hasChromeStorage()) {
      try {
        await chrome.storage.local.remove([this.storageKey]);
        ok = true;
      } catch (err) {
        console.warn('[SessionManager] Failed to clear from chrome.storage.local:', err);
      }
    }

    try {
      const db = await this._openIDB();
      if (db) {
        const tx = db.transaction('checkpoints', 'readwrite');
        tx.objectStore('checkpoints').delete(this.storageKey);
        ok = true;
      }
    } catch (_) {}

    return ok || true;
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
