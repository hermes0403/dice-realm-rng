/** Shared per-die lock bookkeeping for inventory, selling, and pet fusion. */
export function lockedDiceIndexes(state, diceId) {
  const count = Math.max(0, Math.floor(Number(state?.bag?.[diceId]) || 0));
  const prefix = String(diceId) + ':';
  const indexes = new Set();
  for (const key of Array.isArray(state?.lockedDice) ? state.lockedDice : []) {
    if (typeof key !== 'string' || !key.startsWith(prefix)) continue;
    const index = Number(key.slice(prefix.length));
    if (Number.isInteger(index) && index >= 0 && index < count) indexes.add(index);
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
  state.lockedDice = Array.isArray(state.lockedDice) ? state.lockedDice : [];
  const prefix = String(diceId) + ':';
  const initialCount = Math.max(0, Math.floor(Number(state.bag[diceId]) || 0));
  state.lockedDice = state.lockedDice.filter(key => {
    if (typeof key !== 'string' || !key.startsWith(prefix)) return true;
    const index = Number(key.slice(prefix.length));
    return Number.isInteger(index) && index >= 0 && index < initialCount;
  });
  for (let n = 0; n < requested; n++) {
    const count = Math.max(0, Math.floor(Number(state.bag?.[diceId]) || 0));
    const locked = lockedDiceIndexes(state, diceId);
    let removeIndex = count - 1;
    while (removeIndex >= 0 && locked.has(removeIndex)) removeIndex--;
    if (removeIndex < 0) return false;
    state.lockedDice = state.lockedDice
      .filter(key => typeof key !== 'string' || !key.startsWith(prefix) || Number(key.slice(prefix.length)) !== removeIndex)
      .map(key => {
        if (typeof key !== 'string' || !key.startsWith(prefix)) return key;
        const index = Number(key.slice(prefix.length));
        return Number.isInteger(index) && index > removeIndex ? prefix + (index - 1) : key;
      });
    const nextCount = count - 1;
    if (nextCount > 0) state.bag[diceId] = nextCount;
    else delete state.bag[diceId];
  }
  return true;
}
