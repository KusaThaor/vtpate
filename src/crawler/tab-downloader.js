// src/crawler/tab-downloader.js
// Mode 2: Browser-Tab Assisted Downloader with Cloudflare Detection, Tab Reuse & In-Tab SPA Multi-Page TOC Extractor

class TabDownloader {
  constructor(options = {}) {
    this.challengePollIntervalMs = options.challengePollIntervalMs !== undefined
      ? Math.max(10, Number(options.challengePollIntervalMs))
      : 500;
    this.maxChallengeWaitMs = options.maxChallengeWaitMs !== undefined
      ? Math.max(1000, Number(options.maxChallengeWaitMs))
      : 30000;
    this.pageLoadWaitMs = options.pageLoadWaitMs !== undefined
      ? Math.max(200, Number(options.pageLoadWaitMs))
      : 2000;
    this.timeoutMs = options.timeoutMs !== undefined
      ? Math.max(1000, Number(options.timeoutMs))
      : 30000;
    this.delayMs = options.delayMs !== undefined
      ? Math.max(0, Number(options.delayMs))
      : 0;
    this.jitter = options.jitter !== false;
    this.visibleTab = options.visibleTab === true;
    this.backgroundChapters = options.backgroundChapters === true;
    this.recheckWaitSeconds = options.recheckWaitSeconds !== undefined
      ? Math.max(3, Number(options.recheckWaitSeconds))
      : 10;

    this.shouldCancel = options.shouldCancel || (() => false);
    this.onChallenge = options.onChallenge || null;
    this.onPassword = options.onPassword || null;
    this.onInPlaceWait = options.onInPlaceWait || null;
    this.onStateChange = options.onStateChange || (() => {});
    this.waitForResume = options.waitForResume || (async () => {});
    this.tabId = null;
    this.isInitialized = false;
    this.currentUrl = null;
    this.navigationVersion = 0;
    this.isWaitingForChallenge = false;
    this.isWaitingForPassword = false;
    this._skipPassword = false;
    this._reloadPromise = null;
    this.lastDownloadedChapterNumber = null;
  }

  async initialize() {
    if (this.tabId !== null) {
      return this.tabId;
    }

    if (typeof chrome === 'undefined' || !chrome.tabs) {
      throw new Error('Chrome extension tabs API is not available');
    }

    const tab = await chrome.tabs.create({
      active: this.visibleTab === true,
      url: 'about:blank'
    });

    this.tabId = tab.id;
    this.isInitialized = true;
    return this.tabId;
  }

  _isChallenge(content) {
    if (!content || typeof content !== 'string') {
      return false;
    }
    // Cloudflare also injects challenge-platform scripts into ordinary pages.
    // Only the verification page itself should block extraction.
    const markup = content
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
    const title = (/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(markup)?.[1] || '').trim();
    if (/^(Just a moment(?:\.{3}|…)?|Attention Required!\s*\|\s*Cloudflare|Checking your browser(?:\.{3}|…)?)$/i.test(title)) return true;
    const challengeContainer = /<(?:form|div|section)\b[^>]*\bid\s*=\s*["'](?:challenge-form|challenge-running|cf-browser-verification)["']/i.test(markup);
    const visibleText = markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    return challengeContainer && /just a moment|checking your browser|verifying you are human|verify you are human|performing security verification|enable javascript and cookies/i.test(visibleText);
  }

  _isPasswordProtected(content) {
    if (!content || typeof content !== 'string') return false;
    const markup = content
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
    const hasPasswordInput = /<input\b[^>]*type\s*=\s*["']password["']/i.test(markup);
    const hasPasswordForm = /<(?:form|div|section)\b[^>]*\b(?:class|id|name)\s*=\s*["'][^"']*(?:post-password-form|chapter-protected|pwbox|pass-protect|chapter-pass|nhap-pass|password-form)[^"']*["']/i.test(markup);
    const visibleText = markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    const hasPasswordPhrases = /(?:nhập\s+(?:mật\s*khẩu|pass)|chương\s+(?:này\s+)?(?:bị\s+khóa|cần\s+pass|có\s+pass)|password\s+protected|enter\s+the\s+password|vui\s+lòng\s+nhập\s+pass)/i.test(visibleText);
    return (hasPasswordInput && (hasPasswordPhrases || hasPasswordForm)) || (hasPasswordForm && hasPasswordPhrases);
  }

  _isSameOrRedirectedChapter(snapshotUrl, targetUrl) {
    if (!snapshotUrl || !targetUrl) return false;
    try {
      const u1 = new URL(snapshotUrl);
      const u2 = new URL(targetUrl);
      const host1 = u1.hostname.replace(/^www\./, '').toLowerCase();
      const host2 = u2.hostname.replace(/^www\./, '').toLowerCase();
      if (host1 !== host2) return false;

      // 0. Query parameter-based chapter inspection (SPA / reader sites)
      const chapKey1 = ['chapter', 'chap', 'c', 'id', 'chapterId', 'chapter_id'].find(k => u1.searchParams.has(k));
      const chapKey2 = ['chapter', 'chap', 'c', 'id', 'chapterId', 'chapter_id'].find(k => u2.searchParams.has(k));

      if (chapKey1 || chapKey2) {
        // If both URLs specify chapter IDs via query params, they MUST match
        if (chapKey1 && chapKey2) {
          const val1 = (u1.searchParams.get(chapKey1) || '').toLowerCase();
          const val2 = (u2.searchParams.get(chapKey2) || '').toLowerCase();
          return Boolean(val1 && val2 && val1 === val2);
        }
        // One has chapter query param and the other doesn't -> definitely different
        return false;
      }

      // Check if pathname is generic SPA reader endpoint (/reader, /read, /view, /index.php, /)
      const clean1 = u1.pathname.replace(/\/+$/, '').toLowerCase();
      const clean2 = u2.pathname.replace(/\/+$/, '').toLowerCase();
      const isGenericPath = /^\/(?:reader|read|view|story|truyen|chapter|index\.php)?\/?$/.test(clean1);
      if (isGenericPath) {
        // For generic reader path, full search query must match
        return clean1 === clean2 && u1.search.toLowerCase() === u2.search.toLowerCase();
      }

      // 1. Trực tiếp khớp đường dẫn (bỏ dấu gạch chéo cuối) - when search queries match
      if (clean1 === clean2 && u1.search.toLowerCase() === u2.search.toLowerCase()) return true;

      // 2. Chuẩn hóa các tiền tố thư mục truyện (/truyen-chu/ vs /truyen/ vs /doc-truyen/)
      const norm1 = clean1.replace(/^\/(?:truyen-chu|truyen|doc-truyen|stories|story|novel)\//, '/');
      const norm2 = clean2.replace(/^\/(?:truyen-chu|truyen|doc-truyen|stories|story|novel)\//, '/');
      if (norm1 === norm2 && u1.search.toLowerCase() === u2.search.toLowerCase()) return true;

      // 3. So khớp slug cuối của chương
      const slug1 = clean1.split('/').filter(Boolean).pop() || '';
      const slug2 = clean2.split('/').filter(Boolean).pop() || '';
      if (!slug1 || !slug2) return false;
      if (slug1 === slug2) return true;

      // 4. Khớp chính xác theo số chương (Chapter Number)
      const extractNum = (s) => {
        const m = s.match(/(?:chuong|chapter|chap|c)[-_]?(\d+(?:\.\d+)?)/i) || s.match(/^(\d+)$/);
        return m ? parseFloat(m[1]) : null;
      };
      const num1 = extractNum(slug1);
      const num2 = extractNum(slug2);
      if (num1 !== null && num2 !== null) {
        return num1 === num2;
      }

      // 5. Khớp tiền tố (vd: "chuong-37-cau-meo" bắt đầu bằng "chuong-37" do web thêm tiêu đề)
      if (slug1.startsWith(slug2) || slug2.startsWith(slug1)) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  _poll() {
    return new Promise(resolve => {
      const finish = () => {
        clearTimeout(timer);
        if (this._wakePoll === finish) this._wakePoll = null;
        resolve();
      };
      const timer = setTimeout(finish, this.challengePollIntervalMs);
      this._wakePoll = finish;
    });
  }

  retryCurrentChapter() {
    this._wakePoll?.();
  }

  skipPasswordCurrentChapter() {
    this._skipPassword = true;
    this._wakePoll?.();
  }

  async _updateTab(updateProps, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await chrome.tabs.update(this.tabId, updateProps);
      } catch (err) {
        const msg = err?.message || '';
        if (msg.includes('user may be dragging a tab') || msg.includes('Tabs cannot be edited right now')) {
          if (attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
            continue;
          }
        }
        throw err;
      }
    }
  }

  async reloadCurrentChapter() {
    if (!this.currentUrl || this.shouldCancel()) throw new Error('Không có chương đang tải để tải lại.');
    if (this._reloadPromise) return this._reloadPromise;
    ++this.navigationVersion;
    this._reloadPromise = (async () => {
      await this._updateTab({ url: this.currentUrl, active: true });
      await new Promise(resolve => setTimeout(resolve, this.pageLoadWaitMs));
    })();
    try {
      await this._reloadPromise;
    } finally {
      this._reloadPromise = null;
      this._wakePoll?.();
    }
  }

  async recheckCurrentTabContent(customSelector = '') {
    if (this.tabId === null) return null;
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: this.tabId },
        args: [customSelector],
        func: (contentSelector) => {
          const fallbackSelectors = [
            contentSelector,
            'div.reader-demo-body',
            '#chapter-content',
            '.chapter-c',
            '.chapter-content',
            '.reading-content',
            '.entry-content',
            'article',
            '.content'
          ].filter(Boolean);

          let foundEl = null;
          for (const sel of fallbackSelectors) {
            const el = document.querySelector(sel);
            if (el && el.textContent.trim().length > 50) {
              foundEl = el;
              break;
            }
          }

          const bodyText = document.body ? document.body.innerText.trim() : '';
          const hasContent = Boolean(foundEl || bodyText.length > 100);
          return {
            html: document.documentElement.outerHTML || document.body.innerHTML,
            url: location.href,
            hasContent
          };
        }
      });
      const snap = results?.[0]?.result;
      if (snap && snap.hasContent) {
        return snap.html;
      }
      return null;
    } catch {
      return null;
    }
  }

  async tryClickNextChapter(contentSelector = '', nextBtnSelector = '') {
    if (this.tabId === null) return null;
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: this.tabId },
        args: [contentSelector, nextBtnSelector],
        func: (sel, customNextBtn) => {
          function isClickable(el) {
            if (!el || el.disabled) return false;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return false;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
            return true;
          }

          let oldEl = sel ? document.querySelector(sel) : null;
          if (!oldEl) oldEl = document.querySelector('div.reader-demo-body, #chapter-content, .chapter-content, article');
          const oldTextLength = oldEl ? oldEl.textContent.trim().length : 0;
          const oldUrl = location.href;
          const heading = document.querySelector('h2.reader-demo-chapter-heading, h2.chapter-title, h1, .chapter-title, .reader-demo-footer-btn--chapter');
          const oldHeading = heading ? heading.textContent.trim() : '';

          // 1. High-priority selectors for reader next buttons
          const specificSelectors = [
            customNextBtn,
            'button.reader-demo-footer-btn--next',
            '.reader-demo-footer-btn--next',
            '.reader-demo-footer-nav .reader-demo-footer-btn--next',
            'button[aria-label="Chương sau"]',
            'button[aria-label*="Chương sau" i]',
            '[aria-label="Chương sau"]',
            '.reader-demo-footer-btn:last-child',
            'button.reader-nav-next',
            'a.reader-nav-next',
            '.reader-bottom-nav button:last-child',
            '.reader-bottom-nav a:last-child',
            '.reader-navigation button:last-child',
            '.reader-footer button:last-child',
            '[class*="reader-bottom"] button:last-child',
            '[class*="reader-demo"] button:last-child',
            'button[title*="sau" i]',
            'button[title*="tiếp" i]',
            'a[title*="sau" i]',
            'a[title*="tiếp" i]',
            'button[aria-label*="sau" i]',
            'button[aria-label*="next" i]',
            'a[aria-label*="sau" i]',
            'a[aria-label*="next" i]',
            'a.next-chapter',
            'a.btn-next',
            'button.btn-next',
            '[data-action="next-chapter"]',
            '[data-direction="next"]'
          ].filter(Boolean);

          let nextBtn = null;
          let method = '';
          for (const s of specificSelectors) {
            try {
              const el = document.querySelector(s);
              if (isClickable(el)) {
                nextBtn = el;
                method = 'selector: ' + s;
                break;
              }
            } catch (_) {}
          }

          // 2. Floating right-edge chevron button (e.g. giatocvuongtai right margin)
          if (!nextBtn) {
            const sideCandidates = Array.from(document.querySelectorAll('button, a, [role="button"], div, span'));
            for (const el of sideCandidates) {
              if (!isClickable(el)) continue;
              const rect = el.getBoundingClientRect();
              if (rect.right >= window.innerWidth - 80 && rect.top > 120 && rect.bottom < window.innerHeight - 100) {
                const txt = (el.innerText || el.textContent || '').trim();
                const h = el.innerHTML.toLowerCase();
                const isArrow = txt === '>' || txt === '»' || txt === '›' || txt === '→';
                const isSvg = h.includes('chevron') || h.includes('arrow') || h.includes('polyline') || h.includes('<path');
                if (isArrow || isSvg) {
                  nextBtn = el;
                  method = 'floating right-edge chevron: ' + (txt || 'svg');
                  break;
                }
              }
            }
          }

          // 3. Bottom navigation bar search (specifically for Gia Tộc Vượng Tài / SPA readers)
          if (!nextBtn) {
            const bottomCandidates = Array.from(document.querySelectorAll('.reader-demo-footer-nav, .reader-bottom-nav, .reader-footer, [class*="bottom-nav"], [class*="reader-nav"], [class*="reader-bottom"], footer, div')).filter(el => {
              const r = el.getBoundingClientRect();
              return r.bottom >= window.innerHeight - 80 && r.height > 20 && r.width > window.innerWidth * 0.4;
            });

            for (const bottomBar of bottomCandidates) {
              const bBtns = Array.from(bottomBar.querySelectorAll('button, a, [role="button"], div, span')).filter(b => isClickable(b));
              const rightBtns = bBtns.filter(b => {
                const r = b.getBoundingClientRect();
                return r.left >= window.innerWidth * 0.45;
              });

              for (let i = rightBtns.length - 1; i >= 0; i--) {
                const b = rightBtns[i];
                const txt = (b.innerText || b.textContent || '').trim();
                const h = b.innerHTML.toLowerCase();
                const isArrow = txt === '>' || txt === '»' || txt === '›' || txt === '→';
                const isNext = isArrow || h.includes('chevron-right') || h.includes('arrow-right') || h.includes('9 18 15 12 9 6') || h.includes('lucide') || h.includes('<path') || h.includes('<polyline');
                if (isNext) {
                  nextBtn = b;
                  method = 'bottom-bar right button: ' + (txt || 'chevron');
                  break;
                }
              }
              if (nextBtn) break;
            }
          }

          // 4. Scan all interactive elements on the page (strictly ignoring header rect.top < 80)
          if (!nextBtn) {
            const all = Array.from(document.querySelectorAll('button, a, [role="button"], div.cursor-pointer, span.cursor-pointer'));
            for (const el of all) {
              if (!isClickable(el)) continue;
              const rect = el.getBoundingClientRect();
              
              // NEVER click elements in the top header (like settings ⚙️ or search)
              if (rect.top < 80) continue;

              const txt = (el.innerText || el.textContent || '').trim();
              const html = el.innerHTML.toLowerCase();
              const title = (el.getAttribute('title') || '').toLowerCase();
              const aria = (el.getAttribute('aria-label') || '').toLowerCase();

              const hasNextWord = /^(sau|chương sau|tiếp|tiếp theo|next|next chapter)$/i.test(txt) ||
                title.includes('sau') || title.includes('next') || aria.includes('sau') || aria.includes('next');
              const isArrow = txt === '>' || txt === '»' || txt === '›' || txt === '→';
              const hasRightSvg = (html.includes('chevron-right') || html.includes('arrow-right') || html.includes('lucide-chevron-right') || html.includes('9 18 15 12 9 6')) && rect.left > window.innerWidth * 0.45;

              if (hasNextWord || ((isArrow || hasRightSvg) && rect.left > window.innerWidth * 0.4)) {
                nextBtn = el;
                method = 'heuristic: ' + (txt || 'arrow-svg') + ' at x=' + Math.round(rect.left) + ' y=' + Math.round(rect.top);
                break;
              }
            }
          }

          if (nextBtn) {
            try {
              const targetEl = nextBtn.closest('button, a, [role="button"], [class*="btn"], [class*="button"]') || nextBtn;
              targetEl.scrollIntoView({ behavior: 'instant', block: 'center' });
              
              const rect = targetEl.getBoundingClientRect();
              const clientX = Math.round(rect.left + rect.width / 2);
              const clientY = Math.round(rect.top + rect.height / 2);

              const mouseOpts = { bubbles: true, cancelable: true, view: window, clientX, clientY };
              targetEl.dispatchEvent(new PointerEvent('pointerdown', mouseOpts));
              targetEl.dispatchEvent(new MouseEvent('mousedown', mouseOpts));
              targetEl.dispatchEvent(new PointerEvent('pointerup', mouseOpts));
              targetEl.dispatchEvent(new MouseEvent('mouseup', mouseOpts));
              targetEl.click();

              if (targetEl !== nextBtn) {
                try {
                  nextBtn.dispatchEvent(new PointerEvent('pointerdown', mouseOpts));
                  nextBtn.dispatchEvent(new MouseEvent('mousedown', mouseOpts));
                  nextBtn.dispatchEvent(new PointerEvent('pointerup', mouseOpts));
                  nextBtn.dispatchEvent(new MouseEvent('mouseup', mouseOpts));
                  nextBtn.click();
                } catch (_) {}
              }

              // Also dispatch ArrowRight key event for readers that listen to keyboard
              try {
                const kOpts = { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, which: 39, bubbles: true };
                window.dispatchEvent(new KeyboardEvent('keydown', kOpts));
                document.dispatchEvent(new KeyboardEvent('keydown', kOpts));
                window.dispatchEvent(new KeyboardEvent('keyup', kOpts));
                document.dispatchEvent(new KeyboardEvent('keyup', kOpts));
              } catch (_) {}

              return { clicked: true, method, oldUrl, oldHeading, oldTextLength };
            } catch (_) {}
          }
          return { clicked: false };
        }
      });
      return results?.[0]?.result || null;
    } catch {
      return null;
    }
  }

  async _probeTabContent(contentSelector = '') {
    if (this.tabId === null) return null;
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: this.tabId },
        args: [contentSelector],
        func: (sel) => {
          let foundEl = null;
          const fallbackSelectors = [
            sel,
            'div.reader-demo-body',
            '#chapter-content',
            '.chapter-c',
            '.chapter-content',
            '.reading-content',
            '.entry-content',
            'article',
            '.content'
          ].filter(Boolean);

          for (const s of fallbackSelectors) {
            try {
              const el = document.querySelector(s);
              if (el && el.textContent.trim().length > 50) {
                foundEl = el;
                break;
              }
            } catch (_) {}
          }

          const headingEl = document.querySelector('h2.reader-demo-chapter-heading, h2.chapter-title, h1, .chapter-title');
          let headingText = headingEl ? headingEl.textContent.trim() : '';

          // Gia Tộc Vượng Tài / SPA: bottom chapter button
          const footerChapBtn = document.querySelector('.reader-demo-footer-btn--chapter, [aria-label="Chọn chương"], [class*="footer-btn--chapter"]');
          if (footerChapBtn) {
            const footerTxt = footerChapBtn.textContent.trim();
            if (!headingText) headingText = footerTxt;
          }

          let detectedChapNum = null;
          // 1. Heading check
          if (detectedChapNum === null && headingText) {
            let mHead = headingText.match(/chương\s*(\d+)/i) || headingText.match(/chap(?:ter)?\.?\s*(\d+)/i);
            if (mHead) detectedChapNum = parseInt(mHead[1], 10);
          }
          // 2. Footer chap button check
          if (detectedChapNum === null && footerChapBtn) {
            const mFoot = footerChapBtn.textContent.match(/(?:chương|chap|chapter)\s*(\d+)/i);
            if (mFoot) detectedChapNum = parseInt(mFoot[1], 10);
          }
          // 3. Element specifically stating CHƯƠNG X (like tag above heading)
          if (detectedChapNum === null) {
            const chapSubElements = Array.from(document.querySelectorAll('[class*="chapter"], h3, h4, h5, div, span, p')).filter(el => {
              const t = (el.textContent || '').trim();
              return /^(?:chương|chap|chapter)\s*\d+$/i.test(t);
            });
            if (chapSubElements.length > 0) {
              const m = chapSubElements[0].textContent.match(/(?:chương|chap|chapter)\s*(\d+)/i);
              if (m) detectedChapNum = parseInt(m[1], 10);
            }
          }
          // 4. Bottom bar or Top bar check (e.g. "Chương 44: Tạm thời...")
          if (detectedChapNum === null) {
            const navBars = Array.from(document.querySelectorAll('header, footer, [class*="reader-header"], [class*="reader-bottom"], [class*="bottom-nav"], [class*="top-nav"], [class*="footer"], .reader-demo-footer-nav'));
            for (const bar of navBars) {
              const m = (bar.textContent || '').match(/(?:chương|chap|chapter)\s*(\d+)/i);
              if (m) {
                detectedChapNum = parseInt(m[1], 10);
                break;
              }
            }
          }
          // 5. Document title check
          if (detectedChapNum === null) {
            const mTitle = (document.title || '').match(/(?:chương|chap|chapter)\s*(\d+)/i);
            if (mTitle) detectedChapNum = parseInt(mTitle[1], 10);
          }
          // 6. Body text prefix check
          if (detectedChapNum === null && document.body) {
            const topText = document.body.innerText.slice(0, 3000);
            const mTop = topText.match(/(?:chương|chap|chapter)\s*(\d+)/i);
            if (mTop) detectedChapNum = parseInt(mTop[1], 10);
          }

          const bodyText = document.body ? (document.body.innerText || '').trim() : '';
          const hasContent = Boolean(foundEl || bodyText.length > 80);
          return {
            html: document.documentElement.outerHTML || document.body.innerHTML,
            url: location.href,
            ready: hasContent,
            chapterNumber: detectedChapNum,
            headingText,
            textLength: foundEl ? foundEl.textContent.trim().length : bodyText.length
          };
        }
      });
      return results?.[0]?.result || null;
    } catch {
      return null;
    }
  }

  async fetchChapter(url, options = {}) {
    if (!url || typeof url !== 'string') {
      throw new Error('Valid URL string is required for fetchChapter');
    }

    if (this.tabId === null) {
      await this.initialize();
    }

    if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.scripting) {
      throw new Error('Chrome extension tabs and scripting APIs are required for TabDownloader');
    }

    if (this.delayMs > 0) {
      const delay = this.jitter
        ? Math.floor(this.delayMs * 0.7 + Math.random() * (this.delayMs * 0.6))
        : this.delayMs;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const selector = options.chapterContentSelector ||
      (new URL(url).hostname === 'giatocvuongtai.com' ? 'div.reader-demo-body' : '');
    const nextBtnSelector = options.nextChapterButtonSelector || options.nextChapterBtnSelector || '';
    const targetChapNum = options.chapterNumber || options.chapter?.chapterNumber || null;
    const isSpaReader = Boolean(url.includes('giatocvuongtai.com') || (this.currentUrl && this.currentUrl.includes('/reader')));

    // TIER 1: Check if current tab is ALREADY displaying target chapter (Instant Zero-Delay Grab)
    if (this.tabId !== null) {
      try {
        const currentProbe = await this._probeTabContent(selector);
        if (currentProbe && currentProbe.ready && currentProbe.textLength > 100) {
          const chapMatches = targetChapNum !== null && currentProbe.chapterNumber !== null && Number(currentProbe.chapterNumber) === Number(targetChapNum);
          const chapMismatches = targetChapNum !== null && currentProbe.chapterNumber !== null && Number(currentProbe.chapterNumber) !== Number(targetChapNum);

          // Tier 1 matches ONLY if chapter numbers explicitly match OR (if chapter number is unknown) URLs match
          const isSameChapter = chapMatches || (!chapMismatches && currentProbe.url && this._isSameOrRedirectedChapter(currentProbe.url, url));

          if (isSameChapter) {
            this.currentUrl = currentProbe.url;
            if (targetChapNum !== null) this.lastDownloadedChapterNumber = Number(targetChapNum);
            this.onStateChange();
            return currentProbe.html;
          }

          // TIER 2: Tab is at previous chapter (Chương N-1) OR sequential crawl -> Click In-Page Next Button
          const isPrevChap = currentProbe.chapterNumber !== null && targetChapNum !== null && Number(currentProbe.chapterNumber) === Number(targetChapNum) - 1;
          const isAlreadyAhead = currentProbe.chapterNumber !== null && targetChapNum !== null && Number(currentProbe.chapterNumber) >= Number(targetChapNum);
          const isSequentialDownload = targetChapNum !== null && this.lastDownloadedChapterNumber !== null && Number(targetChapNum) === Number(this.lastDownloadedChapterNumber) + 1;

          if (isSpaReader && !isAlreadyAhead && (isPrevChap || isSequentialDownload)) {
            const clickSnap = await this.tryClickNextChapter(selector, nextBtnSelector);
            if (clickSnap && clickSnap.clicked) {
              const waitLimit = Math.max(6000, (this.pageLoadWaitMs || 2500) * 2);
              const pollStart = Date.now();
              while (Date.now() - pollStart < waitLimit) {
                await new Promise(r => setTimeout(r, 200));
                const probeRes = await this._probeTabContent(selector);
                if (probeRes && probeRes.ready && probeRes.textLength > 100) {
                  const reachedTargetChap = targetChapNum !== null && probeRes.chapterNumber !== null && Number(probeRes.chapterNumber) === Number(targetChapNum);
                  const isNewerChapter = probeRes.chapterNumber !== null && Number(probeRes.chapterNumber) > Number(currentProbe.chapterNumber || 0);
                  const chapMismatch = targetChapNum !== null && probeRes.chapterNumber !== null && Number(probeRes.chapterNumber) !== Number(targetChapNum);
                  const urlChangedToNew = (probeRes.url !== clickSnap.oldUrl) && (!targetChapNum || probeRes.chapterNumber === null || reachedTargetChap);

                  if (reachedTargetChap || (!chapMismatch && urlChangedToNew && isNewerChapter)) {
                    this.currentUrl = probeRes.url;
                    if (targetChapNum !== null) this.lastDownloadedChapterNumber = Number(targetChapNum);
                    else if (probeRes.chapterNumber !== null) this.lastDownloadedChapterNumber = Number(probeRes.chapterNumber);
                    this.onStateChange();
                    return probeRes.html;
                  }
                }
              }
            }
          }
        }
      } catch (_) {}
    }

    // TIER 3: Standard Direct Tab Navigation (Fallback)
    await this.waitForResume();
    if (this.shouldCancel()) throw new Error('Đã dừng tải theo yêu cầu.');
    const updateProps = { url };
    if (this.visibleTab && !this.backgroundChapters) {
      updateProps.active = true;
    }
    this.currentUrl = url;
    this._forcedSpaReload = false;
    ++this.navigationVersion;
    this.onStateChange();
    await this._updateTab(updateProps);

    // Wait for initial page navigation & DOM rendering
    if (this.pageLoadWaitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.pageLoadWaitMs));
    }

    let startTime = Date.now();
    let challengeNotified = false;
    let passwordNotified = false;
    let version = this.navigationVersion;
    let inPlaceGraceAttempted = false;

    try {
      while (true) {
        const pauseStart = Date.now();
        await this.waitForResume();
        startTime += Date.now() - pauseStart;
        if (this.shouldCancel()) throw new Error('Đã dừng tải theo yêu cầu.');
        if (this._reloadPromise) await this._reloadPromise;
        if (version !== this.navigationVersion) {
          version = this.navigationVersion;
          startTime = Date.now();
        }
        let injectionResults;
        try {
          injectionResults = await chrome.scripting.executeScript({
            target: { tabId: this.tabId },
            args: [selector],
            func: (contentSelector) => {
              let foundEl = null;
              let matchedSelector = null;
              if (contentSelector) {
                try {
                  const el = document.querySelector(contentSelector);
                  if (el && el.textContent.trim().length > 0) {
                    foundEl = el;
                    matchedSelector = contentSelector;
                  }
                } catch (_) {}
              }

              if (!foundEl && !contentSelector) {
                const fallbackSelectors = [
                  'div.reader-demo-body',
                  '#chapter-content',
                  '.chapter-c',
                  '.chapter-content',
                  '.reading-content',
                  '.entry-content',
                  'article',
                  '.content',
                  '.text-left'
                ];
                for (const sel of fallbackSelectors) {
                  try {
                    const el = document.querySelector(sel);
                    if (el && el.textContent.trim().length > 0) {
                      foundEl = el;
                      matchedSelector = sel;
                      break;
                    }
                  } catch (_) {}
                }
              }

              const headingEl = document.querySelector('h2.reader-demo-chapter-heading, h2.chapter-title, h1, .chapter-title');
              let headingText = headingEl ? headingEl.textContent.trim() : '';

              const footerChapBtn = document.querySelector('.reader-demo-footer-btn--chapter, [aria-label="Chọn chương"], [class*="footer-btn--chapter"]');
              if (footerChapBtn) {
                const footerTxt = footerChapBtn.textContent.trim();
                if (!headingText) headingText = footerTxt;
              }

              const docTitle = document.title || '';
              let detectedChapNum = null;
              if (detectedChapNum === null && headingText) {
                const mHead = headingText.match(/(?:chương|chuong|chapter|chap|c\.)\s*(\d+(?:\.\d+)?)/i);
                if (mHead) detectedChapNum = parseFloat(mHead[1]);
              }
              if (detectedChapNum === null && footerChapBtn) {
                const mFoot = footerChapBtn.textContent.match(/(?:chương|chuong|chapter|chap|c\.)\s*(\d+(?:\.\d+)?)/i);
                if (mFoot) detectedChapNum = parseFloat(mFoot[1]);
              }
              if (detectedChapNum === null) {
                const chapSubElements = Array.from(document.querySelectorAll('[class*="chapter"], h3, h4, h5, div, span, p')).filter(el => {
                  const t = (el.textContent || '').trim();
                  return /^(?:chương|chap|chapter)\s*\d+$/i.test(t);
                });
                if (chapSubElements.length > 0) {
                  const m = chapSubElements[0].textContent.match(/(?:chương|chap|chapter)\s*(\d+)/i);
                  if (m) detectedChapNum = parseFloat(m[1]);
                }
              }
              if (detectedChapNum === null) {
                const mDocTitle = docTitle.match(/(?:chương|chuong|chapter|chap|c\.)\s*(\d+(?:\.\d+)?)/i);
                if (mDocTitle) detectedChapNum = parseFloat(mDocTitle[1]);
              }

              const bodySnippet = document.body ? (document.body.innerText || document.body.textContent || '').slice(0, 200).replace(/\s+/g, ' ').trim() : '';
              const currentHref = location.href;
              const isReady = document.readyState !== 'loading' && (!contentSelector ? Boolean(foundEl || bodySnippet.length > 80) : Boolean(foundEl));

              return {
                html: document.documentElement ? document.documentElement.outerHTML : (document.body ? document.body.innerHTML : ''),
                url: currentHref,
                title: headingText || docTitle,
                ready: isReady,
                matchedSelector,
                detectedChapNum,
                textLength: foundEl ? foundEl.textContent.trim().length : bodySnippet.length,
                bodySnippet
              };
            }
          });
        } catch (error) {
          const errMsg = error?.message || '';
          if (errMsg.includes('showing error page')) {
            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
              throw new Error('Mất kết nối Internet (Network Offline). Trình duyệt đang hiển thị trang báo lỗi.');
            }
            if (Date.now() - startTime >= Math.min(15000, this.timeoutMs)) {
              throw new Error('Trình duyệt đang hiển thị trang báo lỗi (Frame with ID 0 is showing error page). Vui lòng kiểm tra kết nối mạng hoặc máy tính vừa thức dậy.');
            }
          }
          // A manual reload temporarily destroys the execution context.
          if (Date.now() - startTime >= this.timeoutMs) throw error;
          await this._poll();
          continue;
        }

        const snapshot = injectionResults?.[0]?.result;
        const rawResult = typeof snapshot === 'string' ? snapshot : snapshot?.html || '';
        const capturePauseStart = Date.now();
        const resumedAfterCapture = await this.waitForResume();
        startTime += Date.now() - capturePauseStart;
        if (this.shouldCancel()) throw new Error('Đã dừng tải theo yêu cầu.');
        if (version !== this.navigationVersion || resumedAfterCapture) continue;

        if (this._isChallenge(rawResult)) {
          this.isWaitingForChallenge = true;
          if (this.onChallenge) {
            if (!challengeNotified) {
              challengeNotified = true;
              this.onChallenge();
              await this._updateTab({ active: true });
            }
          } else if (Date.now() - startTime >= this.maxChallengeWaitMs) {
            throw new Error('Trang vẫn yêu cầu xác minh Cloudflare. Hãy mở trang, hoàn thành xác minh rồi thử lại.');
          }
          await this._poll();
          continue;
        }

        const wasChallenge = this.isWaitingForChallenge;
        if (wasChallenge) startTime = Date.now();
        this.isWaitingForChallenge = false;
        if (wasChallenge) this.onStateChange();
        challengeNotified = false;

        // Password protected chapter handling
        if (this._isPasswordProtected(rawResult)) {
          this.isWaitingForPassword = true;
          if (!passwordNotified) {
            passwordNotified = true;
            await this._updateTab({ active: true });
            if (this.onPassword) {
              this.onPassword({ url, chapter: options.chapter });
            }
            this.onStateChange();
          }
          if (this._skipPassword) {
            this._skipPassword = false;
            this.isWaitingForPassword = false;
            this.onStateChange();
            const placeholder = options.emptyPlaceholder || '<p>pass</p>';
            return `<html><body><div id="chapter-content">${placeholder}</div></body></html>`;
          }
          await this._poll();
          continue;
        }

        const wasPassword = this.isWaitingForPassword;
        if (wasPassword) startTime = Date.now();
        this.isWaitingForPassword = false;
        if (wasPassword) this.onStateChange();
        passwordNotified = false;
        const wrongUrl = snapshot?.url && !this._isSameOrRedirectedChapter(snapshot.url, url);
        const wrongChapNum = targetChapNum !== null && snapshot?.detectedChapNum !== null &&
          Number(snapshot.detectedChapNum) !== Number(targetChapNum);
        const wrongPage = Boolean(wrongUrl || wrongChapNum);
        if (!rawResult || snapshot?.ready === false || wrongPage) {
          if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            throw new Error('Mất kết nối Internet (Network Offline). Không thể tải nội dung trang.');
          }

          // If SPA route hasn't updated DOM after 2.5s and still showing previous chapter, force tab reload
          if (wrongChapNum && Date.now() - startTime >= 2500 && !this._forcedSpaReload) {
            this._forcedSpaReload = true;
            try {
              await chrome.scripting.executeScript({
                target: { tabId: this.tabId },
                args: [url],
                func: (destUrl) => {
                  try {
                    if (window.location.href !== destUrl) {
                      window.location.href = destUrl;
                    } else {
                      window.location.reload();
                    }
                  } catch (_) {}
                }
              });
            } catch (_) {}
          }

          if (Date.now() - startTime >= this.timeoutMs) {
            if (wrongChapNum) {
              const diagDetail = `[CHẨN ĐOÁN] Mục tiêu: Chương #${targetChapNum} | Trang đang hiển thị: "${snapshot?.title || 'Chương ' + snapshot.detectedChapNum}" (detectedChapNum=${snapshot.detectedChapNum}) | URL: ${snapshot?.url}`;
              throw new Error(`Lệch số chương: Mục tiêu là Chương #${targetChapNum} nhưng trang web đang hiển thị "${snapshot?.title || 'Chương ' + snapshot.detectedChapNum}". Đã từ chối lưu để bảo vệ dữ liệu.\n${diagDetail}`);
            }
            if (!inPlaceGraceAttempted) {
              inPlaceGraceAttempted = true;
              const recheckSec = Math.max(3, Number(options.recheckWaitSeconds || this.recheckWaitSeconds || 10));
              if (typeof this.onInPlaceWait === 'function') {
                this.onInPlaceWait({ seconds: recheckSec, reason: 'recheck', url });
              }

              // Đánh thức thẻ chạy ngầm (unfreeze background tab)
              try {
                await chrome.scripting.executeScript({
                  target: { tabId: this.tabId },
                  func: () => {
                    try {
                      document.dispatchEvent(new Event('visibilitychange'));
                      window.dispatchEvent(new Event('focus'));
                      window.scrollBy(0, 30);
                    } catch (_) {}
                  }
                });
              } catch (_) {}

              // Tạm ngưng recheckSec giây KHÔNG reset trang để DOM và script hoàn tất tải nội dung
              await new Promise((resolve) => setTimeout(resolve, recheckSec * 1000));
              try {
                const recheckResults = await chrome.scripting.executeScript({
                  target: { tabId: this.tabId },
                  args: [selector],
                  func: (contentSelector) => {
                    let foundEl = null;
                    let matchedSelector = null;
                    if (contentSelector) {
                      try {
                        const el = document.querySelector(contentSelector);
                        if (el && el.textContent.trim().length > 0) {
                          foundEl = el;
                          matchedSelector = contentSelector;
                        }
                      } catch (_) {}
                    }

                    if (!foundEl && !contentSelector) {
                      const fallbackSelectors = [
                        'div.reader-demo-body',
                        '#chapter-content',
                        '.chapter-c',
                        '.chapter-content',
                        '.reading-content',
                        '.entry-content',
                        'article',
                        '.content',
                        '.text-left'
                      ];
                      for (const sel of fallbackSelectors) {
                        try {
                          const el = document.querySelector(sel);
                          if (el && el.textContent.trim().length > 0) {
                            foundEl = el;
                            matchedSelector = sel;
                            break;
                          }
                        } catch (_) {}
                      }
                    }

                    const bodyText = document.body ? (document.body.innerText || document.body.textContent || '').trim() : '';
                    const hasValidContent = contentSelector ? Boolean(foundEl) : Boolean(foundEl || bodyText.length > 80);

                    return {
                      html: document.documentElement ? document.documentElement.outerHTML : (document.body ? document.body.innerHTML : ''),
                      url: location.href,
                      title: document.title || '',
                      ready: hasValidContent,
                      hasContent: hasValidContent,
                      matchedSelector,
                      textLength: foundEl ? foundEl.textContent.trim().length : bodyText.length,
                      bodySnippet: bodyText.slice(0, 150).replace(/\s+/g, ' ')
                    };
                  }
                });

                const recheckSnap = recheckResults?.[0]?.result;
                if (recheckSnap && recheckSnap.hasContent && this._isSameOrRedirectedChapter(recheckSnap.url, url)) {
                  return recheckSnap.html;
                }
              } catch (_) {}
            }

            const snippetText = snapshot?.bodySnippet ? ` | Nội dung trên trang: "${snapshot.bodySnippet.slice(0, 100)}..."` : '';
            const diagDetail = `[CHẨN ĐOÁN] URL mục tiêu: ${url} | URL thẻ: ${snapshot?.url || 'chưa rõ'} | Tiêu đề: "${snapshot?.title || ''}" | Bộ chọn: ${snapshot?.matchedSelector || selector || 'tự động'} (${snapshot?.textLength || 0} ký tự)${snippetText} | Trạng thái: wrongPage=${Boolean(wrongPage)}, ready=${Boolean(snapshot?.ready)}`;
            throw new Error(`Trang chưa có nội dung chương hoặc đang ở sai địa chỉ.\n${diagDetail}`);
          }
          await this._poll();
          continue;
        }
        this.lastDownloadedChapterNumber = targetChapNum;
        return rawResult;
      }
    } finally {
      this.isWaitingForChallenge = false;
      this.isWaitingForPassword = false;
    }
  }

  async scrollReadingProgress(fraction) {
    if (this.shouldCancel()) return;
    await this.waitForResume();
    if (this.shouldCancel()) return;
    await chrome.scripting.executeScript({
      target: { tabId: this.tabId },
      args: [Math.max(0, Math.min(1, fraction))],
      func: (progress) => {
        const page = document.scrollingElement || document.documentElement;
        const maximum = Math.max(0, page.scrollHeight - window.innerHeight);
        window.scrollTo({
          top: maximum * progress,
          behavior: progress === 0 || progress === 1 ? 'instant' : 'smooth'
        });
      }
    });
  }

  /**
   * In-Tab Interactive TOC Extractor for SPA / Dynamic Multi-Page Novel sites (giatocvuongtai, etc.)
   * Where URL does NOT change when flipping TOC pages, or requires clicking 'Sau' / Next buttons in real browser DOM.
   * @param {Object} options
   * @returns {Promise<Object>} NovelMetadata with all chapters accumulated across pages
   */
  async extractFullTocViaTab(options = {}) {
    const url = options.url;
    if (!url || typeof url !== 'string') {
      throw new Error('Valid URL string is required for extractFullTocViaTab');
    }

    if (this.tabId === null) {
      await this.initialize();
    }

    if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.scripting) {
      throw new Error('Chrome extension tabs and scripting APIs are required for TabDownloader');
    }

    const customSelectors = options.customSelectors || null;
    const nextPageSelector = options.nextPageSelector || '';
    const maxPages = Math.min(500, Math.max(1, Number(options.maxPages) || 50));
    const pageWait = Math.max(1000, Number(options.pageLoadWaitMs) || this.pageLoadWaitMs || 2500);
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

    // Navigate tab to novel home/TOC page
    const updateProps = { url };
    if (this.visibleTab) {
      updateProps.active = true;
    }
    await this._updateTab(updateProps);
    await new Promise((resolve) => setTimeout(resolve, pageWait));

    // Wait for Cloudflare challenge if encountered
    const startTime = Date.now();
    while (true) {
      let rawHtml = '';
      try {
        const testRes = await chrome.scripting.executeScript({
          target: { tabId: this.tabId },
          func: () => document.documentElement.outerHTML || ''
        });
        rawHtml = (testRes && testRes[0]) ? testRes[0].result : '';
      } catch (e) {}

      if (this._isChallenge(rawHtml)) {
        if (Date.now() - startTime >= this.maxChallengeWaitMs) {
          throw new Error(`Trang vẫn yêu cầu xác minh Cloudflare sau ${this.maxChallengeWaitMs / 1000} giây. Hãy xác minh trên trang rồi thử lại.`);
        }
        await new Promise((resolve) => setTimeout(resolve, this.challengePollIntervalMs));
        continue;
      }
      break;
    }

    // Automatically click TOC / Chapter List Tab if novel page uses tabs (like giatocvuongtai)
    try {
      await chrome.scripting.executeScript({
        target: { tabId: this.tabId },
        func: () => {
          try {
            const clickables = document.querySelectorAll('button, a, [role="tab"], .tab, .nav-item, li, span');
            for (const el of clickables) {
              const txt = (el.textContent || '').trim().toLowerCase();
              if (txt === 'danh sách chương' || txt === 'mục lục' || txt === 'chương' || txt === 'chapters' || txt === 'table of contents' || txt === 'all chapters') {
                el.click();
                break;
              }
            }
            window.scrollTo(0, document.body.scrollHeight / 3);
          } catch (e) {}
        }
      });
      await new Promise((resolve) => setTimeout(resolve, 800));
    } catch (e) {}

    let currentPage = 1;
    const allChapters = [];
    const seenUrls = new Set();
    let consecutiveZero = 0;
    let novelMeta = null;

    while (currentPage <= maxPages) {
      // Execute in-tab scan and click next button for next round
      let scriptRes = null;
      try {
        const injection = await chrome.scripting.executeScript({
          target: { tabId: this.tabId },
          func: (args) => {
            const customChapterSel = args.customChapterSel || '';
            const customNextSel = args.customNextSel || '';
            const pageNum = args.pageNum || 1;

            // 1. Extract Chapters on current page DOM
            const pageChapters = [];
            let chapterElements = [];

            if (customChapterSel) {
              try {
                chapterElements = Array.from(document.querySelectorAll(customChapterSel));
              } catch (e) {}
            }

            if (chapterElements.length === 0) {
              const candidateSelectors = [
                '.chapter-list-item--link',
                '.chapter-list-item a',
                '.chapter-item a',
                '.chapter-list a',
                '.list-chapter a',
                'ul.list-chapters a',
                '.list-chaps a',
                '#list-chapter a',
                '.table-chapters a',
                '.list-truyen a',
                '.chapters-list a',
                '#chapters-list a',
                '.chapter-container a',
                '.story-chapters a',
                '.list-chapter-items a',
                'a[href*="/chuong-"]',
                'a[href*="/chuong/"]',
                'a[href*="/chapter-"]',
                'a[href*="/chapter/"]',
                'a[href*="/chap-"]',
                'a[href*="/chap/"]',
                'a[href*="/read/"]',
                'a[href*="/doc-truyen/"]',
                'a[href*="/stories/"][href*="/chapters/"]'
              ];
              for (const sel of candidateSelectors) {
                try {
                  const found = Array.from(document.querySelectorAll(sel));
                  if (found.length > 0) {
                    chapterElements = found;
                    break;
                  }
                } catch (e) {}
              }
            }

            // Helper làm sạch tiêu đề chương, tách số dính chữ và bỏ lượt xem/like/cmt ở đuôi
            const cleanChapterTitle = (raw) => {
              if (!raw || typeof raw !== 'string') return '';
              let str = raw.trim();

              // 1. Tách số và tên chương bị dính liền: vd "Chương 69Hòa Minh." -> "Chương 69: Hòa Minh."
              str = str.replace(/^(Chương|Chapter|Chap|Hồi|Tiết)\s*(\d+(?:\.\d+)?)\s*([A-ZÀ-Ỹa-zà-ỹ].*)$/i, (m, prefix, num, rest) => {
                if (/^[:\-–—\.]/.test(rest.trim())) {
                  return `${prefix} ${num} ${rest.trim()}`;
                }
                return `${prefix} ${num}: ${rest.trim()}`;
              });

              // 2. Lọc bỏ chuỗi số rác ở đuôi (lượt xem, like, cmt, view, timestamp)
              // Dạng có dấu chấm trước số đuôi: "Hòa Minh.189181" -> "Hòa Minh."
              str = str.replace(/\.\s*\d{2,15}$/, '.');

              // Dạng chuỗi số độc lập ở đuôi: "Hòa Minh 189181" hoặc "- 189181"
              str = str.replace(/\s*[-–—|•·/]?\s*\b\d{3,15}\b\s*$/, '');

              // Dạng nhãn lượt đọc/like/cmt ở đuôi
              str = str.replace(/\s*[-–—|•·/]?\s*\d+\s*(?:lượt đọc|views?|đọc|likes?|thích|bình luận|comments?|cmt|words?|từ)\s*$/i, '');

              // Chuẩn hóa khoảng trắng
              str = str.replace(/\s+/g, ' ').trim();
              return str;
            };

            chapterElements.forEach((el) => {
              const rawHref = el.getAttribute('href') || el.getAttribute('data-url') || el.getAttribute('data-href');
              if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:')) return;
              if (/trang-\d+|page=\d+|\/login|\/register|\/genre|\/tag\//i.test(rawHref)) return;

              let absUrl = '';
              try {
                absUrl = el.href || new URL(rawHref, location.href).href;
              } catch (e) {
                absUrl = rawHref;
              }
              if (!absUrl) return;

              // Trích xuất tiêu đề chương thông minh:
              let title = '';

              // Bước 1: Thử tìm cấu trúc strong (số chương) + p (tên chương)
              const strongEl = el.querySelector('strong, b, .chapter-number, .chap-num');
              const pEl = el.querySelector('p, .chapter-title, .chap-title, .chapter-name');

              if (strongEl || pEl) {
                const numText = strongEl ? strongEl.textContent.trim() : '';
                const nameText = pEl ? pEl.textContent.trim() : '';

                if (numText && nameText) {
                  if (nameText.toLowerCase().includes(numText.toLowerCase())) {
                    title = nameText;
                  } else {
                    title = `${numText}: ${nameText}`;
                  }
                } else {
                  title = numText || nameText;
                }
              }

              // Bước 2: Nếu chưa có title hoặc thẻ không chia rõ strong/p:
              if (!title) {
                try {
                  const clone = el.cloneNode(true);
                  const junkEls = clone.querySelectorAll(
                    '.meta, .chapter-meta, .chapter-stats, .stats, .badge, .view, .views, .like, .likes, .comment, .comments, ' +
                    'time, small, .text-muted, [class*="stat"], [class*="meta"], [class*="count"], [class*="date"]'
                  );
                  junkEls.forEach((j) => j.remove());
                  title = clone.textContent.trim();
                } catch (e) {
                  title = (el.textContent || '').trim();
                }
              }

              // Bước 3: Làm sạch tiêu đề
              title = cleanChapterTitle(title);

              pageChapters.push({ title: title || absUrl, url: absUrl });
            });

            // 2. Identify Next Button / Sau Button for SPA Pagination (URL stays same)
            let nextBtn = null;

            const isClickable = (el) => {
              if (!el) return false;
              if (el.disabled) return false;
              const disAttr = el.getAttribute('disabled');
              if (disAttr !== null && disAttr !== 'false') return false;
              if (el.getAttribute('aria-disabled') === 'true') return false;
              if (el.classList.contains('disabled')) return false;
              try {
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden') return false;
                if (el.offsetParent === null && el.offsetWidth === 0 && el.offsetHeight === 0) return false;
              } catch (e) {}
              return true;
            };

            // 2.1 User selector (XPath or CSS)
            if (customNextSel) {
              try {
                if (customNextSel.startsWith('//')) {
                  const xpathRes = document.evaluate(customNextSel, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                  for (let i = 0; i < xpathRes.snapshotLength; i++) {
                    const item = xpathRes.snapshotItem(i);
                    if (isClickable(item)) {
                      nextBtn = item;
                      break;
                    }
                  }
                } else {
                  const found = document.querySelectorAll(customNextSel);
                  for (const item of found) {
                    if (isClickable(item)) {
                      nextBtn = item;
                      break;
                    }
                  }
                }
              } catch (e) {}
            }

            // 2.2 Text matching: 'Sau', 'Trang sau', 'Tiếp', 'Next', '»', '›'
            if (!nextBtn) {
              const allClickables = Array.from(document.querySelectorAll('button, a, [role="button"], .page-link, .btn, span'));
              for (const b of allClickables) {
                const t = (b.textContent || '').trim().toLowerCase();
                const aria = (b.getAttribute('aria-label') || '').trim().toLowerCase();
                if (t === 'sau' || t === 'trang sau' || t === 'sau >' || t === 'tiếp' || t === 'tiếp theo' || t === 'next' || t === '»' || t === '›' ||
                    aria === 'sau' || aria === 'trang sau' || aria === 'next' || aria === 'next page') {
                  if (isClickable(b)) {
                    nextBtn = b;
                    break;
                  }
                }
              }
            }

            // 2.3 XPath button text 'Sau' (Gia Tộc Vượng Tài default: //button[contains(text(), 'Sau')])
            if (!nextBtn) {
              try {
                const xp = document.evaluate(
                  "//button[contains(translate(text(), 'SAU', 'sau'), 'sau')] | //a[contains(translate(text(), 'SAU', 'sau'), 'sau')]",
                  document,
                  null,
                  XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
                  null
                );
                for (let i = 0; i < xp.snapshotLength; i++) {
                  const item = xp.snapshotItem(i);
                  if (isClickable(item)) {
                    nextBtn = item;
                    break;
                  }
                }
              } catch (e) {}
            }

            // 2.4 Numbered page button matching (pageNum + 1)
            if (!nextBtn) {
              const nextPageStr = String(pageNum + 1);
              const numBtns = Array.from(document.querySelectorAll('.pagination a, .pagination button, .pager a, .pager button, button, a'));
              for (const b of numBtns) {
                if ((b.textContent || '').trim() === nextPageStr && isClickable(b)) {
                  nextBtn = b;
                  break;
                }
              }
            }

            // 2.5 Standard pagination selectors
            if (!nextBtn) {
              const fallbackSels = [
                '.pagination .next a',
                '.pagination .next button',
                '.pagination li.next a',
                '.pager .next a',
                'a.next',
                'button.next',
                '.btn-next',
                '#pagination-next',
                'li.active + li a',
                'button.active + button',
                '.active + .page-item a'
              ];
              for (const sel of fallbackSels) {
                try {
                  const el = document.querySelector(sel);
                  if (isClickable(el)) {
                    nextBtn = el;
                    break;
                  }
                } catch (e) {}
              }
            }

            // 3. Click next button if available
            let clicked = false;
            if (nextBtn) {
              try {
                nextBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                nextBtn.click();
                clicked = true;
              } catch (e) {
                try {
                  nextBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                  clicked = true;
                } catch (e2) {}
              }
            }

            // 4. Extract Novel Metadata from current DOM
            let title = '';
            const tEl = document.querySelector('h1.detail-hero-title, h1.entry-title, h1.story-title, h1.title, h1');
            if (tEl) {
              title = tEl.textContent.trim();
              // Lọc bỏ hậu tố website rác ở tiêu đề (vd: "| Gia Tộc Vượng Tài")
              title = title.replace(/\s*[-–—|•·]\s*(?:Gia Tộc Vượng Tài|giatocvuongtai\.com|Truyện Full|truyenfull.*|Wattpad|Inkitt|Đọc truyện online|Full)$/i, '').trim();
            }

            let author = '';
            // Tuyệt đối không dùng .detail-facts-grid vì đó là bảng thống kê số chương/view/like/cmt!
            const aEl = document.querySelector('.detail-byline__item strong, .detail-byline__item, .detail-stat-card--author a, a[href*="/tac-gia/"], a[href*="tac-gia"], a[href*="/author/"], .author a, .author');
            if (aEl) {
              let rawAuth = aEl.textContent.trim().replace(/^Tác giả\s*:\s*/i, '').trim();
              // Nếu dính các từ khóa thống kê thì loại bỏ
              if (!/(?:chương|lượt đọc|bình luận|vượng tài|tổng số từ|đăng ngày|cập nhật|hoàn thành)/i.test(rawAuth) && rawAuth.length < 60) {
                author = rawAuth;
              }
            }

            let cover = '';
            const cEl = document.querySelector('.detail-hero-cover img, .detail-cover-frame img, .book-thumb img, .cover img, meta[property="og:image"]');
            if (cEl) cover = cEl.src || cEl.getAttribute('data-src') || cEl.getAttribute('content') || '';

            let desc = '';
            const dEl = document.querySelector('.detail-synopsis-content, .detail-summary-block, .desc-text, .story-desc, .summary');
            if (dEl) desc = dEl.textContent.trim();

            return {
              chapters: pageChapters,
              hasNext: clicked,
              metadata: { title, author, cover, desc }
            };
          },
          args: [{
            customChapterSel: customSelectors?.chapterList || '',
            customNextSel: nextPageSelector || '',
            pageNum: currentPage
          }]
        });

        scriptRes = (injection && injection[0]) ? injection[0].result : null;
      } catch (err) {
        console.warn('[TabDownloader] Error in in-tab script execution on page', currentPage, err);
        break;
      }

      if (!scriptRes) {
        break;
      }

      if (!novelMeta && scriptRes.metadata) {
        novelMeta = scriptRes.metadata;
      }

      const foundChapters = Array.isArray(scriptRes.chapters) ? scriptRes.chapters : [];
      let newCount = 0;
      for (const ch of foundChapters) {
        if (ch.url && !seenUrls.has(ch.url)) {
          seenUrls.add(ch.url);
          allChapters.push(ch);
          newCount++;
        }
      }

      if (onProgress) {
        onProgress({
          page: currentPage,
          totalChapters: allChapters.length,
          newChapters: newCount
        });
      }

      if (newCount === 0 && currentPage > 1) {
        consecutiveZero++;
        if (consecutiveZero >= 2) {
          break;
        }
      } else {
        consecutiveZero = 0;
      }

      if (!scriptRes.hasNext) {
        break;
      }

      currentPage++;
      if (currentPage > maxPages) {
        break;
      }

      // Wait for in-tab SPA AJAX render of next page
      await new Promise((resolve) => setTimeout(resolve, Math.max(1500, pageWait)));
    }

    const normalizedChapters = allChapters.map((ch, idx) => ({
      id: `ch-${idx + 1}`,
      chapterNumber: idx + 1,
      title: ch.title || `Chương ${idx + 1}`,
      url: ch.url
    }));

    return {
      id: encodeURIComponent(url),
      title: (novelMeta && novelMeta.title) || 'Untitled Novel',
      author: (novelMeta && novelMeta.author) || 'Tác giả chưa rõ',
      description: (novelMeta && novelMeta.desc) || '',
      coverUrl: (novelMeta && novelMeta.cover) || '',
      status: 'ongoing',
      totalChapters: normalizedChapters.length,
      chapters: normalizedChapters
    };
  }

  async cleanup() {
    if (this.tabId !== null) {
      const idToRemove = this.tabId;
      this.tabId = null;
      this.isInitialized = false;

      if (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.remove === 'function') {
        try {
          await chrome.tabs.remove(idToRemove);
        } catch {
          // Tab may have been closed by user or browser; safely ignore
        }
      }
    }
    return Promise.resolve();
  }
}

// UMD / CommonJS / Global export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TabDownloader };
}
if (typeof window !== 'undefined') {
  window.TabDownloader = TabDownloader;
}
if (typeof globalThis !== 'undefined') {
  globalThis.TabDownloader = TabDownloader;
}
