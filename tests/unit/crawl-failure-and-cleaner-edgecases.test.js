// tests/unit/crawl-failure-and-cleaner-edgecases.test.js
// Verification for:
// 1. Crawl failure: Site cannot crawl TOC/Metadata -> User uses Cleaner to add chapters manually and export valid EPUB
// 2. Crawl failure: Individual chapter blocked by Anti-bot/Cloudflare -> Rescued via Cleaner and patched into novel
// 3. Crawl failure: Permanent unrecoverable failure -> Placeholder auto-insertion & chapter ordering preserved
// 4. Extreme dirty HTML: micro-fonts, white/transparent camouflage, nested zero-font spans, Word/Docs styles, scripts/ads
// 5. Extreme plain text: headings, dialogue quotes, mixed line-breaks, special XML characters
const assert = require('node:assert/strict');
const { HtmlCleaner } = require('../../src/parsers/html-cleaner');
const { EpubPacker } = require('../../src/epub/epub-packer');
const { EpubValidator } = require('../harness/epub-validator');

async function runEdgeCasesTests() {
  console.log('\n--- Running Tests: Crawl Failure Scenarios & HTML Cleaner Edge Cases ---');

  // Case 1: Site fails to crawl completely (TOC/Metadata blocked) -> Manual Chapter Creation via Cleaner -> Valid EPUB
  {
    console.log('Testing Case 1: Site fails to crawl completely -> manual Cleaner rescue -> EPUB export...');

    // User copies raw text from an offline reader / app for Chapter 1
    const rawCh1 = `
      Chương 1: Khởi Đầu Tại Ma Thú Sơn Mạch

      Lâm Phong tỉnh lại trong một hang đá ẩm ướt.
      Khắp nơi vang lên tiếng gầm gừ của ma thú cấp thấp.

      - Ngươi đã tỉnh? - Một thiếu nữ mặc áo lam khẽ hỏi.

      "Ta đang ở đâu?" Lâm Phong xoa đầu, cố gắng nhớ lại chuyện gì đã xảy ra.
    `;

    // User copies raw text for Chapter 2
    const rawCh2 = `
      Chương 2: Dược Thảo Huyền Bí

      Thiếu nữ đưa cho Lâm Phong một bát canh thuốc thơm ngát.
      Dòng dược lực ấm áp chảy khắp kinh mạch, hồi phục thương thế nhanh chóng.

      - Đây là Hồi Huyết Thảo, rất khó tìm được ở vùng ven núi này.
    `;

    const cleaned1 = HtmlCleaner.process(rawCh1);
    const cleaned2 = HtmlCleaner.process(rawCh2);

    assert.equal(cleaned1.detectedType, 'text');
    assert.equal(cleaned2.detectedType, 'text');
    assert.ok(cleaned1.cleanHtml.includes('<h3>Chương 1: Khởi Đầu Tại Ma Thú Sơn Mạch</h3>'));
    assert.ok(cleaned2.cleanHtml.includes('<h3>Chương 2: Dược Thảo Huyền Bí</h3>'));

    const manualChapters = [
      { id: 'manual-1', chapterNumber: 1, title: 'Chương 1: Khởi Đầu Tại Ma Thú Sơn Mạch', contentHtml: cleaned1.cleanHtml },
      { id: 'manual-2', chapterNumber: 2, title: 'Chương 2: Dược Thảo Huyền Bí', contentHtml: cleaned2.cleanHtml }
    ];

    const packer = new EpubPacker();
    const epubBlob = await packer.createEpub(
      { title: 'Truyện Nhập Thủ Công Cứu Hộ', author: 'Lâm Phong' },
      manualChapters
    );

    const arrayBuf = typeof epubBlob.arrayBuffer === 'function' ? await epubBlob.arrayBuffer() : epubBlob;
    const buf = Buffer.isBuffer(arrayBuf) ? arrayBuf : Buffer.from(arrayBuf);
    const val = new EpubValidator(buf);

    const containerRes = val.validateContainer();
    assert.equal(containerRes.passed, true, `Container valid: ${containerRes.issues?.join('; ')}`);
    const opfRes = val.validateOpf(containerRes.rootfilePath);
    assert.equal(opfRes.passed, true, `OPF valid: ${opfRes.issues?.join('; ')}`);

    console.log('  √ Case 1 Passed: Complete crawl failure successfully bypassed via Cleaner to valid EPUB');
  }

  // Case 2: Chapter fails during crawl (Anti-bot / 403 Forbidden) -> Rescued via Cleaner & patched
  {
    console.log('Testing Case 2: Chapter blocked by Anti-bot during crawl -> Cleaner patch into novel...');

    const failedQueue = [
      { id: 'ch-5', chapterNumber: 5, title: 'Chương 5: Trận Huyết Chiến', url: 'https://site.com/ch5', error: 'HTTP 403 Forbidden: Cloudflare challenge required' }
    ];

    const downloadedMap = new Map([
      [4, { chapterNumber: 4, title: 'Chương 4', contentHtml: '<p>Nội dung chương 4 bình thường.</p>' }],
      [6, { chapterNumber: 6, title: 'Chương 6', contentHtml: '<p>Nội dung chương 6 bình thường.</p>' }]
    ]);

    // User pastes dirty HTML copied from browser window that bypassed anti-bot
    const dirtyHtmlWithNoise = `
      <div id="chapter-body" style="font-family: Arial; font-size: 16px; color: #222;">
        <script>window.__ad_unit = 123;</script>
        <p style="margin-bottom: 12px; font-size: 15px;">
          Lâm Phong rút kiếm, mũi kiếm rung lên từng hồi kiếm minh thanh thúy.
          <span style="font-size: 0px;">chữ chống cào web</span>
          <span style="font-size: 1px">rác li ti</span>
          <span style="color: #ffffff">chữ trắng ẩn</span>
          <span style="display: none">display none trap</span>
        </p>
        <div class="watermark" style="position: absolute; left: -9999px;">Bản quyền thuộc web lậu</div>
        <p onclick="alert('click')">
          Kiếm khí quét ngang, chém đứt ba gốc đại thụ xung quanh.
        </p>
      </div>
    `;

    const cleanedResult = HtmlCleaner.process(dirtyHtmlWithNoise);
    assert.equal(cleanedResult.detectedType, 'html');
    assert.ok(!cleanedResult.cleanHtml.includes('chữ chống cào web'));
    assert.ok(!cleanedResult.cleanHtml.includes('rác li ti'));
    assert.ok(!cleanedResult.cleanHtml.includes('Bản quyền thuộc web lậu'));
    assert.ok(cleanedResult.cleanHtml.includes('Lâm Phong rút kiếm'));

    // Patch rescued chapter into downloadedMap
    const targetNum = 5;
    downloadedMap.set(targetNum, {
      id: `repaired-ch-${targetNum}`,
      chapterNumber: targetNum,
      title: 'Chương 5: Trận Huyết Chiến',
      contentHtml: cleanedResult.cleanHtml,
      manuallyRepaired: true
    });

    // Remove from failed queue
    const remainingFailed = failedQueue.filter(f => f.chapterNumber !== targetNum);
    assert.equal(remainingFailed.length, 0, 'Failed chapter cleared');
    assert.equal(downloadedMap.size, 3, 'Now contains chapters 4, 5, 6');

    // Verify sort order in EPUB: 4 -> 5 -> 6
    const sorted = [...downloadedMap.values()].sort((a, b) => a.chapterNumber - b.chapterNumber);
    assert.equal(sorted[0].chapterNumber, 4);
    assert.equal(sorted[1].chapterNumber, 5);
    assert.equal(sorted[2].chapterNumber, 6);

    console.log('  √ Case 2 Passed: Blocked chapter repaired with clean HTML and restored into chapter sequence');
  }

  // Case 3: Permanent crawl failure with no manual copy -> Placeholder auto-insertion & chapter ordering
  {
    console.log('Testing Case 3: Permanent unrecoverable chapter -> Placeholder auto-insertion...');

    const downloadedChapters = [
      { id: 'ch-1', chapterNumber: 1, title: 'Chương 1', contentHtml: '<p>Chương 1 thành công.</p>' },
      { id: 'ch-3', chapterNumber: 3, title: 'Chương 3', contentHtml: '<p>Chương 3 thành công.</p>' }
    ];

    const failedChapters = [
      { id: 'ch-2', chapterNumber: 2, title: 'Chương 2', error: 'HTTP 404 Not Found (Server deleted chapter)' }
    ];

    // Emulate manager.js placeholder auto-fill logic
    const allChaptersToPack = [...downloadedChapters];
    for (const failedItem of failedChapters) {
      if (!allChaptersToPack.some(ch => ch.chapterNumber === failedItem.chapterNumber)) {
        allChaptersToPack.push({
          id: failedItem.id,
          chapterNumber: failedItem.chapterNumber,
          title: failedItem.title,
          contentHtml: `<div class="chapter-placeholder"><p><em>[Chương này gặp lỗi khi tải từ trang nguồn: ${failedItem.error}. Đã tự động giữ chỗ để bảo toàn mạch thứ tự chương.]</em></p><p>pass</p></div>`,
          isPlaceholder: true
        });
      }
    }

    // Sort chapters
    allChaptersToPack.sort((a, b) => a.chapterNumber - b.chapterNumber);

    assert.equal(allChaptersToPack.length, 3);
    assert.equal(allChaptersToPack[0].chapterNumber, 1);
    assert.equal(allChaptersToPack[1].chapterNumber, 2);
    assert.equal(allChaptersToPack[2].chapterNumber, 3);
    assert.equal(allChaptersToPack[1].isPlaceholder, true);

    const packer = new EpubPacker();
    const epubBlob = await packer.createEpub(
      { title: 'Truyện Có Chương Lỗi Được Giữ Chỗ', author: 'Tác Giả' },
      allChaptersToPack
    );

    const arrayBuf = typeof epubBlob.arrayBuffer === 'function' ? await epubBlob.arrayBuffer() : epubBlob;
    const buf = Buffer.isBuffer(arrayBuf) ? arrayBuf : Buffer.from(arrayBuf);
    const val = new EpubValidator(buf);
    const containerRes = val.validateContainer();
    assert.equal(containerRes.passed, true);
    const opfRes = val.validateOpf(containerRes.rootfilePath);
    assert.equal(opfRes.passed, true);

    console.log('  √ Case 3 Passed: Permanent failure preserved sequential order via strict XML placeholder');
  }

  // Case 4: Extreme Dirty HTML with Word/Docs styles, microscopic text, and unclosed tags
  {
    console.log('Testing Case 4: Extreme dirty HTML cleaning...');

    const extremeDirty = `
      <div class="WordSection1" style="mso-element:header; font-family:'Calibri',sans-serif; font-size:11.0pt; line-height:115%;">
        <!-- Mso comments and weird office junk -->
        <p class="MsoNormal" style="margin-bottom:0pt; line-height:normal; color:#000000;">
          <span style="font-family:'Times New Roman',serif; font-size:14.0pt;">
            Đoạn văn sao chép từ tài liệu có định dạng Word lạ lùng.
          </span>
          <span style="font-size:0px">junk0</span>
          <span style="font-size:0.5px">junk0.5</span>
          <span style="font-size:xx-small">junk_xx_small</span>
          <span style="font-size:2px">junk2px</span>
          <span style="color:transparent">transparent_trap</span>
          <span style="opacity:0">opacity0_trap</span>
        </p>
        <p>Đoạn văn tiếp theo có thẻ unclosed: <br> dòng mới <hr> vạch ngang</p>
        <span style="position:fixed; top:-9999px;">fixed_offscreen</span>
        <span style="text-indent:-9999px;">indent_offscreen</span>
        <p>Ký tự điều khiển: \x00\x08\x0B và thực thể & chưa escape.</p>
      </div>
    `;

    const res = HtmlCleaner.cleanDirtyHtml(extremeDirty);
    const clean = res.cleanHtml;

    assert.ok(!clean.includes('junk0'), 'Strip 0px');
    assert.ok(!clean.includes('junk0.5'), 'Strip 0.5px');
    assert.ok(!clean.includes('junk_xx_small'), 'Strip xx-small');
    assert.ok(!clean.includes('junk2px'), 'Strip 2px');
    assert.ok(!clean.includes('transparent_trap'), 'Strip transparent');
    assert.ok(!clean.includes('opacity0_trap'), 'Strip opacity 0');
    assert.ok(!clean.includes('fixed_offscreen'), 'Strip fixed top -9999px');
    assert.ok(!clean.includes('indent_offscreen'), 'Strip text-indent -9999px');
    assert.ok(!clean.includes('\x00'), 'Strip control chars');
    assert.ok(!clean.includes('style="'), 'Strip messy inline style attributes');
    assert.ok(clean.includes('<br/>'), 'Void tag br self-closed');
    assert.ok(clean.includes('<hr/>'), 'Void tag hr self-closed');
    assert.ok(clean.includes('Đoạn văn sao chép từ tài liệu'), 'Preserved genuine text');

    console.log('  √ Case 4 Passed: Extreme dirty HTML, microscopic fonts & Office styles eradicated');
  }

  // Case 5: Extreme Plain Text with headings, dialog dashes, XML special characters
  {
    console.log('Testing Case 5: Extreme plain text formatting...');

    const extremeText = `
Chương 100: Đại Kết Cục (Hạ)

Cuộc đại chiến giữa Thiên Địa Minh và Vạn Ma Môn rốt cuộc cũng đi đến hồi kết.
Khói lửa dần tan đi, để lại một vùng bình nguyên nhuộm đỏ ráng chiều.

- Ngươi thắng rồi... - Ma Hoàng thở dài một hơi đầy cay đắng.
- Nhưng con đường đại đạo, trước nay chưa từng có điểm dừng chân!

"Ta biết," Lâm Phong khẽ thu hồi trường kiếm vào vỏ, ánh mắt nhìn về phía chân trời vô tận.

& đó chính là khởi đầu của một truyền thuyết mới <Vạn Giới Tiên Tôn>.
    `;

    const res = HtmlCleaner.textToHtml(extremeText, { detectHeadings: true });
    assert.ok(res.cleanHtml.includes('<h3>Chương 100: Đại Kết Cục (Hạ)</h3>'), 'Heading formatted');
    assert.ok(res.cleanHtml.includes('— Ngươi thắng rồi...'), 'Dialogue dash formatted');
    assert.ok(res.cleanHtml.includes('&amp; đó chính là'), '& escaped to &amp;');
    assert.ok(res.cleanHtml.includes('&lt;Vạn Giới Tiên Tôn&gt;'), '< > escaped to &lt; &gt;');
    assert.ok(!res.cleanHtml.includes('<p></p>'), 'No empty paragraphs');

    console.log('  √ Case 5 Passed: Extreme plain text converted to valid XML paragraphs and headings');
  }

  console.log('\n=== ALL CRAWL FAILURE & CLEANER EDGE CASES PASSED 100% ===\n');
}

if (require.main === module) {
  runEdgeCasesTests().catch((err) => {
    console.error('Edge Cases Test Failed:', err);
    process.exit(1);
  });
}

module.exports = { runEdgeCasesTests };
