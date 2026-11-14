/** Signed-in player presence and profile heartbeat. */
export const PRESENCE_HEARTBEAT_INTERVAL = 5 * 60 * 1000;
export const PRESENCE_ONLINE_WINDOW = 7 * 60 * 1000;

export function isPlayerOnline(lastSeen, now = Date.now()) {
  const timestamp = Date.parse(lastSeen || '');
  return Number.isFinite(timestamp) && timestamp > 0 && now >= timestamp
    && now - timestamp < PRESENCE_ONLINE_WINDOW;
}
export function createPresenceService(dependencies) {
  const {
    supabaseClient, getCurrentUser, getState, totalUnique,
    achievementStats, applyPendingGrants, scheduleSync
  } = dependencies;
  let heartbeatBusy = false;
  let lastHeartbeatAt = 0;
  const HEARTBEAT_INTERVAL = PRESENCE_HEARTBEAT_INTERVAL;

  async function heartbeat() {
    if (heartbeatBusy || !getCurrentUser() || !supabaseClient) return;
    if (Date.now() - lastHeartbeatAt < HEARTBEAT_INTERVAL) return;
    heartbeatBusy = true;
    const user = getCurrentUser();
    try {
      const state = getState();
      const now = new Date().toISOString();
      const { error } = await supabaseClient.from('player_profiles').upsert({
        user_id: user.id,
        username: (state.name || '旅人').trim().slice(0, 20) || '旅人',
        total_rolls: Number(state.rolls) || 0,
        unique_dice: totalUnique(),
        rarest_den: Number(state.best?.den) || 0,
        coins: Number(state.coins) || 0,
        ...achievementStats(),
        last_seen: now,
        updated_at: now
      }, { onConflict: 'user_id' });
      if (error) throw error;
      lastHeartbeatAt = Date.now();
      const grantChanged = await applyPendingGrants();
      if (grantChanged) scheduleSync();
    } catch (error) {
      console.debug('Presence update skipped', error);
    } finally {
      heartbeatBusy = false;
    }
  }

  return { heartbeat };
}
