// tests/test-m2.js
// Authoritative M2 Test Runner - executes official test-runner.js with --milestone M2
process.argv = [process.argv[0], process.argv[1], '--milestone', 'M2'];
require('./test-runner');
