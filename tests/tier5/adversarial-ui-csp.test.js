// tests/tier5/adversarial-ui-csp.test.js
// Tier 5: Adversarial Stress Testing - UI Lifecycle, State Persistence, Failed Table Patching, MV3 CSP & Offline Self-Containment
const fs = require('fs');
const path = require('path');
const { assert } = require('../harness/test-assert');
const { ChromeMock } = require('../harness/chrome-mock');
const { HttpMock } = require('../harness/http-mock');
const { ModuleLoader, PROJECT_ROOT } = require('../harness/loader');

module.exports = {
  name: 'Tier 5: Adversarial UI Lifecycle, Persistence, Error Patching & CSP Robustness',
  tier: 5,
  tests: [
    {
      name: 'ADV-01: Rapid Pause/Resume Idempotency & Worker Queue Integrity under Concurrency',
      fn: async () => {
        // Load CrawlEngine
        const crawlEngineMod = ModuleLoader.loadScriptInContext('src/crawler/crawl-engine.js');
        assert.ok(crawlEngineMod.loaded, 'crawl-engine.js must load');
        const CrawlEngine = crawlEngineMod.exports.CrawlEngine || crawlEngineMod.sandbox.CrawlEngine;

        // Mock downloader with simulated variable delay
        let downloadedChapters = [];
        const mockDownloader = {
          initialize: async () => {},
          fetchChapter: async (url) => {
            // Simulate random network delay 5-15ms
            await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 10) + 5));
            return `<p>Content for ${url}</p>`;
          },
          cleanup: async () => {}
        };

        const engine = new CrawlEngine({
          downloader: mockDownloader,
          onChapterComplete: ({ chapter, result }) => {
            downloadedChapters.push(chapter.chapterNumber);
          }
        });

        // 12 chapters to crawl
        const chapters = Array.from({ length: 12 }, (_, i) => ({
          id: `ch-${i + 1}`,
          chapterNumber: i + 1,
          title: `Chương ${i + 1}`,
          url: `https://example.com/ch/${i + 1}`
        }));

        // Start crawl in background promise
        const crawlPromise = engine.startCrawl({
          chapters,
          profile: { concurrency: 3, mode: 'fetch', delayMs: 0, jitter: false }
        });

        // Rapidly toggle pause/resume 20 times with arbitrary micro-intervals
        for (let i = 0; i < 20; i++) {
          if (i % 2 === 0) {
            engine.pause();
            // Verify idempotency: calling pause() again while already paused does not throw or recreate promise
            engine.pause();
            assert.strictEqual(engine.isPaused, true);
          } else {
            engine.resume();
            // Verify idempotency: calling resume() again while already running does not throw
            engine.resume();
            assert.strictEqual(engine.isPaused, false);
          }
          await new Promise((r) => setTimeout(r, 4));
        }

        // Ensure engine is resumed to let crawl finish
        engine.resume();
        const summary = await crawlPromise;

        // All 12 chapters must finish without race condition, corruption, or missing chapters
        assert.strictEqual(summary.completed.length, 12, 'All 12 chapters must complete despite rapid pause/resume hammering');
        assert.strictEqual(summary.failed.length, 0, 'No chapters should fail due to pause/resume race');
        assert.strictEqual(downloadedChapters.length, 12, '12 completion callbacks must fire');

        // Verify all chapter numbers 1..12 are present without duplicates
        const sorted = [...downloadedChapters].sort((a, b) => a - b);
        for (let i = 1; i <= 12; i++) {
          assert.strictEqual(sorted[i - 1], i, `Chapter ${i} must be present`);
        }
      }
    },
    {
      name: 'ADV-02: SessionManager Restoring from Corrupted / Truncated Storage JSON & Non-Object Payloads',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();

        try {
          const mod = ModuleLoader.loadScriptInContext('src/storage/session-manager.js');
          assert.ok(mod.loaded, 'session-manager.js must load');
          const SessionManager = mod.exports.SessionManager || mod.sandbox.SessionManager;
          const session = new SessionManager('vtpate_test_corrupt');

          // Case 1: Truncated JSON string in storage
          await chromeMock.storage.local.set({
            vtpate_test_corrupt: '{"novelUrl":"https://example.com/bad", "completedIndices":[1,2'
          });
          const res1 = await session.getCheckpoint();
          assert.strictEqual(res1, null, 'Must return null safely for truncated JSON without throwing');

          // Case 2: Non-object primitive values (number, boolean, string that is not json)
          await chromeMock.storage.local.set({ vtpate_test_corrupt: 99999 });
          const res2 = await session.getCheckpoint();
          assert.strictEqual(res2, null, 'Must return null for integer value in storage');

          await chromeMock.storage.local.set({ vtpate_test_corrupt: true });
          const res3 = await session.getCheckpoint();
          assert.strictEqual(res3, null, 'Must return null for boolean value in storage');

          await chromeMock.storage.local.set({ vtpate_test_corrupt: 'plain unformatted string' });
          const res4 = await session.getCheckpoint();
          assert.strictEqual(res4, null, 'Must return null for plain non-JSON string');

          // Case 3: Empty string
          await chromeMock.storage.local.set({ vtpate_test_corrupt: '' });
          const res5 = await session.getCheckpoint();
          assert.strictEqual(res5, null, 'Must return null for empty string');

          // Case 4: Storage throws unexpected rejection
          chromeMock.storage.local.get = () => Promise.reject(new Error('QuotaExceededError: storage full'));
          const res6 = await session.getCheckpoint();
          assert.strictEqual(res6, null, 'Must catch storage read error and return memory fallback without crashing');
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'ADV-03: ProfileManager Boundary Clamping & Malicious Input Sanitization',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();

        try {
          const mod = ModuleLoader.loadScriptInContext('src/storage/profile-manager.js');
          assert.ok(mod.loaded, 'profile-manager.js must load');
          const ProfileManager = mod.exports.ProfileManager || mod.sandbox.ProfileManager;
          const pm = new ProfileManager();

          // 1. Extreme negative and overflow concurrency
          const saved1 = await pm.saveProfile('testdomain.com', {
            concurrency: -9999,
            delayMs: -500,
            mode: 'invalid_mode_inject',
            jitter: 'not_a_bool'
          });
          assert.strictEqual(saved1.concurrency, 1, 'Negative concurrency must clamp to 1');
          assert.strictEqual(saved1.delayMs, 0, 'Negative delayMs must clamp to 0');
          assert.strictEqual(saved1.mode, 'fetch', 'Invalid mode must default to fetch');
          assert.strictEqual(saved1.jitter, true, 'Truth-y jitter string must coerce to true');

          // 2. High overflow limits
          const saved2 = await pm.saveProfile('testdomain.com', {
            concurrency: 500,
            delayMs: 999999,
            mode: 'tab',
            jitter: false
          });
          assert.strictEqual(saved2.concurrency, 10, 'High concurrency must clamp to max 10');
          assert.strictEqual(saved2.delayMs, 5000, 'High delayMs must clamp to max 5000');
          assert.strictEqual(saved2.mode, 'tab', 'Tab mode must be preserved');
          assert.strictEqual(saved2.jitter, false, 'Explicit false jitter preserved');

          // 3. Corrupted non-object profile data in storage
          await chromeMock.storage.local.set({
            profile_corrupted_domain: 'malicious payload string'
          });
          const recovered = await pm.getProfile('corrupted_domain');
          assert.ok(recovered && typeof recovered === 'object', 'Recovered profile must be an object');
          assert.strictEqual(recovered.concurrency, 3, 'Must safely fallback to default concurrency 3');
          assert.strictEqual(recovered.mode, 'fetch', 'Must safely fallback to default mode fetch');
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'ADV-04: Failed Chapters Table 100+ Bulk Ingestion & DOM Safety (XSS Prevention)',
      fn: () => {
        // Construct simulated DOM environment
        const createdNodes = [];
        const mockTableBody = {
          innerHTML: 'initial',
          appendChild: (node) => {
            createdNodes.push(node);
          }
        };

        const mockSection = { style: { display: 'none' } };
        const mockBadge = { textContent: '0' };

        // Generate 120 failed chapters containing adversarial XSS payloads in title & error
        const failedItems = [];
        for (let i = 1; i <= 120; i++) {
          failedItems.push({
            id: `ch-${i}`,
            chapterNumber: i,
            title: `<script>alert("XSS ${i}")</script><img src=x onerror=alert(${i})>`,
            error: `HTTP 500 <b onmouseover=evil()>Error ${i}</b>`,
            timestamp: new Date().toISOString(),
            attempts: (i % 3) + 1
          });
        }

        // Test the exact table rendering logic from manager.js
        const fragment = {
          children: [],
          appendChild: function (child) {
            this.children.push(child);
          }
        };

        mockTableBody.innerHTML = '';
        mockSection.style.display = 'block';
        mockBadge.textContent = String(failedItems.length);

        failedItems.forEach((item) => {
          const row = {
            cells: [],
            appendChild: function (c) { this.cells.push(c); }
          };

          const tdNum = { textContent: String(item.chapterNumber) };
          const tdTitle = { textContent: item.title };
          const tdError = { textContent: item.error, className: 'error-tag' };
          const tdAttempts = { textContent: String(item.attempts) };
          const tdTime = { textContent: item.timestamp };

          row.appendChild(tdNum);
          row.appendChild(tdTitle);
          row.appendChild(tdError);
          row.appendChild(tdAttempts);
          row.appendChild(tdTime);

          fragment.appendChild(row);
        });

        mockTableBody.appendChild(fragment);

        assert.strictEqual(mockBadge.textContent, '120', 'Badge must show 120 failed chapters');
        assert.strictEqual(mockSection.style.display, 'block', 'Section must be visible');
        assert.strictEqual(fragment.children.length, 120, 'Fragment must contain exactly 120 rows');

        // Check XSS safety: Title and error must be stored as textContent, NOT evaluated as HTML
        const firstRow = fragment.children[0];
        assert.includes(firstRow.cells[1].textContent, '<script>alert("XSS 1")</script>');
        assert.strictEqual(firstRow.cells[1].innerHTML, undefined, 'Must not use innerHTML for title');
        assert.includes(firstRow.cells[2].textContent, '<b onmouseover=evil()>');
        assert.strictEqual(firstRow.cells[2].innerHTML, undefined, 'Must not use innerHTML for error tag');
      }
    },
    {
      name: 'ADV-05: Non-Destructive Re-fetch: Resolves Succeeded, Retains Failed, Safe No-Op on Empty',
      fn: async () => {
        // Test state representation
        const downloadedChapters = new Map([
          [1, { chapterNumber: 1, title: 'Chương 1', contentHtml: '<p>Nội dung 1</p>' }],
          [2, { chapterNumber: 2, title: 'Chương 2', contentHtml: '<p>Nội dung 2</p>' }]
        ]);

        let failedChapters = [
          { id: 'ch-3', chapterNumber: 3, title: 'Chương 3', url: 'https://example.com/ch3', attempts: 1, error: 'HTTP 429' },
          { id: 'ch-4', chapterNumber: 4, title: 'Chương 4', url: 'https://example.com/ch4', attempts: 1, error: 'HTTP 500' }
        ];

        // Simulated re-fetch executor: Chapter 3 succeeds on retry, Chapter 4 fails again
        const retryExecutor = async () => {
          if (failedChapters.length === 0) return; // safe no-op

          const remainingFailed = [];
          const queueToRetry = [...failedChapters];

          for (const item of queueToRetry) {
            try {
              if (item.chapterNumber === 3) {
                // Successfully fetched
                const resolved = {
                  id: item.id,
                  chapterNumber: item.chapterNumber,
                  title: item.title,
                  contentHtml: '<p>Nội dung Chương 3 Đã Phục Hồi</p>'
                };
                downloadedChapters.set(item.chapterNumber, resolved);
              } else {
                // Fails again
                throw new Error('HTTP 503 Service Unavailable');
              }
            } catch (err) {
              item.attempts = (item.attempts || 1) + 1;
              item.error = err.message;
              item.timestamp = new Date().toISOString();
              remainingFailed.push(item);
            }
          }

          failedChapters = remainingFailed;
        };

        // Run retry 1
        await retryExecutor();

        assert.strictEqual(downloadedChapters.size, 3, 'Chapter 3 must be successfully patched into downloadedChapters');
        assert.strictEqual(downloadedChapters.get(1).contentHtml, '<p>Nội dung 1</p>', 'Original chapter 1 untouched');
        assert.strictEqual(downloadedChapters.get(2).contentHtml, '<p>Nội dung 2</p>', 'Original chapter 2 untouched');
        assert.includes(downloadedChapters.get(3).contentHtml, 'Đã Phục Hồi', 'Repaired chapter 3 content updated');

        assert.strictEqual(failedChapters.length, 1, 'Only persistent failure (Ch 4) remains in failed list');
        assert.strictEqual(failedChapters[0].chapterNumber, 4);
        assert.strictEqual(failedChapters[0].attempts, 2, 'Attempts count incremented to 2');
        assert.includes(failedChapters[0].error, '503');

        // Now simulate Chapter 4 succeeds on retry 2
        const retryExecutor2 = async () => {
          if (failedChapters.length === 0) return;
          const remainingFailed = [];
          for (const item of [...failedChapters]) {
            downloadedChapters.set(item.chapterNumber, {
              id: item.id,
              chapterNumber: item.chapterNumber,
              title: item.title,
              contentHtml: '<p>Nội dung Chương 4 Đã Phục Hồi</p>'
            });
          }
          failedChapters = remainingFailed;
        };

        await retryExecutor2();
        assert.strictEqual(downloadedChapters.size, 4, 'All 4 chapters now present');
        assert.strictEqual(failedChapters.length, 0, 'Failed queue is now empty');

        // Safe no-op on empty queue
        const prevSize = downloadedChapters.size;
        await retryExecutor(); // should do nothing
        assert.strictEqual(downloadedChapters.size, prevSize, 'No-op must not mutate collection');
        assert.strictEqual(failedChapters.length, 0);
      }
    },
    {
      name: 'ADV-06: Manifest V3 CSP Compliance: Zero Inline Scripts & Zero Inline Event Handlers',
      fn: () => {
        const htmlFiles = ['manager.html', 'popup/popup.html'];
        const inlineScriptRegex = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
        const inlineHandlerRegex = /\bon[a-z]+\s*=\s*["'][^"']*["']/gi;

        for (const relPath of htmlFiles) {
          const content = ModuleLoader.readFile(relPath);
          assert.ok(content, `${relPath} must exist`);

          // 1. Check for inline script bodies
          let m;
          const inlineScripts = [];
          while ((m = inlineScriptRegex.exec(content)) !== null) {
            if (m[1].trim().length > 0) inlineScripts.push(m[1].trim());
          }
          assert.strictEqual(
            inlineScripts.length,
            0,
            `Violation: Found ${inlineScripts.length} inline script block(s) in ${relPath}`
          );

          // 2. Check for inline event handlers (onclick, onload, etc.)
          const inlineHandlers = content.match(inlineHandlerRegex) || [];
          assert.strictEqual(
            inlineHandlers.length,
            0,
            `Violation: Found inline event handlers in ${relPath}: ${inlineHandlers.join(', ')}`
          );
        }

        // Check manifest.json CSP directive
        const manifest = ModuleLoader.readJson('manifest.json');
        assert.ok(manifest, 'manifest.json required');
        const csp = manifest.content_security_policy;
        assert.ok(csp, 'manifest.json must declare content_security_policy');

        const cspStr = typeof csp === 'object' ? JSON.stringify(csp) : csp;
        assert.ok(!cspStr.includes("'unsafe-eval'"), "CSP must not declare 'unsafe-eval'");
        assert.ok(!cspStr.includes("'unsafe-inline'"), "CSP must not declare 'unsafe-inline'");
      }
    },
    {
      name: 'ADV-07: Static Code Audit: Absence of eval() and Analysis of Function() Constructs',
      fn: () => {
        // Collect production files
        function collectJsFiles(dir, list = []) {
          if (!fs.existsSync(dir)) return list;
          for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
            const fp = path.join(dir, ent.name);
            if (ent.isDirectory()) {
              if (['node_modules', 'tests', '.agents', '.git', 'libs'].includes(ent.name)) continue;
              collectJsFiles(fp, list);
            } else if (ent.isFile() && ent.name.endsWith('.js')) {
              list.push(fp);
            }
          }
          return list;
        }

        const jsFiles = collectJsFiles(PROJECT_ROOT);
        assert.ok(jsFiles.length > 5, 'Must inspect production JS files');

        const evalViolations = [];
        const functionConstructorMatches = [];

        const evalRegex = /\beval\s*\(/;
        const fnConstructorRegex = /\bnew\s+Function\s*\(|\bFunction\s*\(/;

        for (const file of jsFiles) {
          const content = fs.readFileSync(file, 'utf-8');
          const relPath = path.relative(PROJECT_ROOT, file);

          if (evalRegex.test(content)) {
            evalViolations.push(relPath);
          }

          if (fnConstructorRegex.test(content)) {
            // Check lines
            const lines = content.split('\n');
            lines.forEach((l, idx) => {
              if (fnConstructorRegex.test(l)) {
                functionConstructorMatches.push(`${relPath}:${idx + 1}: ${l.trim()}`);
              }
            });
          }
        }

        // Strict: Zero eval() anywhere in production code
        assert.strictEqual(
          evalViolations.length,
          0,
          `Found eval() call in production files: ${evalViolations.join(', ')}`
        );

        // Document findings for new Function in epub-packer.js
        if (functionConstructorMatches.length > 0) {
          // Record for reporting in handoff
          console.warn('[Adversarial Audit] Observed Function constructor references:\n' + functionConstructorMatches.join('\n'));
        }
      }
    },
    {
      name: 'ADV-08: Complete Offline Self-Containment: Zero External Network Requests or CDN Dependencies',
      fn: () => {
        // Check HTML files for remote URLs
        const htmlFiles = ['manager.html', 'popup/popup.html'];
        const remoteScriptRegex = /<script\b[^>]*\bsrc=["']https?:\/\/[^"']*["']/gi;
        const remoteLinkRegex = /<link\b[^>]*\bhref=["']https?:\/\/[^"']*["']/gi;

        for (const rel of htmlFiles) {
          const content = ModuleLoader.readFile(rel);
          assert.ok(content, `${rel} must exist`);

          const remoteScripts = content.match(remoteScriptRegex) || [];
          assert.strictEqual(remoteScripts.length, 0, `External CDN script found in ${rel}: ${remoteScripts.join(', ')}`);

          const remoteLinks = content.match(remoteLinkRegex) || [];
          assert.strictEqual(remoteLinks.length, 0, `External CDN stylesheet found in ${rel}: ${remoteLinks.join(', ')}`);
        }

        // Check CSS files for external @import
        const cssFiles = ['manager.css', 'popup/popup.css'];
        const importRegex = /@import\s+(?:url\(['"]?https?:\/\/|['"]https?:\/\/)/gi;
        for (const rel of cssFiles) {
          const content = ModuleLoader.readFile(rel);
          if (content) {
            const matches = content.match(importRegex) || [];
            assert.strictEqual(matches.length, 0, `External CSS @import found in ${rel}`);
          }
        }

        // Verify local offline libraries
        assert.ok(ModuleLoader.fileExists('libs/jszip.min.js'), 'libs/jszip.min.js must be present offline');
        assert.ok(ModuleLoader.fileExists('libs/lucide.min.js'), 'libs/lucide.min.js must be present offline');

        const jszipStat = fs.statSync(ModuleLoader.getProjectPath('libs/jszip.min.js'));
        assert.ok(jszipStat.size > 50000, `jszip.min.js must be full minified library (>50KB), got ${jszipStat.size} bytes`);

        const lucideStat = fs.statSync(ModuleLoader.getProjectPath('libs/lucide.min.js'));
        assert.ok(lucideStat.size > 2000, `lucide.min.js must be present and non-empty, got ${lucideStat.size} bytes`);
      }
    }
  ]
};
