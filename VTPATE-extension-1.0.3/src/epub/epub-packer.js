// src/epub/epub-packer.js
// Complete IDPF OCF/OPS EPUB 2/3 Packaging Engine for VTPATE Studio

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    var cls = factory();
    module.exports = cls;
    module.exports.EpubPacker = cls;
  } else {
    var cls = factory();
    root.EpubPacker = cls;
  }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  /**
   * Safe host-environment require resolver for Node / VM sandbox environments
   */
  function getHostRequire() {
    if (typeof require === 'function') {
      return require;
    }
    return null;
  }

  /**
   * Resolves the authentic offline JSZip library instance
   * @param {Object} [options={}]
   * @returns {Object} JSZip constructor
   */
  function resolveJSZip(options) {
    if (options && options.JSZip) return options.JSZip;
    if (typeof JSZip !== 'undefined') return JSZip;
    if (typeof window !== 'undefined' && window.JSZip) return window.JSZip;
    if (typeof globalThis !== 'undefined' && globalThis.JSZip) return globalThis.JSZip;
    if (typeof global !== 'undefined' && global.JSZip) return global.JSZip;
    if (typeof self !== 'undefined' && self.JSZip) return self.JSZip;

    var hostReq = getHostRequire();
    if (hostReq) {
      try {
        var hostPath = hostReq('path');
        var baseDir = (typeof __dirname !== 'undefined') ? __dirname : (typeof process !== 'undefined' && process.cwd ? hostPath.resolve(process.cwd(), 'src/epub') : '');
        var fullPath = hostPath.resolve(baseDir, '../../libs/jszip.min.js');
        var loaded = hostReq(fullPath);
        if (loaded) return loaded.JSZip || loaded;
      } catch (e1) {
        try {
          var loaded2 = hostReq('../../libs/jszip.min.js');
          if (loaded2) return loaded2.JSZip || loaded2;
        } catch (e2) {
          try {
            var loaded3 = hostReq('jszip');
            if (loaded3) return loaded3.JSZip || loaded3;
          } catch (e3) {}
        }
      }
    }

    throw new Error('JSZip library could not be resolved offline. Ensure libs/jszip.min.js is present or pass JSZip via options.');
  }

  /**
   * Resolves EpubTemplates module
   * @param {Object} [options={}]
   * @returns {Object} Templates helper object
   */
  function resolveTemplates(options) {
    if (options && options.templates) return options.templates;
    if (typeof EpubTemplates !== 'undefined') return EpubTemplates;
    if (typeof window !== 'undefined' && window.EpubTemplates) return window.EpubTemplates;
    if (typeof globalThis !== 'undefined' && globalThis.EpubTemplates) return globalThis.EpubTemplates;
    if (typeof global !== 'undefined' && global.EpubTemplates) return global.EpubTemplates;

    var hostReq = getHostRequire();
    if (hostReq) {
      try {
        var hostPath = hostReq('path');
        var baseDir = (typeof __dirname !== 'undefined') ? __dirname : (typeof process !== 'undefined' && process.cwd ? hostPath.resolve(process.cwd(), 'src/epub') : '');
        var fullPath = hostPath.resolve(baseDir, 'epub-templates.js');
        var loaded = hostReq(fullPath);
        if (loaded) return loaded.EpubTemplates || loaded;
      } catch (e1) {
        try {
          var loaded2 = hostReq('./epub-templates.js');
          if (loaded2) return loaded2.EpubTemplates || loaded2;
        } catch (e2) {}
      }
    }

    // Fallback embedded minimal templates
    return {
      escapeXml: function (s) {
        if (!s) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
      },
      sanitizeAndFormatHtml: function (h) {
        if (!h) return '';
        var c = h.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/\s+on[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '')
          .replace(/(<p\b[^>]*?)\s+data-p-id="[^"]*"/gi, '$1')
          .replace(/<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)(\s+[^>]*?)?(\/?)>/gi, function (m, t, a, s) {
            return s === '/' ? m : '<' + t + (a ? a.trimEnd() : '') + '/>';
          })
          .replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
        var parts = c.split(/(<\/?(?:[a-zA-Z][a-zA-Z0-9:-]*)(?:\s+[^>]*)?\/?>)/g);
        for (var i = 0; i < parts.length; i++) {
          if (i % 2 === 0 && parts[i]) {
            parts[i] = parts[i].replace(/</g, '&lt;').replace(/>/g, '&gt;');
          }
        }
        return parts.join('');
      },
      createContainerXml: function () {
        return '<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n  <rootfiles>\n    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>\n  </rootfiles>\n</container>';
      },
      createContentOpf: function (meta, chapters, images) {
        var t = this.escapeXml(meta.title || 'Untitled');
        var a = this.escapeXml(meta.author || 'Unknown');
        var l = this.escapeXml(meta.language || 'vi');
        var d = meta.description ? ('    <dc:description>' + this.escapeXml(meta.description) + '</dc:description>\n') : '';
        var id = this.escapeXml(meta.identifier || ('urn:uuid:' + (meta.id || Date.now())));
        var man = ['    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
          '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
          '    <item id="stylesheet" href="css/style.css" media-type="text/css"/>'];
        var sp = [];
        chapters.forEach(function (ch, idx) {
          var n = ch.chapterNumber !== undefined ? ch.chapterNumber : (idx + 1);
          man.push('    <item id="chapter_' + n + '" href="chapters/ch_' + n + '.xhtml" media-type="application/xhtml+xml"/>');
          sp.push('    <itemref idref="chapter_' + n + '"/>');
        });
        return '<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">\n  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n    <dc:identifier id="pub-id">' + id + '</dc:identifier>\n    <dc:title>' + t + '</dc:title>\n    <dc:creator id="creator">' + a + '</dc:creator>\n    <dc:language>' + l + '</dc:language>\n' + d + '  </metadata>\n  <manifest>\n' + man.join('\n') + '\n  </manifest>\n  <spine toc="ncx">\n' + sp.join('\n') + '\n  </spine>\n</package>';
      },
      createTocNcx: function (meta, chapters) {
        var self = this;
        var t = self.escapeXml(meta.title || 'Untitled');
        var np = chapters.map(function (ch, idx) {
          var n = ch.chapterNumber !== undefined ? ch.chapterNumber : (idx + 1);
          var ct = self.escapeXml(ch.title || ('Chương ' + n));
          return '    <navPoint id="np_' + (idx + 1) + '" playOrder="' + (idx + 1) + '"><navLabel><text>' + ct + '</text></navLabel><content src="chapters/ch_' + n + '.xhtml"/></navPoint>';
        }).join('\n');
        return '<?xml version="1.0" encoding="UTF-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n  <head><meta name="dtb:uid" content="urn:uuid:vtpate"/></head>\n  <docTitle><text>' + t + '</text></docTitle>\n  <navMap>\n' + np + '\n  </navMap>\n</ncx>';
      },
      createNavXhtml: function (meta, chapters) {
        var self = this;
        var items = chapters.map(function (ch, idx) {
          var n = ch.chapterNumber !== undefined ? ch.chapterNumber : (idx + 1);
          var ct = self.escapeXml(ch.title || ('Chương ' + n));
          return '      <li><a href="chapters/ch_' + n + '.xhtml">' + ct + '</a></li>';
        }).join('\n');
        return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="vi">\n<head><title>Mục Lục</title></head>\n<body><nav epub:type="toc"><h2>Mục Lục</h2><ol>\n' + items + '\n</ol></nav></body></html>';
      },
      createChapterXhtml: function (ch, meta) {
        var n = ch.chapterNumber !== undefined ? ch.chapterNumber : 1;
        var t = this.escapeXml(ch.title || ('Chương ' + n));
        var cleanBody = this.sanitizeAndFormatHtml(ch.contentHtml || '');
        return '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="vi">\n<head><title>' + t + '</title><link rel="stylesheet" type="text/css" href="../css/style.css"/></head>\n<body><div class="chapter-container"><h1>' + t + '</h1><div class="chapter-content">' + cleanBody + '</div></div></body></html>';
      },
      createIntroXhtml: function (meta) {
        var t = this.escapeXml(meta.title || 'Giới Thiệu Tác Phẩm');
        var a = this.escapeXml(meta.author || 'Chưa rõ');
        var d = this.sanitizeAndFormatHtml(meta.description || '');
        return '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="vi">\n<head><title>' + t + '</title><link rel="stylesheet" type="text/css" href="../css/style.css"/></head>\n<body><div class="chapter-container"><h1>' + t + '</h1><p><strong>Tác giả:</strong> ' + a + '</p><div class="chapter-content">' + d + '</div></div></body></html>';
      }
    };
  }

  /**
   * Resolves EpubCss stylesheet
   * @param {Object} [options={}]
   * @returns {string} CSS content
   */
  function resolveCss(options) {
    if (options && options.css) return options.css;
    if (typeof EpubCss !== 'undefined') {
      return typeof EpubCss.getEpubCss === 'function' ? EpubCss.getEpubCss(options) : (EpubCss.EPUB_CSS || EpubCss);
    }
    if (typeof window !== 'undefined' && window.EpubCss) {
      return typeof window.EpubCss.getEpubCss === 'function' ? window.EpubCss.getEpubCss(options) : (window.EpubCss.EPUB_CSS || window.EpubCss);
    }

    var hostReq = getHostRequire();
    if (hostReq) {
      try {
        var hostPath = hostReq('path');
        var baseDir = (typeof __dirname !== 'undefined') ? __dirname : (typeof process !== 'undefined' && process.cwd ? hostPath.resolve(process.cwd(), 'src/epub') : '');
        var fullPath = hostPath.resolve(baseDir, 'epub-css.js');
        var mod = hostReq(fullPath);
        return typeof mod.getEpubCss === 'function' ? mod.getEpubCss(options) : (mod.EPUB_CSS || mod);
      } catch (e1) {
        try {
          var mod2 = hostReq('./epub-css.js');
          return typeof mod2.getEpubCss === 'function' ? mod2.getEpubCss(options) : (mod2.EPUB_CSS || mod2);
        } catch (e2) {}
      }
    }

    return 'body { font-family: -apple-system, sans-serif; line-height: 1.7; padding: 5%; text-align: justify; } p { margin: 0 0 0.8em; text-indent: 1.8em; } img { max-width: 100%; height: auto; display: block; margin: 1em auto; }';
  }

  /**
   * EpubPacker class
   */
  function EpubPacker(options) {
    this.options = options || {};
  }

  /**
   * Static EPUB generator conforming to PROJECT.md interface contract
   */
  EpubPacker.createEpub = async function (metadata, chapters, options) {
    return new EpubPacker(options).createEpub(metadata, chapters, options);
  };

  function sortChapters(list) {
    if (!Array.isArray(list)) return [];
    var collator = typeof Intl !== 'undefined' && Intl.Collator
      ? new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
      : null;

    function getNum(ch) {
      if (!ch) return null;
      if (typeof ch.chapterNumber === 'number' && !isNaN(ch.chapterNumber)) {
        return ch.chapterNumber;
      }
      var s = String(ch.chapterNumber || ch.id || ch.title || '');
      var m = s.match(/(?:chuong|chapter|chap|c|phần|part)?\s*(\d+(?:\.\d+)?)/i);
      return m ? parseFloat(m[1]) : null;
    }

    return list.slice().sort(function (a, b) {
      var numA = getNum(a);
      var numB = getNum(b);
      if (numA !== null && numB !== null && numA !== numB) {
        return numA - numB;
      }
      if (collator) {
        var titleA = String(a?.title || a?.chapterNumber || a?.id || '');
        var titleB = String(b?.title || b?.chapterNumber || b?.id || '');
        return collator.compare(titleA, titleB);
      }
      return 0;
    });
  }

  /**
   * Packages novel metadata, chapters, and assets into standard IDPF OCF/OPS EPUB
   * @param {Object} metadata
   * @param {Array<Object>} chapters
   * @param {Object} [options={}]
   * @returns {Promise<Blob|Buffer|Uint8Array>}
   */
  EpubPacker.prototype.createEpub = async function (metadata, chapters, options) {
    var opts = Object.assign({}, this.options, options || {});
    var meta = metadata || {};
    var chList = sortChapters(chapters || []);

    var JSZipClass = resolveJSZip(opts);
    var templates = resolveTemplates(opts);
    var cssText = resolveCss(opts);

    var zip = new JSZipClass();

    // =========================================================================
    // CRITICAL IDPF OCF SPECIFICATION:
    // File 'mimetype' MUST strictly be the FIRST entry at index 0, stored
    // uncompressed ({ compression: 'STORE' }, method 0, content strictly 'application/epub+zip').
    // =========================================================================
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

    // 1. META-INF/container.xml
    var containerXml = templates.createContainerXml('OEBPS/content.opf');
    zip.file('META-INF/container.xml', containerXml);

    // 2. Gather assets & images
    var allImages = [];

    // Remote images scan and download fallback if includeInlineImages is enabled
    if (opts.includeInlineImages) {
      for (var imgScanIdx = 0; imgScanIdx < chList.length; imgScanIdx++) {
        var scanCh = chList[imgScanIdx];
        if (!scanCh || !scanCh.contentHtml) continue;
        if (!scanCh.images || scanCh.images.length === 0) {
          var remoteImgRegex = /<img\b([^>]*?)\bsrc=["'](https?:\/\/[^"']+)["']([^>]*?)\/?>/gi;
          var rMatch;
          var discoveredRemote = [];
          while ((rMatch = remoteImgRegex.exec(scanCh.contentHtml)) !== null) {
            discoveredRemote.push({
              fullTag: rMatch[0],
              prefix: rMatch[1] || '',
              src: rMatch[2],
              suffix: rMatch[3] || ''
            });
          }
          if (discoveredRemote.length > 0) {
            scanCh.images = [];
            var chIndexNum = scanCh.chapterNumber !== undefined ? scanCh.chapterNumber : (imgScanIdx + 1);
            for (var d = 0; d < discoveredRemote.length; d++) {
              var dItem = discoveredRemote[d];
              var dFilename = 'ch' + chIndexNum + '_img_' + (d + 1) + '.jpg';
              var dMime = dItem.src.endsWith('.png') ? 'image/png' : 'image/jpeg';
              var dData = null;
              try {
                if (typeof fetch === 'function') {
                  var dRes = await fetch(dItem.src);
                  if (dRes.ok) {
                    var dCt = dRes.headers && dRes.headers.get ? dRes.headers.get('content-type') : null;
                    if (dCt) dMime = dCt.split(';')[0].trim();
                    if (typeof dRes.arrayBuffer === 'function') {
                      var dAb = await dRes.arrayBuffer();
                      dData = typeof Buffer !== 'undefined' ? Buffer.from(dAb) : dAb;
                    }
                  }
                }
              } catch (eScan) {}
              scanCh.images.push({
                id: 'img_ch' + chIndexNum + '_' + (d + 1),
                url: dItem.src,
                filename: dFilename,
                mimeType: dMime,
                dataBlob: dData
              });
              var cleanSuff = (dItem.suffix || '').replace(/\/+$/, '').trim();
              scanCh.contentHtml = scanCh.contentHtml.replace(dItem.fullTag, '<img' + dItem.prefix + 'src="../images/' + dFilename + '"' + (cleanSuff ? ' ' + cleanSuff : '') + '/>');
            }
          }
        }
      }
    }

    // Cover image embedding
    var coverData = meta.coverBlob || meta.coverBuffer || meta.coverData;
    if (coverData) {
      var coverFilename = meta.coverFilename || 'cover.jpg';
      meta.coverFilename = coverFilename;
      zip.file('OEBPS/images/' + coverFilename, coverData);
    }

    // Custom Font / Obfuscated Font embedding
    var customFont = opts.customFont || meta.customFont;
    if (customFont && (customFont.enabled !== false) && customFont.filename) {
      var fontFilename = customFont.filename;
      var fontData = customFont.data || customFont.dataBlob || customFont.dataBuffer;
      if (!fontData && customFont.dataBase64) {
        var base64Clean = customFont.dataBase64.replace(/^data:[^;]+;base64,/, '');
        if (typeof Buffer !== 'undefined') {
          fontData = Buffer.from(base64Clean, 'base64');
        } else if (typeof atob !== 'undefined') {
          var binaryStr = atob(base64Clean);
          var len = binaryStr.length;
          var bytes = new Uint8Array(len);
          for (var b = 0; b < len; b++) {
            bytes[b] = binaryStr.charCodeAt(b);
          }
          fontData = bytes;
        }
      }
      if (fontData) {
        zip.file('OEBPS/fonts/' + fontFilename, fontData);
      }
    }

    // Inline images from chapter items
    for (var i = 0; i < chList.length; i++) {
      var ch = chList[i];
      if (ch.images && Array.isArray(ch.images)) {
        for (var k = 0; k < ch.images.length; k++) {
          var img = ch.images[k];
          var imgData = img.dataBlob || img.dataBuffer || img.data;
          var imgFilename = img.filename || ('img_' + (allImages.length + 1) + '.jpg');
          img.filename = imgFilename;
          allImages.push(img);
          if (imgData) {
            zip.file('OEBPS/images/' + imgFilename, imgData);
          }
        }
      }
    }

    // 3. OEBPS/content.opf
    var opfXml = templates.createContentOpf(meta, chList, allImages, opts);
    zip.file('OEBPS/content.opf', opfXml);

    // 4. OEBPS/toc.ncx (EPUB 2)
    var ncxXml = templates.createTocNcx(meta, chList, opts);
    zip.file('OEBPS/toc.ncx', ncxXml);

    // 5. OEBPS/nav.xhtml (EPUB 3)
    var navXml = templates.createNavXhtml(meta, chList, opts);
    zip.file('OEBPS/nav.xhtml', navXml);

    // 6. OEBPS/css/style.css
    zip.file('OEBPS/css/style.css', cssText);

    // 7. OEBPS/chapters/intro.xhtml (Optional dedicated Book Intro chapter)
    if (opts.includeIntroChapter && typeof templates.createIntroXhtml === 'function') {
      var introXhtml = templates.createIntroXhtml(meta, opts);
      zip.file('OEBPS/chapters/intro.xhtml', introXhtml);
    }

    // 8. OEBPS/chapters/ch_{number}.xhtml
    for (var j = 0; j < chList.length; j++) {
      var chapter = chList[j];
      var chNum = chapter.chapterNumber !== undefined ? chapter.chapterNumber : (j + 1);
      var chXhtml = templates.createChapterXhtml(chapter, meta, opts);
      zip.file('OEBPS/chapters/ch_' + chNum + '.xhtml', chXhtml);
    }

    // Determine output format
    var outputType = opts.type;
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

    return await zip.generateAsync({
      type: outputType,
      compression: 'DEFLATE',
      mimeType: 'application/epub+zip'
    });
  };

  /**
   * Static convenience factory method for one-shot EPUB creation
   * @param {Object} meta Metadata
   * @param {Array} ch Chapters
   * @param {Object} [opts] Options
   * @returns {Promise<Blob|Buffer|Uint8Array>}
   */
  EpubPacker.createEpub = async function (meta, ch, opts) {
    return new EpubPacker(opts).createEpub(meta, ch, opts);
  };

  /**
   * Generates multiple split EPUB volumes for long web novels
   * @param {Object} metadata
   * @param {Array<Object>} chapters
   * @param {Object} [options={}]
   * @returns {Promise<Array<Object>>}
   */
  EpubPacker.createSplitEpub = async function (metadata, chapters, options) {
    var opts = options || {};
    var splitSize = parseInt(opts.splitSize, 10) || 0;
    var chList = sortChapters(chapters || []);
    var meta = metadata || {};
    var baseTitle = meta.title || 'Truyện';

    if (splitSize <= 0 || chList.length <= splitSize) {
      var singleBlob = await EpubPacker.createEpub(meta, chList, opts);
      var filename = opts.filename || (baseTitle.replace(/[\\/:*?"<>|]/g, '_') + '.epub');
      return [{
        volume: 1,
        totalVolumes: 1,
        fromChapter: chList.length > 0 ? (chList[0].chapterNumber !== undefined ? chList[0].chapterNumber : 1) : 0,
        toChapter: chList.length > 0 ? (chList[chList.length - 1].chapterNumber !== undefined ? chList[chList.length - 1].chapterNumber : chList.length) : 0,
        chapterCount: chList.length,
        title: baseTitle,
        filename: filename,
        blob: singleBlob
      }];
    }

    var totalVolumes = Math.ceil(chList.length / splitSize);
    var volumes = [];

    for (var v = 0; v < totalVolumes; v++) {
      var chunk = chList.slice(v * splitSize, (v + 1) * splitSize);
      if (chunk.length === 0) continue;

      var volNum = v + 1;
      var fromCh = chunk[0].chapterNumber !== undefined ? chunk[0].chapterNumber : (v * splitSize + 1);
      var toCh = chunk[chunk.length - 1].chapterNumber !== undefined ? chunk[chunk.length - 1].chapterNumber : (fromCh + chunk.length - 1);
      var volTitle = baseTitle + ' - Quyển ' + volNum + ' (Chương ' + fromCh + '-' + toCh + ')';

      var volMeta = Object.assign({}, meta, {
        title: volTitle,
        description: (meta.description ? (meta.description + '\n\n') : '') + '[Quyển ' + volNum + ' / ' + totalVolumes + ': Chương ' + fromCh + ' - ' + toCh + ']',
        totalChapters: chunk.length
      });

      var volOpts = Object.assign({}, opts, {
        splitSize: 0
      });

      var volBlob = await EpubPacker.createEpub(volMeta, chunk, volOpts);
      var volFilename = baseTitle.replace(/[\\/:*?"<>|]/g, '_') + ' - Quyen ' + volNum + ' (Ch ' + fromCh + '-' + toCh + ').epub';

      volumes.push({
        volume: volNum,
        totalVolumes: totalVolumes,
        fromChapter: fromCh,
        toChapter: toCh,
        chapterCount: chunk.length,
        title: volTitle,
        filename: volFilename,
        blob: volBlob
      });
    }

    return volumes;
  };

  EpubPacker.prototype.createSplitEpub = async function (metadata, chapters, options) {
    return EpubPacker.createSplitEpub(metadata, chapters, Object.assign({}, this.options, options || {}));
  };

  /**
   * Alias method for instance-based packing
   */
  EpubPacker.prototype.build = async function () {
    return this.createEpub(this.options.metadata, this.options.chapters, this.options);
  };

  return EpubPacker;
});
