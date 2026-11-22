/**
 * VTPATE - Chrome Extension Web Novel Scraper & EPUB Packaging Studio
 * Background Service Worker (Manifest V3)
 *
 * Responsibilities:
 * - Extension lifecycle management (install, activate, update)
 * - Tab management & singleton manager tab launcher
 * - DeclarativeNetRequest session rules coordination (User-Agent, Referer spoofing)
 * - Central message passing hub between popup, manager, and content scripts
 */

// Rule ID partitions for DeclarativeNetRequest session rules
const DNR_RULE_BASE_ID = 10000;
let dnrRuleCounter = DNR_RULE_BASE_ID;

function allocateDnrRuleId() {
  dnrRuleCounter = (dnrRuleCounter % 50000) + 1;
  return dnrRuleCounter;
}

/**
 * Initialize default configuration and crawl profiles on install or update
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    const existing = await chrome.storage.local.get(['crawlProfiles', 'appSettings']);

    const defaultSettings = {
      defaultMode: 'fetch',
      maxConcurrency: 5,
      defaultDelayMs: 1000,
      jitterPercent: 30,
      autoRetryAttempts: 3,
      installedAt: Date.now(),
      version: chrome.runtime.getManifest().version
    };

    const defaultProfiles = {
      'inkitt.com': {
        domain: 'inkitt.com',
        mode: 'fetch',
        concurrency: 4,
        delayMs: 800,
        jitterPercent: 25,
        emulateMobileApp: true,
        customHeaders: {
          'X-Requested-With': 'com.inkitt.android'
        }
      },
      'wattpad.com': {
        domain: 'wattpad.com',
        mode: 'fetch',
        concurrency: 3,
        delayMs: 1200,
        jitterPercent: 30,
        emulateMobileApp: false,
        customHeaders: {
          'Referer': 'https://www.wattpad.com/'
        }
      },
      'default': {
        domain: 'default',
        mode: 'fetch',
        concurrency: 3,
        delayMs: 1000,
        jitterPercent: 30,
        emulateMobileApp: false,
        customHeaders: {}
      }
    };

    const updates = {};
    if (!existing.appSettings) {
      updates.appSettings = defaultSettings;
    }
    if (!existing.crawlProfiles) {
      updates.crawlProfiles = defaultProfiles;
    }

    if (Object.keys(updates).length > 0) {
      await chrome.storage.local.set(updates);
    }

    console.info(`[VTPATE Background] Service worker initialized. Reason: ${details.reason}, Version: ${defaultSettings.version}`);
  } catch (error) {
    console.error('[VTPATE Background] Error during initialization:', error);
  }
});

/**
 * Open or activate the single instance of manager.html
 * @returns {Promise<chrome.tabs.Tab>}
 */
async function openOrFocusManagerTab() {
  const managerUrl = chrome.runtime.getURL('manager.html');
  const tabs = await chrome.tabs.query({ url: managerUrl + '*' });

  if (tabs && tabs.length > 0) {
    const existingTab = tabs[0];
    await chrome.tabs.update(existingTab.id, { active: true });
    if (existingTab.windowId && typeof chrome.windows !== 'undefined' && typeof chrome.windows.update === 'function') {
      try {
        await chrome.windows.update(existingTab.windowId, { focused: true });
      } catch (winErr) {
        console.warn('[VTPATE Background] Could not focus window:', winErr);
      }
    }
    return existingTab;
  }

  return await chrome.tabs.create({ url: managerUrl, active: true });
}

/**
 * Update declarativeNetRequest session rules to modify request headers
 * e.g., custom User-Agent, Referer, or X-Requested-With
 * @param {Array<{ header: string, value: string, domain?: string }>} headerRules
 * @returns {Promise<{ success: boolean, ruleIds: number[] }>}
 */
async function applySessionNetRules(headerRules) {
  if (!chrome.declarativeNetRequest || !chrome.declarativeNetRequest.updateSessionRules) {
    throw new Error('declarativeNetRequest API is not available or permissions missing.');
  }

  if (!Array.isArray(headerRules)) {
    return { success: false, error: 'headerRules payload must be an array' };
  }

  // Clear existing session rules created by this session
  const existingRules = await chrome.declarativeNetRequest.getSessionRules();
  const ruleIdsToRemove = existingRules.map(r => r.id);

  if (headerRules.length === 0) {
    if (ruleIdsToRemove.length > 0) {
      await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: ruleIdsToRemove });
    }
    return { success: true, ruleIds: [] };
  }

  const newRules = headerRules.map((rule) => {
    const ruleId = allocateDnrRuleId();
    const requestHeaders = [{
      header: rule.header,
      operation: 'set',
      value: rule.value
    }];

    const condition = {
      resourceTypes: ['xmlhttprequest', 'sub_frame', 'main_frame', 'other']
    };

    if (rule.domain) {
      condition.urlFilter = `||${rule.domain}*`;
    }

    return {
      id: ruleId,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: requestHeaders
      },
      condition: condition
    };
  });

  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: ruleIdsToRemove,
    addRules: newRules
  });

  return { success: true, ruleIds: newRules.map(r => r.id) };
}

/**
 * Remove all active session-scoped DeclarativeNetRequest rules
 * @returns {Promise<{ success: boolean }>}
 */
async function clearSessionNetRules() {
  if (!chrome.declarativeNetRequest || !chrome.declarativeNetRequest.getSessionRules) {
    return { success: false, reason: 'API unavailable' };
  }
  const existingRules = await chrome.declarativeNetRequest.getSessionRules();
  const removeRuleIds = existingRules.map(r => r.id);
  if (removeRuleIds.length > 0) {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds });
  }
  return { success: true, clearedCount: removeRuleIds.length };
}

/**
 * Central runtime message router
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) {
    return false;
  }

  const handleMessage = async () => {
    switch (message.action) {
      case 'OPEN_MANAGER': {
        const tab = await openOrFocusManagerTab();
        return { success: true, tabId: tab.id };
      }

      case 'GET_STATUS': {
        const manifest = chrome.runtime.getManifest();
        const activeRules = chrome.declarativeNetRequest
          ? await chrome.declarativeNetRequest.getSessionRules()
          : [];
        return {
          success: true,
          version: manifest.version,
          name: manifest.name,
          activeRulesCount: activeRules.length,
          timestamp: Date.now()
        };
      }

      case 'DNR_APPLY_RULES': {
        const rulesPayload = message.rules !== undefined ? message.rules : [];
        const result = await applySessionNetRules(rulesPayload);
        return result;
      }

      case 'DNR_CLEAR_RULES': {
        const result = await clearSessionNetRules();
        return result;
      }

      case 'CREATE_BACKGROUND_TAB': {
        // Mode 2: Helper to create an inactive background tab for DOM scraping
        const tab = await chrome.tabs.create({
          url: message.url || 'about:blank',
          active: false
        });
        return { success: true, tabId: tab.id };
      }

      case 'CLOSE_BACKGROUND_TAB': {
        if (message.tabId) {
          try {
            await chrome.tabs.remove(message.tabId);
          } catch (tabErr) {
            // Tab might have already been closed by user
            console.warn(`[VTPATE Background] Tab ${message.tabId} already closed:`, tabErr);
          }
        }
        return { success: true };
      }

      case 'PING': {
        return { success: true, pong: true, time: Date.now() };
      }

      default:
        return { success: false, error: `Unknown action: ${message.action}` };
    }
  };

  handleMessage()
    .then(response => sendResponse(response))
    .catch(error => {
      console.error(`[VTPATE Background] Error handling action ${message.action}:`, error);
      sendResponse({ success: false, error: error.message || String(error) });
    });

  // Keep message port open for async response
  return true;
});

/**
 * Detect Screen Off / System Lock via Chrome Idle API
 * When system locks or screen turns off, broadcast to active manager tabs
 */
if (typeof chrome !== 'undefined' && chrome.idle && chrome.idle.onStateChanged) {
  chrome.idle.onStateChanged.addListener(async (newState) => {
    if (newState === 'locked') {
      try {
        const managerUrl = chrome.runtime.getURL('manager.html');
        const tabs = await chrome.tabs.query({ url: managerUrl + '*' });
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, { action: 'SCREEN_LOCKED' }).catch(() => {});
        }
      } catch (err) {
        // Ignored
      }
    }
  });
}
