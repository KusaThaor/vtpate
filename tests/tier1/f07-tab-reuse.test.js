// tests/tier1/f07-tab-reuse.test.js
// Tier 1 - Feature 7: Tab Reuse & Safe Cleanup
const { assert } = require('../harness/test-assert');
const { ChromeMock } = require('../harness/chrome-mock');
const { ModuleLoader } = require('../harness/loader');

module.exports = {
  name: 'Feature 7: Tab Reuse & Safe Cleanup',
  featureId: 7,
  milestone: 'M2',
  tests: [
    {
      name: 'F7.1: Sequential chapters update existing tab rather than creating new tabs',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();

        chromeMock._customScriptHandler = (tab) => `<p>Content of ${tab.url}</p>`;

        try {
          const mod = ModuleLoader.loadScriptInContext('src/crawler/tab-downloader.js');
          assert.ok(mod.loaded, 'tab-downloader.js required');
          const TabDownloader = mod.exports.TabDownloader || mod.sandbox.TabDownloader;
          const downloader = new TabDownloader();

          await downloader.initialize();

          await downloader.fetchChapter('https://novel.com/ch1');
          await downloader.fetchChapter('https://novel.com/ch2');
          await downloader.fetchChapter('https://novel.com/ch3');

          const createEvents = chromeMock._tabEvents.filter((e) => e.type === 'create');
          const updateEvents = chromeMock._tabEvents.filter((e) => e.type === 'update');

          assert.strictEqual(createEvents.length, 1, 'Only 1 tab must be created for the entire session');
          assert.ok(updateEvents.length >= 2, 'Subsequent chapters must update existing tab URL');

          await downloader.cleanup();
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'F7.2: Tab count never exceeds 1 during multi-chapter crawl',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();

        chromeMock._customScriptHandler = () => '<p>OK</p>';

        try {
          const mod = ModuleLoader.loadScriptInContext('src/crawler/tab-downloader.js');
          assert.ok(mod.loaded, 'tab-downloader.js required');
          const TabDownloader = mod.exports.TabDownloader || mod.sandbox.TabDownloader;
          const downloader = new TabDownloader();

          await downloader.initialize();

          for (let i = 1; i <= 5; i++) {
            await downloader.fetchChapter(`https://novel.com/ch${i}`);
            assert.strictEqual(chromeMock._tabs.size, 1, `Active tab count must remain 1 at chapter ${i}`);
          }

          await downloader.cleanup();
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'F7.3: cleanup() closes the allocated tab via chrome.tabs.remove',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();

        try {
          const mod = ModuleLoader.loadScriptInContext('src/crawler/tab-downloader.js');
          assert.ok(mod.loaded, 'tab-downloader.js required');
          const TabDownloader = mod.exports.TabDownloader || mod.sandbox.TabDownloader;
          const downloader = new TabDownloader();

          await downloader.initialize();
          assert.strictEqual(chromeMock._tabs.size, 1, 'Tab active before cleanup');

          await downloader.cleanup();
          assert.strictEqual(chromeMock._tabs.size, 0, 'Tab must be closed after cleanup');
          const removeEvents = chromeMock._tabEvents.filter((e) => e.type === 'remove');
          assert.strictEqual(removeEvents.length, 1, 'chrome.tabs.remove called once');
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'F7.4: Safe cleanup executes in finally block even if fetchChapter throws',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();

        chromeMock._customScriptHandler = () => {
          throw new Error('Fatal DOM error');
        };

        try {
          const mod = ModuleLoader.loadScriptInContext('src/crawler/tab-downloader.js');
          assert.ok(mod.loaded, 'tab-downloader.js required');
          const TabDownloader = mod.exports.TabDownloader || mod.sandbox.TabDownloader;
          const downloader = new TabDownloader();

          await downloader.initialize();

          try {
            await downloader.fetchChapter('https://fatal-error.com/ch1');
          } catch {
            // expected
          } finally {
            await downloader.cleanup();
          }

          assert.strictEqual(chromeMock._tabs.size, 0, 'Tab must be cleaned up in finally block after error');
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'F7.5: Calling cleanup() multiple times is idempotent and does not throw',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();

        try {
          const mod = ModuleLoader.loadScriptInContext('src/crawler/tab-downloader.js');
          assert.ok(mod.loaded, 'tab-downloader.js required');
          const TabDownloader = mod.exports.TabDownloader || mod.sandbox.TabDownloader;
          const downloader = new TabDownloader();

          await downloader.initialize();
          await downloader.cleanup();
          await downloader.cleanup(); // 2nd call
          await downloader.cleanup(); // 3rd call

          assert.ok(true, 'Multiple cleanup calls succeeded idempotently');
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    }
  ]
};
