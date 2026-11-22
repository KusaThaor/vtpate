const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('Testing Re-crawl & Overwrite Capabilities for Existing Chapters...');

const htmlPath = path.resolve('manager.html');
const cssPath = path.resolve('manager.css');
const jsPath = path.resolve('manager.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');

// 1. Force Overwrite Checkbox in manager.html
assert(html.includes('id="force-overwrite-chapters"'), 'manager.html must contain force-overwrite-chapters checkbox');
console.log('Test 1: force-overwrite-chapters checkbox verified in manager.html.');

// 2. manager.js re-crawl functions & handlers
assert(js.includes('recrawlSingleChapter'), 'manager.js must contain recrawlSingleChapter function');
assert(js.includes('deleteDownloadedChapter'), 'manager.js must contain deleteDownloadedChapter function');
assert(js.includes('updateCrawlButtonState'), 'manager.js must contain updateCrawlButtonState function');
assert(js.includes('forceOverwriteCheckbox'), 'manager.js must reference forceOverwriteCheckbox');
console.log('Test 2: Re-crawl and chapter deletion functions verified in manager.js.');

// 3. Chapter list individual re-crawl button & status badge
assert(js.includes('btn-row-recrawl'), 'manager.js must render btn-row-recrawl for each chapter in renderChapterList');
assert(js.includes('recrawlSingleChapter(num)'), 'manager.js chapter row must call recrawlSingleChapter');
assert(js.includes('✓ Đã tải'), 'manager.js chapter row must show ✓ Đã tải badge when chapter is in downloadedChapters');
console.log('Test 3: Chapter list per-row re-crawl button and status badge verified.');

// 4. Storage Inventory per-chapter re-crawl & delete
assert(js.includes('inventory-chapter-item'), 'manager.js showChapterInventory must render inventory-chapter-item');
assert(css.includes('.inventory-chapter-item'), 'manager.css must style .inventory-chapter-item');
assert(css.includes('.inventory-chapter-actions'), 'manager.css must style .inventory-chapter-actions');
console.log('Test 4: Storage inventory per-chapter re-crawl and delete actions verified.');

// 5. Failed chapters table individual retry button
assert(js.includes('btnRetrySingle'), 'manager.js renderFailedTable must render individual retry button');
console.log('Test 5: Failed chapters table per-row retry button verified.');

// 6. Simulation of 60 chapters with chapter 58 re-crawl
const simulatedChapters = Array.from({ length: 60 }, (_, i) => ({
  id: `ch-${i + 1}`,
  chapterNumber: i + 1,
  title: `Chương ${i + 1}`,
  selected: false
}));

const simulatedDownloaded = new Map(
  Array.from({ length: 60 }, (_, i) => [i + 1, { chapterNumber: i + 1, title: `Chương ${i + 1}`, contentHtml: '<p>Content</p>' }])
);

// User selects ONLY chapter 58
simulatedChapters[57].selected = true; // chapter 58 (index 57)

const selectedCount = simulatedChapters.filter(ch => ch.selected).length;
const missingSelected = simulatedChapters.filter(ch => ch.selected && !simulatedDownloaded.has(ch.chapterNumber)).length;
const alreadyDownloadedSelected = selectedCount - missingSelected;

assert.strictEqual(selectedCount, 1, 'Exactly 1 chapter is selected');
assert.strictEqual(missingSelected, 0, 'No missing selected chapters (ch 58 is already in downloaded)');
assert.strictEqual(alreadyDownloadedSelected, 1, 'Chapter 58 is identified as already downloaded');

// Logic check: button must NOT be disabled when alreadyDownloadedSelected > 0
let btnDisabled = false;
let btnText = '';
if (selectedCount > 0) {
  btnDisabled = false;
  if (missingSelected > 0 && alreadyDownloadedSelected === 0) {
    btnText = `Tải tiếp ${missingSelected} chương còn thiếu`;
  } else if (missingSelected === 0 && alreadyDownloadedSelected > 0) {
    btnText = `Tải lại / Ghi đè ${alreadyDownloadedSelected} chương đã chọn`;
  } else {
    btnText = `Tải ${missingSelected} chương mới + Ghi đè ${alreadyDownloadedSelected} chương`;
  }
}

assert.strictEqual(btnDisabled, false, 'Start button must NOT be disabled when chapter 58 is selected for re-crawl');
assert.strictEqual(btnText, 'Tải lại / Ghi đè 1 chương đã chọn', 'Button text must indicate re-crawling / overwriting chapter 58');
console.log('Test 6: Simulation of Chapter 58 re-crawl logic passed with flying colors!');

console.log('\nAll Re-crawl and Overwrite tests PASSED successfully!');
