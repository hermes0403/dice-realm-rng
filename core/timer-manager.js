/**
 * Central registry for application timers.
 *
 * Each caller can assign timers to a scope and later clear that scope without
 * needing to retain every native timer handle. The native timer functions are
 * injectable so lifecycle behavior can be tested without waiting on real time.
 */
export function createTimerManager({
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout
} = {}) {
  const timers = new Map();
  let nextId = 1;

  function normalizeScope(scope) {
    return typeof scope === 'string' && scope.trim() ? scope.trim() : 'default';
  }

  function register(type, callback, delay, scope, args) {
    if (typeof callback !== 'function') {
      throw new TypeError('Timer callback must be a function');
    }

    const id = nextId++;
    const entry = { id, type, scope: normalizeScope(scope), handle: null };
    const invoke = () => {
      if (type === 'timeout') timers.delete(id);
      callback(...args);
    };

    entry.handle = type === 'interval'
      ? setIntervalFn(invoke, delay)
      : setTimeoutFn(invoke, delay);
    timers.set(id, entry);
    return entry.handle;
  }

  function clear(type, handle) {
    let cleared = false;
    for (const [id, entry] of timers) {
      if (entry.type !== type || entry.handle !== handle) continue;
      timers.delete(id);
      if (type === 'interval') clearIntervalFn(entry.handle);
      else clearTimeoutFn(entry.handle);
      cleared = true;
    }
    return cleared;
  }

  function clearScope(scope) {
    const targetScope = normalizeScope(scope);
    let cleared = 0;
    for (const [id, entry] of timers) {
      if (entry.scope !== targetScope) continue;
      timers.delete(id);
      if (entry.type === 'interval') clearIntervalFn(entry.handle);
      else clearTimeoutFn(entry.handle);
      cleared++;
    }
    return cleared;
  }

  function clearAll() {
    let cleared = 0;
    for (const [id, entry] of timers) {
      timers.delete(id);
      if (entry.type === 'interval') clearIntervalFn(entry.handle);
      else clearTimeoutFn(entry.handle);
      cleared++;
    }
    return cleared;
  }

  function getStats() {
    const scopes = {};
    let intervals = 0;
    let timeouts = 0;

    for (const entry of timers.values()) {
      const scopeStats = scopes[entry.scope] || (scopes[entry.scope] = {
        intervals: 0,
        timeouts: 0,
        total: 0
      });
      scopeStats[entry.type === 'interval' ? 'intervals' : 'timeouts']++;
      scopeStats.total++;
      if (entry.type === 'interval') intervals++;
      else timeouts++;
    }

    return { total: timers.size, intervals, timeouts, scopes };
  }

  return {
    setInterval: (callback, delay, scope = 'default', ...args) =>
      register('interval', callback, delay, scope, args),
    setTimeout: (callback, delay, scope = 'default', ...args) =>
      register('timeout', callback, delay, scope, args),
    clearInterval: handle => clear('interval', handle),
    clearTimeout: handle => clear('timeout', handle),
    clearScope,
    clearAll,
    getStats
  };
}
