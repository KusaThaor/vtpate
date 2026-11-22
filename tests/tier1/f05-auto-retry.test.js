// tests/tier1/f05-auto-retry.test.js
// Tier 1 - Feature 5: Auto-Retry & Exponential Backoff
const { assert } = require('../harness/test-assert');
const { HttpMock } = require('../harness/http-mock');
const { ModuleLoader } = require('../harness/loader');

module.exports = {
  name: 'Feature 5: Auto-Retry & Exponential Backoff',
  featureId: 5,
  milestone: 'M2',
  tests: [
    {
      name: 'F5.1: Automatically retries on network connection failure up to 3 times',
      fn: async () => {
        const httpMock = new HttpMock();
        httpMock.install();

        let attempts = 0;
        httpMock.onGet('https://example.com/retry-net', () => {
          attempts++;
          if (attempts < 3) {
            throw new Error('Failed to fetch (network disconnect)');
          }
          return '<html><body>Success on attempt 3</body></html>';
        });

        try {
          const mod = ModuleLoader.loadScriptInContext('src/crawler/fetch-downloader.js');
          assert.ok(mod.loaded, 'fetch-downloader.js required');
          const FetchDownloader = mod.exports.FetchDownloader || mod.sandbox.FetchDownloader;
          const downloader = new FetchDownloader({ maxRetries: 3, baseBackoffMs: 10, delayMs: 0 });

          const res = await downloader.fetchChapter('https://example.com/retry-net');
          assert.includes(res, 'Success on attempt 3');
          assert.strictEqual(attempts, 3, 'Must have attempted exactly 3 times before success');
        } finally {
          httpMock.uninstall();
        }
      }
    },
    {
      name: 'F5.2: Retries on HTTP 429 Too Many Requests',
      fn: async () => {
        const httpMock = new HttpMock();
        httpMock.install();

        let attempts = 0;
        httpMock.onGet('https://example.com/retry-429', () => {
          attempts++;
          if (attempts === 1) {
            return { status: 429, statusText: 'Too Many Requests', body: 'Rate limited' };
          }
          return { status: 200, body: '<html><body>Recovered from 429</body></html>' };
        });

        try {
          const mod = ModuleLoader.loadScriptInContext('src/crawler/fetch-downloader.js');
          assert.ok(mod.loaded, 'fetch-downloader.js required');
          const FetchDownloader = mod.exports.FetchDownloader || mod.sandbox.FetchDownloader;
          const downloader = new FetchDownloader({ maxRetries: 3, baseBackoffMs: 10, delayMs: 0 });

          const res = await downloader.fetchChapter('https://example.com/retry-429');
          assert.includes(res, 'Recovered from 429');
          assert.strictEqual(attempts, 2, 'Should succeed on attempt 2 after 429');
        } finally {
          httpMock.uninstall();
        }
      }
    },
    {
      name: 'F5.3: Retries on HTTP 503 Service Unavailable',
      fn: async () => {
        const httpMock = new HttpMock();
        httpMock.install();

        let attempts = 0;
        httpMock.onGet('https://example.com/retry-503', () => {
          attempts++;
          if (attempts === 1) {
            return { status: 503, statusText: 'Service Unavailable', body: 'Server busy' };
          }
          return { status: 200, body: '<html><body>Recovered from 503</body></html>' };
        });

        try {
          const mod = ModuleLoader.loadScriptInContext('src/crawler/fetch-downloader.js');
          assert.ok(mod.loaded, 'fetch-downloader.js required');
          const FetchDownloader = mod.exports.FetchDownloader || mod.sandbox.FetchDownloader;
          const downloader = new FetchDownloader({ maxRetries: 3, baseBackoffMs: 10, delayMs: 0 });

          const res = await downloader.fetchChapter('https://example.com/retry-503');
          assert.includes(res, 'Recovered from 503');
          assert.strictEqual(attempts, 2, 'Should succeed on attempt 2 after 503');
        } finally {
          httpMock.uninstall();
        }
      }
    },
    {
      name: 'F5.4: Respects Retry-After header when provided in 429 response',
      fn: async () => {
        const httpMock = new HttpMock();
        httpMock.install();

        let attempts = 0;
        let retryAfterDetected = false;

        httpMock.onGet('https://example.com/retry-after', () => {
          attempts++;
          if (attempts === 1) {
            return {
              status: 429,
              headers: { 'Retry-After': '1' },
              body: 'Rate limited'
            };
          }
          return { status: 200, body: 'OK' };
        });

        try {
          const mod = ModuleLoader.loadScriptInContext('src/crawler/fetch-downloader.js');
          assert.ok(mod.loaded, 'fetch-downloader.js required');
          const FetchDownloader = mod.exports.FetchDownloader || mod.sandbox.FetchDownloader;
          const downloader = new FetchDownloader({ maxRetries: 3, baseBackoffMs: 10 });

          const start = Date.now();
          const res = await downloader.fetchChapter('https://example.com/retry-after');
          const elapsed = Date.now() - start;

          assert.strictEqual(attempts, 2, 'Must retry after 429');
          // If the parser respects Retry-After header, it waited at least ~100ms or parsed 1s
          assert.ok(elapsed >= 50, `Elapsed time should reflect retry backoff, took ${elapsed}ms`);
        } finally {
          httpMock.uninstall();
        }
      }
    },
    {
      name: 'F5.5: Throws error or marks failure when all 3 retries are exhausted',
      fn: async () => {
        const httpMock = new HttpMock();
        httpMock.install();

        let attempts = 0;
        httpMock.onGet('https://example.com/always-fail', () => {
          attempts++;
          return { status: 500, body: 'Internal Server Error' };
        });

        try {
          const mod = ModuleLoader.loadScriptInContext('src/crawler/fetch-downloader.js');
          assert.ok(mod.loaded, 'fetch-downloader.js required');
          const FetchDownloader = mod.exports.FetchDownloader || mod.sandbox.FetchDownloader;
          const downloader = new FetchDownloader({ maxRetries: 3, baseBackoffMs: 5 });

          await assert.rejects(
            async () => {
              await downloader.fetchChapter('https://example.com/always-fail');
            },
            /500|retry|exhausted|failed/i,
            'Should reject after exceeding max retries'
          );

          assert.ok(attempts >= 3, `Should have attempted at least 3 retries, actual: ${attempts}`);
        } finally {
          httpMock.uninstall();
        }
      }
    }
  ]
};
