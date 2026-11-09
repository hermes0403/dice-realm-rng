/** Global timed boost state, status rendering, and refresh lifecycle. */
export function createGlobalBoostSystem({
  supabaseClient,
  getBoostState,
  setBoostState,
  render,
  restartAutoInterval,
  loadAdminIncomeMonitor,
  getCoinBoost = () => null,
  documentRef,
  timerManager,
  isCloudSyncBlocked = () => false,
  markCloudSyncBlocked = () => false
}) {
  let refreshBusy = false;
  let globalBoostUISetup = false;
  let globalBoostChannel = null;
  let globalBoostRealtimeRevision = 0;
  function activeGlobalBoost() {
    const boost = getBoostState();
    return boost && Number.isFinite(new Date(boost.ends_at).getTime()) && new Date(boost.ends_at).getTime() > Date.now()
      ? boost
      : { luck_percent: 0, speed_percent: 0, ends_at: null };
  }

  function applyGlobalBoostRow(data) {
    const before = JSON.stringify(activeGlobalBoost());
    setBoostState(data || null);
    const changed = before !== JSON.stringify(activeGlobalBoost());
    if (changed) {
      if (typeof render === 'function') render();
      if (typeof restartAutoInterval === 'function') restartAutoInterval();
    }
    updateGlobalBoostStatus();
    return changed;
  }

  async function refreshGlobalBoost() {
    if (refreshBusy || !supabaseClient || isCloudSyncBlocked()) return;
    refreshBusy = true;
    const revisionAtStart = globalBoostRealtimeRevision;
    try {
      const { data, error } = await supabaseClient.from('realm_global_boost')
        .select('luck_percent,speed_percent,starts_at,ends_at,updated_at')
        .eq('singleton', true).maybeSingle();
      if (error) throw error;
      // A Realtime event received while this read was in flight is newer than its snapshot.
      if (revisionAtStart !== globalBoostRealtimeRevision) return;
      applyGlobalBoostRow(data);
    } catch (error) {
      markCloudSyncBlocked(error);
      console.debug('Global timed boost unavailable', error);
    } finally {
      refreshBusy = false;
    }
  }

  function setupGlobalBoostSubscription() {
    if (!supabaseClient || typeof supabaseClient.channel !== 'function' || isCloudSyncBlocked()) return false;
    if (globalBoostChannel) {
      try { supabaseClient.removeChannel(globalBoostChannel); } catch {}
      globalBoostChannel = null;
    }
    try {
      globalBoostChannel = supabaseClient.channel('realm-global-boost')
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'realm_global_boost', filter: 'singleton=eq.true'
        }, payload => {
          globalBoostRealtimeRevision++;
          applyGlobalBoostRow(payload?.eventType === 'DELETE' ? null : payload?.new || null);
        })
        .subscribe((status, error) => {
          if (markCloudSyncBlocked(error)) {
            globalBoostChannel = null;
            return;
          }
          if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !isCloudSyncBlocked()) refreshGlobalBoost();
        });
      return true;
    } catch (error) {
      markCloudSyncBlocked(error);
      console.debug('Global boost realtime unavailable; polling fallback remains active', error);
      globalBoostChannel = null;
      return false;
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
    const coinBoost = getCoinBoost();
    const hasLuckOrSpeed = !!boost.ends_at && (luckPercent > 0 || speedPercent > 0);
    const hasCoinBoost = !!coinBoost;
    const hasBoost = hasLuckOrSpeed || hasCoinBoost;
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
    if (coinBoost) {
      const coinRemaining = Math.max(0, Math.ceil((Number(coinBoost.expires_at) - Date.now()) / 1000));
      const coinMinutes = String(Math.floor(coinRemaining / 60)).padStart(2, '0');
      const coinSeconds = String(coinRemaining % 60).padStart(2, '0');
      cards.push(`<button type="button" class="realm-activity-card" data-activity-detail="coin"><span class="realm-activity-icon">💰</span><span><b>金錢倍率 x${Number(coinBoost.multiplier) || 1}</b><small>剩餘 ${coinMinutes}:${coinSeconds}</small></span></button>`);
    }
    panel.innerHTML = `<div class="eyebrow">REALM LIVE EVENT</div><h1>管理員活動</h1><div class="realm-activity-grid">${cards.join('')}</div>`;
  }

  function setupGlobalBoostUI() {
    if (globalBoostUISetup) return false;
    globalBoostUISetup = true;
    documentRef.addEventListener('click', event => {
      const card = event.target.closest('[data-activity-detail]');
      if (!card) return;
      const kind = card.dataset.activityDetail;
      if (kind === 'coin') {
        const coinBoost = getCoinBoost();
        if (!coinBoost) return;
        const remaining = Math.max(0, Math.ceil((Number(coinBoost.expires_at) - Date.now()) / 1000));
        alert(`全服金錢倍率 x${Number(coinBoost.multiplier) || 1}\n剩餘 ${Math.floor(remaining / 60)} 分 ${remaining % 60} 秒`);
        return;
      }
      const boost = activeGlobalBoost();
      const value = kind === 'luck' ? Number(boost.luck_percent) || 0 : Number(boost.speed_percent) || 0;
      const label = kind === 'luck' ? '運氣' : '速度';
      const remaining = Math.max(0, Math.ceil((new Date(boost.ends_at).getTime() - Date.now()) / 1000));
      alert(`全體${label} +${value}%\n剩餘 ${Math.floor(remaining / 60)} 分 ${remaining % 60} 秒`);
    });
    timerManager.clearScope('global-boost-refresh');
    timerManager.clearScope('realm-activity-render');
    timerManager.clearScope('admin-income-monitor');
    if (!isCloudSyncBlocked()) {
      setupGlobalBoostSubscription();
      refreshGlobalBoost();
      // Realtime handles normal changes; a five-minute read repairs missed events or outages.
      timerManager.setInterval(refreshGlobalBoost, 5 * 60 * 1000, 'global-boost-refresh');
    }
    // Countdown text remains live without querying Supabase every second.
    timerManager.setInterval(updateGlobalBoostStatus, 1000, 'global-boost-status');
    timerManager.setInterval(renderRealmActivity, 1000, 'realm-activity-render');
    timerManager.setInterval(() => {
      if (documentRef.getElementById('adminIncomeMonitorFold')?.open) loadAdminIncomeMonitor();
    }, 15000, 'admin-income-monitor');
    return true;
  }

  return { activeGlobalBoost, refreshGlobalBoost, updateGlobalBoostStatus, renderRealmActivity, setupGlobalBoostUI, setupGlobalBoostSubscription };
}
