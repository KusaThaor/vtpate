// tests/tier1/f08-net-rules.test.js
// Tier 1 - Feature 8: DeclarativeNetRequest Header Spoofing
const { assert } = require('../harness/test-assert');
const { ChromeMock } = require('../harness/chrome-mock');
const { ModuleLoader } = require('../harness/loader');

module.exports = {
  name: 'Feature 8: DeclarativeNetRequest Header Spoofing',
  featureId: 8,
  milestone: 'M2',
  tests: [
    {
      name: 'F8.1: NetRulesManager class exists and can be instantiated',
      fn: () => {
        const mod = ModuleLoader.loadScriptInContext('src/crawler/net-rules.js');
        assert.ok(mod.loaded, `net-rules.js load failed: ${mod.error ? mod.error.message : 'Not found'}`);
        const NetRulesManager = mod.exports.NetRulesManager || mod.sandbox.NetRulesManager;
        assert.ok(typeof NetRulesManager === 'function', 'NetRulesManager constructor required');
        const instance = new NetRulesManager();
        assert.ok(instance, 'Instance created');
      }
    },
    {
      name: 'F8.2: setSessionHeaders calls declarativeNetRequest.updateSessionRules with modifyHeaders rule',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();

        try {
          const mod = ModuleLoader.loadScriptInContext('src/crawler/net-rules.js');
          assert.ok(mod.loaded, 'net-rules.js required');
          const NetRulesManager = mod.exports.NetRulesManager || mod.sandbox.NetRulesManager;
          const manager = new NetRulesManager();

          await manager.setSessionHeaders({
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
            referer: 'https://www.inkitt.com/'
          });

          const rules = await chromeMock.declarativeNetRequest.getSessionRules();
          assert.ok(rules.length >= 1, 'At least 1 session rule must be active');
          assert.strictEqual(rules[0].action.type, chromeMock.declarativeNetRequest.RuleActionType.MODIFY_HEADERS);
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'F8.3: Configures custom User-Agent and Referer in requestHeaders',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();

        try {
          const mod = ModuleLoader.loadScriptInContext('src/crawler/net-rules.js');
          assert.ok(mod.loaded, 'net-rules.js required');
          const NetRulesManager = mod.exports.NetRulesManager || mod.sandbox.NetRulesManager;
          const manager = new NetRulesManager();

          const targetUA = 'TestMobileBrowser/1.0';
          const targetRef = 'https://custom-referer.com/';

          await manager.setSessionHeaders({ userAgent: targetUA, referer: targetRef });

          const rules = await chromeMock.declarativeNetRequest.getSessionRules();
          const reqHeaders = rules[0].action.requestHeaders || [];

          const uaHeader = reqHeaders.find((h) => h.header.toLowerCase() === 'user-agent');
          const refHeader = reqHeaders.find((h) => h.header.toLowerCase() === 'referer');

          assert.ok(uaHeader, 'User-Agent header rule must exist');
          assert.strictEqual(uaHeader.value, targetUA, 'User-Agent rule value must match');
          assert.ok(refHeader, 'Referer header rule must exist');
          assert.strictEqual(refHeader.value, targetRef, 'Referer rule value must match');
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'F8.4: Configures mobile emulation header X-Requested-With for app-only stories',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();

        try {
          const mod = ModuleLoader.loadScriptInContext('src/crawler/net-rules.js');
          assert.ok(mod.loaded, 'net-rules.js required');
          const NetRulesManager = mod.exports.NetRulesManager || mod.sandbox.NetRulesManager;
          const manager = new NetRulesManager();

          await manager.setSessionHeaders({
            extraHeaders: { 'X-Requested-With': 'com.inkitt.inkitt' }
          });

          const rules = await chromeMock.declarativeNetRequest.getSessionRules();
          const reqHeaders = rules[0].action.requestHeaders || [];
          const customHeader = reqHeaders.find((h) => h.header.toLowerCase() === 'x-requested-with');

          assert.ok(customHeader, 'X-Requested-With rule must exist');
          assert.strictEqual(customHeader.value, 'com.inkitt.inkitt');
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'F8.5: clearSessionRules removes active rules and leaves zero orphaned session rules',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();

        try {
          const mod = ModuleLoader.loadScriptInContext('src/crawler/net-rules.js');
          assert.ok(mod.loaded, 'net-rules.js required');
          const NetRulesManager = mod.exports.NetRulesManager || mod.sandbox.NetRulesManager;
          const manager = new NetRulesManager();

          await manager.setSessionHeaders({ userAgent: 'test' });
          let rules = await chromeMock.declarativeNetRequest.getSessionRules();
          assert.ok(rules.length > 0, 'Rule set');

          await manager.clearSessionRules();
          rules = await chromeMock.declarativeNetRequest.getSessionRules();
          assert.strictEqual(rules.length, 0, 'All session rules must be cleared on cleanup');
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    }
  ]
};
