// Unit test for chapter STT deduplication and mismatch protection
const assert = require('assert');
const path = require('path');
const { GenericParser } = require('../../src/parsers/generic-parser');

function runDedupAlgorithm(downloadedChaptersMap, failedChaptersList = [], chaptersList = []) {
  function extractActualNum(item) {
    if (!item) return null;
    const title = String(item.title || '');
    const mTitle = title.match(/(?:chương|chuong|chapter|chap|c\.)\s*(\d+(?:\.\d+)?)/i);
    if (mTitle) return parseFloat(mTitle[1]);

    const html = String(item.contentHtml || '');
    const mHeading = html.match(/<(?:h[1-4]|div|p|span|button)[^>]*>(?:[^<]*?)(?:chương|chuong|chapter|chap|c\.)\s*(\d+(?:\.\d+)?)/i);
    if (mHeading) return parseFloat(mHeading[1]);

    const mPrefix = title.match(/^\s*(\d+(?:\.\d+)?)\s*[:\.\-–—\s]/);
    if (mPrefix) return parseFloat(mPrefix[1]);

    return null;
  }

  const allEntries = [];
  for (const [key, item] of downloadedChaptersMap.entries()) {
    const slotKey = Number(key);
    const titleKey = (item.title || '').trim().toLowerCase();
    const cleanText = (item.contentHtml || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const snippet = cleanText.slice(0, 300);
    const actualNum = extractActualNum(item);

    allEntries.push({ key, slotKey, item, titleKey, snippet, cleanText, actualNum });
  }

  const groups = new Map();
  const assignedGroup = new Map();
  let nextGroupId = 1;

  for (let i = 0; i < allEntries.length; i++) {
    const e1 = allEntries[i];
    if (!assignedGroup.has(e1)) {
      const gid = nextGroupId++;
      assignedGroup.set(e1, gid);
      groups.set(gid, [e1]);

      for (let j = i + 1; j < allEntries.length; j++) {
        const e2 = allEntries[j];
        if (assignedGroup.has(e2)) continue;

        const sameSnippet = e1.snippet.length >= 60 && e2.snippet.length >= 60 && e1.snippet === e2.snippet;
        const sameTitle = e1.titleKey.length >= 10 && e2.titleKey.length >= 10 && e1.titleKey === e2.titleKey;

        if (sameSnippet || sameTitle) {
          assignedGroup.set(e2, gid);
          groups.get(gid).push(e2);
        }
      }
    }
  }

  const duplicateChaps = [];
  const movedChaps = [];

  for (const [gid, members] of groups.entries()) {
    if (members.length <= 1) continue;

    let keeper = members.find(m => m.actualNum !== null && m.slotKey === m.actualNum);

    if (!keeper) {
      keeper = members.reduce((best, cur) => {
        if (!best) return cur;
        if (cur.actualNum !== null && best.actualNum !== null) {
          const diffCur = Math.abs(cur.slotKey - cur.actualNum);
          const diffBest = Math.abs(best.slotKey - best.actualNum);
          if (diffCur < diffBest) return cur;
        }
        return cur.slotKey < best.slotKey ? cur : best;
      }, null);
    }

    for (const m of members) {
      if (m === keeper) continue;
      duplicateChaps.push({
        dupKey: m.key,
        origKey: keeper.key,
        title: m.item.title,
        actualNum: m.actualNum,
        reason: m.actualNum !== null && m.actualNum !== m.slotKey
          ? `STT #${m.key} nhưng nội dung thực tế là Chương ${m.actualNum} (trùng với STT #${keeper.key})`
          : `Nội dung trùng lặp hoàn toàn với STT #${keeper.key}`
      });
    }
  }

  const handledDupKeys = new Set(duplicateChaps.map(d => String(d.dupKey)));
  for (const e of allEntries) {
    if (handledDupKeys.has(String(e.key))) continue;

    if (e.actualNum !== null && e.actualNum !== e.slotKey) {
      const targetSlotExists = downloadedChaptersMap.has(e.actualNum);
      if (targetSlotExists) {
        duplicateChaps.push({
          dupKey: e.key,
          origKey: e.actualNum,
          title: e.item.title,
          actualNum: e.actualNum,
          reason: `STT #${e.key} nhưng nội dung là Chương ${e.actualNum} (STT #${e.actualNum} đã có dữ liệu)`
        });
      } else {
        movedChaps.push({
          fromKey: e.key,
          toKey: e.actualNum,
          item: e.item,
          actualNum: e.actualNum
        });
      }
    }
  }

  // Execute moves
  for (const m of movedChaps) {
    downloadedChaptersMap.delete(m.fromKey);
    const itemCopy = { ...m.item, chapterNumber: m.toKey, id: `ch-${m.toKey}` };
    downloadedChaptersMap.set(m.toKey, itemCopy);

    if (!failedChaptersList.some(f => (f.chapterNumber ?? f.id) == m.fromKey)) {
      const orig = chaptersList.find(c => (c.chapterNumber ?? c.id) == m.fromKey);
      failedChaptersList.push({
        id: orig?.id || m.fromKey,
        chapterNumber: m.fromKey,
        title: orig?.title || `Chương ${m.fromKey}`,
        url: orig?.url || '',
        error: `Nội dung trước đây bị lấy nhầm của Chương #${m.toKey}. Đã chuyển dữ liệu sang STT #${m.toKey} và chờ tải lại đúng Chương #${m.fromKey}.`,
        attempts: 1,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Execute duplicate removals
  for (const d of duplicateChaps) {
    const item = downloadedChaptersMap.get(d.dupKey);
    downloadedChaptersMap.delete(d.dupKey);
    if (!failedChaptersList.some(f => (f.chapterNumber ?? f.id) == d.dupKey)) {
      const orig = chaptersList.find(c => (c.chapterNumber ?? c.id) == d.dupKey);
      failedChaptersList.push({
        id: orig?.id || item?.id || d.dupKey,
        chapterNumber: d.dupKey,
        title: orig?.title || item?.title || `Chương ${d.dupKey}`,
        url: orig?.url || item?.url || '',
        error: d.reason || `Nội dung bị trùng lặp với Chương #${d.origKey}. Đã lọc bỏ để tải lại.`,
        attempts: 1,
        timestamp: new Date().toISOString()
      });
    }
  }

  return { duplicateChaps, movedChaps };
}

async function runAll() {
  console.log('=== Running Chapter STT Dedup & Mismatch Tests ===');

  // TEST 1: User's Case where #58 has Chapter 59 content and #59 has Chapter 59 content
  {
    const dlMap = new Map();
    dlMap.set(57, {
      chapterNumber: 57,
      title: 'Chương 57Tôi chính là số 29 - "Số 29, mau giao hòn đá ra đây, nếu không..."',
      contentHtml: '<p>Nội dung chi tiết của chương 57 không trùng ai cả...</p>'
    });
    dlMap.set(58, {
      chapterNumber: 58,
      title: 'Chương 59Khống chế thất bại - "Cái tên nhóm F kia, đừng chạy!"',
      contentHtml: '<p>Nội dung chi tiết của chương 59 bị gán nhầm vào slot 58 dài hơn 60 ký tự...</p>'
    });
    dlMap.set(59, {
      chapterNumber: 59,
      title: 'Chương 59Khống chế thất bại - "Cái tên nhóm F kia, đừng chạy!"',
      contentHtml: '<p>Nội dung chi tiết của chương 59 bị gán nhầm vào slot 58 dài hơn 60 ký tự...</p>'
    });

    const failedList = [];
    const { duplicateChaps } = runDedupAlgorithm(dlMap, failedList);

    assert.strictEqual(duplicateChaps.length, 1, 'Should find exactly 1 duplicate');
    assert.strictEqual(duplicateChaps[0].dupKey, 58, 'Duplicate must be #58, NOT #59!');
    assert.strictEqual(duplicateChaps[0].origKey, 59, 'Original keeper must be #59!');
    assert.ok(dlMap.has(57), 'Slot #57 must be kept');
    assert.ok(!dlMap.has(58), 'Slot #58 must be deleted from downloaded map');
    assert.ok(dlMap.has(59), 'Slot #59 must be kept in downloaded map');
    assert.strictEqual(failedList.length, 1, 'Slot #58 must be placed into failed list');
    assert.strictEqual(failedList[0].chapterNumber, 58, 'Failed item must be chapter 58');

    console.log('✓ TEST 1 PASSED: Slot #58 with Chapter 59 content correctly removed, Slot #59 correctly preserved!');
  }

  // TEST 2: User's Case where #59 is empty and #58 has Chapter 59 content
  {
    const dlMap = new Map();
    dlMap.set(57, {
      chapterNumber: 57,
      title: 'Chương 57Tôi chính là số 29',
      contentHtml: '<p>Nội dung chương 57...</p>'
    });
    dlMap.set(58, {
      chapterNumber: 58,
      title: 'Chương 59Khống chế thất bại - "Cái tên nhóm F kia, đừng chạy!"',
      contentHtml: '<p>Nội dung chi tiết của chương 59 bị gán nhầm vào slot 58 dài hơn 60 ký tự...</p>'
    });

    const failedList = [];
    const { movedChaps } = runDedupAlgorithm(dlMap, failedList);

    assert.strictEqual(movedChaps.length, 1, 'Should move 1 chapter');
    assert.strictEqual(movedChaps[0].fromKey, 58, 'Moved from slot 58');
    assert.strictEqual(movedChaps[0].toKey, 59, 'Moved to correct slot 59');
    assert.ok(!dlMap.has(58), 'Slot 58 is freed');
    assert.ok(dlMap.has(59), 'Slot 59 now holds Chapter 59 content');
    assert.strictEqual(dlMap.get(59).chapterNumber, 59);
    assert.strictEqual(failedList.length, 1, 'Slot 58 moved to failed list to re-download');
    assert.strictEqual(failedList[0].chapterNumber, 58);

    console.log('✓ TEST 2 PASSED: Slot #58 with Chapter 59 content correctly moved to slot #59, slot #58 queued for retry!');
  }

  // TEST 3: GenericParser Throws Chapter Number Mismatch
  {
    const parser = new GenericParser({
      customSelectors: {
        chapterTitle: 'h2.reader-demo-chapter-heading',
        chapterContent: 'div.reader-demo-body'
      }
    });
    const mockDownloader = {
      fetchChapter: async () => `
        <html>
          <head><title>Chương 59: Khống chế thất bại</title></head>
          <body>
            <h2 class="reader-demo-chapter-heading">Chương 59: Khống chế thất bại</h2>
            <div class="reader-demo-body"><p>Nội dung chương 59...</p></div>
          </body>
        </html>
      `
    };

    let threw = false;
    try {
      // Request chapter 58, but page has Chapter 59
      await parser.fetchChapter({
        id: 'ch-58',
        chapterNumber: 58,
        title: 'Chương 58: Tiêu đề chương 58',
        url: 'https://giatocvuongtai.com/reader/?chapter=58'
      }, mockDownloader);
    } catch (err) {
      threw = true;
      assert.ok(err.message.includes('Lệch số chương'), `Error message should mention chapter mismatch: ${err.message}`);
      assert.ok(err.message.includes('58'), 'Error message should mention requested chapter 58');
      assert.ok(err.message.includes('59'), 'Error message should mention page chapter 59');
    }
    assert.ok(threw, 'GenericParser MUST throw an error when page chapter number does not match requested chapter number');
    console.log('✓ TEST 3 PASSED: GenericParser rejects chapter mismatch and protects downloaded chapters!');
  }

  console.log('=== ALL CHAPTER STT DEDUP & MISMATCH TESTS PASSED 100% ===');
}

runAll().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
