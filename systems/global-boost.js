/** Global timed boost state, status rendering, and refresh lifecycle. */
export function createGlobalBoostSystem({
  supabaseClient,
  getBoostState,
  setBoostState,
  render,
  restartAutoInterval,
  loadAdminIncomeMonitor,
  documentRef,
  timerManager
}) {
  let refreshBusy = false;
  let globalBoostUISetup = false;
  function activeGlobalBoost() {
    const boost = getBoostState();
    return boost && Number.isFinite(new Date(boost.ends_at).getTime()) && new Date(boost.ends_at).getTime() > Date.now()
      ? boost
      : { luck_percent: 0, speed_percent: 0, ends_at: null };
  }

  async function refreshGlobalBoost() {
    if (refreshBusy || !supabaseClient) return;
    refreshBusy = true;
    try {
      const { data, error } = await supabaseClient.from('realm_global_boost')
        .select('luck_percent,speed_percent,starts_at,ends_at,updated_at')
        .eq('singleton', true).maybeSingle();
      if (error) throw error;
      const before = JSON.stringify(activeGlobalBoost());
      setBoostState(data || null);
      if (before !== JSON.stringify(activeGlobalBoost())) {
        if (typeof render === 'function') render();
        if (typeof restartAutoInterval === 'function') restartAutoInterval();
      }
      if (typeof updateGlobalBoostStatus === 'function') updateGlobalBoostStatus();
    } catch (error) {
      console.debug('Global timed boost unavailable', error);
    } finally {
      refreshBusy = false;
    }
  }

  function updateGlobalBoostStatus() {
    const element = documentRef.getElementById('adminGlobalBoostStatus');
    if (!element) return;
    const boost = activeGlobalBoost();
    if (!boost.ends_at) {
      element.textContent = '目前沒有全體加成';
      return;
    }
    const remaining = Math.max(0, Math.ceil((new Date(boost.ends_at).getTime() - Date.now()) / 1000));
    element.textContent = remaining
      ? `目前全體運氣 +${Number(boost.luck_percent) || 0}%、速度 +${Number(boost.speed_percent) || 0}%，剩餘 ${remaining} 秒`
      : '全體加成已結束';
  }

  function renderRealmActivity() {
    const welcome = documentRef.getElementById('realmHeroWelcome');
    const panel = documentRef.getElementById('realmAdminActivity');
    if (!welcome || !panel) return;
    const boost = activeGlobalBoost();
    const luckPercent = Number(boost.luck_percent) || 0;
    const speedPercent = Number(boost.speed_percent) || 0;
    const hasBoost = !!boost.ends_at && (luckPercent > 0 || speedPercent > 0);
    welcome.hidden = hasBoost;
    panel.hidden = !hasBoost;
    if (!hasBoost) {
      panel.innerHTML = '';
      return;
    }
    const remaining = Math.max(0, Math.ceil((new Date(boost.ends_at).getTime() - Date.now()) / 1000));
    const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
    const seconds = String(remaining % 60).padStart(2, '0');
    const cards = [];
    if (luckPercent > 0) cards.push(`<button type="button" class="realm-activity-card" data-activity-detail="luck"><span class="realm-activity-icon">✦</span><span><b>全服運氣 +${luckPercent}%</b><small>剩餘 ${minutes}:${seconds}</small></span></button>`);
    if (speedPercent > 0) cards.push(`<button type="button" class="realm-activity-card" data-activity-detail="speed"><span class="realm-activity-icon">⚡</span><span><b>全服速度 +${speedPercent}%</b><small>剩餘 ${minutes}:${seconds}</small></span></button>`);
    panel.innerHTML = `<div class="eyebrow">REALM LIVE EVENT</div><h1>管理員活動</h1><div class="realm-activity-grid">${cards.join('')}</div>`;
  }

  function setupGlobalBoostUI() {
    if (globalBoostUISetup) return false;
    globalBoostUISetup = true;
    documentRef.addEventListener('click', event => {
      const card = event.target.closest('[data-activity-detail]');
      if (!card) return;
      const boost = activeGlobalBoost();
      const kind = card.dataset.activityDetail;
      const value = kind === 'luck' ? Number(boost.luck_percent) || 0 : Number(boost.speed_percent) || 0;
      const label = kind === 'luck' ? '運氣' : '速度';
      const remaining = Math.max(0, Math.ceil((new Date(boost.ends_at).getTime() - Date.now()) / 1000));
      alert(`全體${label} +${value}%\n剩餘 ${Math.floor(remaining / 60)} 分 ${remaining % 60} 秒`);
    });
    timerManager.clearScope('global-boost-refresh');
    timerManager.clearScope('realm-activity-render');
    timerManager.clearScope('admin-income-monitor');
    timerManager.setInterval(() => { refreshGlobalBoost(); updateGlobalBoostStatus(); }, 3000, 'global-boost-refresh');
    timerManager.setInterval(renderRealmActivity, 1000, 'realm-activity-render');
    timerManager.setInterval(() => {
      if (documentRef.getElementById('adminIncomeMonitorFold')?.open) loadAdminIncomeMonitor();
    }, 15000, 'admin-income-monitor');
    return true;
  }

  return { activeGlobalBoost, refreshGlobalBoost, updateGlobalBoostStatus, renderRealmActivity, setupGlobalBoostUI };
}
