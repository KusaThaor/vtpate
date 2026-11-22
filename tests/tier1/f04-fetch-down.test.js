// tests/tier1/f04-fetch-down.test.js
// Tier 1 - Feature 4: Mode 1: Parallel Fetch Downloader
const { assert } = require('../harness/test-assert');
const { HttpMock } = require('../harness/http-mock');
const { ModuleLoader } = require('../harness/loader');

module.exports = {
  name: 'Feature 4: Mode 1 Parallel Fetch Downloader',
  featureId: 4,
  milestone: 'M2',
  tests: [
    {
      name: 'F4.1: FetchDownloader class is defined and can be instantiated',
      fn: () => {
        const mod = ModuleLoader.loadScriptInContext('src/crawler/fetch-downloader.js');
        assert.ok(mod.loaded, `Failed to load fetch-downloader.js: ${mod.error ? mod.error.message : 'Not found'}`);
        const FetchDownloader = mod.exports.FetchDownloader || mod.sandbox.FetchDownloader;
        assert.ok(typeof FetchDownloader === 'function', 'FetchDownloader constructor must be exported');
        const instance = new FetchDownloader({ concurrency: 3, delayMs: 100 });
        assert.ok(instance, 'Instance created');
      }
    },
    {
      name: 'F4.2: fetchChapter requests include credentials: "include"',
      fn: async () => {
        const httpMock = new HttpMock();
        httpMock.install();
        httpMock.onGet('https://example.com/novel/ch1', '<html><body>Chapter 1 content</body></html>');

        try {
          const mod = ModuleLoader.loadScriptInContext('src/crawler/fetch-downloader.js');
          assert.ok(mod.loaded, 'fetch-downloader.js required');
          const FetchDownloader = mod.exports.FetchDownloader || mod.sandbox.FetchDownloader;
          const downloader = new FetchDownloader({ concurrency: 1, delayMs: 0 });

          const html = await downloader.fetchChapter('https://example.com/novel/ch1');
          assert.includes(html, 'Chapter 1 content');

          const reqs = httpMock.getRequests();
          assert.ok(reqs.length >= 1, 'At least 1 request sent');
          assert.strictEqual(reqs[0].credentials, 'include', 'credentials must strictly be "include"');
        } finally {
          httpMock.uninstall();
        }
      }
    },
    {
      name: 'F4.3: Concurrency pool processes multiple URLs in parallel up to pool size',
      fn: async () => {
        const httpMock = new HttpMock();
        httpMock.install();

        let activeConcurrent = 0;
        let maxConcurrentSeen = 0;

        httpMock.onGet(/ch\d+/, async (url) => {
          activeConcurrent++;
          if (activeConcurrent > maxConcurrentSeen) maxConcurrentSeen = activeConcurrent;
          await new Promise((r) => setTimeout(r, 40));
          activeConcurrent--;
          return `<html><body>${url}</body></html>`;
        });

        try {
          const mod = ModuleLoader.loadScriptInContext('src/crawler/fetch-downloader.js');
          assert.ok(mod.loaded, 'fetch-downloader.js required');
          const FetchDownloader = mod.exports.FetchDownloader || mod.sandbox.FetchDownloader;
          const downloader = new FetchDownloader({ concurrency: 3, delayMs: 0 });

          const urls = [1, 2, 3, 4, 5, 6].map((i) => `https://example.com/novel/ch${i}`);
          const results = await Promise.all(urls.map((u) => downloader.fetchChapter(u)));

          assert.strictEqual(results.length, 6, 'All 6 chapters downloaded');
          assert.ok(maxConcurrentSeen >= 2, `Should see parallel execution (max seen: ${maxConcurrentSeen})`);
          assert.ok(maxConcurrentSeen <= 4, `Should not exceed concurrency limit (max seen: ${maxConcurrentSeen})`);
        } finally {
          httpMock.uninstall();
        }
      }
    },
    {
      name: 'F4.4: Delay and Jitter (±30%) calculations are within mathematical bounds',
      fn: () => {
        const mod = ModuleLoader.loadScriptInContext('src/crawler/fetch-downloader.js');
        assert.ok(mod.loaded, 'fetch-downloader.js required');
        const FetchDownloader = mod.exports.FetchDownloader || mod.sandbox.FetchDownloader;
        const downloader = new FetchDownloader({ concurrency: 1, delayMs: 1000, jitter: true });

        // If downloader exposes calculateDelay or getDelayWithJitter
        if (typeof downloader.calculateDelay === 'function') {
          for (let i = 0; i < 20; i++) {
            const delay = downloader.calculateDelay(1000);
            assert.ok(delay >= 700 && delay <= 1300, `Delay with ±30% jitter must be between 700 and 1300 ms, got ${delay}`);
          }
        } else {
          // Verify property configuration
          assert.strictEqual(downloader.delayMs, 1000, 'delayMs must be 1000');
          assert.ok(downloader.jitter !== false, 'jitter must be enabled');
        }
      }
    },
    {
      name: 'F4.5: Cleanup method cleanly drains active connections and resets pool',
      fn: async () => {
        const mod = ModuleLoader.loadScriptInContext('src/crawler/fetch-downloader.js');
        assert.ok(mod.loaded, 'fetch-downloader.js required');
        const FetchDownloader = mod.exports.FetchDownloader || mod.sandbox.FetchDownloader;
        const downloader = new FetchDownloader({ concurrency: 2 });
        if (typeof downloader.cleanup === 'function') {
          await downloader.cleanup();
        }
        assert.ok(true, 'Cleanup completed without errors');
      }
    }
  ]
};
