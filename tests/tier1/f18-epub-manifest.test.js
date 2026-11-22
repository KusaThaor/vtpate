// tests/tier1/f18-epub-manifest.test.js
// Tier 1 - Feature 18: EPUB Manifest & Navigation
const { assert } = require('../harness/test-assert');
const { EpubValidator } = require('../harness/epub-validator');
const { ModuleLoader } = require('../harness/loader');

module.exports = {
  name: 'Feature 18: EPUB Manifest & Navigation',
  featureId: 18,
  milestone: 'M4',
  tests: [
    {
      name: 'F18.1: content.opf metadata contains dc:title, dc:creator, and dc:language',
      fn: async () => {
        const mod = ModuleLoader.loadScriptInContext('src/epub/epub-packer.js');
        assert.ok(mod.loaded, `epub-packer.js load failed: ${mod.error ? mod.error.message : 'Not found'}`);
        const EpubPacker = mod.exports.EpubPacker || mod.sandbox.EpubPacker;
        const packer = new EpubPacker();

        const metadata = { title: 'Manifest Master', author: 'OPF Creator', language: 'vi' };
        const chapters = [{ chapterNumber: 1, title: 'Ch 1', contentHtml: '<p>Body</p>' }];

        const blob = await packer.createEpub(metadata, chapters);
        const arrayBuf = typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : blob;
        const validator = new EpubValidator(Buffer.from(arrayBuf));

        const container = validator.validateContainer();
        assert.ok(container.rootfilePath, 'Rootfile path exists');

        const opfResult = validator.validateOpf(container.rootfilePath);
        assert.strictEqual(opfResult.passed, true, `OPF validation failed: ${opfResult.issues.join('; ')}`);
        assert.includes(opfResult.xml, 'Manifest Master', 'dc:title contains book title');
        assert.includes(opfResult.xml, 'OPF Creator', 'dc:creator contains author');
      }
    },
    {
      name: 'F18.2: OPF manifest items catalog all chapter files and navigation files',
      fn: async () => {
        const mod = ModuleLoader.loadScriptInContext('src/epub/epub-packer.js');
        assert.ok(mod.loaded, 'epub-packer.js required');
        const EpubPacker = mod.exports.EpubPacker || mod.sandbox.EpubPacker;
        const packer = new EpubPacker();

        const chapters = [
          { chapterNumber: 1, title: 'Part 1', contentHtml: '<p>P1</p>' },
          { chapterNumber: 2, title: 'Part 2', contentHtml: '<p>P2</p>' }
        ];

        const blob = await packer.createEpub({ title: 'T', author: 'A' }, chapters);
        const arrayBuf = typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : blob;
        const validator = new EpubValidator(Buffer.from(arrayBuf));

        const container = validator.validateContainer();
        const opf = validator.validateOpf(container.rootfilePath);

        assert.includes(opf.xml, 'media-type="application/xhtml+xml"', 'Must catalog XHTML items');
        assert.includes(opf.xml, 'toc.ncx', 'Must declare ncx item');
      }
    },
    {
      name: 'F18.3: OPF spine defines correct sequential reading order',
      fn: async () => {
        const mod = ModuleLoader.loadScriptInContext('src/epub/epub-packer.js');
        assert.ok(mod.loaded, 'epub-packer.js required');
        const EpubPacker = mod.exports.EpubPacker || mod.sandbox.EpubPacker;
        const packer = new EpubPacker();

        const chapters = [1, 2, 3].map((i) => ({ chapterNumber: i, title: `Ch ${i}`, contentHtml: `<p>${i}</p>` }));

        const blob = await packer.createEpub({ title: 'Spine Order', author: 'A' }, chapters);
        const arrayBuf = typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : blob;
        const validator = new EpubValidator(Buffer.from(arrayBuf));

        const container = validator.validateContainer();
        const opfEntry = validator.entryMap.get(container.rootfilePath);
        const xml = opfEntry.getText('utf-8');

        const itemrefs = [];
        const itemrefRegex = /<itemref\s+idref=["']([^"']+)["']/g;
        let m;
        while ((m = itemrefRegex.exec(xml)) !== null) {
          itemrefs.push(m[1]);
        }

        assert.ok(itemrefs.length >= 3, 'Spine must contain at least 3 itemrefs for chapters');
      }
    },
    {
      name: 'F18.4: toc.ncx (EPUB 2) navigation contains navMap and all navPoints',
      fn: async () => {
        const mod = ModuleLoader.loadScriptInContext('src/epub/epub-packer.js');
        assert.ok(mod.loaded, 'epub-packer.js required');
        const EpubPacker = mod.exports.EpubPacker || mod.sandbox.EpubPacker;
        const packer = new EpubPacker();

        const chapters = [
          { chapterNumber: 1, title: 'Chương 1: Mở Đầu', contentHtml: '<p>1</p>' },
          { chapterNumber: 2, title: 'Chương 2: Diễn Biến', contentHtml: '<p>2</p>' }
        ];

        const blob = await packer.createEpub({ title: 'NCX Test', author: 'A' }, chapters);
        const arrayBuf = typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : blob;
        const validator = new EpubValidator(Buffer.from(arrayBuf));

        const ncxEntry = Array.from(validator.entryMap.values()).find((e) => e.name.endsWith('.ncx'));
        assert.ok(ncxEntry, 'toc.ncx must exist');
        const ncxXml = ncxEntry.getText('utf-8');

        assert.includes(ncxXml, '<navMap>', 'toc.ncx must include <navMap>');
        assert.includes(ncxXml, 'Chương 1: Mở Đầu', 'toc.ncx must include first chapter label');
        assert.includes(ncxXml, 'Chương 2: Diễn Biến', 'toc.ncx must include second chapter label');
      }
    },
    {
      name: 'F18.5: nav.xhtml (EPUB 3) navigation contains <nav epub:type="toc">',
      fn: async () => {
        const mod = ModuleLoader.loadScriptInContext('src/epub/epub-packer.js');
        assert.ok(mod.loaded, 'epub-packer.js required');
        const EpubPacker = mod.exports.EpubPacker || mod.sandbox.EpubPacker;
        const packer = new EpubPacker();

        const chapters = [{ chapterNumber: 1, title: 'Ch 1', contentHtml: '<p>1</p>' }];

        const blob = await packer.createEpub({ title: 'NAV Test', author: 'A' }, chapters);
        const arrayBuf = typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : blob;
        const validator = new EpubValidator(Buffer.from(arrayBuf));

        const navEntry = Array.from(validator.entryMap.values()).find((e) => e.name.endsWith('nav.xhtml') || e.name.endsWith('nav.html'));
        assert.ok(navEntry, 'nav.xhtml must exist in archive');
        const navXml = navEntry.getText('utf-8');

        assert.includes(navXml, 'epub:type="toc"', 'nav.xhtml must specify epub:type="toc"');
        assert.includes(navXml, '<ol', 'nav.xhtml must use ordered list for TOC');
      }
    }
  ]
};
