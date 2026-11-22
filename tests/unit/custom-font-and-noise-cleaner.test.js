// tests/unit/custom-font-and-noise-cleaner.test.js
// Verification for:
// 1. Invisible text & camouflage noise removal (white font, font-size 0-1px, opacity:0, display:none)
// 2. User-configurable custom selector removals
// 3. Empty / blank chapter fallback to <p>pass</p>
// 4. Custom font embedding into EPUB (OEBPS/fonts, content.opf, style.css @font-face)
const { assert } = require('../harness/test-assert');
const { ModuleLoader } = require('../harness/loader');
const { EpubValidator } = require('../harness/epub-validator');
const EpubRepairer = require('../../src/epub/epub-repairer');

async function runUnitTests() {
  console.log('\n--- Running Unit Tests: Custom Font & Noise Cleaner ---');

  // Test 1: Invisible text cleaning in BaseParser
  {
    const mod = ModuleLoader.loadScriptInContext('src/parsers/base-parser.js');
    assert.ok(mod.loaded, 'base-parser.js must load');
    const BaseParser = mod.exports.BaseParser || mod.sandbox.BaseParser;

    const rawDirtyHtml = `
      <p>Đoạn văn thật sự của câu chuyện.</p>
      <span style="font-size: 0px">Từ rác chống cào 1</span>
      <span style="font-size:1px">Từ rác chống cào 2</span>
      <span style="color: #ffffff">Chữ trắng ẩn trên nền trắng</span>
      <span style="color: white">Chữ trắng ẩn 2</span>
      <font color="white">Thẻ font chữ trắng</font>
      <font color="#ffffff">Thẻ font chữ trắng 2</font>
      <div style="display: none">Nội dung ẩn display none</div>
      <p style="visibility: hidden">Nội dung ẩn visibility hidden</p>
      <span style="opacity: 0">Nội dung ẩn opacity 0</span>
      <p class="watermark">Watermark trang web</p>
      <p>Đoạn văn thật sự thứ hai.</p>
    `;

    const cleaned = BaseParser.cleanInvisibleAndCamouflageText(rawDirtyHtml, ['.watermark']);
    assert.ok(!cleaned.includes('Từ rác chống cào 1'), 'Must remove font-size: 0px');
    assert.ok(!cleaned.includes('Từ rác chống cào 2'), 'Must remove font-size: 1px');
    assert.ok(!cleaned.includes('Chữ trắng ẩn trên nền trắng'), 'Must remove color: #ffffff');
    assert.ok(!cleaned.includes('Chữ trắng ẩn 2'), 'Must remove color: white');
    assert.ok(!cleaned.includes('Thẻ font chữ trắng'), 'Must remove font[color="white"]');
    assert.ok(!cleaned.includes('display none'), 'Must remove display: none');
    assert.ok(!cleaned.includes('visibility hidden'), 'Must remove visibility: hidden');
    assert.ok(!cleaned.includes('opacity 0'), 'Must remove opacity: 0');
    assert.ok(!cleaned.includes('Watermark trang web'), 'Must remove custom selector .watermark');
    assert.ok(cleaned.includes('Đoạn văn thật sự của câu chuyện'), 'Must preserve legitimate text');
    assert.ok(cleaned.includes('Đoạn văn thật sự thứ hai'), 'Must preserve legitimate text');
    console.log('  √ Test 1 Passed: Invisible text and camouflage noise removal');
  }

  // Test 2: Control characters & malformed XML cleaning
  {
    const mod = ModuleLoader.loadScriptInContext('src/parsers/base-parser.js');
    const BaseParser = mod.exports.BaseParser || mod.sandbox.BaseParser;

    const dirtyXml = '<p>Dòng chữ có ký tự điều khiển bất hợp pháp: \x00\x08\x0B\x1F và thẻ br chưa đóng <br> tiếp theo <hr></p>';
    const sanitized = BaseParser.sanitizeHtml(dirtyXml);

    assert.ok(!sanitized.includes('\x00'), 'Must remove null byte \\x00');
    assert.ok(!sanitized.includes('\x08'), 'Must remove backspace byte \\x08');
    assert.ok(sanitized.includes('<br/>'), 'Must convert <br> to <br/>');
    assert.ok(sanitized.includes('<hr/>'), 'Must convert <hr> to <hr/>');
    console.log('  √ Test 2 Passed: XML control characters & void tag self-closing');
  }

  // Test 3: Empty / Blank chapter fallback to <p>pass</p>
  {
    const mod = ModuleLoader.loadScriptInContext('src/parsers/base-parser.js');
    const BaseParser = mod.exports.BaseParser || mod.sandbox.BaseParser;

    // Empty string
    const r1 = BaseParser.sanitizeHtml('', { fallbackEmpty: true, emptyPlaceholder: '<p>pass</p>' });
    assert.strictEqual(r1, '<p>pass</p>', 'Empty string should return <p>pass</p>');

    // Whitespace and empty tags only
    const r2 = BaseParser.sanitizeHtml('   <div><span>   </span></div>\n\t  ', { fallbackEmpty: true });
    assert.strictEqual(r2, '<p>pass</p>', 'Whitespace only should return <p>pass</p>');

    // Only invisible text that gets cleaned
    const r3 = BaseParser.sanitizeHtml('<span style="color: white">only noise</span>', { fallbackEmpty: true });
    assert.strictEqual(r3, '<p>pass</p>', 'Cleaned-to-empty should fallback to <p>pass</p>');

    console.log('  √ Test 3 Passed: Empty / Blank chapter fallback to <p>pass</p>');
  }

  // Test 4: Custom Font embedding into EPUB
  {
    const modPacker = ModuleLoader.loadScriptInContext('src/epub/epub-packer.js');
    const EpubPacker = modPacker.exports.EpubPacker || modPacker.sandbox.EpubPacker;
    const packer = new EpubPacker();

    // Fake font binary data (e.g. simulated TTF bytes)
    const fakeFontBytes = Buffer.from('TEST_FONT_DATA_12345_WOFF2');

    const metadata = {
      title: 'Obfuscated Font Novel',
      author: 'Tester'
    };

    const chapters = [
      { chapterNumber: 1, title: 'Chương 1', contentHtml: '<p>Ký tự đặc biệt cần font lạ</p>' },
      { chapterNumber: 2, title: 'Chương 2', contentHtml: '' } // empty chapter
    ];

    const options = {
      customFont: {
        enabled: true,
        name: 'MySpecialObfuscatedFont',
        filename: 'special-font.woff2',
        data: fakeFontBytes,
        mimeType: 'font/woff2'
      }
    };

    const epubBlob = await packer.createEpub(metadata, chapters, options);
    assert.ok(epubBlob, 'Must produce EPUB buffer/blob');

    const arrayBuf = typeof epubBlob.arrayBuffer === 'function' ? await epubBlob.arrayBuffer() : epubBlob;
    const validator = new EpubValidator(Buffer.from(arrayBuf));

    // Verify font file exists in archive
    const fontEntry = validator.entryMap.get('OEBPS/fonts/special-font.woff2');
    assert.ok(fontEntry, 'OEBPS/fonts/special-font.woff2 must exist in EPUB archive');
    assert.strictEqual(fontEntry.getText('utf-8'), 'TEST_FONT_DATA_12345_WOFF2', 'Font file content must match');

    // Verify OPF contains manifest item for font
    const opfEntry = validator.entryMap.get('OEBPS/content.opf');
    assert.ok(opfEntry, 'content.opf must exist');
    const opfText = opfEntry.getText('utf-8');
    assert.ok(opfText.includes('href="fonts/special-font.woff2"'), 'content.opf must register font in manifest');
    assert.ok(opfText.includes('media-type="font/woff2"'), 'content.opf must declare font/woff2 media-type');

    // Verify CSS contains @font-face declaration
    const cssEntry = validator.entryMap.get('OEBPS/css/style.css');
    assert.ok(cssEntry, 'style.css must exist');
    const cssText = cssEntry.getText('utf-8');
    assert.ok(cssText.includes('@font-face'), 'style.css must contain @font-face');
    assert.ok(cssText.includes('font-family: "MySpecialObfuscatedFont"'), 'style.css must declare custom font-family');
    assert.ok(cssText.includes('url("../fonts/special-font.woff2")'), 'style.css must link to relative font path');

    // Verify Chapter 2 has <p>pass</p> fallback
    const ch2Entry = validator.entryMap.get('OEBPS/chapters/ch_2.xhtml');
    assert.ok(ch2Entry, 'ch_2.xhtml must exist');
    const ch2Text = ch2Entry.getText('utf-8');
    assert.ok(ch2Text.includes('<p>pass</p>'), 'Empty chapter 2 must contain <p>pass</p>');

    console.log('  √ Test 4 Passed: Custom font embedded in OEBPS/fonts, content.opf manifest, style.css @font-face, and empty chapter <p>pass</p>');
  }

  // Test 5: EpubRepairer - Deep diagnosis and auto-repair of a previously crawled EPUB with hidden errors
  {
    const JSZip = require('../../libs/jszip.min.js');
    const modRepairer = ModuleLoader.loadScriptInContext('src/epub/epub-repairer.js');
    assert.ok(modRepairer.loaded, 'epub-repairer.js must load');
    const EpubRepairer = (modRepairer.exports && modRepairer.exports.EpubRepairer) || modRepairer.exports || modRepairer.sandbox.EpubRepairer;

    // Construct a "dirty/corrupt" EPUB simulating past crawlers
    const dirtyZip = new JSZip();

    // 1. Non-compliant mimetype placement or content
    dirtyZip.file('mimetype', 'application/epub+zip'); // might not be first, will be re-ordered
    dirtyZip.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
    dirtyZip.file('OEBPS/content.opf', `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:uuid:test-1234</dc:identifier>
    <dc:title>Truyện Lỗi Cần Sửa</dc:title>
    <dc:creator>Tác Giả X</dc:creator>
    <dc:language>vi</dc:language>
  </metadata>
  <manifest>
    <item id="c1" href="chapters/ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="chapters/ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="c3" href="chapters/ch3.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="css/style.css" media-type="text/css"/>
  </manifest>
  <spine>
    <itemref idref="c1"/>
    <itemref idref="c2"/>
    <itemref idref="c3"/>
  </spine>
</package>`);

    // Chapter 1: Has hidden white text, 0px font, and unclosed <br>, control chars
    dirtyZip.file('OEBPS/chapters/ch1.xhtml', `
      <html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chương 1</title></head><body>
        <h1>Chương 1: Khởi Đầu</h1>
        <p>Văn bản hợp lệ chương 1.\x00\x08</p>
        <span style="color: #ffffff">chữ trắng chống cào</span>
        <span style="font-size: 0px">font 0px chống cào</span>
        <font color="white">font color white</font>
        <div style="display: none">display none text</div>
        <p>Tiếp tục đoạn văn.<br>Sang dòng mới<hr></p>
      </body></html>
    `);

    // Chapter 2: Empty chapter (only spaces and empty div)
    dirtyZip.file('OEBPS/chapters/ch2.xhtml', `
      <html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chương 2</title></head><body>
        <div>   </div>
      </body></html>
    `);

    // Chapter 3: Normal chapter
    dirtyZip.file('OEBPS/chapters/ch3.xhtml', `
      <html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chương 3</title></head><body>
        <h1>Chương 3: Kết</h1>
        <p>Nội dung bình thường của chương 3.</p>
      </body></html>
    `);

    dirtyZip.file('OEBPS/css/style.css', 'body { line-height: 1.6; }');

    const dirtyBuffer = await dirtyZip.generateAsync({ type: 'nodebuffer' });

    // Step A: Diagnostic inspection
    const diagnosis = await EpubRepairer.inspectEpub(dirtyBuffer);
    assert.strictEqual(diagnosis.title, 'Truyện Lỗi Cần Sửa', 'Should inspect title');
    assert.strictEqual(diagnosis.chapterCount, 3, 'Should detect 3 chapters');
    assert.ok(diagnosis.invisibleNoiseCount >= 3, 'Should detect invisible noise');
    assert.strictEqual(diagnosis.emptyChaptersCount, 1, 'Should detect 1 empty chapter');
    assert.ok(diagnosis.malformedControlCharsCount >= 2, 'Should detect XML control chars');

    // Step B: Run deep auto-repair
    const repairResult = await EpubRepairer.repairEpub(dirtyBuffer, {
      cleanInvisibleText: true,
      fallbackEmpty: true,
      emptyPlaceholder: '<p>pass</p>',
      customFont: {
        enabled: true,
        name: 'FixedNovelFont',
        filename: 'fixed-font.woff2',
        data: Buffer.from('FIXED_FONT_DATA'),
        mimeType: 'font/woff2'
      }
    });

    assert.ok(repairResult.blob, 'Must produce repaired EPUB');
    assert.strictEqual(repairResult.stats.totalChapters, 3, 'Must process 3 chapters');
    assert.ok(repairResult.stats.hiddenNoiseRemoved >= 3, 'Must record hidden noise removed');
    assert.strictEqual(repairResult.stats.emptyChaptersFilled, 1, 'Must record 1 empty chapter filled with pass');
    assert.ok(repairResult.stats.controlCharsRemoved >= 2, 'Must record control chars removed');
    assert.strictEqual(repairResult.stats.fontInjected, true, 'Must record custom font injected');

    // Step C: Validate repaired EPUB with strict IDPF EpubValidator
    const validator = new EpubValidator(Buffer.from(repairResult.blob));
    const mimetypeValidation = validator.validateOcfMimetype();
    assert.strictEqual(mimetypeValidation.passed, true, 'Repaired EPUB must have valid mimetype at byte 0');

    const containerValidation = validator.validateContainer();
    assert.strictEqual(containerValidation.passed, true, 'Repaired EPUB must have valid container');

    const opfValidation = validator.validateOpf(containerValidation.rootfilePath);
    assert.strictEqual(opfValidation.passed, true, 'Repaired EPUB must have valid OPF');

    const chValidation = validator.validateChapters();
    assert.strictEqual(chValidation.passed, true, `All chapters must pass strict XHTML validation: ${chValidation.issues.join('; ')}`);

    // Step D: Verify chapter 1 noise was removed and chapter 2 has <p>pass</p>
    const ch1Entry = validator.entryMap.get('OEBPS/chapters/ch1.xhtml');
    const ch1Text = ch1Entry.getText('utf-8');
    assert.ok(!ch1Text.includes('chữ trắng chống cào'), 'Ch1: hidden white text must be removed');
    assert.ok(!ch1Text.includes('font 0px chống cào'), 'Ch1: 0px font must be removed');
    assert.ok(!ch1Text.includes('\x00'), 'Ch1: control char must be removed');
    assert.ok(ch1Text.includes('<br/>'), 'Ch1: br must be self-closing');

    const ch2Entry = validator.entryMap.get('OEBPS/chapters/ch2.xhtml');
    const ch2Text = ch2Entry.getText('utf-8');
    assert.ok(ch2Text.includes('<p>pass</p>'), 'Ch2: empty chapter must be filled with <p>pass</p>');

    const fontEntry = validator.entryMap.get('OEBPS/fonts/fixed-font.woff2');
    assert.ok(fontEntry, 'Repaired EPUB must contain injected font file');

    const cssEntry = validator.entryMap.get('OEBPS/css/style.css');
    assert.ok(cssEntry.getText('utf-8').includes('@font-face'), 'CSS must contain injected @font-face');

    console.log('  √ Test 5 Passed: EpubRepairer deep auto-repair of corrupt/dirty EPUB');
  }

  console.log('\nALL 5 CAPABILITY TESTS PASSED 100%!\n');
}

if (require.main === module) {
  runUnitTests().catch((err) => {
    console.error('Unit tests failed:', err);
    process.exit(1);
  });
}

module.exports = { runUnitTests };
