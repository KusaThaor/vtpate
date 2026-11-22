const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('Testing Settings Layout Alignment & Theme Synchronization...');

const htmlPath = path.resolve('manager.html');
const cssPath = path.resolve('manager.css');
const jsPath = path.resolve('manager.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');

// 1. Settings Panel Structured Form Elements & IDs
const requiredSettingsIds = [
  'crawl-mode',
  'concurrency',
  'delay',
  'page-load-wait',
  'jitter',
  'enable-wpm-delay',
  'reading-wpm',
  'max-wait-seconds',
  'inter-chapter-delay',
  'recheck-wait-seconds',
  'break-interval',
  'break-seconds',
  'visible-tab-crawl',
  'background-chapters-crawl',
  'auto-retry-failed-crawl',
  'include-inline-images',
  'auto-pause-on-sleep',
  'auto-fill-placeholders',
  'auto-skip-errors-crawl',
  'max-consecutive-errors',
  'epub-split-size'
];

for (const id of requiredSettingsIds) {
  assert(html.includes(`id="${id}"`), `manager.html must contain settings element: id="${id}"`);
}
console.log('Test 1: All 21 Settings Form IDs verified in manager.html.');

// 2. Structured Layout Classes & Alignment Rules
assert(html.includes('class="card-body settings-card-body"'), 'Settings panel must use settings-card-body wrapper');
assert(html.includes('class="settings-subgroup"'), 'Settings panel must group inputs into clean sub-cards');
assert(html.includes('class="aligned-label"'), 'Settings inputs must use aligned-label for horizontal baseline alignment');
assert(html.includes('class="settings-switch-grid"'), 'Automation options must use settings-switch-grid');
assert(html.includes('class="setting-switch-card"'), 'Checkboxes must be rendered as clean setting switch cards');

assert(css.includes('.aligned-label'), 'manager.css must style .aligned-label');
assert(css.includes('min-height: 42px') || css.includes('min-height: 38px') || css.includes('min-height: 40px'), 'manager.css .aligned-label must enforce min-height for uniform baseline');
assert(!css.includes('.grid-form {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));\n  gap: 16px;\n  align-items: end;'), 'manager.css .grid-form must not use align-items: end');
console.log('Test 2: Structured Settings Form Alignment verified in HTML & CSS.');

// 3. Theme Color Synchronization
assert(css.includes('--bg-sidebar: #dbe6f3;'), 'manager.css must use light #dbe6f3 for sidebar in pastel theme');
assert(!css.includes('body.theme-palette-pastel .app-header {\n  background-color: #182230;'), 'manager.css must not force dark #182230 header in pastel theme');
assert(css.includes('body.theme-palette-pastel .app-sidebar'), 'manager.css must explicitly style .app-sidebar for pastel theme');
assert(css.includes('body.theme-palette-pastel .app-footer'), 'manager.css must style .app-footer for pastel theme');
console.log('Test 3: Pastel Theme Color Synchronization (Header, Sidebar, Body, Footer) verified.');

// 4. Custom Theme Selector Widget ("custom lại nút chỉnh thô")
assert(html.includes('id="themeIndicatorDot"'), 'manager.html must contain themeIndicatorDot element');
assert(css.includes('.theme-color-indicator'), 'manager.css must style .theme-color-indicator');
assert(css.includes('border-radius: 9999px;'), 'manager.css must style .theme-selector-box as sleek rounded capsule pill');
assert(css.includes('-webkit-appearance: none;'), 'manager.css must reset default native browser select styling');
assert(css.includes('background-image: url("data:image/svg+xml'), 'manager.css must use custom SVG dropdown chevron');
assert(js.includes('themeIndicatorDot'), 'manager.js must update themeIndicatorDot on theme change');
console.log('Test 4: Sleek Custom Theme Selector Widget verified.');

console.log('\nAll Settings Layout Alignment & Theme Synchronization tests PASSED successfully!');
