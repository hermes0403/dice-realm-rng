/** Main game-page render orchestration. Feature rendering remains in its UI modules. */
export function createMainRenderUI(dependencies) {
  const {
    getState, documentRef, updateWeatherUI, checkAchievements, save, format,
    totalUnique, luck, formatWalletScientific, totalDice, renderAutoDepositOptions,
    isRolling, isAutoRolling, bagUpgradeCost, renderAutoSellOptions,
    renderInventory, renderCodex, renderGloves, renderPotions, renderQuests, renderProfile, D
  } = dependencies;

  function render() {
    const S = getState();
    const petNav = documentRef.querySelector('[data-page="pets"]');
    const petPage = documentRef.getElementById('page-pets');
    if (petNav) petNav.hidden = false;
    if (petPage) petPage.hidden = false;
    updateWeatherUI();
    if (checkAchievements()) save();

    const tenthCount = (Number(S.rolls) || 0) % 10;
    const rollsLeft = 10 - tenthCount;
    const tenthProgress = documentRef.getElementById('tenthProgress');
    if (tenthProgress) {
      tenthProgress.classList.toggle('ready', rollsLeft === 1);
      documentRef.getElementById('tenthProgressLabel').textContent = rollsLeft === 1 ? '下一抽雙倍運氣！' : `再擲 ${rollsLeft} 次`;
      documentRef.getElementById('tenthProgressBar').style.width = (tenthCount * 10) + '%';
    }

    documentRef.getElementById('playerName').textContent = S.name;
    documentRef.getElementById('avatar').textContent = (S.name || '旅').slice(0, 1);
    documentRef.getElementById('totalRolls').textContent = format(S.rolls);
    documentRef.getElementById('uniqueCount').textContent = totalUnique() + ' / ' + D.length;
    documentRef.getElementById('luckStat').textContent = '+' + luck() + '%';
    documentRef.getElementById('coinBalance').textContent = formatWalletScientific(S.coins);
    documentRef.getElementById('bagTotal').textContent = totalDice() + ' / ' + (Number(S.bagCapacity) || 35);
    documentRef.getElementById('bagCapacity').textContent = totalDice() + ' / ' + (Number(S.bagCapacity) || 35) + ' 顆';

    renderAutoDepositOptions();
    documentRef.getElementById('rollBtn').disabled = isRolling() || totalDice() >= (Number(S.bagCapacity) || 35);
    documentRef.getElementById('autoBtn').disabled = totalDice() >= (Number(S.bagCapacity) || 35) || isAutoRolling();
    const capacity = Number(S.bagCapacity) || 35;
    const upgradeButton = documentRef.getElementById('upgradeBagBtn');
    upgradeButton.disabled = capacity >= 200 || Number(S.coins) < bagUpgradeCost(capacity);
    upgradeButton.textContent = capacity >= 200 ? '已達上限' : '擴充 +1 · ' + format(bagUpgradeCost(capacity)) + '$';
    documentRef.getElementById('bagUpgradeInfo').textContent = capacity >= 200
      ? '容量 ' + capacity + '/200，已達上限'
      : `容量 ${capacity}/200 · 下次擴充 ${format(bagUpgradeCost(capacity))}$`;

    const autoWeatherButton = documentRef.getElementById('autoDepositWeatherBtn');
    if (autoWeatherButton) {
      autoWeatherButton.textContent = '自動添加：' + (S.autoDepositWeatherEnabled ? '開啟' : '關閉');
      autoWeatherButton.setAttribute('aria-pressed', S.autoDepositWeatherEnabled ? 'true' : 'false');
      autoWeatherButton.classList.toggle('primary', !!S.autoDepositWeatherEnabled);
    }

    renderAutoSellOptions();
    renderInventory();
    renderCodex();
    renderGloves();
    renderPotions();
    renderQuests();
    renderProfile();
  }

  return { render };
}
