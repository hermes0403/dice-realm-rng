/** Weekly realm roll challenge. Local rolls are buffered and synced once every ten minutes. */
const CAMPAIGN_START = '2026-11-17';
const MILESTONES = [
  { target: 50000, icons: '🪙', reward: '1M$' },
  { target: 150000, icons: '✦', reward: '幸運藥水 III ×1' },
  { target: 300000, icons: '💨 🪙', reward: '速度藥水 I ×5 · 100M$' },
  { target: 500000, icons: '🌪️ ⚗️', reward: '速度藥水 II ×5 · 幸運藥水 II ×5' },
  { target: 800000, icons: '🌌 🪙', reward: '天堂藥水 II ×1 · 100M$' }
];
const number = value => new Intl.NumberFormat('en-US').format(Math.max(0, Number(value) || 0));
export function createWeeklyRealmEvent({ supabaseClient, getCurrentUser, localStorageRef, timerManager, documentRef, toast, isAdmin = () => false, onRewardClaimed = () => {} }) {
  let progress = { total_rolls: 0, claimed_milestones: [] };
  let refreshing = false;
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
      const reached = total >= item.target;
      const isClaimed = claimed.has(item.target);
      const status = isClaimed
        ? '<span class="weekly-reward-status is-claimed">✓ 已領取</span>'
        : reached
          ? '<button type="button" class="weekly-inline-claim" data-weekly-claim="' + item.target + '">領取</button>'
          : '<span class="weekly-reward-status">尚未達成</span>';
      return '<div class="weekly-reward-row' + (reached ? ' is-reached' : '') + (isClaimed ? ' is-claimed' : '') + '">' +
        '<span class="weekly-reward-target">' + number(item.target) + ' 抽</span>' +
        '<span class="weekly-reward-description">' + item.reward + '</span>' +
        status + '</div>';
    }).join('');
    const adminControls = isAdmin()
      ? '<div class="weekly-admin-adjust"><div class="weekly-admin-adjust-title">管理員控制台 <small>手動增加本期全服累積擲骰</small></div><div class="weekly-admin-adjust-actions"><input id="weeklyAdminRollAmount" type="number" min="1" max="1000000000" step="1" inputmode="numeric" placeholder="輸入增加次數" aria-label="手動增加擲骰次數"><button type="button" class="primary" id="weeklyAdminAddRollsBtn">增加次數</button></div><div class="weekly-admin-adjust-hint">僅管理員可操作；增加後會立即更新進度，達成門檻時照常發放全服獎勵。</div></div>'
      : '';
    line.innerHTML =
      '<div class="weekly-realm-topline"><div class="weekly-realm-title"><span class="weekly-realm-globe">🌐</span><div><strong>全服每週擲骰挑戰</strong><small>WEEKLY REALM CHALLENGE</small></div></div><span class="weekly-realm-period">11/17 — 11/23</span></div>' +
      '<div class="weekly-realm-total"><strong>' + number(total) + '</strong><span>全服累積擲骰</span></div>' +
      '<div class="weekly-realm-progress"><span style="width:' + progressPercent.toFixed(2) + '%"></span></div>' +
      '<div class="weekly-realm-progress-label">' + progressText + '<span>' + Math.floor(progressPercent) + '%</span></div>' +
      '<div class="weekly-reward-heading">全服里程碑獎勵 <small>達成後每位玩家皆可領取</small></div>' +
      '<div class="weekly-reward-list">' + rewardRows + '</div>' +
      '<div class="weekly-realm-bottom">活動期間：11/17 00:00 — 11/23 00:00（台灣時間）<span>每 10 分鐘同步進度</span></div>' + adminControls;
  }
  async function refresh() {
    const user = getCurrentUser();
    if (!supabaseClient || !user?.id || refreshing) { render(); return; }
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
      if (response && typeof response === 'object') { progress = { ...progress, ...response }; render(); }
    } catch (error) { console.warn('全服活動進度更新失敗', error); }
    finally { refreshing = false; }
  }
  async function claim(milestone) {
    if (!getCurrentUser()?.id) { toast('請先登入雲端帳號'); return; }
    const button = documentRef.querySelector('[data-weekly-claim="' + milestone + '"]');
    if (button) button.disabled = true;
    try {
      const { data, error } = await supabaseClient.rpc('claim_weekly_realm_reward', { p_milestone: milestone });
      if (error) throw error;
      if (!data?.success) throw new Error('領取未完成');
      toast('全服活動獎勵已領取！');
      await onRewardClaimed();
      await refresh();
    } catch (error) { toast(error?.message || '領取失敗，請稍後再試'); await refresh(); }
  }
  async function addAdminRolls() {
    if (!isAdmin()) { toast('管理員權限不足'); return; }
    const input = documentRef.getElementById('weeklyAdminRollAmount');
    const button = documentRef.getElementById('weeklyAdminAddRollsBtn');
    const amount = Number(input?.value);
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000000) { toast('請輸入 1 至 1,000,000,000 的整數'); return; }
    if (!confirm('確定為目前全服活動增加 ' + number(amount) + ' 次擲骰？')) return;
    if (button) button.disabled = true;
    try {
      const { data, error } = await supabaseClient.rpc('admin_add_weekly_realm_rolls', { p_rolls: amount });
      if (error) throw error;
      if (!data || Number(data.accepted_rolls) !== amount) throw new Error('資料庫未完整接受增加次數');
      progress = { ...progress, ...data };
      render();
      toast('已增加 ' + number(amount) + ' 次，全服進度已更新');
    } catch (error) {
      toast(error?.message || '增加失敗，請稍後再試');
      await refresh();
    } finally {
      const currentButton = documentRef.getElementById('weeklyAdminAddRollsBtn');
      if (currentButton) currentButton.disabled = false;
    }
  }
  function setup() {
    documentRef.addEventListener('click', event => {
      const claimButton = event.target.closest('[data-weekly-claim]');
      if (claimButton) claim(Number(claimButton.dataset.weeklyClaim));
      const adminButton = event.target.closest('#weeklyAdminAddRollsBtn');
      if (adminButton) addAdminRolls();
    });
    render();
    refresh();
    timerManager.setInterval(refresh, 600000, 'weekly-realm-event-refresh');
  }
  return { setup, refresh, recordRoll };
}
