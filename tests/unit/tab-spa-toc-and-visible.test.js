// tests/unit/tab-spa-toc-and-visible.test.js
// Verification of TabDownloader Visible Mode & In-Tab SPA Multi-Page TOC Extraction (giatocvuongtai pattern)

const assert = require('assert');
const { ChromeMock } = require('../harness/chrome-mock');
const { ModuleLoader } = require('../harness/module-loader');

describe('TabDownloader Visible Mode & In-Tab SPA Multi-Page TOC Extraction', () => {
  let chromeMock;

  beforeEach(() => {
    chromeMock = new ChromeMock();
    chromeMock.installGlobals();
  });

  afterEach(() => {
    chromeMock.uninstallGlobals();
  });

  it('visibleTab: true creates active tab and updates tab with active: true', async () => {
    const mod = ModuleLoader.loadScriptInContext('src/crawler/tab-downloader.js');
    const TabDownloader = mod.exports.TabDownloader || mod.sandbox.TabDownloader;

    const downloader = new TabDownloader({ visibleTab: true, pageLoadWaitMs: 10 });
    await downloader.initialize();

    const createEvents = chromeMock._tabEvents.filter((e) => e.type === 'create');
    assert.strictEqual(createEvents.length, 1);
    assert.strictEqual(createEvents[0].properties.active, true, 'Tab should be active when visibleTab is true');

    await downloader.fetchChapter('https://giatocvuongtai.com/stories/test/c1');
    const updateEvents = chromeMock._tabEvents.filter((e) => e.type === 'update');
    assert.ok(updateEvents.length >= 1);
    assert.strictEqual(updateEvents[updateEvents.length - 1].properties.active, true, 'Update should set active: true');

    await downloader.cleanup();
  });

  it('extractFullTocViaTab crawls multiple pages even when URL does not change (SPA pagination)', async () => {
    const mod = ModuleLoader.loadScriptInContext('src/crawler/tab-downloader.js');
    const TabDownloader = mod.exports.TabDownloader || mod.sandbox.TabDownloader;

    const downloader = new TabDownloader({ visibleTab: true, pageLoadWaitMs: 10 });
    await downloader.initialize();

    // Mock chrome.scripting.executeScript to simulate 2-page SPA TOC
    let pageCallCount = 0;
    chrome.scripting.executeScript = async ({ target, func, args }) => {
      // First call is TOC tab switcher
      if (!args || args.length === 0) {
        return [{ result: null }];
      }

      pageCallCount++;
      if (pageCallCount === 1) {
        // Page 1: Chapters 1 to 50, hasNext: true (clicked 'Sau' button)
        const chaps = [];
        for (let i = 1; i <= 50; i++) {
          chaps.push({ title: `Chương ${i}: Tiêu đề ${i}`, url: `https://giatocvuongtai.com/stories/test/c${i}` });
        }
        return [{
          result: {
            chapters: chaps,
            hasNext: true,
            metadata: {
              title: 'Đệ Nhất Marketing Giới Tu Chân',
              author: 'Gia Tộc Vượng Tài',
              cover: 'https://giatocvuongtai.com/covers/test.jpg',
              desc: 'Văn án giới thiệu truyện...'
            }
          }
        }];
      } else {
        // Page 2: Chapters 51 to 80, hasNext: false (no more pages / disabled)
        const chaps = [];
        for (let i = 51; i <= 80; i++) {
          chaps.push({ title: `Chương ${i}: Tiêu đề ${i}`, url: `https://giatocvuongtai.com/stories/test/c${i}` });
        }
        return [{
          result: {
            chapters: chaps,
            hasNext: false,
            metadata: null
          }
        }];
      }
    };

    const progressReports = [];
    const result = await downloader.extractFullTocViaTab({
      url: 'https://giatocvuongtai.com/stories/de-nhat-marketing/',
      nextPageSelector: '//button[contains(text(), "Sau")]',
      maxPages: 10,
      pageLoadWaitMs: 10,
      onProgress: (p) => progressReports.push(p)
    });

    assert.strictEqual(result.title, 'Đệ Nhất Marketing Giới Tu Chân');
    assert.strictEqual(result.author, 'Gia Tộc Vượng Tài');
    assert.strictEqual(result.totalChapters, 80, 'Total chapters should be accumulated across both pages (50 + 30 = 80)');
    assert.strictEqual(result.chapters.length, 80);
    assert.strictEqual(result.chapters[0].title, 'Chương 1: Tiêu đề 1');
    assert.strictEqual(result.chapters[79].title, 'Chương 80: Tiêu đề 80');
    assert.ok(progressReports.length >= 2, 'Should report progress for each page');

    await downloader.cleanup();
  });

  it('GenericParser uses extractFullTocViaTab when downloader supports it and URL is giatocvuongtai.com', async () => {
    const modParser = ModuleLoader.loadScriptInContext('src/parsers/generic-parser.js');
    const GenericParser = modParser.exports.GenericParser || modParser.sandbox.GenericParser;
    const parser = new GenericParser();

    let tabCalled = false;
    const mockDownloader = {
      async extractFullTocViaTab(opts) {
        tabCalled = true;
        return {
          id: 'test',
          title: 'Gia Tộc Vượng Tài Novel',
          author: 'Author Test',
          description: 'Desc Test',
          coverUrl: 'https://test.com/cover.jpg',
          status: 'ongoing',
          totalChapters: 60,
          chapters: Array.from({ length: 60 }, (_, i) => ({
            id: `ch-${i + 1}`,
            chapterNumber: i + 1,
            title: `Chương ${i + 1}`,
            url: `https://giatocvuongtai.com/stories/test/c${i + 1}`
          }))
        };
      }
    };

    const meta = await parser.fetchMetadata('https://giatocvuongtai.com/stories/test/', {
      downloader: mockDownloader,
      useTabForToc: true
    });

    assert.strictEqual(tabCalled, true, 'GenericParser should directly route to extractFullTocViaTab');
    assert.strictEqual(meta.totalChapters, 60);
    assert.strictEqual(meta.title, 'Gia Tộc Vượng Tài Novel');
  });
});
