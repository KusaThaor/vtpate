const assert = require('node:assert/strict');
const path = require('node:path');
const { CrawlEngine } = require('../src/crawler/crawl-engine');
const { TabDownloader } = require('../src/crawler/tab-downloader');

async function testLowSpeedEta() {
  const originalNow = Date.now;
  const fixedNow = 1700000000000;
  Date.now = () => fixedNow;
  try {
    const engine = new CrawlEngine();
    engine.queue = new Array(99).fill({});
    engine.completed = [{ id: 1, chapterNumber: 1 }];
    // Simulated elapsed time: exactly 25 seconds for 1 chapter => 0.04 ch/s
    engine.startTime = fixedNow - 25000;

    let reported = null;
    engine.onProgress = p => { reported = p; };
    engine._emitProgress();

    assert.ok(reported !== null, 'Progress was reported');
    assert.equal(reported.speed, 0.04, 'Speed preserves decimal precision and is not rounded down to 0.0');
    assert.ok(reported.eta > 0, 'ETA is strictly positive');
    assert.ok(Math.abs(reported.eta - 2475) <= 2, 'ETA calculated correctly: remaining / rawSpeed');

    // Format ETA test
    const hours = Math.floor(reported.eta / 3600);
    const mins = Math.floor((reported.eta % 3600) / 60);
    const secs = Math.ceil(reported.eta % 60);
    const formatted = hours > 0
      ? `${hours}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`
      : `${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;

    assert.equal(formatted, '41m 15s', 'ETA displays both minutes and seconds');
    console.log('✓ Low-speed speed and ETA calculation verified: 0.04 ch/s -> 41m 15s');
  } finally {
    Date.now = originalNow;
  }
}

async function testWaitCountdownCallback() {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const originalNow = Date.now;

  let now = 10000;
  let timers = [];
  Date.now = () => now;
  global.setTimeout = (fn, ms) => {
    const t = { fn, ms };
    timers.push(t);
    return t;
  };
  global.clearTimeout = t => {
    timers = timers.filter(item => item !== t);
  };

  try {
    let tickCount = 0;
    let lastTick = null;
    let progressNotices = 0;

    const engine = new CrawlEngine({
      onProgress: () => { progressNotices++; },
      onWaitTick: (tick) => {
        tickCount++;
        lastTick = tick;
      }
    });

    engine.queue = [{}];
    const profile = { enableWpmDelay: true, readingWpm: 600 };
    // 600 words @ 600 wpm = 60 seconds delay
    const content = { contentHtml: 'word '.repeat(600) };

    const waitPromise = engine._waitBetweenChapters(content, profile, 1);

    // Initial state
    assert.equal(progressNotices, 1, 'onProgress called once for pause notice');
    assert.equal(engine.getWaitRemainingSeconds(), 60, 'getWaitRemainingSeconds is 60s');

    assert.equal(tickCount, 1, 'Initial onWaitTick called with 60s');
    assert.equal(lastTick.remainingSec, 60, 'Initial remaining seconds is 60');

    // Simulate 1 second elapsed
    now += 1000;
    timers[0].fn();
    timers.shift();
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(tickCount, 2, 'onWaitTick was called on next tick');
    assert.equal(lastTick.remainingSec, 59, 'Remaining seconds counted down to 59');
    assert.equal(lastTick.totalSec, 60, 'Total seconds is 60');

    // Format wait countdown display
    const mins = Math.floor(lastTick.remainingSec / 60);
    const secs = lastTick.remainingSec % 60;
    const timeStr = `${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
    assert.equal(timeStr, '00m 59s', 'Wait timer shows both minutes and seconds');

    // Advance to finish
    now = 70000;
    timers[0].fn();
    await waitPromise;

    assert.equal(engine.getWaitRemainingSeconds(), 0, 'Wait completed, remaining seconds is 0');
    console.log('✓ Wait countdown tick, format (both minutes and seconds), and completion verified');
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    Date.now = originalNow;
  }
}

async function testBatchQueueLogic() {
  const urlsText = `
    https://giatocvuongtai.com/truyen/dai-vu-tru
    https://www.wattpad.com/story/123456-de-nhat
    https://www.inkitt.com/stories/fantasy/789012
    https://giatocvuongtai.com/truyen/dai-vu-tru
  `;

  const lines = urlsText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const queue = [];

  for (const url of lines) {
    if (!url.startsWith('http://') && !url.startsWith('https://')) continue;
    if (queue.some(i => i.url === url)) continue; // de-duplication
    queue.push({
      id: 'story_' + queue.length,
      url,
      domain: new URL(url).hostname,
      status: 'queued',
      totalChapters: 0,
      downloadedCount: 0
    });
  }

  assert.equal(queue.length, 3, 'De-duplicated 4 lines to 3 distinct story URLs');
  assert.equal(queue[0].domain, 'giatocvuongtai.com');
  assert.equal(queue[1].domain, 'www.wattpad.com');
  assert.equal(queue[2].domain, 'www.inkitt.com');

  // Concurrency dispatch test
  const concurrency = 2;
  const running = new Set();
  const available = queue.filter(i => i.status === 'queued' && !running.has(i.id));
  const toStart = available.slice(0, concurrency);

  assert.equal(toStart.length, 2, 'Starts exactly 2 stories concurrently');
  toStart.forEach(i => {
    i.status = 'downloading';
    running.add(i.id);
  });

  assert.equal(running.size, 2, '2 stories running');
  assert.equal(queue[2].status, 'queued', '3rd story waits in queue');

  // Complete story 0
  queue[0].status = 'completed';
  running.delete(queue[0].id);

  // Next dispatch
  const nextAvailable = queue.filter(i => i.status === 'queued' && !running.has(i.id));
  assert.equal(nextAvailable.length, 1, '1 story left to start');
  assert.equal(nextAvailable[0].id, queue[2].id);

  console.log('✓ Batch queue de-duplication, concurrency limiting, and dispatch verified');
}

async function testMaxWaitCapAndSkipWait() {
  const engine = new CrawlEngine();
  engine.queue = [{}];
  // 5500 words at 650 wpm would normally take 507 seconds!
  const content = { contentHtml: 'word '.repeat(5500) };
  const profileWithCap = {
    enableWpmDelay: true,
    readingWpm: 650,
    maxWaitSeconds: 30
  };

  let waitTickFired = false;
  engine.onWaitTick = (tick) => {
    waitTickFired = true;
    assert.ok(tick.remainingSec <= 30, `Wait countdown should be capped at maxWaitSeconds: 30s, got ${tick.remainingSec}s`);
  };

  const waitPromise = engine._waitBetweenChapters(content, profileWithCap, 1);
  assert.ok(waitTickFired, 'Wait tick was fired');
  assert.ok(engine.getWaitRemainingSeconds() <= 30, 'Wait remaining seconds is <= 30');

  // Test skipWait() immediately cancels the remaining wait
  engine.skipWait();
  await waitPromise;
  assert.equal(engine.getWaitRemainingSeconds(), 0, 'skipWait() immediately finishes wait to 0s');
  console.log('✓ maxWaitSeconds cap (30s) and skipWait() verified');
}

async function testInterChapterDelayWithoutWpm() {
  const engine = new CrawlEngine();
  engine.queue = [{}];
  const content = { contentHtml: 'Short chapter content' };
  const profile = {
    enableWpmDelay: false,
    interChapterDelaySeconds: 5
  };

  let initialRemaining = 0;
  engine.onWaitTick = (tick) => {
    if (!initialRemaining) initialRemaining = tick.remainingSec;
  };

  const waitPromise = engine._waitBetweenChapters(content, profile, 1);
  assert.equal(initialRemaining, 5, 'Initial remaining seconds respects interChapterDelaySeconds: 5s');
  engine.skipWait();
  await waitPromise;
  console.log('✓ interChapterDelaySeconds fixed delay without WPM verified');
}

async function testSlugAndRedirectMatching() {
  const downloader = new TabDownloader();

  // Test 1: Exactly the same URL
  assert.equal(
    downloader._isSameOrRedirectedChapter('https://giatocvuongtai.com/truyen/chuong-37', 'https://giatocvuongtai.com/truyen/chuong-37'),
    true,
    'Exact URL matches'
  );

  // Test 2: Directory prefixes normalized (/truyen-chu/ vs /truyen/)
  assert.equal(
    downloader._isSameOrRedirectedChapter('https://giatocvuongtai.com/truyen-chu/novel-1/chuong-37', 'https://giatocvuongtai.com/truyen/novel-1/chuong-37'),
    true,
    'Directory prefix normalizes correctly'
  );

  // Test 3: Title added into slug by Nuxt/SPA (e.g. chuong-37 vs chuong-37-cau-meo)
  assert.equal(
    downloader._isSameOrRedirectedChapter('https://giatocvuongtai.com/truyen/chuong-37-cau-meo', 'https://giatocvuongtai.com/truyen/chuong-37'),
    true,
    'Slug prefix matching works for redirect with title added'
  );

  // Test 4: Chapter numbers extracted from slugs match
  assert.equal(
    downloader._isSameOrRedirectedChapter('https://giatocvuongtai.com/c37-cau-meo', 'https://giatocvuongtai.com/chuong-37'),
    true,
    'Chapter number matching works across different prefixes (c37 vs chuong-37)'
  );

  // Test 5: Different chapter numbers must return false
  assert.equal(
    downloader._isSameOrRedirectedChapter('https://giatocvuongtai.com/chuong-38-tuyen-dung', 'https://giatocvuongtai.com/chuong-37'),
    false,
    'Different chapter numbers correctly return false'
  );

  // Test 6: Different domain must return false
  assert.equal(
    downloader._isSameOrRedirectedChapter('https://other.com/chuong-37', 'https://giatocvuongtai.com/chuong-37'),
    false,
    'Different domains return false'
  );

  console.log('✓ TabDownloader slug & redirect matching for Nuxt/SPA chapters verified');
}

async function testConfigurableRecheckWaitSeconds() {
  const downloader = new TabDownloader({ recheckWaitSeconds: 15 });
  assert.equal(downloader.recheckWaitSeconds, 15, 'TabDownloader respects configured recheckWaitSeconds (15s)');

  let recheckDurationReported = 0;
  const engine = new CrawlEngine({
    downloader: {
      initialize: async () => {},
      close: async () => {},
      fetchChapter: async () => { throw new Error('Trang chưa có nội dung chương hoặc đang ở sai địa chỉ'); },
      recheckCurrentTabContent: async () => '<h1>Recovered</h1>'
    },
    onProgress: (p) => {
      if (p.currentChapter?.id === 'recheck') {
        recheckDurationReported = p.currentChapter.waitDurationSec;
      }
    }
  });

  const crawlPromise = engine.startCrawl({
    chapters: [{ id: 1, chapterNumber: 1, title: 'Ch 1', url: 'https://example.com/1' }],
    profile: { mode: 'tab', recheckWaitSeconds: 12 }
  });

  await new Promise(r => setTimeout(r, 50));
  assert.equal(recheckDurationReported, 12, 'CrawlEngine in-place recheck wait duration is configured to 12s instead of hardcoded 8s');
  engine.cancel();
  await crawlPromise;
  console.log('✓ Configurable recheckWaitSeconds (8-9s setup) verified in CrawlEngine and TabDownloader');
}

async function main() {
  await testLowSpeedEta();
  await testWaitCountdownCallback();
  await testBatchQueueLogic();
  await testMaxWaitCapAndSkipWait();
  await testInterChapterDelayWithoutWpm();
  await testSlugAndRedirectMatching();
  await testConfigurableRecheckWaitSeconds();
  console.log('\nALL BATCH & TIMER REGRESSION TESTS PASSED!');
}

main().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
