/**
 * parser-registry.js - Central Router and Registry for Novel Parsers
 * VTPATE Chrome Extension Web Novel Scraper & EPUB Packaging Studio
 */

(function (root, factory) {
  let InkittParser = null;
  let WattpadParser = null;
  let GenericParser = null;

  if (typeof module === 'object' && typeof module.exports === 'object') {
    try {
      const inkittMod = require('./inkitt-parser');
      InkittParser = inkittMod.InkittParser || inkittMod;
    } catch (e) {
      InkittParser = root.InkittParser;
    }
    try {
      const wattpadMod = require('./wattpad-parser');
      WattpadParser = wattpadMod.WattpadParser || wattpadMod;
    } catch (e) {
      WattpadParser = root.WattpadParser;
    }
    try {
      const genericMod = require('./generic-parser');
      GenericParser = genericMod.GenericParser || genericMod;
    } catch (e) {
      GenericParser = root.GenericParser;
    }

    const Registry = factory(root, InkittParser, WattpadParser, GenericParser);
    module.exports = Registry;
    module.exports.ParserRegistry = Registry;
  } else {
    InkittParser = root.InkittParser;
    WattpadParser = root.WattpadParser;
    GenericParser = root.GenericParser;
    const Registry = factory(root, InkittParser, WattpadParser, GenericParser);
    root.ParserRegistry = Registry;
  }
})(typeof self !== 'undefined' ? self : this, function (root, InkittParser, WattpadParser, GenericParser) {

  // Fallback GenericParser for standalone evaluation in sandbox environments
  class FallbackGenericParser {
    constructor() {
      this.name = 'GenericParser';
      this.isGeneric = true;
    }
    canHandle(url) {
      return true;
    }
    async fetchMetadata(url) {
      return { id: url, title: 'Generic Novel', chapters: [] };
    }
    async fetchChapter(item, downloader) {
      return { id: item.id, chapterNumber: item.chapterNumber, title: item.title, contentHtml: '', images: [] };
    }
  }

  class ParserRegistry {
    constructor() {
      this._parsers = [];
      this._fallbackParser = null;
      this._initDefaultParsers();
    }

    /**
     * Initialize built-in parsers (Inkitt, Wattpad, and Generic as fallback).
     */
    _initDefaultParsers() {
      // 1. Resolve InkittParser
      const InkittCls = InkittParser || (typeof root !== 'undefined' ? root.InkittParser : null);
      if (InkittCls) {
        try {
          this.register(new InkittCls(), -10);
        } catch (e) {}
      }

      // 2. Resolve WattpadParser
      const WattpadCls = WattpadParser || (typeof root !== 'undefined' ? root.WattpadParser : null);
      if (WattpadCls) {
        try {
          this.register(new WattpadCls(), -10);
        } catch (e) {}
      }

      // 3. Resolve GenericParser (as universal fallback)
      const GenericCls = GenericParser || (typeof root !== 'undefined' ? root.GenericParser : null);
      if (GenericCls) {
        try {
          this._fallbackParser = new GenericCls();
        } catch (e) {
          this._fallbackParser = new FallbackGenericParser();
        }
      } else {
        this._fallbackParser = new FallbackGenericParser();
      }
    }

    /**
     * Register a parser. High-priority or custom parsers are checked first.
     * @param {BaseParser|Object} parser
     * @param {number} priority
     */
    register(parser, priority = 0) {
      if (!parser || typeof parser.canHandle !== 'function') {
        throw new Error('Registered parser must define canHandle(url) method');
      }

      if (parser.isGeneric || (parser.constructor && parser.constructor.name === 'GenericParser')) {
        this._fallbackParser = parser;
        return;
      }

      // Insert keeping higher priority first; within same priority, newly registered first
      const entry = { parser, priority };
      let inserted = false;
      for (let i = 0; i < this._parsers.length; i++) {
        if (priority > this._parsers[i].priority) {
          this._parsers.splice(i, 0, entry);
          inserted = true;
          break;
        }
      }
      if (!inserted) {
        this._parsers.push(entry);
      }
    }

    /**
     * Match URL against registered parsers. Falls back to GenericParser.
     * @param {string} url
     * @returns {BaseParser}
     */
    getParser(url) {
      // 1. Check all specialized parsers
      for (const entry of this._parsers) {
        try {
          if (entry.parser.canHandle(url)) {
            return entry.parser;
          }
        } catch (e) {
          // If canHandle throws on unexpected format, continue to next parser
        }
      }

      // 2. Return fallback GenericParser
      if (!this._fallbackParser || this._fallbackParser instanceof FallbackGenericParser) {
        const GenericCls = GenericParser || (typeof root !== 'undefined' ? root.GenericParser : null);
        if (GenericCls) {
          try {
            this._fallbackParser = new GenericCls();
          } catch (e) {
            if (!this._fallbackParser) this._fallbackParser = new FallbackGenericParser();
          }
        } else if (!this._fallbackParser) {
          this._fallbackParser = new FallbackGenericParser();
        }
      }

      return this._fallbackParser;
    }

    /**
     * Return list of all registered parsers including the fallback parser.
     * @returns {BaseParser[]}
     */
    getAllParsers() {
      const all = this._parsers.map((e) => e.parser);
      if (this._fallbackParser) {
        all.push(this._fallbackParser);
      }
      return all;
    }
  }

  return ParserRegistry;
});
