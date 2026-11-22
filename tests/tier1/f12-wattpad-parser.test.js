// tests/tier1/f12-wattpad-parser.test.js
// Tier 1 - Feature 12: Wattpad Specialized Parser
const { assert } = require('../harness/test-assert');
const { HttpMock } = require('../harness/http-mock');
const { ModuleLoader } = require('../harness/loader');

module.exports = {
  name: 'Feature 12: Wattpad Specialized Parser',
  featureId: 12,
  milestone: 'M3',
  tests: [
    {
      name: 'F12.1: canHandle returns true for Wattpad story and single part URLs',
      fn: () => {
        const mod = ModuleLoader.loadScriptInContext('src/parsers/wattpad-parser.js');
        assert.ok(mod.loaded, `wattpad-parser.js load failed: ${mod.error ? mod.error.message : 'Not found'}`);
        const WattpadParser = mod.exports.WattpadParser || mod.sandbox.WattpadParser;
        const parser = new WattpadParser();

        assert.strictEqual(parser.canHandle('https://www.wattpad.com/story/12345678-my-story-title'), true);
        assert.strictEqual(parser.canHandle('https://www.wattpad.com/98765432-chapter-1-prologue'), true);
        assert.strictEqual(parser.canHandle('https://wattpad.com/story/112233'), true);
        assert.strictEqual(parser.canHandle('https://www.inkitt.com/stories/123456'), false);
      }
    },
    {
      name: 'F12.2: Resolves single part URL to story_id via api/v3/story_parts API',
      fn: async () => {
        const httpMock = new HttpMock();
        httpMock.install();

        httpMock.onGet('https://www.wattpad.com/api/v3/story_parts/98765432?fields=groupId', {
          groupId: 12345678
        });

        try {
          const mod = ModuleLoader.loadScriptInContext('src/parsers/wattpad-parser.js');
          assert.ok(mod.loaded, 'wattpad-parser.js required');
          const WattpadParser = mod.exports.WattpadParser || mod.sandbox.WattpadParser;
          const parser = new WattpadParser();

          const resolvedStoryId = await parser.resolveStoryId('https://www.wattpad.com/98765432-chapter-1-prologue');
          assert.strictEqual(String(resolvedStoryId), '12345678', 'Must resolve to correct parent story groupId');
        } finally {
          httpMock.uninstall();
        }
      }
    },
    {
      name: 'F12.3: fetchMetadata retrieves story info and filters out draft and isAd parts',
      fn: async () => {
        const httpMock = new HttpMock();
        httpMock.install();

        httpMock.onGet('https://www.wattpad.com/api/v3/stories/12345678', {
          id: 12345678,
          title: 'The Silent Wolf',
          user: { name: 'WattpadAuthor' },
          description: 'A werewolf tale',
          cover: 'https://img.wattpad.com/cover/12345678-k256.jpg',
          parts: [
            { id: 101, title: 'Part 1', draft: false, isAd: false },
            { id: 102, title: 'Draft Part', draft: true, isAd: false }, // Must be filtered out
            { id: 103, title: 'Sponsor Ad', draft: false, isAd: true },  // Must be filtered out
            { id: 104, title: 'Part 2', draft: false, isAd: false }
          ]
        });

        try {
          const mod = ModuleLoader.loadScriptInContext('src/parsers/wattpad-parser.js');
          assert.ok(mod.loaded, 'wattpad-parser.js required');
          const WattpadParser = mod.exports.WattpadParser || mod.sandbox.WattpadParser;
          const parser = new WattpadParser();

          const meta = await parser.fetchMetadata('https://www.wattpad.com/story/12345678-the-silent-wolf');

          assert.strictEqual(meta.title, 'The Silent Wolf');
          assert.strictEqual(meta.author, 'WattpadAuthor');
          assert.strictEqual(meta.chapters.length, 2, 'Only published non-ad parts should be returned');
          assert.strictEqual(meta.chapters[0].title, 'Part 1');
          assert.strictEqual(meta.chapters[1].title, 'Part 2');
        } finally {
          httpMock.uninstall();
        }
      }
    },
    {
      name: 'F12.4: Cover image URL is upgraded to HD quality (-k512)',
      fn: async () => {
        const httpMock = new HttpMock();
        httpMock.install();

        httpMock.onGet('https://www.wattpad.com/api/v3/stories/55555', {
          id: 55555,
          title: 'Cover Test',
          user: { name: 'Author' },
          cover: 'https://img.wattpad.com/cover/55555-k256.jpg',
          parts: [{ id: 1, title: 'Ch 1', draft: false, isAd: false }]
        });

        try {
          const mod = ModuleLoader.loadScriptInContext('src/parsers/wattpad-parser.js');
          assert.ok(mod.loaded, 'wattpad-parser.js required');
          const WattpadParser = mod.exports.WattpadParser || mod.sandbox.WattpadParser;
          const parser = new WattpadParser();

          const meta = await parser.fetchMetadata('https://www.wattpad.com/story/55555-cover-test');
          assert.includes(meta.coverUrl, '-k512', 'Cover URL must be transformed to -k512 HD format');
        } finally {
          httpMock.uninstall();
        }
      }
    },
    {
      name: 'F12.5: fetchChapter retrieves storytext from apiv2 and wraps in valid HTML',
      fn: async () => {
        const httpMock = new HttpMock();
        httpMock.install();

        httpMock.onGet('https://www.wattpad.com/apiv2/storytext?id=101', '<p>Paragraph 1 of story.</p><p>Paragraph 2 of story.</p>');

        try {
          const mod = ModuleLoader.loadScriptInContext('src/parsers/wattpad-parser.js');
          assert.ok(mod.loaded, 'wattpad-parser.js required');
          const WattpadParser = mod.exports.WattpadParser || mod.sandbox.WattpadParser;
          const parser = new WattpadParser();

          const dummyDownloader = {
            fetchChapter: async (url) => {
              const res = await fetch(url);
              return await res.text();
            }
          };

          const chapterItem = { id: '101', chapterNumber: 1, title: 'Part 1', url: 'https://www.wattpad.com/apiv2/storytext?id=101' };
          const chapter = await parser.fetchChapter(chapterItem, dummyDownloader);

          assert.includes(chapter.contentHtml, 'Paragraph 1 of story');
          assert.includes(chapter.contentHtml, 'Paragraph 2 of story');
        } finally {
          httpMock.uninstall();
        }
      }
    }
  ]
};
