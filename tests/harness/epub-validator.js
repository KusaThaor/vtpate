// tests/harness/epub-validator.js
// IDPF OCF/OPS EPUB compliance validator for VTPATE E2E Testing
const zlib = require('zlib');

class ZipEntry {
  constructor(header) {
    this.name = header.name;
    this.compressionMethod = header.compressionMethod; // 0 = STORE, 8 = DEFLATE
    this.compressedSize = header.compressedSize;
    this.uncompressedSize = header.uncompressedSize;
    this.rawContent = header.rawContent;
  }

  getContent() {
    if (this.compressionMethod === 0) {
      return this.rawContent;
    }
    if (this.compressionMethod === 8) {
      return zlib.inflateRawSync(this.rawContent);
    }
    throw new Error(`Unsupported compression method ${this.compressionMethod}`);
  }

  getText(encoding = 'utf-8') {
    return this.getContent().toString(encoding);
  }
}

function parseZipEntries(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    if (buffer instanceof ArrayBuffer) {
      buffer = Buffer.from(buffer);
    } else if (buffer && buffer.buffer instanceof ArrayBuffer) {
      buffer = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    } else {
      throw new Error('Input must be a Buffer or ArrayBuffer');
    }
  }

  const entries = [];
  let offset = 0;

  while (offset + 30 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature === 0x04034b50) {
      // Local file header
      const compressionMethod = buffer.readUInt16LE(offset + 8);
      const compressedSize = buffer.readUInt32LE(offset + 18);
      const uncompressedSize = buffer.readUInt32LE(offset + 22);
      const fileNameLength = buffer.readUInt16LE(offset + 26);
      const extraFieldLength = buffer.readUInt16LE(offset + 28);

      const fileNameStart = offset + 30;
      const fileName = buffer.toString('utf-8', fileNameStart, fileNameStart + fileNameLength);
      const dataStart = fileNameStart + fileNameLength + extraFieldLength;
      const rawContent = buffer.slice(dataStart, dataStart + compressedSize);

      entries.push(
        new ZipEntry({
          name: fileName,
          compressionMethod,
          compressedSize,
          uncompressedSize,
          rawContent
        })
      );

      offset = dataStart + compressedSize;
    } else {
      // Reached central directory or end
      break;
    }
  }

  return entries;
}

function validateXml(xmlString, filename = 'document.xml') {
  const errors = [];

  // Check unescaped ampersands (e.g. & not followed by amp;, lt;, gt;, quot;, apos;, or #x...;)
  const badAmpRegex = /&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g;
  let match;
  while ((match = badAmpRegex.exec(xmlString)) !== null) {
    errors.push(`${filename}: Unescaped '&' found at index ${match.index}`);
  }

  // Check unclosed tags (simplified check for well-formedness)
  const tagRegex = /<\/?([a-zA-Z0-9:-]+)([^>]*)>/g;
  const stack = [];
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

  let tagMatch;
  while ((tagMatch = tagRegex.exec(xmlString)) !== null) {
    const fullTag = tagMatch[0];
    const tagName = tagMatch[1].toLowerCase();
    const attrs = tagMatch[2];

    if (fullTag.startsWith('<?') || fullTag.startsWith('<!')) {
      continue; // Processing instructions & doctype
    }

    const isClosing = fullTag.startsWith('</');
    const isSelfClosing = attrs.trim().endsWith('/') || fullTag.endsWith('/>');

    if (isSelfClosing) {
      // Self-closing tag, e.g. <br/>, valid in XHTML
      continue;
    }

    if (isClosing) {
      if (stack.length === 0) {
        errors.push(`${filename}: Unexpected closing tag </${tagName}> without matching open tag`);
      } else {
        const top = stack.pop();
        if (top !== tagName) {
          errors.push(`${filename}: Mismatched closing tag </${tagName}>, expected </${top}>`);
        }
      }
    } else {
      if (voidTags.has(tagName) && !isSelfClosing) {
        // In strict XHTML, void elements MUST be self-closing (e.g. <br/>, <hr/>, <img/>)
        errors.push(`${filename}: Void HTML element <${tagName}> must be self-closing in XHTML (e.g. <${tagName}/>)`);
      } else if (!voidTags.has(tagName)) {
        stack.push(tagName);
      }
    }
  }

  if (stack.length > 0) {
    errors.push(`${filename}: Unclosed tags remaining: ${stack.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

class EpubValidator {
  constructor(epubBuffer) {
    this.buffer = epubBuffer;
    this.entries = parseZipEntries(epubBuffer);
    this.entryMap = new Map();
    for (const e of this.entries) {
      this.entryMap.set(e.name, e);
    }
  }

  validateOcfMimetype() {
    const issues = [];
    if (this.entries.length === 0) {
      issues.push('Zip archive is empty');
      return { passed: false, issues };
    }

    const firstEntry = this.entries[0];
    if (firstEntry.name !== 'mimetype') {
      issues.push(`First entry must be 'mimetype', found: '${firstEntry.name}'`);
    }

    if (firstEntry.compressionMethod !== 0) {
      issues.push(`'mimetype' compression method must be STORE (0), found: ${firstEntry.compressionMethod}`);
    }

    const text = firstEntry.getText('ascii');
    if (text !== 'application/epub+zip') {
      issues.push(`'mimetype' content must be exactly 'application/epub+zip' (20 bytes), found: '${text}' (${text.length} bytes)`);
    }

    return {
      passed: issues.length === 0,
      issues
    };
  }

  validateContainer() {
    const issues = [];
    const containerEntry = this.entryMap.get('META-INF/container.xml');
    if (!containerEntry) {
      issues.push("Missing 'META-INF/container.xml'");
      return { passed: false, issues, rootfilePath: null };
    }

    const xml = containerEntry.getText('utf-8');
    const xmlVal = validateXml(xml, 'container.xml');
    if (!xmlVal.isValid) {
      issues.push(...xmlVal.errors);
    }

    const rootfileMatch = /full-path\s*=\s*["']([^"']+)["']/.exec(xml);
    if (!rootfileMatch) {
      issues.push("container.xml missing <rootfile full-path='...'>");
      return { passed: false, issues, rootfilePath: null };
    }

    const rootfilePath = rootfileMatch[1];
    if (!this.entryMap.has(rootfilePath)) {
      issues.push(`Rootfile specified in container.xml '${rootfilePath}' does not exist in archive`);
    }

    return {
      passed: issues.length === 0,
      issues,
      rootfilePath
    };
  }

  validateOpf(opfPath) {
    const issues = [];
    const opfEntry = this.entryMap.get(opfPath);
    if (!opfEntry) {
      issues.push(`Missing OPF file at '${opfPath}'`);
      return { passed: false, issues };
    }

    const xml = opfEntry.getText('utf-8');
    const xmlVal = validateXml(xml, opfPath);
    if (!xmlVal.isValid) {
      issues.push(...xmlVal.errors);
    }

    // Check metadata
    if (!/<dc:title[^>]*>/i.test(xml)) issues.push('OPF missing dc:title');
    if (!/<dc:creator[^>]*>/i.test(xml) && !/<dc:author[^>]*>/i.test(xml)) issues.push('OPF missing dc:creator');
    if (!/<dc:language[^>]*>/i.test(xml)) issues.push('OPF missing dc:language');

    // Check manifest & spine
    if (!/<manifest[^>]*>/i.test(xml)) issues.push('OPF missing <manifest>');
    if (!/<spine[^>]*>/i.test(xml)) issues.push('OPF missing <spine>');

    return {
      passed: issues.length === 0,
      issues,
      xml
    };
  }

  validateChapters() {
    const issues = [];
    let chapterCount = 0;

    for (const [name, entry] of this.entryMap.entries()) {
      if ((name.endsWith('.xhtml') || name.endsWith('.html')) && !name.endsWith('nav.xhtml')) {
        chapterCount++;
        const content = entry.getText('utf-8');
        const val = validateXml(content, name);
        if (!val.isValid) {
          issues.push(...val.errors);
        }
      }
    }

    return {
      passed: issues.length === 0,
      chapterCount,
      issues
    };
  }

  validateNavigation() {
    const hasNcx = Array.from(this.entryMap.keys()).some((k) => k.endsWith('toc.ncx') || k.endsWith('.ncx'));
    const hasNav = Array.from(this.entryMap.keys()).some((k) => k.endsWith('nav.xhtml') || k.includes('nav'));
    const issues = [];
    if (!hasNcx) issues.push('Missing EPUB 2 navigation (toc.ncx)');
    if (!hasNav) issues.push('Missing EPUB 3 navigation (nav.xhtml)');

    return {
      passed: issues.length === 0,
      hasNcx,
      hasNav,
      issues
    };
  }

  validateAll() {
    const ocf = this.validateOcfMimetype();
    const container = this.validateContainer();
    const opf = container.rootfilePath ? this.validateOpf(container.rootfilePath) : { passed: false, issues: ['No OPF'] };
    const chapters = this.validateChapters();
    const nav = this.validateNavigation();

    const allIssues = [
      ...ocf.issues,
      ...container.issues,
      ...opf.issues,
      ...chapters.issues,
      ...nav.issues
    ];

    return {
      isValidEpub: allIssues.length === 0,
      ocf,
      container,
      opf,
      chapters,
      nav,
      issues: allIssues
    };
  }
}

module.exports = {
  EpubValidator,
  parseZipEntries,
  validateXml
};
