/** Reads the effective personal/global coin multiplier from the admin API. */
export function createCoinBoostService({ getCurrentUser, supabaseClient, SUPABASE_URL, SUPABASE_KEY }) {
  let activeCoinBoosts = { global: null, personal: null, lastFetch: 0 };
  let refreshBusy = false;

  function coinEarningMultiplier() {
    const now = Date.now();
    const { global, personal } = activeCoinBoosts;
    let multiplier = 1;
    if (global && Number(global.expires_at) > now) multiplier = Math.max(multiplier, Number(global.multiplier) || 1);
    if (personal && Number(personal.expires_at) > now) multiplier = Math.max(multiplier, Number(personal.multiplier) || 1);
    return Math.max(1, Math.min(1000, multiplier));
  }

  async function refreshCoinBoosts(force = false) {
    if (refreshBusy || !getCurrentUser() || !supabaseClient) return;
    if (!force && Date.now() - activeCoinBoosts.lastFetch < 5000) return;
    refreshBusy = true;
    activeCoinBoosts.lastFetch = Date.now();
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session?.access_token) return;
      const response = await fetch(`${SUPABASE_URL}/functions/v1/dice-rng-admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ action: 'coin_boost_status' })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '讀取倍率失敗');
      activeCoinBoosts = { global: data.global || null, personal: data.personal || null, lastFetch: Date.now() };
    } catch (error) {
      console.warn('Coin boost refresh failed', error);
    } finally {
      refreshBusy = false;
    }
  }

  return { coinEarningMultiplier, refreshCoinBoosts };
}
