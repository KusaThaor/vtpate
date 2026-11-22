// src/epub/epub-repairer.js
// Production EPUB Doctor & Auto-Repair Engine for VTPATE Studio
// Fixes: Hidden text/noise camouflage, empty chapters (<p>pass</p>), malformed XML/XHTML,
// custom font injection for obfuscated fonts, and IDPF OCF container compliance.

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.EpubRepairer = factory();
  }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  function getHostRequire() {
    if (typeof require === 'function') return require;
    return null;
  }

  function resolveJSZip(options) {
    if (options && options.JSZip) return options.JSZip;
    if (typeof JSZip !== 'undefined') return JSZip;
    if (typeof window !== 'undefined' && window.JSZip) return window.JSZip;

    var hostReq = getHostRequire();
    if (hostReq) {
      try {
        var hostPath = hostReq('path');
        var baseDir = (typeof __dirname !== 'undefined') ? __dirname : (typeof process !== 'undefined' && process.cwd ? hostPath.resolve(process.cwd(), 'src/epub') : '');
        var fullPath = hostPath.resolve(baseDir, '../../libs/jszip.min.js');
        return hostReq(fullPath);
      } catch (e1) {
        try {
          return hostReq('../../libs/jszip.min.js');
        } catch (e2) {}
      }
    }
    throw new Error('JSZip is not available in environment');
  }

  function resolveBaseParser() {
    if (typeof BaseParser !== 'undefined') return BaseParser;
    if (typeof window !== 'undefined' && window.BaseParser) return window.BaseParser;
    var hostReq = getHostRequire();
    if (hostReq) {
      try {
        return hostReq('../parsers/base-parser');
      } catch (e) {}
    }
    return null;
  }

  function resolveTemplates() {
    if (typeof EpubTemplates !== 'undefined') return EpubTemplates;
    if (typeof window !== 'undefined' && window.EpubTemplates) return window.EpubTemplates;
    var hostReq = getHostRequire();
    if (hostReq) {
      try {
        return hostReq('./epub-templates');
      } catch (e) {}
    }
    return null;
  }

  /**
   * Escape XML entities
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
   * Remove invisible text traps, micro-fonts (0-1px), white/transparent text, and camouflage noise
   */
  function cleanInvisibleText(html, customSelectors) {
    const baseParser = resolveBaseParser();
    if (baseParser && typeof baseParser.cleanInvisibleAndCamouflageText === 'function') {
      return baseParser.cleanInvisibleAndCamouflageText(html, customSelectors);
    }

    if (!html || typeof html !== 'string') return '';
    let clean = html;

    // Remove legacy white fonts
    clean = clean.replace(/<font\b[^>]*\bcolor=["'](?:#ffffff|#fff|white|transparent)["'][^>]*>[\s\S]*?<\/font>/gi, '');

    // Remove elements with invisible inline style patterns
    const invisibleStyleRegex = /<([a-z0-9]+)\b[^>]*\bstyle=["'][^"']*(?:font-size\s*:\s*(?:0(?:\.0*[0-9]+)?(?:px|pt|em|rem)?|0?\.?[0-9]px|1px)|color\s*:\s*(?:#fff(?:fff)?|white|transparent|rgba\(\s*255\s*,\s*255\s*,\s*255|rgba\([^)]*,\s*0\b\))|display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\.0+)?|position\s*:\s*absolute;\s*left\s*:\s*-\d{3,})[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi;
    clean = clean.replace(invisibleStyleRegex, '');

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
   * Sanitize & repair XHTML formatting
   */
  function sanitizeXhtml(html, options = {}) {
    const templates = resolveTemplates();
    if (templates && typeof templates.sanitizeAndFormatHtml === 'function') {
      return templates.sanitizeAndFormatHtml(html, options);
    }

    if (!html || typeof html !== 'string') {
      return options.emptyPlaceholder || '<p>pass</p>';
    }

    let clean = html;
    // Strip XML control characters
    clean = clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    clean = clean.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    clean = clean.replace(/\s+on[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '');

    if (options.cleanInvisibleText !== false) {
      clean = cleanInvisibleText(clean, options.customRemovals);
    }

    // Void tags self-closing
    const voidTags = 'area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr';
    const voidTagRegex = new RegExp('<(' + voidTags + ')(\\s+[^>]*?)?(\\/?)>', 'gi');
    clean = clean.replace(voidTagRegex, (match, tag, attrs, slash) => {
      if (slash === '/') return match;
      const trimmedAttrs = attrs ? attrs.trimEnd() : '';
      return '<' + tag + trimmedAttrs + '/>';
    });

    clean = clean.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');

    const textOnly = clean.replace(/<[^>]*>/g, '').trim();
    if (!textOnly && options.fallbackEmpty !== false) {
      return options.emptyPlaceholder || '<p>pass</p>';
    }

    return clean;
  }

  /**
   * Main EpubRepairer Class
   */
  function EpubRepairer(options = {}) {
    this.options = options;
  }

  /**
   * Static convenience method
   */
  EpubRepairer.repairEpub = async function (epubInput, options = {}) {
    return new EpubRepairer(options).repairEpub(epubInput, options);
  };

  /**
   * Static inspection and diagnosis method (does not alter or re-pack)
   */
  EpubRepairer.inspectEpub = async function (epubInput, options = {}) {
    return new EpubRepairer(options).inspectEpub(epubInput, options);
  };

  /**
   * Inspect an EPUB file and return diagnostic findings
   */
  EpubRepairer.prototype.inspectEpub = async function (epubInput, options = {}) {
    const JSZipClass = resolveJSZip(options);

    let buffer = epubInput;
    if (typeof Blob !== 'undefined' && epubInput instanceof Blob) {
      buffer = await epubInput.arrayBuffer();
    }

    const zip = await JSZipClass.loadAsync(buffer);
    const diagnosis = {
      isCompliantMimetype: false,
      mimetypeDetails: '',
      opfPath: '',
      title: 'Unknown Title',
      author: 'Unknown Author',
      totalFiles: Object.keys(zip.files).length,
      chapterCount: 0,
      invisibleNoiseCount: 0,
      emptyChaptersCount: 0,
      malformedControlCharsCount: 0,
      hasCustomFont: false,
      issues: []
    };

    // 1. Check mimetype
    const firstFilename = Object.keys(zip.files)[0];
    const mimeFile = zip.file('mimetype');
    if (firstFilename === 'mimetype' && mimeFile) {
      const mimeText = (await mimeFile.async('text')).trim();
      if (mimeText === 'application/epub+zip') {
        diagnosis.isCompliantMimetype = true;
      } else {
        diagnosis.issues.push(`mimetype chứa nội dung không chuẩn: "${mimeText}"`);
      }
    } else {
      diagnosis.issues.push("File 'mimetype' không nằm ở vị trí đầu tiên (byte 0) của file nén EPUB.");
    }

    // 2. Locate container and OPF
    let opfPath = '';
    const containerFile = zip.file('META-INF/container.xml');
    if (containerFile) {
      const containerXml = await containerFile.async('text');
      const rootfileMatch = /full-path=["']([^"']+\.opf)["']/i.exec(containerXml);
      if (rootfileMatch) {
        opfPath = rootfileMatch[1];
      }
    }
    if (!opfPath) {
      const opfFiles = zip.file(/\.opf$/i);
      if (opfFiles.length > 0) {
        opfPath = opfFiles[0].name;
      }
    }
    diagnosis.opfPath = opfPath;

    // 3. Read OPF metadata & manifest
    const chapterPaths = [];
    if (opfPath && zip.file(opfPath)) {
      const opfXml = await zip.file(opfPath).async('text');
      const titleMatch = /<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/i.exec(opfXml);
      if (titleMatch) diagnosis.title = titleMatch[1].replace(/<[^>]*>/g, '').trim();

      const authorMatch = /<dc:creator\b[^>]*>([\s\S]*?)<\/dc:creator>/i.exec(opfXml);
      if (authorMatch) diagnosis.author = authorMatch[1].replace(/<[^>]*>/g, '').trim();

      // Check if custom font exists in manifest
      if (/media-type=["'](?:font\/|application\/font|application\/x-font)/i.test(opfXml)) {
        diagnosis.hasCustomFont = true;
      }

      // Find chapter items
      const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
      const itemRegex = /<item\b[^>]*\bhref=["']([^"']+\.(?:xhtml|html|htm))["'][^>]*>/gi;
      let itemMatch;
      while ((itemMatch = itemRegex.exec(opfXml)) !== null) {
        const href = itemMatch[1];
        if (!href.includes('nav.') && !href.includes('toc.')) {
          chapterPaths.push(opfDir ? opfDir + href : href);
        }
      }
    }

    if (chapterPaths.length === 0) {
      // Fallback: scan zip files directly for chapter xhtml
      zip.forEach((path) => {
        if (/\.(xhtml|html|htm)$/i.test(path) && !path.includes('nav.') && !path.includes('toc.')) {
          chapterPaths.push(path);
        }
      });
    }

    diagnosis.chapterCount = chapterPaths.length;

    // 4. Scan chapters for invisible noise, empty content, and malformed characters
    for (const chPath of chapterPaths) {
      const file = zip.file(chPath);
      if (!file) continue;
      const html = await file.async('text');

      const ctrlMatches = html.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g);
      if (ctrlMatches) {
        diagnosis.malformedControlCharsCount += ctrlMatches.length;
      }

      const noiseMatches = html.match(/<[a-z0-9]+\b[^>]*\bstyle=["'][^"']*(?:font-size\s*:\s*(?:0(?:\.0*[0-9]+)?(?:px|pt|em|rem)?|0?\.?[0-9]px|1px)|color\s*:\s*(?:#fff(?:fff)?|white|transparent)|display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0)[^"']*["'][^>]*>|<font\b[^>]*\bcolor=["'](?:#ffffff|#fff|white)["']/gi);
      if (noiseMatches) {
        diagnosis.invisibleNoiseCount += noiseMatches.length;
      }

      const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html);
      const bodyScope = bodyMatch ? bodyMatch[1] : html;
      const textOnly = bodyScope.replace(/<[^>]*>/g, '').replace(/&[a-z0-9#]+;/gi, '').trim();
      if (!textOnly) {
        diagnosis.emptyChaptersCount++;
      }
    }

    if (diagnosis.invisibleNoiseCount > 0) {
      diagnosis.issues.push(`Phát hiện ${diagnosis.invisibleNoiseCount} đoạn chữ ẩn, bẫy rác màu trắng / font 0px trong các chương.`);
    }
    if (diagnosis.emptyChaptersCount > 0) {
      diagnosis.issues.push(`Phát hiện ${diagnosis.emptyChaptersCount} chương rỗng không có chữ (sẽ chèn <p>pass</p>).`);
    }
    if (diagnosis.malformedControlCharsCount > 0) {
      diagnosis.issues.push(`Phát hiện ${diagnosis.malformedControlCharsCount} ký tự điều khiển XML bất hợp pháp.`);
    }

    return diagnosis;
  };

  /**
   * Deep repair and auto-fix an existing EPUB file
   * @param {ArrayBuffer|Blob|Buffer} epubInput
   * @param {Object} [options={}]
   * @returns {Promise<{ blob: Blob|Buffer, stats: Object, filename: string }>}
   */
  EpubRepairer.prototype.repairEpub = async function (epubInput, options = {}) {
    const opts = Object.assign({}, this.options, options);
    const JSZipClass = resolveJSZip(opts);

    let buffer = epubInput;
    if (typeof Blob !== 'undefined' && epubInput instanceof Blob) {
      buffer = await epubInput.arrayBuffer();
    }

    // 1. Load source zip
    const srcZip = await JSZipClass.loadAsync(buffer);

    const stats = {
      totalChapters: 0,
      hiddenNoiseRemoved: 0,
      emptyChaptersFilled: 0,
      controlCharsRemoved: 0,
      voidTagsClosed: 0,
      customSelectorsCleaned: 0,
      fontInjected: false,
      mimetypeNormalized: true,
      title: 'Repaired Novel',
      author: 'Unknown Author',
      details: []
    };

    // 2. Identify OPF package file
    let opfPath = '';
    const containerEntry = srcZip.file('META-INF/container.xml');
    if (containerEntry) {
      const containerXml = await containerEntry.async('text');
      const rootfileMatch = /full-path=["']([^"']+\.opf)["']/i.exec(containerXml);
      if (rootfileMatch) {
        opfPath = rootfileMatch[1];
      }
    }
    if (!opfPath) {
      const opfCandidates = srcZip.file(/\.opf$/i);
      if (opfCandidates.length > 0) {
        opfPath = opfCandidates[0].name;
      }
    }
    if (!opfPath) {
      opfPath = 'OEBPS/content.opf';
    }

    const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

    // 3. Locate and catalog chapter XHTML files
    const chapterEntries = [];
    if (srcZip.file(opfPath)) {
      const opfXml = await srcZip.file(opfPath).async('text');
      const titleMatch = /<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/i.exec(opfXml);
      if (titleMatch) stats.title = titleMatch[1].replace(/<[^>]*>/g, '').trim();

      const authorMatch = /<dc:creator\b[^>]*>([\s\S]*?)<\/dc:creator>/i.exec(opfXml);
      if (authorMatch) stats.author = authorMatch[1].replace(/<[^>]*>/g, '').trim();

      const itemRegex = /<item\b[^>]*\bhref=["']([^"']+\.(?:xhtml|html|htm))["'][^>]*>/gi;
      let m;
      while ((m = itemRegex.exec(opfXml)) !== null) {
        const href = m[1];
        if (!href.includes('nav.') && !href.includes('toc.')) {
          const fullPath = opfDir ? opfDir + href : href;
          if (srcZip.file(fullPath)) {
            chapterEntries.push({ path: fullPath, href });
          }
        }
      }
    }

    if (chapterEntries.length === 0) {
      srcZip.forEach((path) => {
        if (/\.(xhtml|html|htm)$/i.test(path) && !path.includes('nav.') && !path.includes('toc.')) {
          chapterEntries.push({ path, href: path });
        }
      });
    }

    stats.totalChapters = chapterEntries.length;

    // 4. Clean and repair each chapter XHTML file
    const repairedChapters = new Map(); // path -> repairedHtml

    for (let i = 0; i < chapterEntries.length; i++) {
      const item = chapterEntries[i];
      const chFile = srcZip.file(item.path);
      if (!chFile) continue;

      const rawHtml = await chFile.async('text');

      // Count stats
      const ctrlMatches = rawHtml.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g);
      if (ctrlMatches) stats.controlCharsRemoved += ctrlMatches.length;

      const noiseMatches = rawHtml.match(/<[a-z0-9]+\b[^>]*\bstyle=["'][^"']*(?:font-size\s*:\s*(?:0(?:\.0*[0-9]+)?(?:px|pt|em|rem)?|0?\.?[0-9]px|1px)|color\s*:\s*(?:#fff(?:fff)?|white|transparent)|display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0)[^"']*["'][^>]*>|<font\b[^>]*\bcolor=["'](?:#ffffff|#fff|white)["']/gi);
      if (noiseMatches) stats.hiddenNoiseRemoved += noiseMatches.length;

      // Extract body scope if present
      const origBodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(rawHtml);
      const rawBodyScope = origBodyMatch ? origBodyMatch[1] : rawHtml;

      // Clean invisible text & camouflage noise
      let cleanBody = cleanInvisibleText(rawBodyScope, opts.customRemovals);

      // Check if body is empty or whitespace only
      const textOnly = cleanBody.replace(/<[^>]*>/g, '').replace(/&[a-z0-9#]+;/gi, '').trim();
      let isEmpty = false;
      if (!textOnly) {
        isEmpty = true;
        stats.emptyChaptersFilled++;
        cleanBody = opts.emptyPlaceholder || '<p>pass</p>';
      }

      // Strict XHTML formatting & void tag repair
      const sanitized = sanitizeXhtml(cleanBody, {
        cleanInvisibleText: opts.cleanInvisibleText !== false,
        customRemovals: opts.customRemovals,
        fallbackEmpty: true,
        emptyPlaceholder: opts.emptyPlaceholder || '<p>pass</p>'
      });

      // Extract title and body content for proper XHTML document structuring
      let docTitle = `Chương ${i + 1}`;
      const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(rawHtml) || /<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/i.exec(rawHtml);
      if (titleMatch) {
        docTitle = titleMatch[1].replace(/<[^>]*>/g, '').trim() || docTitle;
      }

      let innerContent = sanitized;
      const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(sanitized);
      if (bodyMatch) {
        innerContent = bodyMatch[1].trim();
      }

      // Re-structure as strict valid XML/XHTML 1.1 / OPS 3.0 document
      const styleRelativePath = opfDir ? '../css/style.css' : 'css/style.css';
      const repairedDoc = '<?xml version="1.0" encoding="utf-8"?>\n' +
        '<!DOCTYPE html>\n' +
        '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="vi" lang="vi">\n' +
        '<head>\n' +
        '  <meta charset="utf-8"/>\n' +
        '  <title>' + escapeXml(docTitle) + '</title>\n' +
        '  <link rel="stylesheet" type="text/css" href="' + styleRelativePath + '"/>\n' +
        '</head>\n' +
        '<body>\n' +
        '  <div class="chapter-container">\n' +
        '    <h1 class="chapter-title">' + escapeXml(docTitle) + '</h1>\n' +
        '    <div class="chapter-content">\n' +
        '      ' + innerContent + '\n' +
        '    </div>\n' +
        '  </div>\n' +
        '</body>\n' +
        '</html>';

      repairedChapters.set(item.path, repairedDoc);

      if (typeof opts.onProgress === 'function') {
        opts.onProgress({
          current: i + 1,
          total: chapterEntries.length,
          chapter: docTitle,
          isEmpty
        });
      }
    }

    // 5. Build fresh IDPF OCF compliant ZIP archive
    const newZip = new JSZipClass();

    // IDPF Spec Rule: 'mimetype' MUST be at index 0, STORE (no compression), 20 bytes
    newZip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

    // 6. Handle Custom Font Injection (if provided)
    let fontFilename = '';
    let fontData = null;
    let fontMime = 'font/woff2';
    const customFont = opts.customFont;
    if (customFont && customFont.enabled !== false && customFont.filename) {
      fontFilename = customFont.filename;
      fontData = customFont.data || customFont.dataBlob || customFont.dataBuffer;
      if (!fontData && customFont.dataBase64) {
        const base64Clean = customFont.dataBase64.replace(/^data:[^;]+;base64,/, '');
        if (typeof Buffer !== 'undefined') {
          fontData = Buffer.from(base64Clean, 'base64');
        } else if (typeof atob !== 'undefined') {
          const binaryStr = atob(base64Clean);
          const len = binaryStr.length;
          const bytes = new Uint8Array(len);
          for (let b = 0; b < len; b++) {
            bytes[b] = binaryStr.charCodeAt(b);
          }
          fontData = bytes;
        }
      }

      if (fontData) {
        fontMime = customFont.mimeType || (fontFilename.endsWith('.woff2') ? 'font/woff2' : (fontFilename.endsWith('.woff') ? 'font/woff' : (fontFilename.endsWith('.otf') ? 'font/otf' : 'font/ttf')));
        const fontZipPath = (opfDir ? opfDir : 'OEBPS/') + 'fonts/' + fontFilename;
        newZip.file(fontZipPath, fontData);
        stats.fontInjected = true;
      }
    }

    // 7. Copy all other files, injecting repairs into OPF, CSS, and chapters
    const srcFileNames = Object.keys(srcZip.files);
    for (const fileName of srcFileNames) {
      if (fileName === 'mimetype') continue; // already added at index 0

      // If this is a chapter file we repaired
      if (repairedChapters.has(fileName)) {
        newZip.file(fileName, repairedChapters.get(fileName));
        continue;
      }

      // If this is the OPF file and font is injected
      if (fileName === opfPath) {
        let opfText = await srcZip.file(fileName).async('text');
        if (stats.fontInjected && !opfText.includes(fontFilename)) {
          // Inject font item into manifest
          const fontManifestItem = `    <item id="custom_font_repaired" href="fonts/${fontFilename}" media-type="${fontMime}"/>\n`;
          opfText = opfText.replace(/(<\/manifest>)/i, fontManifestItem + '$1');
        }
        newZip.file(fileName, opfText);
        continue;
      }

      // If this is a CSS stylesheet
      if (/\.css$/i.test(fileName)) {
        let cssText = await srcZip.file(fileName).async('text');
        if (stats.fontInjected) {
          const fontName = (customFont && customFont.name) || 'NovelCustomFont';
          const format = fontFilename.endsWith('.woff2') ? 'woff2' : (fontFilename.endsWith('.woff') ? 'woff' : (fontFilename.endsWith('.otf') ? 'opentype' : 'truetype'));
          const fontFaceDeclaration = `@font-face {\n  font-family: "${fontName}";\n  src: url("../fonts/${fontFilename}") format("${format}");\n  font-weight: normal;\n  font-style: normal;\n}\n\nbody, .chapter-content, p {\n  font-family: "${fontName}", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Serif", serif !important;\n}\n\n`;
          cssText = fontFaceDeclaration + cssText;
        }
        newZip.file(fileName, cssText);
        continue;
      }

      // Copy images, fonts, toc.ncx, nav.xhtml, container.xml as binary or text
      const entry = srcZip.file(fileName);
      if (entry && !entry.dir) {
        const fileData = await entry.async('uint8array');
        newZip.file(fileName, fileData);
      }
    }

    // Ensure META-INF/container.xml exists
    if (!newZip.file('META-INF/container.xml')) {
      const containerXml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n' +
        '  <rootfiles>\n' +
        '    <rootfile full-path="' + opfPath + '" media-type="application/oebps-package+xml"/>\n' +
        '  </rootfiles>\n' +
        '</container>';
      newZip.file('META-INF/container.xml', containerXml);
    }

    // Determine output format
    let outputType = opts.type;
    if (!outputType) {
      if (typeof window !== 'undefined' && typeof Blob !== 'undefined' && (typeof process === 'undefined' || !process.versions || !process.versions.node)) {
        outputType = 'blob';
      } else if (typeof Buffer !== 'undefined') {
        outputType = 'nodebuffer';
      } else if (typeof Blob !== 'undefined') {
        outputType = 'blob';
      } else {
        outputType = 'uint8array';
      }
    }

    const repairedBlob = await newZip.generateAsync({
      type: outputType,
      compression: 'DEFLATE',
      mimeType: 'application/epub+zip'
    });

    const safeTitle = (stats.title || 'novel').replace(/[\\/:*?"<>|]/g, '_');
    const filename = `${safeTitle}_DaSuaLoi.epub`;

    return {
      blob: repairedBlob,
      stats,
      filename
    };
  };

  return EpubRepairer;
});
