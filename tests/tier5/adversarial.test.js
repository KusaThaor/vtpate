// tests/tier5/adversarial.test.js
// Tier 5: Adversarial Stress-Testing & Edge-Case Suite for VTPATE Studio
const { assert } = require('../harness/test-assert');
const { HttpMock } = require('../harness/http-mock');
const { ChromeMock } = require('../harness/chrome-mock');
const { EpubValidator, parseZipEntries } = require('../harness/epub-validator');
const { ReferenceOracle } = require('../harness/reference-oracle');
const { ModuleLoader } = require('../harness/loader');

module.exports = {
  name: 'Tier 5: Adversarial Stress-Testing & Edge Cases',
  tier: 5,
  tests: [
    {
      name: 'ADV-01: High Concurrency Burst (10 workers, 0ms delay, 50 chapters) with zero starvation or race conditions',
      fn: async () => {
        const httpMock = new HttpMock();
        httpMock.install();

        let activeConcurrent = 0;
        let peakConcurrent = 0;
        let completedCount = 0;

        httpMock.onGet(/ch_\d+/, async (url) => {
          activeConcurrent++;
          if (activeConcurrent > peakConcurrent) peakConcurrent = activeConcurrent;
          // Micro delay to simulate concurrent flight
          await new Promise((r) => setTimeout(r, 10));
          activeConcurrent--;
          completedCount++;
          return `<html><body>Content of ${url}</body></html>`;
        });

        try {
          const modCrawler = ModuleLoader.loadScriptInContext('src/crawler/crawl-engine.js');
          const modDownloader = ModuleLoader.loadScriptInContext('src/crawler/fetch-downloader.js');
          assert.ok(modCrawler.loaded, 'crawl-engine must load');
          assert.ok(modDownloader.loaded, 'fetch-downloader must load');

          const CrawlEngine = modCrawler.exports.CrawlEngine || modCrawler.sandbox.CrawlEngine;
          const FetchDownloader = modDownloader.exports.FetchDownloader || modDownloader.sandbox.FetchDownloader;

          const downloader = new FetchDownloader({
            concurrency: 10,
            delayMs: 0,
            jitter: false
          });

          const engine = new CrawlEngine({ downloader });

          const chapters = Array.from({ length: 50 }, (_, i) => ({
            id: `ch_${i + 1}`,
            chapterNumber: i + 1,
            title: `Chapter ${i + 1}`,
            url: `https://stress-test.novel/ch_${i + 1}`
          }));

          const result = await engine.startCrawl({ chapters });

          assert.strictEqual(result.completed.length, 50, 'All 50 chapters must be completed');
          assert.strictEqual(result.failed.length, 0, 'Zero chapters should fail under clean concurrency');
          assert.ok(peakConcurrent >= 2, `Concurrency pool must process in parallel (peak was ${peakConcurrent})`);
          assert.ok(peakConcurrent <= 10, `Concurrency pool must never exceed configured 10 (peak was ${peakConcurrent})`);
        } finally {
          httpMock.uninstall();
        }
      }
    },
    {
      name: 'ADV-02: HTTP 429/503 Network Storm with Jittered Backoff and Max Retry Exhaustion',
      fn: async () => {
        const httpMock = new HttpMock();
        httpMock.install();

        // Target 1: Fails twice with 429 then recovers on 3rd attempt
        let attempts429 = 0;
        httpMock.onGet('https://storm.novel/recover-429', () => {
          attempts429++;
          if (attempts429 < 3) {
            return {
              status: 429,
              statusText: 'Too Many Requests',
              headers: { 'Retry-After': '0.05' },
              body: 'Rate limited'
            };
          }
          return { status: 200, body: '<html><body>Recovered 429</body></html>' };
        });

        // Target 2: Continuously returns 503 Service Unavailable, exhausting maxRetries (3)
        let attempts503 = 0;
        httpMock.onGet('https://storm.novel/fail-503', () => {
          attempts503++;
          return { status: 503, statusText: 'Service Unavailable', body: 'Down' };
        });

        try {
          const modDownloader = ModuleLoader.loadScriptInContext('src/crawler/fetch-downloader.js');
          assert.ok(modDownloader.loaded, 'fetch-downloader must load');
          const FetchDownloader = modDownloader.exports.FetchDownloader || modDownloader.sandbox.FetchDownloader;

          const downloader = new FetchDownloader({
            concurrency: 2,
            delayMs: 0,
            maxRetries: 3,
            baseBackoffMs: 20,
            jitter: true
          });

          // Test 1: Successful recovery after rate limit
          const recovered = await downloader.fetchChapter('https://storm.novel/recover-429');
          assert.includes(recovered, 'Recovered 429');
          assert.strictEqual(attempts429, 3, 'Must attempt 3 times (initial + 2 retries)');

          // Test 2: Clean error propagation after 3 retries exhausted
          let threwError = false;
          try {
            await downloader.fetchChapter('https://storm.novel/fail-503');
          } catch (err) {
            threwError = true;
            assert.includes(err.message, '503', 'Error must detail HTTP 503');
            assert.includes(err.message, 'retries', 'Error must detail retries exhaustion');
          }
          assert.ok(threwError, 'Must throw error after 3 retries exhausted');
          assert.strictEqual(attempts503, 4, 'Must have attempted initial (1) + 3 retries = 4 requests');
        } finally {
          httpMock.uninstall();
        }
      }
    },
    {
      name: 'ADV-03: Cloudflare Challenge Timeout & Multi-Stage Turnstile Resolution in Mode 2',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();

        let polls = 0;
        chromeMock._customScriptHandler = (tab) => {
          polls++;
          if (polls < 3) {
            // Simulated Cloudflare interstitial
            return '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body><div id="challenge-running">Checking your browser...</div></body></html>';
          }
          // Cleared DOM
          return '<!DOCTYPE html><html><body><div id="chapter-content"><p>Protected text finally revealed</p></div></body></html>';
        };

        try {
          const modTab = ModuleLoader.loadScriptInContext('src/crawler/tab-downloader.js');
          assert.ok(modTab.loaded, 'tab-downloader must load');
          const TabDownloader = modTab.exports.TabDownloader || modTab.sandbox.TabDownloader;

          const downloader = new TabDownloader({
            challengePollIntervalMs: 20,
            maxChallengeWaitMs: 5000
          });

          await downloader.initialize();
          const content = await downloader.fetchChapter('https://cf-novel.com/chapter-1');

          assert.includes(content, 'Protected text finally revealed');
          assert.ok(polls >= 3, 'Must poll until challenge resolves');

          await downloader.cleanup();
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'ADV-04: Sequential Tab Recycling Memory Safety (zero tab leaks across 20 chapters)',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();

        chromeMock._customScriptHandler = (tab) => `<html><body>Chapter at ${tab.url}</body></html>`;

        try {
          const modTab = ModuleLoader.loadScriptInContext('src/crawler/tab-downloader.js');
          const TabDownloader = modTab.exports.TabDownloader || modTab.sandbox.TabDownloader;
          const downloader = new TabDownloader();

          await downloader.initialize();

          // Crawl 20 consecutive chapters
          for (let i = 1; i <= 20; i++) {
            await downloader.fetchChapter(`https://antibot.novel/ch-${i}`);
            assert.strictEqual(chromeMock._tabs.size, 1, `Must maintain strictly 1 active tab at chapter ${i}`);
          }

          // Cleanup must close the 1 tab cleanly
          await downloader.cleanup();
          assert.strictEqual(chromeMock._tabs.size, 0, 'Tab must be completely removed upon cleanup');
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'ADV-05: Malformed HTML Sanitization (unclosed tags, nested scripts, on* handlers, data-p-id)',
      fn: () => {
        const modBase = ModuleLoader.loadScriptInContext('src/parsers/base-parser.js');
        assert.ok(modBase.loaded, 'base-parser must load');
        const BaseParser = modBase.exports.BaseParser || modBase.sandbox.BaseParser;

        const maliciousHtml = `
          <script>alert('xss');</script>
          <script src="https://evil.com/payload.js"></script>
          <style>body { display: none; }</style>
          <p data-p-id="wattpad-secret-uuid-12345" onclick="bad()" onmouseover="stealCookies()">
            Valid paragraph text with <br> unclosed break and <hr> unclosed horizontal rule.
          </p>
          <img src="https://example.com/pic.jpg" onerror="exploit()">
          <div><span>Nested unclosed markup
        `;

        const cleaned = BaseParser.sanitizeHtml(maliciousHtml);

        assert.ok(!cleaned.includes('<script'), 'Must completely eradicate script tags');
        assert.ok(!cleaned.includes('<style'), 'Must completely eradicate style tags');
        assert.ok(!cleaned.includes('onclick'), 'Must strip onclick handler');
        assert.ok(!cleaned.includes('onerror'), 'Must strip onerror handler');
        assert.ok(!cleaned.includes('data-p-id'), 'Must strip Wattpad data-p-id');
        assert.ok(cleaned.includes('<br/>'), 'Void <br> must be converted to self-closing <br/>');
        assert.ok(cleaned.includes('<hr/>'), 'Void <hr> must be converted to self-closing <hr/>');
        assert.ok(cleaned.includes('<img') && cleaned.includes('/>'), 'Void <img> must be self-closing');
      }
    },
    {
      name: 'ADV-06: Extreme Vietnamese Diacritics & Long Titles in EPUB Packaging (UTF-8 preservation)',
      fn: async () => {
        const modPacker = ModuleLoader.loadScriptInContext('src/epub/epub-packer.js');
        assert.ok(modPacker.loaded, 'epub-packer must load');
        const EpubPacker = modPacker.exports.EpubPacker || modPacker.sandbox.EpubPacker;
        const packer = new EpubPacker();

        const complexVietnameseTitle = 'Đại Vũ Trụ: Chiếc Áo Gấm Thêu Hoa & Những Cuộc Bể Dâu Khôn Nguôi (Tập 1)';
        const complexAuthor = 'Nguyễn Du & Hồ Xuân Hương';
        const complexContent = `
          <p>Trăm năm trong cõi người ta, chữ tài chữ mệnh khéo là ghét nhau.</p>
          <p>Trải qua một cuộc bể dâu, những điều trông thấy mà đau đớn lòng.</p>
          <p>Lạ gì bỉ sắc tư phong, trời xanh quen thói má hồng đánh ghen.</p>
        `;

        const metadata = {
          title: complexVietnameseTitle,
          author: complexAuthor,
          description: 'Tuyệt tác văn học kinh điển Việt Nam thế kỷ 18',
          language: 'vi'
        };

        const chapters = [{
          chapterNumber: 1,
          title: 'Chương 1: Đoạn Trường Tân Thanh & Nỗi Lòng Vương Thúy Kiều',
          contentHtml: complexContent
        }];

        const blob = await packer.createEpub(metadata, chapters);
        const arrayBuf = typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : blob;
        const validator = new EpubValidator(Buffer.from(arrayBuf));

        const validation = validator.validateAll();
        assert.strictEqual(validation.isValidEpub, true, `EPUB validation issues: ${validation.issues.join('; ')}`);

        // Verify UTF-8 preservation in chapter XHTML
        const chEntry = Array.from(validator.entryMap.values()).find((e) => e.name.endsWith('ch_1.xhtml'));
        const text = chEntry.getText('utf-8');
        assert.includes(text, 'Đoạn Trường Tân Thanh', 'Must preserve Vietnamese diacritics in title');
        assert.includes(text, 'Trăm năm trong cõi người ta', 'Must preserve Vietnamese diacritics in content');
      }
    },
    {
      name: 'ADV-07: Empty & Null Content Chapters Safely Handled without Throwing',
      fn: async () => {
        const modPacker = ModuleLoader.loadScriptInContext('src/epub/epub-packer.js');
        const EpubPacker = modPacker.exports.EpubPacker || modPacker.sandbox.EpubPacker;
        const packer = new EpubPacker();

        const chapters = [
          { chapterNumber: 1, title: 'Empty Chapter', contentHtml: '' },
          { chapterNumber: 2, title: 'Null Chapter', contentHtml: null },
          { chapterNumber: 3, title: 'Whitespace Chapter', contentHtml: '   \n\t  ' }
        ];

        const blob = await packer.createEpub({ title: 'Resilience Test', author: 'Tester' }, chapters);
        assert.ok(blob, 'Must produce valid blob even with empty chapter contents');

        const arrayBuf = typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : blob;
        const validator = new EpubValidator(Buffer.from(arrayBuf));
        const validation = validator.validateAll();
        assert.strictEqual(validation.isValidEpub, true, `Empty chapters must produce valid EPUB: ${validation.issues.join('; ')}`);
      }
    },
    {
      name: 'ADV-08: Wattpad Paid Story Lockdown (Feature 13 safety on 403 / paywall error)',
      fn: async () => {
        const httpMock = new HttpMock();
        httpMock.install();

        // Locked paid chapter returns HTTP 403
        httpMock.onGet('https://www.wattpad.com/apiv2/storytext?id=777888', {
          status: 403,
          body: JSON.stringify({ error: 'paid_story_locked', message: 'Wattpad Originals locked' })
        });

        try {
          const modWattpad = ModuleLoader.loadScriptInContext('src/parsers/wattpad-parser.js');
          assert.ok(modWattpad.loaded, 'wattpad-parser must load');
          const WattpadParser = modWattpad.exports.WattpadParser || modWattpad.sandbox.WattpadParser;
          const parser = new WattpadParser();

          const chapterItem = {
            id: '777888',
            chapterNumber: 7,
            title: 'Chương 7: Bí Kíp Võ Công',
            url: 'https://www.wattpad.com/apiv2/storytext?id=777888'
          };

          const result = await parser.fetchChapter(chapterItem, null);

          assert.strictEqual(result.isPaywalled, true, 'isPaywalled flag must be true');
          assert.includes(result.contentHtml, '[Chương trả phí - Chưa mở khóa]', 'Must include standard paywall notice');
        } finally {
          httpMock.uninstall();
        }
      }
    },
    {
      name: 'ADV-09: URL Resolution Traps (protocol-relative, root-relative, invalid schemes)',
      fn: () => {
        const modBase = ModuleLoader.loadScriptInContext('src/parsers/base-parser.js');
        const BaseParser = modBase.exports.BaseParser || modBase.sandbox.BaseParser;

        const baseUrl = 'https://novel-site.com/book/fantasy/intro.html';

        // Protocol-relative
        const url1 = BaseParser.toAbsoluteUrl('//cdn.novel-site.com/art.jpg', baseUrl);
        assert.strictEqual(url1, 'https://cdn.novel-site.com/art.jpg', 'Protocol-relative URL');

        // Root-relative
        const url2 = BaseParser.toAbsoluteUrl('/chapters/ch1.html', baseUrl);
        assert.strictEqual(url2, 'https://novel-site.com/chapters/ch1.html', 'Root-relative URL');

        // Relative path
        const url3 = BaseParser.toAbsoluteUrl('../ch2.html', baseUrl);
        assert.strictEqual(url3, 'https://novel-site.com/book/ch2.html', 'Relative path with ..');

        // Already absolute
        const url4 = BaseParser.toAbsoluteUrl('https://other.com/ch3', baseUrl);
        assert.strictEqual(url4, 'https://other.com/ch3', 'Absolute URL stays untouched');

        // Invalid relative URL does not throw
        const url5 = BaseParser.toAbsoluteUrl(':::bad-url:::', 'https://example.com');
        assert.ok(typeof url5 === 'string', 'Malformed URL string should not crash');
      }
    },
    {
      name: 'ADV-10: Strict IDPF OCF Compliance (mimetype at byte 0, STORE uncompressed 20 bytes)',
      fn: async () => {
        const modPacker = ModuleLoader.loadScriptInContext('src/epub/epub-packer.js');
        const EpubPacker = modPacker.exports.EpubPacker || modPacker.sandbox.EpubPacker;
        const packer = new EpubPacker();

        const metadata = { title: 'Compliance Book', author: 'IDPF Validator' };
        const chapters = [{ chapterNumber: 1, title: 'Chapter 1', contentHtml: '<p>Standard valid text</p>' }];

        const blob = await packer.createEpub(metadata, chapters);
        const arrayBuf = typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : blob;
        const buf = Buffer.from(arrayBuf);

        // Binary check 1: Local file header signature at offset 0
        assert.strictEqual(buf.readUInt32LE(0), 0x04034b50, 'ZIP local file header signature at offset 0');

        // Binary check 2: Compression method at offset 8 must strictly be 0 (STORE)
        const compressionMethod = buf.readUInt16LE(8);
        assert.strictEqual(compressionMethod, 0, 'mimetype compression method must be STORE (0)');

        // Binary check 3: Compressed and uncompressed size must strictly be 20 bytes
        const compressedSize = buf.readUInt32LE(18);
        const uncompressedSize = buf.readUInt32LE(22);
        assert.strictEqual(compressedSize, 20, 'mimetype compressed size must be 20');
        assert.strictEqual(uncompressedSize, 20, 'mimetype uncompressed size must be 20');

        // Binary check 4: Filename at offset 30 must be "mimetype"
        const fileNameLength = buf.readUInt16LE(26);
        const fileName = buf.toString('utf-8', 30, 30 + fileNameLength);
        assert.strictEqual(fileName, 'mimetype', 'First zip file entry name must strictly be "mimetype"');

        // Binary check 5: Content immediately following filename (extraFieldLength = 0)
        const extraFieldLength = buf.readUInt16LE(28);
        const contentStart = 30 + fileNameLength + extraFieldLength;
        const mimeContent = buf.toString('ascii', contentStart, contentStart + uncompressedSize);
        assert.strictEqual(mimeContent, 'application/epub+zip', 'mimetype content must strictly be "application/epub+zip"');
      }
    }
  ]
};
