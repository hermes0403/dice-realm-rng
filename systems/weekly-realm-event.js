/** Claim-only handler for the completed weekly realm campaign.
 * The campaign panel and roll tracking are retired; checking progress on login
 * still lets eligible accounts receive any milestone rewards they have not claimed.
 */
const number = value => new Intl.NumberFormat('en-US').format(Math.max(0, Number(value) || 0));
const safeText = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));

export function createWeeklyRealmEvent({ supabaseClient, getCurrentUser, documentRef, toast, onRewardClaimed = () => {} }) {
  let refreshing = false;

  function showRewardPopup(rewards) {
    if (!Array.isArray(rewards) || !rewards.length) return;
    const modal = documentRef?.getElementById('weeklyRewardOverlay');
    const list = documentRef?.getElementById('weeklyRewardItems');
    const subtitle = documentRef?.getElementById('weeklyRewardSubtitle');
    if (!modal || !list) { toast?.('全服活動獎勵已自動發放！'); return; }
    list.innerHTML = rewards.map(item =>
      '<div class="weekly-reward-popup-row"><span class="weekly-reward-popup-check">✓</span><div><b>' +
      number(item.milestone) + ' 抽達成</b><span>' + safeText(item.reward) + '</span></div></div>'
    ).join('');
    if (subtitle) subtitle.textContent = '獎勵已存入你的雲端背包';
    modal.hidden = false;
  }

  function closeRewardPopup() {
    const modal = documentRef?.getElementById('weeklyRewardOverlay');
    if (modal) modal.hidden = true;
  }

  async function refresh() {
    const user = getCurrentUser();
    if (!supabaseClient || !user?.id || refreshing) return;
    refreshing = true;
    try {
      const { data, error } = await supabaseClient.rpc('get_weekly_realm_progress');
      if (error) throw error;
      if (Array.isArray(data?.new_rewards) && data.new_rewards.length) {
        try { await onRewardClaimed(); }
        catch (loadError) { console.warn('全服獎勵存檔重新載入失敗', loadError); }
        showRewardPopup(data.new_rewards);
      }
    } catch (error) {
      console.warn('全服活動補領檢查失敗', error);
    } finally {
      refreshing = false;
    }
  }

  function setup() {
    documentRef?.addEventListener('click', event => {
      if (event.target.closest('[data-weekly-reward-close]') || event.target.id === 'weeklyRewardOverlay') closeRewardPopup();
    });
    refresh();
  }

  // Keep the dice-system callback compatible; the completed campaign no longer counts rolls.
  function recordRoll() {}

  return { setup, refresh, recordRoll };
}
