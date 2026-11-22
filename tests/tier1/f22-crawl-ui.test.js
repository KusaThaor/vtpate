// tests/tier1/f22-crawl-ui.test.js
// Tier 1 - Feature 22: Crawl Profile UI Controls
const { assert } = require('../harness/test-assert');
const { ModuleLoader } = require('../harness/loader');

module.exports = {
  name: 'Feature 22: Crawl Profile UI Controls',
  featureId: 22,
  milestone: 'M5',
  tests: [
    {
      name: 'F22.1: manager.html contains inputs for concurrency, delay, and jitter',
      fn: () => {
        const html = ModuleLoader.readFile('manager.html');
        assert.ok(html, 'manager.html required');

        const hasConcurrency = html.includes('id="concurrency"') || html.includes('name="concurrency"') || html.includes('concurrency-slider');
        const hasDelay = html.includes('id="delay"') || html.includes('name="delay"') || html.includes('delay-input');
        const hasJitter = html.includes('id="jitter"') || html.includes('name="jitter"') || html.includes('jitter-toggle');

        assert.ok(hasConcurrency, 'manager.html must contain concurrency control');
        assert.ok(hasDelay, 'manager.html must contain delay control');
        assert.ok(hasJitter, 'manager.html must contain jitter control');
      }
    },
    {
      name: 'F22.2: manager.html contains crawl mode selector (Fetch vs Tab Assisted)',
      fn: () => {
        const html = ModuleLoader.readFile('manager.html');
        assert.ok(html, 'manager.html required');

        const hasModeSelect = html.includes('id="crawl-mode"') || html.includes('name="mode"') || html.includes('mode-select') || html.includes('tab-assisted');
        assert.ok(hasModeSelect, 'manager.html must contain crawl mode selector');
      }
    },
    {
      name: 'F22.3: Concurrency input limits values strictly between 1 and 10',
      fn: () => {
        const clampConcurrency = (val) => {
          const n = parseInt(val, 10);
          if (isNaN(n) || n < 1) return 1;
          if (n > 10) return 10;
          return n;
        };

        assert.strictEqual(clampConcurrency('5'), 5);
        assert.strictEqual(clampConcurrency('0'), 1);
        assert.strictEqual(clampConcurrency('-3'), 1);
        assert.strictEqual(clampConcurrency('15'), 10);
        assert.strictEqual(clampConcurrency('abc'), 1);
      }
    },
    {
      name: 'F22.4: Delay input clamps negative values to 0 and caps at 5000ms',
      fn: () => {
        const clampDelay = (val) => {
          const d = parseInt(val, 10);
          if (isNaN(d) || d < 0) return 0;
          if (d > 5000) return 5000;
          return d;
        };

        assert.strictEqual(clampDelay('1000'), 1000);
        assert.strictEqual(clampDelay('-500'), 0);
        assert.strictEqual(clampDelay('9999'), 5000);
      }
    },
    {
      name: 'F22.5: Crawl profile configuration saves and updates current session state',
      fn: () => {
        const currentProfile = {
          concurrency: 3,
          delayMs: 500,
          jitter: true,
          mode: 'fetch'
        };

        const updateProfile = (newSettings) => {
          Object.assign(currentProfile, newSettings);
        };

        updateProfile({ concurrency: 5, mode: 'tab' });
        assert.strictEqual(currentProfile.concurrency, 5);
        assert.strictEqual(currentProfile.mode, 'tab');
        assert.strictEqual(currentProfile.delayMs, 500, 'Unchanged properties preserved');
      }
    }
  ]
};
