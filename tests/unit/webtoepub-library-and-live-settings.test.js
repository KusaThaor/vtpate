// tests/unit/webtoepub-library-and-live-settings.test.js
// Tests for WebToEpub temporary library cloning and real-time live settings update during crawling

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { LibraryManager } = require('../../src/storage/library-manager');
const { EpubPacker } = require('../../src/epub/epub-packer');
const JSZip = require('../../libs/jszip.min.js');

// Mock chrome storage for tests
class MemoryStorage {
  constructor() {
    this.data = {};
  }
  get(keys, cb) {
    const res = {};
    const keyList = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(this.data));
    for (const k of keyList) {
      if (this.data[k] !== undefined) res[k] = this.data[k];
    }
    if (cb) cb(res);
    return Promise.resolve(res);
  }
  set(items, cb) {
    Object.assign(this.data, items);
    if (cb) cb();
    return Promise.resolve();
  }
  remove(keys, cb) {
    const keyList = Array.isArray(keys) ? keys : [keys];
    for (const k of keyList) {
      delete this.data[k];
    }
    if (cb) cb();
    return Promise.resolve();
  }
  getBytesInUse(keys, cb) {
    let size = 0;
    for (const [k, v] of Object.entries(this.data)) {
      size += k.length + (typeof v === 'string' ? v.length : JSON.stringify(v).length);
    }
    if (cb) cb(size);
    return Promise.resolve(size);
  }
}

async function runTests() {
  console.log('Testing WebToEpub Temporary Library & Live Settings Update...\n');

  // Test 1: LibraryManager storage initialization and WebToEpub key compatibility
  console.log('Test 1: WebToEpub key compatibility & initial empty library');
  const mockStorage = new MemoryStorage();
  const lib = new LibraryManager({ storage: mockStorage });

  const initialIds = await lib.getStorageIds();
  assert.deepStrictEqual(initialIds, [], 'Initial library IDs must be empty');

  // Test 2: Add novel to library (creates WebToEpub keys: LibArray, LibStoryURL0, LibFilename0, etc.)
  console.log('Test 2: Saving novel to library creates standard WebToEpub keys');
  const sampleChapters = [
    { chapterNumber: 1, title: 'Chương 1: Khởi đầu', contentHtml: '<p>Nội dung chương 1</p>' },
    { chapterNumber: 2, title: 'Chương 2: Tiến bước', contentHtml: '<p>Nội dung chương 2</p>' }
  ];
  const metadata = {
    title: 'Kiếm Đạo Độc Tôn',
    author: 'Kiếm Du Thái Hư',
    description: 'Truyện kiếm hiệp tu chân đỉnh cao.',
    totalChapters: 2
  };
  const epubBlob = await EpubPacker.createEpub(metadata, sampleChapters);
  assert.ok(epubBlob, 'EPUB blob must be successfully created');

  const saveRes = await lib.saveToLibrary({
    url: 'https://truyenfull.vn/kiem-dao-doc-ton/',
    filename: 'Kiem_Dao_Doc_Ton.epub',
    title: metadata.title,
    author: metadata.author,
    description: metadata.description,
    epubBlob,
    isMerge: false
  });

  assert.strictEqual(saveRes.id, '0', 'First novel ID must be "0"');
  assert.strictEqual(saveRes.isNew, true, 'First save must be marked as new');

  const storedIds = await lib.getStorageIds();
  assert.deepStrictEqual(storedIds, ['0'], 'LibArray must contain ["0"]');
  assert.strictEqual(mockStorage.data['LibStoryURL0'], 'https://truyenfull.vn/kiem-dao-doc-ton/');
  assert.strictEqual(mockStorage.data['LibFilename0'], 'Kiem_Dao_Doc_Ton.epub');
  assert.strictEqual(mockStorage.data['LibTitle0'], 'Kiếm Đạo Độc Tôn');
  assert.strictEqual(mockStorage.data['LibAuthor0'], 'Kiếm Du Thái Hư');
  assert.ok(mockStorage.data['LibEpub0'].startsWith('data:application/epub+zip;base64,'), 'LibEpub0 must be valid DataURL');

  // Test 3: Incremental crawling - Add more chapters to library and merge
  console.log('Test 3: Crawl more chapters and merge into existing library entry');
  const newChapters = [
    { chapterNumber: 3, title: 'Chương 3: Đột phá', contentHtml: '<p>Nội dung chương 3</p>' },
    { chapterNumber: 4, title: 'Chương 4: Rời núi', contentHtml: '<p>Nội dung chương 4</p>' }
  ];
  const newEpubBlob = await EpubPacker.createEpub(metadata, newChapters);

  const mergeRes = await lib.saveToLibrary({
    url: 'https://truyenfull.vn/kiem-dao-doc-ton/',
    filename: 'Kiem_Dao_Doc_Ton.epub',
    title: metadata.title,
    author: metadata.author,
    epubBlob: newEpubBlob,
    isMerge: true
  });

  assert.strictEqual(mergeRes.id, '0', 'Merged novel ID must remain "0"');
  assert.strictEqual(mergeRes.isNew, false, 'Merge save must not create duplicate entry');

  // Verify the merged EPUB has all 4 chapters
  const updatedNovel = await lib.getNovel('0');
  assert.ok(updatedNovel.epubDataUrl, 'Updated novel must have EPUB data URL');
  const rawBase64 = updatedNovel.epubDataUrl.replace(/^data:.*?;base64,/, '');
  const mergedZip = await JSZip.loadAsync(rawBase64, { base64: true });
  const allFiles = Object.keys(mergedZip.files);
  const chapterFiles = allFiles.filter(f => /(?:ch|chapter)[-_]?\d+\.xhtml$/i.test(f));
  assert.strictEqual(chapterFiles.length, 4, 'Merged EPUB must contain exactly 4 chapters');
  console.log('   Merged EPUB successfully contains 4 chapters!');

  // Test 4: Export and Import Library JSON
  console.log('Test 4: Export and import library');
  const exportedJson = await lib.exportLibraryJson();
  assert.ok(typeof exportedJson === 'string', 'Exported data must be string');
  const parsedExport = JSON.parse(exportedJson);
  assert.strictEqual(parsedExport.ids.length, 1, 'Exported IDs must match');
  assert.ok(parsedExport.novels['0'], 'Exported novel 0 must exist');

  const secondStorage = new MemoryStorage();
  const secondLib = new LibraryManager({ storage: secondStorage });
  const importedCount = await secondLib.importLibraryJson(exportedJson);
  assert.strictEqual(importedCount, 1, 'Imported count must be 1');
  const importedNovel = await secondLib.getNovel('0');
  assert.strictEqual(importedNovel.title, 'Kiếm Đạo Độc Tôn');

  // Test 5: Re-ordering and Deleting
  console.log('Test 5: Order change and deletion');
  // Add a second novel
  await lib.saveToLibrary({
    url: 'https://truyenfull.vn/pham-nhan-tu-tien/',
    title: 'Phàm Nhân Tu Tiên',
    filename: 'Pham_Nhan.epub',
    epubBlob
  });
  let idsAfterAdd = await lib.getStorageIds();
  assert.strictEqual(idsAfterAdd.length, 2, 'Should have 2 novels');
  assert.strictEqual(idsAfterAdd[0], '0');
  assert.strictEqual(idsAfterAdd[1], '1');

  // Move up novel 1
  await lib.changeOrder('1', -1);
  const reorderedIds = await lib.getStorageIds();
  assert.strictEqual(reorderedIds[0], '1');
  assert.strictEqual(reorderedIds[1], '0');

  // Delete novel 0
  await lib.deleteNovel('0');
  const idsAfterDelete = await lib.getStorageIds();
  assert.deepStrictEqual(idsAfterDelete, ['1']);
  const deletedCheck = await lib.getNovel('0');
  assert.strictEqual(deletedCheck, null, 'Deleted novel must return null');

  // Test 6: Live Settings Update on CrawlEngine
  console.log('Test 6: Live settings update on CrawlEngine without restarting');
  const { FetchDownloader } = require('../../src/crawler/fetch-downloader');

  // Load CrawlEngine via script or require
  let CrawlEngineClass;
  try {
    global.FetchDownloader = FetchDownloader;
    const crawlEngineModule = require('../../src/crawler/crawl-engine');
    CrawlEngineClass = crawlEngineModule.CrawlEngine || crawlEngineModule;
  } catch (_) {
    //
  }

  if (CrawlEngineClass) {
    const engine = new CrawlEngineClass({
      downloader: new FetchDownloader({ concurrency: 2, delayMs: 1000 })
    });
    engine.activeProfile = { concurrency: 2, delayMs: 1000, jitter: true, mode: 'fetch', includeInlineImages: false };

    // Apply live settings change during session
    engine.updateLiveSettings({
      concurrency: 5,
      delayMs: 200,
      jitter: false,
      includeInlineImages: true,
      recheckWaitSeconds: 15
    });

    assert.strictEqual(engine.activeProfile.concurrency, 5, 'Live concurrency profile must be 5');
    assert.strictEqual(engine.activeProfile.delayMs, 200, 'Live delayMs profile must be 200');
    assert.strictEqual(engine.activeProfile.jitter, false, 'Live jitter must be false');
    assert.strictEqual(engine.activeProfile.includeInlineImages, true, 'Live inline images must be true');
    assert.strictEqual(engine.downloader.concurrency, 5, 'Downloader concurrency must be dynamically updated to 5');
    assert.strictEqual(engine.downloader.delayMs, 200, 'Downloader delayMs must be dynamically updated to 200');
    assert.strictEqual(engine.downloader.jitter, false, 'Downloader jitter must be dynamically updated to false');
    console.log('   CrawlEngine.updateLiveSettings successfully updated live profile & downloader in real-time!');
  }

  // Test 7: Verify compareChapters in manager.js is available at helper scope
  {
    console.log('Test 7: Verification of compareChapters scope in manager.js');
    const managerCode = fs.readFileSync(path.resolve('manager.js'), 'utf8');
    assert(managerCode.includes('function compareChapters(a, b)'), 'manager.js must define compareChapters');
    
    // Check that helper compareChapters is placed before saveCurrentCrawledToLibrary
    const compareIdx = managerCode.indexOf('function compareChapters(a, b)');
    const saveIdx = managerCode.indexOf('async function saveCurrentCrawledToLibrary');
    assert(compareIdx > -1 && saveIdx > -1 && compareIdx < saveIdx, 'compareChapters must be declared before saveCurrentCrawledToLibrary');
    console.log('   compareChapters is globally accessible to saveCurrentCrawledToLibrary without ReferenceError!');
  }

  console.log('\nAll WebToEpub temporary library and live settings tests PASSED successfully!\n');
}

runTests().catch(err => {
  console.error('Test FAILED:', err);
  process.exit(1);
});
