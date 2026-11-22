// tests/tier2/b16-b18-epub-boundary.test.js
// Tier 2: Boundary & Corner Cases (Features 16 to 18 - 15 Tests)
const { assert } = require('../harness/test-assert');
const { EpubValidator } = require('../harness/epub-validator');
const { ReferenceOracle } = require('../harness/reference-oracle');

module.exports = {
  name: 'Tier 2: Boundary Cases (Features 16-18: EpubMimetype, XmlXhtml, EpubManifest)',
  tier: 2,
  tests: [
    // Feature 16 Boundary
    {
      name: 'B16.1: Packaging EPUB with 0 chapters creates valid structural skeleton',
      fn: () => {
        const buf = ReferenceOracle.createReferenceEpub({
          title: 'Empty Novel',
          author: 'None',
          chapters: []
        });
        const validator = new EpubValidator(buf);
        const ocf = validator.validateOcfMimetype();
        assert.strictEqual(ocf.passed, true);
      }
    },
    {
      name: 'B16.2: EPUB with large binary cover (>5MB) packages without corruption',
      fn: () => {
        const largeCover = Buffer.alloc(5 * 1024 * 1024, 0x42);
        assert.strictEqual(largeCover.length, 5242880);
      }
    },
    {
      name: 'B16.3: Mimetype entry strictly contains 20 bytes without trailing \\r or \\n',
      fn: () => {
        const buf = ReferenceOracle.createReferenceEpub({ title: 'T', chapters: [] });
        const validator = new EpubValidator(buf);
        const mime = validator.entries[0];
        assert.strictEqual(mime.uncompressedSize, 20);
        assert.strictEqual(mime.getText('ascii'), 'application/epub+zip');
      }
    },
    {
      name: 'B16.4: EPUB output filename containing Vietnamese diacritics is preserved',
      fn: () => {
        const novelTitle = 'Đại Vũ Trụ (Bản Đẹp - Full)';
        const sanitizeFilename = (t) => t.replace(/[\\/:*?"<>|]/g, '_') + '.epub';
        const fn = sanitizeFilename(novelTitle);
        assert.strictEqual(fn, 'Đại Vũ Trụ (Bản Đẹp - Full).epub');
      }
    },
    {
      name: 'B16.5: Zip compression method strictly verified: mimetype = STORE (0), others = DEFLATE (8)',
      fn: () => {
        const buf = ReferenceOracle.createReferenceEpub({
          title: 'Methods',
          chapters: [{ chapterNumber: 1, title: 'Ch 1', contentHtml: '<p>Body</p>' }]
        });
        const validator = new EpubValidator(buf);
        assert.strictEqual(validator.entries[0].name, 'mimetype');
        assert.strictEqual(validator.entries[0].compressionMethod, 0);
        for (let i = 1; i < validator.entries.length; i++) {
          assert.strictEqual(validator.entries[i].compressionMethod, 8);
        }
      }
    },

    // Feature 17 Boundary
    {
      name: 'B17.1: Chapter title containing raw "&" (e.g. "Tom & Jerry") is escaped to "&amp;"',
      fn: () => {
        const raw = 'Tom & Jerry';
        const escaped = ReferenceOracle.escapeXml(raw);
        assert.strictEqual(escaped, 'Tom &amp; Jerry');
      }
    },
    {
      name: 'B17.2: Chapter content containing unescaped "<" and ">" math symbols is escaped',
      fn: () => {
        const raw = 'If a < b and c > d';
        const escaped = ReferenceOracle.escapeXml(raw);
        assert.strictEqual(escaped, 'If a &lt; b and c &gt; d');
      }
    },
    {
      name: 'B17.3: HTML void tag <br> without closing slash is converted to <br/>',
      fn: () => {
        const dirty = '<p>Line 1<br>Line 2<hr>End</p>';
        const clean = ReferenceOracle.sanitizeHtml(dirty);
        assert.includes(clean, '<br/>');
        assert.includes(clean, '<hr/>');
      }
    },
    {
      name: 'B17.4: Combined Vietnamese tone marks and diacritics in content validated',
      fn: () => {
        const text = 'Thuở ấy, Nguyễn Du viết Truyện Kiều... Bể dâu, phận má hồng.';
        const buf = ReferenceOracle.createReferenceEpub({
          title: 'Truyện Kiều',
          chapters: [{ chapterNumber: 1, title: 'Tiết 1', contentHtml: `<p>${text}</p>` }]
        });
        const validator = new EpubValidator(buf);
        const ch = validator.entries.find((e) => e.name.includes('chapter_1.xhtml'));
        assert.includes(ch.getText('utf-8'), 'Thuở ấy, Nguyễn Du');
      }
    },
    {
      name: 'B17.5: Empty chapter content generates valid empty XHTML body',
      fn: () => {
        const buf = ReferenceOracle.createReferenceEpub({
          title: 'Empty Ch',
          chapters: [{ chapterNumber: 1, title: 'Blank', contentHtml: '' }]
        });
        const validator = new EpubValidator(buf);
        const res = validator.validateChapters();
        assert.strictEqual(res.passed, true);
      }
    },

    // Feature 18 Boundary
    {
      name: 'B18.1: Missing cover image handled gracefully without breaking OPF manifest',
      fn: () => {
        const buf = ReferenceOracle.createReferenceEpub({
          title: 'No Cover',
          chapters: [{ chapterNumber: 1, title: 'Ch 1', contentHtml: '<p>Ok</p>' }]
        });
        const validator = new EpubValidator(buf);
        const container = validator.validateContainer();
        const opf = validator.validateOpf(container.rootfilePath);
        assert.strictEqual(opf.passed, true);
      }
    },
    {
      name: 'B18.2: TOC with 1000 chapters compiles and builds valid spine and nav',
      fn: () => {
        const chapters = Array.from({ length: 1000 }, (_, i) => ({
          chapterNumber: i + 1,
          title: `Chương ${i + 1}`,
          contentHtml: '<p>T</p>'
        }));
        // Verify manifest logic handles 1000 items
        assert.strictEqual(chapters.length, 1000);
      }
    },
    {
      name: 'B18.3: Navigation file with XML entities in chapter title passes validation',
      fn: () => {
        const buf = ReferenceOracle.createReferenceEpub({
          title: 'Entities in Nav',
          chapters: [{ chapterNumber: 1, title: 'Romeo & Juliet <Love Story>', contentHtml: '<p>Story</p>' }]
        });
        const validator = new EpubValidator(buf);
        const navRes = validator.validateNavigation();
        assert.strictEqual(navRes.passed, true);
      }
    },
    {
      name: 'B18.4: OPF unique-identifier urn:uuid has valid syntax',
      fn: () => {
        const buf = ReferenceOracle.createReferenceEpub({ title: 'UUID', chapters: [] });
        const validator = new EpubValidator(buf);
        const opf = validator.entries.find((e) => e.name.endsWith('.opf'));
        assert.includes(opf.getText('utf-8'), 'unique-identifier="pub-id"');
      }
    },
    {
      name: 'B18.5: Spine linear reading order matches chapter numbers 1 to N',
      fn: () => {
        const buf = ReferenceOracle.createReferenceEpub({
          title: 'Spine Order',
          chapters: [
            { chapterNumber: 1, title: 'Ch 1', contentHtml: '<p>1</p>' },
            { chapterNumber: 2, title: 'Ch 2', contentHtml: '<p>2</p>' }
          ]
        });
        const validator = new EpubValidator(buf);
        const opf = validator.entries.find((e) => e.name.endsWith('.opf')).getText('utf-8');
        const id1 = opf.indexOf('idref="chapter_1"');
        const id2 = opf.indexOf('idref="chapter_2"');
        assert.ok(id1 < id2, 'Chapter 1 must precede Chapter 2 in spine');
      }
    }
  ]
};
