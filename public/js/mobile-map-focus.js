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
  listHandle,
  listCollapse,
  listClose,
  onResize = () => {},
  onModeChange = () => {},
  onRequestClose = () => {},
}) {
  const media = window.matchMedia('(max-width:760px)');
  const body = document.body;
  const activeModes = new Set(['focus-detail', 'expanded-tools', 'full-map', 'list-sheet', 'list-sheet-expanded']);
  let mode = 'default';
  let previous = null;
  let layoutFrame = 0;
  let restoreFrame = 0;
  let drag = null;
  let suppressHandleClick = false;
  let listDrag = null;
  let suppressListHandleClick = false;
  let listSnap = 'medium';
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

  function viewportHeight() {
    return Math.max(420, window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 800);
  }

  function listHeight(snap = listSnap) {
    const viewport = viewportHeight();
    const compact = Math.round(Math.max(230, Math.min(330, viewport * .38)));
    const expanded = Math.round(viewport * .86);
    const medium = Math.round(Math.max(compact + 72, Math.min(expanded - 64, viewport * .58)));
    return snap === 'compact' ? compact : snap === 'expanded' ? expanded : medium;
  }

  function applyListHeight(height) {
    const max = Math.round(viewportHeight() * .92);
    sidebar?.style.setProperty('--h2-list-height', Math.max(72, Math.min(max, Math.round(height))) + 'px');
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
    body.classList.toggle('h2-list-sheet', next === 'list-sheet' || next === 'list-sheet-expanded');
    body.classList.toggle('h2-list-sheet-expanded', next === 'list-sheet-expanded');

    if (sidebar) sidebar.inert = active && !['expanded-tools','full-map','list-sheet','list-sheet-expanded'].includes(next);
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

  function setListSnap(next) {
    listSnap = ['compact', 'medium', 'expanded'].includes(next) ? next : 'medium';
    applyListHeight(listHeight());
    return setMode(listSnap === 'expanded' ? 'list-sheet-expanded' : 'list-sheet');
  }

  function openList({ expanded = false } = {}) {
    if (!media.matches || destroyed) return false;
    snapshot();
    listSnap = expanded ? 'expanded' : 'medium';
    applyListHeight(listHeight());
    return setMode(expanded ? 'list-sheet-expanded' : 'list-sheet');
  }

  function closeList() {
    if (!media.matches || destroyed) return false;
    sidebar?.classList.remove('is-dragging');
    sidebar?.style.removeProperty('--h2-list-height');
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
    if (mode === 'list-sheet-expanded') setListSnap('medium');
    else if (mode === 'list-sheet') closeList();
    else if (mode === 'expanded-tools' || mode === 'full-map') setMode('focus-detail');
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

  function listPointerDown(event) {
    if (!media.matches || !['list-sheet','list-sheet-expanded'].includes(mode) || event.button > 0) return;
    suppressListHandleClick = false;
    listDrag = {
      id: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      startHeight: sidebar?.getBoundingClientRect().height || listHeight(),
      startedAt: performance.now(),
    };
    listHandle?.setPointerCapture?.(event.pointerId);
    sidebar?.classList.add('is-dragging');
    event.preventDefault();
  }

  function listPointerMove(event) {
    if (!listDrag || listDrag.id !== event.pointerId) return;
    listDrag.lastY = event.clientY;
    const dy = event.clientY - listDrag.startY;
    if (Math.abs(dy) > 7) suppressListHandleClick = true;
    applyListHeight(listDrag.startHeight - dy);
    requestLayout();
    event.preventDefault();
  }

  function finishListDrag(event, cancelled = false) {
    if (!listDrag || listDrag.id !== event.pointerId) return;
    const endY = Number.isFinite(event.clientY) ? event.clientY : listDrag.lastY;
    const dy = endY - listDrag.startY;
    const current = listDrag.startHeight - dy;
    const velocity = dy / Math.max(1, performance.now() - listDrag.startedAt);
    listDrag = null;
    sidebar?.classList.remove('is-dragging');
    if (cancelled) { applyListHeight(listHeight()); return; }
    if (current < listHeight('compact') * .62 || velocity > .9) closeList();
    else if (velocity < -.55 || current > (listHeight('medium') + listHeight('expanded')) / 2) setListSnap('expanded');
    else if (velocity > .55 || current < (listHeight('compact') + listHeight('medium')) / 2) setListSnap('compact');
    else setListSnap('medium');
    setTimeout(() => { suppressListHandleClick = false; }, 0);
  }

  function cycleListHeight(event) {
    if (suppressListHandleClick) { event?.preventDefault(); return; }
    setListSnap(listSnap === 'compact' ? 'medium' : listSnap === 'medium' ? 'expanded' : 'compact');
  }

  expandButton?.addEventListener('click', toggleExpanded);
  fullMapButton?.addEventListener('click', () => mode === 'full-map' ? showDetail() : enterFullMap());
  dockList?.addEventListener('click', () => { onModeChange('open-list'); });
  dockFavorites?.addEventListener('click', () => { onModeChange('open-favorites'); });
  dockMore?.addEventListener('click', () => setMode('expanded-tools'));
  listHandle?.addEventListener('pointerdown', listPointerDown);
  listHandle?.addEventListener('click', cycleListHeight);
  listCollapse?.addEventListener('click', cycleListHeight);
  listClose?.addEventListener('click', closeList);
  detailHandle?.addEventListener('pointerdown', pointerDown);
  detailHandle?.addEventListener('click', handleClick);
  window.addEventListener('pointermove', pointerMove, { passive: false });
  window.addEventListener('pointermove', listPointerMove, { passive: false });
  window.addEventListener('pointerup', event => finishDrag(event));
  window.addEventListener('pointerup', event => finishListDrag(event));
  window.addEventListener('pointercancel', event => finishDrag(event, true));
  window.addEventListener('pointercancel', event => finishListDrag(event, true));
  document.addEventListener('keydown', keyDown);
  media.addEventListener('change', mediaChange);

  return {
    enterDetail,
    toggleExpanded,
    enterFullMap,
    openList,
    closeList,
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
      body.classList.remove('h2-map-focus-mode', 'h2-map-focus-detail', 'h2-map-expanded-tools', 'h2-map-full', 'h2-list-sheet', 'h2-list-sheet-expanded');
      if (sidebar) sidebar.inert = false;
      expandButton?.removeEventListener('click', toggleExpanded);
      dockList?.replaceWith(dockList.cloneNode(true));
      dockFavorites?.replaceWith(dockFavorites.cloneNode(true));
      dockMore?.replaceWith(dockMore.cloneNode(true));
      detailHandle?.removeEventListener('pointerdown', pointerDown);
      detailHandle?.removeEventListener('click', handleClick);
      listHandle?.removeEventListener('pointerdown', listPointerDown);
      listHandle?.removeEventListener('click', cycleListHeight);
      listCollapse?.removeEventListener('click', cycleListHeight);
      listClose?.removeEventListener('click', closeList);
      window.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('pointermove', listPointerMove);
      document.removeEventListener('keydown', keyDown);
      media.removeEventListener('change', mediaChange);
    },
  };
}
