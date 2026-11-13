export function setupDisplayControls({
  documentRef = document,
  windowRef = window,
  navigatorRef = windowRef.navigator,
  toast = () => {}
} = {}) {
  const button = documentRef.getElementById('fullscreenToggleBtn');
  if (!button) return { update: () => {}, destroy: () => {} };

  const root = documentRef.documentElement;
  const fullscreenMode = windowRef.matchMedia?.('(display-mode: fullscreen)');
  const isPwaFullscreen = () => fullscreenMode?.matches === true;

  function update() {
    const nativeFullscreen = Boolean(documentRef.fullscreenElement);
    const installedFullscreen = isPwaFullscreen();
    button.textContent = nativeFullscreen ? '退出全螢幕' : '全螢幕';
    button.setAttribute('aria-pressed', String(nativeFullscreen || installedFullscreen));
    button.disabled = installedFullscreen && !nativeFullscreen;
  }

  async function toggleFullscreen() {
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

  button.addEventListener('click', toggleFullscreen);
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
      button.removeEventListener?.('click', toggleFullscreen);
      documentRef.removeEventListener?.('fullscreenchange', onFullscreenChange);
      documentRef.removeEventListener?.('fullscreenerror', onFullscreenError);
    }
  };
}
