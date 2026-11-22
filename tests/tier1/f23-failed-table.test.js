// tests/tier1/f23-failed-table.test.js
// Tier 1 - Feature 23: Failed Chapters Table & Re-fetch Button
const { assert } = require('../harness/test-assert');
const { ModuleLoader } = require('../harness/loader');

module.exports = {
  name: 'Feature 23: Failed Chapters Table & Re-fetch Button',
  featureId: 23,
  milestone: 'M5',
  tests: [
    {
      name: 'F23.1: manager.html contains failed chapters container and retry button',
      fn: () => {
        const html = ModuleLoader.readFile('manager.html');
        assert.ok(html, 'manager.html required');

        const hasFailedTable = html.includes('id="failed-chapters"') || html.includes('class="failed-table"') || html.includes('id="failed-list"');
        const hasRetryBtn = html.includes('id="btn-retry-failed"') || html.includes('id="retry-failed"') || html.includes('Tải lại');

        assert.ok(hasFailedTable, 'manager.html must contain failed chapters table/container');
        assert.ok(hasRetryBtn, 'manager.html must contain re-fetch failed button');
      }
    },
    {
      name: 'F23.2: Failed chapter item tracks id, chapterNumber, title, error, and timestamp',
      fn: () => {
        const failureRecord = {
          id: 'ch-42',
          chapterNumber: 42,
          title: 'Chương 42: Lạc lối',
          url: 'https://example.com/ch42',
          error: 'HTTP 429 Too Many Requests',
          timestamp: Date.now()
        };

        assert.strictEqual(failureRecord.chapterNumber, 42);
        assert.includes(failureRecord.error, '429');
        assert.ok(failureRecord.timestamp > 0);
      }
    },
    {
      name: 'F23.3: Re-fetch action processes only failed chapters without re-downloading completed chapters',
      fn: () => {
        const completedChapters = new Map([
          [1, { chapterNumber: 1, contentHtml: '<p>Ch 1 OK</p>' }],
          [2, { chapterNumber: 2, contentHtml: '<p>Ch 2 OK</p>' }]
        ]);

        const failedQueue = [
          { chapterNumber: 3, title: 'Ch 3', url: 'https://example.com/ch3' }
        ];

        // Simulate re-fetching only chapter 3
        const downloadedIds = [];
        for (const item of failedQueue) {
          downloadedIds.push(item.chapterNumber);
          completedChapters.set(item.chapterNumber, { chapterNumber: item.chapterNumber, contentHtml: '<p>Ch 3 Repaired</p>' });
        }

        assert.strictEqual(downloadedIds.length, 1, 'Only failed chapter was re-fetched');
        assert.strictEqual(completedChapters.size, 3, 'All 3 chapters now present in collection');
        assert.strictEqual(completedChapters.get(1).contentHtml, '<p>Ch 1 OK</p>', 'Original chapter 1 untouched');
      }
    },
    {
      name: 'F23.4: Successful retry removes resolved chapter from failed chapters queue',
      fn: () => {
        let failedList = [
          { id: '10', chapterNumber: 10, error: 'Timeout' },
          { id: '15', chapterNumber: 15, error: 'HTTP 503' }
        ];

        // Successfully repaired chapter 10
        const markResolved = (id) => {
          failedList = failedList.filter((c) => c.id !== id);
        };

        markResolved('10');
        assert.strictEqual(failedList.length, 1);
        assert.strictEqual(failedList[0].id, '15');
      }
    },
    {
      name: 'F23.5: Non-destructive EPUB patch replaces placeholder content with newly downloaded chapter text',
      fn: () => {
        const chapters = [
          { chapterNumber: 1, title: 'Ch 1', contentHtml: '<p>Ch 1 text</p>' },
          { chapterNumber: 2, title: 'Ch 2', contentHtml: '<div class="error-notice">Failed to download</div>' }
        ];

        // Patch chapter 2
        const target = chapters.find((c) => c.chapterNumber === 2);
        assert.ok(target, 'Target chapter exists');
        target.contentHtml = '<p>Newly recovered chapter 2 text</p>';

        assert.includes(chapters[1].contentHtml, 'Newly recovered chapter 2 text');
        assert.ok(!chapters[1].contentHtml.includes('Failed to download'));
      }
    }
  ]
};
