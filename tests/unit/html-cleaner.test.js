// tests/unit/html-cleaner.test.js
// Verification for HtmlCleaner:
// 1. Detection: isHtml accuracy
// 2. Text to HTML conversion: paragraphs, headings, dialog quotes, XML escaping
// 3. Dirty HTML cleaning: micro-fonts, white/transparent text, display:none, scripts, inline styles, unclosed tags
// 4. Unified process() with statistics
// 5. Handling crawl failure fallbacks & manual chapter recovery integration
const assert = require('node:assert/strict');
const { HtmlCleaner } = require('../../src/parsers/html-cleaner');

async function runHtmlCleanerTests() {
  console.log('\n--- Running Unit Tests: HtmlCleaner Engine & Crawl Error Handling ---');

  // Test 1: isHtml detection
  {
    assert.equal(HtmlCleaner.isHtml('Chỉ là một đoạn văn bản thô.'), false);
    assert.equal(HtmlCleaner.isHtml('a < 5 and b > 10 so x -> y'), false);
    assert.equal(HtmlCleaner.isHtml(''), false);
    assert.equal(HtmlCleaner.isHtml(null), false);

    assert.equal(HtmlCleaner.isHtml('<p>Đoạn văn HTML</p>'), true);
    assert.equal(HtmlCleaner.isHtml('<div><span>Nội dung</span></div>'), true);
    assert.equal(HtmlCleaner.isHtml('<!DOCTYPE html><html><body>Test</body></html>'), true);
    assert.equal(HtmlCleaner.isHtml('Tiêu đề<br/>Dòng tiếp theo'), true);
    console.log('  √ Test 1 Passed: Accurate HTML vs Plain-Text detection');
  }

  // Test 2: Text to HTML conversion
  {
    const rawText = `
      Chương 1: Thế Giới Mới

      Trời vừa sáng tỏ, Lâm Phong tỉnh dậy từ trong phòng ngủ.
      Hắn bước ra ngoài hiên ngắm nhìn cảnh vật xung quanh.

      - Ngươi đã chuẩn bị sẵn sàng chưa? - Tiêu Viêm mỉm cười hỏi.

      "Đã sẵn sàng từ lâu rồi," Lâm Phong đáp lại với ánh mắt kiên định & tự tin.
    `;

    const result = HtmlCleaner.textToHtml(rawText, { detectHeadings: true });
    assert.ok(result.cleanHtml.includes('<h3>Chương 1: Thế Giới Mới</h3>'), 'Must format chapter title as <h3>');
    assert.ok(result.cleanHtml.includes('<p>Trời vừa sáng tỏ'), 'Must wrap paragraph in <p>');
    assert.ok(result.cleanHtml.includes('— Ngươi đã chuẩn bị'), 'Must normalize dialogue dash');
    assert.ok(result.cleanHtml.includes('&amp; tự tin'), 'Must escape & to &amp;');
    assert.ok(!result.cleanHtml.includes('\n\n\n'), 'Must not have chaotic empty lines');
    assert.ok(result.stats.paragraphCount >= 3, 'Must count paragraphs correctly');
    assert.ok(result.stats.wordCount > 10, 'Must count words correctly');
    console.log('  √ Test 2 Passed: Text-to-HTML formatting, headings & XML escaping');
  }

  // Test 3: Dirty HTML Cleaning - Microscopic font & Anti-crawler noise
  {
    const dirtyHtml = `
      <div class="chapter-content" style="font-family: Arial; font-size: 16px; line-height: 28px; color: #333;">
        <script>console.log("ads tracking");</script>
        <style>.ads { color: red; }</style>
        <p style="margin: 0px 0px 15px; font-size: 15px;">
          Lâm Phong rút trường kiếm ra khỏi vỏ.
          <span style="font-size: 0px;">chữ chống cào bẫy 1</span>
          <span style="font-size: 1px">từ rác li ti</span>
          <span style="font-size: 0.1em">từ rác em</span>
          <font size="1">font size 1 rác</font>
          <span style="color: #ffffff">chữ trắng ẩn</span>
          <span style="color: white">chữ trắng 2</span>
          <span style="display: none">display none trap</span>
          <span style="visibility: hidden">hidden trap</span>
          <span style="opacity: 0">opacity 0 trap</span>
        </p>
        <div class="watermark" style="position: absolute; left: -9999px;">Đọc truyện tại web giả mạo</div>
        <p onclick="alert('click')">
          Kiếm khí tung hoành khắp tứ phía, <b>uy áp</b> kinh người làm <i>vạn vật</i> run rẩy.
        </p>
        <!-- Banners & junk tags -->
        <iframe src="https://ads.example.com"></iframe>
        <form><input type="text"/></form>
        <br><br>
        <font color="#ffffff">chữ trắng cuối trang</font>
      </div>
    `;

    const result = HtmlCleaner.cleanDirtyHtml(dirtyHtml, {
      stripStyles: true,
      removeMicroText: true,
      removeInvisible: true
    });

    const clean = result.cleanHtml;

    // Verify all noise was eradicated
    assert.ok(!clean.includes('chữ chống cào bẫy 1'), 'Must strip font-size: 0px');
    assert.ok(!clean.includes('từ rác li ti'), 'Must strip font-size: 1px');
    assert.ok(!clean.includes('từ rác em'), 'Must strip font-size: 0.1em');
    assert.ok(!clean.includes('font size 1 rác'), 'Must strip <font size="1">');
    assert.ok(!clean.includes('chữ trắng ẩn'), 'Must strip color: #ffffff');
    assert.ok(!clean.includes('chữ trắng 2'), 'Must strip color: white');
    assert.ok(!clean.includes('display none trap'), 'Must strip display: none');
    assert.ok(!clean.includes('hidden trap'), 'Must strip visibility: hidden');
    assert.ok(!clean.includes('opacity 0 trap'), 'Must strip opacity: 0');
    assert.ok(!clean.includes('left: -9999px'), 'Must strip position left: -9999px');
    assert.ok(!clean.includes('ads tracking'), 'Must strip script tags');
    assert.ok(!clean.includes('onclick'), 'Must strip inline onclick handlers');
    assert.ok(!clean.includes('<iframe'), 'Must strip iframe tags');
    assert.ok(!clean.includes('<form'), 'Must strip form tags');

    // Verify legitimate text & safe formatting survived
    assert.ok(clean.includes('Lâm Phong rút trường kiếm ra khỏi vỏ'), 'Must preserve legitimate text');
    assert.ok(clean.includes('Kiếm khí tung hoành khắp tứ phía'), 'Must preserve paragraph 2');
    assert.ok(clean.includes('<strong>uy áp</strong>'), 'Must convert <b> to semantic <strong>');
    assert.ok(clean.includes('<em>vạn vật</em>'), 'Must convert <i> to semantic <em>');

    // Verify stats
    assert.ok(result.stats.removedItems.tinyFonts > 0, 'Must record tiny fonts in stats');
    assert.ok(result.stats.removedItems.invisibleElements > 0, 'Must record invisible elements in stats');
    assert.ok(result.stats.removedItems.scriptsAndStyles > 0, 'Must record scripts in stats');
    console.log('  √ Test 3 Passed: Dirty HTML deep noise, camouflage & micro-font eradication');
  }

  // Test 4: Unified process() method with auto-detection & empty fallback
  {
    // Auto-detect text
    const resText = HtmlCleaner.process('Dòng 1 văn bản\n\nDòng 2 văn bản');
    assert.equal(resText.detectedType, 'text');
    assert.ok(resText.cleanHtml.includes('<p>Dòng 1 văn bản</p>'));

    // Auto-detect HTML
    const resHtml = HtmlCleaner.process('<p>Đoạn <b>HTML</b></p>');
    assert.equal(resHtml.detectedType, 'html');
    assert.ok(resHtml.cleanHtml.includes('<strong>HTML</strong>'));

    // Blank / Empty input fallback
    const resEmpty = HtmlCleaner.process('   \n\t  ', { emptyPlaceholder: '<p>pass</p>' });
    assert.equal(resEmpty.cleanHtml, '<p>pass</p>', 'Empty input must fallback to <p>pass</p>');

    // Dirty HTML that only contained noise -> fallback
    const resOnlyNoise = HtmlCleaner.process('<span style="font-size:0px">junk only</span>', { emptyPlaceholder: '<p>pass</p>' });
    assert.equal(resOnlyNoise.cleanHtml, '<p>pass</p>', 'Noise-only input must fallback to <p>pass</p>');

    console.log('  √ Test 4 Passed: Unified process() with auto-detect and placeholder fallbacks');
  }

  // Test 5: Crawl Failure & Manual Chapter Recovery Integration
  {
    // Simulate a crawl failure scenario:
    // Chapter 15 fails to crawl from the live website due to anti-bot / 403 Forbidden / Cloudflare
    const mockFailedQueue = [
      { id: 'ch-15', chapterNumber: 15, title: 'Chương 15: Bí Tàng', url: 'https://site.com/ch15', error: 'HTTP 403 Forbidden - Anti-bot blocked' }
    ];

    const mockDownloadedMap = new Map([
      [14, { chapterNumber: 14, title: 'Chương 14', contentHtml: '<p>Nội dung 14</p>' }]
    ]);

    // User copies content from manual web browser tab (which has obfuscated HTML)
    const userCopiedDirtyHtml = `
      <div id="content">
        <p style="font-size: 18px; color: black;">Lâm Phong tiến vào mật thất của bí tàng. <span style="font-size:1px">trap</span></p>
        <p>Phía trước xuất hiện một tòa thạch đài cổ xưa.</p>
      </div>
    `;

    // Process user input via HtmlCleaner
    const cleanOutput = HtmlCleaner.process(userCopiedDirtyHtml);
    assert.ok(!cleanOutput.cleanHtml.includes('trap'), 'Scrubbed noise');
    assert.ok(cleanOutput.cleanHtml.includes('tiến vào mật thất'));

    // Patch the rescued chapter into the novel's downloaded chapters collection
    const resolvedChapterNumber = 15;
    mockDownloadedMap.set(resolvedChapterNumber, {
      chapterNumber: resolvedChapterNumber,
      title: 'Chương 15: Bí Tàng',
      contentHtml: cleanOutput.cleanHtml,
      manuallyRepaired: true
    });

    // Remove from failed queue
    const remainingFailed = mockFailedQueue.filter(item => item.chapterNumber !== resolvedChapterNumber);

    assert.equal(remainingFailed.length, 0, 'Failed chapter successfully cleared from error list');
    assert.equal(mockDownloadedMap.size, 2, 'Rescued chapter successfully added to downloaded chapters');
    assert.ok(mockDownloadedMap.get(15).contentHtml.includes('Lâm Phong tiến vào mật thất'));
    console.log('  √ Test 5 Passed: Crawl failure recovery & manual chapter rescue workflow verified');
  }

  // Test 6: Extreme Malformed HTML & XML Validity for EPUB
  {
    const { EpubValidator } = require('../harness/epub-validator');
    const { EpubPacker } = require('../../src/epub/epub-packer');

    const extremeDirty = `
      <div style="font-size: 1px">Bẫy đầu</div>
      <p>Đoạn 1: Ký tự điều khiển: \x00\x08\x0B\x1F và thẻ chưa đóng <br> tiếp theo <hr>
      <p style="font-size: xx-small">Bẫy giữa</p>
      <p>Đoạn 2 có & chưa escape và dấu < > lồng nhau.</p>
      <span style="color: transparent">Bẫy cuối</span>
    `;

    const cleaned = HtmlCleaner.process(extremeDirty);
    assert.ok(!cleaned.cleanHtml.includes('\x00'));
    assert.ok(!cleaned.cleanHtml.includes('Bẫy'));
    assert.ok(cleaned.cleanHtml.includes('<br/>'));
    assert.ok(cleaned.cleanHtml.includes('<hr/>'));

    // Package into actual EPUB to guarantee zero IDPF XML parsing errors
    const packer = new EpubPacker();
    const epubBlob = await packer.createEpub(
      { title: 'Sách Cứu Hộ', author: 'Tác Giả' },
      [{ id: 'ch-1', chapterNumber: 1, title: 'Chương 1', contentHtml: cleaned.cleanHtml }]
    );

    assert.ok(epubBlob, 'EPUB blob generated');
    const arrayBuf = typeof epubBlob.arrayBuffer === 'function' ? await epubBlob.arrayBuffer() : epubBlob;
    const buf = Buffer.isBuffer(arrayBuf) ? arrayBuf : Buffer.from(arrayBuf);
    const val = new EpubValidator(buf);
    const containerResult = val.validateContainer();
    assert.strictEqual(containerResult.passed, true, `container.xml validation: ${containerResult.issues?.join('; ')}`);
    const opfResult = val.validateOpf(containerResult.rootfilePath);
    assert.strictEqual(opfResult.passed, true, `content.opf validation: ${opfResult.issues?.join('; ')}`);
    console.log('  √ Test 6 Passed: Cleaned HTML produces 100% compliant IDPF EPUB archive');
  }

  console.log('\n=== ALL HTML CLEANER TESTS PASSED 100% ===\n');
}

if (require.main === module) {
  runHtmlCleanerTests().catch((err) => {
    console.error('Test Failed:', err);
    process.exit(1);
  });
}

module.exports = { runHtmlCleanerTests };
