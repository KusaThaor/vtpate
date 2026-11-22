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
}

document.addEventListener('DOMContentLoaded', () => {
  const buttons = [...document.querySelectorAll('[data-manager-tab]')];
  buttons.forEach((button, index) => {
    button.addEventListener('click', () => activateManagerTab(button.dataset.managerTab));
    button.addEventListener('keydown', event => {
      let nextIndex;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % buttons.length;
      else if (event.key === 'ArrowLeft') nextIndex = (index + buttons.length - 1) % buttons.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = buttons.length - 1;
      else return;
      event.preventDefault();
      activateManagerTab(buttons[nextIndex].dataset.managerTab, true);
    });
  });
});
