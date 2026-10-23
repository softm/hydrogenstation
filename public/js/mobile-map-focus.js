export function setupMobileMapFocus({
  workspace,
  sidebar,
  mapSection,
  results,
  detail,
  detailHandle,
  expandButton,
  fullMapButton,
  dock,
  dockList,
  dockFavorites,
  dockMore,
  onResize = () => {},
  onModeChange = () => {},
  onRequestClose = () => {},
}) {
  const media = window.matchMedia('(max-width:760px)');
  const body = document.body;
  const activeModes = new Set(['focus-detail', 'expanded-tools', 'full-map']);
  let mode = 'default';
  let previous = null;
  let layoutFrame = 0;
  let restoreFrame = 0;
  let drag = null;
  let suppressHandleClick = false;
  let destroyed = false;

  function snapshot() {
    if (previous) return;
    previous = {
      listTop: results?.scrollTop || 0,
      sidebarTop: sidebar?.scrollTop || 0,
      pageX: scrollX,
      pageY: scrollY,
      focus: document.activeElement,
    };
  }

  function clearSheetHeight() {
    detail?.style.removeProperty('--h2-sheet-height');
    detail?.style.removeProperty('height');
    detail?.style.removeProperty('max-height');
    detail?.style.removeProperty('min-height');
    detail?.classList.remove('is-dragging');
  }

  function applySheetHeight(height) {
    if (!detail) return;
    const value = Math.max(1, Math.round(height)) + 'px';
    detail.style.setProperty('--h2-sheet-height', value);
    detail.style.setProperty('height', value, 'important');
    detail.style.setProperty('max-height', value, 'important');
    detail.style.setProperty('min-height', value, 'important');
  }

  function requestLayout() {
    onResize();
    if (layoutFrame) cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = 0;
      if (destroyed) return;
      onResize();
      requestAnimationFrame(() => {
        if (!destroyed) onModeChange(mode);
      });
    });
  }

  function syncButtons() {
    if (expandButton) {
      const expanded = mode === 'expanded-tools';
      expandButton.setAttribute('aria-expanded', String(expanded));
      expandButton.textContent = expanded ? '간단히' : '확장';
      expandButton.setAttribute('aria-label', expanded ? '지도 도구와 상세를 간단히 보기' : '검색·필터·지도 도구 펼치기');
    }
    if (fullMapButton) {
      fullMapButton.setAttribute('aria-pressed', String(mode === 'full-map'));
      fullMapButton.textContent = mode === 'full-map' ? '상세' : '전체지도';
    }
    if (dock) dock.hidden = mode !== 'full-map';
  }

  function applyMode(next) {
    const active = activeModes.has(next);
    body.classList.toggle('h2-map-focus-mode', active);
    body.classList.toggle('h2-map-focus-detail', next === 'focus-detail');
    body.classList.toggle('h2-map-expanded-tools', next === 'expanded-tools');
    body.classList.toggle('h2-map-full', next === 'full-map');

    if (sidebar) sidebar.inert = active && next !== 'expanded-tools';
    if (detail) {
      if (next === 'full-map') detail.hidden = true;
      else if (next === 'focus-detail' || next === 'expanded-tools') detail.hidden = false;
    }

    syncButtons();
  }

  function setMode(next) {
    if (destroyed) return false;
    clearSheetHeight();
    mode = next;
    applyMode(next);
    requestLayout();
    return true;
  }

  function enterDetail({ expanded = false } = {}) {
    if (!media.matches || destroyed) return false;
    snapshot();
    return setMode(expanded ? 'expanded-tools' : 'focus-detail');
  }

  function toggleExpanded() {
    if (!media.matches || destroyed || !activeModes.has(mode)) return false;
    if (mode === 'full-map') return setMode('expanded-tools');
    return setMode(mode === 'expanded-tools' ? 'focus-detail' : 'expanded-tools');
  }

  function enterFullMap() {
    if (!media.matches || destroyed) return false;
    snapshot();
    return setMode('full-map');
  }

  function showDetail() {
    if (!media.matches || destroyed) return false;
    return setMode('focus-detail');
  }

  function exit({ restoreFocus = true } = {}) {
    if (destroyed) return;
    clearSheetHeight();
    mode = 'default';
    applyMode(mode);
    if (sidebar) sidebar.inert = false;
    requestLayout();

    const saved = previous;
    previous = null;
    if (!saved) return;
    if (restoreFrame) cancelAnimationFrame(restoreFrame);
    restoreFrame = requestAnimationFrame(() => {
      restoreFrame = requestAnimationFrame(() => {
        restoreFrame = 0;
        if (destroyed) return;
        if (results) results.scrollTop = saved.listTop;
        if (sidebar) sidebar.scrollTop = saved.sidebarTop;
        scrollTo(saved.pageX, saved.pageY);
        if (restoreFocus && saved.focus?.isConnected) saved.focus.focus({ preventScroll: true });
      });
    });
  }

  function afterLayout(callback) {
    if (typeof callback !== 'function') return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!destroyed) callback();
    }));
  }

  function pointerDown(event) {
    if (!media.matches || destroyed || !detailHandle || !['focus-detail', 'expanded-tools'].includes(mode) || event.button > 0) return;
    const rect = detail?.getBoundingClientRect();
    drag = {
      id: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      startHeight: rect?.height || 0,
      startMode: mode,
      startedAt: performance.now(),
    };
    suppressHandleClick = false;
    detailHandle.setPointerCapture?.(event.pointerId);
    detail?.classList.add('is-dragging');
    event.preventDefault();
  }

  function pointerMove(event) {
    if (!drag || drag.id !== event.pointerId || !detail) return;
    drag.lastY = event.clientY;
    const dy = event.clientY - drag.startY;
    const vh = Math.max(420, window.innerHeight || document.documentElement.clientHeight || 800);
    const compact = vh * 0.42;
    const expanded = vh * 0.62;
    const base = drag.startHeight || (drag.startMode === 'expanded-tools' ? expanded : compact);
    applySheetHeight(Math.max(vh * 0.26, Math.min(vh * 0.78, base - dy)));
    if (Math.abs(dy) > 8) suppressHandleClick = true;
    requestLayout();
    event.preventDefault();
  }

  function finishDrag(event, cancelled = false) {
    if (!drag || drag.id !== event.pointerId) return;
    const endY = Number.isFinite(event.clientY) ? event.clientY : drag.lastY;
    const dy = endY - drag.startY;
    const elapsed = Math.max(1, performance.now() - drag.startedAt);
    const velocity = dy / elapsed;
    const startMode = drag.startMode;
    const moved = Math.abs(dy) > 8;
    drag = null;
    clearSheetHeight();
    if (moved) {
      suppressHandleClick = true;
      setTimeout(() => { suppressHandleClick = false; }, 0);
    }
    if (cancelled) return;

    if (startMode === 'focus-detail') {
      if (dy < -54 || velocity < -0.42) setMode('expanded-tools');
      else if (dy > 118 || velocity > 0.68) setMode('full-map');
      else setMode('focus-detail');
    } else {
      if (dy > 54 || velocity > 0.42) setMode('focus-detail');
      else setMode('expanded-tools');
    }
  }

  function handleClick(event) {
    if (suppressHandleClick) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    toggleExpanded();
  }

  function keyDown(event) {
    if (!media.matches || event.key !== 'Escape' || !activeModes.has(mode)) return;
    event.preventDefault();
    if (mode === 'expanded-tools' || mode === 'full-map') setMode('focus-detail');
    else onRequestClose();
  }

  function mediaChange() {
    if (media.matches) return;
    clearSheetHeight();
    mode = 'default';
    applyMode(mode);
    if (sidebar) sidebar.inert = false;
    previous = null;
    requestLayout();
  }

  expandButton?.addEventListener('click', toggleExpanded);
  fullMapButton?.addEventListener('click', () => mode === 'full-map' ? showDetail() : enterFullMap());
  dockList?.addEventListener('click', () => { onModeChange('open-list'); });
  dockFavorites?.addEventListener('click', () => { onModeChange('open-favorites'); });
  dockMore?.addEventListener('click', () => setMode('expanded-tools'));
  detailHandle?.addEventListener('pointerdown', pointerDown);
  detailHandle?.addEventListener('click', handleClick);
  window.addEventListener('pointermove', pointerMove, { passive: false });
  window.addEventListener('pointerup', event => finishDrag(event));
  window.addEventListener('pointercancel', event => finishDrag(event, true));
  document.addEventListener('keydown', keyDown);
  media.addEventListener('change', mediaChange);

  return {
    enterDetail,
    toggleExpanded,
    enterFullMap,
    showDetail,
    exit,
    afterLayout,
    isMobile: () => media.matches,
    isActive: () => activeModes.has(mode),
    getMode: () => mode,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearSheetHeight();
      body.classList.remove('h2-map-focus-mode', 'h2-map-focus-detail', 'h2-map-expanded-tools', 'h2-map-full');
      if (sidebar) sidebar.inert = false;
      expandButton?.removeEventListener('click', toggleExpanded);
      dockList?.replaceWith(dockList.cloneNode(true));
      dockFavorites?.replaceWith(dockFavorites.cloneNode(true));
      dockMore?.replaceWith(dockMore.cloneNode(true));
      detailHandle?.removeEventListener('pointerdown', pointerDown);
      detailHandle?.removeEventListener('click', handleClick);
      window.removeEventListener('pointermove', pointerMove);
      document.removeEventListener('keydown', keyDown);
      media.removeEventListener('change', mediaChange);
    },
  };
}
