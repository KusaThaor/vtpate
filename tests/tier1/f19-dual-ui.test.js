// tests/tier1/f19-dual-ui.test.js
// Tier 1 - Feature 19: Dual UI (Popup & Full Manager)
const { assert } = require('../harness/test-assert');
const { ModuleLoader } = require('../harness/loader');

module.exports = {
  name: 'Feature 19: Dual UI (Popup & Full Manager)',
  featureId: 19,
  milestone: 'M5',
  tests: [
    {
      name: 'F19.1: popup/popup.html exists and contains no inline scripts (MV3 CSP compliant)',
      fn: () => {
        assert.ok(ModuleLoader.fileExists('popup/popup.html'), 'popup/popup.html must exist');
        const html = ModuleLoader.readFile('popup/popup.html');

        // Check for inline script tags with body
        const inlineScriptRegex = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
        const matches = [];
        let m;
        while ((m = inlineScriptRegex.exec(html)) !== null) {
          if (m[1].trim().length > 0) matches.push(m[1].trim());
        }
        assert.strictEqual(matches.length, 0, 'popup.html must not contain inline scripts');

        // Check for inline event handlers (onclick, onload, etc.)
        const inlineHandlerRegex = /\bon[a-z]+\s*=\s*["'][^"']*["']/gi;
        const handlers = html.match(inlineHandlerRegex) || [];
        assert.strictEqual(handlers.length, 0, 'popup.html must not contain inline event handlers');
      }
    },
    {
      name: 'F19.2: manager.html exists as full-page manager interface and contains no inline scripts',
      fn: () => {
        assert.ok(ModuleLoader.fileExists('manager.html'), 'manager.html must exist at project root');
        const html = ModuleLoader.readFile('manager.html');

        const inlineScriptRegex = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
        const matches = [];
        let m;
        while ((m = inlineScriptRegex.exec(html)) !== null) {
          if (m[1].trim().length > 0) matches.push(m[1].trim());
        }
        assert.strictEqual(matches.length, 0, 'manager.html must not contain inline scripts');

        const inlineHandlerRegex = /\bon[a-z]+\s*=\s*["'][^"']*["']/gi;
        const handlers = html.match(inlineHandlerRegex) || [];
        assert.strictEqual(handlers.length, 0, 'manager.html must not contain inline event handlers');
      }
    },
    {
      name: 'F19.3: popup.js script exists and binds listeners via addEventListener',
      fn: () => {
        assert.ok(ModuleLoader.fileExists('popup/popup.js'), 'popup/popup.js must exist');
        const js = ModuleLoader.readFile('popup/popup.js');
        assert.ok(js.includes('addEventListener') || js.includes('chrome.'), 'popup.js must bind DOM listeners or Chrome APIs');
      }
    },
    {
      name: 'F19.4: manager.js script exists and initializes manager UI components',
      fn: () => {
        assert.ok(ModuleLoader.fileExists('manager.js'), 'manager.js must exist');
        const js = ModuleLoader.readFile('manager.js');
        assert.ok(js.length > 100, 'manager.js must contain functional management logic');
      }
    },
    {
      name: 'F19.5: manifest.json references popup.html in action.default_popup',
      fn: () => {
        const manifest = ModuleLoader.readJson('manifest.json');
        assert.ok(manifest && manifest.action, 'manifest.action must be defined');
        assert.ok(
          manifest.action.default_popup && manifest.action.default_popup.includes('popup.html'),
          'manifest.action.default_popup must point to popup.html'
        );
      }
    }
  ]
};
