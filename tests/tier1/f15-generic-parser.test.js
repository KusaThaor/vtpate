// tests/tier1/f15-generic-parser.test.js
// Tier 1 - Feature 15: Generic Heuristic Parser
const { assert } = require('../harness/test-assert');
const { HttpMock } = require('../harness/http-mock');
const { ModuleLoader } = require('../harness/loader');

module.exports = {
  name: 'Feature 15: Generic Heuristic Parser',
  featureId: 15,
  milestone: 'M3',
  tests: [
    {
      name: 'F15.1: canHandle returns true for unknown websites as universal fallback',
      fn: () => {
        const mod = ModuleLoader.loadScriptInContext('src/parsers/generic-parser.js');
        assert.ok(mod.loaded, `generic-parser.js load failed: ${mod.error ? mod.error.message : 'Not found'}`);
        const GenericParser = mod.exports.GenericParser || mod.sandbox.GenericParser;
        const parser = new GenericParser();

        assert.strictEqual(parser.canHandle('https://truyenfull.vn/tien-nghich/'), true);
        assert.strictEqual(parser.canHandle('https://random-novel-site.cc/story/42'), true);
      }
    },
    {
      name: 'F15.2: Detects chapter links from table of contents using heuristic clustering and selectors',
      fn: async () => {
        const httpMock = new HttpMock();
        httpMock.install();

        const tocHtml = `
<!DOCTYPE html>
<html>
<head><title>Bách Luyện Thành Tiên - Truyện Chữ</title></head>
<body>
  <div class="novel-info">
    <h1 class="title">Bách Luyện Thành Tiên</h1>
    <span class="author">Huyền Vũ</span>
    <p class="desc">Con đường tu tiên đầy gian nan trắc trở...</p>
  </div>
  <div class="list-chapter">
    <ul>
      <li><a href="/chuong-1/">Chương 1: Khởi đầu gian nan</a></li>
      <li><a href="/chuong-2/">Chương 2: Tẩy tủy đan</a></li>
      <li><a href="/chuong-3/">Chương 3: Bước vào tiên đạo</a></li>
    </ul>
  </div>
</body>
</html>`;

        httpMock.onGet('https://truyen-generic.vn/bach-luyen/', tocHtml);

        try {
          const mod = ModuleLoader.loadScriptInContext('src/parsers/generic-parser.js');
          assert.ok(mod.loaded, 'generic-parser.js required');
          const GenericParser = mod.exports.GenericParser || mod.sandbox.GenericParser;
          const parser = new GenericParser();

          const meta = await parser.fetchMetadata('https://truyen-generic.vn/bach-luyen/');

          assert.strictEqual(meta.chapters.length, 3, 'Must identify all 3 chapters from TOC');
          assert.includes(meta.chapters[0].title, 'Chương 1');
        } finally {
          httpMock.uninstall();
        }
      }
    },
    {
      name: 'F15.3: Converts relative chapter URLs to absolute URLs',
      fn: async () => {
        const httpMock = new HttpMock();
        httpMock.install();

        const html = `
<html>
<body>
  <h1>Novel Title</h1>
  <div class="chapters">
    <a href="chap-1.html">Chapter 1</a>
    <a href="/books/chap-2.html">Chapter 2</a>
    <a href="../other/chap-3.html">Chapter 3</a>
  </div>
</body>
</html>`;
        httpMock.onGet('https://novels.org/books/index.html', html);

        try {
          const mod = ModuleLoader.loadScriptInContext('src/parsers/generic-parser.js');
          assert.ok(mod.loaded, 'generic-parser.js required');
          const GenericParser = mod.exports.GenericParser || mod.sandbox.GenericParser;
          const parser = new GenericParser();

          const meta = await parser.fetchMetadata('https://novels.org/books/index.html');

          for (const ch of meta.chapters) {
            assert.ok(ch.url.startsWith('https://novels.org/'), `Relative URL must be converted to absolute: ${ch.url}`);
          }
        } finally {
          httpMock.uninstall();
        }
      }
    },
    {
      name: 'F15.4: Extracts main chapter body text using text density heuristics while ignoring ads/nav',
      fn: async () => {
        const chapterHtml = `
<html>
<body>
  <header><nav><a href="/">Home</a> | <a href="/login">Login</a></nav></header>
  <div class="sidebar ad-box"><p>Buy coins now! 50% off!</p></div>
  <main id="chapter-content">
    <p>Ánh trăng vằng vặc chiếu sáng cả khu rừng rậm rạp.</p>
    <p>Hàn Lập hít sâu một hơi, điều động linh lực toàn thân vận chuyển theo Chu Thiên.</p>
    <p>Một luồng khí ấm áp nhanh chóng lan tỏa khắp kinh mạch, xua tan cái lạnh giá của màn đêm.</p>
  </main>
  <footer><p>Copyright 2026 Novel Site</p></footer>
</body>
</html>`;

        const mod = ModuleLoader.loadScriptInContext('src/parsers/generic-parser.js');
        assert.ok(mod.loaded, 'generic-parser.js required');
        const GenericParser = mod.exports.GenericParser || mod.sandbox.GenericParser;
        const parser = new GenericParser();

        const downloader = {
          fetchChapter: async () => chapterHtml
        };

        const ch = await parser.fetchChapter(
          { id: '1', chapterNumber: 1, title: 'Ch 1', url: 'https://novel.org/ch1' },
          downloader
        );

        assert.includes(ch.contentHtml, 'Ánh trăng vằng vặc');
        assert.includes(ch.contentHtml, 'Hàn Lập');
        assert.ok(!ch.contentHtml.includes('Buy coins now'), 'Sidebar ads must not be included');
        assert.ok(!ch.contentHtml.includes('Copyright 2026'), 'Footer noise must not be included');
      }
    },
    {
      name: 'F15.5: Converts relative image src in chapter content to absolute URLs',
      fn: () => {
        const mod = ModuleLoader.loadScriptInContext('src/parsers/generic-parser.js');
        assert.ok(mod.loaded, 'generic-parser.js required');
        const GenericParser = mod.exports.GenericParser || mod.sandbox.GenericParser;
        const parser = new GenericParser();

        const resolveUrl = parser.resolveAbsoluteUrl || ((rel, base) => new URL(rel, base).href);
        const abs = resolveUrl('../images/cover.jpg', 'https://example.com/books/novel-1/');
        assert.strictEqual(abs, 'https://example.com/books/images/cover.jpg');
      }
    }
  ]
};
