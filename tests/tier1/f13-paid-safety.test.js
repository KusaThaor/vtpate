// tests/tier1/f13-paid-safety.test.js
// Tier 1 - Feature 13: Wattpad Paid Stories Safety
const { assert } = require('../harness/test-assert');
const { HttpMock } = require('../harness/http-mock');
const { ModuleLoader } = require('../harness/loader');

module.exports = {
  name: 'Feature 13: Wattpad Paid Stories Safety',
  featureId: 13,
  milestone: 'M3',
  tests: [
    {
      name: 'F13.1: Paid chapter response does not crash or throw unhandled exceptions',
      fn: async () => {
        const httpMock = new HttpMock();
        httpMock.install();

        // Wattpad paid story endpoint returns 403 or paywall payload
        httpMock.onGet('https://www.wattpad.com/apiv2/storytext?id=999', {
          status: 403,
          body: JSON.stringify({ error: 'paid_story_locked', message: 'Coins required to unlock chapter' })
        });

        try {
          const mod = ModuleLoader.loadScriptInContext('src/parsers/wattpad-parser.js');
          assert.ok(mod.loaded, 'wattpad-parser.js required');
          const WattpadParser = mod.exports.WattpadParser || mod.sandbox.WattpadParser;
          const parser = new WattpadParser();

          const dummyDownloader = {
            fetchChapter: async (url) => {
              const res = await fetch(url);
              if (!res.ok) {
                const err = new Error('HTTP ' + res.status);
                err.status = res.status;
                err.response = res;
                throw err;
              }
              return await res.text();
            }
          };

          const chapterItem = { id: '999', chapterNumber: 5, title: 'Paid Chapter', url: 'https://www.wattpad.com/apiv2/storytext?id=999' };
          const chapter = await parser.fetchChapter(chapterItem, dummyDownloader);

          assert.ok(chapter, 'Must return chapter object instead of crashing');
        } finally {
          httpMock.uninstall();
        }
      }
    },
    {
      name: 'F13.2: Returns isPaywalled: true on locked chapters',
      fn: async () => {
        const httpMock = new HttpMock();
        httpMock.install();

        httpMock.onGet('https://www.wattpad.com/apiv2/storytext?id=999', {
          status: 403,
          body: 'Paywalled content'
        });

        try {
          const mod = ModuleLoader.loadScriptInContext('src/parsers/wattpad-parser.js');
          assert.ok(mod.loaded, 'wattpad-parser.js required');
          const WattpadParser = mod.exports.WattpadParser || mod.sandbox.WattpadParser;
          const parser = new WattpadParser();

          const dummyDownloader = {
            fetchChapter: async (url) => {
              const err = new Error('HTTP 403 Forbidden');
              err.status = 403;
              throw err;
            }
          };

          const chapterItem = { id: '999', chapterNumber: 5, title: 'Paid Chapter', url: 'https://www.wattpad.com/apiv2/storytext?id=999' };
          const chapter = await parser.fetchChapter(chapterItem, dummyDownloader);

          assert.strictEqual(chapter.isPaywalled, true, 'isPaywalled flag must be set to true');
        } finally {
          httpMock.uninstall();
        }
      }
    },
    {
      name: 'F13.3: Content includes clear notice "[Chương trả phí - Chưa mở khóa]"',
      fn: async () => {
        const httpMock = new HttpMock();
        httpMock.install();

        httpMock.onGet('https://www.wattpad.com/apiv2/storytext?id=999', {
          status: 403,
          body: 'Locked'
        });

        try {
          const mod = ModuleLoader.loadScriptInContext('src/parsers/wattpad-parser.js');
          assert.ok(mod.loaded, 'wattpad-parser.js required');
          const WattpadParser = mod.exports.WattpadParser || mod.sandbox.WattpadParser;
          const parser = new WattpadParser();

          const dummyDownloader = {
            fetchChapter: async () => {
              const err = new Error('HTTP 403');
              err.status = 403;
              throw err;
            }
          };

          const chapterItem = { id: '999', chapterNumber: 5, title: 'Paid Chapter', url: 'https://www.wattpad.com/apiv2/storytext?id=999' };
          const chapter = await parser.fetchChapter(chapterItem, dummyDownloader);

          assert.includes(
            chapter.contentHtml,
            'Chương trả phí',
            'Must contain Vietnamese paywall notification notice'
          );
        } finally {
          httpMock.uninstall();
        }
      }
    },
    {
      name: 'F13.4: Chapter metadata preserves title and chapterNumber for paywalled chapters',
      fn: async () => {
        const mod = ModuleLoader.loadScriptInContext('src/parsers/wattpad-parser.js');
        assert.ok(mod.loaded, 'wattpad-parser.js required');
        const WattpadParser = mod.exports.WattpadParser || mod.sandbox.WattpadParser;
        const parser = new WattpadParser();

        const dummyDownloader = {
          fetchChapter: async () => {
            const err = new Error('HTTP 403');
            err.status = 403;
            throw err;
          }
        };

        const chapterItem = { id: '888', chapterNumber: 12, title: 'VIP Exclusive Battle', url: 'https://www.wattpad.com/apiv2/storytext?id=888' };
        const chapter = await parser.fetchChapter(chapterItem, dummyDownloader);

        assert.strictEqual(chapter.chapterNumber, 12, 'chapterNumber preserved');
        assert.strictEqual(chapter.title, 'VIP Exclusive Battle', 'title preserved');
      }
    },
    {
      name: 'F13.5: Crawler progress continues to next chapter when encountering paywalled chapter',
      fn: async () => {
        const mod = ModuleLoader.loadScriptInContext('src/parsers/wattpad-parser.js');
        assert.ok(mod.loaded, 'wattpad-parser.js required');
        const WattpadParser = mod.exports.WattpadParser || mod.sandbox.WattpadParser;
        const parser = new WattpadParser();

        const downloader = {
          fetchChapter: async (url) => {
            if (url.includes('paywalled')) {
              const err = new Error('HTTP 403');
              err.status = 403;
              throw err;
            }
            return '<p>Normal free chapter</p>';
          }
        };

        const chapters = [
          { id: '1', chapterNumber: 1, title: 'Ch 1 Free', url: 'https://example.com/free1' },
          { id: '2', chapterNumber: 2, title: 'Ch 2 Paid', url: 'https://example.com/paywalled2' },
          { id: '3', chapterNumber: 3, title: 'Ch 3 Free', url: 'https://example.com/free3' }
        ];

        const results = [];
        for (const item of chapters) {
          const res = await parser.fetchChapter(item, downloader);
          results.push(res);
        }

        assert.strictEqual(results.length, 3, 'All 3 chapters processed');
        assert.strictEqual(results[0].isPaywalled || false, false);
        assert.strictEqual(results[1].isPaywalled, true);
        assert.strictEqual(results[2].isPaywalled || false, false);
      }
    }
  ]
};
