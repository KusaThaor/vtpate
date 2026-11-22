// tests/tier1/f17-xml-xhtml.test.js
// Tier 1 - Feature 17: XML/XHTML Strict Validation
const { assert } = require('../harness/test-assert');
const { EpubValidator } = require('../harness/epub-validator');
const { ModuleLoader } = require('../harness/loader');

module.exports = {
  name: 'Feature 17: XML/XHTML Strict Validation',
  featureId: 17,
  milestone: 'M4',
  tests: [
    {
      name: 'F17.1: Chapter XHTML files include valid XML declaration and XHTML namespace',
      fn: async () => {
        const mod = ModuleLoader.loadScriptInContext('src/epub/epub-packer.js');
        assert.ok(mod.loaded, `epub-packer.js load failed: ${mod.error ? mod.error.message : 'Not found'}`);
        const EpubPacker = mod.exports.EpubPacker || mod.sandbox.EpubPacker;
        const packer = new EpubPacker();

        const metadata = { title: 'XML Declaration Test', author: 'Author' };
        const chapters = [{ chapterNumber: 1, title: 'Chapter 1', contentHtml: '<p>Standard paragraph</p>' }];

        const blob = await packer.createEpub(metadata, chapters);
        const arrayBuf = typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : blob;
        const validator = new EpubValidator(Buffer.from(arrayBuf));

        const chEntry = Array.from(validator.entryMap.values()).find((e) => e.name.endsWith('.xhtml') && e.name.includes('chapter'));
        assert.ok(chEntry, 'Chapter XHTML entry exists');
        const text = chEntry.getText('utf-8');

        assert.ok(text.includes('<?xml version="1.0"'), 'Must contain <?xml version="1.0"');
        assert.ok(text.includes('xmlns="http://www.w3.org/1999/xhtml"'), 'Must contain XHTML namespace');
      }
    },
    {
      name: 'F17.2: Special XML characters (& < >) are properly escaped in titles and content',
      fn: async () => {
        const mod = ModuleLoader.loadScriptInContext('src/epub/epub-packer.js');
        assert.ok(mod.loaded, 'epub-packer.js required');
        const EpubPacker = mod.exports.EpubPacker || mod.sandbox.EpubPacker;
        const packer = new EpubPacker();

        const metadata = { title: 'Rock & Roll <Stories>', author: 'A & B' };
        const chapters = [{
          chapterNumber: 1,
          title: 'Tom & Jerry > Sylvester',
          contentHtml: '<p>5 < 10 & 20 > 15</p>'
        }];

        const blob = await packer.createEpub(metadata, chapters);
        const arrayBuf = typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : blob;
        const validator = new EpubValidator(Buffer.from(arrayBuf));

        const chValidation = validator.validateChapters();
        assert.strictEqual(chValidation.passed, true, `Chapters XML validation failed: ${chValidation.issues.join('; ')}`);
      }
    },
    {
      name: 'F17.3: Void tags (<br>, <hr>, <img>) are transformed to self-closing in XHTML (<br/>, <hr/>, <img/>)',
      fn: async () => {
        const mod = ModuleLoader.loadScriptInContext('src/epub/epub-packer.js');
        assert.ok(mod.loaded, 'epub-packer.js required');
        const EpubPacker = mod.exports.EpubPacker || mod.sandbox.EpubPacker;
        const packer = new EpubPacker();

        const metadata = { title: 'Void Tag Test', author: 'Author' };
        const chapters = [{
          chapterNumber: 1,
          title: 'Break and Rule',
          contentHtml: '<p>Line 1<br>Line 2<hr><img src="../images/pic.jpg"></p>'
        }];

        const blob = await packer.createEpub(metadata, chapters);
        const arrayBuf = typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : blob;
        const validator = new EpubValidator(Buffer.from(arrayBuf));

        const chValidation = validator.validateChapters();
        assert.strictEqual(chValidation.passed, true, `Void tags must be self-closing in XHTML: ${chValidation.issues.join('; ')}`);
      }
    },
    {
      name: 'F17.4: Preserves Vietnamese diacritics in UTF-8 without mojibake or corruption',
      fn: async () => {
        const mod = ModuleLoader.loadScriptInContext('src/epub/epub-packer.js');
        assert.ok(mod.loaded, 'epub-packer.js required');
        const EpubPacker = mod.exports.EpubPacker || mod.sandbox.EpubPacker;
        const packer = new EpubPacker();

        const viTitle = 'Đại Vũ Trụ: Chiếc Áo Gấm';
        const viContent = '<p>Trăm năm trong cõi người ta, chữ tài chữ mệnh khéo là ghét nhau. Trải qua một cuộc bể dâu, những điều trông thấy mà đau đớn lòng.</p>';

        const blob = await packer.createEpub(
          { title: viTitle, author: 'Nguyễn Du' },
          [{ chapterNumber: 1, title: 'Chương 1: Đoạn Trường Tân Thanh', contentHtml: viContent }]
        );
        const arrayBuf = typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : blob;
        const validator = new EpubValidator(Buffer.from(arrayBuf));

        const chEntry = Array.from(validator.entryMap.values()).find((e) => e.name.endsWith('.xhtml') && e.name.includes('chapter'));
        const text = chEntry.getText('utf-8');

        assert.includes(text, 'Đoạn Trường Tân Thanh', 'Vietnamese chapter title preserved');
        assert.includes(text, 'Trăm năm trong cõi người ta', 'Vietnamese text body preserved');
        assert.includes(text, 'bể dâu', 'Vietnamese tone marks preserved');
      }
    },
    {
      name: 'F17.5: All packaged XHTML chapters pass strict XML well-formedness validation',
      fn: async () => {
        const mod = ModuleLoader.loadScriptInContext('src/epub/epub-packer.js');
        assert.ok(mod.loaded, 'epub-packer.js required');
        const EpubPacker = mod.exports.EpubPacker || mod.sandbox.EpubPacker;
        const packer = new EpubPacker();

        const chapters = [1, 2, 3].map((i) => ({
          chapterNumber: i,
          title: `Chương ${i}: Hành trình bí ẩn`,
          contentHtml: `<p>Nội dung chi tiết của chương ${i} với các định dạng <b>đậm</b>, <i>nghiêng</i> và danh sách:</p><ul><li>Vật phẩm 1</li><li>Vật phẩm 2</li></ul>`
        }));

        const blob = await packer.createEpub({ title: 'Full Novel', author: 'Author' }, chapters);
        const arrayBuf = typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : blob;
        const validator = new EpubValidator(Buffer.from(arrayBuf));

        const chVal = validator.validateChapters();
        assert.strictEqual(chVal.passed, true, `All chapters must be strictly XML valid: ${chVal.issues.join('; ')}`);
        assert.strictEqual(chVal.chapterCount, 3, 'All 3 chapters validated');
      }
    }
  ]
};
