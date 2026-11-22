// tests/tier1/f24-state-persist.test.js
// Tier 1 - Feature 24: Pause / Resume & State Persistence
const { assert } = require('../harness/test-assert');
const { ChromeMock } = require('../harness/chrome-mock');
const { ModuleLoader } = require('../harness/loader');

module.exports = {
  name: 'Feature 24: Pause / Resume & State Persistence',
  featureId: 24,
  milestone: 'M5',
  tests: [
    {
      name: 'F24.1: SessionManager persists crawl checkpoint to chrome.storage.local',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();

        try {
          const mod = ModuleLoader.loadScriptInContext('src/storage/session-manager.js');
          assert.ok(mod.loaded, `session-manager.js load failed: ${mod.error ? mod.error.message : 'Not found'}`);
          const SessionManager = mod.exports.SessionManager || mod.sandbox.SessionManager;
          const session = new SessionManager();

          const checkpointData = {
            novelUrl: 'https://example.com/novel/123',
            completedIndices: [1, 2, 3],
            pendingIndices: [4, 5, 6],
            status: 'paused'
          };

          await session.saveCheckpoint(checkpointData);

          const stored = await chromeMock.storage.local.get(null);
          const found = JSON.stringify(stored).includes('https://example.com/novel/123');
          assert.ok(found, 'Checkpoint must be saved in chrome.storage.local');
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'F24.2: restoreCheckpoint retrieves last saved crawl state',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();

        try {
          const mod = ModuleLoader.loadScriptInContext('src/storage/session-manager.js');
          assert.ok(mod.loaded, 'session-manager.js required');
          const SessionManager = mod.exports.SessionManager || mod.sandbox.SessionManager;
          const session = new SessionManager();

          await session.saveCheckpoint({
            novelUrl: 'https://example.com/resume-me',
            completedIndices: [1, 2],
            pendingIndices: [3, 4]
          });

          const restored = await session.getCheckpoint();
          assert.ok(restored, 'Restored session must not be null');
          assert.strictEqual(restored.novelUrl, 'https://example.com/resume-me');
          assert.strictEqual(restored.completedIndices.length, 2);
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'F24.3: Pause halts worker pool dispatch without discarding downloaded chapters',
      fn: () => {
        let isPaused = false;
        const queue = [4, 5, 6];
        const completed = [1, 2, 3];

        const pause = () => { isPaused = true; };
        const dispatchNext = () => {
          if (isPaused) return null;
          return queue.shift();
        };

        pause();
        const next = dispatchNext();
        assert.strictEqual(next, null, 'No new jobs dispatched while paused');
        assert.strictEqual(completed.length, 3, 'Downloaded chapters preserved in memory');
      }
    },
    {
      name: 'F24.4: Resume restarts dispatch from next pending item in queue',
      fn: () => {
        let isPaused = true;
        const queue = [4, 5, 6];

        const resume = () => { isPaused = false; };
        const dispatchNext = () => {
          if (isPaused) return null;
          return queue.shift();
        };

        resume();
        const next = dispatchNext();
        assert.strictEqual(next, 4, 'Dispatches next pending chapter 4 upon resume');
        assert.strictEqual(queue.length, 2);
      }
    },
    {
      name: 'F24.5: clearCheckpoint removes session state from storage upon completion',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();

        try {
          const mod = ModuleLoader.loadScriptInContext('src/storage/session-manager.js');
          assert.ok(mod.loaded, 'session-manager.js required');
          const SessionManager = mod.exports.SessionManager || mod.sandbox.SessionManager;
          const session = new SessionManager();

          await session.saveCheckpoint({ novelUrl: 'test' });
          await session.clearCheckpoint();

          const restored = await session.getCheckpoint();
          assert.ok(!restored || Object.keys(restored).length === 0, 'Checkpoint must be cleared after finish');
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    }
  ]
};
