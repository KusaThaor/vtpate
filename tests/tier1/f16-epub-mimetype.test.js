// tests/tier1/f16-epub-mimetype.test.js
// Tier 1 - Feature 16: EPUB OCF Standards (mimetype STORE)
const { assert } = require('../harness/test-assert');
const { EpubValidator, parseZipEntries } = require('../harness/epub-validator');
const { ModuleLoader } = require('../harness/loader');

module.exports = {
  name: 'Feature 16: EPUB OCF Standards (mimetype STORE)',
  featureId: 16,
  milestone: 'M4',
  tests: [
    {
      name: 'F16.1: EpubPacker produces a valid binary ZIP buffer or Blob',
      fn: async () => {
        const mod = ModuleLoader.loadScriptInContext('src/epub/epub-packer.js');
        assert.ok(mod.loaded, `epub-packer.js load failed: ${mod.error ? mod.error.message : 'Not found'}`);
        const EpubPacker = mod.exports.EpubPacker || mod.sandbox.EpubPacker;
        const packer = new EpubPacker();

        const metadata = { title: 'Test Novel', author: 'Author' };
        const chapters = [{ chapterNumber: 1, title: 'Chapter 1', contentHtml: '<p>Content</p>' }];

        const blob = await packer.createEpub(metadata, chapters);
        assert.ok(blob, 'Must return blob/buffer');

        const arrayBuf = typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : blob;
        const buf = Buffer.isBuffer(arrayBuf) ? arrayBuf : Buffer.from(arrayBuf);

        assert.strictEqual(buf.readUInt32LE(0), 0x04034b50, 'Must have ZIP local header signature 0x04034b50');
      }
    },
    {
      name: 'F16.2: File "mimetype" is strictly the FIRST entry in the ZIP archive (index 0)',
      fn: async () => {
        const mod = ModuleLoader.loadScriptInContext('src/epub/epub-packer.js');
        assert.ok(mod.loaded, 'epub-packer.js required');
        const EpubPacker = mod.exports.EpubPacker || mod.sandbox.EpubPacker;
        const packer = new EpubPacker();

        const metadata = { title: 'First Entry Check', author: 'Tester' };
        const chapters = [{ chapterNumber: 1, title: 'Ch 1', contentHtml: '<p>Hi</p>' }];

        const blob = await packer.createEpub(metadata, chapters);
        const arrayBuf = typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : blob;
        const entries = parseZipEntries(Buffer.from(arrayBuf));

        assert.ok(entries.length > 0, 'Archive must contain entries');
        assert.strictEqual(entries[0].name, 'mimetype', 'First entry in zip archive must strictly be "mimetype"');
      }
    },
    {
      name: 'F16.3: "mimetype" is stored with compression method STORE (0)',
      fn: async () => {
        const mod = ModuleLoader.loadScriptInContext('src/epub/epub-packer.js');
        assert.ok(mod.loaded, 'epub-packer.js required');
        const EpubPacker = mod.exports.EpubPacker || mod.sandbox.EpubPacker;
        const packer = new EpubPacker();

        const metadata = { title: 'STORE Method Check', author: 'Tester' };
        const chapters = [{ chapterNumber: 1, title: 'Ch 1', contentHtml: '<p>Hi</p>' }];

        const blob = await packer.createEpub(metadata, chapters);
        const arrayBuf = typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : blob;
        const entries = parseZipEntries(Buffer.from(arrayBuf));

        const mimeEntry = entries.find((e) => e.name === 'mimetype');
        assert.ok(mimeEntry, 'mimetype entry exists');
        assert.strictEqual(mimeEntry.compressionMethod, 0, 'mimetype compression method must strictly be STORE (0)');
      }
    },
    {
      name: 'F16.4: "mimetype" content is strictly "application/epub+zip" (exactly 20 bytes)',
      fn: async () => {
        const mod = ModuleLoader.loadScriptInContext('src/epub/epub-packer.js');
        assert.ok(mod.loaded, 'epub-packer.js required');
        const EpubPacker = mod.exports.EpubPacker || mod.sandbox.EpubPacker;
        const packer = new EpubPacker();

        const metadata = { title: 'Content Length Check', author: 'Tester' };
        const chapters = [{ chapterNumber: 1, title: 'Ch 1', contentHtml: '<p>Hi</p>' }];

        const blob = await packer.createEpub(metadata, chapters);
        const arrayBuf = typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : blob;
        const entries = parseZipEntries(Buffer.from(arrayBuf));

        const mimeEntry = entries[0];
        const contentStr = mimeEntry.getText('ascii');

        assert.strictEqual(contentStr, 'application/epub+zip', 'Content must be exactly "application/epub+zip"');
        assert.strictEqual(mimeEntry.uncompressedSize, 20, 'Uncompressed size must be exactly 20 bytes');
        assert.strictEqual(mimeEntry.compressedSize, 20, 'Compressed size must be exactly 20 bytes');
      }
    },
    {
      name: 'F16.5: META-INF/container.xml points to valid rootfile OPF',
      fn: async () => {
        const mod = ModuleLoader.loadScriptInContext('src/epub/epub-packer.js');
        assert.ok(mod.loaded, 'epub-packer.js required');
        const EpubPacker = mod.exports.EpubPacker || mod.sandbox.EpubPacker;
        const packer = new EpubPacker();

        const metadata = { title: 'Container Check', author: 'Tester' };
        const chapters = [{ chapterNumber: 1, title: 'Ch 1', contentHtml: '<p>Hi</p>' }];

        const blob = await packer.createEpub(metadata, chapters);
        const arrayBuf = typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : blob;
        const validator = new EpubValidator(Buffer.from(arrayBuf));

        const containerResult = validator.validateContainer();
        assert.strictEqual(containerResult.passed, true, `container.xml validation failed: ${containerResult.issues.join('; ')}`);
        assert.ok(containerResult.rootfilePath, 'Rootfile path resolved');
      }
    }
  ]
};
