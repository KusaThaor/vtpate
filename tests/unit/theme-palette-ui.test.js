const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('Testing Theme Palette & UI Presentation Consistency...');

const htmlPath = path.resolve('manager.html');
const cssPath = path.resolve('manager.css');
const jsPath = path.resolve('manager.js');
const tabsJsPath = path.resolve('manager-tabs.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');
const tabsJs = fs.readFileSync(tabsJsPath, 'utf8');

// 1. Theme Selector Element in HTML
assert(html.includes('id="themeSelect"'), 'manager.html must contain themeSelect element');
assert(html.includes('value="custom-palette"'), 'manager.html must offer custom-palette option');
assert(html.includes('value="palette-pastel"'), 'manager.html must offer palette-pastel option');
assert(html.includes('value="dark-classic"'), 'manager.html must offer dark-classic option');
assert(html.includes('class="theme-selector-box"'), 'manager.html must contain theme-selector-box wrapper');
console.log('Test 1: Theme Selector element in manager.html verified.');

// 2. Palette 5-color tokens in manager.css
const userColors = [
  '#d0d9e6', // Slate Mist
  '#f2d3d3', // Blush Rose
  '#2db0b1', // Island Teal
  '#e67eef', // Orchid Lilac
  '#915e56'  // Terracotta
];

for (const col of userColors) {
  assert(css.includes(col), `manager.css must contain user palette color: ${col}`);
}
console.log('Test 2: All 5 user palette colors (#d0d9e6, #f2d3d3, #2db0b1, #e67eef, #915e56) verified in manager.css.');

// 3. Contrast & Legibility Tokens
assert(css.includes('--text-primary: #ffffff'), 'manager.css must have pure white primary text for dark theme legibility');
assert(css.includes('--text-secondary: #d0d9e6'), 'manager.css must use #d0d9e6 for secondary text and labels');
assert(css.includes('--text-on-blush: #421614'), 'manager.css must have high-contrast dark text on blush pastel background');
assert(css.includes('.theme-selector-box'), 'manager.css must style theme-selector-box');
assert(css.includes('.manager-tabs.vertical-tabs button[aria-selected="true"]'), 'manager.css must style vertical active tab');
console.log('Test 3: High-contrast typography & token hierarchy verified.');

// 4. Left Sidebar & Hamburger Navigation Structure
assert(html.includes('id="btn-toggle-sidebar"'), 'manager.html must contain hamburger toggle button');
assert(html.includes('id="app-sidebar"'), 'manager.html must contain left sidebar');
assert(html.includes('class="manager-tabs vertical-tabs"'), 'manager.html must use vertical tabs in sidebar');
assert(html.includes('id="sidebarBackdrop"'), 'manager.html must contain sidebarBackdrop');
assert(css.includes('.app-sidebar'), 'manager.css must style app-sidebar');
assert(css.includes('.app-layout.sidebar-collapsed .app-sidebar'), 'manager.css must style collapsed sidebar');
assert(tabsJs.includes('btn-toggle-sidebar'), 'manager-tabs.js must wire hamburger toggle');
console.log('Test 4: Left Sidebar & Hamburger Navigation verified.');

// 5. manager.js theme handling & persistence
assert(js.includes('themeSelect'), 'manager.js must reference themeSelect');
assert(js.includes('custom-palette'), 'manager.js must handle custom-palette');
assert(js.includes('palette-pastel'), 'manager.js must handle palette-pastel');
assert(js.includes('vtpate_theme'), 'manager.js must persist theme under vtpate_theme key');
assert(js.includes('document.documentElement.setAttribute(\'data-theme\''), 'manager.js must apply data-theme attribute');
console.log('Test 5: Theme switching and persistence logic in manager.js verified.');

console.log('\nAll Theme Palette & Left Navigation tests PASSED successfully!');
