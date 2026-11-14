import { addGlitchDiceOdds, applyGlitchWeight } from './glitch-dice.js?v=20261114-t0087-heaven-probability';
/**
 * Dice rolling, reveal effects and automatic-roll controls.
 * The composition root owns shared game state and supplies all game services.
 */
export function createDiceSystem(deps) {
  const {
    D,
    ANGEL_ODDS,
    POTIONS,
    KEY,
    timerManager,
    supabaseClient,
    getState,
    getCurrentUser,
    getWeather,
    luck,
    speed,
    byId,
    format,
    chanceText,
    totalDice,
    go,
    toast,
    isLockHeld,
    isHeartbeatActive,
    scheduleUnlock,
    applyPetRollSkills,
    potionMaterialTotal,
    checkAchievements,
    checkDailyReward,
    save,
    autoDepositRolledWeatherDice,
    broadcastRareRoll,
    render,
    documentRef
  } = deps;

  let autoTimer = null;
  let autoWatchdog = null;
  let rolling = false;
  let rollingStartedAt = 0;
  let rollSequence = 0;

  function withTimeout(promise, timeoutMs, label) {
    let timeoutHandle = null;
    const timeout = new Promise((_, reject) => {
      timeoutHandle = timerManager.setTimeout(
        () => reject(new Error(label + '逾時')),
        timeoutMs,
        'dice-roll-timeout'
      );
    });
    return Promise.race([Promise.resolve(promise), timeout])
      .finally(() => {
        if (timeoutHandle !== null) timerManager.clearTimeout(timeoutHandle);
      });
  }

  function releaseRoll(sequence = rollSequence) {
    if (sequence !== rollSequence) return false;
    rolling = false;
    rollingStartedAt = 0;
    documentRef.getElementById('rollBtn')?.classList.remove('roll-progress');
    documentRef.getElementById('autoBtn')?.classList.remove('roll-progress');
    documentRef.getElementById('rollBtn')?.removeAttribute('disabled');
    documentRef.getElementById('diceFace')?.classList.remove('rolling');
    return true;
  }

  function startAutoWatchdog() {
    if (autoWatchdog) timerManager.clearInterval(autoWatchdog);
    autoWatchdog = timerManager.setInterval(() => {
      if (!autoTimer || !rolling || !rollingStartedAt) return;
      if (Date.now() - rollingStartedAt < 45000) return;
      console.warn('自動擲骰流程逾時，已解除卡住狀態');
      rollSequence++;
      releaseRoll(rollSequence);
      if (totalDice() < (Number(getState().bagCapacity) || 35)) doRoll();
    }, 10000, 'auto-roll-watchdog');
  }

  function stopAutoWatchdog() {
    if (autoWatchdog) timerManager.clearInterval(autoWatchdog);
    autoWatchdog = null;
  }

  function addWeatherOdds(entries, pool, weather) {
    const baseTotal = entries.reduce((sum, entry) => sum + entry.weight, 0);
    if (baseTotal > 0) entries.forEach(entry => { entry.weight = entry.weight / baseTotal * 100; });
    const weatherDice = pool.filter(dice => dice.weather === weather && Number(dice.den) > 2048);
    if (!weatherDice.length) return entries;
    const donors = entries.filter(entry => entry.weight > 10);
    const donorTotal = donors.reduce((sum, entry) => sum + entry.weight, 0);
    const reserve = weatherDice.length;
    if (donorTotal <= reserve) return entries;
    donors.forEach(entry => { entry.weight -= reserve * (entry.weight / donorTotal); });
    weatherDice.forEach(dice => entries.push({ dice, weight: 1 }));
    return entries;
  }

  function isHalloweenDice(dice) {
    return ['d33', 'd34', 'd35', 'd36'].includes(dice?.id);
  }

  function halloweenDiceUnavailable() {
    const now = new Date();
    return now.getFullYear() > 2026
      || (now.getFullYear() === 2026
        && (now.getMonth() > 10 || (now.getMonth() === 10 && now.getDate() >= 1)));
  }

  function weightedRoll() {
    const state = getState();
    const angel = (Number(state.potions?.angelCharges) || 0) > 0;
    const heaven2 = state.potions?.angelMode === 'angel2';
    const weatherState = getWeather();
    const weather = weatherState.type || 'sunny';
    const weatherTypes = weatherState.types || [weather];
    const isGlitchWeather = weatherTypes.includes('glitch');
    const pool = D.filter(dice => (!dice.weather || weatherTypes.includes(dice.weather))
      && (!isHalloweenDice(dice) || !halloweenDiceUnavailable()));
    const boostLuck = Math.max(0, Number(luck()) || 0);

    // 天堂藥水搭配高於 100% 運氣時，改走保證至少 1/4096 的隱藏稀有池。
    if (angel && boostLuck > 100) {
      const rarePool = pool.filter(dice => Number(dice.den) >= 4096);
      if (rarePool.length) {
        const weights = rarePool.map(dice => {
          const den = Number(dice.den) || 4096;
          const rarityLift = 1 + Math.log2(Math.max(1, den / 4096)) * boostLuck / 100;
          return applyGlitchWeight(dice, (1 / den) * rarityLift, isGlitchWeather);
        });
        const total = weights.reduce((sum, weight) => sum + weight, 0);
        let roll = Math.random() * total;
        for (let i = 0; i < rarePool.length; i++) {
          roll -= weights[i];
          if (roll <= 0) return rarePool[i];
        }
        return rarePool[rarePool.length - 1];
      }
    }

    if (heaven2) {
      // 天堂藥水 II 的內部機率表不顯示於玩家介面。
      const heaven2Odds = {
        d14: 20, d34: 10.1218, d15: 8.6757, d16: 7.7118, d29: 6.7478,
        d17: 6.2658, d35: 5.7838, d18: 5.3018, d19: 4.8198, d30: 5.045,
        d20: 4.563, d21: 4.081, d22: 3.599, d23: 2.4099, d25: 1.9279,
        d26: 1.4459, d31: 0.5, d24: 0.5, d27: 0.495, d32: 0.005
      };
      let entries = D.filter(dice => Object.prototype.hasOwnProperty.call(heaven2Odds, dice.id)
        && (!dice.weather || dice.weather === weather)
        && (!isHalloweenDice(dice) || !halloweenDiceUnavailable()))
        .map(dice => ({
          dice,
          weight: heaven2Odds[dice.id] * (weather === 'hell' && dice.den >= 1000000 && dice.den <= 100000000 ? 1.04 : 1)
        }));
      entries = addGlitchDiceOdds(entries, pool, isGlitchWeather, weather);
      entries = addWeatherOdds(entries, pool, weather);
      const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
      let roll = Math.random() * total;
      for (const entry of entries) {
        roll -= entry.weight;
        if (roll < 0) return entry.dice;
      }
      return entries[entries.length - 1]?.dice || byId('d14');
    }

    if (angel) {
      let entries = ANGEL_ODDS.map(([id, percent]) => {
        const dice = byId(id);
        return {
          dice,
          weight: percent * (weather === 'hell' && dice?.den >= 1000000 && dice.den <= 100000000 ? 1.04 : 1)
        };
      }).filter(entry => entry.dice
        && (!entry.dice.weather || entry.dice.weather === weather)
        && (!isHalloweenDice(entry.dice) || !halloweenDiceUnavailable()));
      entries = addGlitchDiceOdds(entries, pool, isGlitchWeather, weather);
      entries = addWeatherOdds(entries, pool, weather);
      const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
      let roll = Math.random() * total;
      for (const entry of entries) {
        roll -= entry.weight;
        if (roll < 0) return entry.dice;
      }
      return entries[entries.length - 1].dice;
    }

    // 一般擲骰沿用原本的分級運氣權重。
    const tenthRoll = (Number(state.rolls) || 0) % 10 === 0;
    const currentLuck = Math.max(0, Number(luck()) || 0);
    const effective = Math.max(0, Math.min(500, currentLuck + (tenthRoll ? 100 : 0)));
    const weights = pool.map(dice => {
      const rollDen = weather === 'hell' && dice.den >= 1000000 && dice.den <= 100000000 ? dice.den / 1.04 : dice.den;
      // 每 100% 運氣，稀有骰子的相對權重增加 100%；不把加成截斷在 200%。
      const factor = dice.den > 1024 ? 1 + effective / 100 : 1;
      return applyGlitchWeight(dice, (1 / Math.max(2, rollDen)) * factor, isGlitchWeather);
    });
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return pool[i];
    }
    return pool[0];
  }

  function wait(ms) {
    return new Promise(resolve => timerManager.setTimeout(resolve, ms, 'dice-reveal-delay'));
  }

  async function playRarityReveal(dice) {
    const overlay = documentRef.getElementById('rarityOverlay');
    if (!overlay) return;
    if (documentRef.hidden) {
      overlay.classList.remove('show', 'blackout', 'common');
      return;
    }
    const isGlitchDice = !!dice.glitchBonus;
    const ultra = dice.den >= 100000;
    const tier = dice.den >= 10000000 ? 'cosmic' : dice.den >= 1000000 ? 'mythic' : 'rare';
    overlay.className = 'rarity-overlay show tier-' + tier + ' ' + (ultra ? 'blackout' : 'common') + (isGlitchDice ? ' glitch-reveal' : '');
    overlay.style.setProperty('--reveal-color', dice.color);
    documentRef.getElementById('rarityRevealTitle').textContent = isGlitchDice ? '⚠ SYSTEM BREACH DETECTED ⚠' : ultra ? '✦ ANOMALOUS DISCOVERY ✦' : 'RARE DISCOVERY';
    const icon = documentRef.getElementById('rarityRevealIcon');
    icon.textContent = dice.icon;
    icon.classList.toggle('halloween-compact', ['d33', 'd34', 'd35', 'd36'].includes(dice.id));
    documentRef.getElementById('rarityRevealName').textContent = dice.name;
    documentRef.getElementById('rarityRevealOdds').textContent = chanceText(dice);
    if (ultra) {
      await wait(tier === 'cosmic' ? 1050 : 750);
      overlay.classList.remove('blackout');
      overlay.classList.add('show');
      await wait(tier === 'cosmic' ? 4200 : tier === 'mythic' ? 3400 : 2600);
    } else {
      await wait(1500);
    }
    overlay.classList.remove('show', 'blackout', 'common', 'tier-rare', 'tier-mythic', 'tier-cosmic', 'glitch-reveal');
  }

  async function playSmallReveal(dice, label = 'SPECIAL DISCOVERY') {
    const overlay = documentRef.getElementById('rarityOverlay');
    if (!overlay) return;
    if (documentRef.hidden) {
      overlay.classList.remove('show', 'blackout', 'common');
      return;
    }
    const card = overlay.querySelector('.rarity-reveal-card');
    overlay.className = 'rarity-overlay show common';
    card.classList.add('small-reveal-card');
    overlay.style.setProperty('--reveal-color', dice.color);
    documentRef.getElementById('rarityRevealTitle').textContent = label;
    const icon = documentRef.getElementById('rarityRevealIcon');
    icon.textContent = dice.icon;
    icon.classList.toggle('halloween-compact', ['d33', 'd34', 'd35', 'd36'].includes(dice.id));
    documentRef.getElementById('rarityRevealName').textContent = dice.name;
    documentRef.getElementById('rarityRevealOdds').textContent = chanceText(dice);
    await wait(720);
    overlay.classList.remove('show', 'blackout', 'common');
    card.classList.remove('small-reveal-card');
  }

  function doRoll() {
    const state = getState();
    const user = getCurrentUser();
    if (rolling) return;
    if (user && isLockHeld()) scheduleUnlock(user);
    if (user && !isHeartbeatActive()) {
      toast('帳號裝置鎖定尚未確認，請重新登入');
      return;
    }
    if (totalDice() >= (Number(state.bagCapacity) || 35)) {
      go('inventory');
      toast('背包已滿，請先出售骰子或擴充容量');
      return;
    }

    rolling = true;
    rollingStartedAt = Date.now();
    const currentRollSequence = ++rollSequence;
    // 先立即消耗本次擲骰序號並寫入本機，避免動畫期間重新整理重複取得第 10 抽雙倍。
    state.rolls = Math.max(0, Number(state.rolls) || 0) + 1;
    // Persist the roll counter to both local save scopes immediately.
    save();
    const face = documentRef.getElementById('diceFace');
    face.classList.add('rolling');
    const rollButton = documentRef.getElementById('rollBtn');
    const autoButton = documentRef.getElementById('autoBtn');
    const rollDuration = Math.max(50, 950 / (1 + speed() / 100));
    rollButton.style.setProperty('--roll-duration', rollDuration + 'ms');
    autoButton.style.setProperty('--roll-duration', rollDuration + 'ms');
    rollButton.classList.remove('roll-progress');
    autoButton.classList.remove('roll-progress');
    void rollButton.offsetWidth;
    rollButton.classList.add('roll-progress');
    rollButton.disabled = true;

    timerManager.setTimeout(async () => {
      if (currentRollSequence !== rollSequence) return;
      try {
        const currentState = getState();
        const angelUsed = (Number(currentState.potions?.angelCharges) || 0) > 0;
        const tenthRoll = (Number(currentState.rolls) || 0) % 10 === 0;

        // 先以本抽開始前的寵物幸運 charge 計算權重，再於本抽套用技能並扣除 charge。
        const dice = weightedRoll();
        const petSkillReward = Number(applyPetRollSkills(dice)) || 0;

        const weather = getWeather();
        if (weather.type === 'dumpling' && Number(dice.den) === 32000 && !currentState.dumplingWeatherRewardClaimed) {
          currentState.dumplingWeatherRewardClaimed = true;
          save();
          toast('🥟 水餃天氣限定獎勵！你抽中了 1/32,000 一般骰子，每位玩家限領一次！');
          const note = documentRef.createElement('div');
          note.textContent = '🥟 恭喜！你在水餃天氣中抽中 1/32,000 一般骰子，限定獎勵已領取！';
          note.style.cssText = 'position:fixed;z-index:100000;top:18%;left:50%;transform:translateX(-50%);width:min(92vw,560px);padding:16px;border:1px solid #f5c66b;border-radius:14px;background:linear-gradient(135deg,#3a2110,#15101a);color:#fff;text-align:center;font-weight:900;box-shadow:0 0 28px #f5b84a66';
          documentRef.body.appendChild(note);
          timerManager.setTimeout(() => note.remove(), 6500, 'dice-special-note');
        }

        const halloweenVariant = ['d33', 'd34', 'd35', 'd36'].includes(dice.id);
        const now = new Date().toISOString();
        const isNew = !currentState.first[dice.id] && !currentState.bag[dice.id];
        if (angelUsed) {
          currentState.potions.angelCharges = Math.max(0, currentState.potions.angelCharges - 1);
          currentState.potions.angelMode = '';
        }
        if (petSkillReward > 0) {
          currentState.coins = (Number(currentState.coins) || 0) + petSkillReward;
          currentState.quest.coinsEarned = (Number(currentState.quest.coinsEarned) || 0) + petSkillReward;
        }

        currentState.quest.rolls++;
        currentState.rollCounts = currentState.rollCounts || {};
        currentState.rollCounts[dice.id] = (Number(currentState.rollCounts[dice.id]) || 0) + 1;
        if (!currentState.first[dice.id]) currentState.first[dice.id] = now;

        let sold = false;
        const autoWeatherDeposit = !!(dice.weather && currentState.autoDepositWeatherEnabled
          && (currentState.autoDepositDice || []).includes(dice.id) && getCurrentUser() && supabaseClient);
        const autoCollected = !!(!dice.weather && currentState.potions?.autoAdd
          && (currentState.potions.autoAddPotions || []).some(potionId => {
            const potion = POTIONS.find(item => item.id === potionId);
            return potion && potion.recipe.some(([materialId]) => materialId === dice.id);
          }) && potionMaterialTotal() < 4);

        if (autoCollected) {
          currentState.potions.materials = currentState.potions.materials || {};
          currentState.potions.materials[dice.id] = (Number(currentState.potions.materials[dice.id]) || 0) + 1;
        }
        if (autoCollected) {
          sold = false;
        } else if (!autoWeatherDeposit && !isHalloweenDice(dice)
          && (currentState.autoDeleteDice || []).includes(dice.id)) {
          currentState.coins = (Number(currentState.coins) || 0) + 1;
          currentState.quest.coinsEarned = (Number(currentState.quest.coinsEarned) || 0) + 1;
          currentState.autoSold = (Number(currentState.autoSold) || 0) + 1;
          sold = true;
        } else {
          currentState.bag[dice.id] = (currentState.bag[dice.id] || 0) + 1;
        }

        if (!currentState.best || dice.den > currentState.best.den) {
          currentState.best = { id: dice.id, den: dice.den, time: now };
        }
        if (dice.den >= 2048) currentState.quest.rare++;

        face.classList.remove('rolling');
        face.style.color = dice.color;
        face.style.borderColor = dice.color;
        face.style.boxShadow = `0 0 35px ${dice.color}55,inset 0 0 24px ${dice.color}20`;
        face.textContent = dice.icon;
        face.classList.toggle('halloween-compact', ['d33', 'd34', 'd35', 'd36'].includes(dice.id));
        documentRef.getElementById('resultName').textContent = dice.name;
        documentRef.getElementById('resultRarity').textContent = chanceText(dice);
        const resultDetail = (sold || autoCollected) ? '' : (isNew ? '✦ 首次發現！' : '獲得 ×' + (Number(currentState.bag[dice.id]) || 0));
        documentRef.getElementById('resultSub').textContent = [resultDetail, new Date(now).toLocaleTimeString()].filter(Boolean).join(' · ');

        // Persist the completed result and inventory changes before announcements or reveal delays.
        save();

        if (autoCollected) toast('已自動保留藥水材料：' + dice.name);
        else if (sold) toast('已出售 ' + dice.name);
        else if (autoWeatherDeposit) toast('抽到符合門檻的天氣骰子，正在自動添加…');
        else if (isNew) toast('新發現：' + dice.name + '！');
        else if (dice.den >= 2048) toast('稀有發現：' + dice.name);
        if (tenthRoll) toast('第 10 抽觸發雙倍運氣！本抽運氣 ×2');
        if (petSkillReward > 0) toast('寵物技能觸發：額外獲得 +' + format(petSkillReward) + '$');

        // 全服稀有公告獨立執行，避免遠端公告寫入延遲卡住自動擲骰。
        Promise.resolve().then(() => broadcastRareRoll(dice)).catch(error => {
          console.warn('稀有擲骰公告送出失敗', error);
        });
        checkAchievements();
        checkDailyReward();
        if (autoWeatherDeposit) {
          save();
          try {
            await withTimeout(
              autoDepositRolledWeatherDice(dice),
              15000,
              '天氣骰子自動投入'
            );
          } catch (error) {
            console.warn('天氣骰子自動投入未能及時完成', error);
          }
        }
        if (halloweenVariant) await playSmallReveal(dice, 'HALLOWEEN VARIANT');
        else if (dice.den === 4096) await playSmallReveal(dice, 'RARE DISCOVERY');
        else if (dice.den >= 10000) await playRarityReveal(dice);
        if (currentRollSequence !== rollSequence) return;

        timerManager.setTimeout(() => {
          if (!releaseRoll(currentRollSequence)) return;
          save();
          render();
          if (autoTimer && totalDice() < (Number(getState().bagCapacity) || 35)) {
            requestAnimationFrame(() => {
              if (autoTimer && !rolling) doRoll();
            });
          }
        }, 250, 'dice-roll-settle');
      } catch (error) {
        console.error('擲骰流程發生錯誤', error);
        releaseRoll(currentRollSequence);
        toast('擲骰失敗，請重新嘗試；詳細錯誤已記錄。');
      }
    }, Math.max(50, 650 / (1 + speed() / 100)), 'dice-roll-processing');
  }

  function stopAuto() {
    if (autoTimer) timerManager.clearInterval(autoTimer);
    autoTimer = null;
    stopAutoWatchdog();
    documentRef.getElementById('autoBtn').classList.remove('roll-progress');
    documentRef.getElementById('autoBtn').disabled = false;
    documentRef.getElementById('stopBtn').disabled = true;
  }

  function restartAutoInterval() {
    if (!autoTimer) return;
    timerManager.clearInterval(autoTimer);
    autoTimer = timerManager.setInterval(() => {
      if (totalDice() >= (Number(getState().bagCapacity) || 35)) {
        stopAuto();
        go('inventory');
        toast('背包已滿，自動擲骰停止');
        return;
      }
      if (!rolling) doRoll();
    }, Math.max(50, 950 / (1 + speed() / 100)), 'auto-roll');
    startAutoWatchdog();
  }

  let autoRollUISetup = false;
  function setupAutoRollUI() {
    if (autoRollUISetup) return false;
    autoRollUISetup = true;
    documentRef.getElementById('autoBtn').onclick = () => {
      if (autoTimer || totalDice() >= (Number(getState().bagCapacity) || 35)) {
        if (totalDice() >= (Number(getState().bagCapacity) || 35)) go('inventory');
        return;
      }
      documentRef.getElementById('autoBtn').disabled = true;
      documentRef.getElementById('stopBtn').disabled = false;
      autoTimer = timerManager.setInterval(() => {
        if (totalDice() >= (Number(getState().bagCapacity) || 35)) {
          stopAuto();
          go('inventory');
          toast('背包已滿，自動擲骰停止');
          return;
        }
        if (!rolling) doRoll();
      }, Math.max(50, 950 / (1 + speed() / 100)), 'auto-roll');
      startAutoWatchdog();
      toast('自動擲骰已開始');
    };
    documentRef.getElementById('stopBtn').onclick = stopAuto;

    // 切換瀏覽器分頁不停止自動擲骰；回到可見狀態後立即恢復擲骰。
    documentRef.addEventListener('visibilitychange', () => {
      if (documentRef.hidden) {
        const overlay = documentRef.getElementById('rarityOverlay');
        overlay?.classList.remove('show', 'blackout', 'common', 'tier-rare', 'tier-mythic', 'tier-cosmic');
      } else if (autoTimer && totalDice() < (Number(getState().bagCapacity) || 35)) {
        if (rolling && rollingStartedAt && Date.now() - rollingStartedAt >= 15000) {
          console.warn('頁面恢復後偵測到擲骰卡住，正在恢復自動擲骰');
          rollSequence++;
          releaseRoll(rollSequence);
        }
        if (!rolling) doRoll();
      }
    });
    const resumeAutoRoll = () => {
      if (!autoTimer || totalDice() >= (Number(getState().bagCapacity) || 35)) return;
      if (rolling && rollingStartedAt && Date.now() - rollingStartedAt >= 15000) {
        console.warn('頁面重新取得焦點後偵測到擲骰卡住，正在恢復自動擲骰');
        rollSequence++;
        releaseRoll(rollSequence);
      }
      if (!rolling) doRoll();
    };
    documentRef.addEventListener('pageshow', resumeAutoRoll);
    documentRef.addEventListener('focus', resumeAutoRoll);
    return true;
  }

  return {
    doRoll,
    stopAuto,
    restartAutoInterval,
    isRolling: () => rolling,
    isAutoRolling: () => !!autoTimer,
    setupAutoRollUI
  };
}
