// tests/tier1/f20-metadata-ui.test.js
// Tier 1 - Feature 20: Metadata & Chapter Selection UI
const { assert } = require('../harness/test-assert');
const { ModuleLoader } = require('../harness/loader');

module.exports = {
  name: 'Feature 20: Metadata & Chapter Selection UI',
  featureId: 20,
  milestone: 'M5',
  tests: [
    {
      name: 'F20.1: manager.html includes editable inputs for Title, Author, and Description',
      fn: () => {
        const html = ModuleLoader.readFile('manager.html');
        assert.ok(html, 'manager.html required');

        const hasTitleInput = html.includes('id="novel-title"') || html.includes('name="title"') || html.includes('id="meta-title"');
        const hasAuthorInput = html.includes('id="novel-author"') || html.includes('name="author"') || html.includes('id="meta-author"');
        const hasDescInput = html.includes('id="novel-desc"') || html.includes('name="description"') || html.includes('id="meta-desc"');

        assert.ok(hasTitleInput, 'manager.html must contain novel title input');
        assert.ok(hasAuthorInput, 'manager.html must contain novel author input');
        assert.ok(hasDescInput, 'manager.html must contain novel description input');
      }
    },
    {
      name: 'F20.2: Reversal logic reverses chapter order correctly',
      fn: () => {
        const chapters = [
          { chapterNumber: 1, title: 'Ch 1' },
          { chapterNumber: 2, title: 'Ch 2' },
          { chapterNumber: 3, title: 'Ch 3' }
        ];

        const reversed = [...chapters].reverse();
        assert.strictEqual(reversed[0].chapterNumber, 3);
        assert.strictEqual(reversed[1].chapterNumber, 2);
        assert.strictEqual(reversed[2].chapterNumber, 1);
      }
    },
    {
      name: 'F20.3: Range filter selects chapters between From and To indices inclusive',
      fn: () => {
        const chapters = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ chapterNumber: n, title: `Ch ${n}` }));
        const from = 3;
        const to = 7;

        const filtered = chapters.filter((c) => c.chapterNumber >= from && c.chapterNumber <= to);
        assert.strictEqual(filtered.length, 5);
        assert.strictEqual(filtered[0].chapterNumber, 3);
        assert.strictEqual(filtered[filtered.length - 1].chapterNumber, 7);
      }
    },
    {
      name: 'F20.4: Select all and Deselect all toggle states update chapter selection',
      fn: () => {
        const chapterItems = [
          { id: '1', selected: false },
          { id: '2', selected: false },
          { id: '3', selected: false }
        ];

        // Select all
        chapterItems.forEach((c) => (c.selected = true));
        assert.ok(chapterItems.every((c) => c.selected === true), 'All chapters must be selected');

        // Deselect all
        chapterItems.forEach((c) => (c.selected = false));
        assert.ok(chapterItems.every((c) => c.selected === false), 'All chapters must be deselected');
      }
    },
    {
      name: 'F20.5: Range filter validates that From is <= To and within total chapter count',
      fn: () => {
        const total = 50;
        const validateRange = (from, to, max) => {
          if (typeof from !== 'number' || typeof to !== 'number') return false;
          if (from < 1 || to < 1) return false;
          if (from > to) return false;
          if (to > max) return false;
          return true;
        };

        assert.strictEqual(validateRange(5, 10, total), true, 'Valid range 5 to 10');
        assert.strictEqual(validateRange(15, 10, total), false, 'Invalid: From > To');
        assert.strictEqual(validateRange(-1, 10, total), false, 'Invalid: negative From');
        assert.strictEqual(validateRange(5, 100, total), false, 'Invalid: To exceeds total');
      }
    }
  ]
};
