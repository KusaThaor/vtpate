const assert = require('node:assert/strict');
const path = require('node:path');
const { EpubTemplates } = require('../src/epub/epub-templates');
const { EpubPacker } = require('../src/epub/epub-packer');
const { TabDownloader } = require('../src/crawler/tab-downloader');
const { CrawlEngine } = require('../src/crawler/crawl-engine');

async function testBackgroundChaptersNoFocusSteal() {
  const updateCalls = [];
  global.chrome = {
    tabs: {
      create: async (props) => ({ id: 456, active: props.active }),
      update: async (tabId, props) => {
        updateCalls.push({ tabId, props });
        return { id: tabId, ...props };
      },
      onUpdated: { addListener: () => {}, removeListener: () => {} },
      onRemoved: { addListener: () => {}, removeListener: () => {} }
    },
    scripting: {
      executeScript: async () => [{ result: { html: '<html><body><p>Test Content</p></body></html>', ready: true, url: 'https://example.com/chapter-1' } }]
    }
  };

  const downloader = new TabDownloader({
    visibleTab: true,
    backgroundChapters: true,
    pageLoadWaitMs: 10
  });

  await downloader.initialize();
  assert.equal(downloader.visibleTab, true);
  assert.equal(downloader.backgroundChapters, true);

  await downloader.fetchChapter('https://example.com/chapter-1');

  // Verify that during chapter fetching, active: true was NOT sent in update
  const navigateUpdate = updateCalls.find(call => call.props.url === 'https://example.com/chapter-1');
  assert.ok(navigateUpdate, 'Navigation update was called');
  assert.equal(navigateUpdate.props.active, undefined, 'active: true was not set, preventing focus steal');

  console.log('✓ TabDownloader backgroundChapters verified: user focus is never stolen during chapter transitions');
}

async function testPasswordProtectedChapterHandling() {
  const updateCalls = [];
  let onPasswordFired = false;

  const passwordProtectedHtml = '<!DOCTYPE html><html><body><form id="post-password-form" class="chapter-protected"><p>Chương này cần pass để đọc</p><input type="password" name="pass"/></form></body></html>';
  const solvedChapterHtml = '<!DOCTYPE html><html><body><div id="chapter-content"><p>Nội dung sau khi mở pass thành công.</p></div></body></html>';

  let currentHtml = passwordProtectedHtml;
  let currentTabUrl = 'https://example.com/ch-pass';

  global.chrome = {
    tabs: {
      create: async (props) => ({ id: 789, active: props.active }),
      update: async (tabId, props) => {
        updateCalls.push({ tabId, props });
        if (props.url) currentTabUrl = props.url;
        return { id: tabId, ...props };
      },
      onUpdated: { addListener: () => {}, removeListener: () => {} },
      onRemoved: { addListener: () => {}, removeListener: () => {} }
    },
    scripting: {
      executeScript: async () => [{ result: { html: currentHtml, ready: true, url: currentTabUrl } }]
    }
  };

  const downloader = new TabDownloader({
    visibleTab: false,
    backgroundChapters: true,
    pageLoadWaitMs: 10,
    challengePollIntervalMs: 20,
    onPassword: () => {
      onPasswordFired = true;
    }
  });

  await downloader.initialize();

  // 1. Test Password Detection and Skip-Pass mechanism
  const fetchPromise = downloader.fetchChapter('https://example.com/ch-pass', { emptyPlaceholder: '<p>pass</p>' });

  // Wait for detection
  for (let i = 0; i < 20 && !onPasswordFired; i++) await new Promise(r => setTimeout(r, 20));

  assert.equal(onPasswordFired, true, 'onPassword callback was triggered');
  assert.equal(downloader.isWaitingForPassword, true, 'isWaitingForPassword flag set to true');

  // Tab must have been brought to front for user to enter password
  const activatedCall = updateCalls.find(c => c.props.active === true);
  assert.ok(activatedCall, 'Tab was brought to front (active: true) when password detected');

  // User decides not to solve pass and clicks "Bỏ qua giải pass"
  downloader.skipPasswordCurrentChapter();

  const skipResult = await fetchPromise;
  assert.ok(skipResult.includes('<p>pass</p>'), 'Chapter resolved with placeholder <p>pass</p>');
  assert.equal(downloader.isWaitingForPassword, false, 'isWaitingForPassword reset after skip');

  // 2. Test Password Solving mechanism
  currentHtml = passwordProtectedHtml;
  onPasswordFired = false;
  const fetchPromise2 = downloader.fetchChapter('https://example.com/ch-pass-2');

  for (let i = 0; i < 20 && !downloader.isWaitingForPassword; i++) await new Promise(r => setTimeout(r, 20));
  assert.equal(downloader.isWaitingForPassword, true);

  // User solves password on the tab, page reloads with content
  currentHtml = solvedChapterHtml;
  downloader.retryCurrentChapter();

  const solvedResult = await fetchPromise2;
  assert.ok(solvedResult.includes('Nội dung sau khi mở pass thành công'), 'Chapter resolved with actual content after unlocking');
  assert.equal(downloader.isWaitingForPassword, false);

  console.log('✓ Password Protected Chapter verified: tab activated, skip-pass creates <p>pass</p>, unlock resumes crawl');
}

async function testSplitEpubVolumes() {
  const meta = {
    title: 'Vũ Động Càn Khôn',
    author: 'Thiên Tằm Thổ Đậu',
    description: 'Bộ truyện siêu dài nhiều phần.'
  };

  const chapters = Array.from({ length: 12 }, (_, i) => ({
    chapterNumber: i + 1,
    title: `Chương ${i + 1}: Tiêu đề chương ${i + 1}`,
    contentHtml: `<p>Nội dung chương ${i + 1}</p>`
  }));

  // Split into volumes of 5 chapters each (12 chapters -> 3 volumes: 5, 5, 2)
  const volumes = await EpubPacker.createSplitEpub(meta, chapters, {
    splitSize: 5,
    includeIntroChapter: true
  });

  assert.equal(volumes.length, 3, 'Created exactly 3 volumes');

  assert.equal(volumes[0].volume, 1);
  assert.equal(volumes[0].totalVolumes, 3);
  assert.equal(volumes[0].fromChapter, 1);
  assert.equal(volumes[0].toChapter, 5);
  assert.equal(volumes[0].chapterCount, 5);
  assert.ok(volumes[0].filename.includes('Quyen 1'));
  assert.ok(volumes[0].blob, 'Volume 1 blob generated');

  assert.equal(volumes[1].volume, 2);
  assert.equal(volumes[1].fromChapter, 6);
  assert.equal(volumes[1].toChapter, 10);
  assert.equal(volumes[1].chapterCount, 5);
  assert.ok(volumes[1].filename.includes('Quyen 2'));

  assert.equal(volumes[2].volume, 3);
  assert.equal(volumes[2].fromChapter, 11);
  assert.equal(volumes[2].toChapter, 12);
  assert.equal(volumes[2].chapterCount, 2);
  assert.ok(volumes[2].filename.includes('Quyen 3'));

  console.log('✓ EPUB Multi-part / Volume Splitter verified: 12 chapters cleanly split into 3 volume EPUBs');
}

async function testInlineIllustrationImages() {
  const fakeImgBuffer = Buffer.from('FAKE_JPG_BINARY_IMAGE_DATA');
  const originalFetch = global.fetch;

  global.fetch = async (url) => {
    if (url.includes('illustration.jpg')) {
      return {
        ok: true,
        headers: { get: () => 'image/jpeg' },
        arrayBuffer: async () => fakeImgBuffer
      };
    }
    return { ok: false, status: 404 };
  };

  try {
    const engine = new CrawlEngine();
    const chapter = {
      chapterNumber: 7,
      title: 'Chương 7',
      contentHtml: '<p>Đoạn văn trước hình.</p><img src="https://example.com/novel/illustration.jpg" alt="Art"/><p>Đoạn văn sau hình.</p>'
    };

    await engine._processInlineImages(chapter);

    assert.ok(chapter.images && chapter.images.length === 1, 'Image registered in chapter.images');
    assert.equal(chapter.images[0].filename, 'ch7_img_1.jpg');
    assert.ok(chapter.contentHtml.includes('../images/ch7_img_1.jpg'), 'Image src rewritten to relative EPUB path');
    assert.ok(!chapter.contentHtml.includes('https://example.com/novel/illustration.jpg'), 'Original remote URL replaced');

    // Pack into EPUB
    const meta = { title: 'Truyện Minh Họa', author: 'Minh Họa' };
    const epubBlob = await EpubPacker.createEpub(meta, [chapter]);

    const JSZip = require('../libs/jszip.min.js');
    const zip = await JSZip.loadAsync(epubBlob);
    assert.ok(zip.file('OEBPS/images/ch7_img_1.jpg'), 'Inline illustration image bundled in EPUB zip');

    console.log('✓ Inline Chapter Images verified: remote images downloaded, rewritten to ../images/, and packaged in EPUB');
  } finally {
    global.fetch = originalFetch;
  }
}

async function testCustomRegexCleaner() {
  const rawHtml = '<p>Chương 1 bắt đầu. Nguồn: truyenfull.vn chúc bạn đọc vui vẻ. Thân bài chương này hay lắm. Truyện được đăng duy nhất tại giatocvuongtai.com vui lòng không reup!</p>';
  const regexList = [
    'Nguồn:\\s*truyenfull\\.vn\\s*chúc\\s*bạn\\s*đọc\\s*vui\\s*vẻ\\.',
    'Truyện\\s*được\\s*đăng\\s*duy\\s*nhất\\s*tại\\s*giatocvuongtai\\.com\\s*vui\\s*lòng\\s*không\\s*reup!?'
  ];

  const cleaned = EpubTemplates.sanitizeAndFormatHtml(rawHtml, { customRegexList: regexList });
  assert.ok(!cleaned.includes('truyenfull.vn'), 'Watermark 1 stripped');
  assert.ok(!cleaned.includes('giatocvuongtai.com'), 'Watermark 2 stripped');
  assert.ok(cleaned.includes('Chương 1 bắt đầu.'), 'Valid story content preserved');
  assert.ok(cleaned.includes('Thân bài chương này hay lắm.'), 'Valid story content preserved');

  console.log('✓ Custom Regex Cleaner verified: trash text and watermarks accurately scrubbed');
}

async function testIntroChapterInTemplatesAndOpf() {
  const meta = {
    title: 'Huyền Thiên Ma Tôn',
    author: 'Cửu Nhược Thủy',
    description: 'Thiếu niên quật khởi từ nghịch cảnh, bước lên đỉnh phong thiên địa.',
    coverFilename: 'cover.jpg',
    novelUrl: 'https://giatocvuongtai.com/truyen/huyen-thien-ma-zon'
  };
  const chapters = [
    { chapterNumber: 1, title: 'Chương 1: Khởi đầu' },
    { chapterNumber: 2, title: 'Chương 2: Đột phá' }
  ];

  // 1. Intro chapter XHTML generation
  const introHtml = EpubTemplates.createIntroXhtml(meta, { chapterCount: 2 });
  assert.ok(introHtml.includes('Huyền Thiên Ma Tôn'), 'Title included in intro chapter');
  assert.ok(introHtml.includes('Cửu Nhược Thủy'), 'Author included in intro chapter');
  assert.ok(introHtml.includes('Thiếu niên quật khởi'), 'Description included in intro chapter');
  assert.ok(introHtml.includes('cover.jpg'), 'Cover image included in intro chapter');
  assert.ok(introHtml.includes('https://giatocvuongtai.com/truyen/huyen-thien-ma-zon'), 'Source URL included');

  // 2. OPF Manifest and Spine
  const opf = EpubTemplates.createContentOpf(meta, chapters, [], { includeIntroChapter: true });
  assert.ok(opf.includes('<dc:description>' + EpubTemplates.escapeXml(meta.description) + '</dc:description>'), 'Description saved in EPUB metadata');
  assert.ok(opf.includes('<item id="intro" href="chapters/intro.xhtml" media-type="application/xhtml+xml"/>'), 'Intro item in OPF manifest');
  assert.ok(opf.indexOf('<itemref idref="intro"/>') < opf.indexOf('<itemref idref="chapter_1"/>'), 'Intro chapter placed first in spine before Chapter 1');

  // 3. TOC NCX (EPUB 2)
  const ncx = EpubTemplates.createTocNcx(meta, chapters, { includeIntroChapter: true });
  assert.ok(ncx.includes('<text>Giới Thiệu Tác Phẩm</text>'), 'Intro in TOC NCX');
  assert.ok(ncx.includes('<content src="chapters/intro.xhtml"/>'), 'Intro link in TOC NCX');

  // 4. Nav XHTML (EPUB 3)
  const nav = EpubTemplates.createNavXhtml(meta, chapters, { includeIntroChapter: true });
  assert.ok(nav.includes('<a href="chapters/intro.xhtml">Giới Thiệu Tác Phẩm</a>'), 'Intro in EPUB 3 Nav XHTML');

  console.log('✓ Metadata in4 and Dedicated Intro Chapter verified in OPF, NCX, and Nav');
}

async function testEpubPackagingWithIntroAndRegex() {
  const meta = {
    title: 'Vạn Cổ Đệ Nhất Kiếm',
    author: 'Thanh Phong',
    description: 'Một kiếm đoạn thương khung, vạn giới quy nhất.',
    coverBlob: Buffer.from('FAKE_IMAGE_DATA')
  };
  const chapters = [
    { chapterNumber: 1, title: 'Chương 1', contentHtml: '<p>Chương 1 text. Reup by truyenxyz.</p>' }
  ];

  const epubBuffer = await EpubPacker.createEpub(meta, chapters, {
    includeIntroChapter: true,
    customRegexList: ['Reup by truyenxyz\\.']
  });

  assert.ok(epubBuffer, 'EPUB generated successfully');

  const JSZip = require('../libs/jszip.min.js');
  const zip = await JSZip.loadAsync(epubBuffer);

  assert.ok(zip.file('OEBPS/chapters/intro.xhtml'), 'intro.xhtml present in zip');
  assert.ok(zip.file('OEBPS/chapters/ch_1.xhtml'), 'ch_1.xhtml present in zip');
  assert.ok(zip.file('OEBPS/images/cover.jpg'), 'cover.jpg present in zip');

  const introText = await zip.file('OEBPS/chapters/intro.xhtml').async('string');
  assert.ok(introText.includes('Vạn Cổ Đệ Nhất Kiếm'), 'Title in intro chapter');
  assert.ok(introText.includes('Một kiếm đoạn thương khung'), 'Description in intro chapter');

  const ch1Text = await zip.file('OEBPS/chapters/ch_1.xhtml').async('string');
  assert.ok(!ch1Text.includes('Reup by truyenxyz'), 'Regex cleaned trash text from packaged chapter');

  console.log('✓ EpubPacker full integration verified: Intro chapter and custom regex clean packaged properly');
}

async function testInPlaceGraceRecheckWithoutReload() {
  const updateCalls = [];
  let scriptExecuteCount = 0;
  let inPlaceWaitNotified = false;

  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (fn, ms) => originalSetTimeout(fn, Math.min(ms, 20));

  global.chrome = {
    tabs: {
      create: async (props) => ({ id: 789, active: props.active }),
      update: async (tabId, props) => {
        updateCalls.push({ tabId, props });
        return { id: tabId, ...props };
      },
      onUpdated: { addListener: () => {}, removeListener: () => {} },
      onRemoved: { addListener: () => {}, removeListener: () => {} }
    },
    scripting: {
      executeScript: async () => {
        scriptExecuteCount++;
        if (!inPlaceWaitNotified) {
          return [{ result: { html: '<html><body>Loading...</body></html>', ready: false, url: 'https://giatocvuongtai.com/truyen/con-sen-ho-meo/chuong-34/' } }];
        }
        return [{
          result: {
            html: '<html><body><div class="reader-demo-body"><p>Chương 34: Bắt được rồi - Nội dung đã sẵn sàng sau 8 giây!</p></div></body></html>',
            ready: true,
            hasContent: true,
            url: 'https://giatocvuongtai.com/truyen/con-sen-ho-meo/chuong-34'
          }
        }];
      }
    }
  };

  try {
    const downloader = new TabDownloader({
      pageLoadWaitMs: 10,
      challengePollIntervalMs: 10,
      timeoutMs: 30,
      onInPlaceWait: ({ seconds, reason }) => {
        inPlaceWaitNotified = true;
        assert.equal(reason, 'recheck');
      }
    });

    await downloader.initialize();

    assert.ok(
      downloader._isSameOrRedirectedChapter(
        'https://giatocvuongtai.com/truyen/con-sen-ho-meo/chuong-34/',
        'https://giatocvuongtai.com/truyen/con-sen-ho-meo/chuong-34'
      ),
      'Trailing slash normalized and accepted as same chapter'
    );

    const resultHtml = await downloader.fetchChapter('https://giatocvuongtai.com/truyen/con-sen-ho-meo/chuong-34');

    assert.ok(resultHtml.includes('Chương 34: Bắt được rồi'), 'Content retrieved successfully via in-place grace check');
    assert.ok(inPlaceWaitNotified, 'onInPlaceWait was fired to notify UI');
    const reloads = updateCalls.filter(c => c.props.url && c.props.url.includes('chuong-34'));
    assert.equal(reloads.length, 1, 'Only initial navigation occurred; tab was NOT reloaded or reset');

    console.log('✓ In-Place 8-9s DOM Recovery verified: recovered without resetting page or reloading tab');
  } finally {
    global.setTimeout = originalSetTimeout;
  }
}

async function testActiveWorkersAndEtaFallbacks() {
  const progressReports = [];
  const engine = new CrawlEngine({
    onProgress: (p) => {
      progressReports.push(p);
    }
  });

  engine.activeProfile = { mode: 'tab', enableWpmDelay: false, delayMs: 2000 };
  const estSec = engine._estimateSecondsPerChapter();
  assert.ok(estSec >= 5, 'Estimate at least 5s in tab mode');

  engine.completed = [];
  engine.queue = [{}, {}, {}];
  engine.isRunning = true;
  engine.startTime = Date.now();
  engine._emitProgress();

  const latest = progressReports[progressReports.length - 1];
  assert.ok(latest.eta > 0, 'ETA is strictly positive even when 0 chapters completed (no --:--)');
  assert.equal(latest.activeWorkers, 0, 'activeWorkers is 0 when idle');

  let recheckCalled = false;
  let waitTicks = [];
  const recoveryEngine = new CrawlEngine({
    downloader: {
      initialize: async () => {},
      close: async () => {},
      recheckCurrentTabContent: async () => {
        recheckCalled = true;
        return '<div id="chapter-content"><p>Phục hồi thành công nội dung chương 34 sau 8s</p></div>';
      }
    },
    onWaitTick: (tick) => waitTicks.push(tick),
    onChapterComplete: async () => {}
  });

  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (fn, ms) => originalSetTimeout(fn, Math.min(ms, 10));

  try {
    await recoveryEngine.startCrawl({
      chapters: [{ id: 34, chapterNumber: 34, title: 'Chương 34', url: 'https://example.com/34' }],
      profile: { mode: 'tab' },
      parser: {
        fetchChapter: async () => {
          throw new Error('Trang chưa có nội dung chương hoặc đang ở sai địa chỉ.');
        },
        parseChapterContent: (html) => ({ contentHtml: html, title: 'Chương 34' })
      }
    });

    assert.ok(recheckCalled, 'recheckCurrentTabContent called to recover without page reload');
    assert.equal(recoveryEngine.completed.length, 1, 'Chapter 34 was successfully recovered and completed');
    assert.equal(recoveryEngine.failed.length, 0, 'Zero failed chapters after recovery');
    assert.ok(waitTicks.some(t => t.reason === 'recheck'), 'Wait ticks emitted for recheck countdown');

    console.log('✓ Active Workers and CrawlEngine In-Place Recovery verified');
  } finally {
    global.setTimeout = originalSetTimeout;
  }
}

async function testChapterSortingAndPlaceholderReordering() {
  const { EpubPacker } = require('../src/epub/epub-packer');
  const JSZip = require('../libs/jszip.min.js');

  // Case 1: Out of order chapters (e.g. #92 downloaded before #21, #39 before #36)
  const mixedChapters = [
    { chapterNumber: 92, title: 'Chương 92: Thăng chức tăng lương!', contentHtml: '<p>Nội dung 92</p>' },
    { chapterNumber: 21, title: 'Chương 21: Đột nhập', contentHtml: '<p>Nội dung 21</p>' },
    { chapterNumber: 39, title: 'Chương 39: Người trốn', contentHtml: '<p>Nội dung 39</p>' },
    { chapterNumber: 36, title: 'Chương 36: Phó bản kết thúc', contentHtml: '<p>Nội dung 36</p>' }
  ];

  const epubBlob = await EpubPacker.createEpub(
    { title: 'Truyện Test Thứ Tự', author: 'Tác Giả' },
    mixedChapters,
    { JSZip }
  );

  const zip = await JSZip.loadAsync(epubBlob);
  const opfText = await zip.file('OEBPS/content.opf').async('string');

  // Verify that spine order is strictly 21 -> 36 -> 39 -> 92
  const ch21Pos = opfText.indexOf('chapter_21'); // chapter 21 in spine
  const ch36Pos = opfText.indexOf('chapter_36');
  const ch39Pos = opfText.indexOf('chapter_39');
  const ch92Pos = opfText.indexOf('chapter_92');
  assert.ok(ch21Pos !== -1 && ch36Pos !== -1 && ch39Pos !== -1 && ch92Pos !== -1);
  assert.ok(ch21Pos < ch36Pos && ch36Pos < ch39Pos && ch39Pos < ch92Pos, 'Spine items strictly follow sorted chapter order');

  const ch21Doc = await zip.file('OEBPS/chapters/ch_21.xhtml').async('string');
  assert.ok(ch21Doc.includes('Chương 21'), 'First chapter in EPUB is chapter 21');
  const ch92Doc = await zip.file('OEBPS/chapters/ch_92.xhtml').async('string');
  assert.ok(ch92Doc.includes('Chương 92'), 'Last chapter in EPUB is chapter 92');

  // Case 2: Failed chapters #37 and #38 inserted as placeholders and reordered between 36 and 39
  const failedChapters = [
    { chapterNumber: 37, title: 'Chương 37: Câu mèo', error: 'Trang chưa có nội dung' },
    { chapterNumber: 38, title: 'Chương 38: Tuyển dụng', error: 'Trang chưa có nội dung' }
  ];

  const allWithPlaceholders = [...mixedChapters];
  failedChapters.forEach(f => {
    allWithPlaceholders.push({
      chapterNumber: f.chapterNumber,
      title: f.title,
      contentHtml: `<p>Chương lỗi: ${f.error}</p><p>pass</p>`,
      isPlaceholder: true
    });
  });

  const fullBlob = await EpubPacker.createEpub(
    { title: 'Truyện Test Placeholder', author: 'Tác Giả' },
    allWithPlaceholders,
    { JSZip }
  );

  const fullZip = await JSZip.loadAsync(fullBlob);
  const ncxText = await fullZip.file('OEBPS/toc.ncx').async('string');

  // In TOC NCX: order must be 21 -> 36 -> 37 -> 38 -> 39 -> 92
  const idx21 = ncxText.indexOf('Chương 21');
  const idx36 = ncxText.indexOf('Chương 36');
  const idx37 = ncxText.indexOf('Chương 37');
  const idx38 = ncxText.indexOf('Chương 38');
  const idx39 = ncxText.indexOf('Chương 39');
  const idx92 = ncxText.indexOf('Chương 92');

  assert.ok(idx21 < idx36 && idx36 < idx37 && idx37 < idx38 && idx38 < idx39 && idx39 < idx92,
    'Failed chapters #37 and #38 are properly ordered and placed between #36 and #39 in TOC NCX');

  console.log('✓ EpubPacker Chapter Sorting & Placeholder Reordering verified: 21 -> 36 -> 37 -> 38 -> 39 -> 92');
}

async function runAll() {
  console.log('=== Running User Enhancements & Features Regression Tests ===');
  await testBackgroundChaptersNoFocusSteal();
  await testPasswordProtectedChapterHandling();
  await testSplitEpubVolumes();
  await testInlineIllustrationImages();
  await testCustomRegexCleaner();
  await testIntroChapterInTemplatesAndOpf();
  await testEpubPackagingWithIntroAndRegex();
  await testInPlaceGraceRecheckWithoutReload();
  await testActiveWorkersAndEtaFallbacks();
  await testChapterSortingAndPlaceholderReordering();
  console.log('=== ALL USER ENHANCEMENT TESTS PASSED 100% ===\n');
}

runAll().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
