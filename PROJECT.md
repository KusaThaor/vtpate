# Project: Chrome Extension Web Novel Scraper & EPUB Packaging Studio (VTPATE)

## Architecture
The system is built as a complete, standalone Google Chrome Extension (Manifest V3) that runs 100% offline without any external backend servers or CDN dependencies.
It incorporates a pluggable architecture:
- **Presentation Layer**: Dual UI (`popup/popup.html` for instant one-click detection and action; `manager.html` full-page tab for long-running crawling sessions, live progress, metadata editing, crawl profile settings, and failed chapter retry).
- **Control & Crawl Layer**: `CrawlEngine` coordinating two interchangeable downloader strategies:
  - *Mode 1 (Direct Fetch)*: High-throughput concurrent worker pool (1-10 workers), configurable delay (0-5000ms) with ±30% random jitter, `credentials: 'include'` for browser session reuse, and 3x auto-retry with exponential backoff on HTTP 429/503/network errors.
  - *Mode 2 (Browser-Tab Assisted)*: Background pinned tab (`active: false`), multi-stage page load & Cloudflare challenge detection, DOM extraction via `chrome.scripting.executeScript`, sequential tab reuse across chapters (~95% RAM/CPU savings & cookie retention), and safe tab lifecycle cleanup.
- **Network Header Management**: `NetRulesManager` utilizing `chrome.declarativeNetRequest.updateSessionRules` to spoof User-Agent, Referer, and mobile client headers (`X-Requested-With`) during scraping sessions without permanently modifying browser settings.
- **Parser Layer**: `ParserRegistry` automatically matching URLs to specialized parsers:
  - `InkittParser`: Story ID extraction, internal APIs `/api/2/stories`, `<script id="__NEXT_DATA__">` extraction, and mobile app emulation for app-only stories.
  - `WattpadParser`: Story URL and part URL resolution (part_id -> story_id via API), internal APIs v3/v2, HD cover extraction (`-k512`), Mature/Login support, safe handling for Paid Stories (`[Chương trả phí - Chưa mở khóa]`), `<p data-p-id>` sanitization, and inline image extraction from `img.wattpad.com`/`a.wattpad.com`.
  - `GenericParser`: Automatic TOC detection (selectors, link clustering, regex), Readability text density algorithm, and relative-to-absolute URL conversion.
- **EPUB Packaging Layer**: `EpubPacker` using an authentic, offline minified `JSZip v3.10.1`:
  - Strictly compliant with IDPF OCF/OPS standards: `mimetype` file strictly first in the archive, uncompressed `STORE` (20 bytes).
  - Strictly valid XML/XHTML chapter documents (UTF-8, XML entity escaping `& < >`, self-closing `<br/>`, `<hr/>`, `<img .../>`).
  - Embedded cover and inline images stored in `OEBPS/images/` and cataloged in `content.opf` manifest.
  - Dual navigation: `toc.ncx` (EPUB 2) and `nav.xhtml` (EPUB 3) with full Vietnamese diacritics support for KOReader and Calibre.
- **Storage & State Layer**: `ProfileManager` and `SessionManager` in `chrome.storage.local` storing per-domain crawl configurations, checkpoint data, and failed chapters log.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Manifest V3 Compliance & Permissions | Complete `manifest.json` with permissions (`tabs`, `scripting`, `declarativeNetRequest`, `storage`, `downloads`, `host_permissions: ["<all_urls>"]`) and MV3 CSP | M1 | R1, Survey 1 |
| 2 | Offline JSZip Library | Authentic official `JSZip v3.10.1` minified (~97-100KB) saved locally in `libs/jszip.min.js`, zero CDN, offline verification | M1 | R1, Survey 1 |
| 3 | Clean Codebase Audit & Zero TODOs | Complete eradication of mock/placeholder code, no empty stubs, no `// TODO`, clean code structure | M1 | R1, Survey 1 |
| 4 | Mode 1: Parallel Fetch Downloader | Direct `fetch()` with `credentials: 'include'`, concurrency pool 1-10 workers, delay 0-5000ms with ±30% random jitter | M2 | R2, Survey 2 |
| 5 | Auto-Retry & Exponential Backoff | 3x retry on network error or HTTP 429/503 with exponential/jittered backoff, retry-after header parsing | M2 | R2, R5, Survey 2 |
| 6 | Mode 2: Browser-Tab Assisted Downloader | Background tab (`active: false`), page load detection, Cloudflare challenge detection, DOM extraction via `chrome.scripting.executeScript` | M2 | R2, Survey 2 |
| 7 | Tab Reuse & Safe Cleanup | Sequential tab URL updating across chapters to save RAM/CPU and retain clearance cookies, safe cleanup in try/finally | M2 | R2, Survey 2 |
| 8 | DeclarativeNetRequest Header Spoofing | Session-scoped DNR rules (`updateSessionRules`) for User-Agent, Referer, and X-Requested-With | M2 | R2, Survey 2 |
| 9 | Per-Domain Crawl Profiles | Schema and storage in `chrome.storage.local` for domain-specific concurrency, delay, jitter, mode, and headers | M2 | R2, Survey 2 |
| 10 | Parser Architecture & BaseParser | Abstract `BaseParser` and `ParserRegistry` with standardized contracts (`NovelMetadata`, `ChapterItem`, `ChapterContent`) | M3 | R3, R4, R5, Survey 3 |
| 11 | Inkitt Specialized Parser | Story ID extraction (web & app deep link), internal APIs `/api/2/stories`, `__NEXT_DATA__` extraction, mobile app client emulation | M3 | R3, Survey 3 |
| 12 | Wattpad Specialized Parser | Story and Part URL resolution (part_id -> story_id via API), API v3 metadata/parts, apiv2 text, HD cover (`-k512`), Mature/login | M3 | R4, Survey 3 |
| 13 | Wattpad Paid Stories Safety | Safe handling of Wattpad Originals: log and output `[Chương trả phí - Chưa mở khóa]`, zero crash | M3 | R4, Survey 3 |
| 14 | HTML Sanitization & Wattpad Images | Clean `<p data-p-id>`, download inline images from `a.wattpad.com`/`img.wattpad.com` into `OEBPS/images/` | M3 | R4, Survey 3 |
| 15 | Generic Heuristic Parser | Multi-tier TOC detection (selectors, link clustering, regex), Readability text density algorithm, relative-to-absolute URL conversion | M3 | R5, Survey 3 |
| 16 | EPUB OCF Standards (`mimetype` STORE) | `mimetype` file strictly first at index 0, uncompressed `STORE` (20 bytes: `application/epub+zip`) | M4 | R5, Survey 3 |
| 17 | XML/XHTML Strict Validation | Strict XML escaping (`& < >`), self-closing tags (`<br/>`, `<hr/>`, `<img .../>`), UTF-8 encoding, Vietnamese diacritics | M4 | R5, Survey 3 |
| 18 | EPUB Manifest & Navigation | `content.opf` manifest & spine, `toc.ncx` (EPUB 2) and `nav.xhtml` (EPUB 3), cover and inline images in `OEBPS/images/`, Calibre & KOReader tested | M4 | R5, Survey 3 |
| 19 | Dual UI (Popup & Full-page Manager) | `popup/popup.html` for fast actions, `manager.html` full-page tab to prevent unmounting during large crawls | M5 | R6, Survey 3 |
| 20 | Metadata & Chapter Selection UI | Live metadata editing (title, author, description), chapter list reversal, chapter range filter (X to Y) | M5 | R6, Survey 3 |
| 21 | Visual Progress Bar & Live Stats | Dynamic progress bar, live worker status, ETA, and speed metrics | M5 | R6, Survey 3 |
| 22 | Crawl Profile UI Controls | UI bindings for concurrency, delay, jitter, mode (fetch vs tab), and auto-save per domain | M5 | R6, Survey 3 |
| 23 | Failed Chapters Table & Re-fetch Button | Detailed error table with "Tải lại các chương lỗi" button that non-destructively patches the EPUB | M5 | R6, Survey 3 |
| 24 | Pause / Resume & State Persistence | State persistence in `chrome.storage.local` across reloads and unexpected shutdowns | M5 | R6, Survey 3 |
| 25 | Documentation & Test Scenarios | Step-by-step installation guide (`chrome://extensions`) and 4 quick test scenarios | M5 | R6, Survey 3 |
| 26 | 100% E2E Test Suite Pass | Verification against full E2E test suite (Tiers 1-4) published by E2E Testing Track | M6 | Acceptance, Dual Track |
| 27 | Adversarial Coverage Hardening | White-box stress tests, edge cases, corrupted inputs, network dropouts (Tier 5) | M6 | Project Pattern Final |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Foundation, Manifest V3 CSP & Offline Dependencies | Features 1, 2, 3 | none | BLOCKED: INTEGRITY VIOLATION (awaiting PNG icon generation & official JSZip fetch) |
| M2 | Dual-Mode Crawl Engine & Domain Profile Manager | Features 4, 5, 6, 7, 8, 9 | M1 | PLANNED |
| M3 | Parser Architecture & Specialized Parsers (Inkitt, Wattpad, Generic) | Features 10, 11, 12, 13, 14, 15 | M1 | PLANNED |
| M4 | EPUB Packaging Engine & Formatting Utilities | Features 16, 17, 18 | M1 | PLANNED |
| M5 | Complete UI Studio, Error Management & Documentation | Features 19, 20, 21, 22, 23, 24, 25 | M2, M3, M4 | PLANNED |
| M6 | Final E2E Test Pass & Adversarial Hardening | Features 26, 27 | M1-M5, TEST_READY.md | PLANNED |

## Interface Contracts
### `CrawlEngine` ↔ `BaseParser`
- `fetchMetadata(url: string): Promise<NovelMetadata>`
  - Return: `{ id, title, author, description, coverUrl, status, totalChapters, chapters: ChapterItem[], extraHeaders? }`
- `fetchChapter(chapterItem: ChapterItem, downloader: Downloader): Promise<ChapterContent>`
  - Return: `{ id, chapterNumber, title, contentHtml, images: Array<{ id, url, filename, mimeType, dataBlob }> }`
- Errors: Paywalled chapters must return `{ isPaywalled: true, contentHtml: '<div class="paywall-notice">...</div>', ... }` without throwing unhandled exceptions.

### `CrawlEngine` ↔ `Downloader` (`FetchDownloader` / `TabDownloader`)
- `initialize(): Promise<void>`
- `fetchChapter(url: string): Promise<string>`
  - Returns: Raw HTML string or API JSON response string.
  - Throws: Network error or HTTP error (429/503 triggers retry).
- `cleanup(): Promise<void>`

### `EpubPacker` ↔ `CrawlEngine` / Parsers
- `createEpub(metadata: NovelMetadata, chapters: ChapterContent[], options?: EpubOptions): Promise<Blob>`
  - `metadata`: `{ title, author, description, coverBlob?, ... }`
  - `chapters`: Array of `{ chapterNumber, title, contentHtml, images }`
  - Output: Binary EPUB `Blob` ready for `chrome.downloads.download({ url: URL.createObjectURL(blob), filename: ... })`.

## Code Layout
```
d:\vtpate\
├── manifest.json                  # Manifest V3 specification
├── background/
│   └── background.js              # Service Worker (action listener, tab launcher)
├── libs/
│   ├── jszip.min.js               # Official minified JSZip v3.10.1 (offline)
│   └── lucide.min.js              # Offline Lucide Icons
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── popup/
│   ├── popup.html                 # Extension popup UI
│   ├── popup.css                  # Popup stylesheet
│   └── popup.js                   # Popup logic (CSP compliant)
├── manager.html                   # Full-page Crawl Manager UI
├── manager.css                    # Manager stylesheet
├── manager.js                     # Manager logic (CSP compliant)
├── src/
│   ├── crawler/
│   │   ├── crawl-engine.js        # Central crawl orchestrator & worker pool
│   │   ├── fetch-downloader.js    # Mode 1: Fetch with credentials & jitter
│   │   ├── tab-downloader.js      # Mode 2: Browser-tab assisted crawl
│   │   └── net-rules.js           # DeclarativeNetRequest session rules manager
│   ├── parsers/
│   │   ├── base-parser.js         # Base class with contracts & sanitizer
│   │   ├── parser-registry.js     # Router & registry
│   │   ├── inkitt-parser.js       # Inkitt API & mobile app parser
│   │   ├── wattpad-parser.js      # Wattpad API & part resolver parser
│   │   └── generic-parser.js      # Heuristic fallback parser
│   ├── epub/
│   │   ├── epub-packer.js         # IDPF OCF/OPS EPUB builder
│   │   ├── epub-templates.js      # Container, OPF, NCX, NAV, XHTML templates
│   │   └── epub-css.js            # Standard reader stylesheet
│   └── storage/
│       ├── profile-manager.js     # Domain crawl profiles storage
│       └── session-manager.js     # Checkpoints & failed chapter queue
├── tests/
│   ├── e2e/                       # E2E test suite (Tiers 1-4)
│   ├── unit/                      # Unit tests for parsers & packer
│   └── test-runner.js             # Automated test runner
├── README.md                      # Installation & testing guide
└── PROJECT.md                     # Living project architecture & index
```
