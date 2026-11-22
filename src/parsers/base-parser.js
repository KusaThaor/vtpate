/**
 * base-parser.js - Base Parser Abstract Class & Common Utilities
 * VTPATE Chrome Extension Web Novel Scraper & EPUB Packaging Studio
 */

(function (root, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    const Parser = factory();
    module.exports = Parser;
    module.exports.BaseParser = Parser;
  } else {
    const Parser = factory();
    root.BaseParser = Parser;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  class BaseParser {
    constructor() {
      if (new.target === BaseParser) {
        // BaseParser can be instantiated for utility methods or extended by specialized parsers
      }
    }

    /**
     * Determine whether this parser can handle the given URL.
     * @param {string} url
     * @returns {boolean}
     */
    canHandle(url) {
      throw new Error('BaseParser subclass must implement canHandle(url)');
    }

    /**
     * Fetch novel metadata and table of contents.
     * @param {string} url
     * @returns {Promise<NovelMetadata>}
     */
    async fetchMetadata(url) {
      throw new Error('BaseParser subclass must implement fetchMetadata(url)');
    }

    /**
     * Fetch individual chapter content.
     * @param {ChapterItem} chapterItem
     * @param {Downloader} downloader
     * @returns {Promise<ChapterContent>}
     */
    async fetchChapter(chapterItem, downloader) {
      throw new Error('BaseParser subclass must implement fetchChapter(chapterItem, downloader)');
    }

    /**
     * Sanitize raw HTML string: remove scripts, styles, dangerous on* attributes, and data-p-id attributes.
     * Formats self-closing tags for strict XHTML compatibility.
     * @param {string} html
     * @param {Object} [options]
     * @returns {string}
     */
    sanitizeHtml(html, options) {
      return BaseParser.sanitizeHtml(html, options);
    }

    /**
     * Alias for sanitizeHtml for compatibility.
     * @param {string} html
     * @param {Object} [options]
     * @returns {string}
     */
    sanitizeContent(html, options) {
      return BaseParser.sanitizeHtml(html, options);
    }

    /**
     * Remove invisible text, white text, micro-fonts, and anti-crawler noise.
     * @param {string} html
     * @param {Array<string>|string} [customSelectors]
     * @returns {string}
     */
    cleanInvisibleText(html, customSelectors) {
      return BaseParser.cleanInvisibleAndCamouflageText(html, customSelectors);
    }

    /**
     * Convert relative URL to absolute URL given a base URL.
     * @param {string} relativeOrAbsolute
     * @param {string} baseUrl
     * @returns {string}
     */
    toAbsoluteUrl(relativeOrAbsolute, baseUrl) {
      return BaseParser.toAbsoluteUrl(relativeOrAbsolute, baseUrl);
    }

    /**
     * Alias for toAbsoluteUrl.
     * @param {string} relativeOrAbsolute
     * @param {string} baseUrl
     * @returns {string}
     */
    resolveAbsoluteUrl(relativeOrAbsolute, baseUrl) {
      return BaseParser.toAbsoluteUrl(relativeOrAbsolute, baseUrl);
    }

    /**
     * Map image filename or URL to corresponding MIME type.
     * @param {string} filenameOrUrl
     * @returns {string}
     */
    getImageMimeType(filenameOrUrl) {
      return BaseParser.getImageMimeType(filenameOrUrl);
    }

    /**
     * Remove invisible text traps, micro-fonts (0-1px), white/transparent text, and camouflage noise
     * used by anti-scraping systems.
     * @param {string} html
     * @param {Array<string>|string} [customSelectors=[]]
     * @returns {string}
     */
    static cleanInvisibleAndCamouflageText(html, customSelectors = []) {
      if (!html || typeof html !== 'string') return '';
      let clean = html;

      // 1. If DOMParser is available (browser/extension context), perform precise DOM-based cleaning
      if (typeof DOMParser !== 'undefined') {
        try {
          const doc = new DOMParser().parseFromString(clean, 'text/html');
          if (doc && doc.body) {
            // Check all elements with inline style
            const styledEls = doc.body.querySelectorAll('*[style]');
            styledEls.forEach((el) => {
              const style = (el.getAttribute('style') || '').toLowerCase();
              const isInvisible =
                /font-size\s*:\s*(0(\.0*[0-9]+)?(px|pt|em|rem)?|0?\.?[0-9]px|1px)\b/.test(style) ||
                /color\s*:\s*(#fff(fff)?|white|transparent|rgba\(\s*255\s*,\s*255\s*,\s*255|rgba\([^)]*,\s*0\b\))/.test(style) ||
                /display\s*:\s*none\b/.test(style) ||
                /visibility\s*:\s*hidden\b/.test(style) ||
                /opacity\s*:\s*0(\.0+)?(?![0-9])/.test(style) ||
                /position\s*:\s*absolute\s*;\s*(left|top)\s*:\s*-\d{3,}/.test(style) ||
                /text-indent\s*:\s*-\d{3,}/.test(style) ||
                /(height|width)\s*:\s*0(px)?\s*;\s*overflow\s*:\s*hidden/.test(style) ||
                /line-height\s*:\s*0\b/.test(style);

              if (isInvisible) {
                el.remove();
              }
            });

            // Remove legacy <font color="white"> or <font color="#ffffff">
            const whiteFonts = doc.body.querySelectorAll('font[color="#ffffff" i], font[color="#fff" i], font[color="white" i]');
            whiteFonts.forEach((el) => el.remove());

            // Remove user custom selectors
            const selectorsList = Array.isArray(customSelectors)
              ? customSelectors
              : (typeof customSelectors === 'string' ? customSelectors.split(',').map((s) => s.trim()).filter(Boolean) : []);

            for (const sel of selectorsList) {
              try {
                doc.body.querySelectorAll(sel).forEach((el) => el.remove());
              } catch (e) {}
            }

            clean = doc.body.innerHTML;
          }
        } catch (e) {
          // Fallback to regex cleaning below
        }
      }

      // 2. Regex-based cleaning fallback (for Node / test runner environment)
      // Remove white/transparent font tags
      clean = clean.replace(/<font\b[^>]*\bcolor=["'](?:#ffffff|#fff|white|transparent)["'][^>]*>[\s\S]*?<\/font>/gi, '');

      // Remove elements with invisible inline style patterns
      const invisibleStyleRegex = /<([a-z0-9]+)\b[^>]*\bstyle=["'][^"']*(?:font-size\s*:\s*(?:0(?:\.0*[0-9]+)?(?:px|pt|em|rem)?|0?\.?[0-9]px|1px)|color\s*:\s*(?:#fff(?:fff)?|white|transparent|rgba\(\s*255\s*,\s*255\s*,\s*255|rgba\([^)]*,\s*0\b\))|display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\.0+)?|position\s*:\s*absolute;\s*left\s*:\s*-\d{3,})[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi;
      clean = clean.replace(invisibleStyleRegex, '');

      // Remove custom selectors by simple class/tag regex if string supplied
      if (customSelectors) {
        const selList = Array.isArray(customSelectors)
          ? customSelectors
          : (typeof customSelectors === 'string' ? customSelectors.split(',').map((s) => s.trim()).filter(Boolean) : []);
        for (const sel of selList) {
          if (sel.startsWith('.')) {
            const className = sel.slice(1);
            const classRegex = new RegExp('<([a-z0-9]+)\\b[^>]*\\bclass=["\'][^"\']*\\b' + className + '\\b[^"\']*["\'][^>]*>[\\s\\S]*?<\\/\\1>', 'gi');
            clean = clean.replace(classRegex, '');
          }
        }
      }

      return clean;
    }

    /**
     * Static HTML Sanitizer
     * @param {string} html
     * @param {Object} [options={}]
     * @returns {string}
     */
    static sanitizeHtml(html, options = {}) {
      if (!html || typeof html !== 'string') {
        return (options && options.emptyPlaceholder) || '';
      }

      let clean = html;

      // 0. Remove illegal XML 1.0 control characters
      clean = clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

      // 1. Remove script tags and contents
      clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

      // 2. Remove style tags and contents
      clean = clean.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

      // 3. Remove inline event handler attributes (onclick, onerror, onload, etc.)
      clean = clean.replace(/\s+on[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '');

      // 4. Remove invisible text & anti-crawler traps if enabled
      if (!options || options.cleanInvisibleText !== false) {
        clean = BaseParser.cleanInvisibleAndCamouflageText(clean, options.customRemovals || options.classesToRemove);
      }

      // 5. Remove Wattpad-specific data-p-id attributes from paragraph tags
      clean = clean.replace(/(<p\b[^>]*?)\s+data-p-id="[^"]*"/gi, '$1');

      // 6. Ensure void tags (br, hr, img) are self-closing for strict XHTML parsing
      clean = clean.replace(/<(br|hr|img)([^>]*?)(?<!\/)>/gi, '<$1$2/>');

      // 7. If content is empty or contains no text, provide fallback placeholder if requested
      const textOnly = clean.replace(/<[^>]*>/g, '').trim();
      if (!textOnly && options && options.fallbackEmpty) {
        return options.emptyPlaceholder || '<p>pass</p>';
      }

      return clean;
    }

    /**
     * Static URL Resolver
     * @param {string} relativeOrAbsolute
     * @param {string} baseUrl
     * @returns {string}
     */
    static toAbsoluteUrl(relativeOrAbsolute, baseUrl) {
      if (!relativeOrAbsolute) return '';
      try {
        return new URL(relativeOrAbsolute, baseUrl).href;
      } catch (err) {
        return relativeOrAbsolute;
      }
    }

    /**
     * Static MIME Type Resolver
     * @param {string} filenameOrUrl
     * @returns {string}
     */
    static getImageMimeType(filenameOrUrl) {
      if (!filenameOrUrl || typeof filenameOrUrl !== 'string') {
        return 'application/octet-stream';
      }

      const cleanPath = filenameOrUrl.split('?')[0].split('#')[0].toLowerCase();

      if (cleanPath.endsWith('.jpg') || cleanPath.endsWith('.jpeg')) {
        return 'image/jpeg';
      }
      if (cleanPath.endsWith('.png')) {
        return 'image/png';
      }
      if (cleanPath.endsWith('.webp')) {
        return 'image/webp';
      }
      if (cleanPath.endsWith('.gif')) {
        return 'image/gif';
      }
      if (cleanPath.endsWith('.svg')) {
        return 'image/svg+xml';
      }
      if (cleanPath.endsWith('.bmp')) {
        return 'image/bmp';
      }

      return 'application/octet-stream';
    }
  }

  return BaseParser;
});
