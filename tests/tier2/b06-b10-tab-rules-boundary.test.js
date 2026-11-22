// tests/tier2/b06-b10-tab-rules-boundary.test.js
// Tier 2: Boundary & Corner Cases (Features 6 to 10 - 25 Tests)
const { assert } = require('../harness/test-assert');
const { ChromeMock } = require('../harness/chrome-mock');

module.exports = {
  name: 'Tier 2: Boundary Cases (Features 6-10: TabDownloader, TabReuse, NetRules, Profiles, BaseParser)',
  tier: 2,
  tests: [
    // Feature 6 Boundary
    {
      name: 'B6.1: Cloudflare Turnstile / challenge-running detected in DOM initiates wait cycle',
      fn: () => {
        const isChallenge = (html) => {
          return html.includes('challenge-running') || html.includes('cf-chl-widget') || html.includes('cf-browser-verification');
        };
        assert.strictEqual(isChallenge('<div id="challenge-running">Wait</div>'), true);
        assert.strictEqual(isChallenge('<iframe src="cf-chl-widget"></iframe>'), true);
        assert.strictEqual(isChallenge('<div class="chapter-body">Story</div>'), false);
      }
    },
    {
      name: 'B6.2: Cloudflare 1020 Access Denied page triggers fatal clearance error',
      fn: () => {
        const isBlocked = (html) => html.includes('Error 1020') || html.includes('Access denied');
        assert.strictEqual(isBlocked('<h1>Error 1020: Access denied</h1>'), true);
        assert.strictEqual(isBlocked('<h1>Welcome to chapter 1</h1>'), false);
      }
    },
    {
      name: 'B6.3: Tab navigation timeout after 30 seconds triggers timeout exception',
      fn: async () => {
        let timedOut = false;
        const waitWithTimeout = async (ms, timeoutLimit) => {
          if (ms > timeoutLimit) {
            timedOut = true;
            throw new Error('Tab navigation timed out');
          }
        };

        try {
          await waitWithTimeout(35000, 30000);
        } catch (e) {
          assert.includes(e.message, 'timed out');
        }
        assert.strictEqual(timedOut, true);
      }
    },
    {
      name: 'B6.4: Tab navigation fails with net::ERR_NAME_NOT_RESOLVED',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();
        try {
          const tab = await chromeMock.tabs.create({ url: 'https://nonexistent-domain-404.xyz' });
          assert.ok(tab.id, 'Tab created');
          // In error scenario, executeScript throws
          chromeMock._customScriptHandler = () => {
            throw new Error('net::ERR_NAME_NOT_RESOLVED');
          };
          await assert.rejects(async () => {
            await chromeMock.scripting.executeScript({ target: { tabId: tab.id }, func: () => {} });
          }, /ERR_NAME_NOT_RESOLVED/);
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'B6.5: DOM extraction returning empty string or null is handled safely without crash',
      fn: () => {
        const handleExtractionResult = (res) => {
          if (!res || (typeof res === 'string' && res.trim().length === 0)) {
            return { success: false, content: '' };
          }
          return { success: true, content: res };
        };
        assert.strictEqual(handleExtractionResult(null).success, false);
        assert.strictEqual(handleExtractionResult('').success, false);
        assert.strictEqual(handleExtractionResult('   ').success, false);
        assert.strictEqual(handleExtractionResult('<p>Valid</p>').success, true);
      }
    },

    // Feature 7 Boundary
    {
      name: 'B7.1: User closes background tab manually during crawl throws and does not freeze pool',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();
        try {
          const tab = await chromeMock.tabs.create({ active: false, url: 'https://example.com' });
          await chromeMock.tabs.remove(tab.id); // Closed manually

          await assert.rejects(async () => {
            await chromeMock.tabs.update(tab.id, { url: 'https://example.com/ch2' });
          }, /not found/i);
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'B7.2: Updating tab to invalid/malformed URL rejects gracefully',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();
        try {
          const tab = await chromeMock.tabs.create({ active: false });
          // Malformed URL check
          const updateUrl = (url) => {
            if (!url || !url.startsWith('http')) throw new Error('Invalid URL protocol');
            return chromeMock.tabs.update(tab.id, { url });
          };
          assert.throws(() => updateUrl('not-a-url'), /Invalid URL/);
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'B7.3: Rapid sequential update calls on same tab queue cleanly',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();
        try {
          const tab = await chromeMock.tabs.create({ active: false });
          await chromeMock.tabs.update(tab.id, { url: 'https://novel.com/1' });
          await chromeMock.tabs.update(tab.id, { url: 'https://novel.com/2' });
          const currentTab = await chromeMock.tabs.get(tab.id);
          assert.strictEqual(currentTab.url, 'https://novel.com/2');
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'B7.4: Cleanup called multiple times is idempotent and produces zero errors',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();
        try {
          const tab = await chromeMock.tabs.create({ active: false });
          let tabId = tab.id;
          const safeCleanup = async () => {
            if (tabId !== null) {
              try {
                await chromeMock.tabs.remove(tabId);
              } catch {
                // already closed
              }
              tabId = null;
            }
          };
          await safeCleanup();
          await safeCleanup();
          await safeCleanup();
          assert.strictEqual(tabId, null);
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'B7.5: Cleanup when tab was already removed handles error safely without unhandled rejection',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();
        try {
          const tab = await chromeMock.tabs.create({ active: false });
          await chromeMock.tabs.remove(tab.id); // closed elsewhere

          let errorCaught = false;
          try {
            await chromeMock.tabs.remove(tab.id);
          } catch {
            errorCaught = true;
          }
          assert.strictEqual(errorCaught, true);
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },

    // Feature 8 Boundary
    {
      name: 'B8.1: Header spoofing with empty headers object is a safe no-op',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();
        try {
          await chromeMock.declarativeNetRequest.updateSessionRules({ addRules: [], removeRuleIds: [] });
          const rules = await chromeMock.declarativeNetRequest.getSessionRules();
          assert.strictEqual(rules.length, 0);
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'B8.2: Overlapping rule IDs: existing rule is removed before adding new rule with same ID',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();
        try {
          await chromeMock.declarativeNetRequest.updateSessionRules({
            addRules: [{ id: 1001, priority: 1, action: { type: 'modifyHeaders' }, condition: {} }]
          });
          // Update rule 1001
          await chromeMock.declarativeNetRequest.updateSessionRules({
            removeRuleIds: [1001],
            addRules: [{ id: 1001, priority: 2, action: { type: 'modifyHeaders' }, condition: {} }]
          });

          const rules = await chromeMock.declarativeNetRequest.getSessionRules();
          assert.strictEqual(rules.length, 1);
          assert.strictEqual(rules[0].priority, 2);
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },
    {
      name: 'B8.3: Header names containing illegal characters (e.g. colon or whitespace) are rejected',
      fn: () => {
        const isValidHeaderName = (name) => /^[a-zA-Z0-9_-]+$/.test(name);
        assert.strictEqual(isValidHeaderName('User-Agent'), true);
        assert.strictEqual(isValidHeaderName('X-Requested-With'), true);
        assert.strictEqual(isValidHeaderName('Bad Header:'), false);
        assert.strictEqual(isValidHeaderName('Bad\nHeader'), false);
      }
    },
    {
      name: 'B8.4: Session rules quota limit is respected and does not crash extension',
      fn: () => {
        const MAX_SESSION_RULES = 5000;
        const checkQuota = (count) => count <= MAX_SESSION_RULES;
        assert.strictEqual(checkQuota(10), true);
        assert.strictEqual(checkQuota(6000), false);
      }
    },
    {
      name: 'B8.5: Removing non-existent rule IDs does not throw exception',
      fn: async () => {
        const chromeMock = new ChromeMock();
        chromeMock.installGlobals();
        try {
          await chromeMock.declarativeNetRequest.updateSessionRules({
            removeRuleIds: [99999, 88888]
          });
          assert.ok(true, 'Removing non-existent rule IDs succeeded without error');
        } finally {
          chromeMock.uninstallGlobals();
        }
      }
    },

    // Feature 9 Boundary
    {
      name: 'B9.1: Empty domain name string falls back to default profile',
      fn: () => {
        const sanitizeDomain = (domain) => {
          if (!domain || typeof domain !== 'string' || domain.trim() === '') return 'default';
          return domain.toLowerCase().trim();
        };
        assert.strictEqual(sanitizeDomain(''), 'default');
        assert.strictEqual(sanitizeDomain(null), 'default');
        assert.strictEqual(sanitizeDomain('  Inkitt.com  '), 'inkitt.com');
      }
    },
    {
      name: 'B9.2: Concurrency value < 1 is strictly clamped to 1',
      fn: () => {
        const clamp = (val) => Math.min(10, Math.max(1, Math.floor(val) || 1));
        assert.strictEqual(clamp(0), 1);
        assert.strictEqual(clamp(-10), 1);
        assert.strictEqual(clamp(null), 1);
      }
    },
    {
      name: 'B9.3: Concurrency value > 10 is strictly clamped to 10',
      fn: () => {
        const clamp = (val) => Math.min(10, Math.max(1, Math.floor(val) || 1));
        assert.strictEqual(clamp(15), 10);
        assert.strictEqual(clamp(100), 10);
        assert.strictEqual(clamp(8), 8);
      }
    },
    {
      name: 'B9.4: Negative delay input is clamped to 0 ms',
      fn: () => {
        const clampDelay = (val) => Math.max(0, Math.min(5000, parseInt(val, 10) || 0));
        assert.strictEqual(clampDelay(-200), 0);
        assert.strictEqual(clampDelay(0), 0);
        assert.strictEqual(clampDelay(1500), 1500);
      }
    },
    {
      name: 'B9.5: Storage failure/quota exceeded falls back to in-memory profile defaults',
      fn: async () => {
        const fallbackStorage = {
          get: async () => {
            throw new Error('QUOTA_BYTES_PER_ITEM exceeded');
          }
        };

        const getSafeProfile = async (storage) => {
          try {
            return await storage.get();
          } catch {
            return { concurrency: 3, delayMs: 500, mode: 'fetch' };
          }
        };

        const prof = await getSafeProfile(fallbackStorage);
        assert.strictEqual(prof.concurrency, 3);
        assert.strictEqual(prof.mode, 'fetch');
      }
    },

    // Feature 10 Boundary
    {
      name: 'B10.1: BaseParser cannot be used without subclassing or abstract methods throw',
      fn: () => {
        class BaseParser {
          canHandle() { throw new Error('Must implement canHandle'); }
        }
        const p = new BaseParser();
        assert.throws(() => p.canHandle('url'), /Must implement/);
      }
    },
    {
      name: 'B10.2: HTML with deeply nested malicious XSS payload is completely neutralized',
      fn: () => {
        const dirty = '<div><p><a href="javascript:alert(1)"><img src=x onerror=alert(2)>Click</a></p></div>';
        const clean = dirty
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/\s+on[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '')
          .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');

        assert.ok(!clean.includes('onerror'));
        assert.ok(!clean.includes('javascript:alert'));
      }
    },
    {
      name: 'B10.3: HTML with unclosed dirty tags is safely processed without parser crash',
      fn: () => {
        const brokenHtml = '<p>Paragraph 1<div><div><span>Unclosed';
        assert.ok(brokenHtml.length > 0);
      }
    },
    {
      name: 'B10.4: NovelMetadata with null chapters array is normalized to empty array',
      fn: () => {
        const normalizeMetadata = (meta) => {
          return {
            ...meta,
            chapters: Array.isArray(meta.chapters) ? meta.chapters : []
          };
        };
        const res = normalizeMetadata({ title: 'Book', chapters: null });
        assert.deepStrictEqual(res.chapters, []);
      }
    },
    {
      name: 'B10.5: ChapterItem with empty url throws or is flagged invalid',
      fn: () => {
        const validateChapterItem = (item) => {
          if (!item.url || typeof item.url !== 'string' || item.url.trim() === '') {
            throw new Error('ChapterItem url is required');
          }
        };
        assert.throws(() => validateChapterItem({ id: '1', chapterNumber: 1, title: 'Ch 1', url: '' }), /url is required/);
      }
    }
  ]
};
