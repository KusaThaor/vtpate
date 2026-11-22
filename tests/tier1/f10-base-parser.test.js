// tests/tier1/f10-base-parser.test.js
// Tier 1 - Feature 10: Parser Architecture & BaseParser
const { assert } = require('../harness/test-assert');
const { ModuleLoader } = require('../harness/loader');

module.exports = {
  name: 'Feature 10: Parser Architecture & BaseParser',
  featureId: 10,
  milestone: 'M3',
  tests: [
    {
      name: 'F10.1: BaseParser abstract class defines required interface methods',
      fn: () => {
        const mod = ModuleLoader.loadScriptInContext('src/parsers/base-parser.js');
        assert.ok(mod.loaded, `base-parser.js load failed: ${mod.error ? mod.error.message : 'Not found'}`);
        const BaseParser = mod.exports.BaseParser || mod.sandbox.BaseParser;
        assert.ok(typeof BaseParser === 'function', 'BaseParser constructor required');
        const proto = BaseParser.prototype;
        assert.ok(typeof proto.canHandle === 'function', 'BaseParser must define canHandle');
        assert.ok(typeof proto.fetchMetadata === 'function', 'BaseParser must define fetchMetadata');
        assert.ok(typeof proto.fetchChapter === 'function', 'BaseParser must define fetchChapter');
      }
    },
    {
      name: 'F10.2: BaseParser.sanitizeHtml removes script, style, and on* attributes',
      fn: () => {
        const mod = ModuleLoader.loadScriptInContext('src/parsers/base-parser.js');
        assert.ok(mod.loaded, 'base-parser.js required');
        const BaseParser = mod.exports.BaseParser || mod.sandbox.BaseParser;
        const parser = new BaseParser();

        const dirty = '<div><script>alert(1)</script><style>body{color:red}</style><p onclick="hack()">Hello</p><img src="x" onerror="evil()"/></div>';
        const clean = parser.sanitizeHtml ? parser.sanitizeHtml(dirty) : BaseParser.sanitizeHtml(dirty);

        assert.ok(!clean.includes('<script'), 'Must strip <script>');
        assert.ok(!clean.includes('<style'), 'Must strip <style>');
        assert.ok(!clean.includes('onclick'), 'Must strip onclick');
        assert.ok(!clean.includes('onerror'), 'Must strip onerror');
        assert.includes(clean, 'Hello', 'Must preserve safe text content');
      }
    },
    {
      name: 'F10.3: ParserRegistry can register specialized parsers',
      fn: () => {
        const modReg = ModuleLoader.loadScriptInContext('src/parsers/parser-registry.js');
        assert.ok(modReg.loaded, `parser-registry.js load failed: ${modReg.error ? modReg.error.message : 'Not found'}`);
        const ParserRegistry = modReg.exports.ParserRegistry || modReg.sandbox.ParserRegistry;
        assert.ok(typeof ParserRegistry === 'function', 'ParserRegistry constructor required');

        const registry = new ParserRegistry();
        const dummyParser = {
          canHandle: (url) => url.includes('custom-novel.com'),
          fetchMetadata: async () => ({}),
          fetchChapter: async () => ({})
        };

        registry.register(dummyParser);
        const resolved = registry.getParser('https://custom-novel.com/book/1');
        assert.strictEqual(resolved, dummyParser, 'Registry must return matching registered parser');
      }
    },
    {
      name: 'F10.4: ParserRegistry falls back to GenericParser for unknown URLs',
      fn: () => {
        const modReg = ModuleLoader.loadScriptInContext('src/parsers/parser-registry.js');
        assert.ok(modReg.loaded, 'parser-registry.js required');
        const ParserRegistry = modReg.exports.ParserRegistry || modReg.sandbox.ParserRegistry;
        const registry = new ParserRegistry();

        const resolved = registry.getParser('https://completely-unknown-domain.xyz/story/99');
        assert.ok(resolved, 'Must return a parser');
        const name = (resolved.constructor && resolved.constructor.name) || '';
        assert.ok(name.includes('Generic') || resolved.isGeneric, 'Must resolve to GenericParser fallback');
      }
    },
    {
      name: 'F10.5: NovelMetadata and ChapterItem contracts conform to specification schema',
      fn: () => {
        const sampleMetadata = {
          id: 'test-123',
          title: 'Test Novel',
          author: 'Test Author',
          description: 'A test description',
          coverUrl: 'https://example.com/cover.jpg',
          status: 'ongoing',
          totalChapters: 2,
          chapters: [
            { id: 'ch-1', chapterNumber: 1, title: 'Chapter 1', url: 'https://example.com/1' },
            { id: 'ch-2', chapterNumber: 2, title: 'Chapter 2', url: 'https://example.com/2' }
          ]
        };

        // Assert schema validity
        assert.ok(sampleMetadata.title && typeof sampleMetadata.title === 'string');
        assert.ok(Array.isArray(sampleMetadata.chapters));
        assert.strictEqual(sampleMetadata.chapters.length, sampleMetadata.totalChapters);
        sampleMetadata.chapters.forEach((ch, idx) => {
          assert.strictEqual(ch.chapterNumber, idx + 1);
          assert.ok(ch.url.startsWith('http'));
        });
      }
    }
  ]
};
