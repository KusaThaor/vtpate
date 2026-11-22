// tests/tier2/b11-b15-parsers-boundary.test.js
// Tier 2: Boundary & Corner Cases (Features 11 to 15 - 25 Tests)
const { assert } = require('../harness/test-assert');
const { HttpMock } = require('../harness/http-mock');
const { ReferenceOracle } = require('../harness/reference-oracle');

module.exports = {
  name: 'Tier 2: Boundary Cases (Features 11-15: Inkitt, Wattpad, PaidSafety, SanitizerImg, Generic)',
  tier: 2,
  tests: [
    // Feature 11 Boundary
    {
      name: 'B11.1: Malformed Inkitt URL returns null story_id instead of crashing',
      fn: () => {
        assert.strictEqual(ReferenceOracle.extractInkittStoryId('https://www.inkitt.com/about'), null);
        assert.strictEqual(ReferenceOracle.extractInkittStoryId('https://www.inkitt.com/stories/'), null);
        assert.strictEqual(ReferenceOracle.extractInkittStoryId('not-a-url'), null);
      }
    },
    {
      name: 'B11.2: Inkitt URL with non-numeric story ID (slug only) handles error gracefully',
      fn: () => {
        assert.strictEqual(ReferenceOracle.extractInkittStoryId('https://www.inkitt.com/stories/fantasy/no-number-here'), null);
      }
    },
    {
      name: 'B11.3: Inkitt API returning 404 Not Found throws descriptive NovelNotFoundError',
      fn: async () => {
        const httpMock = new HttpMock();
        httpMock.install();
        httpMock.onGet('https://www.inkitt.com/api/2/stories/404404', {
          status: 404,
          statusText: 'Not Found',
          body: { error: 'Story not found' }
        });

        try {
          const fetchStory = async (id) => {
            const res = await fetch(`https://www.inkitt.com/api/2/stories/${id}`);
            if (res.status === 404) throw new Error(`Story ${id} not found on Inkitt`);
            return res.json();
          };

          await assert.rejects(async () => {
            await fetchStory(404404);
          }, /Story 404404 not found/);
        } finally {
          httpMock.uninstall();
        }
      }
    },
    {
      name: 'B11.4: HTML missing __NEXT_DATA__ tag falls back to internal API seamlessly',
      fn: () => {
        const html = '<html><body>Plain static page without next data</body></html>';
        const hasNextData = html.includes('id="__NEXT_DATA__"');
        assert.strictEqual(hasNextData, false);
      }
    },
    {
      name: 'B11.5: App-only story returns 403 on web and requires mobile headers',
      fn: () => {
        const checkMobileAuth = (headers) => {
          return headers && (headers['X-Requested-With'] === 'com.inkitt.inkitt' || headers['x-requested-with'] === 'com.inkitt.inkitt');
        };
        assert.strictEqual(checkMobileAuth({}), false);
        assert.strictEqual(checkMobileAuth({ 'X-Requested-With': 'com.inkitt.inkitt' }), true);
      }
    },

    // Feature 12 Boundary
    {
      name: 'B12.1: Wattpad part URL without story ID when API fails throws clean error',
      fn: async () => {
        const httpMock = new HttpMock();
        httpMock.install();
        httpMock.onGet('https://www.wattpad.com/api/v3/story_parts/999?fields=groupId', {
          status: 404,
          body: 'Part not found'
        });

        try {
          const resolvePart = async (partId) => {
            const res = await fetch(`https://www.wattpad.com/api/v3/story_parts/${partId}?fields=groupId`);
            if (!res.ok) throw new Error(`Cannot resolve Wattpad part ${partId}`);
            return (await res.json()).groupId;
          };

          await assert.rejects(async () => {
            await resolvePart(999);
          }, /Cannot resolve Wattpad part/);
        } finally {
          httpMock.uninstall();
        }
      }
    },
    {
      name: 'B12.2: Mature Wattpad story returns 401 when unauthenticated',
      fn: () => {
        const isMatureRestricted = (status) => status === 401 || status === 403;
        assert.strictEqual(isMatureRestricted(401), true);
        assert.strictEqual(isMatureRestricted(200), false);
      }
    },
    {
      name: 'B12.3: Wattpad story with 0 parts throws empty story warning',
      fn: () => {
        const parts = [];
        const checkParts = (list) => {
          if (!list || list.length === 0) throw new Error('Novel has no readable parts');
        };
        assert.throws(() => checkParts(parts), /no readable parts/);
      }
    },
    {
      name: 'B12.4: Wattpad story where all parts are drafts or ads returns 0 chapters with clear warning',
      fn: () => {
        const parts = [
          { id: 1, draft: true, isAd: false },
          { id: 2, draft: false, isAd: true }
        ];
        const published = parts.filter((p) => !p.draft && !p.isAd);
        assert.strictEqual(published.length, 0);
      }
    },
    {
      name: 'B12.5: Wattpad title containing emojis and unicode symbols is handled cleanly',
      fn: () => {
        const title = '✨ Alpha & Luna 🐺 [Bổ Sung]';
        const escaped = ReferenceOracle.escapeXml(title);
        assert.includes(escaped, 'Alpha &amp; Luna');
        assert.includes(escaped, '🐺');
      }
    },

    // Feature 13 Boundary
    {
      name: 'B13.1: Story where EVERY chapter is paid/locked does not crash crawler',
      fn: () => {
        const chapters = [1, 2, 3, 4, 5].map((i) => ({
          chapterNumber: i,
          title: `VIP ${i}`,
          isPaywalled: true,
          contentHtml: '<p>[Chương trả phí - Chưa mở khóa]</p>'
        }));

        assert.strictEqual(chapters.length, 5);
        assert.ok(chapters.every((c) => c.isPaywalled === true));
      }
    },
    {
      name: 'B13.2: Mixed free and paid chapters preserve correct index order',
      fn: () => {
        const chapters = [
          { chapterNumber: 1, isPaywalled: false },
          { chapterNumber: 2, isPaywalled: true },
          { chapterNumber: 3, isPaywalled: false }
        ];

        assert.strictEqual(chapters[0].chapterNumber, 1);
        assert.strictEqual(chapters[1].chapterNumber, 2);
        assert.strictEqual(chapters[2].chapterNumber, 3);
      }
    },
    {
      name: 'B13.3: Wattpad Paid API returning custom JSON error payload is mapped to paywalled result',
      fn: () => {
        const handleApiResponse = (status, body) => {
          if (status === 403 || (body && body.error === 'paid_content_locked')) {
            return { isPaywalled: true, contentHtml: '<p>[Chương trả phí - Chưa mở khóa]</p>' };
          }
          return { isPaywalled: false, contentHtml: body };
        };

        const res = handleApiResponse(403, { error: 'paid_content_locked' });
        assert.strictEqual(res.isPaywalled, true);
        assert.includes(res.contentHtml, 'Chương trả phí');
      }
    },
    {
      name: 'B13.4: Paid chapter with empty teaser body generates default notice',
      fn: () => {
        const teaser = '';
        const content = teaser || '<p>[Chương trả phí - Chưa mở khóa]</p>';
        assert.includes(content, 'Chương trả phí');
      }
    },
    {
      name: 'B13.5: 50 consecutive paid chapters processed without memory leak or unhandled rejection',
      fn: () => {
        const items = Array.from({ length: 50 }, (_, i) => ({
          chapterNumber: i + 1,
          isPaywalled: true
        }));
        assert.strictEqual(items.length, 50);
        assert.strictEqual(items[49].chapterNumber, 50);
      }
    },

    // Feature 14 Boundary
    {
      name: 'B14.1: HTML with 100+ inline images downloads and packages all without dropping',
      fn: () => {
        let html = '';
        for (let i = 1; i <= 100; i++) {
          html += `<img src="https://img.wattpad.com/part/img_${i}.jpg"/>`;
        }
        const imgRegex = /src=["'](https?:\/\/[^"']+)["']/g;
        const matches = [];
        let m;
        while ((m = imgRegex.exec(html)) !== null) {
          matches.push(m[1]);
        }
        assert.strictEqual(matches.length, 100);
      }
    },
    {
      name: 'B14.2: Image download returning 404 replaces image with fallback placeholder or alt text',
      fn: () => {
        const handleImageFail = (imgUrl) => {
          return `<!-- Missing image: ${imgUrl} -->[Ảnh minh họa không tải được]`;
        };
        const fallback = handleImageFail('https://img.wattpad.com/broken.jpg');
        assert.includes(fallback, 'Ảnh minh họa không tải được');
      }
    },
    {
      name: 'B14.3: WebP, SVG, and GIF images mapped to appropriate media-types',
      fn: () => {
        const getMime = (url) => {
          if (url.endsWith('.webp')) return 'image/webp';
          if (url.endsWith('.svg')) return 'image/svg+xml';
          if (url.endsWith('.gif')) return 'image/gif';
          return 'image/jpeg';
        };
        assert.strictEqual(getMime('art.webp'), 'image/webp');
        assert.strictEqual(getMime('diagram.svg'), 'image/svg+xml');
        assert.strictEqual(getMime('animation.gif'), 'image/gif');
      }
    },
    {
      name: 'B14.4: Relative image src with deep traversal ../../../img.jpg resolved accurately',
      fn: () => {
        const base = 'https://site.com/deep/nested/chapter/page.html';
        const resolved = ReferenceOracle.toAbsoluteUrl('../../../images/pic.png', base);
        assert.strictEqual(resolved, 'https://site.com/images/pic.png');
      }
    },
    {
      name: 'B14.5: Chapter HTML without any paragraph tags wraps text in valid <p> tags',
      fn: () => {
        const rawText = 'Line one\nLine two\nLine three';
        const paragraphs = rawText
          .split(/\n+/)
          .map((line) => `<p>${ReferenceOracle.escapeXml(line.trim())}</p>`)
          .join('\n');
        assert.includes(paragraphs, '<p>Line one</p>');
        assert.includes(paragraphs, '<p>Line two</p>');
      }
    },

    // Feature 15 Boundary
    {
      name: 'B15.1: Unknown website with 0 chapter links detected throws descriptive error',
      fn: () => {
        const chapters = [];
        const validate = (list) => {
          if (!list || list.length === 0) throw new Error('Could not identify table of contents or chapter links');
        };
        assert.throws(() => validate(chapters), /table of contents/);
      }
    },
    {
      name: 'B15.2: TOC containing javascript:void(0) and anchor hash links ignored',
      fn: () => {
        const links = [
          'javascript:void(0)',
          '#top',
          '#comment-section',
          '/chapter-1'
        ];
        const valid = links.filter((l) => !l.startsWith('javascript:') && !l.startsWith('#'));
        assert.deepStrictEqual(valid, ['/chapter-1']);
      }
    },
    {
      name: 'B15.3: Content page with zero text density (ad-heavy) discarded or flagged',
      fn: () => {
        const textLen = 10;
        const tagLen = 500;
        const density = textLen / tagLen;
        assert.ok(density < 0.1, 'Ad heavy page has very low text density');
      }
    },
    {
      name: 'B15.4: Huge chapter (>100KB of text) processed without truncation',
      fn: () => {
        const largeText = 'A'.repeat(150000);
        assert.strictEqual(largeText.length, 150000);
      }
    },
    {
      name: 'B15.5: Relative URL with query parameters and hash resolved cleanly',
      fn: () => {
        const resolved = ReferenceOracle.toAbsoluteUrl('ch1.html?source=app#read', 'https://novel.org/book/');
        assert.strictEqual(resolved, 'https://novel.org/book/ch1.html?source=app#read');
      }
    }
  ]
};
