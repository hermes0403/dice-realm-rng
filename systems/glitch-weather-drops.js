const GLITCH_DROP_RULES = [
  { id: 'angel1', chance: 0.001, fallbackName: '天堂藥水 I' },
  { id: 'luck1', chance: 0.002, fallbackName: '運氣藥水 I' }
];

const DROP_LOCK_PREFIX = 'dice-realm-glitch-potion-drop:';
const DROP_SECOND_PREFIX = 'diceRealmGlitchPotionDropSecondV1_';

/**
 * Grants existing potion items while the shared Glitch weather is active.
 * The one-second timer is local only; Web Locks + localStorage coordinate tabs.
 * Cloud save is requested only when an item is actually awarded.
 */
export function createGlitchWeatherDropSystem(dependencies) {
  const {
    getState,
    getCurrentUser,
    getWeather,
    isReady = () => true,
    POTIONS = [],
    save,
    render,
    toast,
    timerManager,
    navigatorRef = globalThis.navigator,
    localStorageRef = globalThis.localStorage,
    random = Math.random,
    now = () => Date.now()
  } = dependencies;

  let interval = null;
  let tickBusy = false;
  let unsupportedLocksWarned = false;
  const lastProcessedSecondByUser = new Map();

  function isGlitchWeatherActive() {
    const weather = getWeather?.() || {};
    const types = Array.isArray(weather.types) ? weather.types : [weather.type];
    const until = Number(
      weather.untilByType?.glitch ?? weather.glitchUntil ?? weather.until
    ) || 0;
    return types.includes('glitch') && until > now();
  }

  function awardForCurrentSecond() {
    const successfulDrops = GLITCH_DROP_RULES.filter(rule => random() < rule.chance);
    if (!successfulDrops.length) return false;

    const state = getState();
    if (!state || typeof state !== 'object') return false;
    state.potions = state.potions && typeof state.potions === 'object'
      ? state.potions
      : {};
    state.potions.inventory = state.potions.inventory && typeof state.potions.inventory === 'object'
      ? state.potions.inventory
      : {};

    const inventory = state.potions.inventory;
    const previousCounts = new Map();
    for (const rule of successfulDrops) {
      previousCounts.set(rule.id, inventory[rule.id]);
      inventory[rule.id] = Math.max(0, Math.floor(Number(inventory[rule.id]) || 0)) + 1;
    }

    try {
      save();
    } catch (error) {
      for (const [id, previous] of previousCounts) {
        if (previous === undefined) delete inventory[id];
        else inventory[id] = previous;
      }
      console.warn('Glitch weather potion save failed', error);
      return false;
    }

    try {
      render();
    } catch (error) {
      console.warn('Glitch weather potion render failed', error);
    }

    const names = successfulDrops.map(rule =>
      POTIONS.find(potion => potion.id === rule.id)?.name || rule.fallbackName
    );
    toast('故障天氣獎勵：' + names.join('、'));
    return true;
  }

  async function tick() {
    if (tickBusy) return false;
    const user = getCurrentUser();
    if (!user?.id || !isReady(user.id) || navigatorRef?.onLine === false || !isGlitchWeatherActive()) {
      return false;
    }

    const second = Math.floor(now() / 1000);
    if (lastProcessedSecondByUser.get(user.id) === second) return false;

    const locks = navigatorRef?.locks;
    if (typeof locks?.request !== 'function') {
      if (!unsupportedLocksWarned) {
        unsupportedLocksWarned = true;
        console.warn('Glitch weather potion drops paused: Web Locks API is unavailable.');
      }
      return false;
    }
    if (typeof localStorageRef?.getItem !== 'function' || typeof localStorageRef?.setItem !== 'function') {
      return false;
    }

    tickBusy = true;
    let awarded = false;
    try {
      await locks.request(
        DROP_LOCK_PREFIX + user.id,
        { mode: 'exclusive', ifAvailable: true },
        lock => {
          if (!lock) return;
          const currentUser = getCurrentUser();
          if (
            currentUser?.id !== user.id
            || !isReady(user.id)
            || navigatorRef?.onLine === false
            || !isGlitchWeatherActive()
          ) return;

          const currentSecond = Math.floor(now() / 1000);
          // A delayed callback must never catch up for a missed second.
          if (currentSecond !== second) return;
          if (lastProcessedSecondByUser.get(user.id) === currentSecond) return;

          const storageKey = DROP_SECOND_PREFIX + user.id;
          let storedSecond = 0;
          try {
            storedSecond = Number(localStorageRef.getItem(storageKey)) || 0;
          } catch {
            return;
          }
          if (storedSecond >= currentSecond) {
            lastProcessedSecondByUser.set(user.id, currentSecond);
            return;
          }
          try {
            localStorageRef.setItem(storageKey, String(currentSecond));
          } catch {
            return;
          }

          lastProcessedSecondByUser.set(user.id, currentSecond);
          awarded = awardForCurrentSecond();
        }
      );
    } catch (error) {
      console.warn('Glitch weather potion tick skipped', error);
    } finally {
      tickBusy = false;
    }
    return awarded;
  }

  function start() {
    if (interval !== null || typeof timerManager?.setInterval !== 'function') return false;
    interval = timerManager.setInterval(() => { void tick(); }, 1000, 'glitch-weather-potion-drops');
    return true;
  }

  function stop() {
    if (interval === null) return false;
    timerManager.clearInterval(interval);
    interval = null;
    return true;
  }

  return { start, stop, tick, isRunning: () => interval !== null };
}
