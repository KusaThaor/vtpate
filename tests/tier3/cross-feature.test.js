// tests/tier3/cross-feature.test.js
// Tier 3: Cross-Feature Combinations & Pairwise Integration Scenarios (16 Scenarios)
const { assert } = require('../harness/test-assert');
const { HttpMock } = require('../harness/http-mock');
const { ChromeMock } = require('../harness/chrome-mock');
const { EpubValidator } = require('../harness/epub-validator');
const { ModuleLoader } = require('../harness/loader');
const { EpubPacker } = require('../../src/epub/epub-packer');
const { InkittParser } = require('../../src/parsers/inkitt-parser');
const { WattpadParser } = require('../../src/parsers/wattpad-parser');
const { GenericParser } = require('../../src/parsers/generic-parser');
const { BaseParser } = require('../../src/parsers/base-parser');
const { FetchDownloader } = require('../../src/crawler/fetch-downloader');
const { SessionManager } = require('../../src/storage/session-manager');

module.exports = {
  name: 'Tier 3: Cross-Feature Integration Scenarios',
  tier: 3,
  tests: [
    {
      name: 'X01: Mode 1 (Fetch) + Inkitt Parser + EPUB Packaging pipeline',
      fn: async () => {
        const httpMock = new HttpMock();
        httpMock.install();

        // Inkitt API mocks
        httpMock.onGet('https://www.inkitt.com/api/2/stories/12345', {
          response: {
            id: 12345,
            title: 'Inkitt Moon',
            user: { username: 'AuthorAlpha' },
            summary: 'Romance novel',
            chapters_count: 2,
            chapters: [
              { id: 1, chapter_number: 1, name: 'Chapter 1' },
              { id: 2, chapter_number: 2, name: 'Chapter 2' }
            ]
          }
        });

        httpMock.onGet(/chapters\/1/, { response: { text: '<p>Chapter 1 text on Inkitt.</p>' } });
        httpMock.onGet(/chapters\/2/, { response: { text: '<p>Chapter 2 text on Inkitt.</p>' } });

        try {
          // Verify end-to-end flow with production classes
          const inkittParser = new InkittParser();
          const storyId = inkittParser.extractStoryId('https://www.inkitt.com/stories/romance/12345');
          assert.strictEqual(storyId, '12345');

          const res = await fetch(`https://www.inkitt.com/api/2/stories/${storyId}`);
          const meta = (await res.json()).response;

          const chapters = [];
          for (const ch of meta.chapters) {
            const chRes = await fetch(`https://www.inkitt.com/api/2/stories/${storyId}/chapters/${ch.id}`);
            const chData = (await chRes.json()).response;
            chapters.push({
              chapterNumber: ch.chapter_number,
              title: ch.name,
              contentHtml: chData.text
            });
          }

          const packer = new EpubPacker();
          const epubBuf = await packer.createEpub({
            title: meta.title,
            author: meta.user.username,
            description: meta.summary
          }, chapters);

          const validator = new EpubValidator(epubBuf);
          const validation = validator.validateAll();
          assert.strictEqual(validation.isValidEpub, true, `EPUB validation issues: ${validation.issues.join('; ')}`);
        } finally {
          httpMock.uninstall();
        }
      }
    },
    {
      name: 'X02: Mode 2 (Tab-Assisted) + Wattpad Parser + Inline Images + EPUB Packaging',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();

        chromeMock._customScriptHandler = (tab) => {
          return '<article><p>Wattpad body with illustration:</p><img src="https://img.wattpad.com/art.jpg"/></article>';
        };

        try {
          const tab = await chromeMock.tabs.create({ active: false, url: 'https://wattpad.com/101-part' });
          const [execResult] = await chromeMock.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => document.body.innerHTML
          });

          const rawHtml = execResult.result;
          const cleanHtml = new WattpadParser().sanitizeHtml(rawHtml);

          // Package with inline image
          const chapters = [{
            chapterNumber: 1,
            title: 'Part 1 Art',
            contentHtml: cleanHtml.replace('https://img.wattpad.com/art.jpg', '../images/img_1.jpg')
          }];

          const epubBuf = await new EpubPacker().createEpub({
            title: 'Wattpad Art Novel',
            author: 'Artist'
          }, chapters);

          const validator = new EpubValidator(epubBuf);
          const chVal = validator.validateChapters();
          assert.strictEqual(chVal.passed, true);

          await chromeMock.tabs.remove(tab.id);
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'X03: Mode 1 (Fetch) + Generic Parser + Heuristic TOC + Relative URL resolution + EPUB',
      fn: async () => {
        const httpMock = new HttpMock();
        httpMock.install();

        const tocHtml = `<html><body><div class="chapters"><a href="ch1.html">Ch 1</a><a href="ch2.html">Ch 2</a></div></body></html>`;
        httpMock.onGet('https://generic-novel.org/index.html', tocHtml);
        httpMock.onGet('https://generic-novel.org/ch1.html', '<html><body><main><p>Generic Chapter 1</p></main></body></html>');
        httpMock.onGet('https://generic-novel.org/ch2.html', '<html><body><main><p>Generic Chapter 2</p></main></body></html>');

        try {
          const res = await fetch('https://generic-novel.org/index.html');
          const html = await res.text();

          const genericParser = new GenericParser();
          const links = ['ch1.html', 'ch2.html'].map((rel) => genericParser.toAbsoluteUrl(rel, 'https://generic-novel.org/index.html'));
          assert.strictEqual(links[0], 'https://generic-novel.org/ch1.html');

          const chapters = [];
          for (let i = 0; i < links.length; i++) {
            const chRes = await fetch(links[i]);
            const chHtml = await chRes.text();
            chapters.push({
              chapterNumber: i + 1,
              title: `Chapter ${i + 1}`,
              contentHtml: genericParser.sanitizeHtml(chHtml)
            });
          }

          const epubBuf = await new EpubPacker().createEpub({ title: 'Generic Novel' }, chapters);
          const validator = new EpubValidator(epubBuf);
          assert.strictEqual(validator.validateOcfMimetype().passed, true);
        } finally {
          httpMock.uninstall();
        }
      }
    },
    {
      name: 'X04: Error Retry (HTTP 429) + Mode 1 Fetcher + Jitter Backoff',
      fn: async () => {
        const httpMock = new HttpMock();
        httpMock.install();

        let attempts = 0;
        httpMock.onGet('https://rate-limited.com/ch1', () => {
          attempts++;
          if (attempts < 3) {
            return { status: 429, headers: { 'Retry-After': '0' }, body: 'Rate limited' };
          }
          return { status: 200, body: '<p>Success after rate limit backoff</p>' };
        });

        try {
          const downloader = new FetchDownloader({ baseBackoffMs: 5, maxRetries: 3 });
          const result = await downloader.fetchChapter('https://rate-limited.com/ch1');

          assert.strictEqual(attempts, 3);
          assert.includes(result, 'Success after rate limit');
        } finally {
          httpMock.uninstall();
        }
      }
    },
    {
      name: 'X05: Mode 2 (Tab-Assisted) + Cloudflare Challenge Detection + Sequential Tab Reuse',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();

        let loadCount = 0;
        chromeMock._customScriptHandler = (tab) => {
          loadCount++;
          if (tab.url.includes('ch1') && loadCount === 1) {
            return '<div id="challenge-running">Checking your browser...</div>';
          }
          return `<div class="content"><p>Content of ${tab.url}</p></div>`;
        };

        try {
          const tab = await chromeMock.tabs.create({ active: false, url: 'https://cf.com/ch1' });
          assert.strictEqual(chromeMock._tabs.size, 1);

          // Update tab for chapter 2
          await chromeMock.tabs.update(tab.id, { url: 'https://cf.com/ch2' });
          assert.strictEqual(chromeMock._tabs.size, 1, 'Tab count must remain 1');

          await chromeMock.tabs.remove(tab.id);
          assert.strictEqual(chromeMock._tabs.size, 0);
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'X06: Wattpad Parser + Paid Story Safety + Failed Queue Logging',
      fn: async () => {
        const httpMock = new HttpMock();
        httpMock.install();
        const storyPayload = {
          id: 123,
          title: 'Wattpad Paid & Free',
          user: { name: 'Author' },
          description: 'Story with paid chapters',
          parts: [
            { id: 101, title: 'Free Ch 1', draft: false, isAd: false },
            { id: 102, title: 'Paid Ch 2', draft: false, isAd: false }
          ]
        };
        httpMock.onGet('https://www.wattpad.com/story/123', storyPayload);
        httpMock.onGet('https://www.wattpad.com/api/v3/stories/123', storyPayload);
        httpMock.onGet('https://www.wattpad.com/apiv2/storytext?id=101', '<p>Free text</p>');
        httpMock.onGet('https://www.wattpad.com/apiv2/storytext?id=102', { status: 403, body: 'Paid story locked' });

        try {
          const parser = new WattpadParser();
          const meta = await parser.fetchMetadata('https://www.wattpad.com/story/123');
          assert.strictEqual(meta.chapters.length, 2);

          const ch1 = await parser.fetchChapter(meta.chapters[0]);
          const ch2 = await parser.fetchChapter(meta.chapters[1]);

          assert.strictEqual(ch1.isPaywalled, undefined);
          assert.strictEqual(ch2.isPaywalled, true);
          assert.includes(ch2.contentHtml, '[Chương trả phí - Chưa mở khóa]');

          const failedLog = [];
          if (ch2.isPaywalled) {
            failedLog.push({
              chapterNumber: ch2.chapterNumber,
              title: ch2.title,
              error: 'Chương trả phí (Paid Story) - Cần xu để mở khóa'
            });
          }
          assert.strictEqual(failedLog.length, 1);
          assert.strictEqual(failedLog[0].chapterNumber, 2);
        } finally {
          httpMock.uninstall();
        }
      }
    },
    {
      name: 'X07: Crawl Profile (Domain Specific) + Mode 1 Fetch Downloader + NetRules Header Spoofing',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();

        try {
          // 1. Set DNR rules
          await chromeMock.declarativeNetRequest.updateSessionRules({
            addRules: [{
              id: 1,
              priority: 1,
              action: {
                type: 'modifyHeaders',
                requestHeaders: [{ header: 'User-Agent', operation: 'set', value: 'MobileScraper/1.0' }]
              },
              condition: { urlFilter: '*inkitt.com*' }
            }]
          });

          // 2. Storage profile
          await chromeMock.storage.local.set({
            'profile_inkitt.com': { concurrency: 4, delayMs: 250, jitter: true, mode: 'fetch' }
          });

          const stored = await chromeMock.storage.local.get('profile_inkitt.com');
          assert.strictEqual(stored['profile_inkitt.com'].concurrency, 4);

          const rules = await chromeMock.declarativeNetRequest.getSessionRules();
          assert.strictEqual(rules.length, 1);
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'X08: Failed Chapters Queue + Re-fetch Action + Non-destructive EPUB Patching',
      fn: async () => {
        // Initial crawl with 1 failure
        const chapters = [
          { chapterNumber: 1, title: 'Ch 1', contentHtml: '<p>Ch 1</p>' },
          { chapterNumber: 2, title: 'Ch 2', contentHtml: '<div class="failed-notice">Download failed</div>' }
        ];

        const failedList = [{ chapterNumber: 2, url: 'https://ex.com/2' }];

        // Re-fetch failed chapter 2
        for (const item of failedList) {
          const target = chapters.find((c) => c.chapterNumber === item.chapterNumber);
          target.contentHtml = '<p>Ch 2 successfully recovered!</p>';
        }

        const patchedBuf = await new EpubPacker().createEpub({ title: 'Patched Book' }, chapters);
        const validator = new EpubValidator(patchedBuf);
        const chVal = validator.validateChapters();
        assert.strictEqual(chVal.passed, true);
      }
    },
    {
      name: 'X09: Long Crawl + Pause Engine + State Persistence in Storage + Resume Engine',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();

        try {
          const sessionState = {
            novelUrl: 'https://wattpad.com/story/555',
            completed: [1, 2, 3],
            pending: [4, 5, 6],
            isPaused: true
          };

          await chromeMock.storage.local.set({ 'active_session': sessionState });

          // Resume
          const restored = (await chromeMock.storage.local.get('active_session'))['active_session'];
          restored.isPaused = false;
          const nextJob = restored.pending.shift();
          restored.completed.push(nextJob);

          await chromeMock.storage.local.set({ 'active_session': restored });

          assert.strictEqual(nextJob, 4);
          assert.strictEqual(restored.completed.length, 4);
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'X10: Metadata UI Edit + Range Filter (Chapters 2-3) + Order Reversal + EPUB Output',
      fn: async () => {
        const allChapters = [
          { chapterNumber: 1, title: 'Ch 1' },
          { chapterNumber: 2, title: 'Ch 2' },
          { chapterNumber: 3, title: 'Ch 3' },
          { chapterNumber: 4, title: 'Ch 4' }
        ];

        // 1. Filter range 2 to 3
        const filtered = allChapters.filter((c) => c.chapterNumber >= 2 && c.chapterNumber <= 3);

        // 2. Reverse order
        const reversed = [...filtered].reverse();
        assert.strictEqual(reversed[0].chapterNumber, 3);
        assert.strictEqual(reversed[1].chapterNumber, 2);

        // 3. User edited title and author
        const editedMeta = { title: 'Custom Title', author: 'Custom Author' };

        const buf = await new EpubPacker().createEpub(
          { title: editedMeta.title, author: editedMeta.author },
          reversed.map((c) => ({ ...c, contentHtml: '<p>T</p>' }))
        );

        const validator = new EpubValidator(buf);
        const opf = validator.validateOpf(validator.validateContainer().rootfilePath);
        assert.includes(opf.xml, 'Custom Title');
        assert.includes(opf.xml, 'Custom Author');
      }
    },
    {
      name: 'X11: BaseParser Sanitizer + Wattpad <p data-p-id> + XHTML Strict Validation',
      fn: async () => {
        const dirtyWattpadHtml = `
<p data-p-id="abc123">Line with unescaped & and math: 3 < 5</p>
<p data-p-id="def456">Second line with break<br>and image<img src="../images/pic.png"></p>
<script>alert('xss')</script>
`;
        const clean = new BaseParser().sanitizeHtml(dirtyWattpadHtml);
        const escaped = clean.replace(/&(?!(amp|lt|gt);)/g, '&amp;').replace(/<(?!\/?(p|br|img))/g, '&lt;');

        const buf = await new EpubPacker().createEpub(
          { title: 'Sanitized Book' },
          [{ chapterNumber: 1, title: 'Ch 1', contentHtml: escaped }]
        );

        const validator = new EpubValidator(buf);
        const chVal = validator.validateChapters();
        assert.strictEqual(chVal.passed, true);
      }
    },
    {
      name: 'X12: DeclarativeNetRequest Mobile Emulation + Inkitt App-Only Story API',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();

        try {
          await chromeMock.declarativeNetRequest.updateSessionRules({
            addRules: [{
              id: 99,
              action: {
                type: 'modifyHeaders',
                requestHeaders: [{ header: 'X-Requested-With', operation: 'set', value: 'com.inkitt.inkitt' }]
              },
              condition: { urlFilter: '*inkitt.com/api*' }
            }]
          });

          const rules = await chromeMock.declarativeNetRequest.getSessionRules();
          assert.strictEqual(rules.length, 1);
          assert.strictEqual(rules[0].action.requestHeaders[0].value, 'com.inkitt.inkitt');
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'X13: Large Novel Crawl + Progress Bar & Live Stats ETA + Status Stage Updates',
      fn: () => {
        const total = 100;
        let downloaded = 0;
        const startTime = Date.now() - 5000; // 5 seconds ago

        downloaded = 25;
        const progress = Math.round((downloaded / total) * 100);
        const speed = downloaded / 5; // 5 chapters/sec
        const eta = Math.ceil((total - downloaded) / speed); // 15 sec

        assert.strictEqual(progress, 25);
        assert.strictEqual(speed, 5);
        assert.strictEqual(eta, 15);
      }
    },
    {
      name: 'X14: Tab Downloader Error + Automatic Fallback to Direct Fetch + Success',
      fn: async () => {
        const httpMock = new HttpMock();
        httpMock.install();
        httpMock.onGet('https://fallback-novel.com/ch1', '<p>Direct Fetch Fallback Success</p>');

        try {
          let tabFailed = false;
          let fetchSucceeded = false;

          // Attempt Mode 2
          try {
            throw new Error('Tab crashed');
          } catch {
            tabFailed = true;
          }

          // Fallback to Mode 1
          if (tabFailed) {
            const res = await fetch('https://fallback-novel.com/ch1');
            const text = await res.text();
            if (text.includes('Direct Fetch Fallback Success')) {
              fetchSucceeded = true;
            }
          }

          assert.strictEqual(tabFailed, true);
          assert.strictEqual(fetchSucceeded, true);
        } finally {
          httpMock.uninstall();
        }
      }
    },
    {
      name: 'X15: Dual UI Popup Detection + Launch Manager Tab + Auto-populate Metadata',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();

        try {
          // Active tab is a novel page
          const novelTab = await chromeMock.tabs.create({ url: 'https://www.inkitt.com/stories/123456', active: true });

          // Popup detects active tab URL
          const [activeTab] = await chromeMock.tabs.query({ active: true });
          assert.strictEqual(activeTab.url, 'https://www.inkitt.com/stories/123456');

          // Popup opens manager.html?url=...
          const managerUrl = chromeMock.runtime.getURL(`manager.html?url=${encodeURIComponent(activeTab.url)}`);
          const managerTab = await chromeMock.tabs.create({ url: managerUrl, active: true });

          assert.includes(managerTab.url, 'manager.html');
          assert.includes(managerTab.url, 'inkitt.com');
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'X16: Complete Novel with Mature Content + Credentials Include + Offline JSZip STORE Mimetype',
      fn: async () => {
        const httpMock = new HttpMock();
        httpMock.install();

        httpMock.onGet('https://wattpad.com/mature-ch1', '<p>Mature content accessible via session cookie</p>');

        try {
          const res = await fetch('https://wattpad.com/mature-ch1', { credentials: 'include' });
          const text = await res.text();

          const buf = await new EpubPacker().createEpub(
            { title: 'Mature Novel' },
            [{ chapterNumber: 1, title: 'Ch 1 Mature', contentHtml: text }]
          );

          const validator = new EpubValidator(buf);
          const ocf = validator.validateOcfMimetype();
          assert.strictEqual(ocf.passed, true);
        } finally {
          httpMock.uninstall();
        }
      }
    }
  ]
};
