// tests/harness/loader.js
// Safe module loader and sandbox execution for VTPATE tests
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PROJECT_ROOT = process.env.VTPATE_TEST_ROOT
  ? path.resolve(process.env.VTPATE_TEST_ROOT)
  : path.resolve(__dirname, '../..');

class ModuleLoader {
  static getProjectPath(relativePath) {
    return path.join(PROJECT_ROOT, relativePath);
  }

  static fileExists(relativePath) {
    const fullPath = ModuleLoader.getProjectPath(relativePath);
    return fs.existsSync(fullPath);
  }

  static readFile(relativePath, encoding = 'utf-8') {
    const fullPath = ModuleLoader.getProjectPath(relativePath);
    if (!fs.existsSync(fullPath)) return null;
    return fs.readFileSync(fullPath, encoding);
  }

  static readJson(relativePath) {
    const content = ModuleLoader.readFile(relativePath);
    if (!content) return null;
    return JSON.parse(content);
  }

  static loadScriptInContext(relativePath, customSandbox = {}) {
    const fullPath = ModuleLoader.getProjectPath(relativePath);
    if (!fs.existsSync(fullPath)) {
      return {
        loaded: false,
        exists: false,
        error: new Error(`File does not exist: ${relativePath}`),
        context: null
      };
    }

    const code = fs.readFileSync(fullPath, 'utf-8');
    const exports = {};
    const moduleObj = { exports };

    const sandbox = {
      console,
      require,
      __dirname: path.dirname(fullPath),
      __filename: fullPath,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      Buffer,
      URL,
      URLSearchParams,
      fetch: global.fetch,
      chrome: global.chrome,
      exports,
      module: moduleObj,
      window: {},
      document: {
        createElement: (tag) => ({
          tagName: tag.toUpperCase(),
          setAttribute: () => {},
          appendChild: () => {},
          style: {}
        }),
        querySelector: () => null,
        querySelectorAll: () => []
      },
      ...customSandbox
    };
    sandbox.window = sandbox;

    const context = vm.createContext(sandbox);

    try {
      vm.runInContext(code, context, { filename: relativePath });
      return {
        loaded: true,
        exists: true,
        exports: moduleObj.exports !== exports ? moduleObj.exports : (sandbox.exports || {}),
        sandbox,
        error: null
      };
    } catch (err) {
      return {
        loaded: false,
        exists: true,
        exports: null,
        sandbox,
        error: err
      };
    }
  }
}

module.exports = {
  ModuleLoader,
  PROJECT_ROOT
};
