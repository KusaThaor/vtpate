// tests/tier1/f06-tab-down.test.js
// Tier 1 - Feature 6: Mode 2: Browser-Tab Assisted Downloader
const { assert } = require('../harness/test-assert');
const { ChromeMock } = require('../harness/chrome-mock');
const { ModuleLoader } = require('../harness/loader');

module.exports = {
  name: 'Feature 6: Mode 2 Browser-Tab Assisted Downloader',
  featureId: 6,
  milestone: 'M2',
  tests: [
    {
      name: 'F6.1: TabDownloader class exists and can be instantiated',
      fn: () => {
        const mod = ModuleLoader.loadScriptInContext('src/crawler/tab-downloader.js');
        assert.ok(mod.loaded, `tab-downloader.js load failed: ${mod.error ? mod.error.message : 'Not found'}`);
        const TabDownloader = mod.exports.TabDownloader || mod.sandbox.TabDownloader;
        assert.ok(typeof TabDownloader === 'function', 'TabDownloader constructor required');
        const instance = new TabDownloader();
        assert.ok(instance, 'Instance created');
      }
    },
    {
      name: 'F6.2: initialize creates background tab with active: false',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();

        try {
          const mod = ModuleLoader.loadScriptInContext('src/crawler/tab-downloader.js');
          assert.ok(mod.loaded, 'tab-downloader.js required');
          const TabDownloader = mod.exports.TabDownloader || mod.sandbox.TabDownloader;
          const downloader = new TabDownloader({ timeoutMs: 500, challengePollIntervalMs: 50 });

          await downloader.initialize();

          const createEvents = chromeMock._tabEvents.filter((e) => e.type === 'create');
          assert.ok(createEvents.length >= 1, 'chrome.tabs.create must be invoked');
          assert.strictEqual(createEvents[0].properties.active, false, 'Tab must be created with active: false');

          await downloader.cleanup();
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'F6.3: Uses chrome.scripting.executeScript to extract chapter DOM content',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();

        // Custom script handler returning DOM content
        chromeMock._customScriptHandler = (tab, injection) => {
          return '<article id="chapter-body"><p>Assisted Tab Chapter Content</p></article>';
        };

        try {
          const mod = ModuleLoader.loadScriptInContext('src/crawler/tab-downloader.js');
          assert.ok(mod.loaded, 'tab-downloader.js required');
          const TabDownloader = mod.exports.TabDownloader || mod.sandbox.TabDownloader;
          const downloader = new TabDownloader({ timeoutMs: 500, challengePollIntervalMs: 50 });

          await downloader.initialize();
          const content = await downloader.fetchChapter('https://antibot-novel.com/chapter-1');

          assert.includes(content, 'Assisted Tab Chapter Content');
          assert.ok(chromeMock._scriptExecutions.length >= 1, 'chrome.scripting.executeScript must be called');

          await downloader.cleanup();
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'F6.4: Detects Cloudflare / Anti-Bot challenge patterns and handles waiting',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();

        let executionCount = 0;
        chromeMock._customScriptHandler = (tab, injection) => {
          executionCount++;
          if (executionCount === 1) {
            // Simulated Cloudflare Turnstile / Challenge DOM
            return '<div id="challenge-running"><span id="cf-chl-widget">Just a moment...</span></div>';
          }
          // Cleared challenge
          return '<div class="chapter-content"><p>Protected content unlocked</p></div>';
        };

        try {
          const mod = ModuleLoader.loadScriptInContext('src/crawler/tab-downloader.js');
          assert.ok(mod.loaded, 'tab-downloader.js required');
          const TabDownloader = mod.exports.TabDownloader || mod.sandbox.TabDownloader;
          const downloader = new TabDownloader({ challengePollIntervalMs: 20 });

          await downloader.initialize();
          const content = await downloader.fetchChapter('https://cloudflare-novel.com/ch1');

          assert.includes(content, 'Protected content unlocked');
          assert.ok(executionCount >= 2, 'Should have polled until challenge cleared');

          await downloader.cleanup();
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'F6.5: Clean error handling when tab execution fails or script injection rejects',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();

        chromeMock._customScriptHandler = () => {
          throw new Error('Frame was detached');
        };

        try {
          const mod = ModuleLoader.loadScriptInContext('src/crawler/tab-downloader.js');
          assert.ok(mod.loaded, 'tab-downloader.js required');
          const TabDownloader = mod.exports.TabDownloader || mod.sandbox.TabDownloader;
          const downloader = new TabDownloader({ timeoutMs: 500, challengePollIntervalMs: 50 });

          await downloader.initialize();
          await assert.rejects(
            async () => {
              await downloader.fetchChapter('https://error-novel.com/ch1');
            },
            /detached|error|failed/i,
            'Must propagate error when script execution fails'
          );

          await downloader.cleanup();
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    }
  ]
};
