/** Passive income calculation and ticking for equipped pets. */
export function createPetIncomeSystem({
  getState,
  getCurrentUser,
  PET_MUTATIONS,
  petBaseIncome,
  petWeightSkillMultiplier,
  coinEarningMultiplier,
  format,
  formatWalletScientific,
  KEY,
  refreshCoinBoosts,
  save,
  timerManager
}) {
  let lastTick = Date.now();
  let saveCounter = 0;

  function petIncomeMultiplier(pet) {
    const legacy = petWeightSkillMultiplier(pet?.kg) + (PET_MUTATIONS[pet?.mutation]?.multiplier || 0);
    const variant = pet?.variant === 'golden' ? 1.2 : pet?.variant === 'diamond' ? 1.6 : pet?.variant === 'rainbow' ? 2 : 1;
    return legacy * variant;
  }

  function rollPetVariant() {
    const n = Math.random() * 100;
    if (n < 0.1) return 'rainbow';
    if (n < 1.1) return 'diamond';
    if (n < 5) return 'golden';
    return null;
  }

  function petIncomePerSecond(pet) {
    return Math.floor(petBaseIncome(pet) * petIncomeMultiplier(pet));
  }

  function equippedPetIncomePerSecond() {
    const S = getState();
    const equipped = new Set(Array.isArray(S.equippedPetUids) ? S.equippedPetUids : []);
    return (Array.isArray(S.pets) ? S.pets : [])
      .filter(pet => equipped.has(pet.uid))
      .reduce((sum, pet) => sum + petIncomePerSecond(pet), 0);
  }

  function renderPetIncome() {
    const S = getState();
    const multiplier = coinEarningMultiplier();
    const rate = Math.floor(equippedPetIncomePerSecond() * multiplier);
    const income = document.getElementById('petIncomeRate');
    if (income) income.textContent = `+${format(rate)}$/秒${multiplier > 1 ? `（${multiplier}倍）` : ''}`;
    const count = document.getElementById('petIncomeEquipped');
    if (count) count.textContent = `目前裝備 ${Math.min(3, (S.equippedPetUids || []).length)}/3 隻`;
  }

  timerManager.setInterval(() => {
    refreshCoinBoosts();
    const S = getState();
    const now = Date.now();
    const elapsed = Math.max(0, Math.min(5, (now - lastTick) / 1000));
    if (!getCurrentUser()) {
      lastTick = now;
      return;
    }
    lastTick = now;
    const rate = equippedPetIncomePerSecond();
    const currentCoins = Number(S.coins) || 0;
    if (!Number.isSafeInteger(currentCoins) || currentCoins < 0) {
      const income = document.getElementById('petIncomeRate');
      if (income) income.textContent = '收益暫停（金額異常）';
      return;
    }
    if (rate > 0 && elapsed > 0) {
      const earned = Math.floor(rate * elapsed * coinEarningMultiplier());
      if (earned > 0 && Number.isSafeInteger(currentCoins + earned)) {
        S.coins = currentCoins + earned;
        S.petIncomePending = (Number(S.petIncomePending) || 0) + earned;
        S.quest = S.quest || {};
        S.quest.coinsEarned = (Number(S.quest.coinsEarned) || 0) + earned;
        try {
          localStorage.setItem(KEY, JSON.stringify(S));
        } catch (error) {
          console.warn('本機收益暫存失敗', error);
        }
      }
      const balance = document.getElementById('coinBalance');
      if (balance) balance.textContent = formatWalletScientific(S.coins);
      const income = document.getElementById('petIncomeRate');
      const multiplier = coinEarningMultiplier();
      if (income) income.textContent = `+${format(Math.floor(rate * multiplier))}$/秒${multiplier > 1 ? `（${multiplier}倍）` : ''}`;
      saveCounter += elapsed;
      if (saveCounter >= 60) {
        saveCounter = 0;
        save();
      }
    }
  }, 1000, 'pet-income');

  return { petIncomeMultiplier, rollPetVariant, petIncomePerSecond, equippedPetIncomePerSecond, renderPetIncome };
}
