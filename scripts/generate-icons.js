/**
 * Standalone PNG Icon Generator for VTPATE
 * Uses pure Node.js standard library (zlib) to generate valid, compliant PNG icons
 * for 16x16, 48x48, and 128x128 dimensions.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 table
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c;
}

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = data.length;
  const buf = Buffer.alloc(8 + len + 4);
  buf.writeUInt32BE(len, 0);
  typeBuf.copy(buf, 4);
  data.copy(buf, 8);
  const crcTarget = Buffer.concat([typeBuf, data]);
  const crcVal = crc32(crcTarget);
  buf.writeUInt32BE(crcVal, 8 + len);
  return buf;
}

/**
 * Generate a PNG Buffer for a book icon with given dimensions
 */
function generateIconPng(size) {
  const width = size;
  const height = size;

  // Raw scanlines: each row starts with filter byte 0 (None) followed by width * 4 RGBA bytes
  const scanlineLength = 1 + width * 4;
  const rawData = Buffer.alloc(height * scanlineLength);

  // Background and accent colors (RGBA)
  const bgBlue = [2, 132, 199, 255];      // #0284c7 Primary blue
  const pageWhite = [255, 255, 255, 255]; // Pure white
  const spineDark = [3, 105, 161, 255];   // #0369a1 Darker blue
  const arrowCyan = [56, 189, 248, 255];  // #38bdf8 Cyan accent
  const transparent = [0, 0, 0, 0];

  const radius = Math.floor(size * 0.18);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLength;
    rawData[rowOffset] = 0; // Filter: None

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;

      // Rounded container check
      const margin = Math.max(1, Math.floor(size * 0.05));
      const inBox = (x >= margin && x < width - margin && y >= margin && y < height - margin);

      let color = transparent;
      if (inBox) {
        // Rounded corner calculation
        const cx = x < margin + radius ? margin + radius : (x >= width - margin - radius ? width - margin - radius - 1 : x);
        const cy = y < margin + radius ? margin + radius : (y >= height - margin - radius ? height - margin - radius - 1 : y);
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= radius * radius) {
          color = bgBlue;

          // Draw book pages inside
          const bookLeft = Math.floor(size * 0.22);
          const bookRight = Math.floor(size * 0.78);
          const bookTop = Math.floor(size * 0.25);
          const bookBottom = Math.floor(size * 0.75);

          if (x >= bookLeft && x <= bookRight && y >= bookTop && y <= bookBottom) {
            const midX = Math.floor(size * 0.5);
            if (x === midX) {
              color = spineDark; // Center spine
            } else {
              color = pageWhite; // Pages
            }
          }

          // Draw download arrow in center
          const arrowX = Math.floor(size * 0.5);
          const arrowTop = Math.floor(size * 0.35);
          const arrowTipY = Math.floor(size * 0.62);
          const arrowSpread = Math.floor(size * 0.12);

          // Arrow shaft
          if (Math.abs(x - arrowX) <= Math.max(0, Math.floor(size * 0.04)) && y >= arrowTop && y <= arrowTipY) {
            color = arrowCyan;
          }
          // Arrow head
          if (y >= arrowTipY - arrowSpread && y <= arrowTipY) {
            const dyHead = y - (arrowTipY - arrowSpread);
            const headSpreadAtY = Math.floor((dyHead / arrowSpread) * arrowSpread);
            if (Math.abs(x - arrowX) <= (arrowSpread - headSpreadAtY)) {
              color = arrowCyan;
            }
          }
        }
      }

      rawData[pxOffset] = color[0];
      rawData[pxOffset + 1] = color[1];
      rawData[pxOffset + 2] = color[2];
      rawData[pxOffset + 3] = color[3];
    }
  }

  // Deflate scanlines
  const compressedData = zlib.deflateSync(rawData);

  // PNG Signature
  const pngSig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // IHDR chunk: 13 bytes
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // Bit depth: 8
  ihdrData[9] = 6; // Color type: 6 (RGBA)
  ihdrData[10] = 0; // Compression: 0
  ihdrData[11] = 0; // Filter: 0
  ihdrData[12] = 0; // Interlace: 0
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // IDAT chunk
  const idatChunk = makeChunk('IDAT', compressedData);

  // IEND chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([pngSig, ihdrChunk, idatChunk, iendChunk]);
}

// Generate files
const iconsDir = path.resolve(__dirname, '..', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 48, 128].forEach(size => {
  const buf = generateIconPng(size);
  const outPath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(outPath, buf);
  console.log(`Generated ${outPath} (${buf.length} bytes)`);
});
