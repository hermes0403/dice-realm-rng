import { DEVICE_LOCK_KEY } from '../config.js';

// Only actions that spend, earn, craft, equip, or otherwise mutate game progress
// require the single-device lock. Navigation, account, admin, and display controls
// deliberately stay outside this allowlist.
const GAME_ACTION_SELECTOR = [
  '#rollBtn',
  '#autoBtn',
  '#sellSelectedDiceBtn',
  '#upgradeBagBtn',
  '[data-glove-action]',
  '[data-craft]',
  '[data-equip]',
  '[data-craft-potion]',
  '[data-use-potion]',
  '[data-weather-deposit]',
  '#weatherConvertBtn',
  '#summonWeatherBtn',
  '#petAutoEquipBestBtn',
  '[data-pet-equip]',
  '#petDiceCraftBtn',
  '#petSellConfirmBtn'
].join(',');

/** Browser-side adapter for the server-enforced single-device account lock. */
export function createDeviceLockService({ getCurrentUser, supabaseClient, toast, timerManager }) {
  let heartbeatTimer = null;
  let idleTimer = null;
  let lockRequest = null;
  let lockHeld = false;
  let heartbeatBusy = false;
  const replayedButtons = new WeakSet();

  function getDeviceLockId() {
    let id = localStorage.getItem(DEVICE_LOCK_KEY);
    if (!id) {
      id = 'dev_' + (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
      localStorage.setItem(DEVICE_LOCK_KEY, id);
    }
    return id;
  }

  const deviceId = getDeviceLockId();

  function stopHeartbeat() {
    timerManager.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  function scheduleUnlock(user) {
    timerManager.clearTimeout(idleTimer);
    idleTimer = timerManager.setTimeout(async () => {
      idleTimer = null;
      const currentUser = getCurrentUser();
      if (!currentUser || currentUser.id !== user.id || !lockHeld) return;
      stopHeartbeat();
      lockHeld = false;
      try {
        await supabaseClient.rpc('release_account_device_lock', { p_device_id: deviceId });
      } catch (error) {
        console.warn('idle device lock release', error);
      }
    }, 90000, 'device-lock-idle-unlock');
  }

  async function acquireDeviceLock(user) {
    if (!user || !supabaseClient) return false;
    if (lockHeld) {
      scheduleUnlock(user);
      return true;
    }
    if (lockRequest) return lockRequest;
    lockRequest = (async () => {
      let result;
      try {
        let acquireTimeout;
        try {
          result = await Promise.race([
            supabaseClient.rpc('acquire_account_device_lock', { p_device_id: deviceId }),
            new Promise(resolve => {
              acquireTimeout = timerManager.setTimeout(
                () => resolve({ data: null, error: { message: '裝置鎖定連線逾時（12 秒）' } }),
                12000,
                'device-lock-acquire-timeout'
              );
            })
          ]);
        } finally {
          timerManager.clearTimeout(acquireTimeout);
        }
      } catch (error) {
        result = { data: null, error };
      }
      const { data, error } = result || {};
      if (error) {
        console.error('device lock acquire failed', error);
        toast('無法確認裝置鎖定：' + (error.message || '連線失敗'));
        return false;
      }
      if (data !== true) {
        toast('此帳號目前正在另一台裝置操作，請稍後再試（原裝置停止操作 90 秒後會自動釋放）。');
        return false;
      }
      lockHeld = true;
      stopHeartbeat();
      heartbeatTimer = timerManager.setInterval(async () => {
        if (heartbeatBusy) return;
        const currentUser = getCurrentUser();
        if (!currentUser || currentUser.id !== user.id || !lockHeld) {
          stopHeartbeat();
          return;
        }
        heartbeatBusy = true;
        try {
          const { data, error } = await supabaseClient.rpc('heartbeat_account_device_lock', { p_device_id: deviceId });
          if (error || data !== true) {
            stopHeartbeat();
            lockHeld = false;
            timerManager.clearTimeout(idleTimer);
            toast('裝置鎖定已失效，請重新操作以重新取得鎖定。');
          }
        } catch (error) {
          console.warn('device lock heartbeat failed', error);
          stopHeartbeat();
          lockHeld = false;
          timerManager.clearTimeout(idleTimer);
          toast('裝置鎖定連線失敗，請重新操作以重新取得鎖定。');
        } finally {
          heartbeatBusy = false;
        }
      }, 25000, 'device-lock-heartbeat');
      scheduleUnlock(user);
      return true;
    })();
    try {
      return await lockRequest;
    } finally {
      lockRequest = null;
    }
  }

  async function releaseDeviceLock(userId) {
    stopHeartbeat();
    timerManager.clearTimeout(idleTimer);
    idleTimer = null;
    lockHeld = false;
    if (!userId || !supabaseClient) return;
    try {
      await supabaseClient.rpc('release_account_device_lock', { p_device_id: deviceId });
    } catch (error) {
      console.warn('device lock release', error);
    }
  }

  function getGameActionTarget(eventTarget) {
    const target = eventTarget?.closest?.(GAME_ACTION_SELECTOR);
    if (!target) return null;

    // The inventory button also enters/exits selection mode. Only the click that
    // confirms a non-empty sale is a game action; selection itself is ordinary UI.
    if (target.id === 'sellSelectedDiceBtn') {
      const grid = document.getElementById('inventoryGrid');
      if (!grid?.classList.contains('sell-select-mode')
        || !grid.querySelector('input[data-sell-select]:checked')) return null;
    }
    return target;
  }

  // Capture only explicit game actions; ordinary UI clicks must never be blocked by the lock.
  document.addEventListener('click', async event => {
    const target = getGameActionTarget(event.target);
    const currentUser = getCurrentUser();
    if (!target || replayedButtons.has(target) || !currentUser || !supabaseClient) return;
    if (!lockHeld) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const acquired = await acquireDeviceLock(currentUser);
      if (acquired) {
        replayedButtons.add(target);
        target.click();
        replayedButtons.delete(target);
      }
      return;
    }
    scheduleUnlock(currentUser);
  }, true);

  window.addEventListener('pagehide', () => {
    if (getCurrentUser() && navigator.sendBeacon) {
      // The server-side lock expires safely if the browser cannot send an authenticated release.
    }
  });

  return {
    acquireDeviceLock,
    releaseDeviceLock,
    getDeviceLockId,
    isLockHeld: () => lockHeld,
    isHeartbeatActive: () => heartbeatTimer !== null,
    scheduleUnlock
  };
}
