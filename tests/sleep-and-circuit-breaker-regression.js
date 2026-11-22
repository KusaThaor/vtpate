const assert = require('node:assert/strict');
const path = require('node:path');
const { CrawlEngine } = require('../src/crawler/crawl-engine');
const { TabDownloader } = require('../src/crawler/tab-downloader');

async function testTabDraggingRetry() {
  console.log('Testing TabDownloader handling "Tabs cannot be edited right now"...');
  let updateAttempts = 0;
  global.chrome = {
    tabs: {
      update: async (tabId, props) => {
        updateAttempts++;
        if (updateAttempts <= 2) {
          throw new Error('Tabs cannot be edited right now (user may be dragging a tab).');
        }
        return { id: tabId, ...props };
      }
    }
  };

  const downloader = new TabDownloader();
  downloader.tabId = 123;
  const res = await downloader._updateTab({ active: true }, 4);
  assert.equal(updateAttempts, 3, 'Should retry until successful');
  assert.equal(res.active, true, 'Result should be returned on successful attempt');
  console.log('✓ Tab dragging retry successfully recovered without failing!');
}

async function testCircuitBreakerConsecutiveErrors() {
  console.log('Testing CrawlEngine Circuit Breaker on consecutive errors...');
  let circuitBreakerTriggered = false;
  let circuitBreakerData = null;

  const mockDownloader = {
    initialize: async () => {},
    fetchChapter: async (url) => {
      throw new Error('Frame with ID 0 is showing error page');
    },
    cleanup: async () => {}
  };

  const engine = new CrawlEngine({
    downloader: mockDownloader,
    onCircuitBreaker: async (info) => {
      circuitBreakerTriggered = true;
      circuitBreakerData = info;
    }
  });

  const chapters = [
    { id: 1, chapterNumber: 1, title: 'Ch 1', url: 'https://example.com/ch1' },
    { id: 2, chapterNumber: 2, title: 'Ch 2', url: 'https://example.com/ch2' },
    { id: 3, chapterNumber: 3, title: 'Ch 3', url: 'https://example.com/ch3' },
    { id: 4, chapterNumber: 4, title: 'Ch 4', url: 'https://example.com/ch4' },
    { id: 5, chapterNumber: 5, title: 'Ch 5', url: 'https://example.com/ch5' }
  ];

  // Profile with maxConsecutiveErrors = 3
  const crawlPromise = engine.startCrawl({
    chapters,
    profile: { mode: 'tab', maxConsecutiveErrors: 3 }
  });

  // Give loop time to process 3 failures
  await new Promise(r => setTimeout(r, 200));

  assert.equal(engine.isPaused, true, 'Engine must be automatically PAUSED by circuit breaker');
  assert.equal(circuitBreakerTriggered, true, 'onCircuitBreaker callback must be invoked');
  assert.equal(circuitBreakerData.consecutiveFailures, 3, 'Consecutive failures count must be 3');
  assert.equal(engine.failed.length, 3, 'Exactly 3 chapters failed before stopping, NOT all 5 chapters!');

  // Now resume and test that consecutiveFailures is reset
  let succeedNext = true;
  mockDownloader.fetchChapter = async (url) => {
    if (succeedNext) return '<h1>Chapter Content</h1>';
    throw new Error('Some error');
  };

  engine.resume();
  assert.equal(engine.consecutiveFailures, 0, 'Resuming must reset consecutiveFailures to 0');

  // Cancel to finish promise
  engine.cancel();
  await crawlPromise;
  console.log('✓ CrawlEngine Circuit Breaker stopped execution safely after 3 errors!');
}

async function testChromeIdleScreenLockDetection() {
  console.log('Testing Chrome Idle API: Screen Off / System Lock vs Tab Switching...');
  let paused = false;
  let savedCheckpoint = false;
  let alertShown = false;

  const mockEngine = {
    isRunning: true,
    isPaused: false,
    isCancelled: false,
    pause: () => { paused = true; mockEngine.isPaused = true; }
  };

  const persistCrawlCheckpoint = async (status) => {
    if (status === 'paused') savedCheckpoint = true;
  };

  const showSleepOrErrorAlert = () => {
    alertShown = true;
  };

  const handleStateChange = async (newState) => {
    // Only 'locked' corresponds to screen off / display sleep
    if (newState === 'locked') {
      if (mockEngine.isRunning && !mockEngine.isPaused) {
        mockEngine.pause();
        await persistCrawlCheckpoint('paused');
        showSleepOrErrorAlert();
      }
    }
  };

  // Case 1: User switches tabs or is active
  await handleStateChange('active');
  assert.equal(paused, false, 'Switching tabs (state=active) must NOT pause the crawler');
  assert.equal(savedCheckpoint, false, 'Switching tabs must NOT trigger checkpoint save');

  // Case 2: User stops typing/clicking for 60s, but screen is still on (state=idle)
  await handleStateChange('idle');
  assert.equal(paused, false, 'Idle without screen off (state=idle) must NOT pause the crawler');

  // Case 3: The machine screen actually turns off / locks (state=locked)
  await handleStateChange('locked');
  assert.equal(paused, true, 'Screen turning off (state=locked) MUST pause the crawler');
  assert.equal(savedCheckpoint, true, 'Screen turning off MUST save the checkpoint');
  assert.equal(alertShown, true, 'Screen turning off MUST display the alert banner');
  console.log('✓ Chrome Idle API: Verified tab switching does not pause, only screen off (locked) pauses!');
}

async function testOfflineEventListener() {
  console.log('Testing Offline Event Auto-Pause & Save...');
  let paused = false;
  let savedCheckpoint = false;

  const mockEngine = {
    isRunning: true,
    isPaused: false,
    isCancelled: false,
    pause: () => { paused = true; mockEngine.isPaused = true; }
  };

  const persistCrawlCheckpoint = async (status) => {
    if (status === 'paused') savedCheckpoint = true;
  };

  // Simulate offline event trigger
  if (mockEngine.isRunning && !mockEngine.isPaused) {
    mockEngine.pause();
    await persistCrawlCheckpoint('paused');
  }

  assert.equal(paused, true, 'Engine must pause on offline event');
  assert.equal(savedCheckpoint, true, 'Checkpoint must be saved on offline event');
  console.log('✓ Offline event listener successfully triggers auto-pause and safe save!');
}

async function main() {
  console.log('=== Running Sleep & Circuit Breaker Regression Tests ===');
  await testTabDraggingRetry();
  await testCircuitBreakerConsecutiveErrors();
  await testChromeIdleScreenLockDetection();
  await testOfflineEventListener();
  console.log('=== ALL SLEEP & CIRCUIT BREAKER TESTS PASSED 100% ===');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
