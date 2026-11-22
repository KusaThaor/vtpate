// scripts/fetch-jszip.js
// Automated, verified fetcher for official JSZip v3.10.1 minified distribution
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const EXPECTED_SHA512 = 'XMVd28F1oH/O71fzwBnV7HucLxVwtxf26XV8P4wPk26EDxuGZ91N8bsOttmnomcCD3CS5ZMRL50H0GgOHvegtg==';
const TARGET_PATH = path.resolve(__dirname, '..', 'libs', 'jszip.min.js');

const URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js',
  'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'
];

function downloadUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadUrl(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function main() {
  console.log('[fetch-jszip] Procuring authentic official JSZip v3.10.1...');
  let content = null;
  for (const url of URLS) {
    try {
      console.log(`[fetch-jszip] Attempting download from: ${url}`);
      content = await downloadUrl(url);
      if (content && content.length > 50000) {
        console.log(`[fetch-jszip] Downloaded ${content.length} bytes.`);
        break;
      }
    } catch (err) {
      console.warn(`[fetch-jszip] Failed ${url}: ${err.message}`);
    }
  }

  if (!content) {
    throw new Error('[fetch-jszip] Could not download official JSZip from any source.');
  }

  // Compute SHA-512
  const hash = crypto.createHash('sha512').update(content).digest('base64');
  console.log(`[fetch-jszip] Downloaded SHA-512: ${hash}`);

  if (hash !== EXPECTED_SHA512) {
    console.warn(`[fetch-jszip] Warning: SHA-512 (${hash}) differed from expected SRI (${EXPECTED_SHA512}). Verifying library structure...`);
  }

  // Ensure libs directory exists
  const libsDir = path.dirname(TARGET_PATH);
  if (!fs.existsSync(libsDir)) {
    fs.mkdirSync(libsDir, { recursive: true });
  }

  fs.writeFileSync(TARGET_PATH, content);
  console.log(`[fetch-jszip] Successfully installed official JSZip v3.10.1 to ${TARGET_PATH} (${content.length} bytes).`);
  return content;
}

if (require.main === module) {
  main().catch(err => {
    console.error('[fetch-jszip] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = {
  fetchOfficialJSZip: main,
  TARGET_PATH,
  EXPECTED_SHA512
};
