const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { TabDownloader } = require('../extension book/src/crawler/tab-downloader');
const { CrawlEngine } = require('../extension book/src/crawler/crawl-engine');
const challenge = '<html><title>Just a moment...</title><div id="challenge-running">Checking your browser...</div></html>';
const chapter = '<html><title>Chương 9</title><div class="reader-demo-body"><p>Nội dung đã tải xong.</p></div><script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script></html>';
const url = 'https://giatocvuongtai.com/reader?storyId=story&chapter=9';
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
async function until(check) {
  for (let i = 0; i < 400; i++) { if (check()) return; await tick(); }
  throw new Error('Timed out waiting for test state');
}
function mock(handler) {
  const updates = [];
  global.chrome = {
    tabs: { create: async () => ({ id: 7 }), update: async (id, props) => { updates.push(props); }, remove: async () => {} },
    scripting: { executeScript: async injection => [{ result: await handler(injection) }] }
  };
  return updates;
}
async function main() {
  const d = new TabDownloader();
  assert.equal(d._isChallenge(chapter), false, 'Background Cloudflare JS is not a challenge');
  assert.equal(d._isChallenge('<script>"Just a moment..."; "cf-chl-widget"</script><article>Story</article>'), false);
  assert.equal(d._isChallenge('<article><p>Checking your browser... Just a moment...</p></article>'), false, 'Story quotations must not block');
  assert.equal(d._isChallenge('<iframe src="https://challenges.cloudflare.com/turnstile"></iframe><article>Story</article>'), false);
  assert.equal(d._isChallenge(challenge), true);
  assert.equal(d._isChallenge('<form id="challenge-form">Verify you are human</form>'), true);

  // Execute the actual injected function against a controlled DOM, including SPA readiness.
  let ready = false, calls = 0, notices = 0;
  mock(injection => {
    calls++;
    if (calls === 2) ready = true;
    const context = { document: { readyState: 'complete', documentElement: { outerHTML: chapter }, querySelector: selector => {
      assert.equal(selector, 'div.reader-demo-body');
      return ready ? { textContent: 'Nội dung chương' } : null;
    } }, location: { href: url } };
    return vm.runInNewContext(`(${injection.func.toString()})(${JSON.stringify(injection.args[0])})`, context);
  });
  const spa = new TabDownloader({ pageLoadWaitMs: 200, challengePollIntervalMs: 10, onChallenge: () => notices++ });
  assert.equal(await spa.fetchChapter(url), chapter);
  assert.equal(calls, 2);
  assert.equal(notices, 0);

  // An empty SPA is a content error, never a saved placeholder or Cloudflare alert.
  mock(() => ({ html: '<html><div id="app"></div></html>', ready: false, url }));
  const empty = new TabDownloader({ pageLoadWaitMs: 200, timeoutMs: 1000, challengePollIntervalMs: 10,
    onChallenge: () => { throw new Error('False challenge alert'); } });
  await assert.rejects(empty.fetchChapter(url), /chưa có nội dung chương/);

  // Navigation can briefly invalidate script execution; the current chapter survives.
  let transient = true;
  mock(() => {
    if (transient) { transient = false; throw new Error('Frame was detached'); }
    return { html: chapter, ready: true, url };
  });
  const navigation = new TabDownloader({ pageLoadWaitMs: 200, challengePollIntervalMs: 10 });
  assert.equal(await navigation.fetchChapter(url), chapter);

  // True verification -> pause -> reload same URL -> resume -> save exactly once -> next chapter.
  let page = challenge, polls = 0;
  const updates = mock(() => { polls++; return { html: page, ready: true, url }; });
  const saved = [];
  const engine = new CrawlEngine({ netRules: {}, onChapterComplete: async ({ result }) => saved.push(result.chapterNumber) });
  const profile = { mode: 'tab', pageLoadWaitMs: 200, challengePollIntervalMs: 10 };
  engine.downloader = engine.createDownloader(profile);
  const chapters = [9, 10].map(chapterNumber => ({ id: String(chapterNumber), chapterNumber, title: 'Chương ' + chapterNumber, url }));
  const run = engine.startCrawl({ chapters, profile });
  await until(() => engine.downloader.isWaitingForChallenge);
  engine.pause();
  await tick();
  const pausedPolls = polls;
  page = chapter;
  await engine.downloader.reloadCurrentChapter();
  assert.equal(engine.isPaused, true);
  assert.deepEqual(saved, []);
  assert.equal(polls, pausedPolls, 'No polling or chapter advance while explicitly paused');
  engine.resume();
  engine.downloader.retryCurrentChapter();
  await run;
  assert.deepEqual(saved, [9, 10]);
  assert.equal(updates.filter(p => p.url).length, 3, 'Initial navigation, manual reload, next chapter');
  assert.equal(engine.failed.length, 0);

  // Old in-flight snapshots cannot be committed after a reload.
  let release, captureCount = 0;
  mock(async () => {
    if (++captureCount === 1) return await new Promise(resolve => { release = resolve; });
    return { html: chapter, ready: true, url };
  });
  const stale = new TabDownloader({ pageLoadWaitMs: 200, challengePollIntervalMs: 10 });
  const pending = stale.fetchChapter(url);
  await until(() => release);
  await stale.reloadCurrentChapter();
  release({ html: '<p>Stale chapter</p>', ready: true, url });
  assert.equal(await pending, chapter);
  assert.equal(captureCount, 2);

  // Stop unblocks a genuine challenge even if the user has paused.
  mock(() => challenge);
  const stopEngine = new CrawlEngine({ netRules: {} });
  const stopping = stopEngine.startCrawl({ chapters, profile });
  await until(() => stopEngine.downloader.isWaitingForChallenge);
  stopEngine.pause();
  stopEngine.cancel();
  await stopping;
  assert.equal(stopEngine.completed.length, 0);
  assert.equal(stopEngine.failed.length, 0);

  // UI handlers preserve existing chapters and keep reload paused until explicitly continued.
  const source = fs.readFileSync('extension book/manager.js', 'utf8');
  const controls = source.slice(source.indexOf('  function updateRecoveryControls()'), source.indexOf('  // --- Pause & Resume Support ---'));
  const state = { downloadedChapters: new Map([[1, 'saved']]), isPaused: false, crawlEngine: {
    isRunning: true, activeProfile: { mode: 'tab' }, isPaused: false,
    pause() { this.isPaused = true; }, resume() { this.isPaused = false; },
    downloader: { currentUrl: url, reloadCurrentChapter: async () => {}, retryCurrentChapter() {} }
  } };
  let checkpoints = 0;
  const ui = vm.createContext({ state, btnReloadTab: {}, btnRecheckTab: {}, btnPause: {}, recoveryBusy: false,
    persistCrawlCheckpoint: async () => checkpoints++, appendLog() {} });
  vm.runInContext(controls, ui);
  await ui.recoverCurrentTab(true);
  assert.equal(state.crawlEngine.isPaused, true);
  assert.equal(ui.btnRecheckTab.disabled, false);
  assert.equal(checkpoints, 1);
  await ui.recoverCurrentTab(false);
  assert.equal(state.crawlEngine.isPaused, false);
  assert.equal(state.downloadedChapters.get(1), 'saved');
  state.crawlEngine.isRunning = false;
  ui.updateRecoveryControls();
  assert.equal(ui.btnReloadTab.disabled, true);
  assert.equal(ui.btnRecheckTab.disabled, true);
  console.log('PASS: Cloudflare detection, SPA readiness, pause/reload/resume, stale snapshots, stop, recovery UI and saved chapters.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { delete global.chrome; });
