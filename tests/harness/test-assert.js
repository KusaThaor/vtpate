// tests/harness/test-assert.js
// Custom zero-dependency assertion and test-context library for VTPATE E2E testing

class AssertionError extends Error {
  constructor(message, actual, expected) {
    super(message);
    this.name = 'AssertionError';
    this.actual = actual;
    this.expected = expected;
  }
}

function formatValue(v) {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'function') return `[Function: ${v.name || 'anonymous'}]`;
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const k of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

const assert = {
  ok(value, message = 'Expected value to be truthy') {
    if (!value) {
      throw new AssertionError(`${message} (actual: ${formatValue(value)})`, value, true);
    }
  },

  strictEqual(actual, expected, message) {
    if (actual !== expected) {
      const msg = message || `Expected ${formatValue(actual)} to strictly equal ${formatValue(expected)}`;
      throw new AssertionError(msg, actual, expected);
    }
  },

  deepStrictEqual(actual, expected, message) {
    if (!deepEqual(actual, expected)) {
      const msg = message || `Expected ${formatValue(actual)} to deep-equal ${formatValue(expected)}`;
      throw new AssertionError(msg, actual, expected);
    }
  },

  match(str, regex, message) {
    if (typeof str !== 'string' || !regex.test(str)) {
      const msg = message || `Expected string ${formatValue(str)} to match regex ${regex}`;
      throw new AssertionError(msg, str, regex);
    }
  },

  includes(collection, item, message) {
    let passed = false;
    if (typeof collection === 'string' || Array.isArray(collection)) {
      passed = collection.includes(item);
    } else if (collection && typeof collection === 'object') {
      passed = Object.prototype.hasOwnProperty.call(collection, item);
    }
    if (!passed) {
      const msg = message || `Expected collection to include ${formatValue(item)}`;
      throw new AssertionError(msg, collection, item);
    }
  },

  throws(fn, expectedRegexOrMessage, message) {
    let threw = false;
    let thrownError = null;
    try {
      fn();
    } catch (e) {
      threw = true;
      thrownError = e;
    }
    if (!threw) {
      throw new AssertionError(message || 'Expected function to throw', null, 'Error');
    }
    if (expectedRegexOrMessage instanceof RegExp) {
      if (!expectedRegexOrMessage.test(thrownError.message)) {
        throw new AssertionError(
          `Expected thrown message "${thrownError.message}" to match ${expectedRegexOrMessage}`,
          thrownError.message,
          expectedRegexOrMessage
        );
      }
    } else if (typeof expectedRegexOrMessage === 'string') {
      if (!thrownError.message.includes(expectedRegexOrMessage)) {
        throw new AssertionError(
          `Expected thrown message "${thrownError.message}" to include "${expectedRegexOrMessage}"`,
          thrownError.message,
          expectedRegexOrMessage
        );
      }
    }
  },

  async rejects(promiseOrAsyncFn, expectedRegexOrMessage, message) {
    let threw = false;
    let thrownError = null;
    try {
      const p = typeof promiseOrAsyncFn === 'function' ? promiseOrAsyncFn() : promiseOrAsyncFn;
      await p;
    } catch (e) {
      threw = true;
      thrownError = e;
    }
    if (!threw) {
      throw new AssertionError(message || 'Expected promise to reject', null, 'Error');
    }
    if (expectedRegexOrMessage instanceof RegExp) {
      if (!expectedRegexOrMessage.test(thrownError.message)) {
        throw new AssertionError(
          `Expected rejected message "${thrownError.message}" to match ${expectedRegexOrMessage}`,
          thrownError.message,
          expectedRegexOrMessage
        );
      }
    } else if (typeof expectedRegexOrMessage === 'string') {
      if (!thrownError.message.includes(expectedRegexOrMessage)) {
        throw new AssertionError(
          `Expected rejected message "${thrownError.message}" to include "${expectedRegexOrMessage}"`,
          thrownError.message,
          expectedRegexOrMessage
        );
      }
    }
  }
};

module.exports = {
  assert,
  AssertionError
};
