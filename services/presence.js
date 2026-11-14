/** Signed-in player presence heartbeat. Profile statistics are written by the save RPC only. */
export function createPresenceService(dependencies) {
  const { supabaseClient, getCurrentUser, applyPendingGrants, scheduleSync } = dependencies;
  let heartbeatBusy = false;
  let lastHeartbeatAt = 0;
  const HEARTBEAT_INTERVAL = 60000;

  async function heartbeat() {
    if (heartbeatBusy || !getCurrentUser() || !supabaseClient) return;
    if (Date.now() - lastHeartbeatAt < HEARTBEAT_INTERVAL) return;
    heartbeatBusy = true;
    const user = getCurrentUser();
    try {
      const { error } = await supabaseClient.rpc('touch_player_presence');
      if (error) throw error;
      if (getCurrentUser()?.id !== user.id) return;
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
