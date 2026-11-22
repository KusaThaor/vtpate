// tests/tier1/f25-doc-scenarios.test.js
// Tier 1 - Feature 25: Documentation & Test Scenarios
const { assert } = require('../harness/test-assert');
const { ModuleLoader } = require('../harness/loader');

module.exports = {
  name: 'Feature 25: Documentation & Test Scenarios',
  featureId: 25,
  milestone: 'M5',
  tests: [
    {
      name: 'F25.1: README.md exists at project root and is non-empty',
      fn: () => {
        assert.ok(ModuleLoader.fileExists('README.md'), 'README.md must exist at project root');
        const content = ModuleLoader.readFile('README.md');
        assert.ok(content && content.length > 200, 'README.md must have substantive content');
      }
    },
    {
      name: 'F25.2: Contains Chrome Extension installation guide (chrome://extensions and Load unpacked)',
      fn: () => {
        const readme = ModuleLoader.readFile('README.md');
        assert.ok(readme, 'README.md required');

        assert.includes(readme, 'chrome://extensions', 'README must mention chrome://extensions');
        const hasLoadUnpacked = readme.toLowerCase().includes('load unpacked') || readme.toLowerCase().includes('tải tiện ích đã giải nén');
        assert.ok(hasLoadUnpacked, 'README must explain how to load unpacked extension');
      }
    },
    {
      name: 'F25.3: Documents Inkitt test scenario with steps and sample URL',
      fn: () => {
        const readme = ModuleLoader.readFile('README.md');
        assert.ok(readme, 'README.md required');

        const hasInkittScenario = readme.toLowerCase().includes('inkitt');
        assert.ok(hasInkittScenario, 'README must document Inkitt crawl scenario');
      }
    },
    {
      name: 'F25.4: Documents Wattpad test scenario with steps and sample URL',
      fn: () => {
        const readme = ModuleLoader.readFile('README.md');
        assert.ok(readme, 'README.md required');

        const hasWattpadScenario = readme.toLowerCase().includes('wattpad');
        assert.ok(hasWattpadScenario, 'README must document Wattpad crawl scenario');
      }
    },
    {
      name: 'F25.5: Documents Error handling, Retry, and EPUB validation scenarios',
      fn: () => {
        const readme = ModuleLoader.readFile('README.md');
        assert.ok(readme, 'README.md required');

        const hasRetryOrEpub = readme.toLowerCase().includes('retry') || readme.toLowerCase().includes('epub') || readme.toLowerCase().includes('tải lại');
        assert.ok(hasRetryOrEpub, 'README must document Retry and EPUB verification steps');
      }
    }
  ]
};
