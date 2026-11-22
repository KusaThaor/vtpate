// Panels stay mounted so downloads and form state survive tab changes.
function activateManagerTab(name, focus = false) {
  const buttons = [...document.querySelectorAll('[data-manager-tab]')];
  if (!buttons.some(button => button.dataset.managerTab === name)) return;
  for (const button of buttons) {
    const selected = button.dataset.managerTab === name;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    const panel = document.getElementById(button.getAttribute('aria-controls'));
    if (panel) panel.hidden = !selected;
    if (selected && focus) button.focus();
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
    try { lucide.createIcons(); } catch (_) {}
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const buttons = [...document.querySelectorAll('[data-manager-tab]')];
  buttons.forEach((button, index) => {
    button.addEventListener('click', () => {
      activateManagerTab(button.dataset.managerTab);
      // Auto-collapse sidebar on smaller screens when tab is chosen
      if (window.innerWidth < 900) {
        const appLayout = document.querySelector('.app-layout');
        appLayout?.classList.add('sidebar-collapsed');
      }
    });
    button.addEventListener('keydown', event => {
      let nextIndex;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % buttons.length;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index + buttons.length - 1) % buttons.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = buttons.length - 1;
      else return;
      event.preventDefault();
      activateManagerTab(buttons[nextIndex].dataset.managerTab, true);
    });
  });

  // --- Sidebar Toggle Logic ---
  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
  const btnCloseSidebar = document.getElementById('btn-close-sidebar');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  const appLayout = document.querySelector('.app-layout');

  function setSidebarState(collapsed) {
    if (!appLayout) return;
    if (collapsed) {
      appLayout.classList.add('sidebar-collapsed');
      try { localStorage.setItem('vtpate_sidebar_collapsed', 'true'); } catch (_) {}
    } else {
      appLayout.classList.remove('sidebar-collapsed');
      try { localStorage.setItem('vtpate_sidebar_collapsed', 'false'); } catch (_) {}
    }
  }

  // Restore saved state (or collapse if narrow screen)
  try {
    const saved = localStorage.getItem('vtpate_sidebar_collapsed');
    if (saved === 'true' || (saved === null && window.innerWidth < 1000)) {
      setSidebarState(true);
    }
  } catch (_) {}

  btnToggleSidebar?.addEventListener('click', () => {
    const isCollapsed = appLayout?.classList.contains('sidebar-collapsed');
    setSidebarState(!isCollapsed);
  });

  btnCloseSidebar?.addEventListener('click', () => setSidebarState(true));
  sidebarBackdrop?.addEventListener('click', () => setSidebarState(true));

  // Esc key to close sidebar on mobile
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && window.innerWidth < 900 && !appLayout?.classList.contains('sidebar-collapsed')) {
      setSidebarState(true);
    }
  });
});
