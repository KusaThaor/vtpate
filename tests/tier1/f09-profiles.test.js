// tests/tier1/f09-profiles.test.js
// Tier 1 - Feature 9: Per-Domain Crawl Profiles
const { assert } = require('../harness/test-assert');
const { ChromeMock } = require('../harness/chrome-mock');
const { ModuleLoader } = require('../harness/loader');

module.exports = {
  name: 'Feature 9: Per-Domain Crawl Profiles',
  featureId: 9,
  milestone: 'M2',
  tests: [
    {
      name: 'F9.1: ProfileManager returns sensible default profile when domain has no saved configuration',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();

        try {
          const mod = ModuleLoader.loadScriptInContext('src/storage/profile-manager.js');
          assert.ok(mod.loaded, `profile-manager.js load failed: ${mod.error ? mod.error.message : 'Not found'}`);
          const ProfileManager = mod.exports.ProfileManager || mod.sandbox.ProfileManager;
          const manager = new ProfileManager();

          const profile = await manager.getProfileForDomain('unknown-site.org');
          assert.ok(profile && typeof profile === 'object', 'Must return default profile object');
          assert.ok(profile.concurrency >= 1 && profile.concurrency <= 10, 'Default concurrency in 1-10 range');
          assert.ok(profile.delayMs !== undefined, 'Default delayMs defined');
          assert.strictEqual(profile.mode || 'fetch', 'fetch', 'Default mode should be fetch');
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'F9.2: saveProfile persists configuration to chrome.storage.local under domain key',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();

        try {
          const mod = ModuleLoader.loadScriptInContext('src/storage/profile-manager.js');
          assert.ok(mod.loaded, 'profile-manager.js required');
          const ProfileManager = mod.exports.ProfileManager || mod.sandbox.ProfileManager;
          const manager = new ProfileManager();

          await manager.saveProfile('inkitt.com', {
            concurrency: 5,
            delayMs: 300,
            jitter: true,
            mode: 'fetch'
          });

          const stored = await chromeMock.storage.local.get(null);
          const found = JSON.stringify(stored).includes('inkitt.com');
          assert.ok(found, 'Profile data for inkitt.com must be stored in chrome.storage.local');
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'F9.3: getProfileForDomain retrieves saved domain configuration',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();

        try {
          const mod = ModuleLoader.loadScriptInContext('src/storage/profile-manager.js');
          assert.ok(mod.loaded, 'profile-manager.js required');
          const ProfileManager = mod.exports.ProfileManager || mod.sandbox.ProfileManager;
          const manager = new ProfileManager();

          await manager.saveProfile('wattpad.com', {
            concurrency: 2,
            delayMs: 1200,
            jitter: false,
            mode: 'tab'
          });

          const retrieved = await manager.getProfileForDomain('wattpad.com');
          assert.strictEqual(retrieved.concurrency, 2, 'concurrency must match saved value');
          assert.strictEqual(retrieved.delayMs, 1200, 'delayMs must match saved value');
          assert.strictEqual(retrieved.jitter, false, 'jitter must match saved value');
          assert.strictEqual(retrieved.mode, 'tab', 'mode must match saved value');
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'F9.4: Partial domain profiles automatically inherit default values for omitted fields',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();

        try {
          const mod = ModuleLoader.loadScriptInContext('src/storage/profile-manager.js');
          assert.ok(mod.loaded, 'profile-manager.js required');
          const ProfileManager = mod.exports.ProfileManager || mod.sandbox.ProfileManager;
          const manager = new ProfileManager();

          // Save only concurrency
          await manager.saveProfile('novel-partial.net', { concurrency: 7 });

          const merged = await manager.getProfileForDomain('novel-partial.net');
          assert.strictEqual(merged.concurrency, 7, 'Overridden concurrency preserved');
          assert.ok(merged.delayMs !== undefined, 'delayMs inherited from defaults');
          assert.ok(merged.mode !== undefined, 'mode inherited from defaults');
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'F9.5: Clamps concurrency to valid [1, 10] range on save or get',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();

        try {
          const mod = ModuleLoader.loadScriptInContext('src/storage/profile-manager.js');
          assert.ok(mod.loaded, 'profile-manager.js required');
          const ProfileManager = mod.exports.ProfileManager || mod.sandbox.ProfileManager;
          const manager = new ProfileManager();

          await manager.saveProfile('extreme-high.com', { concurrency: 99 });
          await manager.saveProfile('extreme-low.com', { concurrency: -5 });

          const pHigh = await manager.getProfileForDomain('extreme-high.com');
          const pLow = await manager.getProfileForDomain('extreme-low.com');

          assert.ok(pHigh.concurrency <= 10, 'Concurrency > 10 must be clamped to 10');
          assert.ok(pLow.concurrency >= 1, 'Concurrency < 1 must be clamped to 1');
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    }
  ]
};
