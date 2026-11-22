const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { CrawlEngine } = require('../extension book/src/crawler/crawl-engine');
const { SessionManager } = require('../extension book/src/storage/session-manager');

async function checkClock() {
  const original = { now: Date.now, setTimeout, clearTimeout };
  let now = 0;
  let timers = [];
  Date.now = () => now;
  global.setTimeout = (fn, ms) => {
    const timer = { fn, ms };
    timers.push(timer);
    return timer;
  };
  global.clearTimeout = timer => { timers = timers.filter(item => item !== timer); };
  const flush = async () => { for (let n = 0; n < 6; n++) await Promise.resolve(); };
  try {
    let notices = 0;
    const engine = new CrawlEngine({ onProgress: () => notices++ });
    engine.queue = [{}];
    const profile = { enableWpmDelay: true, readingWpm: 600 };
    const content = { contentHtml: 'word '.repeat(4920) };
    let done = false;
    const wait = engine._waitBetweenChapters(content, profile, 1).then(() => { done = true; });
    now = 100000;
    engine.pause();
    await flush();
    now = 900000;
    assert.equal(done, false);
    engine.resume();
    await flush();
    assert.equal(engine._waitDeadline, 1292000);
    now = 1292000;
    timers[0].fn();
    await wait;
    assert.equal(notices, 1);
    assert.equal(timers.length, 0);

    now = 0;
    const backgroundWait = engine._waitBetweenChapters(content, profile, 1);
    now = 600000;
    timers[0].fn();
    await backgroundWait;
    assert.equal(timers.length, 0);

    const cancelWait = engine._waitBetweenChapters(content, profile, 1);
    engine.pause();
    await flush();
    engine.cancel();
    await cancelWait;
    assert.equal(timers.length, 0);
  } finally {
    Date.now = original.now;
    global.setTimeout = original.setTimeout;
    global.clearTimeout = original.clearTimeout;
  }
}

async function checkStopAndSave() {
  const session = new SessionManager();
  let engine;
  let requests = 0;
  let writes = 0;
  engine = new CrawlEngine({
    downloader: {
      initialize: async () => {},
      fetchChapter: async () => {
        requests++;
        engine.cancel();
        return '<p>Nội dung đã tải</p>';
      },
      cleanup: async () => {}
    },
    onChapterComplete: async ({ result }) => {
      await new Promise(resolve => setTimeout(resolve, 5));
      await session.saveCheckpoint({ downloadedChapters: [result] });
      writes++;
    }
  });
  await engine.startCrawl({
    chapters: [{ chapterNumber: 1, url: 'first' }, { chapterNumber: 2, url: 'second' }],
    profile: { mode: 'tab', enableWpmDelay: true }
  });
  assert.equal(requests, 1);
  assert.equal(writes, 1);
  assert.equal((await session.getCheckpoint()).downloadedChapters[0].contentHtml, '<p>Nội dung đã tải</p>');
  assert.equal(engine.isRunning, false);
}

async function checkSerializedCheckpointWrites() {
  const source = fs.readFileSync('extension book/manager.js', 'utf8');
  const begin = source.indexOf('  let checkpointWrites = Promise.resolve();');
  const end = source.indexOf('  async function saveManualCheckpoint()', begin);
  let stored;
  const state = {
    currentUrl: 'https://example.com/story',
    chapters: [{ selected: true, chapterNumber: 1 }, { selected: true, chapterNumber: 2 }],
    downloadedChapters: new Map(),
    failedChapters: [],
    sessionManager: { saveCheckpoint: async payload => {
      await new Promise(resolve => setTimeout(resolve, payload.completedIndices.length === 1 ? 10 : 0));
      stored = payload;
      return true;
    }}
  };
  const context = vm.createContext({ state, inputNovelUrl: null, appendLog: () => {},
    novelTitleInput: null, novelAuthorInput: null, novelDescInput: null,
    getCrawlProfile: () => ({}), setSaveStatus: () => {}, handleCheckpointFailure: () => {} });
  vm.runInContext(source.slice(begin, end), context);
  state.downloadedChapters.set(1, { chapterNumber: 1, contentHtml: 'one' });
  const first = context.persistCrawlCheckpoint('crawling');
  state.downloadedChapters.set(2, { chapterNumber: 2, contentHtml: 'two' });
  const second = context.persistCrawlCheckpoint('stopped');
  await Promise.all([first, second]);
  assert.equal(stored.downloadedChapters.length, 2);
  assert.equal(stored.status, 'stopped');
  assert.equal(stored.pendingIndices.length, 0);
}

(async () => {
  await checkClock();
  await checkStopAndSave();
  await checkSerializedCheckpointWrites();
  console.log('PASS: 492-second wait, pause/resume, background delay, cancel, in-flight save, serialized checkpoint writes.');
})().catch(error => { console.error(error); process.exitCode = 1; });
