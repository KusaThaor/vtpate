// tests/harness/reference-oracle.js
// Authoritative ground-truth reference derived from ORIGINAL_REQUEST.md & PROJECT.md
const zlib = require('zlib');

class ReferenceOracle {
  // R2 / Feature 4: Jitter range calculation
  static computeJitterRange(baseDelayMs, jitterPct = 0.3) {
    const min = Math.max(0, Math.floor(baseDelayMs * (1 - jitterPct)));
    const max = Math.floor(baseDelayMs * (1 + jitterPct));
    return { min, max };
  }

  // R2 / Feature 5: Auto-Retry backoff calculation
  static computeBackoffDelay(attemptNumber, baseDelayMs = 1000) {
    // Exponential backoff: baseDelay * 2^(attempt - 1)
    const exponential = baseDelayMs * Math.pow(2, attemptNumber - 1);
    const { min, max } = ReferenceOracle.computeJitterRange(exponential, 0.3);
    return { exponential, min, max };
  }

  // R3 / Feature 11: Inkitt Story ID extraction
  static extractInkittStoryId(url) {
    if (!url || typeof url !== 'string') return null;
    // Patterns:
    // https://www.inkitt.com/stories/fantasy/123456
    // https://www.inkitt.com/stories/123456
    // inkitt://stories/123456
    const m = /(?:inkitt\.com\/stories(?:\/[a-zA-Z0-9_-]+)?\/|inkitt:\/\/stories\/)(\d+)/i.exec(url);
    return m ? m[1] : null;
  }

  // R4 / Feature 12: Wattpad URL resolution
  static parseWattpadUrl(url) {
    if (!url || typeof url !== 'string') return null;
    // Story URL: wattpad.com/story/123456-story-title
    const storyMatch = /wattpad\.com\/story\/(\d+)(?:-[\w-]+)?/i.exec(url);
    if (storyMatch) {
      return { type: 'story', storyId: storyMatch[1] };
    }
    // Part URL: wattpad.com/7891011-part-title
    const partMatch = /wattpad\.com\/(\d+)(?:-[\w-]+)?/i.exec(url);
    if (partMatch) {
      return { type: 'part', partId: partMatch[1] };
    }
    return null;
  }

  // R4 / Feature 14: HTML Sanitization & Wattpad <p data-p-id>
  static sanitizeHtml(html) {
    if (!html || typeof html !== 'string') return '';
    let clean = html;
    // Strip script and style
    clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    clean = clean.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    // Strip on* attributes
    clean = clean.replace(/\s+on[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '');
    // Strip data-p-id from <p> tags
    clean = clean.replace(/(<p\b[^>]*?)\s+data-p-id="[^"]*"/gi, '$1');
    // Ensure void tags are self-closing for XHTML
    clean = clean.replace(/<(br|hr|img)([^>]*?)(?<!\/)>/gi, '<$1$2/>');
    return clean;
  }

  // R5 / Feature 17: XML Entity Escaping
  static escapeXml(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // R5 / Feature 15: Relative to Absolute URL conversion
  static toAbsoluteUrl(relativeOrAbsolute, baseUrl) {
    try {
      return new URL(relativeOrAbsolute, baseUrl).href;
    } catch {
      return relativeOrAbsolute;
    }
  }

  // R5 / Feature 16: Build Standard Reference EPUB Buffer with STORE mimetype
  static createReferenceEpub({ title, author, description, chapters = [] }) {
    // Zero-dependency pure ZIP writer for reference verification
    const files = [];

    // 1. mimetype (first file, uncompressed STORE)
    files.push({
      name: 'mimetype',
      content: Buffer.from('application/epub+zip', 'ascii'),
      method: 0 // STORE
    });

    // 2. META-INF/container.xml
    const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
    files.push({
      name: 'META-INF/container.xml',
      content: Buffer.from(containerXml, 'utf-8'),
      method: 8 // DEFLATE
    });

    // 3. OEBPS/content.opf
    let manifestItems = `    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`;
    let spineItems = '';

    chapters.forEach((ch, idx) => {
      const chId = `chapter_${idx + 1}`;
      manifestItems += `\n    <item id="${chId}" href="chapters/${chId}.xhtml" media-type="application/xhtml+xml"/>`;
      spineItems += `\n    <itemref idref="${chId}"/>`;
    });

    const opfXml = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:uuid:vtpate-reference-${Date.now()}</dc:identifier>
    <dc:title>${ReferenceOracle.escapeXml(title)}</dc:title>
    <dc:creator>${ReferenceOracle.escapeXml(author || 'Unknown')}</dc:creator>
    <dc:language>vi</dc:language>
    <dc:description>${ReferenceOracle.escapeXml(description || '')}</dc:description>
  </metadata>
  <manifest>
${manifestItems}
  </manifest>
  <spine toc="ncx">
${spineItems}
  </spine>
</package>`;
    files.push({
      name: 'OEBPS/content.opf',
      content: Buffer.from(opfXml, 'utf-8'),
      method: 8
    });

    // 4. OEBPS/toc.ncx (EPUB 2)
    let navPoints = '';
    chapters.forEach((ch, idx) => {
      const chId = `chapter_${idx + 1}`;
      navPoints += `
    <navPoint id="np_${idx + 1}" playOrder="${idx + 1}">
      <navLabel><text>${ReferenceOracle.escapeXml(ch.title)}</text></navLabel>
      <content src="chapters/${chId}.xhtml"/>
    </navPoint>`;
    });

    const ncxXml = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:vtpate"/>
    <meta name="dtb:depth" content="1"/>
  </head>
  <docTitle><text>${ReferenceOracle.escapeXml(title)}</text></docTitle>
  <navMap>${navPoints}
  </navMap>
</ncx>`;
    files.push({
      name: 'OEBPS/toc.ncx',
      content: Buffer.from(ncxXml, 'utf-8'),
      method: 8
    });

    // 5. OEBPS/nav.xhtml (EPUB 3)
    let navList = '';
    chapters.forEach((ch, idx) => {
      const chId = `chapter_${idx + 1}`;
      navList += `\n      <li><a href="chapters/${chId}.xhtml">${ReferenceOracle.escapeXml(ch.title)}</a></li>`;
    });

    const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="vi">
<head><title>Table of Contents</title></head>
<body>
  <nav epub:type="toc">
    <h2>Mục Lục</h2>
    <ol>${navList}
    </ol>
  </nav>
</body>
</html>`;
    files.push({
      name: 'OEBPS/nav.xhtml',
      content: Buffer.from(navXhtml, 'utf-8'),
      method: 8
    });

    // 6. Chapters XHTML
    chapters.forEach((ch, idx) => {
      const chId = `chapter_${idx + 1}`;
      const chHtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="vi">
<head>
  <title>${ReferenceOracle.escapeXml(ch.title)}</title>
</head>
<body>
  <h2>${ReferenceOracle.escapeXml(ch.title)}</h2>
  <div class="content">
    ${ReferenceOracle.sanitizeHtml(ch.contentHtml || '')}
  </div>
</body>
</html>`;
      files.push({
        name: `OEBPS/chapters/${chId}.xhtml`,
        content: Buffer.from(chHtml, 'utf-8'),
        method: 8
      });
    });

    return ReferenceOracle._assembleZip(files);
  }

  // Pure ZIP packager without external dependencies
  static _assembleZip(files) {
    const localHeaders = [];
    const centralDirs = [];
    let offset = 0;

    for (const f of files) {
      const fileNameBuf = Buffer.from(f.name, 'utf-8');
      let dataBuf;
      let compSize;
      const uncompSize = f.content.length;

      if (f.method === 0) {
        dataBuf = f.content;
        compSize = uncompSize;
      } else {
        dataBuf = zlib.deflateRawSync(f.content);
        compSize = dataBuf.length;
      }

      const crc = ReferenceOracle._crc32(f.content);

      // Local File Header (30 bytes + name)
      const lh = Buffer.alloc(30 + fileNameBuf.length);
      lh.writeUInt32LE(0x04034b50, 0); // signature
      lh.writeUInt16LE(20, 4);        // version needed
      lh.writeUInt16LE(0, 6);         // flags
      lh.writeUInt16LE(f.method, 8);   // compression method
      lh.writeUInt16LE(0, 10);        // mod time
      lh.writeUInt16LE(0, 12);        // mod date
      lh.writeUInt32LE(crc, 14);      // crc32
      lh.writeUInt32LE(compSize, 18);  // compressed size
      lh.writeUInt32LE(uncompSize, 22);// uncompressed size
      lh.writeUInt16LE(fileNameBuf.length, 26); // name length
      lh.writeUInt16LE(0, 28);        // extra length
      fileNameBuf.copy(lh, 30);

      localHeaders.push(lh, dataBuf);

      // Central Directory Header (46 bytes + name)
      const cd = Buffer.alloc(46 + fileNameBuf.length);
      cd.writeUInt32LE(0x02014b50, 0); // signature
      cd.writeUInt16LE(20, 4);        // version made by
      cd.writeUInt16LE(20, 6);        // version needed
      cd.writeUInt16LE(0, 8);         // flags
      cd.writeUInt16LE(f.method, 10);  // compression method
      cd.writeUInt16LE(0, 12);        // mod time
      cd.writeUInt16LE(0, 14);        // mod date
      cd.writeUInt32LE(crc, 16);      // crc32
      cd.writeUInt32LE(compSize, 20);  // compressed size
      cd.writeUInt32LE(uncompSize, 24);// uncompressed size
      cd.writeUInt16LE(fileNameBuf.length, 28); // name length
      cd.writeUInt16LE(0, 30);        // extra length
      cd.writeUInt16LE(0, 32);        // comment length
      cd.writeUInt16LE(0, 34);        // disk start
      cd.writeUInt16LE(0, 36);        // internal attr
      cd.writeUInt32LE(0, 38);        // external attr
      cd.writeUInt32LE(offset, 42);   // local header offset
      fileNameBuf.copy(cd, 46);

      centralDirs.push(cd);
      offset += lh.length + dataBuf.length;
    }

    const cdStart = offset;
    const cdBuf = Buffer.concat(centralDirs);
    const cdSize = cdBuf.length;

    // End of Central Directory (22 bytes)
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); // signature
    eocd.writeUInt16LE(0, 4);          // disk number
    eocd.writeUInt16LE(0, 6);          // disk with cd
    eocd.writeUInt16LE(files.length, 8); // entries on disk
    eocd.writeUInt16LE(files.length, 10);// total entries
    eocd.writeUInt32LE(cdSize, 12);     // cd size
    eocd.writeUInt32LE(cdStart, 16);    // cd offset
    eocd.writeUInt16LE(0, 20);         // comment length

    return Buffer.concat([...localHeaders, cdBuf, eocd]);
  }

  // Precomputed CRC32 table
  static _crc32(buf) {
    if (!ReferenceOracle._crcTable) {
      const table = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
          c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[i] = c;
      }
      ReferenceOracle._crcTable = table;
    }

    let crc = 0xffffffff;
    const table = ReferenceOracle._crcTable;
    for (let i = 0; i < buf.length; i++) {
      crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
}

module.exports = {
  ReferenceOracle
};
