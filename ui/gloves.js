/** Glove ownership, crafting, purchase, and equipment UI. */
export function createGloveUI(deps) {
  const {
    getState, D, G, supabaseClient, getCurrentUser, byId, glove, currentGlove,
    format, formatWalletScientific, save, flushCloudSave, render, toast,
    rewardText, grantAchievementReward, showAchievementPopup,
    checkAchievements, logCraft, KEY, userSaveKey, documentRef, confirmAction,
    openAuth, localStorageRef = globalThis.localStorage
  } = deps;
  let glovePurchaseBusy = false;
  let timeCrystalBusy = false;
  let timeCrystalStatus = null;
  let timeCrystalStatusUserId = null;
  let timeCrystalStatusLoading = false;

  async function loadTimeCrystalStatus(force = false) {
    const user = getCurrentUser();
    const userId = user?.id || null;
    if (!userId || !supabaseClient) {
      timeCrystalStatus = null;
      timeCrystalStatusUserId = null;
      return null;
    }
    if (!force && (timeCrystalStatusUserId === userId || timeCrystalStatusLoading)) return timeCrystalStatus;
    timeCrystalStatusUserId = userId;
    timeCrystalStatusLoading = true;
    try {
      const { data, error } = await supabaseClient.rpc('get_time_crystal_status');
      if (error) throw error;
      if (getCurrentUser()?.id !== userId) return null;
      timeCrystalStatus = data || {};
      getState().timeCrystalPending = !!data?.pending;
      return timeCrystalStatus;
    } catch (error) {
      console.warn('Time Crystal status unavailable', error);
      timeCrystalStatus = { error: true };
      return null;
    } finally {
      timeCrystalStatusLoading = false;
      if (getCurrentUser()?.id === userId) renderGloves();
    }
  }

  function renderTimeCrystalCard(itemWorkshopList) {
    const state = getState();
    const user = getCurrentUser();
    const glitchDice = D.filter(dice => dice.glitchBonus);
    const glitchCount = glitchDice.reduce((sum, dice) => sum + Math.max(0, Number(state.bag?.[dice.id]) || 0), 0);
    const timeCount = Math.max(0, Number(state.bag?.d15) || 0);
    const voidCount = Math.max(0, Number(state.bag?.d14) || 0);
    const enough = timeCount >= 1 && voidCount >= 1 && glitchCount >= 1;
    const statusReady = !!user && timeCrystalStatusUserId === user.id && !!timeCrystalStatus && !timeCrystalStatus.error;
    const owned = statusReady && !!timeCrystalStatus.owned;
    const pending = !!state.timeCrystalPending;
    const cooldownUntil = Date.parse(timeCrystalStatus?.cooldown_until || '') || 0;
    const left = Math.max(0, cooldownUntil - Date.now());
    const timeText = left > 0
      ? String(Math.floor(left / 3600000)).padStart(2, '0') + ':' +
        String(Math.floor(left % 3600000 / 60000)).padStart(2, '0') + ':' +
        String(Math.floor(left % 60000 / 1000)).padStart(2, '0')
      : '';
    const materials = [
      { label: '時序骰子', icon: '⌛', have: timeCount },
      { label: '虛空骰子', icon: '◉', have: voidCount },
      { label: '故障骰子（任一故障系列）', icon: '⚠️', have: glitchCount }
    ].map(item => {
      const enoughItem = item.have >= 1;
      return '<p style="color:' + (enoughItem ? '#65e6b2' : '#ff829d') + '">' +
        (enoughItem ? '✓' : '缺少') + ' ' + item.icon + ' ' + item.label +
        ' ×1：持有 ' + format(item.have) + '</p>';
    }).join('');
    let status = '合成後可重複使用，每次使用冷卻 1 小時。';
    if (!user) status = '登入雲端帳號後即可合成與使用。';
    else if (!statusReady) status = timeCrystalStatus?.error ? '雲端狀態讀取失敗，重新整理後再試。' : '正在讀取道具狀態…';
    else if (pending) status = '效果已啟用：下一次玩家召喚天氣將延長 20%。';
    else if (left > 0) status = '⏳ 冷卻中 · ' + timeText;
    const button = owned
      ? '<button class="primary" type="button" style="width:100%;min-height:38px" data-use-time-crystal ' +
        (timeCrystalBusy || pending || left > 0 ? 'disabled' : '') + '>⌛ 使用時序結晶</button>'
      : '<button type="button" style="width:100%;min-height:36px" data-craft-time-crystal ' +
        (timeCrystalBusy || !statusReady || !enough ? 'disabled' : '') + '>合成時序結晶</button>';
    itemWorkshopList.innerHTML +=
      '<div class="recipe weather-converter-card" style="display:block;padding:12px;margin-top:10px">' +
      '<h3 style="margin:0 0 6px">⌛ 時序結晶' + (owned ? '（已持有）' : '') + '</h3>' +
      '<p style="margin:0 0 8px">可使下個天氣延長20%時間</p>' +
      (owned ? '' : materials) + button +
      '<p class="mini" style="margin:6px 0 0">' + status + '</p></div>';
  }

  function canCraft(item) {
    const state = getState();
    return item.recipe.every(([id, count]) => (state.bag[id] || 0) >= count);
  }

  function renderGloves() {
    const activeUser = getCurrentUser();
    if (activeUser?.id) {
      if (timeCrystalStatusUserId !== activeUser.id && !timeCrystalStatusLoading) void loadTimeCrystalStatus();
    } else if (timeCrystalStatusUserId) {
      timeCrystalStatus = null;
      timeCrystalStatusUserId = null;
    }
    const state = getState();
    const equippedGlove = currentGlove();
    documentRef.getElementById('gloveLabel').textContent = equippedGlove.name;
    documentRef.getElementById('equippedName').textContent = equippedGlove.icon + ' ' + equippedGlove.name;
    documentRef.getElementById('equippedDesc').textContent = equippedGlove.desc;
    documentRef.getElementById('gloveLuck').textContent = '+' + equippedGlove.luck + '%';
    documentRef.getElementById('gloveSpeed').textContent = '+' + equippedGlove.speed + '%';
    documentRef.getElementById('gloveOwned').textContent = Object.keys(state.gloves || {}).filter(id => id !== 'g7' && state.gloves[id] > 0).length;

    const converter = G.find(item => item.id === 'g7');
    const itemWorkshopList = documentRef.getElementById('itemWorkshopList');
    if (itemWorkshopList && converter) {
      const owned = Number(state.items?.g7) > 0;
      const enabled = state.equippedItem === 'g7';
      const materials = converter.recipe.map(([diceId, count]) => {
        const dice = byId(diceId);
        const have = Number(state.bag[diceId]) || 0;
        const enough = have >= count;
        const odds = dice?.den ? '（1/' + Number(dice.den).toLocaleString('en-US') + '）' : '';
        return '<p style="color:' + (enough ? '#65e6b2' : '#ff829d') + '">' +
          (enough ? '✓' : '缺少') + ' ' + (dice?.icon || '🎲') + ' ' + (dice?.name || diceId) +
          ' ' + odds + ' ×' + count + '：持有 ' + format(have) + '</p>';
      }).join('');
      const action = enabled ? '已啟用' : owned ? '啟用' : '合成';
      const disabled = enabled || (!owned && !canCraft(converter));
      const left = Math.max(0, 60 * 60 * 1000 - (Date.now() - (Number(state.weatherConvertAt) || 0)));
      const cooldownText = !enabled ? '先啟用天氣轉換器，即可每小時使用一次。'
        : left > 0 ? '⏳ 天氣轉換冷卻中 · ' + String(Math.floor(left / 3600000)).padStart(2, '0') + ':' +
          String(Math.floor(left % 3600000 / 60000)).padStart(2, '0') + ':' +
          String(Math.floor(left % 60000 / 1000)).padStart(2, '0')
        : '天氣轉換已就緒';
      const controls = owned
        ? (enabled
            ? '<button class="primary" id="weatherConvertBtn" type="button" style="width:100%;min-height:38px" ' + (left > 0 ? 'disabled' : '') + '>🌦️ 轉換天氣</button>'
            : '<button type="button" style="width:100%;min-height:36px" data-craft="g7">啟用天氣轉換器</button>') +
          '<p class="mini" id="weatherConvertCooldown" style="margin:6px 0 0">' + cooldownText + '</p>'
        : materials + '<button type="button" ' + (disabled ? 'disabled' : '') + ' data-craft="g7">' + action + '</button>';
      itemWorkshopList.innerHTML = '<div class="recipe weather-converter-card" style="display:block;padding:12px">' +
        '<h3 style="margin:0 0 6px">' + converter.icon + ' 天氣轉換器' + (enabled ? '（已啟用）' : owned ? '（已持有）' : '') + '</h3>' +
        '<p style="margin:0 0 8px">全伺服器隨機召喚雨、雪或打雷；每小時可使用一次。不提供運氣或擲骰速度加成。</p>' +
        controls + '</div>';
    }
    if (itemWorkshopList) renderTimeCrystalCard(itemWorkshopList);

    const recipeList = documentRef.getElementById('recipeList');
    if (recipeList) {
      recipeList.innerHTML = G.filter(item => item.id !== 'g0' && item.id !== 'g7')
        .sort((a, b) => (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER))
        .map(item => {
          const owned = !!state.gloves[item.id];
          const equipped = state.equipped === item.id;
          const action = owned ? (equipped ? '已裝備' : '裝備') : '購買';
          const disabled = glovePurchaseBusy || (owned ? equipped : Number(state.coins) < item.price);
          return '<div class="recipe"><div style="flex:1;min-width:0"><h3>' + item.icon + ' ' + item.name +
            (equipped ? '（已裝備）' : owned ? '（已持有）' : '') +
            '</h3><p>運氣 +' + item.luck + '% · 速度 +' + item.speed +
            '%</p><p style="color:#ffd27a;font-weight:800">價格：' + formatWalletScientific(item.price) +
            '</p>' + (!owned && Number(state.coins) < item.price ? '<p style="color:#ff829d">金幣不足</p>' : '') +
            '</div><button ' + (disabled ? 'disabled' : '') + ' data-glove-action="' + item.id + '">' +
            action + '</button></div>';
        }).join('');
    }
  }
  async function purchaseGlove(id) {
    const state = getState();
    if (glovePurchaseBusy) return;
    const item = G.find(entry => entry.id === id && entry.price > 0);
    if (!item) return;
    const user = getCurrentUser();
    if (!user || !supabaseClient) {
      openAuth();
      toast('請先登入雲端帳號');
      return;
    }
    if (state.gloves[id]) {
      state.equipped = id;
      save();
      render();
      toast('已裝備 ' + item.name + '（同時只能裝備一副手套）');
      return;
    }
    const price = Number(item.price);
    if (!Number.isSafeInteger(price) || price <= 0) {
      toast('商品價格資料錯誤，請重新整理');
      return;
    }
    if (!Number.isFinite(Number(state.coins)) || Number(state.coins) < price) {
      toast('金幣不足，無法購買 ' + item.name);
      return;
    }
    if (!confirmAction(`確定花費 ${formatWalletScientific(price)} 購買 ${item.name}？\n購買後永久持有，可隨時切換裝備。`)) return;

    glovePurchaseBusy = true;
    renderGloves();
    const oldCoins = Number(state.coins) || 0;
    const oldGloves = { ...state.gloves };
    const oldEquipped = state.equipped;
    try {
      await flushCloudSave();
      if (!getCurrentUser()) throw new Error('登入狀態已失效，請重新登入');
      if (state.gloves[id]) throw new Error('這副手套已經購買，請重新整理');
      if (Number(state.coins) < price) throw new Error('目前金幣不足，請重新整理後再試');
      const { data, error } = await supabaseClient.rpc('purchase_glove', { p_glove_id: id });
      if (error) throw error;
      if (!data?.ok) throw new Error('伺服器未確認購買，請重新整理後再試');
      state.coins = Number(data.coins);
      state.gloves = data.gloves || { ...(state.gloves || {}), [id]: 1 };
      state.equipped = data.equipped || id;

      if ((id === 'g5' || id === 'g6') && Number(state.gloves[id]) > 0) {
        const achievementId = id === 'g5' ? 'craftVoid' : 'craftUniverse';
        const achievementName = id === 'g5' ? '鑽石' : '糖果';
        const reward = id === 'g5'
          ? { type: 'potion', id: 'speed1', amount: 1 }
          : { type: 'potion', id: 'speed2', amount: 2 };
        const description = '購買' + achievementName + '手套';
        state.achievements = state.achievements || {};
        if (!state.achievements[achievementId]) {
          const achievement = {
            name: achievementName,
            desc: description,
            reward: rewardText(reward),
            rewardGiven: false,
            unlockedAt: new Date().toISOString()
          };
          state.achievements[achievementId] = achievement;
          grantAchievementReward(reward);
          achievement.rewardGiven = true;
          showAchievementPopup({ ...achievement, reward: achievement.reward });
        }
      }

      // Purchase RPC has committed; never roll back the confirmed purchase if local save scheduling fails.
      try { save(); } catch (saveError) {
        console.warn('Glove purchase committed but save scheduling failed', saveError);
        void flushCloudSave();
      }
      if (typeof logCraft === 'function') logCraft('glove', id, item.name);
      toast('購買成功！已裝備 ' + item.name);
      render();
    } catch (error) {
      state.coins = oldCoins;
      state.gloves = oldGloves;
      state.equipped = oldEquipped;
      save();
      render();
      console.error('Glove purchase failed', error);
      toast('購買未完成，金幣已恢復：' + (error.message || '請稍後重試'));
    } finally {
      glovePurchaseBusy = false;
      renderGloves();
    }
  }

  function craft(id) {
    const state = getState();
    const item = glove(id);
    if (id === 'g7' && state.items?.g7) {
      state.equippedItem = 'g7';
      save();
      render();
      toast('已啟用天氣轉換器');
      return;
    }
    if (state.gloves[id]) {
      state.equipped = id;
      save();
      render();
      toast(id === 'g7' ? '已啟用天氣轉換器' : '已裝備' + item.name + '（同時只能裝備一副手套）');
      return;
    }
    if (!item.recipe?.length || !canCraft(item)) {
      toast('材料不足');
      return;
    }
    item.recipe.forEach(([diceId, count]) => {
      state.bag[diceId] = (Number(state.bag[diceId]) || 0) - count;
      if (state.bag[diceId] <= 0) delete state.bag[diceId];
    });
    if (id === 'g7') {
      state.items = state.items || {};
      state.items.g7 = 1;
    } else {
      state.gloves[id] = 1;
      state.equipped = id;
    }
    state.quest.craft++;
    checkAchievements();
    save();
    if (getCurrentUser()) logCraft('glove', id, item.name);
    render();
    toast(id === 'g7' ? '合成成功！天氣轉換器已放入道具欄，請按「啟用」' : '合成成功並裝備：' + item.name);
  }
  async function craftTimeCrystal() {
    const user = getCurrentUser();
    if (!user || !supabaseClient) {
      openAuth();
      toast('請先登入雲端帳號');
      return;
    }
    if (timeCrystalBusy) return;
    timeCrystalBusy = true;
    renderGloves();
    try {
      await flushCloudSave();
      const { data, error } = await supabaseClient.rpc('craft_time_crystal');
      if (error) throw error;
      if (!data?.ok || !data?.bag) throw new Error('伺服器未確認合成結果');
      getState().bag = data.bag;
      save();
      await loadTimeCrystalStatus(true);
      render();
      toast('合成成功：時序結晶已放入道具工坊');
    } catch (error) {
      console.error('Time Crystal crafting failed', error);
      toast(error.message || '時序結晶合成失敗，請稍後再試');
    } finally {
      timeCrystalBusy = false;
      renderGloves();
    }
  }

  async function activateTimeCrystal() {
    const user = getCurrentUser();
    if (!user || !supabaseClient) {
      openAuth();
      toast('請先登入雲端帳號');
      return;
    }
    if (timeCrystalBusy) return;
    timeCrystalBusy = true;
    renderGloves();
    try {
      const { data, error } = await supabaseClient.rpc('activate_time_crystal');
      if (error) throw error;
      if (!data?.ok || !data?.pending) throw new Error('伺服器未確認時序結晶效果');
      getState().timeCrystalPending = true;
      await loadTimeCrystalStatus(true);
      render();
      toast('時序結晶已啟用：下一次玩家召喚天氣延長 20%');
    } catch (error) {
      console.error('Time Crystal activation failed', error);
      toast(error.message || '時序結晶啟用失敗，請稍後再試');
    } finally {
      timeCrystalBusy = false;
      renderGloves();
    }
  }

  let gloveUISetup = false;
  function setupGloveUI() {
    if (gloveUISetup) return false;
    gloveUISetup = true;
    documentRef.addEventListener('click', event => {
      const target = event.target;
      const purchaseButton = target.closest('[data-glove-action]');
      const craftGloveButton = target.closest('[data-craft]');
      const craftTimeCrystalButton = target.closest('[data-craft-time-crystal]');
      const useTimeCrystalButton = target.closest('[data-use-time-crystal]');
      if (purchaseButton) purchaseGlove(purchaseButton.dataset.gloveAction);
      if (craftGloveButton) craft(craftGloveButton.dataset.craft);
      if (craftTimeCrystalButton) craftTimeCrystal();
      if (useTimeCrystalButton) activateTimeCrystal();
      const equipButton = target.closest('[data-equip]');
      if (equipButton) {
        const state = getState();
        state.equipped = equipButton.dataset.equip;
        save();
        render();
        toast('已裝備' + glove(state.equipped).name);
      }
    });
    return true;
  }

  return { canCraft, renderGloves, purchaseGlove, craft, setupGloveUI };
}
