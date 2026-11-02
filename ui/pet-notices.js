/** Small transient notices for automatic pet sales. */
export function createPetNoticeUI({ documentRef, timerManager }) {
  function showPetAutoSellNotice(rarityName, petName) {
    let element = documentRef.getElementById('petAutoSellNotice');
    if (!element) {
      element = documentRef.createElement('div');
      element.id = 'petAutoSellNotice';
      element.setAttribute('aria-live', 'polite');
      element.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top,0px) + 18px);left:50%;transform:translateX(-50%);z-index:100001;max-width:min(92vw,520px);padding:10px 18px;border:1px solid rgba(120,245,190,.55);border-radius:12px;background:rgba(8,18,28,.78);backdrop-filter:blur(8px);color:#baffd8;font-weight:800;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.18);pointer-events:none;opacity:0;transition:opacity .18s ease;';
      documentRef.body.appendChild(element);
    }
    element.textContent = `已自動出售 ${rarityName} ${petName}`;
    element.style.opacity = '1';
    timerManager.clearTimeout(element._hideTimer);
    const hideTimer = timerManager.setTimeout(() => {
      element.style.opacity = '0';
      if (element._hideTimer === hideTimer) element._hideTimer = null;
    }, 3000, 'pet-auto-sell-notice');
    element._hideTimer = hideTimer;
  }

  return { showPetAutoSellNotice };
}
