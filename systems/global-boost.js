/** Global timed boost state, status rendering, and refresh lifecycle. */
export function createGlobalBoostSystem({
  supabaseClient,
  getCurrentUser = () => null,
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
  let realmActivitySignature = '';
  function activeGlobalBoost() {
    const boost = getBoostState() || {};
    const active = Number.isFinite(new Date(boost.ends_at).getTime()) && new Date(boost.ends_at).getTime() > Date.now();
    return {
      ...boost,
      luck_percent: active ? Number(boost.luck_percent) || 0 : 0,
      speed_percent: active ? Number(boost.speed_percent) || 0 : 0,
      ends_at: active ? boost.ends_at : null
    };
  }

  function activeFusionLuckBoost() {
    const boost = getBoostState() || {};
    const startsAt = new Date(boost.fusion_luck_starts_at).getTime();
    const endsAt = new Date(boost.fusion_luck_ends_at).getTime();
    const percent = Number(boost.fusion_luck_percent) || 0;
    return Number.isFinite(endsAt) && endsAt > Date.now()
      && (!Number.isFinite(startsAt) || startsAt <= Date.now()) && percent > 0
      ? { percent, starts_at: boost.fusion_luck_starts_at, ends_at: boost.fusion_luck_ends_at }
      : null;
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
    if (refreshBusy || !supabaseClient || !getCurrentUser() || isCloudSyncBlocked()) return;
    refreshBusy = true;
    const revisionAtStart = globalBoostRealtimeRevision;
    try {
      const { data, error } = await supabaseClient.from('realm_global_boost')
        .select('luck_percent,speed_percent,starts_at,ends_at,updated_at,fusion_luck_percent,fusion_luck_starts_at,fusion_luck_ends_at,fusion_luck_updated_by')
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
    if (!supabaseClient || typeof supabaseClient.channel !== 'function' || !getCurrentUser() || isCloudSyncBlocked()) return false;
    if (globalBoostChannel) return true;
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

  function startGlobalBoostRealtime() {
    if (!getCurrentUser() || isCloudSyncBlocked()) return false;
    const subscribed = setupGlobalBoostSubscription();
    void refreshGlobalBoost();
    timerManager.clearScope('global-boost-refresh');
    timerManager.setInterval(refreshGlobalBoost, 5 * 60 * 1000, 'global-boost-refresh');
    return subscribed;
  }

  function stopGlobalBoostRealtime() {
    timerManager.clearScope('global-boost-refresh');
    if (!globalBoostChannel) return false;
    const channel = globalBoostChannel;
    globalBoostChannel = null;
    if (isCloudSyncBlocked()) return true;
    try {
      if (typeof supabaseClient?.removeChannel === 'function') {
        const removal = supabaseClient.removeChannel(channel);
        if (removal?.catch) removal.catch(() => {});
      } else {
        void channel.unsubscribe?.();
      }
    } catch {}
    return true;
  }

  function updateGlobalBoostStatus() {
    const element = documentRef.getElementById('adminGlobalBoostStatus');
    if (!element) return;
    const boost = activeGlobalBoost();
    const fusion = activeFusionLuckBoost();
    const lines = [];
    if (boost.ends_at) {
      const remaining = Math.max(0, Math.ceil((new Date(boost.ends_at).getTime() - Date.now()) / 1000));
      lines.push(`全體運氣 +${Number(boost.luck_percent) || 0}%、速度 +${Number(boost.speed_percent) || 0}%（${remaining} 秒）`);
    }
    if (fusion) {
      const remaining = Math.max(0, Math.ceil((new Date(fusion.ends_at).getTime() - Date.now()) / 1000));
      lines.push(`全服融合運氣 +${fusion.percent}%（${remaining} 秒）`);
    }
    element.textContent = lines.length ? lines.join('；') : '目前沒有全體加成';
  }

  function renderRealmActivity() {
    const welcome = documentRef.getElementById('realmHeroWelcome');
    const panel = documentRef.getElementById('realmAdminActivity');
    if (!welcome || !panel) return;
    const boost = activeGlobalBoost();
    const luckPercent = Number(boost.luck_percent) || 0;
    const speedPercent = Number(boost.speed_percent) || 0;
    const fusionBoost = activeFusionLuckBoost();
    const coinBoost = getCoinBoost();
    const hasLuckOrSpeed = !!boost.ends_at && (luckPercent > 0 || speedPercent > 0);
    const hasFusionLuck = !!fusionBoost;
    const hasCoinBoost = !!coinBoost;
    const hasBoost = hasLuckOrSpeed || hasFusionLuck || hasCoinBoost;
    welcome.hidden = hasBoost;
    panel.hidden = !hasBoost;
    if (!hasBoost) {
      if (realmActivitySignature || panel.innerHTML) panel.innerHTML = '';
      realmActivitySignature = '';
      return;
    }

    const signature = JSON.stringify({
      luckPercent,
      speedPercent,
      boostEndsAt: boost.ends_at || null,
      fusionLuckPercent: fusionBoost?.percent || 0,
      fusionLuckEndsAt: fusionBoost?.ends_at || null,
      coinMultiplier: coinBoost ? Number(coinBoost.multiplier) || 1 : null,
      coinExpiresAt: coinBoost ? Number(coinBoost.expires_at) || 0 : null
    });
    if (signature !== realmActivitySignature) {
      const cards = [];
      if (luckPercent > 0) cards.push(`<button type="button" class="realm-activity-card" data-activity-detail="luck"><span class="realm-activity-icon">✦</span><span><b>全服運氣 +${luckPercent}%</b><small data-activity-countdown="luck"></small></span></button>`);
      if (speedPercent > 0) cards.push(`<button type="button" class="realm-activity-card" data-activity-detail="speed"><span class="realm-activity-icon">⚡</span><span><b>全服速度 +${speedPercent}%</b><small data-activity-countdown="speed"></small></span></button>`);
      if (fusionBoost) cards.push(`<button type="button" class="realm-activity-card" data-activity-detail="fusion"><span class="realm-activity-icon">🐾</span><span><b>融合運氣 +${fusionBoost.percent}%</b><small data-activity-countdown="fusion"></small></span></button>`);
      if (coinBoost) {
        cards.push(`<button type="button" class="realm-activity-card" data-activity-detail="coin"><span class="realm-activity-icon">💰</span><span><b>金錢倍率 x${Number(coinBoost.multiplier) || 1}</b><small data-activity-countdown="coin"></small></span></button>`);
      }
      panel.innerHTML = `<div class="eyebrow">REALM LIVE EVENT</div><h1>管理員活動</h1><div class="realm-activity-grid">${cards.join('')}</div>`;
      realmActivitySignature = signature;
    }

    const formatCountdown = seconds => {
      const remaining = Math.max(0, Math.ceil(seconds));
      return `剩餘 ${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
    };
    const globalRemaining = Math.max(0, Math.ceil((new Date(boost.ends_at).getTime() - Date.now()) / 1000));
    if (luckPercent > 0) {
      const node = panel.querySelector('[data-activity-countdown="luck"]');
      if (node) node.textContent = formatCountdown(globalRemaining);
    }
    if (speedPercent > 0) {
      const node = panel.querySelector('[data-activity-countdown="speed"]');
      if (node) node.textContent = formatCountdown(globalRemaining);
    }
    if (fusionBoost) {
      const fusionRemaining = Math.max(0, Math.ceil((new Date(fusionBoost.ends_at).getTime() - Date.now()) / 1000));
      const node = panel.querySelector('[data-activity-countdown="fusion"]');
      if (node) node.textContent = formatCountdown(fusionRemaining);
    }
    if (coinBoost) {
      const coinRemaining = Math.max(0, Math.ceil((Number(coinBoost.expires_at) - Date.now()) / 1000));
      const node = panel.querySelector('[data-activity-countdown="coin"]');
      if (node) node.textContent = formatCountdown(coinRemaining);
    }
  }

  function setupGlobalBoostUI() {
    if (globalBoostUISetup) return false;
    globalBoostUISetup = true;
    documentRef.addEventListener('click', event => {
      const card = event.target.closest('[data-activity-detail]');
      if (!card) return;
      const kind = card.dataset.activityDetail;
      if (kind === 'fusion') {
        const fusion = activeFusionLuckBoost();
        if (!fusion) return;
        const remaining = Math.max(0, Math.ceil((new Date(fusion.ends_at).getTime() - Date.now()) / 1000));
        alert(`全服寵物融合運氣 +${fusion.percent}%\n神話與秘密品質機率提高，增加量由其餘品質中機率最高者扣除。\n剩餘 ${Math.floor(remaining / 60)} 分 ${remaining % 60} 秒`);
        return;
      }
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
    // Supabase reads and Realtime start only after a user session has loaded successfully.
    // Countdown text remains live without querying Supabase every second.
    timerManager.setInterval(updateGlobalBoostStatus, 1000, 'global-boost-status');
    timerManager.setInterval(renderRealmActivity, 1000, 'realm-activity-render');
    timerManager.setInterval(() => {
      if (getCurrentUser() && !isCloudSyncBlocked() && documentRef.getElementById('adminIncomeMonitorFold')?.open) loadAdminIncomeMonitor();
    }, 60000, 'admin-income-monitor');
    return true;
  }

  return { activeGlobalBoost, activeFusionLuckBoost, refreshGlobalBoost, updateGlobalBoostStatus, renderRealmActivity, setupGlobalBoostUI, setupGlobalBoostSubscription, startGlobalBoostRealtime, stopGlobalBoostRealtime };
}
