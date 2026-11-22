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

      // 1. Trực tiếp khớp đường dẫn (bỏ dấu gạch chéo cuối)
      const clean1 = u1.pathname.replace(/\/+$/, '').toLowerCase();
      const clean2 = u2.pathname.replace(/\/+$/, '').toLowerCase();
      if (clean1 === clean2) return true;

      // 2. Chuẩn hóa các tiền tố thư mục truyện (/truyen-chu/ vs /truyen/ vs /doc-truyen/)
      const norm1 = clean1.replace(/^\/(?:truyen-chu|truyen|doc-truyen|stories|story|novel)\//, '/');
      const norm2 = clean2.replace(/^\/(?:truyen-chu|truyen|doc-truyen|stories|story|novel)\//, '/');
      if (norm1 === norm2) return true;

      // 3. So khớp slug cuối của chương
      const slug1 = clean1.split('/').filter(Boolean).pop() || '';
      const slug2 = clean2.split('/').filter(Boolean).pop() || '';
      if (!slug1 || !slug2) return false;
      if (slug1 === slug2) return true;

      // 4. Khớp tiền tố (vd: "chuong-37-cau-meo" bắt đầu bằng "chuong-37" do web thêm tiêu đề)
      if (slug1.startsWith(slug2) || slug2.startsWith(slug1)) {
        return true;
      }

      // 5. Khớp chính xác theo số chương (Chapter Number)
      const extractNum = (s) => {
        const m = s.match(/(?:chuong|chapter|chap|c)[-_]?(\d+(?:\.\d+)?)/i) || s.match(/^(\d+)$/);
        return m ? parseFloat(m[1]) : null;
      };
      const num1 = extractNum(slug1);
      const num2 = extractNum(slug2);
      if (num1 !== null && num2 !== null && num1 === num2) {
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

    // Update existing tab to the target chapter URL (tab reuse)
    await this.waitForResume();
    if (this.shouldCancel()) throw new Error('Đã dừng tải theo yêu cầu.');
    const updateProps = { url };
    if (this.visibleTab && !this.backgroundChapters) {
      updateProps.active = true;
    }
    this.currentUrl = url;
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
    const selector = options.chapterContentSelector ||
      (new URL(url).hostname === 'giatocvuongtai.com' ? 'div.reader-demo-body' : '');

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

              const bodySnippet = document.body ? (document.body.innerText || document.body.textContent || '').slice(0, 200).replace(/\s+/g, ' ').trim() : '';
              const docTitle = document.title || '';
              const currentHref = location.href;
              const isReady = document.readyState !== 'loading' && (!contentSelector ? Boolean(foundEl || bodySnippet.length > 80) : Boolean(foundEl));

              return {
                html: document.documentElement ? document.documentElement.outerHTML : (document.body ? document.body.innerHTML : ''),
                url: currentHref,
                title: docTitle,
                ready: isReady,
                matchedSelector,
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
        const wrongPage = snapshot?.url && !this._isSameOrRedirectedChapter(snapshot.url, url);
        if (!rawResult || snapshot?.ready === false || wrongPage) {
          if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            throw new Error('Mất kết nối Internet (Network Offline). Không thể tải nội dung trang.');
          }
          if (Date.now() - startTime >= this.timeoutMs) {
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

            const diagDetail = `[CHẨN ĐOÁN] URL mục tiêu: ${url} | URL thẻ: ${snapshot?.url || 'chưa rõ'} | Tiêu đề: "${snapshot?.title || ''}" | Bộ chọn: ${snapshot?.matchedSelector || selector || 'tự động'} (${snapshot?.textLength || 0} ký tự) | Trạng thái: wrongPage=${Boolean(wrongPage)}, ready=${Boolean(snapshot?.ready)}`;
            throw new Error(`Trang chưa có nội dung chương hoặc đang ở sai địa chỉ.\n${diagDetail}`);
          }
          await this._poll();
          continue;
        }
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
