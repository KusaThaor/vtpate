# Test Infrastructure Specification (TEST_INFRA)
**Project**: Chrome Extension Web Novel Scraper & EPUB Packaging Studio (VTPATE)  
**Track**: Dual Track: E2E Testing Track  
**Authoritative Sources**: `ORIGINAL_REQUEST.md`, `PROJECT.md`

---

## 1. Test Philosophy & Principles

### 1.1 Opaque-Box & Requirement-Driven Testing
The test suite operates strictly as an opaque-box verification system derived exclusively from user requirements in `ORIGINAL_REQUEST.md` (R1-R6) and architectural specifications in `PROJECT.md`. Tests do not inspect or rely upon internal implementation minutiae (such as private variables or unexported helper methods); instead, they assert:
- **Contract Conformance**: Interface signatures, return types, error structures defined in `PROJECT.md § Interface Contracts`.
- **Observable Behaviors**: Network requests intercepted, headers set via `declarativeNetRequest`, DOM manipulation via `executeScript`, retry counts, tab creation/cleanup.
- **Physical Artifact Fidelity**: EPUB binary zip container format, uncompressed 20-byte `mimetype` at index 0, XML validity of chapter XHTML, `toc.ncx`/`nav.xhtml` navigation structures, and preserved UTF-8 Vietnamese diacritics.
- **Chrome MV3 Platform Compliance**: `manifest.json` schema, strict Content Security Policy (no inline scripts, no `eval()`), and appropriate permission declarations.

### 1.2 Test Hermeticity & Independence
- Every test case initializes its own pristine mock state (Chrome API stubs, in-memory storage, mock HTTP routes).
- Tests do not share mutable state or depend on invocation order.
- Mock network interceptors reset between test cases to prevent cross-test leakage.
- Temporary files and test buffers are created in-memory or purged immediately after assertion.

### 1.3 Progressive Testability & Milestones
The test suite aligns with the project milestones (M1–M6):
- Tests can be executed as a complete master run or targeted by milestone (`--milestone M1`, `--milestone M2`, etc.) and tier (`--tier 1`, `--tier 2`, etc.).
- When testing an in-progress milestone, missing downstream modules do not crash the runner; they produce structured, informative failure reports identifying the unfulfilled contract.

---

## 2. Feature Inventory & Coverage Matrix

| # | Feature | Req | Milestone | Primary Target / Interface | Tier 1 (Min 5) | Tier 2 (Min 5) | Tier 3 (Cross) | Tier 4 (E2E) | Total Tests |
|---|---------|-----|-----------|----------------------------|----------------|----------------|----------------|--------------|-------------|
| 1 | Manifest V3 & Permissions | R1 | M1 | `manifest.json` | 5 | 5 | Yes | Yes | 10+ |
| 2 | Offline JSZip Library | R1 | M1 | `libs/jszip.min.js` | 5 | 5 | Yes | Yes | 10+ |
| 3 | Clean Codebase & Zero TODOs | R1 | M1 | Entire codebase | 5 | 5 | Yes | Yes | 10+ |
| 4 | Mode 1: Parallel Fetch Downloader | R2 | M2 | `FetchDownloader` (`src/crawler/fetch-downloader.js`) | 5 | 5 | Yes | Yes | 10+ |
| 5 | Auto-Retry & Exponential Backoff | R2, R5 | M2 | `FetchDownloader` / `CrawlEngine` | 5 | 5 | Yes | Yes | 10+ |
| 6 | Mode 2: Browser-Tab Assisted Downloader | R2 | M2 | `TabDownloader` (`src/crawler/tab-downloader.js`) | 5 | 5 | Yes | Yes | 10+ |
| 7 | Tab Reuse & Safe Cleanup | R2 | M2 | `TabDownloader` | 5 | 5 | Yes | Yes | 10+ |
| 8 | DeclarativeNetRequest Header Spoofing | R2 | M2 | `NetRulesManager` (`src/crawler/net-rules.js`) | 5 | 5 | Yes | Yes | 10+ |
| 9 | Per-Domain Crawl Profiles | R2 | M2 | `ProfileManager` (`src/storage/profile-manager.js`) | 5 | 5 | Yes | Yes | 10+ |
| 10 | Parser Architecture & BaseParser | R3, R4, R5 | M3 | `BaseParser` & `ParserRegistry` (`src/parsers/`) | 5 | 5 | Yes | Yes | 10+ |
| 11 | Inkitt Specialized Parser | R3 | M3 | `InkittParser` (`src/parsers/inkitt-parser.js`) | 5 | 5 | Yes | Yes | 10+ |
| 12 | Wattpad Specialized Parser | R4 | M3 | `WattpadParser` (`src/parsers/wattpad-parser.js`) | 5 | 5 | Yes | Yes | 10+ |
| 13 | Wattpad Paid Stories Safety | R4 | M3 | `WattpadParser` | 5 | 5 | Yes | Yes | 10+ |
| 14 | HTML Sanitizer & Wattpad Images | R4 | M3 | `BaseParser` / `WattpadParser` | 5 | 5 | Yes | Yes | 10+ |
| 15 | Generic Heuristic Parser | R5 | M3 | `GenericParser` (`src/parsers/generic-parser.js`) | 5 | 5 | Yes | Yes | 10+ |
| 16 | EPUB OCF Standards (`mimetype` STORE) | R5 | M4 | `EpubPacker` (`src/epub/epub-packer.js`) | 5 | 5 | Yes | Yes | 10+ |
| 17 | XML/XHTML Strict Validation | R5 | M4 | `EpubPacker` / `epub-templates.js` | 5 | 5 | Yes | Yes | 10+ |
| 18 | EPUB Manifest & Navigation | R5 | M4 | `EpubPacker` | 5 | 5 | Yes | Yes | 10+ |
| 19 | Dual UI (Popup & Full Manager) | R6 | M5 | `popup/popup.html`, `manager.html` | 5 | 5 | Yes | Yes | 10+ |
| 20 | Metadata & Chapter Selection UI | R6 | M5 | `manager.js` | 5 | 5 | Yes | Yes | 10+ |
| 21 | Visual Progress Bar & Live Stats | R6 | M5 | `manager.js` / `CrawlEngine` | 5 | 5 | Yes | Yes | 10+ |
| 22 | Crawl Profile UI Controls | R6 | M5 | `manager.js` | 5 | 5 | Yes | Yes | 10+ |
| 23 | Failed Chapters Table & Re-fetch | R6 | M5 | `manager.js` / `SessionManager` | 5 | 5 | Yes | Yes | 10+ |
| 24 | Pause / Resume & State Persistence | R6 | M5 | `SessionManager` (`src/storage/session-manager.js`) | 5 | 5 | Yes | Yes | 10+ |
| 25 | Documentation & Test Scenarios | R6 | M5 | `README.md` | 5 | 5 | Yes | Yes | 10+ |
| **Sum** | | | | | **125** | **125** | **16** | **10** | **276** |

---

## 3. Test Architecture & Execution Commands

### 3.1 Directory Structure
```
d:\vtpate\
├── tests/
│   ├── test-runner.js             # Automated master test runner (Node.js)
│   ├── harness/
│   │   ├── chrome-mock.js         # Full Chrome MV3 API simulator
│   │   ├── http-mock.js           # Network interceptor (fetch, headers, delays, errors)
│   │   ├── epub-validator.js      # IDPF OCF/OPS EPUB compliance validator
│   │   ├── test-assert.js         # Assertion library with descriptive diffs
│   │   ├── loader.js              # Safe module importer with sandbox injection
│   │   └── reference-oracle.js    # Authoritative contract oracle & verification models
│   ├── tier1/                     # Feature Coverage (125 tests)
│   │   ├── f01-manifest.test.js
│   │   ├── f02-jszip.test.js
│   │   ├── f03-audit.test.js
│   │   ├── f04-fetch-down.test.js
│   │   ├── f05-auto-retry.test.js
│   │   ├── f06-tab-down.test.js
│   │   ├── f07-tab-reuse.test.js
│   │   ├── f08-net-rules.test.js
│   │   ├── f09-profiles.test.js
│   │   ├── f10-base-parser.test.js
│   │   ├── f11-inkitt-parser.test.js
│   │   ├── f12-wattpad-parser.test.js
│   │   ├── f13-paid-safety.test.js
│   │   ├── f14-sanitizer-img.test.js
│   │   ├── f15-generic-parser.test.js
│   │   ├── f16-epub-mimetype.test.js
│   │   ├── f17-xml-xhtml.test.js
│   │   ├── f18-epub-manifest.test.js
│   │   ├── f19-dual-ui.test.js
│   │   ├── f20-metadata-ui.test.js
│   │   ├── f21-progress-stats.test.js
│   │   ├── f22-crawl-ui.test.js
│   │   ├── f23-failed-table.test.js
│   │   ├── f24-state-persist.test.js
│   │   └── f25-doc-scenarios.test.js
│   ├── tier2/                     # Boundary & Corner Cases (125 tests)
│   │   ├── b01-b05-crawler-boundary.test.js
│   │   ├── b06-b10-tab-rules-boundary.test.js
│   │   ├── b11-b15-parsers-boundary.test.js
│   │   ├── b16-b18-epub-boundary.test.js
│   │   └── b19-b25-ui-storage-boundary.test.js
│   ├── tier3/                     # Cross-Feature Integration Scenarios (16 tests)
│   │   └── cross-feature.test.js
│   └── tier4/                     # Real-World E2E Novel Simulation (10 tests)
│       └── real-world-e2e.test.js
├── TEST_INFRA.md                  # This specification
└── TEST_READY.md                  # Verification report & checklist
```

### 3.2 Test Runner Command Line Interface
The test suite runs with pure, offline Node.js without any external npm packages:

```bash
# Run all tests (Tiers 1-4)
node tests/test-runner.js

# Run a specific Tier
node tests/test-runner.js --tier 1
node tests/test-runner.js --tier 2
node tests/test-runner.js --tier 3
node tests/test-runner.js --tier 4

# Run tests by milestone
node tests/test-runner.js --milestone M1
node tests/test-runner.js --milestone M2
node tests/test-runner.js --milestone M3
node tests/test-runner.js --milestone M4
node tests/test-runner.js --milestone M5

# Run tests for a specific feature (1 to 25)
node tests/test-runner.js --feature 11

# Run reference oracle self-validation
node tests/test-runner.js --oracle
```

### 3.3 Test Harness Components
1. **`ChromeMock`**:
   - `chrome.storage.local`: In-memory key-value store with `get`, `set`, `remove`, `clear`.
   - `chrome.tabs`: Simulates tab creation (`active: false`), navigation events, sequential URL updates, tab closing.
   - `chrome.scripting`: Simulates script injection into tab DOM contexts (`executeScript`), returning evaluated DOM nodes.
   - `chrome.declarativeNetRequest`: Simulates `updateSessionRules` and tracks session headers applied to requests.
   - `chrome.downloads`: Captures `download` invocations with blob URLs and filenames.
   - `chrome.runtime`: Provides `getManifest()`, `getURL()`, and messaging channels.

2. **`HttpMock`**:
   - Intercepts `global.fetch` calls.
   - Supports routing by URL regex or exact string.
   - Injects configurable responses: Status code (200, 429, 503, 404), headers (`Retry-After`), delayed responses, and network exceptions (`AbortError`, `TypeError`).
   - Records all outgoing requests (URL, method, headers, credentials) for opaque-box assertion.

3. **`EpubValidator`**:
   - Unpacks EPUB binary buffer using ZIP decompression logic.
   - Asserts first file header is `mimetype` with compression method 0 (`STORE`) and 20-byte length.
   - Parses XML files (`content.opf`, `toc.ncx`, `nav.xhtml`, chapter XHTML files) for strict XML well-formedness, tag closures, entity escaping, and UTF-8 encoding.
   - Verifies manifest items match physical files in archive.

4. **`ReferenceOracle`**:
   - Authoritative reference implementations of parsers, EPUB templates, sanitizers, and retry logic derived directly from `PROJECT.md` contracts.
   - Used for differential output comparison and regression tracking.
