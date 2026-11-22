// src/epub/epub-templates.js
// Standard EPUB 2/3 XML & XHTML Templates for VTPATE Studio

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    var exp = factory();
    module.exports = exp;
    module.exports.EpubTemplates = exp;
  } else {
    var exp = factory();
    root.EpubTemplates = exp;
  }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  /**
   * Escape XML special characters (& < > " ')
   * @param {string} str
   * @returns {string}
   */
  function escapeXml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Clean and transform raw chapter HTML to strict XML/XHTML compliance:
   * - Strips unsafe script and style tags
   * - Strips on* event attributes
   * - Strips invisible text & camouflage noise (white font, 0px font, etc.)
   * - Strips Wattpad data-p-id attributes
   * - Converts void tags to self-closing (<br/>, <hr/>, <img .../>)
   * - Escapes unescaped ampersands and stray angle brackets in text
   * - Fallback to <p>pass</p> when chapter is empty or contains no readable text
   * - Preserves Vietnamese diacritics and valid formatting tags
   * @param {string} html
   * @param {Object} [options={}]
   * @returns {string}
   */
  function sanitizeAndFormatHtml(html, options) {
    var opts = options || {};
    if (!html || typeof html !== 'string') {
      return (opts.fallbackEmpty !== false) ? (opts.emptyPlaceholder || '<p>pass</p>') : '';
    }
    var clean = html;

    // 0. Remove illegal XML 1.0 control characters
    clean = clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // 1. Remove dangerous script and style tags
    clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    clean = clean.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    // 2. Remove on* event handlers (onclick, onload, onerror, etc.)
    clean = clean.replace(/\s+on[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '');

    // 3. Remove invisible text / camouflage noise traps if not disabled
    if (opts.cleanInvisibleText !== false) {
      // White/transparent font tags
      clean = clean.replace(/<font\b[^>]*\bcolor=["'](?:#ffffff|#fff|white|transparent)["'][^>]*>[\s\S]*?<\/font>/gi, '');
      // Elements with invisible inline style patterns (0px font, white color, display none, visibility hidden, opacity 0)
      var invisibleRegex = /<([a-z0-9]+)\b[^>]*\bstyle=["'][^"']*(?:font-size\s*:\s*(?:0(?:\.0*[0-9]+)?(?:px|pt|em|rem)?|0?\.?[0-9]px|1px)|color\s*:\s*(?:#fff(?:fff)?|white|transparent|rgba\(\s*255\s*,\s*255\s*,\s*255|rgba\([^)]*,\s*0\b\))|display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\.0+)?|position\s*:\s*absolute;\s*left\s*:\s*-\d{3,})[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi;
      clean = clean.replace(invisibleRegex, '');
    }

    // Custom tags/classes to remove
    if (opts.customRemovals) {
      var selList = Array.isArray(opts.customRemovals)
        ? opts.customRemovals
        : (typeof opts.customRemovals === 'string' ? opts.customRemovals.split(',').map(function(s) { return s.trim(); }).filter(Boolean) : []);
      for (var r = 0; r < selList.length; r++) {
        var sel = selList[r];
        if (sel.indexOf('.') === 0) {
          var cls = sel.slice(1);
          var clsRegex = new RegExp('<([a-z0-9]+)\\b[^>]*\\bclass=["\'][^"\']*\\b' + cls + '\\b[^"\']*["\'][^>]*>[\\s\\S]*?<\\/\\1>', 'gi');
          clean = clean.replace(clsRegex, '');
        }
      }
    }

    // Custom regex removals (Trash text / Watermark cleaner)
    if (opts.customRegexList && Array.isArray(opts.customRegexList)) {
      for (var rx = 0; rx < opts.customRegexList.length; rx++) {
        var pattern = opts.customRegexList[rx];
        if (pattern) {
          try {
            var re = new RegExp(pattern, 'gi');
            clean = clean.replace(re, '');
          } catch (e) {}
        }
      }
    }

    // 4. Remove Wattpad proprietary data-p-id attribute
    clean = clean.replace(/(<p\b[^>]*?)\s+data-p-id="[^"]*"/gi, '$1');

    // 5. Ensure void tags are self-closing for strict XHTML
    var voidTags = 'area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr';
    var voidTagRegex = new RegExp('<(' + voidTags + ')(\\s+[^>]*?)?(\\/?)>', 'gi');
    clean = clean.replace(voidTagRegex, function (match, tag, attrs, slash) {
      if (slash === '/') return match;
      var trimmedAttrs = attrs ? attrs.trimEnd() : '';
      return '<' + tag + trimmedAttrs + '/>';
    });

    // 6. Escape unescaped ampersands (& not followed by a valid entity name or numeric ref)
    clean = clean.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');

    // 7. Handle stray < or > characters in text content
    var parts = clean.split(/(<\/?(?:[a-zA-Z][a-zA-Z0-9:-]*)(?:\s+[^>]*)?\/?>)/g);
    for (var i = 0; i < parts.length; i++) {
      if (i % 2 === 0 && parts[i]) {
        parts[i] = parts[i]
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      }
    }
    clean = parts.join('');

    // 8. If empty or whitespace only, fallback to <p>pass</p>
    var textOnly = clean.replace(/<[^>]*>/g, '').trim();
    if (!textOnly && opts.fallbackEmpty !== false) {
      clean = opts.emptyPlaceholder || '<p>pass</p>';
    }

    return clean;
  }

  /**
   * Generates META-INF/container.xml pointing to OPF package rootfile
   * @param {string} [rootfilePath='OEBPS/content.opf']
   * @returns {string}
   */
  function createContainerXml(rootfilePath) {
    var path = rootfilePath || 'OEBPS/content.opf';
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n' +
      '  <rootfiles>\n' +
      '    <rootfile full-path="' + path + '" media-type="application/oebps-package+xml"/>\n' +
      '  </rootfiles>\n' +
      '</container>';
  }

  /**
   * Generates OEBPS/content.opf package file
   * @param {Object} metadata
   * @param {Array<Object>} chapters
   * @param {Array<Object>} [images=[]]
   * @param {Object} [options={}]
   * @returns {string}
   */
  function createContentOpf(metadata, chapters, images, options) {
    var meta = metadata || {};
    var chList = chapters || [];
    var imgList = images || [];
    var opts = options || {};

    var title = meta.title || 'Untitled';
    var author = meta.author || 'Unknown';
    var language = meta.language || 'vi';
    var description = meta.description || '';
    var identifier = meta.identifier || ('urn:uuid:' + (meta.id || Date.now()));
    var modified = opts.modifiedDate || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

    // Build Manifest items
    var manifestItems = [];
    manifestItems.push('    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>');
    manifestItems.push('    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>');
    manifestItems.push('    <item id="stylesheet" href="css/style.css" media-type="text/css"/>');

    // Cover image manifest entry
    if (meta.coverFilename) {
      var coverMime = meta.coverMimeType || (meta.coverFilename.endsWith('.png') ? 'image/png' : 'image/jpeg');
      manifestItems.push('    <item id="cover-image" href="images/' + meta.coverFilename + '" media-type="' + coverMime + '" properties="cover-image"/>');
    }

    // Additional inline images
    for (var i = 0; i < imgList.length; i++) {
      var img = imgList[i];
      var imgId = img.id || ('img_' + (i + 1));
      var imgMime = img.mimeType || 'image/jpeg';
      manifestItems.push('    <item id="' + imgId + '" href="images/' + img.filename + '" media-type="' + imgMime + '"/>');
    }

    // Custom Font / Obfuscated Font manifest entries
    var fontList = opts.fonts ? opts.fonts.slice() : [];
    var singleFont = opts.customFont || meta.customFont;
    if (singleFont && (singleFont.enabled !== false) && singleFont.filename) {
      fontList.push(singleFont);
    }
    for (var f = 0; f < fontList.length; f++) {
      var font = fontList[f];
      var fontId = font.id || ('font_' + (f + 1));
      var fontFilename = font.filename || 'CustomFont.ttf';
      var fontMime = font.mimeType || (fontFilename.endsWith('.woff2') ? 'font/woff2' : (fontFilename.endsWith('.woff') ? 'font/woff' : (fontFilename.endsWith('.otf') ? 'font/otf' : 'font/ttf')));
      manifestItems.push('    <item id="' + fontId + '" href="fonts/' + fontFilename + '" media-type="' + fontMime + '"/>');
    }

    // Intro XHTML item if requested
    var spineItems = [];
    if (opts && opts.includeIntroChapter) {
      manifestItems.push('    <item id="intro" href="chapters/intro.xhtml" media-type="application/xhtml+xml"/>');
      spineItems.push('    <itemref idref="intro"/>');
    }

    // Chapter XHTML items
    for (var j = 0; j < chList.length; j++) {
      var ch = chList[j];
      var chNum = ch.chapterNumber !== undefined ? ch.chapterNumber : (j + 1);
      var chId = 'chapter_' + chNum;
      var chFilename = 'chapters/ch_' + chNum + '.xhtml';
      manifestItems.push('    <item id="' + chId + '" href="' + chFilename + '" media-type="application/xhtml+xml"/>');
      spineItems.push('    <itemref idref="' + chId + '"/>');
    }

    var coverMeta = meta.coverFilename ? '    <meta name="cover" content="cover-image"/>\n' : '';

    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">\n' +
      '  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n' +
      '    <dc:identifier id="pub-id">' + escapeXml(identifier) + '</dc:identifier>\n' +
      '    <dc:title>' + escapeXml(title) + '</dc:title>\n' +
      '    <dc:creator id="creator">' + escapeXml(author) + '</dc:creator>\n' +
      '    <dc:language>' + escapeXml(language) + '</dc:language>\n' +
      (description ? '    <dc:description>' + escapeXml(description) + '</dc:description>\n' : '') +
      '    <meta property="dcterms:modified" content="' + modified + '"/>\n' +
      coverMeta +
      '  </metadata>\n' +
      '  <manifest>\n' +
      manifestItems.join('\n') + '\n' +
      '  </manifest>\n' +
      '  <spine toc="ncx">\n' +
      spineItems.join('\n') + '\n' +
      '  </spine>\n' +
      '</package>';
  }

  /**
   * Generates OEBPS/toc.ncx (EPUB 2 / Calibre / KOReader Table of Contents)
   * @param {Object} metadata
   * @param {Array<Object>} chapters
   * @param {Object} [options={}]
   * @returns {string}
   */
  function createTocNcx(metadata, chapters, options) {
    var meta = metadata || {};
    var chList = chapters || [];
    var title = meta.title || 'Untitled';
    var author = meta.author || 'Unknown';
    var identifier = meta.identifier || ('urn:uuid:' + (meta.id || Date.now()));

    var navPoints = [];
    var startIdx = 1;
    if (options && options.includeIntroChapter) {
      navPoints.push(
        '    <navPoint id="navPoint-1" playOrder="1">\n' +
        '      <navLabel>\n' +
        '        <text>Giới Thiệu Tác Phẩm</text>\n' +
        '      </navLabel>\n' +
        '      <content src="chapters/intro.xhtml"/>\n' +
        '    </navPoint>'
      );
      startIdx = 2;
    }
    for (var i = 0; i < chList.length; i++) {
      var ch = chList[i];
      var chNum = ch.chapterNumber !== undefined ? ch.chapterNumber : (i + 1);
      var playOrder = i + startIdx;
      var chTitle = ch.title || ('Chương ' + chNum);
      navPoints.push(
        '    <navPoint id="navPoint-' + playOrder + '" playOrder="' + playOrder + '">\n' +
        '      <navLabel>\n' +
        '        <text>' + escapeXml(chTitle) + '</text>\n' +
        '      </navLabel>\n' +
        '      <content src="chapters/ch_' + chNum + '.xhtml"/>\n' +
        '    </navPoint>'
      );
    }

    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n' +
      '  <head>\n' +
      '    <meta name="dtb:uid" content="' + escapeXml(identifier) + '"/>\n' +
      '    <meta name="dtb:depth" content="1"/>\n' +
      '    <meta name="dtb:totalPageCount" content="0"/>\n' +
      '    <meta name="dtb:maxPageNumber" content="0"/>\n' +
      '  </head>\n' +
      '  <docTitle>\n' +
      '    <text>' + escapeXml(title) + '</text>\n' +
      '  </docTitle>\n' +
      '  <docAuthor>\n' +
      '    <text>' + escapeXml(author) + '</text>\n' +
      '  </docAuthor>\n' +
      '  <navMap>\n' +
      navPoints.join('\n') + '\n' +
      '  </navMap>\n' +
      '</ncx>';
  }

  /**
   * Generates OEBPS/nav.xhtml (EPUB 3 Navigation Document)
   * @param {Object} metadata
   * @param {Array<Object>} chapters
   * @param {Object} [options={}]
   * @returns {string}
   */
  function createNavXhtml(metadata, chapters, options) {
    var meta = metadata || {};
    var chList = chapters || [];
    var title = meta.title || 'Mục Lục';
    var language = meta.language || 'vi';

    var listItems = [];
    if (options && options.includeIntroChapter) {
      listItems.push('      <li><a href="chapters/intro.xhtml">Giới Thiệu Tác Phẩm</a></li>');
    }
    for (var i = 0; i < chList.length; i++) {
      var ch = chList[i];
      var chNum = ch.chapterNumber !== undefined ? ch.chapterNumber : (i + 1);
      var chTitle = ch.title || ('Chương ' + chNum);
      listItems.push(
        '      <li><a href="chapters/ch_' + chNum + '.xhtml">' + escapeXml(chTitle) + '</a></li>'
      );
    }

    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<!DOCTYPE html>\n' +
      '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="' + escapeXml(language) + '" lang="' + escapeXml(language) + '">\n' +
      '<head>\n' +
      '  <meta charset="utf-8"/>\n' +
      '  <title>' + escapeXml(title) + '</title>\n' +
      '  <link rel="stylesheet" type="text/css" href="css/style.css"/>\n' +
      '</head>\n' +
      '<body>\n' +
      '  <nav epub:type="toc" id="toc">\n' +
      '    <h2>Mục Lục</h2>\n' +
      '    <ol>\n' +
      listItems.join('\n') + '\n' +
      '    </ol>\n' +
      '  </nav>\n' +
      '</body>\n' +
      '</html>';
  }

  /**
   * Generates Chapter XHTML document
   * @param {Object} chapter
   * @param {Object} [metadata={}]
   * @param {Object} [options={}]
   * @returns {string}
   */
  function createChapterXhtml(chapter, metadata, options) {
    var ch = chapter || {};
    var meta = metadata || {};
    var language = meta.language || 'vi';
    var chNum = ch.chapterNumber !== undefined ? ch.chapterNumber : 1;
    var chTitle = ch.title || ('Chương ' + chNum);
    var content = sanitizeAndFormatHtml(ch.contentHtml || '', options);

    return '<?xml version="1.0" encoding="utf-8"?>\n' +
      '<!DOCTYPE html>\n' +
      '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="' + escapeXml(language) + '" lang="' + escapeXml(language) + '">\n' +
      '<head>\n' +
      '  <meta charset="utf-8"/>\n' +
      '  <title>' + escapeXml(chTitle) + '</title>\n' +
      '  <link rel="stylesheet" type="text/css" href="../css/style.css"/>\n' +
      '</head>\n' +
      '<body>\n' +
      '  <div class="chapter-container">\n' +
      '    <h1 class="chapter-title">' + escapeXml(chTitle) + '</h1>\n' +
      '    <div class="chapter-content">\n' +
      '      ' + content + '\n' +
      '    </div>\n' +
      '  </div>\n' +
      '</body>\n' +
      '</html>';
  }

  /**
   * Generates Intro / About Book XHTML document
   * @param {Object} metadata
   * @param {Object} [options={}]
   * @returns {string}
   */
  function createIntroXhtml(metadata, options) {
    var meta = metadata || {};
    var opts = options || {};
    var title = meta.title || 'Giới Thiệu Tác Phẩm';
    var author = meta.author || 'Tác giả chưa rõ';
    var language = meta.language || 'vi';
    var description = meta.description || 'Chưa có thông tin giới thiệu.';
    var novelUrl = meta.novelUrl || meta.url || '';
    var totalChapters = meta.totalChapters || (opts.chapterCount || 0);

    var formattedDesc = description;
    if (!/<[a-z][\s\S]*>/i.test(formattedDesc)) {
      var lines = formattedDesc.split(/\n+/).map(function (line) {
        return line.trim();
      }).filter(Boolean);
      formattedDesc = lines.map(function (line) {
        return '<p>' + escapeXml(line) + '</p>';
      }).join('\n');
    } else {
      formattedDesc = sanitizeAndFormatHtml(formattedDesc, opts);
    }

    var coverHtml = '';
    if (meta.coverFilename) {
      coverHtml = '<div class="intro-cover-box" style="text-align: center; margin-bottom: 24px;"><img class="intro-cover-image" src="../images/' + meta.coverFilename + '" alt="' + escapeXml(title) + '" style="max-height: 400px; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);"/></div>\n';
    }

    var sourceHtml = novelUrl ? '<p class="intro-source"><strong>Nguồn truyện:</strong> <a href="' + escapeXml(novelUrl) + '">' + escapeXml(novelUrl) + '</a></p>\n' : '';
    var totalHtml = totalChapters > 0 ? '<p class="intro-total"><strong>Tổng số chương:</strong> ' + totalChapters + ' chương</p>\n' : '';

    return '<?xml version="1.0" encoding="utf-8"?>\n' +
      '<!DOCTYPE html>\n' +
      '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="' + escapeXml(language) + '" lang="' + escapeXml(language) + '">\n' +
      '<head>\n' +
      '  <meta charset="utf-8"/>\n' +
      '  <title>Giới Thiệu Tác Phẩm</title>\n' +
      '  <link rel="stylesheet" type="text/css" href="../css/style.css"/>\n' +
      '</head>\n' +
      '<body>\n' +
      '  <div class="chapter-container intro-container">\n' +
      coverHtml +
      '    <h1 class="chapter-title intro-title">' + escapeXml(title) + '</h1>\n' +
      '    <div class="intro-meta" style="margin: 16px 0; font-size: 0.95em; color: #555;">\n' +
      '      <p class="intro-author"><strong>Tác giả:</strong> ' + escapeXml(author) + '</p>\n' +
      sourceHtml +
      totalHtml +
      '    </div>\n' +
      '    <hr class="intro-divider" style="margin: 20px 0; border: 0; border-top: 1px solid #ddd;"/>\n' +
      '    <div class="chapter-content intro-description">\n' +
      '      <h2 style="font-size: 1.25em; margin-bottom: 12px;">Giới Thiệu Tác Phẩm</h2>\n' +
      formattedDesc + '\n' +
      '    </div>\n' +
      '  </div>\n' +
      '</body>\n' +
      '</html>';
  }

  return {
    escapeXml: escapeXml,
    sanitizeAndFormatHtml: sanitizeAndFormatHtml,
    createContainerXml: createContainerXml,
    createContentOpf: createContentOpf,
    createTocNcx: createTocNcx,
    createNavXhtml: createNavXhtml,
    createChapterXhtml: createChapterXhtml,
    createIntroXhtml: createIntroXhtml
  };
});
