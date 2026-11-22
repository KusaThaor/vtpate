// tests/tier1/f03-audit.test.js
// Tier 1 - Feature 3: Clean Codebase Audit & Zero TODOs
const fs = require('fs');
const path = require('path');
const { assert } = require('../harness/test-assert');
const { PROJECT_ROOT } = require('../harness/loader');

function getProductionFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'tests' || entry.name.startsWith('.') || entry.name === 'libs' || entry.name === 'WebToEpub') {
        continue;
      }
      getProductionFiles(fullPath, fileList);
    } else if (entry.isFile()) {
      if (entry.name.endsWith('.js') || entry.name.endsWith('.html') || entry.name.endsWith('.json')) {
        fileList.push(fullPath);
      }
    }
  }
  return fileList;
}

module.exports = {
  name: 'Feature 3: Clean Codebase Audit & Zero TODOs',
  featureId: 3,
  milestone: 'M1',
  tests: [
    {
      name: 'F3.1: Zero TODO comments in all production source files',
      fn: () => {
        const files = getProductionFiles(PROJECT_ROOT);
        assert.ok(files.length > 0, 'Production files must exist');
        const todoRegex = /\/\/\s*TODO\b|\/\*\s*TODO\b/i;
        const violations = [];
        for (const file of files) {
          const content = fs.readFileSync(file, 'utf-8');
          const lines = content.split('\n');
          lines.forEach((line, idx) => {
            if (todoRegex.test(line)) {
              violations.push(`${path.relative(PROJECT_ROOT, file)}:${idx + 1}: ${line.trim()}`);
            }
          });
        }
        assert.strictEqual(violations.length, 0, `Found ${violations.length} TODO comment(s):\n${violations.slice(0, 5).join('\n')}`);
      }
    },
    {
      name: 'F3.2: Zero FIXME comments in all production source files',
      fn: () => {
        const files = getProductionFiles(PROJECT_ROOT);
        assert.ok(files.length > 0, 'Production files must exist');
        const fixmeRegex = /\/\/\s*FIXME\b|\/\*\s*FIXME\b/i;
        const violations = [];
        for (const file of files) {
          const content = fs.readFileSync(file, 'utf-8');
          const lines = content.split('\n');
          lines.forEach((line, idx) => {
            if (fixmeRegex.test(line)) {
              violations.push(`${path.relative(PROJECT_ROOT, file)}:${idx + 1}: ${line.trim()}`);
            }
          });
        }
        assert.strictEqual(violations.length, 0, `Found ${violations.length} FIXME comment(s):\n${violations.slice(0, 5).join('\n')}`);
      }
    },
    {
      name: 'F3.3: No "Not implemented" placeholder errors in production code',
      fn: () => {
        const files = getProductionFiles(PROJECT_ROOT);
        assert.ok(files.length > 0, 'Production files must exist');
        const placeholderRegex = /throw\s+new\s+Error\s*\(\s*['"`](?:Not implemented|TODO|Placeholder)['"`]\s*\)/i;
        const violations = [];
        for (const file of files) {
          const content = fs.readFileSync(file, 'utf-8');
          if (placeholderRegex.test(content)) {
            violations.push(path.relative(PROJECT_ROOT, file));
          }
        }
        assert.strictEqual(violations.length, 0, `Found placeholder errors in: ${violations.join(', ')}`);
      }
    },
    {
      name: 'F3.4: Production JSON files are strictly valid and parseable',
      fn: () => {
        const files = getProductionFiles(PROJECT_ROOT).filter((f) => f.endsWith('.json'));
        for (const file of files) {
          const content = fs.readFileSync(file, 'utf-8');
          try {
            JSON.parse(content);
          } catch (e) {
            assert.ok(false, `Corrupted JSON file ${path.relative(PROJECT_ROOT, file)}: ${e.message}`);
          }
        }
      }
    },
    {
      name: 'F3.5: No empty class stub bodies without functional logic',
      fn: () => {
        const files = getProductionFiles(PROJECT_ROOT).filter((f) => f.endsWith('.js'));
        assert.ok(files.length > 0, 'Production JS files must exist');
        const emptyClassRegex = /class\s+\w+\s*\{\s*\}/;
        for (const file of files) {
          const content = fs.readFileSync(file, 'utf-8');
          assert.ok(!emptyClassRegex.test(content), `Found empty class stub in ${path.relative(PROJECT_ROOT, file)}`);
        }
      }
    }
  ]
};
