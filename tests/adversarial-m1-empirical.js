// tests/adversarial-m1-empirical.js
// Adversarial Stress Harness for Milestone M1 (VTPATE)
// Challenger 2 Empirical Verification

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PROJECT_ROOT = path.resolve(__dirname, '..');

console.log('===============================================================');
console.log('ADVERSARIAL STRESS TEST SUITE — MILESTONE M1');
console.log('===============================================================\n');

let totalChallenges = 0;
let challengeFailures = [];

function recordTest(name, passed, detail) {
  totalChallenges++;
  if (passed) {
    console.log(`[PASS] ${name}`);
  } else {
    console.error(`[FAIL] ${name} -> ${detail}`);
    challengeFailures.push({ name, detail });
  }
}

// -----------------------------------------------------------------
// 1. MANIFEST SCHEMA & CSP ADVERSARIAL AUDIT
// -----------------------------------------------------------------
console.log('--- 1. Adversarial Audit: manifest.json ---');
const manifestPath = path.join(PROJECT_ROOT, 'manifest.json');
const manifestRaw = fs.readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(manifestRaw);

// MV2 deprecated keys check
const mv2DeprecatedKeys = ['browser_action', 'page_action', 'background.scripts'];
const foundDeprecated = mv2DeprecatedKeys.filter(k => {
  if (k.includes('.')) {
    const [p1, p2] = k.split('.');
    return manifest[p1] && manifest[p1][p2];
  }
  return manifest[k] !== undefined;
});
recordTest(
  'Manifest does not contain deprecated MV2 fields',
  foundDeprecated.length === 0,
  `Found deprecated keys: ${foundDeprecated.join(', ')}`
);

// MV3 CSP format check
const cspIsObject = manifest.content_security_policy && typeof manifest.content_security_policy === 'object';
const cspHasExtensionPages = cspIsObject && typeof manifest.content_security_policy.extension_pages === 'string';
const cspHasNoEval = cspHasExtensionPages && !manifest.content_security_policy.extension_pages.includes("'unsafe-eval'");
recordTest(
  'Manifest CSP uses MV3 dictionary syntax and forbids unsafe-eval',
  cspIsObject && cspHasExtensionPages && cspHasNoEval,
  'CSP does not conform to strict MV3 dictionary format'
);

// Icon file binary validity check (Check if icons are real PNG or mislabeled BMP)
['icon16.png', 'icon48.png', 'icon128.png'].forEach(iconName => {
  const iconPath = path.join(PROJECT_ROOT, 'icons', iconName);
  if (!fs.existsSync(iconPath)) {
    recordTest(`Icon file exists: ${iconName}`, false, 'File not found');
    return;
  }
  const buf = fs.readFileSync(iconPath);
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  const isPng = buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a;
  
  const isBmp = buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4d; // 'BM'
  
  recordTest(
    `Icon ${iconName} is genuine PNG (not BMP mislabeled)`,
    isPng,
    isBmp ? `Icon is a Windows BMP file (starts with 'BM' / 0x42 0x4D), NOT a valid PNG! Length: ${buf.length} bytes.` : 'Not a valid PNG signature.'
  );
});

// -----------------------------------------------------------------
// 2. JSZIP OFFICIAL LIBRARY COMPLIANCE (Requirement R1, Feature 2)
// -----------------------------------------------------------------
console.log('\n--- 2. Adversarial Audit: libs/jszip.min.js ---');
const jszipPath = path.join(PROJECT_ROOT, 'libs', 'jszip.min.js');
const jszipContent = fs.readFileSync(jszipPath, 'utf8');

// Official minified JSZip v3.10.1 is ~98KB (>50KB required by tests/tier1/f02-jszip.test.js)
const isProperSize = jszipContent.length > 50000;
recordTest(
  'libs/jszip.min.js is official minified JSZip (>50KB per test F2.1)',
  isProperSize,
  `File size is ${jszipContent.length} bytes (< 50,000 bytes required). Custom surrogate detected instead of official library.`
);

// -----------------------------------------------------------------
// 3. BACKGROUND SERVICE WORKER STRESS TEST
// -----------------------------------------------------------------
console.log('\n--- 3. Adversarial Stress Test: background/background.js ---');
// Mock chrome API environment
let messageListeners = [];
let storageData = {};
let tabsCreated = [];
let dnrRules = [];

const mockChrome = {
  runtime: {
    getManifest: () => manifest,
    getURL: (p) => `chrome-extension://mock-id/${p}`,
    onInstalled: { addListener: () => {} },
    onMessage: {
      addListener: (fn) => { messageListeners.push(fn); }
    }
  },
  storage: {
    local: {
      get: async () => storageData,
      set: async (d) => { Object.assign(storageData, d); }
    }
  },
  tabs: {
    create: async (opts) => {
      const tab = { id: Math.floor(Math.random() * 10000), url: opts.url, active: opts.active, windowId: 1 };
      tabsCreated.push(tab);
      return tab;
    },
    update: async (id, opts) => ({ id, ...opts }),
    remove: async (id) => {},
    query: async () => []
  },
  declarativeNetRequest: {
    getSessionRules: async () => [...dnrRules],
    updateSessionRules: async ({ addRules = [], removeRuleIds = [] }) => {
      const removeSet = new Set(removeRuleIds);
      dnrRules = dnrRules.filter(r => !removeSet.has(r.id));
      for (const r of addRules) {
        if (dnrRules.some(existing => existing.id === r.id)) {
          throw new Error(`Rule with id ${r.id} already exists`);
        }
        dnrRules.push(r);
      }
    }
  }
  // NOTE: chrome.windows is intentionally omitted to test resilience against missing chrome.windows
};

// Load background script into VM
const bgCode = fs.readFileSync(path.join(PROJECT_ROOT, 'background', 'background.js'), 'utf8');
const context = vm.createContext({
  chrome: mockChrome,
  console: {
    log: () => {},
    info: () => {},
    warn: () => {},
    error: () => {}
  },
  Date,
  Math,
  Object,
  Array,
  Promise,
  String,
  Error,
  TypeError
});

try {
  vm.runInContext(bgCode, context);
  recordTest('background.js loads without syntax errors', true, '');
} catch (err) {
  recordTest('background.js loads without syntax errors', false, err.message);
}

// Helper to send message through listener
async function sendMessage(msg) {
  return new Promise((resolve) => {
    let responded = false;
    const sendResponse = (res) => {
      responded = true;
      resolve(res);
    };
    for (const l of messageListeners) {
      const isAsync = l(msg, {}, sendResponse);
      if (!isAsync && !responded) {
        resolve(undefined);
      }
    }
  });
}

(async () => {
  // Test 3.1: Malformed messages
  const malformedInputs = [null, undefined, 123, "hello", {}, { action: null }, { action: undefined }];
  let malformedPassed = true;
  for (const input of malformedInputs) {
    try {
      const res = await sendMessage(input);
      // Malformed inputs return undefined without crashing
    } catch (e) {
      malformedPassed = false;
      break;
    }
  }
  recordTest('Service worker handles null/primitive/empty messages without unhandled exceptions', malformedPassed, 'Crashed on malformed input');

  // Test 3.2: Unknown action string
  const unknownRes = await sendMessage({ action: 'NON_EXISTENT_ACTION_12345' });
  recordTest(
    'Service worker safely handles unknown action strings',
    unknownRes && unknownRes.success === false && unknownRes.error && unknownRes.error.includes('Unknown action'),
    `Expected unknown action error object, got: ${JSON.stringify(unknownRes)}`
  );

  // Test 3.3: Missing payload arguments on DNR_APPLY_RULES
  const dnrEmptyRes = await sendMessage({ action: 'DNR_APPLY_RULES' });
  recordTest(
    'DNR_APPLY_RULES handles missing message.rules gracefully',
    dnrEmptyRes && dnrEmptyRes.success === true,
    `Failed with missing rules: ${JSON.stringify(dnrEmptyRes)}`
  );

  // Test 3.4: Malformed rules payload (string or object instead of array)
  const dnrMalformedRes = await sendMessage({ action: 'DNR_APPLY_RULES', rules: 'invalid_rules' });
  recordTest(
    'DNR_APPLY_RULES catches non-array rules payload and returns error response',
    dnrMalformedRes && dnrMalformedRes.success === false,
    `Did not return error for non-array rules: ${JSON.stringify(dnrMalformedRes)}`
  );

  // Test 3.5: Concurrent DNR requests ID collision test
  let dnrCollisionDetected = false;
  try {
    const p1 = sendMessage({ action: 'DNR_APPLY_RULES', rules: [{ header: 'X-Test-1', value: '1' }] });
    const p2 = sendMessage({ action: 'DNR_APPLY_RULES', rules: [{ header: 'X-Test-2', value: '2' }] });
    const [r1, r2] = await Promise.all([p1, p2]);
    if (!r1.success || !r2.success) {
      dnrCollisionDetected = true;
    }
  } catch (err) {
    dnrCollisionDetected = true;
  }
  recordTest(
    'Concurrent DNR_APPLY_RULES requests do not collide on hardcoded rule IDs',
    !dnrCollisionDetected,
    'Rule ID collision occurred during concurrent requests due to static DNR_RULE_BASE_ID + idx calculation'
  );

  // -----------------------------------------------------------------
  // SUMMARY
  // -----------------------------------------------------------------
  console.log('\n===============================================================');
  console.log(`TOTAL ADVERSARIAL CHALLENGES: ${totalChallenges}`);
  console.log(`FAILURES FOUND: ${challengeFailures.length}`);
  console.log('===============================================================');
  if (challengeFailures.length > 0) {
    console.log('\nIDENTIFIED VULNERABILITIES & COMPLIANCE DEFECTS:');
    challengeFailures.forEach((f, i) => {
      console.log(`  ${i + 1}. [${f.name}]: ${f.detail}`);
    });
  }
})();
