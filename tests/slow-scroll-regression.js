const assert = require('node:assert/strict');
const vm = require('node:vm');
const { TabDownloader } = require('../extension book/src/crawler/tab-downloader');
const { CrawlEngine } = require('../extension book/src/crawler/crawl-engine');

(async () => {
  const originalTimer = global.setTimeout;
  const originalNow = Date.now;
  let now = 0;
  const positions = [];
  const requests = [];
  const saves = [];
  Date.now = () => now;
  global.setTimeout = (callback, ms) => originalTimer(() => { now += ms; callback(); }, 0);
  try {
    const engine = new CrawlEngine({
      downloader: {
        initialize: async () => {},
        cleanup: async () => {},
        fetchChapter: async url => {
          requests.push({ url, time: now });
          return 'word '.repeat(2490);
        },
        scrollReadingProgress: async fraction => { positions.push({ fraction, time: now }); }
      },
      onChapterComplete: async ({ chapter }) => { saves.push({ number: chapter.chapterNumber, time: now }); }
    });
    await engine.startCrawl({
      chapters: [{ url: 'one', chapterNumber: 1 }, { url: 'two', chapterNumber: 2 }],
      profile: { mode: 'tab', enableWpmDelay: true, readingWpm: 600 }
    });
    assert.equal(saves[0].time, 0, 'Save first chapter before reading pause');
    assert.equal(requests[1].time, 249000, 'Scrolling and waiting share the same 249 seconds');
    assert.equal(positions[0].fraction, 0);
    assert.equal(positions.at(-1).fraction, 1);
    const middle = positions.find(position => position.time === 125000);
    assert.ok(Math.abs(middle.fraction - 125 / 249) < 0.00001);
    assert.equal(now, 249000, 'Final chapter does not add another pause');

    let scrollTop;
    const context = vm.createContext({
      document: { scrollingElement: { scrollHeight: 5000 } },
      window: { innerHeight: 1000, scrollTo: options => { scrollTop = options.top; } }
    });
    global.chrome = { scripting: { executeScript: async ({ func, args }) => {
      context.progress = args[0];
      vm.runInContext('(' + func.toString() + ')(progress)', context);
      return [];
    }}};
    const tab = new TabDownloader();
    tab.tabId = 1;
    await tab.scrollReadingProgress(0.5);
    assert.equal(scrollTop, 2000);
    await tab.scrollReadingProgress(1);
    assert.equal(scrollTop, 4000);
    console.log('PASS: content saved immediately, scroll matches 249-second wait, midpoint and bottom correct, no added scroll delay.');
  } finally {
    global.setTimeout = originalTimer;
    Date.now = originalNow;
    delete global.chrome;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
