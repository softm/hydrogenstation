import { mountAdBanner } from './ads.js';

export const BOTTOM_AD_STORAGE_KEY = 'hydrogenstation:ad-bottom:expanded:v1';

export function mountBottomAd({ shell, config, preview = false, win = window, doc = document } = {}) {
  if (!shell) return { setExpanded() {}, destroy() {} };
  const button = shell.querySelector('.ad-bottom-toggle');
  const panel = shell.querySelector('.ad-bottom-panel');
  let expanded = true;
  let resizeObserver;
  const syncSpace = () => {
    const height = shell.hidden ? 0 : Math.ceil(shell.getBoundingClientRect().height);
    doc.body.style.setProperty('--h2-ad-space', `${height}px`);
  };
  const controller = mountAdBanner({
    host: panel,
    config,
    preview,
    win,
    doc,
    onStateChange(state) {
      if (state === 'unfilled') shell.hidden = true;
      syncSpace();
    }
  });
  if (!controller.enabled) {
    shell.hidden = true;
    syncSpace();
    return { setExpanded() {}, destroy() {} };
  }
  try {
    const stored = win.sessionStorage.getItem(BOTTOM_AD_STORAGE_KEY);
    if (stored !== null) expanded = stored === 'true';
  } catch {}
  shell.hidden = false;
  function sync() {
    panel.hidden = !expanded;
    button.textContent = expanded ? '광고 접기' : '광고 펼치기';
    button.setAttribute('aria-expanded', String(expanded));
    controller.update(expanded);
    syncSpace();
  }
  function setExpanded(value) {
    expanded = Boolean(value);
    try { win.sessionStorage.setItem(BOTTOM_AD_STORAGE_KEY, String(expanded)); } catch {}
    sync();
  }
  const toggle = () => setExpanded(!expanded);
  button.addEventListener('click', toggle);
  resizeObserver = win.ResizeObserver ? new win.ResizeObserver(syncSpace) : null;
  resizeObserver?.observe(shell);
  sync();
  return {
    setExpanded,
    destroy() {
      resizeObserver?.disconnect();
      button.removeEventListener('click', toggle);
      doc.body.style.setProperty('--h2-ad-space', '0px');
    }
  };
}
