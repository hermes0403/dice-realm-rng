/** Shared per-die lock bookkeeping for inventory, selling, and pet fusion. */

/** Remove malformed, duplicate, and out-of-range lock indexes before they can attach to future dice. */
export function normalizeLockedDice(state) {
  if (!state || typeof state !== 'object') return [];
  const bag = state.bag && typeof state.bag === 'object' ? state.bag : {};
  const valid = new Set();
  for (const key of Array.isArray(state.lockedDice) ? state.lockedDice : []) {
    if (typeof key !== 'string') continue;
    const separator = key.lastIndexOf(':');
    if (separator <= 0) continue;
    const diceId = key.slice(0, separator);
    const indexText = key.slice(separator + 1);
    if (!/^\d+$/.test(indexText)) continue;
    const index = Number(indexText);
    const count = Math.max(0, Math.floor(Number(bag[diceId]) || 0));
    if (Number.isSafeInteger(index) && index >= 0 && index < count) valid.add(diceId + ':' + index);
  }
  state.lockedDice = [...valid];
  return state.lockedDice;
}

/** Add copies only after stale indexes are removed, so a new copy cannot inherit an old star. */
export function addDiceToBag(state, diceId, amount = 1) {
  const added = Math.max(0, Math.floor(Number(amount) || 0));
  if (!state || !diceId || added < 1) return false;
  state.bag = state.bag && typeof state.bag === 'object' ? state.bag : {};
  normalizeLockedDice(state);
  state.bag[diceId] = Math.max(0, Math.floor(Number(state.bag[diceId]) || 0)) + added;
  return true;
}

export function lockedDiceIndexes(state, diceId) {
  normalizeLockedDice(state);
  const prefix = String(diceId) + ':';
  const indexes = new Set();
  for (const key of Array.isArray(state?.lockedDice) ? state.lockedDice : []) {
    if (!key.startsWith(prefix)) continue;
    const index = Number(key.slice(prefix.length));
    if (Number.isInteger(index) && index >= 0) indexes.add(index);
  }
  return indexes;
}

export function unlockedDiceCount(state, diceId) {
  const count = Math.max(0, Math.floor(Number(state?.bag?.[diceId]) || 0));
  return Math.max(0, count - lockedDiceIndexes(state, diceId).size);
}

/** Consume only unlocked copies, compacting lock indexes so locks stay on the same dice. */
export function consumeUnlockedDice(state, diceId, amount = 1) {
  const requested = Math.max(0, Math.floor(Number(amount) || 0));
  if (!state || requested < 1 || unlockedDiceCount(state, diceId) < requested) return false;
  state.bag = state.bag || {};
  normalizeLockedDice(state);
  const prefix = String(diceId) + ':';
  for (let n = 0; n < requested; n++) {
    const count = Math.max(0, Math.floor(Number(state.bag?.[diceId]) || 0));
    const locked = lockedDiceIndexes(state, diceId);
    let removeIndex = count - 1;
    while (removeIndex >= 0 && locked.has(removeIndex)) removeIndex--;
    if (removeIndex < 0) return false;
    state.lockedDice = state.lockedDice
      .filter(key => key !== prefix + removeIndex)
      .map(key => {
        if (!key.startsWith(prefix)) return key;
        const index = Number(key.slice(prefix.length));
        return Number.isInteger(index) && index > removeIndex ? prefix + (index - 1) : key;
      });
    const nextCount = count - 1;
    if (nextCount > 0) state.bag[diceId] = nextCount;
    else delete state.bag[diceId];
  }
  normalizeLockedDice(state);
  return true;
}
