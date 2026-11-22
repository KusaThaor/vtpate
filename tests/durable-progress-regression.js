const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const sessionPath = path.resolve('extension book/src/storage/session-manager.js');
const { SessionManager } = require(sessionPath);
const { CrawlEngine } = require('../extension book/src/crawler/crawl-engine');
const manager = fs.readFileSync('extension book/manager.js', 'utf8');

function createUI() {
  const context = {
    SessionManager, URL, URLSearchParams, Blob, console, Map, Set,
    state: { downloadedChapters: new Map(), chapters: [], failedChapters: [], sessionManager: new SessionManager() },
    appendLog() {}, setStage() {}, renderChapterList() {}, renderFailedTable() {}, showDownloadedChapters() {},
    applyCustomSelectorsToUI(value) { this.selectors = value; }, detectParser() {}, updateCustomFontUI() {},
    updateProgressUI() {}, activateManagerTab() {}, setSaveStatus() {}, confirm: () => true,
    checkpointWrites: Promise.resolve(), lastCheckpointSaved: true,
    fetchNovelMetadata: async () => { throw new Error('Restoring must not fetch the TOC'); },
    window: { location: { search: '' } }
  };
  for (const name of ['inputNovelUrl', 'novelTitleInput', 'novelAuthorInput', 'novelDescInput',
    'crawlModeSelect', 'concurrencyInput', 'delayInput', 'pageLoadWaitInput', 'readingWpmInput',
    'breakIntervalInput', 'breakSecondsInput', 'jitterCheckbox', 'visibleTabCrawlCheckbox',
    'enableWpmDelayCheckbox', 'btnStart', 'btnExport', 'btnPause', 'btnStop', 'rangeFromInput', 'rangeToInput']) context[name] = {};
  context.coverImage = null;
  context.coverPlaceholder = null;
  vm.createContext(context);
  const begin = manager.indexOf('  async function applySavedCheckpoint(');
  const end = manager.indexOf('  function getCrawlProfile()', begin);
  vm.runInContext(manager.slice(begin, end), context);
  return context;
}

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vtpate-progress-test-'));
  const storagePath = path.join(directory, 'storage.json');
  const checkpointPath = path.join(directory, 'checkpoint.json');
  const checkpoint = {
    schemaVersion: 2, novelUrl: 'https://example.com/story', metadata: { title: 'Truyện thử', author: 'Tác giả' },
    chapters: Array.from({ length: 8 }, (_, i) => ({ id: String(i + 1), chapterNumber: i + 1,
      title: 'Chương ' + (i + 1), url: 'https://example.com/chapter/' + (i + 1), selected: i < 6 })),
    downloadedChapters: [1, 2, 3, 4].map(chapterNumber => ({ chapterNumber, contentHtml: '<p>Nội dung ' + chapterNumber + '</p>' })),
    pendingIndices: [5, 6], completedIndices: [1, 2, 3, 4], total: 8,
    crawlProfile: { mode: 'tab', delayMs: 500, readingWpm: 600, enableWpmDelay: true, customSelectors: { chapterContent: '#text' } },
    failedChapters: [], status: 'paused'
  };
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint));
  // Separate Node processes have no shared RAM: emulate Chrome's persistent storage boundary.
  const diskAdapter = `const fs=require('node:fs');
    const {SessionManager}=require(${JSON.stringify(sessionPath)});
    const storagePath=${JSON.stringify(storagePath)};
    global.chrome={storage:{local:{
      get:async()=>fs.existsSync(storagePath)?JSON.parse(fs.readFileSync(storagePath,'utf8')):{},
      set:async data=>fs.writeFileSync(storagePath,JSON.stringify(data)),
      remove:async()=>fs.writeFileSync(storagePath,'{}')
    }}};`;
  execFileSync(process.execPath, ['-e', diskAdapter + `
    (async()=>{ if(!await new SessionManager().saveCheckpoint(JSON.parse(fs.readFileSync(${JSON.stringify(checkpointPath)},'utf8'))))process.exit(2); })();`]);
  const restored = JSON.parse(execFileSync(process.execPath, ['-e', diskAdapter + `
    (async()=>process.stdout.write(JSON.stringify(await new SessionManager().getCheckpoint())))();`], { encoding: 'utf8' }));
  assert.equal(restored.downloadedChapters.length, 4);
  assert.equal(restored.downloadedChapters[3].contentHtml, '<p>Nội dung 4</p>');
  assert.equal(restored.chapters.length, 8);

  global.chrome = { storage: { local: {
    get: async () => JSON.parse(fs.readFileSync(storagePath, 'utf8')),
    set: async data => fs.writeFileSync(storagePath, JSON.stringify(data))
  } } };
  const ui = createUI();
  // Execute the real startup path: no network is allowed during restore.
  const startup = manager.slice(manager.indexOf('  // Restore complete local snapshots'), manager.indexOf('  // Ping background service worker'));
  await vm.runInContext(`(async()=>{${startup}})()`, ui);
  assert.equal(ui.state.downloadedChapters.size, 4);
  assert.deepEqual(Array.from(ui.state.chapters.filter(ch => ch.selected), ch => ch.chapterNumber), [5, 6]);
  assert.equal(ui.btnStart.textContent, 'Tải tiếp 2 chương còn thiếu');
  assert.equal(ui.btnExport.disabled, false);
  assert.equal(ui.readingWpmInput.value, 600);
  assert.equal(ui.crawlModeSelect.value, 'tab');
  assert.equal(ui.state.crawlEngine, null, 'Opening the extension restores without starting requests');

  // Resume and persist new chapters; previously downloaded and unselected ones are never fetched.
  const fetched = [];
  const engine = new CrawlEngine({ netRules: {}, downloader: {
    initialize: async () => {}, cleanup: async () => {},
    fetchChapter: async url => { fetched.push(url); return '<p>New content</p>'; }
  }, onChapterComplete: async ({ result }) => {
    ui.state.downloadedChapters.set(result.chapterNumber, result);
    await new SessionManager().saveCheckpoint({ ...restored,
      downloadedChapters: [...ui.state.downloadedChapters.values()],
      pendingIndices: restored.pendingIndices.filter(n => !ui.state.downloadedChapters.has(n))
    });
  } });
  await engine.startCrawl({ chapters: ui.state.chapters.filter(ch => ch.selected && !ui.state.downloadedChapters.has(ch.chapterNumber)), profile: { mode: 'tab' } });
  assert.deepEqual(fetched, ['https://example.com/chapter/5', 'https://example.com/chapter/6']);
  const afterRestart = JSON.parse(execFileSync(process.execPath, ['-e', diskAdapter + `
    (async()=>process.stdout.write(JSON.stringify(await new SessionManager().getCheckpoint())))();`], { encoding: 'utf8' }));
  assert.equal(afterRestart.downloadedChapters.length, 6);
  assert.deepEqual(afterRestart.pendingIndices, []);

  // Portable backup survives a different installation with empty browser storage.
  const backup = { format: 'vtpate-progress', version: 1, checkpoint: afterRestart };
  fs.writeFileSync(storagePath, '{}');
  const importedUI = createUI();
  const fileInput = { files: [{ text: async () => JSON.stringify(backup) }], value: 'selected' };
  await importedUI.importProgressBackup({ target: fileInput });
  assert.equal(fileInput.value, '');
  assert.equal(importedUI.state.downloadedChapters.size, 6);
  assert.equal((await new SessionManager().getCheckpoint()).downloadedChapters.length, 6);
  assert.equal(importedUI.btnStart.disabled, false, 'Previously unselected chapters can be chosen in a later run');

  // The actual export handler includes chapter bodies, even without working browser storage.
  let exportedBlob, downloadRequest;
  importedUI.buildCheckpointPayload = () => afterRestart;
  importedUI.URL = { createObjectURL(blob) { exportedBlob = blob; return 'blob:test-backup'; }, revokeObjectURL() {} };
  importedUI.chrome = { downloads: { download: async request => { downloadRequest = request; return 1; } } };
  importedUI.setTimeout = fn => fn();
  await importedUI.exportProgressBackup();
  assert.equal(downloadRequest.saveAs, true);
  const exported = SessionManager.validateBackup(JSON.parse(await exportedBlob.text()));
  assert.equal(exported.downloadedChapters.length, 6);
  assert.equal(exported.downloadedChapters[0].contentHtml, '<p>Nội dung 1</p>');

  // Corrupt input must never overwrite a valid saved session.
  const before = fs.readFileSync(storagePath, 'utf8');
  await importedUI.importProgressBackup({ target: { files: [{ text: async () => '{broken' }], value: '' } });
  assert.equal(fs.readFileSync(storagePath, 'utf8'), before);

  // Queued writes capture content + metadata and cannot mutate after enqueueing.
  const snapshotUI = createUI();
  snapshotUI.state = { ...ui.state, sessionManager: new SessionManager() };
  snapshotUI.getCrawlProfile = () => checkpoint.crawlProfile;
  snapshotUI.novelTitleInput.value = checkpoint.metadata.title;
  snapshotUI.novelAuthorInput.value = checkpoint.metadata.author;
  snapshotUI.handleCheckpointFailure = () => { throw new Error('Unexpected save failure'); };
  const persistence = manager.slice(manager.indexOf('  let checkpointWrites = Promise.resolve();'), manager.indexOf('  async function saveManualCheckpoint()'));
  vm.runInContext(persistence, snapshotUI);
  await snapshotUI.persistCrawlCheckpoint('paused');
  const complete = await new SessionManager().getCheckpoint();
  assert.equal(complete.metadata.title, 'Truyện thử');
  assert.equal(complete.chapters.length, 8);
  assert.equal(complete.downloadedChapters.length, 6);
  assert.deepEqual(complete.pendingIndices, []);
  assert.throws(() => SessionManager.validateBackup({ ...backup, version: 999 }), /hỗ trợ/);
  const unsafe = JSON.parse(JSON.stringify(backup)); unsafe.checkpoint.chapters[0].url = 'javascript:alert(1)';
  assert.throws(() => SessionManager.validateBackup(unsafe), /không hợp lệ/);

  // Storage errors are reported as failures, never as durable success.
  global.chrome.storage.local.set = async () => { throw new Error('Disk full'); };
  const originalWarn = console.warn; console.warn = () => {};
  try { assert.equal(await new SessionManager().saveCheckpoint(checkpoint), false); }
  finally { console.warn = originalWarn; }
  assert.equal((await new SessionManager().getCheckpoint()).downloadedChapters.length, 6);
  delete global.chrome;
  assert.equal(await new SessionManager().saveCheckpoint(checkpoint), false);
  console.log('PASS: four saved chapters survive fresh processes, offline startup, resume only missing selections, portable JSON import, corrupt file protection and truthful storage failures.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
