/**
 * VTPATE - Popup Logic (Manifest V3 CSP Compliant)
 */
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Lucide icons if present
  if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
    lucide.createIcons();
  }

  const btnOpenManager = document.getElementById('btnOpenManager');
  const btnSettings = document.getElementById('btnSettings');
  const btnQuickCrawl = document.getElementById('btnQuickCrawl');
  const siteStatus = document.getElementById('siteStatus');
  const statusLabel = document.getElementById('statusLabel');
  const novelInfo = document.getElementById('novelInfo');
  const novelTitle = document.getElementById('novelTitle');
  const novelDomain = document.getElementById('novelDomain');

  /**
   * Helper to evaluate novel page support
   * @param {string} url
   * @returns {{ isNovel: boolean, message: string }}
   */
  const evaluateUrl = (url) => {
    if (!url || typeof url !== 'string') {
      return { isNovel: false, message: 'Không nhận diện được trang truyện. Nhập URL thủ công.' };
    }
    const lower = url.toLowerCase();
    if (lower.startsWith('chrome://') || lower.startsWith('edge://') || lower.startsWith('about:')) {
      return { isNovel: false, message: 'Không nhận diện được trang truyện. Nhập URL thủ công.' };
    }
    if (lower.includes('inkitt.com') || lower.includes('wattpad.com') || lower.includes('novel')) {
      return { isNovel: true, message: 'Đã nhận diện truyện!' };
    }
    return { isNovel: false, message: 'Không nhận diện được trang truyện. Nhập URL thủ công.' };
  };

  /**
   * Open or activate Manager tab, optionally passing URL parameter
   * @param {string} [targetUrl]
   */
  const openManager = async (targetUrl) => {
    try {
      const managerBaseUrl = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
        ? chrome.runtime.getURL('manager.html')
        : 'manager.html';

      const fullUrl = targetUrl
        ? `${managerBaseUrl}?url=${encodeURIComponent(targetUrl)}`
        : managerBaseUrl;

      if (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.query === 'function') {
        const existingTabs = await chrome.tabs.query({ url: `${managerBaseUrl}*` });
        if (existingTabs && existingTabs.length > 0) {
          const tab = existingTabs[0];
          const updateData = { active: true };
          if (targetUrl) {
            updateData.url = fullUrl;
          }
          await chrome.tabs.update(tab.id, updateData);
          if (tab.windowId && chrome.windows) {
            try {
              await chrome.windows.update(tab.windowId, { focused: true });
            } catch {}
          }
          window.close();
          return;
        }

        await chrome.tabs.create({ url: fullUrl, active: true });
        window.close();
        return;
      }
    } catch (err) {
      console.warn('[VTPATE Popup] Error opening manager tab via direct tabs API:', err);
    }

    // Background messaging fallback
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        await chrome.runtime.sendMessage({
          action: 'OPEN_MANAGER',
          targetUrl: targetUrl || null
        });
      }
    } catch (msgErr) {
      console.warn('[VTPATE Popup] Background message fallback failed:', msgErr);
    }
    window.close();
  };

  if (btnOpenManager) {
    btnOpenManager.addEventListener('click', () => openManager());
  }

  if (btnSettings) {
    btnSettings.addEventListener('click', () => openManager());
  }

  // Check current active tab to detect novel domain
  try {
    if (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.query === 'function') {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs.length > 0 && tabs[0].url) {
        const currentTab = tabs[0];
        const currentUrl = currentTab.url;
        const evaluation = evaluateUrl(currentUrl);

        const indicator = siteStatus?.querySelector('.status-indicator');

        if (evaluation.isNovel) {
          if (indicator) indicator.className = 'status-indicator supported';
          if (statusLabel) statusLabel.textContent = evaluation.message;
          if (novelInfo) novelInfo.style.display = 'block';

          let domainStr = '';
          try {
            domainStr = new URL(currentUrl).hostname.replace(/^www\./, '');
          } catch {
            domainStr = currentUrl;
          }

          if (novelTitle) novelTitle.textContent = currentTab.title || currentUrl;
          if (novelDomain) novelDomain.textContent = domainStr;

          if (btnQuickCrawl) {
            btnQuickCrawl.disabled = false;
            btnQuickCrawl.addEventListener('click', () => openManager(currentUrl));
          }
        } else {
          if (indicator) indicator.className = 'status-indicator idle';
          if (statusLabel) statusLabel.textContent = evaluation.message;
          if (novelInfo) novelInfo.style.display = 'none';
          if (btnQuickCrawl) btnQuickCrawl.disabled = true;
        }
      }
    }
  } catch (tabErr) {
    console.warn('[VTPATE Popup] Error reading current tab:', tabErr);
    if (statusLabel) {
      statusLabel.textContent = 'Không nhận diện được trang truyện. Nhập URL thủ công.';
    }
  }
});
