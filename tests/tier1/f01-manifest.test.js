// tests/tier1/f01-manifest.test.js
// Tier 1 - Feature 1: Manifest V3 Compliance & Permissions
const { assert } = require('../harness/test-assert');
const { ModuleLoader } = require('../harness/loader');

module.exports = {
  name: 'Feature 1: Manifest V3 Compliance & Permissions',
  featureId: 1,
  milestone: 'M1',
  tests: [
    {
      name: 'F1.1: manifest.json exists and is valid JSON',
      fn: () => {
        const manifest = ModuleLoader.readJson('manifest.json');
        if (!manifest) {
          assert.ok(ModuleLoader.fileExists('manifest.json'), 'manifest.json must exist at project root');
        }
        assert.ok(manifest && typeof manifest === 'object', 'manifest.json must parse into a valid JSON object');
      }
    },
    {
      name: 'F1.2: manifest_version is strictly integer 3',
      fn: () => {
        const manifest = ModuleLoader.readJson('manifest.json');
        assert.ok(manifest, 'manifest.json required');
        assert.strictEqual(manifest.manifest_version, 3, 'manifest_version must be 3');
      }
    },
    {
      name: 'F1.3: Required permissions are declared (tabs, scripting, declarativeNetRequest, storage, downloads)',
      fn: () => {
        const manifest = ModuleLoader.readJson('manifest.json');
        assert.ok(manifest && Array.isArray(manifest.permissions), 'permissions must be an array');
        const required = ['tabs', 'scripting', 'declarativeNetRequest', 'storage', 'downloads'];
        for (const p of required) {
          assert.includes(manifest.permissions, p, `manifest.permissions must include '${p}'`);
        }
      }
    },
    {
      name: 'F1.4: host_permissions includes <all_urls>',
      fn: () => {
        const manifest = ModuleLoader.readJson('manifest.json');
        assert.ok(manifest && Array.isArray(manifest.host_permissions), 'host_permissions must be an array');
        assert.includes(manifest.host_permissions, '<all_urls>', 'host_permissions must include <all_urls>');
      }
    },
    {
      name: 'F1.5: Background service worker is configured and CSP does not contain unsafe-eval',
      fn: () => {
        const manifest = ModuleLoader.readJson('manifest.json');
        assert.ok(manifest, 'manifest.json required');
        assert.ok(
          manifest.background && manifest.background.service_worker,
          'manifest.background must specify a service_worker'
        );
        if (manifest.content_security_policy) {
          const cspStr = typeof manifest.content_security_policy === 'string'
            ? manifest.content_security_policy
            : JSON.stringify(manifest.content_security_policy);
          assert.ok(!cspStr.includes("'unsafe-eval'"), 'CSP must not allow unsafe-eval in MV3');
        }
      }
    }
  ]
};
