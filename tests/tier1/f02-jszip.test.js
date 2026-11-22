// tests/tier1/f02-jszip.test.js
// Tier 1 - Feature 2: Offline JSZip Library
const { assert } = require('../harness/test-assert');
const { ModuleLoader } = require('../harness/loader');

module.exports = {
  name: 'Feature 2: Offline JSZip Library',
  featureId: 2,
  milestone: 'M1',
  tests: [
    {
      name: 'F2.1: libs/jszip.min.js exists locally and is not empty',
      fn: () => {
        assert.ok(ModuleLoader.fileExists('libs/jszip.min.js'), 'libs/jszip.min.js must exist locally');
        const content = ModuleLoader.readFile('libs/jszip.min.js');
        assert.ok(content && content.length > 50000, `jszip.min.js must be minified library (>50KB), got ${content ? content.length : 0} bytes`);
      }
    },
    {
      name: 'F2.2: libs/jszip.min.js contains authentic JSZip identifier',
      fn: () => {
        const content = ModuleLoader.readFile('libs/jszip.min.js');
        assert.ok(content, 'libs/jszip.min.js required');
        const hasJsZipIdentifier = content.includes('JSZip') || content.includes('jszip');
        assert.ok(hasJsZipIdentifier, 'libs/jszip.min.js must contain JSZip identifier');
      }
    },
    {
      name: 'F2.3: JSZip can be loaded offline into sandbox without errors',
      fn: () => {
        const result = ModuleLoader.loadScriptInContext('libs/jszip.min.js');
        assert.ok(result.loaded, `Failed to load libs/jszip.min.js: ${result.error ? result.error.message : 'Unknown'}`);
        const JSZip = result.sandbox.JSZip || result.exports;
        assert.ok(typeof JSZip === 'function', 'JSZip constructor must be exported or bound to global');
      }
    },
    {
      name: 'F2.4: JSZip can create archive and add files',
      fn: async () => {
        const result = ModuleLoader.loadScriptInContext('libs/jszip.min.js');
        assert.ok(result.loaded, 'JSZip must load');
        const JSZip = result.sandbox.JSZip || result.exports;
        const zip = new JSZip();
        zip.file('test.txt', 'Hello VTPATE');
        assert.ok(zip.file('test.txt'), 'File must be added to JSZip archive');
      }
    },
    {
      name: 'F2.5: JSZip can generate binary zip buffer with STORE compression',
      fn: async () => {
        const result = ModuleLoader.loadScriptInContext('libs/jszip.min.js');
        assert.ok(result.loaded, 'JSZip must load');
        const JSZip = result.sandbox.JSZip || result.exports;
        const zip = new JSZip();
        zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
        const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
        assert.ok(Buffer.isBuffer(buf), 'Must generate nodebuffer');
        assert.ok(buf.length > 20, 'Buffer must contain zip headers and content');
        // Check zip signature
        assert.strictEqual(buf.readUInt32LE(0), 0x04034b50, 'Must have valid ZIP local header signature 0x04034b50');
      }
    }
  ]
};
