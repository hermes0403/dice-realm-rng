/** Reads the effective personal/global coin multiplier from the admin API. */
export function createCoinBoostService({
  getCurrentUser,
  supabaseClient,
  SUPABASE_URL,
  SUPABASE_KEY,
  fetchRef = globalThis.fetch,
  now = () => Date.now(),
  cacheMs = 60 * 1000,
  failureCooldownMs = 30 * 1000,
  isCloudSyncBlocked = () => false,
  markCloudSyncBlocked = () => false
}) {
  let activeCoinBoosts = { global: null, personal: null, lastFetch: 0 };
  let refreshBusy = false;
  let lastFailedAt = 0;
  let lastFetchedUserId = null;

  function coinEarningMultiplier() {
    const now = Date.now();
    const { global, personal } = activeCoinBoosts;
    let multiplier = 1;
    if (global && Number(global.expires_at) > now) multiplier = Math.max(multiplier, Number(global.multiplier) || 1);
    if (personal && Number(personal.expires_at) > now) multiplier = Math.max(multiplier, Number(personal.multiplier) || 1);
    return Math.max(1, Math.min(1000, multiplier));
  }

  function activeGlobalCoinBoost() {
    const boost = activeCoinBoosts.global;
    if (!boost || Number(boost.expires_at) <= Date.now()) return null;
    const multiplier = Number(boost.multiplier) || 1;
    if (multiplier <= 1) return null;
    return { multiplier, expires_at: Number(boost.expires_at) };
  }

  async function refreshCoinBoosts(force = false) {
    const user = getCurrentUser();
    if (!user || !supabaseClient) {
      if (!user && lastFetchedUserId) {
        activeCoinBoosts = { global: null, personal: null, lastFetch: 0 };
        lastFetchedUserId = null;
        lastFailedAt = 0;
      }
      return false;
    }
    if (lastFetchedUserId !== user.id) {
      activeCoinBoosts = { global: null, personal: null, lastFetch: 0 };
      lastFetchedUserId = user.id;
      lastFailedAt = 0;
    }
    if (isCloudSyncBlocked() || refreshBusy) return false;
    const currentTime = now();
    if (!force && activeCoinBoosts.lastFetch && currentTime - activeCoinBoosts.lastFetch < cacheMs) return false;
    if (!force && lastFailedAt && currentTime - lastFailedAt < failureCooldownMs) return false;
    refreshBusy = true;
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (getCurrentUser()?.id !== user.id) return false;
      if (!session?.access_token) {
        lastFailedAt = now();
        return false;
      }
      const response = await fetchRef(`${SUPABASE_URL}/functions/v1/dice-rng-admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ action: 'coin_boost_status' })
      });
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(data.error || `讀取倍率失敗（HTTP ${response.status}）`);
        error.status = response.status;
        throw error;
      }
      if (getCurrentUser()?.id !== user.id) return false;
      activeCoinBoosts = { global: data.global || null, personal: data.personal || null, lastFetch: now() };
      lastFailedAt = 0;
      return true;
    } catch (error) {
      lastFailedAt = now();
      markCloudSyncBlocked(error);
      console.warn('Coin boost refresh failed', error);
      return false;
    } finally {
      refreshBusy = false;
    }
  }

  return { coinEarningMultiplier, refreshCoinBoosts, activeGlobalCoinBoost };
}
