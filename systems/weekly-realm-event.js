/** Weekly realm roll challenge. Local rolls are buffered and synced once every ten minutes. */
const CAMPAIGN_START = '2026-11-16';
const MILESTONES = [
  { target: 50000, icons: '🪙', reward: '1M$' },
  { target: 150000, icons: '✦', reward: '幸運藥水 III ×1' },
  { target: 300000, icons: '💨 🪙', reward: '速度藥水 I ×5 · 100M$' },
  { target: 500000, icons: '🌪️ ⚗️', reward: '速度藥水 II ×5 · 運氣藥水 II ×5' },
  { target: 800000, icons: '🌌 🪙', reward: '天堂藥水 II ×1 · 100M$' }
];
const number = value => new Intl.NumberFormat('en-US').format(Math.max(0, Number(value) || 0));
export function createWeeklyRealmEvent({ supabaseClient, getCurrentUser, localStorageRef, timerManager, documentRef, toast, onRewardClaimed = () => {} }) {
  let progress = { total_rolls: 0, claimed_milestones: [] };
  let refreshing = false;
  const pendingKey = () => { const user = getCurrentUser(); return user?.id ? 'diceRealmWeeklyPending:' + user.id + ':' + CAMPAIGN_START : ''; };
  function readPending() { const key = pendingKey(); if (!key) return 0; try { return Math.max(0, Number(localStorageRef.getItem(key)) || 0); } catch { return 0; } }
  function writePending(value) { const key = pendingKey(); if (!key) return; try { if (value > 0) localStorageRef.setItem(key, String(Math.floor(value))); else localStorageRef.removeItem(key); } catch {} }
  function recordRoll() { if (getCurrentUser()?.id) writePending(readPending() + 1); }
  function render() {
    const total = Math.max(0, Number(progress.total_rolls) || 0);
    const next = MILESTONES.find(item => total < item.target) || MILESTONES[MILESTONES.length - 1];
    const percent = Math.min(100, total / next.target * 100);
    const count = documentRef.getElementById('weeklyRollCount');
    const targetNode = documentRef.getElementById('weeklyRollTarget');
    const bar = documentRef.getElementById('weeklyRollProgressBar');
    const remaining = documentRef.getElementById('weeklyRollRemaining');
    const percentNode = documentRef.getElementById('weeklyRollPercent');
    if (count) count.textContent = number(total);
    if (targetNode) targetNode.textContent = '/ ' + number(next.target) + ' 抽';
    if (bar) bar.style.width = percent + '%';
    if (remaining) remaining.textContent = total >= 800000 ? '全服已完成全部階段！' : '距離下一階段還差 ' + number(next.target - total) + ' 抽';
    if (percentNode) percentNode.textContent = percent.toFixed(1) + '%';
    const claimed = new Set((progress.claimed_milestones || []).map(Number));
    const track = documentRef.getElementById('weeklyRewardTrack');
    if (track) track.innerHTML = MILESTONES.map(item => {
      const reached = total >= item.target, isClaimed = claimed.has(item.target);
      const status = isClaimed ? '已領取' : reached ? '可領取' : '尚未達成';
      const button = isClaimed ? '<button type="button" disabled>已領取</button>' : reached
        ? '<button type="button" class="primary" data-weekly-claim="' + item.target + '">領取獎勵</button>'
        : '<button type="button" disabled>未達成</button>';
      return '<article class="weekly-reward-card' + (isClaimed ? ' is-claimed' : reached ? ' is-reached' : '') + '"><div class="weekly-reward-threshold">' + number(item.target) + ' 抽</div><div class="weekly-reward-icons" aria-label="' + item.reward + '">' + item.icons + '</div><span class="weekly-reward-status">' + status + '</span>' + button + '</article>';
    }).join('');
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
  function setup() {
    documentRef.addEventListener('click', event => { const button = event.target.closest('[data-weekly-claim]'); if (button) claim(Number(button.dataset.weeklyClaim)); });
    render();
    refresh();
    timerManager.setInterval(refresh, 600000, 'weekly-realm-event-refresh');
  }
  return { setup, refresh, recordRoll };
}
