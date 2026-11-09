import { VISITOR_KEY } from '../config.js';

/** Anonymous/browser and signed-in visit event tracking. */
export function createVisitTrackingService({ getCurrentUser, getState, supabaseClient, timerManager, isCloudSyncBlocked = () => false, markCloudSyncBlocked = () => false }) {
  let eventBusy = false;
  let lastEventAt = 0;
  let visitTrackingStarted = false;
  let visibilityChangeHandler = null;

  function getVisitorId() {
    try {
      let id = localStorage.getItem(VISITOR_KEY);
      if (!id) {
        id = globalThis.crypto?.randomUUID
          ? globalThis.crypto.randomUUID()
          : 'v-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
        localStorage.setItem(VISITOR_KEY, id);
      }
      return id;
    } catch {
      return 'session-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
  }

  function stopWhenRestricted() {
    if (!isCloudSyncBlocked()) return false;
    stopGameVisitTracking();
    return true;
  }

  async function recordGameVisit(eventType = 'heartbeat') {
    if (stopWhenRestricted() || !supabaseClient || eventBusy) return;
    const now = Date.now();
    if (eventType === 'heartbeat' && now - lastEventAt < 240000) return;
    eventBusy = true;
    try {
      const user = getCurrentUser();
      const S = getState();
      const userId = user?.id || null;
      const visitorId = 'browser:' + getVisitorId();
      const row = {
        visitor_id: visitorId,
        user_id: userId,
        username: userId ? String(S.name || '玩家').slice(0, 20) : null,
        event_type: eventType,
        occurred_at: new Date().toISOString()
      };
      const { error } = await supabaseClient.from('game_visit_events').insert(row);
      if (error) throw error;
      lastEventAt = now;
    } catch (error) {
      const restricted = markCloudSyncBlocked(error);
      if (restricted || isCloudSyncBlocked()) stopGameVisitTracking();
      console.debug('Visit tracking skipped', error);
    } finally {
      eventBusy = false;
    }
  }

  function startGameVisitTracking() {
    if (isCloudSyncBlocked() || visitTrackingStarted) return false;
    visitTrackingStarted = true;
    recordGameVisit('visit');
    timerManager.clearScope('visit-tracking');
    timerManager.setInterval(() => recordGameVisit('heartbeat'), 5 * 60 * 1000, 'visit-tracking');
    visibilityChangeHandler = () => {
      if (!document.hidden) recordGameVisit('visible');
    };
    document.addEventListener('visibilitychange', visibilityChangeHandler);
    return true;
  }

  function stopGameVisitTracking() {
    if (!visitTrackingStarted) return false;
    timerManager.clearScope('visit-tracking');
    if (visibilityChangeHandler) document.removeEventListener('visibilitychange', visibilityChangeHandler);
    visibilityChangeHandler = null;
    visitTrackingStarted = false;
    return true;
  }

  return { recordGameVisit, startGameVisitTracking, stopGameVisitTracking };
}
