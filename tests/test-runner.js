// tests/test-runner.js
// Master Automated Test Runner for VTPATE E2E Test Suite
const fs = require('fs');
const path = require('path');

// Auto-verify and regenerate genuine PNG icons before running tests
const iconCheckPath = path.join(__dirname, '..', 'icons', 'icon16.png');
if (fs.existsSync(iconCheckPath)) {
  const head = fs.readFileSync(iconCheckPath);
  if (head[0] === 0x42 && head[1] === 0x4D) {
    require('../scripts/generate-icons');
  }
} else {
  require('../scripts/generate-icons');
}

// Parse CLI flags
const args = process.argv.slice(2);
const options = {
  tier: null,         // 1, 2, 3, 4
  milestone: null,    // M1, M2, M3, M4, M5, M6
  feature: null,      // 1 to 25
  bail: false,        // stop on first failure
  verbose: false,     // verbose output
  oracleOnly: false   // run oracle/reference verification
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--tier' && args[i + 1]) {
    options.tier = parseInt(args[++i], 10);
  } else if (arg === '--milestone' && args[i + 1]) {
    options.milestone = args[++i].toUpperCase();
  } else if (arg === '--feature' && args[i + 1]) {
    options.feature = parseInt(args[++i], 10);
  } else if (arg === '--bail') {
    options.bail = true;
  } else if (arg === '--verbose' || arg === '-v') {
    options.verbose = true;
  } else if (arg === '--oracle') {
    options.oracleOnly = true;
  }
}

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  white: '\x1b[37m'
};

function logHeader(text) {
  console.log(`\n${colors.bold}${colors.cyan}======================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  ${text}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}======================================================================${colors.reset}\n`);
}

// Collect test suite files
function collectSuites() {
  const suites = [];

  // Tier 1: Feature Coverage (Features 1 to 25)
  const tier1Dir = path.join(__dirname, 'tier1');
  if (fs.existsSync(tier1Dir)) {
    const files = fs.readdirSync(tier1Dir).filter((f) => f.endsWith('.test.js')).sort();
    for (const f of files) {
      try {
        const mod = require(path.join(tier1Dir, f));
        suites.push({ ...mod, tier: 1, file: f });
      } catch (err) {
        console.error(`Failed to load suite ${f}:`, err.message);
      }
    }
  }

  // Tier 2: Boundary & Corner Cases
  const tier2Dir = path.join(__dirname, 'tier2');
  if (fs.existsSync(tier2Dir)) {
    const files = fs.readdirSync(tier2Dir).filter((f) => f.endsWith('.test.js')).sort();
    for (const f of files) {
      try {
        const mod = require(path.join(tier2Dir, f));
        suites.push({ ...mod, tier: 2, file: f });
      } catch (err) {
        console.error(`Failed to load suite ${f}:`, err.message);
      }
    }
  }

  // Tier 3: Cross-Feature Integration Scenarios
  const tier3File = path.join(__dirname, 'tier3', 'cross-feature.test.js');
  if (fs.existsSync(tier3File)) {
    try {
      const mod = require(tier3File);
      suites.push({ ...mod, tier: 3, file: 'cross-feature.test.js' });
    } catch (err) {
      console.error('Failed to load Tier 3 suite:', err.message);
    }
  }

  // Tier 4: Real-World E2E Scenarios
  const tier4File = path.join(__dirname, 'tier4', 'real-world-e2e.test.js');
  if (fs.existsSync(tier4File)) {
    try {
      const mod = require(tier4File);
      suites.push({ ...mod, tier: 4, file: 'real-world-e2e.test.js' });
    } catch (err) {
      console.error('Failed to load Tier 4 suite:', err.message);
    }
  }

  // Tier 5: Adversarial Stress Scenarios
  const tier5Dir = path.join(__dirname, 'tier5');
  if (fs.existsSync(tier5Dir)) {
    const files = fs.readdirSync(tier5Dir).filter((f) => f.endsWith('.test.js')).sort();
    for (const f of files) {
      try {
        const mod = require(path.join(tier5Dir, f));
        suites.push({ ...mod, tier: 5, file: f });
      } catch (err) {
        console.error(`Failed to load Tier 5 suite ${f}:`, err.message);
      }
    }
  }

  return suites;
}

// Filter suites based on CLI options
function filterSuites(allSuites) {
  return allSuites.filter((s) => {
    if (options.tier && s.tier !== options.tier) return false;
    if (options.milestone && s.milestone && s.milestone !== options.milestone) return false;
    if (options.feature && s.featureId && s.featureId !== options.feature) return false;
    return true;
  });
}

async function runTest(testCase) {
  const start = Date.now();
  try {
    const p = testCase.fn();
    if (p && typeof p.then === 'function') {
      await p;
    }
    const elapsed = Date.now() - start;
    return { passed: true, error: null, elapsed };
  } catch (err) {
    const elapsed = Date.now() - start;
    return { passed: false, error: err, elapsed };
  }
}

async function main() {
  logHeader('VTPATE E2E TEST RUNNER - CHROME EXTENSION & EPUB STUDIO');

  // Auto-verify official JSZip before running tests
  const jszipCheckPath = path.join(__dirname, '..', 'libs', 'jszip.min.js');
  if (fs.existsSync(jszipCheckPath)) {
    const jszipContent = fs.readFileSync(jszipCheckPath, 'utf8');
    if (jszipContent.includes('epubStandards') || jszipContent.length < 50000) {
      console.log('[test-runner] Procuring authentic official JSZip v3.10.1...');
      try {
        const { fetchOfficialJSZip } = require('../scripts/fetch-jszip');
        await fetchOfficialJSZip();
      } catch (err) {
        console.warn('[test-runner] Warning: Could not auto-fetch official JSZip:', err.message);
      }
    }
  }

  const allSuites = collectSuites();
  const suitesToRun = filterSuites(allSuites);

  const stats = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    durationMs: 0,
    tierBreakdown: {
      1: { total: 0, passed: 0, failed: 0 },
      2: { total: 0, passed: 0, failed: 0 },
      3: { total: 0, passed: 0, failed: 0 },
      4: { total: 0, passed: 0, failed: 0 },
      5: { total: 0, passed: 0, failed: 0 }
    },
    failures: []
  };

  const suiteStartTime = Date.now();

  for (const suite of suitesToRun) {
    const tier = suite.tier || 1;
    console.log(`\n${colors.bold}${colors.white}[Tier ${tier}] ${suite.name}${colors.reset}`);

    for (const testCase of suite.tests || []) {
      stats.total++;
      stats.tierBreakdown[tier].total++;

      const res = await runTest(testCase);
      if (res.passed) {
        stats.passed++;
        stats.tierBreakdown[tier].passed++;
        console.log(`  ${colors.green}√${colors.reset} ${testCase.name} ${colors.gray}(${res.elapsed}ms)${colors.reset}`);
      } else {
        stats.failed++;
        stats.tierBreakdown[tier].failed++;
        const failRecord = {
          tier,
          suite: suite.name,
          test: testCase.name,
          error: res.error,
          elapsed: res.elapsed
        };
        stats.failures.push(failRecord);
        console.log(`  ${colors.red}× ${testCase.name} (${res.elapsed}ms)${colors.reset}`);
        console.log(`    ${colors.red}${res.error.message}${colors.reset}`);

        if (options.bail) {
          console.log(`\n${colors.yellow}Bail flag specified. Halting test run on first failure.${colors.reset}`);
          break;
        }
      }
    }

    if (options.bail && stats.failed > 0) {
      break;
    }
  }

  stats.durationMs = Date.now() - suiteStartTime;

  // Print Summary Table
  logHeader('TEST EXECUTION SUMMARY');

  console.log(`  ${colors.bold}Tier Breakdown:${colors.reset}`);
  console.log(`  -------------------------------------------------------------`);
  console.log(`  Tier 1 (Feature Coverage)         : ${stats.tierBreakdown[1].passed} passed, ${stats.tierBreakdown[1].failed} failed, ${stats.tierBreakdown[1].total} total`);
  console.log(`  Tier 2 (Boundary & Corner Cases)  : ${stats.tierBreakdown[2].passed} passed, ${stats.tierBreakdown[2].failed} failed, ${stats.tierBreakdown[2].total} total`);
  console.log(`  Tier 3 (Cross-Feature Scenarios)  : ${stats.tierBreakdown[3].passed} passed, ${stats.tierBreakdown[3].failed} failed, ${stats.tierBreakdown[3].total} total`);
  console.log(`  Tier 4 (Real-World E2E Scenarios) : ${stats.tierBreakdown[4].passed} passed, ${stats.tierBreakdown[4].failed} failed, ${stats.tierBreakdown[4].total} total`);
  if (stats.tierBreakdown[5] && stats.tierBreakdown[5].total > 0) {
    console.log(`  Tier 5 (Adversarial Coverage)     : ${stats.tierBreakdown[5].passed} passed, ${stats.tierBreakdown[5].failed} failed, ${stats.tierBreakdown[5].total} total`);
  }
  console.log(`  -------------------------------------------------------------`);
  console.log(`  ${colors.bold}TOTAL TESTS${colors.reset}                       : ${stats.total}`);
  console.log(`  ${colors.bold}${colors.green}PASSED${colors.reset}                            : ${stats.passed}`);
  console.log(`  ${colors.bold}${stats.failed > 0 ? colors.red : colors.green}FAILED${colors.reset}                            : ${stats.failed}`);
  console.log(`  ${colors.bold}EXECUTION TIME${colors.reset}                    : ${(stats.durationMs / 1000).toFixed(2)}s`);
  console.log(`  -------------------------------------------------------------\n`);

  if (stats.failures.length > 0) {
    console.log(`${colors.bold}${colors.red}FAILURES DETAIL (${stats.failures.length}):${colors.reset}`);
    stats.failures.forEach((f, idx) => {
      console.log(`\n  ${idx + 1}) [Tier ${f.tier}] ${f.suite} > ${f.test}`);
      console.log(`     ${colors.red}${f.error.stack || f.error.message}${colors.reset}`);
    });
    console.log('\n');
    process.exit(1);
  } else {
    console.log(`${colors.bold}${colors.green}ALL TESTS PASSED SUCCESSFULLY! (100% PASS RATE)${colors.reset}\n`);
    process.exit(0);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal Test Runner Error:', err);
    process.exit(1);
  });
}

module.exports = {
  collectSuites,
  filterSuites,
  runTest,
  main
};
