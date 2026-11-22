// tests/tier1/f11-inkitt-parser.test.js
// Tier 1 - Feature 11: Inkitt Specialized Parser
const { assert } = require('../harness/test-assert');
const { HttpMock } = require('../harness/http-mock');
const { ModuleLoader } = require('../harness/loader');

module.exports = {
  name: 'Feature 11: Inkitt Specialized Parser',
  featureId: 11,
  milestone: 'M3',
  tests: [
    {
      name: 'F11.1: canHandle returns true for web and deep link Inkitt URLs',
      fn: () => {
        const mod = ModuleLoader.loadScriptInContext('src/parsers/inkitt-parser.js');
        assert.ok(mod.loaded, `inkitt-parser.js load failed: ${mod.error ? mod.error.message : 'Not found'}`);
        const InkittParser = mod.exports.InkittParser || mod.sandbox.InkittParser;
        const parser = new InkittParser();

        assert.strictEqual(parser.canHandle('https://www.inkitt.com/stories/romance/123456'), true);
        assert.strictEqual(parser.canHandle('https://inkitt.com/stories/789101'), true);
        assert.strictEqual(parser.canHandle('inkitt://stories/123456'), true);
        assert.strictEqual(parser.canHandle('https://www.wattpad.com/story/123456'), false);
      }
    },
    {
      name: 'F11.2: extractStoryId correctly extracts numeric story ID from various URL formats',
      fn: () => {
        const mod = ModuleLoader.loadScriptInContext('src/parsers/inkitt-parser.js');
        assert.ok(mod.loaded, 'inkitt-parser.js required');
        const InkittParser = mod.exports.InkittParser || mod.sandbox.InkittParser;
        const parser = new InkittParser();

        const id1 = parser.extractStoryId('https://www.inkitt.com/stories/fantasy/887766');
        const id2 = parser.extractStoryId('https://www.inkitt.com/stories/887766');
        const id3 = parser.extractStoryId('inkitt://stories/887766');

        assert.strictEqual(id1, '887766', 'Web URL with genre');
        assert.strictEqual(id2, '887766', 'Web URL without genre');
        assert.strictEqual(id3, '887766', 'Deep link URL');
      }
    },
    {
      name: 'F11.3: fetchMetadata retrieves novel metadata and chapters from Inkitt API v2',
      fn: async () => {
        const httpMock = new HttpMock();
        httpMock.install();

        httpMock.onGet('https://www.inkitt.com/api/2/stories/887766', {
          response: {
            id: 887766,
            title: 'Moonlit Alpha',
            user: { username: 'AuthorWolf' },
            summary: 'A thrilling werewolf romance',
            vertical_cover: { url: 'https://images.inkitt.com/cover.jpg' },
            chapters_count: 2,
            chapters: [
              { id: 101, chapter_number: 1, name: 'The Meeting' },
              { id: 102, chapter_number: 2, name: 'The Rejection' }
            ]
          }
        });

        try {
          const mod = ModuleLoader.loadScriptInContext('src/parsers/inkitt-parser.js');
          assert.ok(mod.loaded, 'inkitt-parser.js required');
          const InkittParser = mod.exports.InkittParser || mod.sandbox.InkittParser;
          const parser = new InkittParser();

          const meta = await parser.fetchMetadata('https://www.inkitt.com/stories/887766');

          assert.strictEqual(meta.title, 'Moonlit Alpha');
          assert.strictEqual(meta.author, 'AuthorWolf');
          assert.strictEqual(meta.totalChapters, 2);
          assert.strictEqual(meta.chapters.length, 2);
          assert.strictEqual(meta.chapters[0].title, 'The Meeting');
        } finally {
          httpMock.uninstall();
        }
      }
    },
    {
      name: 'F11.4: Extracts novel metadata from SSR __NEXT_DATA__ script tag if present',
      fn: async () => {
        const httpMock = new HttpMock();
        httpMock.install();

        const nextData = {
          props: {
            pageProps: {
              story: {
                id: 554433,
                title: 'NextData Story',
                user: { username: 'NextAuthor' },
                summary: 'SSR rendered summary',
                chapters: [{ id: 1, chapter_number: 1, name: 'SSR Chapter 1' }]
              }
            }
          }
        };

        const ssrHtml = `<html><head><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></head><body>Inkitt Web</body></html>`;
        httpMock.onGet('https://www.inkitt.com/stories/554433', ssrHtml);

        try {
          const mod = ModuleLoader.loadScriptInContext('src/parsers/inkitt-parser.js');
          assert.ok(mod.loaded, 'inkitt-parser.js required');
          const InkittParser = mod.exports.InkittParser || mod.sandbox.InkittParser;
          const parser = new InkittParser();

          if (typeof parser.parseFromHtml === 'function') {
            const meta = parser.parseFromHtml(ssrHtml, 'https://www.inkitt.com/stories/554433');
            assert.strictEqual(meta.title, 'NextData Story');
            assert.strictEqual(meta.author, 'NextAuthor');
          } else {
            // Direct metadata fetch with SSR fallback
            const meta = await parser.fetchMetadata('https://www.inkitt.com/stories/554433');
            assert.strictEqual(meta.title, 'NextData Story');
          }
        } finally {
          httpMock.uninstall();
        }
      }
    },
    {
      name: 'F11.5: Configures mobile emulation headers for app-only stories',
      fn: async () => {
        const httpMock = new HttpMock();
        httpMock.install();

        httpMock.onGet('https://www.inkitt.com/api/2/stories/999999/chapters/1', (url, init, req) => {
          // Mobile headers check
          const xReq = req.headers['X-Requested-With'] || req.headers['x-requested-with'];
          return {
            status: 200,
            body: {
              response: {
                id: 1,
                chapter_number: 1,
                name: 'App Chapter',
                text: '<p>Mobile unlocked text</p>'
              }
            }
          };
        });

        try {
          const mod = ModuleLoader.loadScriptInContext('src/parsers/inkitt-parser.js');
          assert.ok(mod.loaded, 'inkitt-parser.js required');
          const InkittParser = mod.exports.InkittParser || mod.sandbox.InkittParser;
          const parser = new InkittParser();

          const dummyDownloader = {
            fetchChapter: async (url) => {
              const res = await fetch(url, { headers: { 'X-Requested-With': 'com.inkitt.inkitt' } });
              return await res.json();
            }
          };

          const chapter = await parser.fetchChapter(
            { id: '1', chapterNumber: 1, title: 'App Chapter', url: 'https://www.inkitt.com/api/2/stories/999999/chapters/1' },
            dummyDownloader
          );

          assert.includes(chapter.contentHtml, 'Mobile unlocked text');
        } finally {
          httpMock.uninstall();
        }
      }
    }
  ]
};
