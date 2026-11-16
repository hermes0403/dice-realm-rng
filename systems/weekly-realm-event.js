/** Weekly realm roll challenge. Rolls are batched; rewards are granted server-side and delivered through Realtime. */
const CAMPAIGN_START = '2026-11-17';
const MILESTONES = [
  { target: 50000, reward: '1M$' },
  { target: 150000, reward: '幸運藥水 III ×1' },
  { target: 300000, reward: '速度藥水 I ×5 · 100M$' },
  { target: 500000, reward: '速度藥水 II ×5 · 幸運藥水 II ×5' },
  { target: 800000, reward: '天堂藥水 II ×1 · 100M$' }
];
const number = value => new Intl.NumberFormat('en-US').format(Math.max(0, Number(value) || 0));
const safeText = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));

export function createWeeklyRealmEvent({ supabaseClient, getCurrentUser, localStorageRef, timerManager, documentRef, toast, onRewardClaimed = () => {} }) {
  let progress = { total_rolls: 0, claimed_milestones: [] };
  let refreshing = false;
  let rewardChannel = null;
  let subscribedUserId = null;
  const pendingKey = () => { const user = getCurrentUser(); return user?.id ? 'diceRealmWeeklyPending:' + user.id + ':' + CAMPAIGN_START : ''; };
  function readPending() { const key = pendingKey(); if (!key) return 0; try { return Math.max(0, Number(localStorageRef.getItem(key)) || 0); } catch { return 0; } }
  function writePending(value) { const key = pendingKey(); if (!key) return; try { if (value > 0) localStorageRef.setItem(key, String(Math.floor(value))); else localStorageRef.removeItem(key); } catch {} }
  function recordRoll() { if (getCurrentUser()?.id) writePending(readPending() + 1); }

  function render() {
    const total = Math.max(0, Number(progress.total_rolls) || 0);
    const next = MILESTONES.find(item => total < item.target) || null;
    const claimed = new Set((progress.claimed_milestones || []).map(Number));
    const line = documentRef.getElementById('weeklyRealmLine');
    if (!line) return;
    const progressTarget = next ? next.target : MILESTONES[MILESTONES.length - 1].target;
    const progressPercent = Math.min(100, Math.max(0, total / progressTarget * 100));
    const progressText = next
      ? '下一階段：' + number(next.target) + ' 抽，還差 ' + number(next.target - total) + ' 抽'
      : '全階段目標已達成';
    const rewardRows = MILESTONES.map(item => {
      const isGranted = claimed.has(item.target);
      const reached = total >= item.target;
      const status = isGranted
        ? '<span class="weekly-reward-status is-claimed">✓ 已自動發放</span>'
        : reached
          ? '<span class="weekly-reward-status">發放處理中</span>'
          : '<span class="weekly-reward-status">尚未達成</span>';
      return '<div class="weekly-reward-row' + (reached ? ' is-reached' : '') + (isGranted ? ' is-claimed' : '') + '">' +
        '<span class="weekly-reward-target">' + number(item.target) + ' 抽</span>' +
        '<span class="weekly-reward-description">' + item.reward + '</span>' +
        status + '</div>';
    }).join('');
    line.innerHTML =
      '<div class="weekly-realm-topline"><div class="weekly-realm-title"><span class="weekly-realm-globe">🌐</span><div><strong>全服每週擲骰挑戰</strong><small>WEEKLY REALM CHALLENGE</small></div></div><span class="weekly-realm-period">11/17 — 11/23</span></div>' +
      '<div class="weekly-realm-total"><strong>' + number(total) + '</strong><span>全服累積擲骰</span></div>' +
      '<div class="weekly-realm-progress"><span style="width:' + progressPercent.toFixed(2) + '%"></span></div>' +
      '<div class="weekly-realm-progress-label">' + progressText + '<span>' + Math.floor(progressPercent) + '%</span></div>' +
      '<div class="weekly-reward-heading">全服里程碑獎勵 <small>達成後自動發放給所有玩家</small></div>' +
      '<div class="weekly-reward-list">' + rewardRows + '</div>' +
      '<div class="weekly-realm-bottom">活動期間：11/17 00:00 — 11/23 00:00（台灣時間）<span>達成時即時通知，離線玩家登入後補發</span></div>';
  }

  function closeRewardPopup() {
    const modal = documentRef.getElementById('weeklyRewardOverlay');
    if (modal) modal.hidden = true;
  }

  function showRewardPopup(rewards) {
    if (!Array.isArray(rewards) || !rewards.length) return;
    const modal = documentRef.getElementById('weeklyRewardOverlay');
    const list = documentRef.getElementById('weeklyRewardItems');
    const total = documentRef.getElementById('weeklyRewardSubtitle');
    if (!modal || !list) { toast('全服活動獎勵已自動發放！'); return; }
    list.innerHTML = rewards.map(item =>
      '<div class="weekly-reward-popup-row"><span class="weekly-reward-popup-check">✓</span><div><b>' +
      number(item.milestone) + ' 抽達成</b><span>' + safeText(item.reward) + '</span></div></div>'
    ).join('');
    if (total) total.textContent = '全服里程碑達成，獎勵已存入你的雲端背包';
    modal.hidden = false;
  }

  function ensureRealtimeSubscription() {
    const user = getCurrentUser();
    if (!supabaseClient || !user?.id || typeof supabaseClient.channel !== 'function') return;
    if (subscribedUserId === user.id && rewardChannel) return;
    if (rewardChannel) supabaseClient.removeChannel(rewardChannel);
    subscribedUserId = user.id;
    rewardChannel = supabaseClient
      .channel('weekly-realm-rewards-' + user.id)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'realm_weekly_reward_notifications',
        filter: 'user_id=eq.' + user.id
      }, () => { refresh(); })
      .subscribe();
  }

  async function refresh() {
    const user = getCurrentUser();
    if (!supabaseClient || !user?.id || refreshing) { render(); return; }
    ensureRealtimeSubscription();
    refreshing = true;
    try {
      const pending = readPending();
      let response;
      if (pending > 0) {
        const batch = Math.min(4500, pending);
        const { data, error } = await supabaseClient.rpc('record_weekly_realm_rolls', { p_rolls: batch });
        if (error) throw error;
        const accepted = Math.max(0, Math.min(batch, Number(data?.accepted_rolls) || 0));
        if (accepted) writePending(pending - accepted);
        response = data;
      } else {
        const { data, error } = await supabaseClient.rpc('get_weekly_realm_progress');
        if (error) throw error;
        response = data;
      }
      if (response && typeof response === 'object') {
        progress = { ...progress, ...response };
        render();
        if (Array.isArray(response.new_rewards) && response.new_rewards.length) {
          try { await onRewardClaimed(); } catch (error) { console.warn('全服獎勵存檔重新載入失敗', error); }
          showRewardPopup(response.new_rewards);
        }
      }
    } catch (error) { console.warn('全服活動進度更新失敗', error); }
    finally { refreshing = false; }
  }

  function setup() {
    documentRef.addEventListener('click', event => {
      if (event.target.closest('[data-weekly-reward-close]') || event.target.id === 'weeklyRewardOverlay') closeRewardPopup();
    });
    render();
    ensureRealtimeSubscription();
    refresh();
    timerManager.setInterval(refresh, 600000, 'weekly-realm-event-refresh');
  }
  return { setup, refresh, recordRoll };
}
