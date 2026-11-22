/**
 * wattpad-parser.js - Specialized Parser for Wattpad Stories & Parts
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
    module.exports.WattpadParser = Parser;
  } else {
    BaseParser = root.BaseParser;
    const Parser = factory(BaseParser);
    root.WattpadParser = Parser;
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
    getImageMimeType(filename) {
      if (!filename || typeof filename !== 'string') return 'application/octet-stream';
      const clean = filename.split('?')[0].toLowerCase();
      if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
      if (clean.endsWith('.png')) return 'image/png';
      if (clean.endsWith('.webp')) return 'image/webp';
      if (clean.endsWith('.gif')) return 'image/gif';
      return 'application/octet-stream';
    }
  };

  class WattpadParser extends SuperClass {
    constructor() {
      super();
      this.name = 'WattpadParser';
    }

    /**
     * Check if parser handles the given URL.
     * Matches story URLs (wattpad.com/story/...) and part URLs (wattpad.com/{part_id}-...).
     * @param {string} url
     * @returns {boolean}
     */
    canHandle(url) {
      if (!url || typeof url !== 'string') return false;
      return /(?:wattpad\.com\/story\/\d+|wattpad\.com\/\d+)/i.test(url);
    }

    /**
     * Resolve single part URL or story URL to parent story ID.
     * Single part URLs are queried against api/v3/story_parts/{part_id}?fields=groupId.
     * @param {string} url
     * @returns {Promise<string>}
     */
    async resolveStoryId(url) {
      if (!url || typeof url !== 'string') {
        throw new Error('Invalid URL provided to resolveStoryId');
      }

      // Check if URL is already a story URL: wattpad.com/story/12345678-title
      const storyMatch = /wattpad\.com\/story\/(\d+)/i.exec(url);
      if (storyMatch) {
        return storyMatch[1];
      }

      // Check if URL is a single part URL: wattpad.com/98765432-part-title
      const partMatch = /wattpad\.com\/(\d+)/i.exec(url);
      if (partMatch) {
        const partId = partMatch[1];
        const resolveApi = `https://www.wattpad.com/api/v3/story_parts/${partId}?fields=groupId`;
        try {
          const res = await fetch(resolveApi, {
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          if (res.ok) {
            const data = await res.json();
            if (data && data.groupId) {
              return String(data.groupId);
            }
          }
        } catch (err) {
          throw new Error(`Failed to resolve part ID ${partId} to parent story groupId: ${err.message}`);
        }
      }

      throw new Error(`Unable to extract Wattpad story ID from URL: ${url}`);
    }

    /**
     * Upgrades a Wattpad cover image URL to HD quality (-k512).
     * @param {string} coverUrl
     * @returns {string}
     */
    upgradeCoverUrl(coverUrl) {
      if (!coverUrl || typeof coverUrl !== 'string') return '';
      if (coverUrl.includes('-k512')) return coverUrl;
      if (/-k\d+\./.test(coverUrl)) {
        return coverUrl.replace(/-k\d+\./, '-k512.');
      }
      return coverUrl.replace(/(\.[a-zA-Z0-9]+)$/, '-k512$1');
    }

    /**
     * Extract inline image URLs from HTML markup.
     * @param {string} html
     * @returns {string[]}
     */
    extractImages(html) {
      if (!html || typeof html !== 'string') return [];
      const images = [];
      const imgRegex = /<img\b[^>]*?\bsrc=["'](https?:\/\/[^"']*(?:wattpad\.com)[^"']*)["'][^>]*>/gi;
      let match;
      while ((match = imgRegex.exec(html)) !== null) {
        images.push(match[1]);
      }
      return images;
    }

    /**
     * Sanitize Wattpad content: strip data-p-id attributes and unsafe HTML tags.
     * @param {string} html
     * @returns {string}
     */
    sanitizeContent(html) {
      return this.sanitizeHtml(html);
    }

    /**
     * Fetch novel metadata and table of contents.
     * Filters out draft parts (draft: true) and ad parts (isAd: true).
     * Upgrades cover image to HD (-k512).
     * @param {string} url
     * @returns {Promise<NovelMetadata>}
     */
    async fetchMetadata(url) {
      const storyId = await this.resolveStoryId(url);
      const apiUrl = `https://www.wattpad.com/api/v3/stories/${storyId}`;

      const res = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} fetching Wattpad story metadata for ID ${storyId}`);
      }

      const data = await res.json();
      const rawParts = Array.isArray(data.parts) ? data.parts : [];

      // Filter out draft and advertisement parts
      const publishedParts = rawParts.filter((part) => !part.draft && !part.isAd);

      const coverUrl = this.upgradeCoverUrl(data.cover || '');

      return {
        id: String(data.id || storyId),
        title: data.title || 'Wattpad Story',
        author: (data.user && (data.user.name || data.user.username)) || 'Unknown Author',
        description: data.description || '',
        coverUrl,
        status: data.completed ? 'completed' : 'ongoing',
        totalChapters: publishedParts.length,
        chapters: publishedParts.map((part, idx) => ({
          id: String(part.id),
          chapterNumber: idx + 1,
          title: part.title || `Part ${idx + 1}`,
          url: `https://www.wattpad.com/apiv2/storytext?id=${part.id}`
        }))
      };
    }

    /**
     * Fetch individual chapter text, sanitize markup, and download inline images.
     * Safely handles paid stories (returns paywall notification without throwing).
     * @param {ChapterItem} chapterItem
     * @param {Downloader} downloader
     * @returns {Promise<ChapterContent>}
     */
    async fetchChapter(chapterItem, downloader) {
      const paywallResult = {
        id: String(chapterItem.id),
        chapterNumber: chapterItem.chapterNumber,
        title: chapterItem.title,
        isPaywalled: true,
        contentHtml: '<p>[Chương trả phí - Chưa mở khóa]</p>',
        images: []
      };

      let raw = null;

      try {
        if (downloader && typeof downloader.fetchChapter === 'function') {
          raw = await downloader.fetchChapter(chapterItem.url);
        } else {
          const res = await fetch(chapterItem.url, {
            credentials: 'include',
            headers: {
              'Accept': 'text/html, application/json, */*',
              'Referer': 'https://www.wattpad.com/',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });

          if (res.status === 403) {
            return paywallResult;
          }

          if (!res.ok) {
            const err = new Error(`HTTP ${res.status} fetching Wattpad chapter ${chapterItem.id}`);
            err.status = res.status;
            throw err;
          }

          raw = await res.text();
        }
      } catch (err) {
        // Safe handling for Paid Stories (Feature 13): HTTP 403 or paywall error
        if (
          err.status === 403 ||
          (err.message && (err.message.includes('403') || err.message.toLowerCase().includes('paid')))
        ) {
          return paywallResult;
        }
        throw err;
      }

      // Check for JSON paywall payload
      if (typeof raw === 'string') {
        if (raw.includes('paid_story_locked') || raw.includes('Coins required to unlock')) {
          return paywallResult;
        }
      } else if (raw && typeof raw === 'object' && raw.error === 'paid_story_locked') {
        return paywallResult;
      }

      let contentHtml = typeof raw === 'string' ? raw : (raw && raw.text ? raw.text : String(raw || ''));

      // 1. Sanitize HTML and strip data-p-id attributes
      contentHtml = this.sanitizeHtml(contentHtml);

      // 2. Detect, download, and remap inline Wattpad images
      const images = [];
      const imgRegex = /<img\b([^>]*?)\bsrc=["'](https?:\/\/[^"']*(?:wattpad\.com)[^"']*)["']([^>]*?)\/?>/gi;
      let match;
      const discoveredUrls = [];

      while ((match = imgRegex.exec(contentHtml)) !== null) {
        discoveredUrls.push({
          fullTag: match[0],
          prefix: match[1] || '',
          src: match[2],
          suffix: match[3] || ''
        });
      }

      for (let i = 0; i < discoveredUrls.length; i++) {
        const item = discoveredUrls[i];
        let mimeType = this.getImageMimeType(item.src);
        let blobData = null;

        try {
          const imgRes = await fetch(item.src, { credentials: 'include' });
          if (imgRes.ok) {
            const ct = imgRes.headers.get('content-type');
            if (ct) {
              mimeType = ct.split(';')[0].trim();
            }

            if (typeof imgRes.arrayBuffer === 'function') {
              const ab = await imgRes.arrayBuffer();
              blobData = typeof Buffer !== 'undefined' ? Buffer.from(ab) : ab;
            } else if (typeof imgRes.buffer === 'function') {
              blobData = await imgRes.buffer();
            }
          }
        } catch (e) {
          // If image download fails, retain fallback image entry without breaking chapter
        }

        let extension = '.jpg';
        if (mimeType === 'image/png') extension = '.png';
        else if (mimeType === 'image/webp') extension = '.webp';
        else if (mimeType === 'image/gif') extension = '.gif';
        else if (mimeType === 'image/svg+xml') extension = '.svg';

        const filename = `img_${i + 1}${extension}`;
        images.push({
          id: `img_${i + 1}`,
          url: item.src,
          filename: filename,
          mimeType: mimeType,
          dataBlob: blobData
        });

        // Rewrite image src in HTML to relative EPUB path (../images/...)
        const cleanSuffix = (item.suffix || '').replace(/\/+$/, '').trim();
        const replacementTag = `<img${item.prefix}src="../images/${filename}"${cleanSuffix ? ' ' + cleanSuffix : ''}/>`;
        contentHtml = contentHtml.replace(item.fullTag, replacementTag);
      }

      return {
        id: String(chapterItem.id),
        chapterNumber: chapterItem.chapterNumber,
        title: chapterItem.title,
        contentHtml,
        images
      };
    }
  }

  return WattpadParser;
});
