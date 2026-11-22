/**
 * inkitt-parser.js - Specialized Parser for Inkitt Novels & Mobile Stories
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
    module.exports.InkittParser = Parser;
  } else {
    BaseParser = root.BaseParser;
    const Parser = factory(BaseParser);
    root.InkittParser = Parser;
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
  };

  class InkittParser extends SuperClass {
    constructor() {
      super();
      this.name = 'InkittParser';
    }

    /**
     * Check if parser handles the given URL.
     * Matches web URLs (inkitt.com/stories) and deep links (inkitt://stories).
     * @param {string} url
     * @returns {boolean}
     */
    canHandle(url) {
      if (!url || typeof url !== 'string') return false;
      return /(?:inkitt\.com\/stories|inkitt:\/\/stories)/i.test(url);
    }

    /**
     * Extract numeric story ID from web and app URLs.
     * @param {string} url
     * @returns {string|null}
     */
    extractStoryId(url) {
      if (!url || typeof url !== 'string') return null;
      // Pattern 1: inkitt.com/stories(/genre)?/{id} or inkitt://stories/{id}
      const match = /(?:inkitt\.com\/stories(?:\/[a-zA-Z0-9_-]+)?\/|inkitt:\/\/stories\/)(\d+)/i.exec(url);
      if (match) {
        return match[1];
      }

      // Pattern 2: inkitt.com/stories/{id} without trailing slash
      const fallbackMatch = /inkitt(?:\.com)?\/(?:stories\/)?(\d+)/i.exec(url);
      if (fallbackMatch) {
        return fallbackMatch[1];
      }

      return null;
    }

    /**
     * Extract metadata from SSR __NEXT_DATA__ JSON payload.
     * @param {string} html
     * @param {string} url
     * @returns {NovelMetadata}
     */
    parseFromHtml(html, url) {
      if (!html || typeof html !== 'string') {
        throw new Error('Invalid HTML content provided to parseFromHtml');
      }

      const scriptMatch = /<script\b[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
      if (scriptMatch) {
        const nextData = JSON.parse(scriptMatch[1]);
        const story = (nextData.props && nextData.props.pageProps && nextData.props.pageProps.story) || {};
        const storyId = String(story.id || this.extractStoryId(url) || '');
        const chapters = Array.isArray(story.chapters) ? story.chapters : [];

        return {
          id: storyId,
          title: story.title || 'Inkitt Story',
          author: (story.user && (story.user.username || story.user.name)) || 'Unknown Author',
          description: story.summary || story.description || '',
          coverUrl: (story.vertical_cover && story.vertical_cover.url) || story.cover_url || '',
          status: story.completed ? 'completed' : 'ongoing',
          totalChapters: chapters.length || story.chapters_count || 0,
          chapters: chapters.map((ch, idx) => ({
            id: String(ch.id || idx + 1),
            chapterNumber: ch.chapter_number || (idx + 1),
            title: ch.name || ch.title || `Chapter ${idx + 1}`,
            url: `https://www.inkitt.com/api/2/stories/${storyId}/chapters/${ch.id}`
          }))
        };
      }

      throw new Error('Unable to find __NEXT_DATA__ SSR script in HTML');
    }

    /**
     * Fetch novel metadata and table of contents.
     * Uses internal API v2 or falls back to SSR __NEXT_DATA__ extraction.
     * @param {string} url
     * @returns {Promise<NovelMetadata>}
     */
    async fetchMetadata(url) {
      const storyId = this.extractStoryId(url);
      if (!storyId) {
        throw new Error(`Failed to extract Inkitt story ID from URL: ${url}`);
      }

      // 1. First attempt: Internal API v2 endpoint
      const apiUrl = `https://www.inkitt.com/api/2/stories/${storyId}`;
      try {
        const apiRes = await fetch(apiUrl, {
          headers: {
            'Accept': 'application/json',
            'X-Requested-With': 'com.inkitt.android',
            'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Mobile) Inkitt/3.0.0'
          }
        });

        if (apiRes.ok) {
          const data = await apiRes.json();
          const storyData = data.response || data.story || data;

          if (storyData && (storyData.title || storyData.id)) {
            const chapters = Array.isArray(storyData.chapters) ? storyData.chapters : [];
            return {
              id: String(storyData.id || storyId),
              title: storyData.title || 'Inkitt Story',
              author: (storyData.user && (storyData.user.username || storyData.user.name)) || 'Unknown Author',
              description: storyData.summary || storyData.description || '',
              coverUrl: (storyData.vertical_cover && storyData.vertical_cover.url) || storyData.cover_url || '',
              status: storyData.completed ? 'completed' : 'ongoing',
              totalChapters: chapters.length || storyData.chapters_count || 0,
              chapters: chapters.map((ch, idx) => ({
                id: String(ch.id || idx + 1),
                chapterNumber: ch.chapter_number || (idx + 1),
                title: ch.name || ch.title || `Chapter ${idx + 1}`,
                url: `https://www.inkitt.com/api/2/stories/${storyId}/chapters/${ch.id}`
              }))
            };
          }
        }
      } catch (err) {
        // API failed or not mocked, proceed to SSR fallback
      }

      // 2. Second attempt: Fetch web URL and extract SSR __NEXT_DATA__
      try {
        const pageRes = await fetch(url);
        if (pageRes.ok) {
          const html = await pageRes.text();
          return this.parseFromHtml(html, url);
        }
      } catch (err) {
        throw new Error(`Failed to fetch Inkitt metadata from both API and SSR: ${err.message}`);
      }

      throw new Error(`Could not retrieve metadata for Inkitt story ${storyId}`);
    }

    /**
     * Fetch individual chapter text.
     * Supports app-only chapters via mobile emulation headers.
     * @param {ChapterItem} chapterItem
     * @param {Downloader} downloader
     * @returns {Promise<ChapterContent>}
     */
    async fetchChapter(chapterItem, downloader) {
      let raw = null;

      if (downloader && typeof downloader.fetchChapter === 'function') {
        raw = await downloader.fetchChapter(chapterItem.url);
      } else {
        const res = await fetch(chapterItem.url, {
          headers: {
            'Accept': 'application/json, text/html, */*',
            'X-Requested-With': 'com.inkitt.android',
            'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Mobile) Inkitt/3.0.0'
          }
        });
        if (!res.ok) {
          const error = new Error(`HTTP ${res.status} fetching chapter ${chapterItem.id}`);
          error.status = res.status;
          throw error;
        }
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          raw = await res.json();
        } else {
          raw = await res.text();
        }
      }

      // Parse response payload if stringified JSON
      let data = raw;
      if (typeof raw === 'string') {
        try {
          data = JSON.parse(raw);
        } catch (e) {
          data = raw;
        }
      }

      let contentHtml = '';
      if (data && typeof data === 'object') {
        const resp = data.response || data;
        contentHtml = resp.text || resp.contentHtml || resp.content || '';
      } else if (typeof data === 'string') {
        contentHtml = data;
      }

      contentHtml = this.sanitizeHtml(contentHtml);

      return {
        id: String(chapterItem.id),
        chapterNumber: chapterItem.chapterNumber,
        title: chapterItem.title,
        contentHtml,
        images: []
      };
    }
  }

  return InkittParser;
});
