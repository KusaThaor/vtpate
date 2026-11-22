// tests/test-m1.js
// Authoritative M1 Test Delegation - runs official test-runner.js with --milestone M1
process.argv = [process.argv[0], process.argv[1], '--milestone', 'M1'];
require('./test-runner');
