// SOFTM-ADFIT-COMMON 날짜:20261024 : 공통 지연 요청·중복 방지·NOAD·WebView 중복 차단 기준 적용.
export const BANNER_AFTER = 6;
export const ADFIT_SCRIPT = 'https://t1.kakaocdn.net/kas/static/ba.min.js';
export const ADFIT_TIMEOUT_MS = 30000;
const mounted = new WeakMap();
let callbackSequence = 0;

export function validAdUnit(unit) {
  return typeof unit === 'string' && /^DAN-[A-Za-z0-9]{8,64}$/.test(unit);
}

export function validAdPlacement(config = {}) {
  const size = `${Number(config.width)}x${Number(config.height)}`;
  return validAdUnit(config.unit) && ['320x100', '728x90'].includes(size);
}

export function isAdMobNativeWebView(userAgent = '') {
  return /\bAdMobNative\/\d+\b/.test(String(userAgent));
}

export function mountAdBanner({ host, root, config = {}, preview = false, demo = false,
  win = window, doc = document, location = win.location } = {}) {
  if (!host) return { update() {} };
  if (mounted.has(host)) return mounted.get(host);
  let active = false, requested = false, failed = false, observer, timer, ins;
  const width = Number(config.width), height = Number(config.height);
  const production = location?.origin === 'https://softm.github.io'
    && location.pathname.startsWith('/hydrogenstation/');
  const nativeAdWebView = isAdMobNativeWebView(win.navigator?.userAgent);
  const enabled = config.enabled !== false && validAdPlacement(config)
    && production && !demo && !nativeAdWebView;
  const callbackName = `h2AdFitNoAd${++callbackSequence}`;
  const creative = host.querySelector('.adfit-creative');
  const setState = value => { host.dataset.adState = value; };
  const hide = () => { host.hidden = true; };
  hide();
  setState(preview ? 'preview' : nativeAdWebView ? 'native-ad-blocked'
    : !validAdPlacement(config) ? 'unconfigured' : enabled ? 'idle' : 'disabled');

  function fail(element) {
    if (element && element !== ins) return;
    failed = true;
    win.clearTimeout(timer);
    observer?.disconnect();
    creative?.replaceChildren();
    hide();
    setState('unfilled');
  }

  function request() {
    if (requested || failed || !active || doc.hidden || host.hidden || !creative) return;
    const rect = creative.getBoundingClientRect();
    // Fixed creative size: never crop or scale an AdFit banner.
    if (rect.width < width || rect.height === 0) { fail(); return; }
    requested = true;
    observer?.disconnect();
    setState('requested');
    ins = doc.createElement('ins');
    ins.className = 'kakao_ad_area';
    ins.style.display = 'none';
    ins.setAttribute('data-ad-unit', config.unit);
    ins.setAttribute('data-ad-width', String(width));
    ins.setAttribute('data-ad-height', String(height));
    ins.setAttribute('data-ad-onfail', callbackName);
    win[callbackName] = fail;
    const script = doc.createElement('script');
    script.async = true;
    script.type = 'text/javascript';
    script.charset = 'utf-8';
    script.src = config.script || ADFIT_SCRIPT;
    script.onerror = () => fail();
    creative.append(ins, script);
    timer = win.setTimeout(() => {
      // An iframe is a rendering signal only; if none appears, return the space.
      if (!creative.querySelector('iframe')) fail();
    }, ADFIT_TIMEOUT_MS);
  }

  const controller = {
    update(value = true) {
      const threshold = Number.isFinite(config.after) ? Number(config.after) : 0;
      active = typeof value === 'number' ? value > threshold : Boolean(value);
      host.hidden = !active || failed || (!enabled && !preview);
      if (host.hidden) return;
      if (preview) {
        host.classList.add('adfit-preview');
        creative.textContent = `광고 배치 미리보기 · ${width}×${height}`;
        return;
      }
      if (requested) return;
      if (!observer && win.IntersectionObserver) {
        observer = new win.IntersectionObserver(entries => {
          if (entries.some(entry => entry.isIntersecting)) request();
        }, { root, rootMargin: '160px 0px', threshold: 0.25 });
        observer.observe(host);
      } else if (!win.IntersectionObserver) request();
    }
  };
  mounted.set(host, controller);
  doc.addEventListener('visibilitychange', () => {
    if (observer && !requested && !failed && active) {
      observer.unobserve(host);
      observer.observe(host);
    }
  });
  return controller;
}
