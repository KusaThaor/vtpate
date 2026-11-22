// src/crawler/net-rules.js
// DeclarativeNetRequest Session Rules Manager for User-Agent & Header Spoofing

class NetRulesManager {
  constructor(options = {}) {
    this.ruleIdStart = options.ruleIdStart || 1001;
    this.activeRuleIds = new Set();
  }

  async setSessionHeaders(options = {}) {
    if (typeof chrome === 'undefined' || !chrome.declarativeNetRequest) {
      throw new Error('Chrome declarativeNetRequest API is not available');
    }

    // Clear prior rules to prevent collision or stale header leaks
    await this.clearSessionRules();

    const requestHeaders = [];

    if (options.userAgent && typeof options.userAgent === 'string') {
      requestHeaders.push({
        header: 'User-Agent',
        operation: chrome.declarativeNetRequest.HeaderOperation?.SET || 'set',
        value: options.userAgent
      });
    }

    if (options.referer && typeof options.referer === 'string') {
      requestHeaders.push({
        header: 'Referer',
        operation: chrome.declarativeNetRequest.HeaderOperation?.SET || 'set',
        value: options.referer
      });
    }

    if (options.extraHeaders && typeof options.extraHeaders === 'object') {
      for (const [header, val] of Object.entries(options.extraHeaders)) {
        if (header && val !== undefined && val !== null) {
          requestHeaders.push({
            header,
            operation: chrome.declarativeNetRequest.HeaderOperation?.SET || 'set',
            value: String(val)
          });
        }
      }
    }

    if (requestHeaders.length === 0) {
      return;
    }

    const ruleId = this.ruleIdStart;
    const actionType = chrome.declarativeNetRequest.RuleActionType?.MODIFY_HEADERS || 'modifyHeaders';

    let urlFilter = '*';
    if (options.domain && typeof options.domain === 'string') {
      const clean = options.domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      urlFilter = `*://${clean}/*`;
    }

    const rule = {
      id: ruleId,
      priority: 1,
      action: {
        type: actionType,
        requestHeaders
      },
      condition: {
        urlFilter,
        resourceTypes: [
          'main_frame',
          'sub_frame',
          'xmlhttprequest'
        ]
      }
    };

    await chrome.declarativeNetRequest.updateSessionRules({
      addRules: [rule]
    });

    this.activeRuleIds.add(ruleId);
  }

  async clearSessionRules() {
    if (typeof chrome === 'undefined' || !chrome.declarativeNetRequest) {
      return;
    }

    const idsToRemove = new Set(this.activeRuleIds);

    try {
      if (typeof chrome.declarativeNetRequest.getSessionRules === 'function') {
        const currentRules = await chrome.declarativeNetRequest.getSessionRules();
        if (Array.isArray(currentRules)) {
          for (const rule of currentRules) {
            idsToRemove.add(rule.id);
          }
        }
      }
    } catch {
      // Ignore error during rule inspection
    }

    const removeList = Array.from(idsToRemove);
    if (removeList.length > 0) {
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: removeList
      });
    }

    this.activeRuleIds.clear();
  }
}

// UMD / CommonJS / Global export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NetRulesManager };
}
if (typeof window !== 'undefined') {
  window.NetRulesManager = NetRulesManager;
}
if (typeof globalThis !== 'undefined') {
  globalThis.NetRulesManager = NetRulesManager;
}
