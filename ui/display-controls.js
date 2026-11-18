export function setupDisplayControls({
  documentRef = document,
  windowRef = window,
  navigatorRef = windowRef.navigator,
  toast = () => {}
} = {}) {
  const getButton = () => documentRef.getElementById('fullscreenToggleBtn');
  if (!getButton()) return { update: () => {}, destroy: () => {} };

  const root = documentRef.documentElement;
  const fullscreenMode = windowRef.matchMedia?.('(display-mode: fullscreen)');
  const isPwaFullscreen = () => fullscreenMode?.matches === true;

  function update() {
    const nativeFullscreen = Boolean(documentRef.fullscreenElement);
    const installedFullscreen = isPwaFullscreen();
    const button = getButton();
    if (!button) return;
    button.textContent = nativeFullscreen ? '退出全螢幕' : installedFullscreen ? '已全螢幕' : '全螢幕';
    button.setAttribute('aria-pressed', String(nativeFullscreen || installedFullscreen));
    button.disabled = installedFullscreen && !nativeFullscreen;
  }

  async function toggleFullscreen() {
    if (isPwaFullscreen() && !documentRef.fullscreenElement) {
      toast('目前已在全螢幕模式；此模式由安裝版視窗控制。');
      return;
    }
    if (documentRef.fullscreenElement) {
      if (typeof documentRef.exitFullscreen !== 'function') {
        toast('此瀏覽器無法退出全螢幕');
        return;
      }
      try {
        await documentRef.exitFullscreen();
      } catch {
        toast('無法退出全螢幕');
      }
      update();
      return;
    }

    if (typeof root?.requestFullscreen !== 'function') {
      toast('此瀏覽器不支援全螢幕');
      return;
    }

    try {
      await root.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      try {
        await root.requestFullscreen();
      } catch {
        toast('此瀏覽器不支援全螢幕');
      }
    }
    update();
  }

  function onFullscreenChange() {
    update();
  }

  function onFullscreenError() {
    toast('此瀏覽器不支援全螢幕');
    update();
  }

  const onDocumentClick = event => {
    const target = event.target?.closest?.('#fullscreenToggleBtn');
    if (!target || target.disabled) return;
    event.preventDefault();
    void toggleFullscreen();
  };
  documentRef.addEventListener('click', onDocumentClick);
  documentRef.addEventListener('fullscreenchange', onFullscreenChange);
  documentRef.addEventListener('fullscreenerror', onFullscreenError);
  update();

  const serviceWorkerReady = (() => {
    if (!navigatorRef?.serviceWorker?.register || windowRef.isSecureContext !== true) {
      return Promise.resolve(null);
    }
    const workerUrl = new URL('../sw.js', import.meta.url);
    const scopeUrl = new URL('../', import.meta.url);
    return navigatorRef.serviceWorker.register(workerUrl.href, { scope: scopeUrl.pathname })
      .catch(() => null);
  })();

  return {
    update,
    serviceWorkerReady,
    destroy() {
      documentRef.removeEventListener?.('click', onDocumentClick);
      documentRef.removeEventListener?.('fullscreenchange', onFullscreenChange);
      documentRef.removeEventListener?.('fullscreenerror', onFullscreenError);
    }
  };
}
