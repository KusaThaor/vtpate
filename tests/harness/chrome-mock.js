// tests/harness/chrome-mock.js
// Chrome Extension Manifest V3 API Simulation Harness for VTPATE E2E Testing

class ChromeMock {
  constructor(initialManifest = null) {
    this._manifest = initialManifest || {
      manifest_version: 3,
      name: 'VTPATE - Novel Scraper & EPUB Packaging Studio',
      version: '1.0.0',
      permissions: ['tabs', 'scripting', 'declarativeNetRequest', 'storage', 'downloads'],
      host_permissions: ['<all_urls>']
    };
    this.reset();
  }

  reset() {
    // Storage local
    this._storageData = {};

    // Tabs
    this._tabs = new Map();
    this._tabIdCounter = 1000;
    this._tabEvents = [];

    // Scripting
    this._scriptExecutions = [];

    // DeclarativeNetRequest session rules
    this._sessionRules = [];

    // Downloads
    this._downloads = [];

    // Messages
    this._messages = [];
    this._messageListeners = [];

    // Script injection handler: allow tests to customize what executeScript returns
    this._customScriptHandler = null;

    this._setupApis();
  }

  _setupApis() {
    const self = this;

    this.storage = {
      local: {
        get(keys) {
          return new Promise((resolve) => {
            if (!keys) {
              resolve({ ...self._storageData });
              return;
            }
            if (typeof keys === 'string') {
              resolve({ [keys]: self._storageData[keys] });
              return;
            }
            if (Array.isArray(keys)) {
              const res = {};
              for (const k of keys) {
                if (k in self._storageData) res[k] = self._storageData[k];
              }
              resolve(res);
              return;
            }
            if (typeof keys === 'object') {
              const res = { ...keys };
              for (const k of Object.keys(keys)) {
                if (k in self._storageData) res[k] = self._storageData[k];
              }
              resolve(res);
              return;
            }
            resolve({});
          });
        },
        set(items) {
          return new Promise((resolve) => {
            if (items && typeof items === 'object') {
              Object.assign(self._storageData, items);
            }
            resolve();
          });
        },
        remove(keys) {
          return new Promise((resolve) => {
            const list = Array.isArray(keys) ? keys : [keys];
            for (const k of list) {
              delete self._storageData[k];
            }
            resolve();
          });
        },
        clear() {
          return new Promise((resolve) => {
            self._storageData = {};
            resolve();
          });
        }
      }
    };

    this.tabs = {
      create(createProperties) {
        return new Promise((resolve) => {
          const tabId = ++self._tabIdCounter;
          const tab = {
            id: tabId,
            url: createProperties.url || 'about:blank',
            active: createProperties.active !== undefined ? createProperties.active : true,
            status: 'complete',
            pinned: createProperties.pinned || false,
            windowId: 1
          };
          self._tabs.set(tabId, tab);
          self._tabEvents.push({ type: 'create', tabId, properties: createProperties, timestamp: Date.now() });
          resolve(tab);
        });
      },
      update(tabId, updateProperties) {
        return new Promise((resolve, reject) => {
          const tab = self._tabs.get(tabId);
          if (!tab) {
            reject(new Error(`Tab ${tabId} not found`));
            return;
          }
          if (updateProperties.url) tab.url = updateProperties.url;
          if (updateProperties.active !== undefined) tab.active = updateProperties.active;
          tab.status = 'complete';
          self._tabEvents.push({ type: 'update', tabId, properties: updateProperties, timestamp: Date.now() });
          resolve(tab);
        });
      },
      remove(tabId) {
        return new Promise((resolve, reject) => {
          const ids = Array.isArray(tabId) ? tabId : [tabId];
          for (const id of ids) {
            if (!self._tabs.has(id)) {
              // chrome tab remove throws if tab doesn't exist
              reject(new Error(`Tab ${id} not found`));
              return;
            }
            self._tabs.delete(id);
            self._tabEvents.push({ type: 'remove', tabId: id, timestamp: Date.now() });
          }
          resolve();
        });
      },
      get(tabId) {
        return new Promise((resolve, reject) => {
          const tab = self._tabs.get(tabId);
          if (!tab) {
            reject(new Error(`Tab ${tabId} not found`));
            return;
          }
          resolve({ ...tab });
        });
      },
      query(queryInfo) {
        return new Promise((resolve) => {
          const results = [];
          for (const tab of self._tabs.values()) {
            let match = true;
            if (queryInfo.active !== undefined && tab.active !== queryInfo.active) match = false;
            if (queryInfo.url && tab.url !== queryInfo.url) match = false;
            if (match) results.push({ ...tab });
          }
          resolve(results);
        });
      }
    };

    this.scripting = {
      executeScript(injection) {
        return new Promise((resolve, reject) => {
          const { target, func, args } = injection;
          if (!target || !target.tabId) {
            reject(new Error('Missing target.tabId'));
            return;
          }
          const tab = self._tabs.get(target.tabId);
          if (!tab) {
            reject(new Error(`Tab ${target.tabId} not found`));
            return;
          }

          self._scriptExecutions.push({ tabId: target.tabId, injection, timestamp: Date.now() });

          if (self._customScriptHandler) {
            try {
              const customResult = self._customScriptHandler(tab, injection);
              resolve([{ result: customResult }]);
              return;
            } catch (err) {
              reject(err);
              return;
            }
          }

          if (typeof func === 'function') {
            try {
              const res = func.apply(null, args || []);
              resolve([{ result: res }]);
            } catch (err) {
              reject(err);
            }
          } else {
            resolve([{ result: null }]);
          }
        });
      }
    };

    this.declarativeNetRequest = {
      RuleActionType: {
        MODIFY_HEADERS: 'modifyHeaders',
        BLOCK: 'block',
        ALLOW: 'allow'
      },
      HeaderOperation: {
        SET: 'set',
        REMOVE: 'remove',
        APPEND: 'append'
      },
      updateSessionRules(options) {
        return new Promise((resolve) => {
          const { addRules = [], removeRuleIds = [] } = options;
          if (removeRuleIds.length > 0) {
            const removeSet = new Set(removeRuleIds);
            self._sessionRules = self._sessionRules.filter((r) => !removeSet.has(r.id));
          }
          if (addRules.length > 0) {
            for (const r of addRules) {
              self._sessionRules.push({ ...r });
            }
          }
          resolve();
        });
      },
      getSessionRules() {
        return new Promise((resolve) => {
          resolve([...self._sessionRules]);
        });
      }
    };

    this.downloads = {
      download(options) {
        return new Promise((resolve) => {
          const downloadId = self._downloads.length + 1;
          const record = { id: downloadId, options, timestamp: Date.now() };
          self._downloads.push(record);
          resolve(downloadId);
        });
      }
    };

    this.runtime = {
      getManifest() {
        return JSON.parse(JSON.stringify(self._manifest));
      },
      getURL(path) {
        return `chrome-extension://vtpate-mock-extension-id/${path.replace(/^\//, '')}`;
      },
      sendMessage(message) {
        return new Promise((resolve) => {
          self._messages.push(message);
          let responseSent = false;
          const sendResponse = (resp) => {
            responseSent = true;
            resolve(resp);
          };
          for (const listener of self._messageListeners) {
            listener(message, {}, sendResponse);
          }
          if (!responseSent) {
            resolve(undefined);
          }
        });
      },
      onMessage: {
        addListener(listener) {
          self._messageListeners.push(listener);
        },
        removeListener(listener) {
          self._messageListeners = self._messageListeners.filter((l) => l !== listener);
        }
      }
    };
  }

  installGlobals() {
    global.chrome = {
      storage: this.storage,
      tabs: this.tabs,
      scripting: this.scripting,
      declarativeNetRequest: this.declarativeNetRequest,
      downloads: this.downloads,
      runtime: this.runtime
    };
    return global.chrome;
  }

  uninstallGlobals() {
    delete global.chrome;
  }
}

module.exports = {
  ChromeMock
};
