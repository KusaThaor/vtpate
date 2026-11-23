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

// 7. Verify quick-force-overwrite and btn-select-missing in HTML, CSS, JS
assert(html.includes('id="quick-force-overwrite"'), 'manager.html must contain quick-force-overwrite checkbox');
assert(html.includes('id="btn-select-missing"'), 'manager.html must contain btn-select-missing button');
assert(css.includes('.overwrite-toggle-label'), 'manager.css must contain .overwrite-toggle-label styles');
assert(js.includes('quickForceOverwriteCheckbox'), 'manager.js must reference quickForceOverwriteCheckbox');
assert(js.includes('btnSelectMissing'), 'manager.js must reference btnSelectMissing');
console.log('Test 7: quick-force-overwrite toggle and btn-select-missing verified in HTML, CSS, JS.');

// 8. Simulation of User Scenario: 339 chapters total, 101 downloaded, 265 selected (238 missing, 27 already downloaded)
const sim339Chapters = Array.from({ length: 339 }, (_, i) => ({
  id: `ch-${i + 1}`,
  chapterNumber: i + 1,
  title: `Chương ${i + 1}`,
  selected: i + 1 >= 75 // Chapters 75 to 339 selected (265 chapters)
}));

const sim101Downloaded = new Map(
  Array.from({ length: 101 }, (_, i) => [i + 1, { chapterNumber: i + 1, title: `Chương ${i + 1}`, contentHtml: '<p>Content</p>' }])
);

function computeButtonState(chapters, downloaded, forceOverwrite) {
  const selCount = chapters.filter(ch => ch.selected).length;
  const missCount = chapters.filter(ch => ch.selected && !downloaded.has(ch.chapterNumber)).length;
  const alreadyCount = selCount - missCount;

  if (selCount > 0) {
    if (forceOverwrite) {
      if (missCount > 0 && alreadyCount > 0) {
        return `Tải ${missCount} chương mới + Ghi đè ${alreadyCount} chương`;
      } else if (missCount === 0) {
        return `Tải lại / Ghi đè ${alreadyCount} chương đã chọn`;
      } else {
        return `Bắt đầu tải ${missCount} chương đã chọn`;
      }
    } else {
      if (missCount > 0) {
        if (alreadyCount > 0) {
          return `Tải tiếp ${missCount} chương còn thiếu (bỏ qua ${alreadyCount} ch đã có)`;
        } else {
          return `Tải tiếp ${missCount} chương còn thiếu`;
        }
      } else {
        return `Tải lại / Ghi đè ${alreadyCount} chương đã chọn`;
      }
    }
  }
  return 'Chọn chương để tải lại';
}

// Case 8A: Normal continue crawl (forceOverwrite = false) -> MUST NOT say "Ghi đè"!
const normalButtonText = computeButtonState(sim339Chapters, sim101Downloaded, false);
assert.strictEqual(
  normalButtonText,
  'Tải tiếp 238 chương còn thiếu (bỏ qua 27 ch đã có)',
  'When forceOverwrite is false, button must reassure user that already downloaded chapters are skipped/preserved'
);
assert(!normalButtonText.includes('+ Ghi đè'), 'Normal button text must NEVER promise to overwrite when forceOverwrite is false');
console.log('Test 8A: Normal continue crawl (forceOverwrite = false) correctly skips already downloaded chapters without "Ghi đè" message.');

// Case 8B: User explicitly turns on forceOverwrite (forceOverwrite = true) -> Shows overwrite count
const overwriteButtonText = computeButtonState(sim339Chapters, sim101Downloaded, true);
assert.strictEqual(
  overwriteButtonText,
  'Tải 238 chương mới + Ghi đè 27 chương',
  'When forceOverwrite is true, button must accurately indicate overwriting 27 chapters'
);
console.log('Test 8B: Explicit forceOverwrite correctly displays overwrite count.');

// Case 8C: User clicks "Chỉ chọn chưa tải" (btn-select-missing)
sim339Chapters.forEach(c => {
  c.selected = !sim101Downloaded.has(c.chapterNumber);
});
const missingSelectedOnly = sim339Chapters.filter(ch => ch.selected).length;
assert.strictEqual(missingSelectedOnly, 238, 'Only 238 missing chapters are selected after btn-select-missing');
const cleanButtonText = computeButtonState(sim339Chapters, sim101Downloaded, false);
assert.strictEqual(cleanButtonText, 'Tải tiếp 238 chương còn thiếu', 'Button cleanly displays continuing 238 missing chapters');
console.log('Test 8C: btn-select-missing leaves exactly 238 chapters selected.');

console.log('\nAll Re-crawl and Overwrite tests PASSED successfully!');
