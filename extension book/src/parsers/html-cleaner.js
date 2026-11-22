/**
 * html-cleaner.js - Comprehensive Text-to-HTML & Dirty HTML Sanitizer
 * VTPATE Chrome Extension Web Novel Scraper & EPUB Packaging Studio
 *
 * Standalone offline utility for:
 * 1. Converting copied plain text into clean, semantic XHTML paragraphs (<p>...</p>)
 * 2. Purging dirty, obfuscated, and anti-crawler HTML (micro-fonts, invisible text,
 *    deformed inline styles, scripts, ads, and malformed tags)
 * 3. Producing 100% strict XHTML-ready content for EPUB packaging and reading
 */

(function (root, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    const Cleaner = factory();
    module.exports = Cleaner;
    module.exports.HtmlCleaner = Cleaner;
  } else {
    const Cleaner = factory();
    root.HtmlCleaner = Cleaner;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  class HtmlCleaner {
    /**
     * Determines whether an input string is HTML or plain text.
     * @param {string} input
     * @returns {boolean}
     */
    static isHtml(input) {
      if (!input || typeof input !== 'string') return false;
      const trimmed = input.trim();
      if (!trimmed) return false;

      // Check for HTML document declaration or tags
      if (/^<!DOCTYPE\s+html/i.test(trimmed)) return true;
      if (/<html\b/i.test(trimmed)) return true;

      // Look for standard HTML block/inline tag pairs or void tags
      const tagPattern = /<\/?(?:p|div|span|h[1-6]|br|hr|b|strong|i|em|u|s|blockquote|ul|ol|li|table|tr|td|th|a|img|font|center|section|article|header|footer|nav|aside|pre|code|button|script|style)\b[^>]*>/i;
      return tagPattern.test(trimmed);
    }

    /**
     * Escapes standard XML characters.
     * @param {string} str
     * @returns {string}
     */
    static escapeXml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    }

    /**
     * Converts copied plain text into formatted, semantic XHTML paragraphs.
     * @param {string} rawText
     * @param {Object} [options={}]
     * @returns {Object} { cleanHtml, stats }
     */
    static textToHtml(rawText, options = {}) {
      const detectHeadings = options.detectHeadings !== false;
      const detectQuotes = options.detectQuotes !== false;
      const emptyPlaceholder = options.emptyPlaceholder || '<p>pass</p>';

      const stats = {
        originalLength: (rawText && typeof rawText === 'string') ? rawText.length : 0,
        cleanedLength: 0,
        paragraphCount: 0,
        wordCount: 0,
        characterCount: 0,
        headingsCount: 0,
        removedItems: {
          tinyFonts: 0,
          invisibleElements: 0,
          scriptsAndStyles: 0,
          junkAttributes: 0,
          watermarks: 0
        }
      };

      if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
        stats.cleanedLength = emptyPlaceholder.length;
        return {
          cleanHtml: emptyPlaceholder,
          stats
        };
      }

      // 0. Remove illegal XML 1.0 control characters
      let text = rawText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

      // Normalize line endings
      text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

      // Filter out custom watermark phrases if provided
      if (options.customWatermarks && Array.isArray(options.customWatermarks)) {
        for (const wm of options.customWatermarks) {
          if (wm && typeof wm === 'string' && wm.trim()) {
            const regex = new RegExp(wm.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            text = text.replace(regex, '');
            stats.removedItems.watermarks++;
          }
        }
      }

      // Split by multiple newlines or single newlines
      const lines = text.split('\n');
      const paragraphs = [];
      let currentParagraph = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.length === 0) {
          if (currentParagraph.length > 0) {
            paragraphs.push(currentParagraph.join(' '));
            currentParagraph = [];
          }
        } else {
          // If detectHeadings is active, check if this line looks like a chapter title
          const isHeading = detectHeadings && /^(?:chương|chapter|chap|hồi|quyển|phần|tiết|mục|tập)\s*[\dIVXLCDM\.-]+(?:\s*[:\-\—\–]\s*|\s+|$)|^#\s+/i.test(line);

          if (isHeading) {
            if (currentParagraph.length > 0) {
              paragraphs.push(currentParagraph.join(' '));
              currentParagraph = [];
            }
            paragraphs.push({ isHeading: true, text: line.replace(/^#+\s*/, '') });
          } else {
            // Check if options treat each line as its own paragraph (standard for VN web novel texts)
            if (options.singleLineAsParagraph !== false) {
              if (currentParagraph.length > 0) {
                paragraphs.push(currentParagraph.join(' '));
                currentParagraph = [];
              }
              paragraphs.push(line);
            } else {
              currentParagraph.push(line);
            }
          }
        }
      }

      if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph.join(' '));
      }

      const htmlParts = [];
      let totalWords = 0;

      for (const p of paragraphs) {
        if (typeof p === 'object' && p.isHeading) {
          const escaped = HtmlCleaner.escapeXml(p.text);
          htmlParts.push(`<h3>${escaped}</h3>`);
          stats.headingsCount++;
          totalWords += p.text.split(/\s+/).filter(Boolean).length;
        } else if (typeof p === 'string' && p.trim()) {
          let trimmedP = p.trim();
          totalWords += trimmedP.split(/\s+/).filter(Boolean).length;

          // Preserve dialogue dashes nicely
          if (detectQuotes && /^[-–—]\s*/.test(trimmedP)) {
            trimmedP = '— ' + trimmedP.replace(/^[-–—]\s*/, '');
          }

          const escaped = HtmlCleaner.escapeXml(trimmedP);
          htmlParts.push(`<p>${escaped}</p>`);
          stats.paragraphCount++;
        }
      }

      let finalHtml = htmlParts.join('\n');
      if (!finalHtml.trim()) {
        finalHtml = emptyPlaceholder;
      }

      stats.cleanedLength = finalHtml.length;
      stats.wordCount = totalWords;
      stats.characterCount = finalHtml.replace(/<[^>]*>/g, '').trim().length;

      return {
        cleanHtml: finalHtml,
        stats
      };
    }

    /**
     * Purges anti-crawler noise, micro-fonts, camouflage styling, scripts, and malformed tags
     * from dirty HTML and returns clean, standardized XHTML.
     * @param {string} dirtyHtml
     * @param {Object} [options={}]
     * @returns {Object} { cleanHtml, stats }
     */
    static cleanDirtyHtml(dirtyHtml, options = {}) {
      const emptyPlaceholder = options.emptyPlaceholder || '<p>pass</p>';
      const customRemovals = options.customRemovals || [];
      const stripStyles = options.stripStyles !== false;
      const removeMicroText = options.removeMicroText !== false;
      const removeInvisible = options.removeInvisible !== false;

      const stats = {
        originalLength: (dirtyHtml && typeof dirtyHtml === 'string') ? dirtyHtml.length : 0,
        cleanedLength: 0,
        paragraphCount: 0,
        wordCount: 0,
        characterCount: 0,
        headingsCount: 0,
        removedItems: {
          tinyFonts: 0,
          invisibleElements: 0,
          scriptsAndStyles: 0,
          junkAttributes: 0,
          watermarks: 0
        }
      };

      if (!dirtyHtml || typeof dirtyHtml !== 'string' || !dirtyHtml.trim()) {
        stats.cleanedLength = emptyPlaceholder.length;
        return {
          cleanHtml: emptyPlaceholder,
          stats
        };
      }

      let clean = dirtyHtml;

      // 0. Remove illegal XML 1.0 control characters
      clean = clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

      // 1. Remove scripts, styles, iframes, forms, embeds, and HTML comments
      const tagRemovals = [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,
        /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
        /<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi,
        /<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi,
        /<canvas\b[^<]*(?:(?!<\/canvas>)<[^<]*)*<\/canvas>/gi,
        /<audio\b[^<]*(?:(?!<\/audio>)<[^<]*)*<\/audio>/gi,
        /<video\b[^<]*(?:(?!<\/video>)<[^<]*)*<\/video>/gi,
        /<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi,
        /<!--[\s\S]*?-->/g
      ];

      for (const rx of tagRemovals) {
        const matches = clean.match(rx);
        if (matches) stats.removedItems.scriptsAndStyles += matches.length;
        clean = clean.replace(rx, '');
      }

      // Remove event handlers and javascript: URLs
      const onEventRegex = /\s+on[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi;
      const onMatches = clean.match(onEventRegex);
      if (onMatches) stats.removedItems.junkAttributes += onMatches.length;
      clean = clean.replace(onEventRegex, '');
      clean = clean.replace(/\bhref\s*=\s*["']\s*javascript:[^"']*["']/gi, 'href="#"');

      // 2. DOM-based cleaning if DOMParser / document is available
      if (typeof DOMParser !== 'undefined') {
        try {
          const doc = new DOMParser().parseFromString(clean, 'text/html');
          if (doc && doc.body) {
            // Check all styled elements for invisible / micro text
            const styledEls = doc.body.querySelectorAll('*[style]');
            styledEls.forEach((el) => {
              const style = (el.getAttribute('style') || '').toLowerCase();

              const isMicro = removeMicroText && (
                /font-size\s*:\s*(0(\.0*[0-9]+)?(px|pt|em|rem|%)?|0?\.?[0-9]px|[1-5]px|0\.[0-5](em|rem)|xx-small|x-small|[1-4]pt)\b/.test(style) ||
                /zoom\s*:\s*(0(\.0*[0-9]+)?|0\.[0-5])\b/.test(style) ||
                /transform\s*:\s*scale\(\s*0(\.[0-5])?\s*\)/.test(style)
              );

              const isInvisible = removeInvisible && (
                /color\s*:\s*(#fff(fff)?|white|transparent|rgba\(\s*255\s*,\s*255\s*,\s*255|rgba\([^)]*,\s*0(\.0+)?\s*\))/.test(style) ||
                /display\s*:\s*none\b/.test(style) ||
                /visibility\s*:\s*hidden\b/.test(style) ||
                /opacity\s*:\s*0(\.0+)?(?![0-9])/.test(style) ||
                /position\s*:\s*(absolute|fixed)\s*;\s*(left|top)\s*:\s*-\d{3,}/.test(style) ||
                /text-indent\s*:\s*-\d{3,}/.test(style) ||
                /(height|width)\s*:\s*0(px)?\s*;\s*overflow\s*:\s*hidden/.test(style) ||
                /line-height\s*:\s*0\b/.test(style)
              );

              if (isMicro) {
                stats.removedItems.tinyFonts++;
                el.remove();
              } else if (isInvisible) {
                stats.removedItems.invisibleElements++;
                el.remove();
              }
            });

            // Remove legacy white font tags or size=0/1 font tags
            const whiteFonts = doc.body.querySelectorAll('font[color="#ffffff" i], font[color="#fff" i], font[color="white" i], font[size="0" i], font[size="1" i], font[size="-2" i]');
            whiteFonts.forEach((el) => {
              stats.removedItems.tinyFonts++;
              el.remove();
            });

            // Remove user custom selectors
            const selectorsList = Array.isArray(customRemovals)
              ? customRemovals
              : (typeof customRemovals === 'string' ? customRemovals.split(',').map((s) => s.trim()).filter(Boolean) : []);

            for (const sel of selectorsList) {
              try {
                const matched = doc.body.querySelectorAll(sel);
                stats.removedItems.watermarks += matched.length;
                matched.forEach((el) => el.remove());
              } catch (e) {}
            }

            clean = doc.body.innerHTML;
          }
        } catch (e) {
          // Fallback to regex cleaning below
        }
      }

      // 3. Regex-based cleaning fallback / supplementary pass
      // Remove white/transparent font tags and tiny font tags
      const whiteFontRegex = /<font\b[^>]*\bcolor=["'](?:#ffffff|#fff|white|transparent)["'][^>]*>[\s\S]*?<\/font>/gi;
      const whiteFontMatches = clean.match(whiteFontRegex);
      if (whiteFontMatches) stats.removedItems.invisibleElements += whiteFontMatches.length;
      clean = clean.replace(whiteFontRegex, '');

      const tinyFontTagRegex = /<font\b[^>]*\bsize=["'](?:[01]|-2|-1)["'][^>]*>[\s\S]*?<\/font>/gi;
      const tinyFontMatches = clean.match(tinyFontTagRegex);
      if (tinyFontMatches) stats.removedItems.tinyFonts += tinyFontMatches.length;
      clean = clean.replace(tinyFontTagRegex, '');

      // Remove elements with micro-fonts
      const microRegex = /<([a-z0-9]+)\b[^>]*\bstyle=["'][^"']*(?:font-size\s*:\s*(?:0(?:\.0*[0-9]+)?(?:px|pt|em|rem|%)?|0?\.?[0-9]px|[1-5]px|0\.[0-5](?:em|rem)|xx-small|x-small|[1-4]pt)|zoom\s*:\s*(?:0(?:\.0*[0-9]+)?|0\.[0-5])|transform\s*:\s*scale\(\s*0(?:\.[0-5])?\s*\))[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi;
      const microMatches = clean.match(microRegex);
      if (microMatches) stats.removedItems.tinyFonts += microMatches.length;
      clean = clean.replace(microRegex, '');

      // Remove elements with invisible styles (colors, display, visibility, opacity, negative off-screen positions)
      const invisibleRegex = /<([a-z0-9]+)\b[^>]*\bstyle=["'][^"']*(?:color\s*:\s*(?:#fff(?:fff)?|white|transparent|rgba\(\s*255\s*,\s*255\s*,\s*255|rgba\([^)]*,\s*0(?:\.0+)?\s*\))|display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\.0+)?(?![0-9])|position\s*:\s*(?:absolute|fixed);\s*(?:left|top)\s*:\s*-\d{3,}|text-indent\s*:\s*-\d{3,}|line-height\s*:\s*0)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi;
      const invisibleMatches = clean.match(invisibleRegex);
      if (invisibleMatches) stats.removedItems.invisibleElements += invisibleMatches.length;
      clean = clean.replace(invisibleRegex, '');

      // Remove custom selectors by class regex if string provided
      if (customRemovals) {
        const selList = Array.isArray(customRemovals)
          ? customRemovals
          : (typeof customRemovals === 'string' ? customRemovals.split(',').map((s) => s.trim()).filter(Boolean) : []);
        for (const sel of selList) {
          if (typeof sel === 'string' && sel.startsWith('.')) {
            const className = sel.slice(1).trim();
            if (className) {
              const classRegex = new RegExp('<([a-z0-9]+)\\b[^>]*\\bclass=["\'][^"\']*\\b' + className + '\\b[^"\']*["\'][^>]*>[\\s\\S]*?<\\/\\1>', 'gi');
              clean = clean.replace(classRegex, '');
            }
          }
        }
      }

      // 4. Clean attributes: strip style, data-p-id, and unwanted classes
      if (stripStyles) {
        clean = clean.replace(/\s+style=["'][^"']*["']/gi, (match) => {
          stats.removedItems.junkAttributes++;
          return '';
        });
      }

      clean = clean.replace(/(<[a-z0-9]+\b[^>]*?)\s+data-[a-z0-9_-]+=["'][^"']*["']/gi, '$1');
      clean = clean.replace(/(<[a-z0-9]+\b[^>]*?)\s+class=["'][^"']*["']/gi, '$1');
      clean = clean.replace(/(<[a-z0-9]+\b[^>]*?)\s+id=["'][^"']*["']/gi, '$1');
      clean = clean.replace(/(<[a-z0-9]+\b[^>]*?)\s+align=["'][^"']*["']/gi, '$1');

      // 5. Semantic tag normalization
      // Convert legacy <b> to <strong>, <i> to <em>, <center> to div/p
      clean = clean.replace(/<b\b[^>]*>/gi, '<strong>').replace(/<\/b>/gi, '</strong>');
      clean = clean.replace(/<i\b[^>]*>/gi, '<em>').replace(/<\/i>/gi, '</em>');
      clean = clean.replace(/<\/?(?:center|font)\b[^>]*>/gi, '');

      // 6. Paragraph normalization: transform loose text and <br><br> into structured <p>...</p>
      clean = clean.replace(/<(?:br\s*\/?>\s*){2,}/gi, '</p><p>');
      clean = clean.replace(/<\/(?:div|section|article)>/gi, '</p>');
      clean = clean.replace(/<(?:div|section|article)\b[^>]*>/gi, '<p>');

      // Convert stray text before first <p> or after last </p>
      if (!/<p\b/i.test(clean)) {
        // If no paragraphs exist, split by <br/> or newlines
        clean = clean
          .split(/<br\s*\/?>|\n\n+/)
          .map((chunk) => {
            const trimmed = chunk.replace(/<[^>]*>/g, '').trim();
            return trimmed ? `<p>${chunk.trim()}</p>` : '';
          })
          .filter(Boolean)
          .join('\n');
      }

      // Remove empty paragraphs
      clean = clean.replace(/<p\b[^>]*>\s*(?:&nbsp;|\u00a0|<br\s*\/?>)*\s*<\/p>/gi, '');

      // 7. Ensure void tags (br, hr, img) are strictly self-closing for XHTML
      clean = clean.replace(/<(br|hr|img)([^>]*?)(?<!\/)>/gi, '<$1$2/>');

      // Count paragraphs and headings
      const pMatches = clean.match(/<p\b[^>]*>/gi);
      stats.paragraphCount = pMatches ? pMatches.length : 0;

      const hMatches = clean.match(/<h[1-6]\b[^>]*>/gi);
      stats.headingsCount = hMatches ? hMatches.length : 0;

      // Extract text content to measure statistics
      const textOnly = clean.replace(/<[^>]*>/g, '').trim();
      stats.wordCount = textOnly ? textOnly.split(/\s+/).filter(Boolean).length : 0;
      stats.characterCount = textOnly.length;

      // 8. If clean result is empty, return safe placeholder
      if (!textOnly) {
        clean = emptyPlaceholder;
        stats.paragraphCount = 1;
      }

      stats.cleanedLength = clean.length;

      return {
        cleanHtml: clean,
        stats
      };
    }

    /**
     * Unified processor: automatically detects text vs HTML (or respects mode) and returns clean HTML with stats.
     * @param {string} input
     * @param {Object} [options={}]
     * @returns {Object}
     */
    static process(input, options = {}) {
      if (!input || typeof input !== 'string') {
        const placeholder = options.emptyPlaceholder || '<p>pass</p>';
        return {
          success: true,
          detectedType: 'empty',
          cleanHtml: placeholder,
          stats: {
            originalLength: 0,
            cleanedLength: placeholder.length,
            paragraphCount: 1,
            wordCount: 0,
            characterCount: 0,
            headingsCount: 0,
            removedItems: {
              tinyFonts: 0,
              invisibleElements: 0,
              scriptsAndStyles: 0,
              junkAttributes: 0,
              watermarks: 0
            }
          }
        };
      }

      const mode = options.mode || 'auto';
      let detectedType = 'text';

      if (mode === 'html') {
        detectedType = 'html';
      } else if (mode === 'text') {
        detectedType = 'text';
      } else {
        detectedType = HtmlCleaner.isHtml(input) ? 'html' : 'text';
      }

      let result;
      if (detectedType === 'html') {
        result = HtmlCleaner.cleanDirtyHtml(input, options);
      } else {
        result = HtmlCleaner.textToHtml(input, options);
      }

      return {
        success: true,
        detectedType,
        cleanHtml: result.cleanHtml,
        stats: result.stats
      };
    }
  }

  return HtmlCleaner;
});
