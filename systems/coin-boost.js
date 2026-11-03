/** Normalize ISO timestamps and Unix seconds/milliseconds to epoch milliseconds. */
export function timestampToMs(value) {
  if (value == null || value === '') return NaN;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value).trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const numeric = Number(text);
    return numeric < 1e11 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : NaN;
}

/** Reads the effective personal/global coin multiplier from the admin API. */
export function createCoinBoostService({ getCurrentUser, supabaseClient, SUPABASE_URL, SUPABASE_KEY }) {
  let activeCoinBoosts = { global: null, personal: null, lastFetch: 0 };
  let refreshBusy = false;

  function coinEarningMultiplier() {
    const now = Date.now();
    const { global, personal } = activeCoinBoosts;
    let multiplier = 1;
    if (global && timestampToMs(global.expires_at) > now) multiplier = Math.max(multiplier, Number(global.multiplier) || 1);
    if (personal && timestampToMs(personal.expires_at) > now) multiplier = Math.max(multiplier, Number(personal.multiplier) || 1);
    return Math.max(1, Math.min(1000, multiplier));
  }

  function activeGlobalCoinBoost() {
    const boost = activeCoinBoosts.global;
    const expiresAt = timestampToMs(boost?.expires_at);
    if (!boost || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
    const multiplier = Number(boost.multiplier) || 1;
    if (multiplier <= 1) return null;
    return { multiplier, expires_at: expiresAt };
  }

  async function refreshCoinBoosts(force = false) {
    if (refreshBusy || !getCurrentUser() || !supabaseClient) return false;
    if (!force && Date.now() - activeCoinBoosts.lastFetch < 5000) return;
    refreshBusy = true;
    activeCoinBoosts.lastFetch = Date.now();
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session?.access_token) return false;
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
      return true;
    } catch (error) {
      console.warn('Coin boost refresh failed', error);
      return false;
    } finally {
      refreshBusy = false;
    }
  }

  return { coinEarningMultiplier, refreshCoinBoosts, activeGlobalCoinBoost };
}
