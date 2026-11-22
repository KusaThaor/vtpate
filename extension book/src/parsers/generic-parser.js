/**
 * generic-parser.js - Heuristic Universal Fallback Parser & Multi-Page TOC Extractor
 * VTPATE Chrome Extension Web Novel Scraper & EPUB Packaging Studio
 */

(function (root, factory) {
  let BaseParser = null;
  if (typeof module === 'object' && typeof module.exports === 'object') {
    try {
      BaseParser = require('./base-parser');
      if (BaseParser.BaseParser) BaseParser = BaseParser.BaseParser;
    } catch (e) {
      BaseParser = root.BaseParser;
    }
    const Parser = factory(BaseParser);
    module.exports = Parser;
    module.exports.GenericParser = Parser;
  } else {
    BaseParser = root.BaseParser;
    const Parser = factory(BaseParser);
    root.GenericParser = Parser;
  }
})(typeof self !== 'undefined' ? self : this, function (BaseParser) {

  // Fallback BaseParser if loaded independently in test context
  const SuperClass = BaseParser || class {
    sanitizeHtml(html) {
      if (!html || typeof html !== 'string') return '';
      return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/\s+on[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '')
        .replace(/(<p\b[^>]*?)\s+data-p-id="[^"]*"/gi, '$1')
        .replace(/<(br|hr|img)([^>]*?)(?<!\/)>/gi, '<$1$2/>');
    }
    toAbsoluteUrl(rel, base) {
      try { return new URL(rel, base).href; } catch (e) { return rel; }
    }
    resolveAbsoluteUrl(rel, base) {
      return this.toAbsoluteUrl(rel, base);
    }
  };

  class GenericParser extends SuperClass {
    constructor(options = {}) {
      super();
      this.name = 'GenericParser';
      this.isGeneric = true;
      this.customSelectors = options.customSelectors || null;
      this.resolveAbsoluteUrl = this.resolveAbsoluteUrl.bind(this);
      this.toAbsoluteUrl = this.toAbsoluteUrl.bind(this);
    }

    setCustomSelectors(selectors) {
      this.customSelectors = selectors && typeof selectors === 'object' ? { ...selectors } : null;
    }

    /**
     * Parse HTML into a DOM document if DOMParser is available.
     * @param {string} html
     * @returns {Document|null}
     */
    _parseDoc(html) {
      if (typeof DOMParser !== 'undefined') {
        try {
          return new DOMParser().parseFromString(html, 'text/html');
        } catch (e) {
          return null;
        }
      }
      return null;
    }

    /**
     * Universal fallback handler: returns true for all URLs.
     * @param {string} url
     * @returns {boolean}
     */
    canHandle(url) {
      return true;
    }

    /**
     * Convert relative URL to absolute URL.
     * @param {string} relativeOrAbsolute
     * @param {string} baseUrl
     * @returns {string}
     */
    resolveAbsoluteUrl(relativeOrAbsolute, baseUrl) {
      if (this && typeof this.toAbsoluteUrl === 'function') {
        return this.toAbsoluteUrl(relativeOrAbsolute, baseUrl);
      }
      try {
        return new URL(relativeOrAbsolute, baseUrl).href;
      } catch (e) {
        return relativeOrAbsolute;
      }
    }

    /**
     * Clean chapter title by separating conjoined chapter numbers,
     * and stripping appended statistics (views, likes, comments, timestamps).
     * e.g. "Chương 69Hòa Minh.189181" -> "Chương 69: Hòa Minh."
     */
    cleanChapterTitle(raw) {
      if (!raw || typeof raw !== 'string') return '';
      let str = raw.trim();

      // 1. Tách số chương và tên chương bị dính liền: "Chương 69Hòa Minh." -> "Chương 69: Hòa Minh."
      str = str.replace(/^(Chương|Chapter|Chap|Hồi|Tiết)\s*(\d+(?:\.\d+)?)\s*([A-ZÀ-Ỹa-zà-ỹ].*)$/i, (m, prefix, num, rest) => {
        if (/^[:\-–—\.]/.test(rest.trim())) {
          return `${prefix} ${num} ${rest.trim()}`;
        }
        return `${prefix} ${num}: ${rest.trim()}`;
      });

      // 2. Lọc bỏ chuỗi số rác ở đuôi (lượt xem, like, cmt, view, timestamp)
      str = str.replace(/\.\s*\d{2,15}$/, '.');
      str = str.replace(/\s*[-–—|•·/]?\s*\b\d{3,15}\b\s*$/, '');
      str = str.replace(/\s*[-–—|•·/]?\s*\d+\s*(?:lượt đọc|views?|đọc|likes?|thích|bình luận|comments?|cmt|words?|từ)\s*$/i, '');
      str = str.replace(/\s+/g, ' ').trim();
      return str;
    }

    /**
     * Strip HTML tags from a string.
     * @param {string} html
     * @returns {string}
     */
    _stripTags(html) {
      if (!html) return '';
      return html.replace(/<[^>]*>/g, '').trim();
    }

    /**
     * Extract chapter items from a single page's HTML string and DOM.
     */
    _extractChaptersFromHtml(html, pageUrl, seenUrls, doc = null) {
      const pageDoc = doc || this._parseDoc(html);
      const rawChapters = [];

      // 1. Custom Selectors Priority
      if (this.customSelectors && this.customSelectors.chapterList && pageDoc) {
        try {
          const linkEls = pageDoc.querySelectorAll(this.customSelectors.chapterList);
          if (linkEls && linkEls.length > 0) {
            linkEls.forEach((el) => {
              const href = el.getAttribute('href') || el.getAttribute('data-url');
              if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
              const absUrl = this.toAbsoluteUrl(href, pageUrl);
              if (absUrl && !seenUrls.has(absUrl)) {
                seenUrls.add(absUrl);

                let title = '';
                const strongEl = el.querySelector('strong, b, .chapter-number, .chap-num');
                const pEl = el.querySelector('p, .chapter-title, .chap-title, .chapter-name');
                if (strongEl || pEl) {
                  const numText = strongEl ? strongEl.textContent.trim() : '';
                  const nameText = pEl ? pEl.textContent.trim() : '';
                  if (numText && nameText) {
                    title = nameText.toLowerCase().includes(numText.toLowerCase()) ? nameText : `${numText}: ${nameText}`;
                  } else {
                    title = numText || nameText;
                  }
                }
                if (!title) {
                  try {
                    const clone = el.cloneNode(true);
                    clone.querySelectorAll('.meta, .chapter-meta, .chapter-stats, .stats, .badge, .view, .views, .like, .likes, .comment, .comments, time, small, .text-muted, [class*="stat"], [class*="meta"], [class*="count"]').forEach((j) => j.remove());
                    title = clone.textContent.trim();
                  } catch (e) {
                    title = el.textContent.trim();
                  }
                }
                title = this.cleanChapterTitle(title) || `Chương ${rawChapters.length + 1}`;

                rawChapters.push({
                  title,
                  url: absUrl
                });
              }
            });
          }
        } catch (e) {
          console.warn('[GenericParser] Invalid selector for chapterList:', e);
        }
      }

      // 2. Candidate Selectors for Known Novel Sites (giatocvuongtai, truyenfull, wordpress, etc.)
      if (rawChapters.length === 0 && pageDoc) {
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
          'a[href*="/stories/"][href*="/chapters/"]',
          '.entry-content a',
          '.post-content a',
          '.story-content a',
          '.content-story a'
        ];

        for (const sel of candidateSelectors) {
          try {
            const els = pageDoc.querySelectorAll(sel);
            if (els && els.length > 0) {
              const isGenericContentScope = sel.includes('entry-content') || sel.includes('post-content') || sel.includes('content');
              els.forEach((el) => {
                const href = el.getAttribute('href') || el.getAttribute('data-url') || el.getAttribute('data-href');
                if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

                // If scanning broad content container (WordPress/Blog), filter for chapter-like links
                if (isGenericContentScope) {
                  const isChap = /(?:chuong|chapter|chap|ch|hoi)[-_/.\d]/i.test(href) ||
                    /(?:chương|chuong|chapter|chap|hồi|tiết|phần)\s*\d+/i.test(el.textContent) ||
                    /^\d{1,4}$/.test(el.textContent.trim());
                  if (!isChap) return;
                }

                if (/trang-\d+|page=\d+|\/login|\/register|\/genre|\/tag\//i.test(href)) return;

                const absUrl = this.toAbsoluteUrl(href, pageUrl);
                if (absUrl && !seenUrls.has(absUrl)) {
                  seenUrls.add(absUrl);

                  let txt = '';
                  const strongEl = el.querySelector('strong, b, .chapter-number, .chap-num');
                  const pEl = el.querySelector('p, .chapter-title, .chap-title, .chapter-name');
                  if (strongEl || pEl) {
                    const numText = strongEl ? strongEl.textContent.trim() : '';
                    const nameText = pEl ? pEl.textContent.trim() : '';
                    if (numText && nameText) {
                      txt = nameText.toLowerCase().includes(numText.toLowerCase()) ? nameText : `${numText}: ${nameText}`;
                    } else {
                      txt = numText || nameText;
                    }
                  }
                  if (!txt) {
                    try {
                      const clone = el.cloneNode(true);
                      clone.querySelectorAll('.meta, .chapter-meta, .chapter-stats, .stats, .badge, .view, .views, .like, .likes, .comment, .comments, time, small, .text-muted, [class*="stat"], [class*="meta"], [class*="count"]').forEach((j) => j.remove());
                      txt = clone.textContent.trim();
                    } catch (e) {
                      txt = el.textContent.trim();
                    }
                  }
                  txt = this.cleanChapterTitle(txt) || `Chương ${rawChapters.length + 1}`;

                  rawChapters.push({
                    title: txt,
                    url: absUrl
                  });
                }
              });
              if (rawChapters.length > 0) break;
            }
          } catch (e) {}
        }
      }

      // 3. Heuristic Regex fallback
      if (rawChapters.length === 0) {
        const tocContainerRegex = /<(?:div|ul|section)\b[^>]*class=["'][^"']*\b(?:list-chapter|chapters|chapter-list|table-of-contents|toc-container|toc)\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|ul|section)>/gi;
        let containerMatch;
        let tocHtmlScope = '';
        let hasExplicitTocContainer = false;

        while ((containerMatch = tocContainerRegex.exec(html)) !== null) {
          tocHtmlScope += containerMatch[1] + '\n';
          hasExplicitTocContainer = true;
        }

        if (!tocHtmlScope) {
          const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html);
          tocHtmlScope = bodyMatch ? bodyMatch[1] : html;
        }

        const linkRegex = /<a\b[^>]*\bhref=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let aMatch;

        while ((aMatch = linkRegex.exec(tocHtmlScope)) !== null) {
          const rawHref = aMatch[1].trim();
          const rawText = this._stripTags(aMatch[2]).trim();

          const isChapterPattern =
            /(?:chuong|chapter|chap|ch|hoi)[-_/.\d]/i.test(rawHref) ||
            /(?:chương|chuong|chapter|chap|hồi)\s*\d+/i.test(rawText) ||
            /\bch[-_ ]*\d+\b/i.test(rawHref) ||
            /\/c\d+/i.test(rawHref);

          const inExplicitContainer = hasExplicitTocContainer || /list-chapter|chapters|table-of-contents/i.test(tocHtmlScope);

          if (isChapterPattern || inExplicitContainer) {
            if (/trang-\d+|page=\d+|\/login|\/register|\/genre/i.test(rawHref)) {
              continue;
            }

            const absoluteUrl = this.toAbsoluteUrl(rawHref, pageUrl);
            if (absoluteUrl && !seenUrls.has(absoluteUrl)) {
              seenUrls.add(absoluteUrl);
              rawChapters.push({
                title: rawText || `Chương ${rawChapters.length + 1}`,
                url: absoluteUrl
              });
            }
          }
        }
      }

      return rawChapters;
    }

    /**
     * Identify next page URL for multi-page novel tables of contents.
     */
    _findNextPageUrl(doc, currentUrl, options = {}, pageNum = 1) {
      if (!doc) return null;

      const pType = (options.paginationType || this.customSelectors?.paginationType || 'auto').toLowerCase();

      // 1. URL Pattern Strategy (vd: trang-{page}/ hoặc ?page={page})
      const pat = options.paginationPattern || this.customSelectors?.paginationPattern || '';
      if ((pType === 'url_pattern' || pat) && pat) {
        const nextNum = pageNum + 1;
        let nextUrl = '';
        if (pat.includes('{url}')) {
          nextUrl = pat.replace('{url}', currentUrl.replace(/\/+$/, '')).replace('{page}', String(nextNum));
        } else if (pat.includes('{page}')) {
          if (pat.startsWith('http://') || pat.startsWith('https://')) {
            nextUrl = pat.replace('{page}', String(nextNum));
          } else if (pat.startsWith('?') || pat.startsWith('&')) {
            const cleanBase = currentUrl.split('?')[0];
            const querySep = pat.startsWith('?') ? '' : '&';
            nextUrl = cleanBase + querySep + pat.replace('{page}', String(nextNum));
          } else {
            nextUrl = currentUrl.replace(/\/+$/, '') + '/' + pat.replace(/^\/+/, '').replace('{page}', String(nextNum));
          }
        }
        return nextUrl;
      }

      // 2. Next Button Selector Strategy
      const candidates = [];
      const userSel = options.nextPageSelector || this.customSelectors?.nextPageSelector || '';
      if (userSel) candidates.push(userSel);

      candidates.push(
        'a.next-page',
        'a.next',
        '.pagination .next a',
        '.pagination li.next a',
        '.pager .next a',
        'a[rel="next"]',
        'link[rel="next"]',
        '.btn-next',
        '#pagination-next'
      );

      for (const sel of candidates) {
        try {
          const el = doc.querySelector(sel);
          if (el) {
            const href = el.getAttribute('href');
            if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
              return this.toAbsoluteUrl(href, currentUrl);
            }
          }
        } catch (e) {}
      }

      // 3. Fallback: Search link text like 'Sau', 'Tiếp', 'Next', '»'
      try {
        const allLinks = doc.querySelectorAll('a, button');
        for (const el of allLinks) {
          const text = (el.textContent || '').trim().toLowerCase();
          if (text === 'sau' || text === 'tiếp' || text === 'trang sau' || text === 'next' || text === '»' || text === '›') {
            const href = el.getAttribute('href') || el.getAttribute('data-url');
            if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
              return this.toAbsoluteUrl(href, currentUrl);
            }
          }
        }
      } catch (e) {}

      // 4. Auto detect standard truyenfull / trang-N pagination in page links
      try {
        const nextNum = pageNum + 1;
        const pageLinks = doc.querySelectorAll('a[href*="trang-"], a[href*="page="]');
        for (const pl of pageLinks) {
          const h = pl.getAttribute('href');
          if (h && (h.includes(`trang-${nextNum}`) || h.includes(`page=${nextNum}`))) {
            return this.toAbsoluteUrl(h, currentUrl);
          }
        }
      } catch (e) {}

      return null;
    }

    /**
     * Extract novel metadata and table of contents using heuristic DOM analysis,
     * custom selectors, and multi-page pagination.
     * @param {string} url
     * @param {Object} [options]
     * @returns {Promise<NovelMetadata>}
     */
    async fetchMetadata(url, options = {}) {
      const opts = options || {};
      const downloader = opts.downloader || null;

      // 0. Interactive In-Tab Multi-Page TOC Extraction for SPA / Same-URL Pagination (giatocvuongtai, etc.)
      const pType = (opts.paginationType || this.customSelectors?.paginationType || 'auto').toLowerCase();
      const isSpa = Boolean(opts.isSpa || opts.useTabForToc || url.includes('giatocvuongtai.com') || pType === 'next_button');

      if (downloader && typeof downloader.extractFullTocViaTab === 'function' && isSpa) {
        try {
          const tabResult = await downloader.extractFullTocViaTab({
            url,
            customSelectors: this.customSelectors,
            nextPageSelector: opts.nextPageSelector || this.customSelectors?.nextPageSelector || '',
            maxPages: opts.maxPaginationPages || this.customSelectors?.maxPaginationPages || 50,
            pageLoadWaitMs: opts.pageLoadWaitMs || 2500,
            onProgress: opts.onPageProgress || null
          });

          if (tabResult && Array.isArray(tabResult.chapters) && tabResult.chapters.length > 0) {
            return tabResult;
          }
        } catch (tabErr) {
          const detail = tabErr?.message || String(tabErr);
          const error = new Error('Không lấy được mục lục qua thẻ trình duyệt: ' + detail);
          error.cause = tabErr;
          throw error;
        }
      }

      let html = '';
      if (downloader && typeof downloader.fetchChapter === 'function') {
        html = await downloader.fetchChapter(url);
      } else {
        const res = await fetch(url, {
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status} fetching metadata from ${url}`);
        }

        html = await res.text();
      }

      let doc = this._parseDoc(html);

      // 1. Extract Novel Title
      let title = '';
      if (this.customSelectors && this.customSelectors.storyTitle && doc) {
        try {
          const el = doc.querySelector(this.customSelectors.storyTitle);
          if (el) title = el.textContent.trim();
        } catch (e) {
          console.warn('[GenericParser] Invalid selector for storyTitle:', e);
        }
      }
      if (!title && doc) {
        const candidateTitles = [
          'meta[property="og:title"]',
          'h1.entry-title',
          'h1.detail-hero-title',
          'h1.story-title',
          'h1.title',
          'h1.novel-title',
          'h1.name',
          '.book-title h1',
          'h1:not(.site-title):not(.wp-block-site-title)',
          'h1'
        ];
        for (const sel of candidateTitles) {
          try {
            const el = doc.querySelector(sel);
            if (el) {
              const val = (el.getAttribute('content') || el.textContent || '').trim();
              if (val) {
                title = val;
                break;
              }
            }
          } catch (e) {}
        }
      }
      if (!title) {
        const ogTitleMatch = /<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i.exec(html);
        if (ogTitleMatch) {
          title = this._stripTags(ogTitleMatch[1]);
        } else {
          const h1Match = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
          if (h1Match) {
            title = this._stripTags(h1Match[1]);
          } else {
            const titleTagMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
            if (titleTagMatch) {
              title = this._stripTags(titleTagMatch[1]).split(/[-|_]/)[0].trim();
            }
          }
        }
      }
      if (!title) title = 'Untitled Novel';

      // 2. Extract Author
      let author = '';
      if (this.customSelectors && this.customSelectors.author && doc) {
        try {
          const el = doc.querySelector(this.customSelectors.author);
          if (el) author = el.textContent.trim();
        } catch (e) {
          console.warn('[GenericParser] Invalid selector for author:', e);
        }
      }
      if (!author && doc) {
        const candidateAuthors = [
          '.detail-byline__item strong',
          '.detail-byline__item',
          '.detail-stat-card--author a',
          'a[href*="/tac-gia/"]',
          'a[href*="tac-gia"]',
          '.author a',
          '.story-author a',
          'a[href*="author"]',
          '.author'
        ];
        for (const sel of candidateAuthors) {
          try {
            const el = doc.querySelector(sel);
            if (el && el.textContent.trim()) {
              const rawA = el.textContent.trim().replace(/^Tác giả\s*:\s*/i, '').trim();
              if (!/(?:chương|lượt đọc|bình luận|vượng tài|tổng số từ|đăng ngày|cập nhật|hoàn thành)/i.test(rawA) && rawA.length < 50) {
                author = rawA;
                break;
              }
            }
          } catch (e) {}
        }
      }
      if (!author) {
        const authorMatch = /<span\b[^>]*class=["'][^"']*\bauthor\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(html) ||
          /<a\b[^>]*class=["'][^"']*\bauthor\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(html) ||
          /(?:Tác\s*giả|Tác\s*giả\s*gốc|Author)\s*[:：]\s*(?:<[^>]+>)*\s*([^<\n,;]+)/i.exec(html);
        if (authorMatch) {
          author = this._stripTags(authorMatch[1]).trim();
        }
      }

      // Clean and decode HTML entities in title
      title = title
        .replace(/&#8211;|&ndash;/gi, '–')
        .replace(/&#8212;|&mdash;/gi, '—')
        .replace(/&#8216;|&#8217;|&lsquo;|&rsquo;/gi, "'")
        .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/gi, '"')
        .replace(/&amp;/gi, '&')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s*[-–—|•·]\s*(?:Gia Tộc Vượng Tài|giatocvuongtai\.com|Truyện Full|truyenfull.*|Wattpad|Inkitt|Đọc truyện online|Full)$/i, '')
        .trim();

      // If author is still missing, try splitting composite novel title (e.g. "Tên Truyện – Tác Giả – Blog")
      if (!author || author === 'Unknown Author') {
        const titleParts = title.split(/\s*[-–—|]\s*/);
        if (titleParts.length >= 2) {
          const candidate = titleParts[1].replace(/^(?:Tác giả|Author)\s*[:：]\s*/i, '').trim();
          if (candidate && candidate.length <= 40 && !/^(?:trang chủ|đọc truyện|full|truyện|chương|tập)/i.test(candidate)) {
            author = candidate;
            title = titleParts[0].trim();
          }
        }
      }

      if (!author) author = 'Unknown Author';

      // 3. Extract Description
      let description = '';
      if (this.customSelectors && this.customSelectors.description && doc) {
        try {
          const el = doc.querySelector(this.customSelectors.description);
          if (el) description = el.textContent.trim();
        } catch (e) {
          console.warn('[GenericParser] Invalid selector for description:', e);
        }
      }
      if (!description && doc) {
        const candidateDescs = ['.detail-synopsis-content', '.desc-text', '.story-intro', '.summary', '.description', '.story-desc'];
        for (const sel of candidateDescs) {
          try {
            const el = doc.querySelector(sel);
            if (el && el.textContent.trim()) {
              description = el.textContent.trim();
              break;
            }
          } catch (e) {}
        }
      }
      if (!description) {
        const descMatch = /<p\b[^>]*class=["'][^"']*\b(?:desc|description|summary)\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i.exec(html) ||
          /<div\b[^>]*class=["'][^"']*\b(?:desc|description|summary)\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(html) ||
          /<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i.exec(html);
        if (descMatch) {
          description = this._stripTags(descMatch[1]);
        }
      }

      // 4. Extract Cover Image
      let coverUrl = '';
      if (this.customSelectors && this.customSelectors.cover && doc) {
        try {
          const el = doc.querySelector(this.customSelectors.cover);
          if (el) {
            const rawSrc = el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('content');
            if (rawSrc) coverUrl = this.toAbsoluteUrl(rawSrc, url);
          }
        } catch (e) {
          console.warn('[GenericParser] Invalid selector for cover:', e);
        }
      }
      if (!coverUrl && doc) {
        const candidateCovers = ['.detail-hero-cover img', '.book-thumb img', '.books img', '.book-info img', '.cover img', 'meta[property="og:image"]'];
        for (const sel of candidateCovers) {
          try {
            const el = doc.querySelector(sel);
            if (el) {
              const src = el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('content');
              if (src) {
                coverUrl = this.toAbsoluteUrl(src, url);
                break;
              }
            }
          } catch (e) {}
        }
      }
      if (!coverUrl) {
        const coverMatch = /<div\b[^>]*class=["'][^"']*\b(?:book-info|novel-info|cover|thumb)\b[^"']*["'][^>]*>[\s\S]*?<img\b[^>]*src=["']([^"']+)["']/i.exec(html) ||
          /<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i.exec(html);
        if (coverMatch) {
          coverUrl = this.toAbsoluteUrl(coverMatch[1], url);
        }
      }

      // 5. Extract Table of Contents (Page 1)
      const rawChapters = [];
      const seenUrls = new Set();
      const page1Chapters = this._extractChaptersFromHtml(html, url, seenUrls, doc);
      rawChapters.push(...page1Chapters);

      // 6. Multi-Page TOC Crawling
      const paginationType = (opts.paginationType || this.customSelectors?.paginationType || 'auto').toLowerCase();
      if (paginationType !== 'none') {
        const maxPages = opts.maxPaginationPages || this.customSelectors?.maxPaginationPages || 50;
        let currentPage = 1;
        let currentUrl = url;
        const visitedUrls = new Set([url]);

        while (currentPage < maxPages) {
          const nextUrl = this._findNextPageUrl(doc, currentUrl, opts, currentPage);
          if (!nextUrl || visitedUrls.has(nextUrl)) {
            break;
          }

          visitedUrls.add(nextUrl);
          currentUrl = nextUrl;
          currentPage++;

          try {
            let pageHtml = '';
            if (downloader && typeof downloader.fetchChapter === 'function') {
              pageHtml = await downloader.fetchChapter(nextUrl);
            } else {
              const resNext = await fetch(nextUrl, {
                headers: {
                  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
              });
              if (!resNext.ok) break;
              pageHtml = await resNext.text();
            }

            doc = this._parseDoc(pageHtml);
            const newChapters = this._extractChaptersFromHtml(pageHtml, nextUrl, seenUrls, doc);
            if (newChapters.length === 0) {
              break;
            }

            rawChapters.push(...newChapters);
            if (typeof opts.onPageProgress === 'function') {
              opts.onPageProgress({ page: currentPage, totalChapters: rawChapters.length });
            }
          } catch (pageErr) {
            console.warn('[GenericParser] Error fetching TOC page', currentPage, pageErr);
            break;
          }
        }
      }

      const chapters = rawChapters.map((ch, idx) => ({
        id: `ch-${idx + 1}`,
        chapterNumber: idx + 1,
        title: ch.title || `Chương ${idx + 1}`,
        url: ch.url
      }));

      return {
        id: encodeURIComponent(url),
        title,
        author,
        description,
        coverUrl,
        status: 'ongoing',
        totalChapters: chapters.length,
        chapters
      };
    }

    /**
     * Extract chapter body content using custom selectors or text density heuristics.
     * Converts relative image URLs to absolute URLs and sanitizes HTML.
     * @param {ChapterItem} chapterItem
     * @param {Downloader} downloader
     * @returns {Promise<ChapterContent>}
     */
    async fetchChapter(chapterItem, downloader) {
      let rawHtml = '';

      if (downloader && typeof downloader.fetchChapter === 'function') {
        rawHtml = await downloader.fetchChapter(chapterItem.url, {
          chapterContentSelector: this.customSelectors?.chapterContent || ''
        });
      } else {
        const res = await fetch(chapterItem.url, {
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        if (!res.ok) {
          const err = new Error(`HTTP ${res.status} fetching generic chapter ${chapterItem.id}`);
          err.status = res.status;
          throw err;
        }
        rawHtml = await res.text();
      }

      let bodyHtml = '';
      let chapterTitle = chapterItem.title;
      const doc = this._parseDoc(rawHtml);

      // Check if custom selectors are configured and document parsed
      if (doc && this.customSelectors) {
        if (this.customSelectors.classesToRemove) {
          const selectorsToRemove = this.customSelectors.classesToRemove.split(',').map((s) => s.trim()).filter(Boolean);
          for (const sel of selectorsToRemove) {
            try {
              doc.querySelectorAll(sel).forEach((el) => el.remove());
            } catch (e) {
              console.warn('[GenericParser] Invalid class to remove:', sel, e);
            }
          }
        }

        if (this.customSelectors.chapterTitle) {
          try {
            const titleEl = doc.querySelector(this.customSelectors.chapterTitle);
            if (titleEl && titleEl.textContent.trim()) {
              chapterTitle = titleEl.textContent.trim();
            }
          } catch (e) {
            console.warn('[GenericParser] Invalid selector for chapterTitle:', e);
          }
        }

        if (this.customSelectors.chapterContent) {
          try {
            const contentEl = doc.querySelector(this.customSelectors.chapterContent);
            if (contentEl) {
              bodyHtml = contentEl.innerHTML;
            }
          } catch (e) {
            console.warn('[GenericParser] Invalid selector for chapterContent:', e);
          }
        }
      }

      // Check candidate content selectors if no custom body
      if (!bodyHtml && doc) {
        const candidateContentSelectors = [
          'div.reader-demo-body', // Gia Tộc Vượng Tài
          '.chapter-c',           // Truyện Full
          '#chapter-content',
          '.reading-content',
          '.chapter-content',
          '.entry-content',
          '#content',
          'article'
        ];

        for (const sel of candidateContentSelectors) {
          try {
            const el = doc.querySelector(sel);
            if (el && el.innerHTML.trim().length > 100) {
              bodyHtml = el.innerHTML;
              break;
            }
          } catch (e) {}
        }
      }

      // If no custom body extracted, fallback to heuristic extraction
      if (!bodyHtml) {
        let cleanHtml = rawHtml
          .replace(/<!--[\s\S]*?-->/g, '')
          .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
          .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
          .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
          .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '')
          .replace(/<div\b[^>]*class=["'][^"']*\b(?:sidebar|ad-box|ad-banner|ads)\b[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '');

        const contentSelectors = [
          /<(?:main|div|article)\b[^>]*id=["'](?:chapter-content|reading-content|content)["'][^>]*>([\s\S]*?)<\/(?:main|div|article)>/i,
          /<(?:main|div|article)\b[^>]*class=["'][^"']*\b(?:chapter-content|reading-content|chapter-c)\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:main|div|article)>/i,
          /<article\b[^>]*>([\s\S]*?)<\/article>/i,
          /<main\b[^>]*>([\s\S]*?)<\/main>/i
        ];

        for (const pattern of contentSelectors) {
          const match = pattern.exec(cleanHtml);
          if (match && match[1]) {
            bodyHtml = match[1];
            break;
          }
        }

        if (!bodyHtml) {
          const pRegex = /<p\b[^>]*>[\s\S]*?<\/p>/gi;
          const paragraphs = cleanHtml.match(pRegex);
          if (paragraphs && paragraphs.length > 0) {
            bodyHtml = paragraphs.join('\n');
          } else {
            bodyHtml = cleanHtml;
          }
        }
      }

      // Convert relative image src in chapter content to absolute URLs
      bodyHtml = bodyHtml.replace(/<img\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*?)\/?>/gi, (match, prefix, src, suffix) => {
        const absSrc = this.toAbsoluteUrl(src, chapterItem.url);
        const cleanSuffix = (suffix || '').replace(/\/+$/, '').trim();
        return `<img${prefix}src="${absSrc}"${cleanSuffix ? ' ' + cleanSuffix : ''}/>`;
      });

      const cleanOptions = {
        cleanInvisibleText: this.customSelectors?.cleanInvisibleText !== false,
        customRemovals: this.customSelectors?.classesToRemove || this.customSelectors?.customRemovalsList || [],
        fallbackEmpty: true,
        emptyPlaceholder: this.customSelectors?.emptyChapterPlaceholder || '<p>pass</p>'
      };

      let contentHtml = this.sanitizeHtml(bodyHtml, cleanOptions);

      // If chapter content has no readable text or is empty, insert user fallback (default: <p>pass</p>)
      const textOnly = (contentHtml || '').replace(/<[^>]*>/g, '').trim();
      if (!textOnly) {
        contentHtml = this.customSelectors?.emptyChapterPlaceholder || '<p>pass</p>';
      }

      return {
        id: String(chapterItem.id),
        chapterNumber: chapterItem.chapterNumber,
        title: chapterTitle || chapterItem.title,
        contentHtml,
        images: []
      };
    }
  }

  return GenericParser;
});
