/** Glove ownership, crafting, purchase, and equipment UI. */
export function createGloveUI(deps) {
  const {
    getState, D, G, supabaseClient, getCurrentUser, byId, glove, currentGlove,
    format, formatWalletScientific, save, flushCloudSave, render, toast,
    achievementStats, rewardText, grantAchievementReward, showAchievementPopup,
    checkAchievements, logCraft, KEY, userSaveKey, documentRef, confirmAction,
    openAuth, totalUnique, localStorageRef = globalThis.localStorage
  } = deps;
  let glovePurchaseBusy = false;

  function canCraft(item) {
    const state = getState();
    return item.recipe.every(([id, count]) => (state.bag[id] || 0) >= count);
  }

  function renderGloves() {
    const state = getState();
    const equippedGlove = currentGlove();
    documentRef.getElementById('gloveLabel').textContent = equippedGlove.name;
    documentRef.getElementById('equippedName').textContent = equippedGlove.icon + ' ' + equippedGlove.name;
    documentRef.getElementById('equippedDesc').textContent = equippedGlove.desc;
    documentRef.getElementById('gloveLuck').textContent = '+' + equippedGlove.luck + '%';
    documentRef.getElementById('gloveSpeed').textContent = '+' + equippedGlove.speed + '%';
    documentRef.getElementById('gloveOwned').textContent = Object.keys(state.gloves || {}).filter(id => state.gloves[id] > 0).length;

    const convertPanel = documentRef.getElementById('weatherConvertPanel');
    const convertBtn = documentRef.getElementById('weatherConvertBtn');
    const convertCooldown = documentRef.getElementById('weatherConvertCooldown');
    if (convertPanel) {
      const canConvert = state.equipped === 'g7' && !!state.gloves?.g7;
      convertPanel.hidden = !canConvert;
      if (canConvert) {
        const left = Math.max(0, 60 * 60 * 1000 - (Date.now() - (Number(state.weatherConvertAt) || 0)));
        convertBtn.disabled = left > 0;
        convertBtn.textContent = left > 0 ? '⏳ 天氣轉換冷卻中' : '🌦️ 轉換全服天氣';
        convertCooldown.textContent = left > 0
          ? '剩餘冷卻 ' + String(Math.floor(left / 3600000)).padStart(2, '0') + ':'
            + String(Math.floor(left % 3600000 / 60000)).padStart(2, '0') + ':'
            + String(Math.floor(left % 60000 / 1000)).padStart(2, '0')
          : '能力已就緒';
      }
    }

    documentRef.getElementById('recipeList').innerHTML = G.filter(item => item.id !== 'g0')
      .sort((a, b) => (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER))
      .map(item => {
        const owned = !!state.gloves[item.id];
        const equipped = state.equipped === item.id;
        if (item.id === 'g7') {
          const materials = item.recipe.map(([diceId, count]) => {
            const dice = byId(diceId);
            const have = Number(state.bag[diceId]) || 0;
            const enough = have >= count;
            return `<p style="color:${enough ? '#65e6b2' : '#ff829d'}">${enough ? '✓' : '缺少'} ${dice?.name || diceId} ×${count}：持有 ${format(have)}</p>`;
          }).join('');
          return `<div class="recipe"><div style="flex:1;min-width:0"><h3>${item.icon} ${item.name}${equipped ? '（已裝備）' : owned ? '（已持有）' : ''}</h3>${materials}<p>運氣 +${item.luck}% · 速度 +${item.speed}%</p></div><button ${owned ? (equipped ? 'disabled' : '') : (canCraft(item) ? '' : 'disabled')} data-craft="g7">${equipped ? '已裝備' : owned ? '裝備' : '合成'}</button></div>`;
        }
        const action = owned ? (equipped ? '已裝備' : '裝備') : '購買';
        const disabled = glovePurchaseBusy || (owned ? equipped : Number(state.coins) < item.price);
        return `<div class="recipe"><div style="flex:1;min-width:0"><h3>${item.icon} ${item.name}${equipped ? '（已裝備）' : owned ? '（已持有）' : ''}</h3><p>運氣 +${item.luck}% · 速度 +${item.speed}%</p><p style="color:#ffd27a;font-weight:800">價格：${formatWalletScientific(item.price)}</p>${!owned && Number(state.coins) < item.price ? '<p style="color:#ff829d">金幣不足</p>' : ''}</div><button ${disabled ? 'disabled' : ''} data-glove-action="${item.id}">${action}</button></div>`;
      }).join('');
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

      const now = new Date().toISOString();
      const { error: profileError } = await supabaseClient.from('player_profiles').upsert({
        user_id: getCurrentUser().id,
        username: (state.name || '旅人').trim().slice(0, 20) || '旅人',
        total_rolls: Number(state.rolls) || 0,
        unique_dice: totalUnique(),
        rarest_den: Number(state.best?.den) || 0,
        coins: Number(state.coins) || 0,
        ...achievementStats(),
        last_seen: now,
        updated_at: now
      }, { onConflict: 'user_id' });
      if (profileError) console.warn('Glove purchase profile mirror update failed; purchase is committed', profileError);
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
    if (state.gloves[id]) {
      state.equipped = id;
      save();
      render();
      toast('已裝備' + item.name + '（同時只能裝備一副手套）');
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
    state.gloves[id] = 1;
    state.equipped = id;
    state.quest.craft++;
    checkAchievements();
    save();
    if (getCurrentUser()) logCraft('glove', id, item.name);
    render();
    toast('合成成功並裝備：' + item.name);
  }
  let gloveUISetup = false;
  function setupGloveUI() {
    if (gloveUISetup) return false;
    gloveUISetup = true;
    documentRef.addEventListener('click', event => {
      const target = event.target;
      const purchaseButton = target.closest('[data-glove-action]');
      const craftGloveButton = target.closest('[data-craft]');
      if (purchaseButton) purchaseGlove(purchaseButton.dataset.gloveAction);
      if (craftGloveButton) craft(craftGloveButton.dataset.craft);
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
