// src/epub/epub-css.js
// Production Typography Stylesheet for Web Novels & Vietnamese Diacritics

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var exp = factory();
    root.EpubCss = exp;
    root.EPUB_CSS = exp.EPUB_CSS;
  }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  var EPUB_CSS = `@charset "UTF-8";

/* ==========================================================================
   VTPATE Production Typography Stylesheet for EPUB 2/3 Web Novels
   Optimized for Vietnamese diacritics, KOReader, Calibre & mobile e-readers
   ========================================================================== */

@namespace epub "http://www.idpf.org/2007/ops";

/* Global Page & Document Defaults */
html {
  font-size: 100%;
  line-height: 1.7;
  -webkit-text-size-adjust: 100%;
  text-rendering: optimizeLegibility;
}

body {
  margin: 0;
  padding: 5% 5%;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Serif", "Times New Roman", Georgia, serif;
  font-size: 1.05em;
  line-height: 1.75;
  color: #222222;
  background-color: #fafafa;
  text-align: justify;
  text-justify: inter-word;
  hyphens: auto;
  word-break: break-word;
  overflow-wrap: break-word;
}

/* Chapter Heading Structure */
.chapter-container {
  display: block;
  margin: 0 auto;
  max-width: 48em;
}

h1.chapter-title,
h2.chapter-title,
h1, h2 {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", sans-serif;
  font-weight: 700;
  color: #111111;
  text-align: center;
  margin-top: 1.8em;
  margin-bottom: 1.2em;
  line-height: 1.35;
  page-break-after: avoid;
  break-after: avoid;
}

h1.chapter-title {
  font-size: 1.6em;
  border-bottom: 1px solid #e0e0e0;
  padding-bottom: 0.5em;
}

h2 {
  font-size: 1.3em;
}

h3 {
  font-size: 1.15em;
  margin-top: 1.4em;
  margin-bottom: 0.8em;
  page-break-after: avoid;
  break-after: avoid;
}

/* Paragraph Typography & Vietnamese Indentation */
p {
  margin: 0 0 0.8em 0;
  text-indent: 1.8em;
  font-weight: 400;
}

/* First paragraph or paragraphs following headings do not indent */
h1 + p,
h2 + p,
h3 + p,
.no-indent,
p.no-indent {
  text-indent: 0;
}

/* Emphasized Text */
b, strong {
  font-weight: 700;
}

i, em {
  font-style: italic;
}

/* Blockquotes, Notices & Scene Breaks */
blockquote {
  margin: 1.2em 2em;
  padding-left: 1em;
  border-left: 3px solid #bbbbbb;
  font-style: italic;
  color: #555555;
}

hr {
  border: 0;
  height: 1px;
  background: #cccccc;
  margin: 2em auto;
  width: 40%;
  page-break-after: avoid;
}

/* Lists */
ul, ol {
  margin: 0.8em 0 0.8em 1.5em;
  padding: 0;
}

li {
  margin-bottom: 0.4em;
  line-height: 1.6;
}

/* Responsive Images & Figures */
img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1.5em auto;
  object-fit: contain;
  page-break-inside: avoid;
  break-inside: avoid;
}

figure {
  margin: 1.5em auto;
  text-align: center;
}

figcaption {
  font-size: 0.88em;
  color: #666666;
  margin-top: 0.5em;
  font-style: italic;
}

/* Navigation Table of Contents */
nav#toc ol {
  list-style-type: none;
  padding-left: 0;
  margin: 1em 0;
}

nav#toc li {
  margin: 0.6em 0;
  border-bottom: 1px dashed #e8e8e8;
  padding-bottom: 0.4em;
}

nav#toc a {
  color: #1a56a4;
  text-decoration: none;
  font-weight: 500;
}

nav#toc a:hover,
nav#toc a:focus {
  text-decoration: underline;
}

/* Special Author / Notice Elements */
.author-note,
.translator-note,
.paywall-notice {
  background-color: #f4f4f4;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  padding: 0.8em 1.2em;
  margin: 1.2em 0;
  font-size: 0.92em;
  color: #444444;
}

.paywall-notice {
  border-left: 4px solid #f39c12;
  background-color: #fef9e7;
  color: #7d6608;
  font-weight: 500;
}

/* Night / Dark Mode Readers */
@media (prefers-color-scheme: dark) {
  body {
    background-color: #181818;
    color: #dedede;
  }

  h1.chapter-title,
  h2.chapter-title,
  h1, h2, h3 {
    color: #f0f0f0;
    border-color: #333333;
  }

  blockquote {
    border-color: #555555;
    color: #aaaaaa;
  }

  hr {
    background: #333333;
  }

  nav#toc li {
    border-color: #2c2c2c;
  }

  nav#toc a {
    color: #6ba4e8;
  }

  .author-note,
  .translator-note {
    background-color: #242424;
    border-color: #333333;
    color: #cccccc;
  }

  .paywall-notice {
    background-color: #2a220a;
    border-color: #b78103;
    color: #f7dc6f;
  }
}
`;

  function getEpubCss(options) {
    var opts = options || {};
    var font = opts.customFont;
    if (font && (font.enabled !== false) && font.filename) {
      var fontName = font.name || 'NovelCustomFont';
      var fontFilename = font.filename;
      var format = fontFilename.endsWith('.woff2') ? 'woff2' : (fontFilename.endsWith('.woff') ? 'woff' : (fontFilename.endsWith('.otf') ? 'opentype' : 'truetype'));
      var fontFace = '@font-face {\n' +
        '  font-family: "' + fontName + '";\n' +
        '  src: url("../fonts/' + fontFilename + '") format("' + format + '");\n' +
        '  font-weight: normal;\n' +
        '  font-style: normal;\n' +
        '}\n\n' +
        'body, .chapter-content, p {\n' +
        '  font-family: "' + fontName + '", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Serif", serif;\n' +
        '}\n\n';
      return fontFace + EPUB_CSS;
    }
    return EPUB_CSS;
  }

  return {
    EPUB_CSS: EPUB_CSS,
    getEpubCss: getEpubCss
  };
});
