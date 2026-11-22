// src/crawler/crawl-engine.js
// Central Crawl Orchestrator & Dual-Mode Downloader Coordinator with Human Simulation Timing

const _FetchDownloader = typeof FetchDownloader !== 'undefined'
  ? FetchDownloader
  : (typeof require !== 'undefined' ? (() => { try { return require('./fetch-downloader').FetchDownloader; } catch { return null; } })() : null);

const _TabDownloader = typeof TabDownloader !== 'undefined'
  ? TabDownloader
  : (typeof require !== 'undefined' ? (() => { try { return require('./tab-downloader').TabDownloader; } catch { return null; } })() : null);

const _NetRulesManager = typeof NetRulesManager !== 'undefined'
  ? NetRulesManager
  : (typeof require !== 'undefined' ? (() => { try { return require('./net-rules').NetRulesManager; } catch { return null; } })() : null);

const _ProfileManager = typeof ProfileManager !== 'undefined'
  ? ProfileManager
  : (typeof require !== 'undefined' ? (() => { try { return require('../storage/profile-manager').ProfileManager; } catch { return null; } })() : null);

class CrawlEngine {
  constructor(options = {}) {
    this.profileManager = options.profileManager || (_ProfileManager ? new _ProfileManager() : null);
    this.netRules = options.netRules || (_NetRulesManager ? new _NetRulesManager() : null);
    this.downloader = options.downloader || null;

    this.onProgress = options.onProgress || null;
    this.onError = options.onError || null;
    this.onChapterComplete = options.onChapterComplete || null;
    this.onComplete = options.onComplete || null;
    this.onWaitTick = options.onWaitTick || null;
    this.onCircuitBreaker = options.onCircuitBreaker || null;

    this.queue = [];
    this.completed = [];
    this.failed = [];
    this.consecutiveFailures = 0;
    this.isPaused = false;
    this.isCancelled = false;
    this.isRunning = false;
    this.activeWorkers = 0;
    this.activeProfile = null;
    this.startTime = 0;

    this._pausePromise = null;
    this._pauseResolver = null;
  }

  createDownloader(profile = {}) {
    const mode = profile.mode || 'fetch';
    if (mode === 'tab') {
      if (!_TabDownloader) {
        throw new Error('TabDownloader class is not available');
      }
      return new _TabDownloader({
        shouldCancel: () => this.isCancelled,
        waitForResume: async () => {
          if (this.isPaused && this._pausePromise) {
            await this._pausePromise;
            return true;
          }
          return false;
        },
        onStateChange: () => this._emitProgress(),
        onChallenge: () => this._emitProgress({
          id: 'pause',
          title: 'Đang chờ bạn xác minh Cloudflare trên thẻ tải truyện. Giữ nguyên chương hiện tại. Bấm Dừng để hủy.'
        }),
        onPassword: () => this._emitProgress({
          id: 'password',
          title: 'Chương hiện tại có mật khẩu (Password). Hãy giải pass trên thẻ truyện hoặc bấm "Bỏ qua giải pass".'
        }),
        challengePollIntervalMs: profile.challengePollIntervalMs || 500,
        maxChallengeWaitMs: profile.maxChallengeWaitMs || 30000,
        pageLoadWaitMs: profile.pageLoadWaitMs !== undefined ? profile.pageLoadWaitMs : 2000,
        delayMs: profile.delayMs || 0,
        jitter: profile.jitter !== false,
        visibleTab: profile.visibleTab !== false,
        backgroundChapters: profile.backgroundChapters !== false
      });
    }

    if (!_FetchDownloader) {
      throw new Error('FetchDownloader class is not available');
    }
    return new _FetchDownloader({
      concurrency: profile.concurrency || 3,
      delayMs: profile.delayMs || 0,
      jitter: profile.jitter !== false,
      maxRetries: profile.maxRetries || 3,
      baseBackoffMs: profile.baseBackoffMs || 500,
      headers: profile.customHeaders || {}
    });
  }

  async configureForDomain(domain) {
    if (!domain) {
      return this.profileManager ? this.profileManager.getDefaultProfile() : {};
    }

    let profile = null;
    if (this.profileManager) {
      profile = await this.profileManager.getProfile(domain);
    } else {
      profile = { concurrency: 3, delayMs: 500, jitter: true, mode: 'fetch' };
    }

    this.activeProfile = profile;

    if (this.netRules && profile) {
      const headersToSet = {
        userAgent: profile.userAgent,
        referer: profile.referer,
        extraHeaders: profile.customHeaders,
        domain
      };
      await this.netRules.setSessionHeaders(headersToSet);
    }

    return profile;
  }

  pause() {
    if (!this.isPaused) {
      this.isPaused = true;
      this._pausedAt = Date.now();
      this._pausePromise = new Promise((resolve) => {
        this._pauseResolver = resolve;
      });
      this._finishWait?.();
    }
  }

  resume() {
    if (this.isPaused) {
      if (this._waitDeadline != null && this._pausedAt != null) {
        this._waitDeadline += Date.now() - this._pausedAt;
      }
      this._pausedAt = null;
      this.isPaused = false;
      this.consecutiveFailures = 0;
      if (this._pauseResolver) {
        this._pauseResolver();
        this._pauseResolver = null;
        this._pausePromise = null;
      }
    }
  }

  cancel() {
    this.isCancelled = true;
    this.resume();
    this.downloader?.retryCurrentChapter?.();
    this._finishWait?.();
  }

  _estimateSecondsPerChapter() {
    const profile = this.activeProfile || {};
    if (profile.mode === 'tab') {
      let delay = 10;
      if (profile.enableWpmDelay) {
        delay += (2500 * 60) / Math.max(200, Number(profile.readingWpm) || 650);
      } else if (profile.delayMs) {
        delay += (profile.delayMs / 1000);
      }
      return Math.max(5, delay);
    }
    const concurrency = Math.max(1, profile.concurrency || 3);
    const delay = Math.max(0.5, (profile.delayMs || 500) / 1000);
    return Math.max(0.5, delay / concurrency);
  }

  _emitProgress(currentChapter = null) {
    if (typeof this.onProgress === 'function') {
      const total = this.completed.length + this.failed.length + this.queue.length;
      const completedCount = this.completed.length;
      const percentage = total > 0 ? Math.round((completedCount / total) * 100) : 0;
      const elapsedSec = (Date.now() - this.startTime) / 1000;
      const rawSpeed = elapsedSec > 0 ? (completedCount / elapsedSec) : 0;
      const speed = rawSpeed >= 0.1 ? Math.round(rawSpeed * 10) / 10 : Math.round(rawSpeed * 100) / 100;
      const remaining = total - completedCount;
      let eta = rawSpeed > 0 ? Math.ceil(remaining / rawSpeed) : 0;

      if (eta <= 0 && remaining > 0 && this.isRunning) {
        const estSec = this._estimateSecondsPerChapter();
        eta = Math.ceil(remaining * estSec);
      }

      this.onProgress({
        completed: completedCount,
        failed: this.failed.length,
        total,
        percentage,
        speed,
        rawSpeed,
        eta,
        activeWorkers: this.activeWorkers || 0,
        currentChapter
      });
    }
  }

  getWaitRemainingSeconds() {
    return (this._waitDeadline && !this.isCancelled)
      ? Math.max(0, Math.ceil((this._waitDeadline - Date.now()) / 1000))
      : 0;
  }

  skipWait() {
    if (this._waitDeadline) {
      this._waitDeadline = Date.now();
      this._finishWait?.();
      if (typeof this.onWaitTick === 'function') {
        this.onWaitTick({ remainingSec: 0, totalSec: 0 });
      }
    }
  }

  async _waitBetweenChapters(chapterContent, profile, completedCount) {
    if (this.isCancelled || this.queue.length === 0 || !chapterContent) return;

    let seconds = 0;
    if (profile.enableWpmDelay) {
      const text = (chapterContent?.contentHtml || '').replace(/<[^>]*>/g, ' ').trim();
      const words = text ? text.split(/\s+/).length : 0;
      const wpm = Math.max(200, Math.min(1500, Number(profile.readingWpm) || 650));
      seconds = Math.max(10, words * 60 / wpm);
    } else if (profile.interChapterDelaySeconds !== undefined) {
      seconds = Number(profile.interChapterDelaySeconds);
    } else if (profile.delayMs !== undefined) {
      seconds = Number(profile.delayMs) / 1000;
    } else {
      seconds = 0;
    }

    const interval = Number(profile.periodicBreakInterval);
    const breakSeconds = completedCount > 0 && interval > 0 && completedCount % interval === 0
      ? Math.max(0, Number(profile.periodicBreakSeconds) || 0)
      : 0;
    seconds += breakSeconds;

    // Giới hạn thời gian chờ tối đa (nếu người dùng cấu hình maxWaitSeconds)
    const maxCap = Number(profile.maxWaitSeconds);
    if (maxCap && maxCap > 0) {
      seconds = Math.min(seconds, maxCap);
    }

    if (seconds <= 0) return;

    // Use an absolute deadline: background tabs may run timers much later.
    this._waitDeadline = Date.now() + Math.ceil(seconds * 1000);
    if (this.isPaused) this._pausedAt = Date.now();

    this._emitProgress({
      id: 'pause',
      title: `Chờ ${Math.ceil(seconds)} giây trước chương tiếp theo. Có thể bấm Tạm dừng hoặc Tải ngay để bỏ qua chờ.`,
      waitDurationSec: seconds,
      waitDeadline: this._waitDeadline
    });

    try {
      while (!this.isCancelled) {
        if (this.isPaused && this._pausePromise) await this._pausePromise;
        if (this.isCancelled) break;
        const remainingMs = this._waitDeadline - Date.now();
        if (chapterContent && profile.mode === 'tab' && typeof this.downloader?.scrollReadingProgress === 'function') {
          const fraction = Math.max(0, Math.min(1, 1 - remainingMs / (seconds * 1000)));
          await this.downloader.scrollReadingProgress(fraction);
        }
        if (typeof this.onWaitTick === 'function') {
          this.onWaitTick({
            remainingSec: Math.max(0, Math.ceil(remainingMs / 1000)),
            totalSec: Math.ceil(seconds)
          });
        }
        if (remainingMs <= 0) break;
        await new Promise((resolve) => {
          const finish = () => {
            clearTimeout(timer);
            this._finishWait = null;
            resolve();
          };
          const timer = setTimeout(finish, Math.min(1000, remainingMs));
          this._finishWait = finish;
        });
      }
    } finally {
      this._waitDeadline = null;
      this._finishWait = null;
      if (typeof this.onWaitTick === 'function') {
        this.onWaitTick({ remainingSec: 0, totalSec: 0 });
      }
    }
  }

  async startCrawl(options = {}) {
    const { parser, chapters = [], domain = null, profile = null } = options;

    this.isRunning = true;
    this.isCancelled = false;
    this.isPaused = false;
    this.startTime = Date.now();
    this.completed = [];
    this.failed = [];
    this.consecutiveFailures = 0;
    this.activeWorkers = 0;
    this.queue = [...chapters];

    // Configure profile and headers
    let crawlProfile = profile;
    if (!crawlProfile && domain) {
      crawlProfile = await this.configureForDomain(domain);
    } else if (!crawlProfile) {
      crawlProfile = this.profileManager ? this.profileManager.getDefaultProfile() : { concurrency: 3, mode: 'fetch' };
    }
    this.activeProfile = crawlProfile;

    // Configure custom selectors if available on parser
    if (parser && typeof parser.setCustomSelectors === 'function' && crawlProfile.customSelectors) {
      parser.setCustomSelectors(crawlProfile.customSelectors);
    }

    // Allocate downloader
    if (!this.downloader) {
      this.downloader = this.createDownloader(crawlProfile);
    }
    if (this.downloader && crawlProfile.recheckWaitSeconds) {
      this.downloader.recheckWaitSeconds = Number(crawlProfile.recheckWaitSeconds);
    }

    try {
      await this.downloader.initialize();
      const maxConsecutive = (crawlProfile.maxConsecutiveErrors !== undefined) ? Number(crawlProfile.maxConsecutiveErrors) : 3;

      if (crawlProfile.mode === 'tab' || crawlProfile.enableWpmDelay) {
        // Tab-assisted mode downloads sequentially across the reused tab
        while (this.queue.length > 0 && !this.isCancelled) {
          if (this.isPaused && this._pausePromise) {
            await this._pausePromise;
          }
          if (this.isCancelled) break;

          const chapterItem = this.queue.shift();

          // Check if offline before starting chapter
          if (crawlProfile.autoPauseOnSleep !== false && typeof navigator !== 'undefined' && navigator.onLine === false) {
            this.pause();
            if (typeof this.onCircuitBreaker === 'function') {
              await this.onCircuitBreaker({
                reason: 'offline',
                message: 'Thiết bị mất kết nối Internet (Offline). Hệ thống đã tự động lưu dữ liệu và tạm dừng cào.',
                chapter: chapterItem
              });
            }
            if (this.isPaused && this._pausePromise) {
              await this._pausePromise;
            }
          }
          if (this.isCancelled) break;

          let chapterContent = null;
          try {
            this.activeWorkers = 1;
            this._emitProgress(chapterItem);

            if (parser && typeof parser.fetchChapter === 'function') {
              chapterContent = await parser.fetchChapter(chapterItem, this.downloader);
            } else {
              const rawHtml = await this.downloader.fetchChapter(chapterItem.url);
              chapterContent = {
                id: chapterItem.id,
                chapterNumber: chapterItem.chapterNumber,
                title: chapterItem.title,
                contentHtml: rawHtml
              };
            }

            if (crawlProfile.includeInlineImages && chapterContent && chapterContent.contentHtml) {
              await this._processInlineImages(chapterContent);
            }

            this.completed.push(chapterContent);
            this.consecutiveFailures = 0;
            if (typeof this.onChapterComplete === 'function') {
              await this.onChapterComplete({ chapter: chapterItem, result: chapterContent });
            }

          } catch (err) {
            if (this.isCancelled) break;
            const isMissingContentOrWrongPage = err?.message && (
              err.message.includes('Trang chưa có nội dung') ||
              err.message.includes('sai địa chỉ')
            );

            let recoveredContent = null;
            if (isMissingContentOrWrongPage && this.downloader && typeof this.downloader.recheckCurrentTabContent === 'function') {
              const recheckSeconds = Math.max(3, parseInt(crawlProfile.recheckWaitSeconds ?? crawlProfile.inPlaceWaitSeconds ?? 10, 10));
              this._waitDeadline = Date.now() + recheckSeconds * 1000;
              this._emitProgress({
                id: 'recheck',
                title: `Chương #${chapterItem.chapterNumber} chưa có nội dung. Đang tạm ngưng ${recheckSeconds}s (không tải lại trang) để kiểm tra lại HTML...`,
                waitDurationSec: recheckSeconds,
                waitDeadline: this._waitDeadline
              });

              for (let sec = recheckSeconds; sec > 0 && !this.isCancelled; sec--) {
                if (typeof this.onWaitTick === 'function') {
                  this.onWaitTick({ remainingSec: sec, totalSec: recheckSeconds, reason: 'recheck' });
                }
                await new Promise((r) => setTimeout(r, 1000));
              }

              this._waitDeadline = null;
              if (typeof this.onWaitTick === 'function') {
                this.onWaitTick({ remainingSec: 0, totalSec: 0 });
              }

              if (!this.isCancelled) {
                const recheckedHtml = await this.downloader.recheckCurrentTabContent(crawlProfile.chapterContentSelector);
                if (recheckedHtml) {
                  recoveredContent = {
                    id: chapterItem.id,
                    chapterNumber: chapterItem.chapterNumber,
                    title: chapterItem.title,
                    contentHtml: recheckedHtml
                  };
                  if (parser && typeof parser.parseChapterContent === 'function') {
                    try {
                      const parsed = parser.parseChapterContent(recheckedHtml, chapterItem.url);
                      if (parsed && parsed.contentHtml) {
                        recoveredContent.contentHtml = parsed.contentHtml;
                        if (parsed.title) recoveredContent.title = parsed.title;
                      }
                    } catch (_) {}
                  }
                }
              }
            }

            if (recoveredContent) {
              if (crawlProfile.includeInlineImages && recoveredContent.contentHtml) {
                await this._processInlineImages(recoveredContent);
              }
              this.completed.push(recoveredContent);
              this.consecutiveFailures = 0;
              chapterContent = recoveredContent;
              if (typeof this.onChapterComplete === 'function') {
                await this.onChapterComplete({ chapter: chapterItem, result: recoveredContent });
              }
            } else {
              this.consecutiveFailures++;
              this.failed.push({ chapter: chapterItem, error: err.message });
              if (typeof this.onError === 'function') {
                this.onError({ chapter: chapterItem, error: err.message, willRetry: false });
              }
              if (maxConsecutive > 0 && this.consecutiveFailures >= maxConsecutive) {
                this.pause();
                if (typeof this.onCircuitBreaker === 'function') {
                  await this.onCircuitBreaker({
                    reason: 'consecutive_errors',
                    consecutiveFailures: this.consecutiveFailures,
                    lastError: err.message,
                    chapter: chapterItem,
                    message: `Đã gặp lỗi liên tiếp ${this.consecutiveFailures} chương (${err.message}). Hệ thống đã tự động lưu toàn bộ dữ liệu và tạm dừng để bảo vệ tiến trình.`
                  });
                }
              }
            }
          } finally {
            this.activeWorkers = 0;
          }

          await this._waitBetweenChapters(chapterContent, crawlProfile, this.completed.length);
          this._emitProgress();
        }
      } else {
        // Mode 1: Parallel worker pool using downloader concurrency
        const concurrency = crawlProfile.concurrency || 3;
        const workers = [];

        const workerTask = async () => {
          while (this.queue.length > 0 && !this.isCancelled) {
            if (this.isPaused && this._pausePromise) {
              await this._pausePromise;
            }
            if (this.isCancelled) break;

            const chapterItem = this.queue.shift();
            if (!chapterItem) break;

            // Check if offline
            if (crawlProfile.autoPauseOnSleep !== false && typeof navigator !== 'undefined' && navigator.onLine === false) {
              this.pause();
              if (typeof this.onCircuitBreaker === 'function') {
                await this.onCircuitBreaker({
                  reason: 'offline',
                  message: 'Thiết bị mất kết nối Internet (Offline). Hệ thống đã tự động lưu dữ liệu và tạm dừng cào.',
                  chapter: chapterItem
                });
              }
              if (this.isPaused && this._pausePromise) {
                await this._pausePromise;
              }
            }
            if (this.isCancelled) break;

            this.activeWorkers = (this.activeWorkers || 0) + 1;
            this._emitProgress(chapterItem);

            try {
              let chapterContent = null;
              if (parser && typeof parser.fetchChapter === 'function') {
                chapterContent = await parser.fetchChapter(chapterItem, this.downloader);
              } else {
                const rawHtml = await this.downloader.fetchChapter(chapterItem.url);
                chapterContent = {
                  id: chapterItem.id,
                  chapterNumber: chapterItem.chapterNumber,
                  title: chapterItem.title,
                  contentHtml: rawHtml
                };
              }

              if (crawlProfile.includeInlineImages && chapterContent && chapterContent.contentHtml) {
                await this._processInlineImages(chapterContent);
              }

              this.completed.push(chapterContent);
              this.consecutiveFailures = 0;
              if (typeof this.onChapterComplete === 'function') {
                await this.onChapterComplete({ chapter: chapterItem, result: chapterContent });
              }

            } catch (err) {
              this.consecutiveFailures++;
              this.failed.push({ chapter: chapterItem, error: err.message });
              if (typeof this.onError === 'function') {
                this.onError({ chapter: chapterItem, error: err.message, willRetry: false });
              }
              if (maxConsecutive > 0 && this.consecutiveFailures >= maxConsecutive) {
                this.pause();
                if (typeof this.onCircuitBreaker === 'function') {
                  await this.onCircuitBreaker({
                    reason: 'consecutive_errors',
                    consecutiveFailures: this.consecutiveFailures,
                    lastError: err.message,
                    chapter: chapterItem,
                    message: `Đã gặp lỗi liên tiếp ${this.consecutiveFailures} chương (${err.message}). Hệ thống đã tự động lưu toàn bộ dữ liệu và tạm dừng để bảo vệ tiến trình.`
                  });
                }
              }
            } finally {
              this.activeWorkers = Math.max(0, (this.activeWorkers || 1) - 1);
            }

            this._emitProgress();
          }
        };

        for (let i = 0; i < concurrency; i++) {
          workers.push(workerTask());
        }

        await Promise.all(workers);
      }
    } finally {
      await this.cleanup();
      this.isRunning = false;
      this.activeWorkers = 0;
    }

    const summary = {
      completed: this.completed,
      failed: this.failed,
      total: this.completed.length + this.failed.length,
      durationMs: Date.now() - this.startTime
    };

    if (typeof this.onComplete === 'function') {
      this.onComplete(summary);
    }

    return summary;
  }

  async _processInlineImages(chapter) {
    if (!chapter || !chapter.contentHtml) return;
    const imgRegex = /<img\b([^>]*?)\bsrc=["'](https?:\/\/[^"']+)["']([^>]*?)\/?>/gi;
    let match;
    const discovered = [];
    while ((match = imgRegex.exec(chapter.contentHtml)) !== null) {
      discovered.push({
        fullTag: match[0],
        prefix: match[1] || '',
        src: match[2],
        suffix: match[3] || ''
      });
    }
    if (discovered.length === 0) return;

    chapter.images = chapter.images || [];
    const chNum = chapter.chapterNumber !== undefined ? chapter.chapterNumber : 1;

    for (let i = 0; i < discovered.length; i++) {
      const item = discovered[i];
      const existing = chapter.images.find(img => img.url === item.src);
      if (existing) {
        chapter.contentHtml = chapter.contentHtml.replace(item.fullTag, `<img${item.prefix}src="../images/${existing.filename}"${item.suffix ? ' ' + item.suffix.replace(/\/+$/, '').trim() : ''}/>`);
        continue;
      }

      let mimeType = 'image/jpeg';
      let blobData = null;
      try {
        if (typeof fetch === 'function') {
          const res = await fetch(item.src, { credentials: 'include' });
          if (res.ok) {
            const ct = res.headers && res.headers.get ? res.headers.get('content-type') : null;
            if (ct) mimeType = ct.split(';')[0].trim();
            if (typeof res.arrayBuffer === 'function') {
              const ab = await res.arrayBuffer();
              blobData = typeof Buffer !== 'undefined' ? Buffer.from(ab) : ab;
            } else if (typeof res.buffer === 'function') {
              blobData = await res.buffer();
            } else if (typeof res.blob === 'function') {
              blobData = await res.blob();
            }
          }
        }
      } catch (e) {}

      let ext = '.jpg';
      if (mimeType.includes('png')) ext = '.png';
      else if (mimeType.includes('webp')) ext = '.webp';
      else if (mimeType.includes('gif')) ext = '.gif';
      else if (mimeType.includes('svg')) ext = '.svg';

      const filename = `ch${chNum}_img_${i + 1}${ext}`;
      const imgEntry = {
        id: `img_ch${chNum}_${i + 1}`,
        url: item.src,
        filename: filename,
        mimeType: mimeType,
        dataBlob: blobData
      };
      chapter.images.push(imgEntry);

      const cleanSuffix = (item.suffix || '').replace(/\/+$/, '').trim();
      const replacementTag = `<img${item.prefix}src="../images/${filename}"${cleanSuffix ? ' ' + cleanSuffix : ''}/>`;
      chapter.contentHtml = chapter.contentHtml.replace(item.fullTag, replacementTag);
    }
  }

  async cleanup() {
    if (this.downloader && typeof this.downloader.cleanup === 'function') {
      try {
        await this.downloader.cleanup();
      } catch {
        // Safe cleanup
      }
    }

    if (this.netRules && typeof this.netRules.clearSessionRules === 'function') {
      try {
        await this.netRules.clearSessionRules();
      } catch {
        // Safe cleanup
      }
    }
  }
}

// UMD / CommonJS / Global export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CrawlEngine };
}
if (typeof window !== 'undefined') {
  window.CrawlEngine = CrawlEngine;
}
if (typeof globalThis !== 'undefined') {
  globalThis.CrawlEngine = CrawlEngine;
}
