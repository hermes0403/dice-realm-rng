/** Signed-in player presence and profile heartbeat. */
export function createPresenceService(dependencies) {
  const {
    supabaseClient, getCurrentUser, getState, totalUnique,
    achievementStats, applyPendingGrants, syncCloudSave,
    timerManager, isCloudSyncBlocked = () => false, markCloudSyncBlocked = () => false
  } = dependencies;
  let heartbeatBusy = false;

  function stopHeartbeatWhenRestricted() {
    if (!isCloudSyncBlocked()) return false;
    timerManager?.clearScope?.('presence-heartbeat');
    return true;
  }

  async function heartbeat() {
    if (stopHeartbeatWhenRestricted() || heartbeatBusy || !getCurrentUser() || !supabaseClient) return;
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

      const grantChanged = await applyPendingGrants();
      if (stopHeartbeatWhenRestricted()) return;
      if (grantChanged) await syncCloudSave();
      stopHeartbeatWhenRestricted();
    } catch (error) {
      const restricted = markCloudSyncBlocked(error);
      if (restricted || isCloudSyncBlocked()) {
        timerManager?.clearScope?.('presence-heartbeat');
      }
      console.debug('Presence update skipped', error);
    } finally {
      heartbeatBusy = false;
    }
  }

  return { heartbeat };
}
