// src/crawler/fetch-downloader.js
// Mode 1: High-throughput Parallel Fetch Downloader with Jitter & Auto-Retry

class FetchDownloader {
  constructor(options = {}) {
    const rawConcurrency = options.concurrency !== undefined ? Number(options.concurrency) : 3;
    this.concurrency = Math.max(1, Math.min(10, isNaN(rawConcurrency) ? 3 : Math.round(rawConcurrency)));

    const rawDelay = options.delayMs !== undefined ? Number(options.delayMs) : 0;
    this.delayMs = Math.max(0, isNaN(rawDelay) ? 0 : Math.round(rawDelay));

    this.jitter = options.jitter !== false;
    this.maxRetries = options.maxRetries !== undefined ? Math.max(0, Number(options.maxRetries)) : 3;
    this.baseBackoffMs = options.baseBackoffMs !== undefined ? Math.max(1, Number(options.baseBackoffMs)) : 500;
    this.timeoutMs = options.timeoutMs !== undefined ? Math.max(1000, Number(options.timeoutMs)) : 30000;
    this.headers = options.headers && typeof options.headers === 'object' ? { ...options.headers } : {};

    this._activeCount = 0;
    this._queue = [];
    this._isDraining = false;
  }

  calculateDelay(baseDelay) {
    const delay = baseDelay !== undefined ? Number(baseDelay) : this.delayMs;
    if (isNaN(delay) || delay <= 0) {
      return 0;
    }
    if (!this.jitter) {
      return Math.round(delay);
    }
    const jitterPct = 0.3;
    const min = Math.max(0, Math.floor(delay * (1 - jitterPct)));
    const max = Math.floor(delay * (1 + jitterPct));
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  async initialize() {
    this._isDraining = false;
    return Promise.resolve();
  }

  _acquireSlot() {
    if (this._activeCount < this.concurrency) {
      this._activeCount++;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this._queue.push(resolve);
    });
  }

  _releaseSlot() {
    if (this._queue.length > 0) {
      const nextResolve = this._queue.shift();
      nextResolve();
    } else {
      this._activeCount = Math.max(0, this._activeCount - 1);
    }
  }

  _computeBackoff(attemptNumber) {
    const exponential = this.baseBackoffMs * Math.pow(2, attemptNumber - 1);
    if (!this.jitter) {
      return Math.round(exponential);
    }
    const jitterPct = 0.3;
    const min = Math.max(0, Math.floor(exponential * (1 - jitterPct)));
    const max = Math.floor(exponential * (1 + jitterPct));
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  _parseRetryAfter(response) {
    if (!response) return null;
    let headerVal = null;
    if (response.headers) {
      if (typeof response.headers.get === 'function') {
        headerVal = response.headers.get('Retry-After') || response.headers.get('retry-after');
      } else if (response.headers['Retry-After'] || response.headers['retry-after']) {
        headerVal = response.headers['Retry-After'] || response.headers['retry-after'];
      }
    }
    if (!headerVal && typeof response.get === 'function') {
      headerVal = response.get('Retry-After');
    }
    if (!headerVal) return null;

    const seconds = parseFloat(headerVal);
    if (!isNaN(seconds)) {
      return Math.max(0, seconds * 1000);
    }
    const dateMs = Date.parse(headerVal);
    if (!isNaN(dateMs)) {
      return Math.max(0, dateMs - Date.now());
    }
    return null;
  }

  async fetchChapter(url, requestOptions = {}) {
    if (!url || typeof url !== 'string') {
      throw new Error('Valid URL string is required for fetchChapter');
    }

    await this._acquireSlot();

    try {
      if (this.delayMs > 0) {
        const delay = this.calculateDelay(this.delayMs);
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      let attempt = 0;
      let lastError = null;

      while (attempt <= this.maxRetries) {
        attempt++;

        const mergedHeaders = {
          ...this.headers,
          ...(requestOptions.headers || {})
        };

        const fetchInit = {
          method: requestOptions.method || 'GET',
          headers: mergedHeaders,
          credentials: 'include'
        };

        let response;
        try {
          response = await fetch(url, fetchInit);
        } catch (netErr) {
          lastError = netErr;
          if (attempt > this.maxRetries) {
            throw new Error(`Fetch failed after ${this.maxRetries} retries: ${netErr.message}`);
          }
          const backoff = this._computeBackoff(attempt);
          await new Promise((resolve) => setTimeout(resolve, backoff));
          continue;
        }

        const isRetryableStatus = response.status === 429 || response.status === 503 || response.status >= 500;
        if (isRetryableStatus) {
          lastError = new Error(`HTTP ${response.status} ${response.statusText || 'Error'}`.trim());
          if (attempt > this.maxRetries) {
            throw new Error(`Fetch failed after ${this.maxRetries} retries: HTTP ${response.status}`);
          }

          let backoff = this._computeBackoff(attempt);
          const retryAfterDelay = this._parseRetryAfter(response);
          if (retryAfterDelay !== null) {
            backoff = Math.max(backoff, retryAfterDelay);
          }

          await new Promise((resolve) => setTimeout(resolve, backoff));
          continue;
        }

        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}: ${response.statusText || 'Request failed'}`);
        }

        if (typeof response.text === 'function') {
          return await response.text();
        } else if (typeof response.json === 'function') {
          const json = await response.json();
          return typeof json === 'string' ? json : JSON.stringify(json);
        } else if (response.body !== undefined) {
          return typeof response.body === 'string' ? response.body : JSON.stringify(response.body);
        }
        return '';
      }

      throw lastError || new Error(`Fetch failed after ${this.maxRetries} retries`);
    } finally {
      this._releaseSlot();
    }
  }

  async cleanup() {
    this._isDraining = true;
    while (this._queue.length > 0) {
      const nextResolve = this._queue.shift();
      nextResolve();
    }
    this._activeCount = 0;
    this._isDraining = false;
    return Promise.resolve();
  }
}

// UMD / CommonJS / Global export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FetchDownloader };
}
if (typeof window !== 'undefined') {
  window.FetchDownloader = FetchDownloader;
}
if (typeof globalThis !== 'undefined') {
  globalThis.FetchDownloader = FetchDownloader;
}
