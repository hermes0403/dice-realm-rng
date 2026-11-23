/** Glove ownership, crafting, purchase, and equipment UI. */
export function createGloveUI(deps) {
  const {
    getState, D, G, supabaseClient, getCurrentUser, byId, glove, currentGlove,
    format, formatWalletScientific, save, flushCloudSave, adoptServerBag, render, toast, timerManager, escapeHTML = value => String(value),
    rewardText, grantAchievementReward, showAchievementPopup,
    checkAchievements, logCraft, KEY, userSaveKey, documentRef, confirmAction,
    openAuth, localStorageRef = globalThis.localStorage
  } = deps;
  let glovePurchaseBusy = false;
  let timeCrystalBusy = false;
  let timeCrystalStatus = null;
  let timeCrystalStatusUserId = null;
  let timeCrystalStatusLoading = false;
  let timeCrystalPickerSlot = null;
  let timeCrystalSelectedDieId = null;
  let timeCrystalExpanded = false;
  let timeCrystalTicker = null;

  async function loadTimeCrystalStatus(force = false) {
    const user = getCurrentUser();
    const userId = user?.id || null;
    if (!userId || !supabaseClient) {
      timeCrystalStatus = null;
      timeCrystalStatusUserId = null;
      timeCrystalPickerSlot = null;
      timeCrystalSelectedDieId = null;
      timeCrystalExpanded = false;
      return null;
    }
    if (timeCrystalStatusUserId && timeCrystalStatusUserId !== userId) {
      timeCrystalPickerSlot = null;
      timeCrystalSelectedDieId = null;
      timeCrystalExpanded = false;
      timeCrystalStatus = null;
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
    const statusReady = !!user && timeCrystalStatusUserId === user.id && !!timeCrystalStatus && !timeCrystalStatus.error;
    const owned = statusReady && !!timeCrystalStatus.owned;
    const materials = timeCrystalStatus?.materials && typeof timeCrystalStatus.materials === 'object'
      ? timeCrystalStatus.materials : {};
    const pending = !!state.timeCrystalPending;
    const cooldownUntil = Date.parse(timeCrystalStatus?.cooldown_until || '') || 0;
    const left = Math.max(0, cooldownUntil - Date.now());
    const totalSeconds = Math.ceil(left / 1000);
    const timeText = totalSeconds > 0
      ? (totalSeconds >= 3600
          ? String(Math.floor(totalSeconds / 3600)).padStart(2, '0') + ':' +
            String(Math.floor(totalSeconds % 3600 / 60)).padStart(2, '0') + ':' +
            String(totalSeconds % 60).padStart(2, '0')
          : String(Math.floor(totalSeconds / 60)).padStart(2, '0') + ':' +
            String(totalSeconds % 60).padStart(2, '0'))
      : '';
    const slots = [
      { slot: 'time', label: '時序骰子', icon: '⌛', ids: ['d15'] },
      { slot: 'void', label: '虛空骰子', icon: '◉', ids: ['d14'] },
      { slot: 'glitch', label: '故障骰子（任一故障系列）', icon: '⚠️', ids: D.filter(dice => dice.glitchBonus).map(dice => dice.id) }
    ];
    const complete = slots.every(item => typeof materials[item.slot] === 'string' && item.ids.includes(materials[item.slot]));
    const rows = slots.map(item => {
      const depositedId = materials[item.slot];
      const depositedDie = depositedId ? byId(depositedId) : null;
      const completeRow = !!depositedDie && item.ids.includes(depositedId);
      const label = completeRow && item.slot === 'glitch'
        ? '故障骰子 · ' + escapeHTML(depositedDie.name)
        : item.label;
      return '<div class="time-crystal-material-row">' +
        '<span class="time-crystal-material-name">' + item.icon + ' ' + label + '</span>' +
        '<span class="time-crystal-material-progress">' + (completeRow ? '1/1 ✓' : '0/1') + '</span>' +
        (completeRow ? '<span class="time-crystal-material-done">已投入</span>' :
          '<button type="button" class="quiet time-crystal-add" data-time-crystal-add="' + item.slot + '"' +
          (!statusReady || timeCrystalBusy ? ' disabled' : '') + '>添加</button>') +
        '</div>';
    }).join('');
    let status = '';
    if (!user) status = '登入雲端帳號後即可投入材料與合成。';
    else if (!statusReady) status = timeCrystalStatus?.error ? '雲端狀態讀取失敗，請重新讀取。' : '正在讀取道具狀態…';
    else if (pending) status = '效果已啟用：下一次玩家召喚天氣將延長 20%。';
    else if (left > 0) status = '⏳ 冷卻中 · ' + timeText;
    else if (!owned && complete) status = '材料已齊全，可以合成。';
    else if (!owned) status = '逐項投入材料，進度 ' + slots.filter(item => materials[item.slot]).length + '/3。';

    const button = timeCrystalStatus?.error
      ? '<button type="button" class="quiet" style="width:100%;min-height:36px" data-refresh-time-crystal>重新讀取道具狀態</button>'
      : owned
        ? '<button class="primary" type="button" style="width:100%;min-height:38px" data-use-time-crystal ' +
          (timeCrystalBusy || pending || left > 0 || !statusReady ? 'disabled' : '') + '>' +
          (pending ? '效果已啟用' : left > 0 ? '冷卻中 ' + timeText : '⌛ 使用時序結晶') + '</button>'
        : '<button class="primary" type="button" style="width:100%;min-height:38px" data-craft-time-crystal ' +
          (timeCrystalBusy || !statusReady || !complete ? 'disabled' : '') + '>合成時序結晶</button>';

    let picker = '';
    if (timeCrystalPickerSlot && !owned) {
      const selectedSlot = slots.find(item => item.slot === timeCrystalPickerSlot);
      const available = selectedSlot
        ? selectedSlot.ids.map(id => byId(id)).filter(dice => dice && Number(state.bag?.[dice.id]) > 0)
        : [];
      const options = available.length
        ? available.map(dice => {
            const selected = timeCrystalSelectedDieId === dice.id;
            return '<button type="button" class="time-crystal-die-option' + (selected ? ' selected' : '') +
              '" data-time-crystal-select="' + dice.id + '" aria-pressed="' + selected + '">' +
              '<span>' + (dice.icon || '🎲') + ' ' + escapeHTML(dice.name) + '</span>' +
              '<span>×' + format(Number(state.bag?.[dice.id]) || 0) + '</span></button>';
          }).join('')
        : '<p class="mini">背包中沒有符合這項材料的骰子。</p>';
      picker = '<div class="pet-sell-modal time-crystal-picker" role="dialog" aria-modal="true" aria-labelledby="timeCrystalPickerTitle">' +
        '<div class="pet-sell-dialog">' +
        '<div class="section-head"><h3 id="timeCrystalPickerTitle" style="margin:0">選擇投入材料</h3>' +
        '<button type="button" class="quiet" data-time-crystal-cancel>關閉</button></div>' +
        '<p class="mini">選擇一顆 ' + (selectedSlot?.label || '配方材料') + '，確認後會從背包消耗。</p>' +
        '<div class="time-crystal-die-options">' + options + '</div>' +
        '<div class="pet-sell-actions"><button type="button" class="quiet" data-time-crystal-cancel>取消</button>' +
        '<button type="button" class="primary" data-time-crystal-confirm ' +
        (!available.some(dice => dice.id === timeCrystalSelectedDieId) || timeCrystalBusy ? 'disabled' : '') +
        '>' + (timeCrystalBusy ? '正在投入…' : '確認投入') + '</button></div></div></div>';
    }

    const progress = slots.filter(item => {
      const id = materials[item.slot];
      return typeof id === 'string' && item.ids.includes(id);
    }).length;
    const expanded = owned || timeCrystalExpanded;
    const heading = owned
      ? '<div class="section-head time-crystal-heading"><h3 style="margin:0">⌛ 時序結晶</h3><span class="pill">已合成</span></div>'
      : '<button type="button" class="time-crystal-toggle" data-time-crystal-toggle aria-expanded="' + expanded + '">' +
        '<span class="time-crystal-toggle-title">⌛ 時序結晶</span>' +
        '<span class="pill">' + (statusReady ? progress + '/3' : '讀取中') + '</span>' +
        '<span class="time-crystal-toggle-chevron">' + (expanded ? '⌃' : '⌄') + '</span></button>';

    itemWorkshopList.innerHTML +=
      '<div class="recipe weather-converter-card time-crystal-card" style="display:block;padding:12px;margin-top:10px">' +
      heading +
      (owned
        ? '<p class="time-crystal-description">可使下個天氣延長20%時間</p>' + button +
          '<p class="mini time-crystal-caption">可重複使用，每次使用後冷卻 1 小時。</p>'
        : expanded
          ? '<p class="time-crystal-description">可使下個天氣延長20%時間</p>' +
            '<div class="time-crystal-material-list">' + rows + '</div>' + button +
            '<p class="mini time-crystal-caption">' + status + '</p>' + picker
          : '') +
      '</div>';
  }

  function openTimeCrystalMaterialPicker(slot) {
    const user = getCurrentUser();
    if (!user || !supabaseClient) {
      openAuth();
      toast('請先登入雲端帳號');
      return;
    }
    if (!['time', 'void', 'glitch'].includes(slot) || timeCrystalBusy) return;
    const materials = timeCrystalStatus?.materials || {};
    if (materials[slot]) return;
    timeCrystalPickerSlot = slot;
    timeCrystalSelectedDieId = null;
    timeCrystalExpanded = true;
    renderGloves();
  }

  async function depositTimeCrystalMaterial() {
    const user = getCurrentUser();
    if (!user || !supabaseClient) {
      openAuth();
      toast('請先登入雲端帳號');
      return;
    }
    if (timeCrystalBusy || !timeCrystalPickerSlot || !timeCrystalSelectedDieId) return;
    const slot = timeCrystalPickerSlot;
    const dieId = timeCrystalSelectedDieId;
    const valid = slot === 'time' ? dieId === 'd15'
      : slot === 'void' ? dieId === 'd14'
      : slot === 'glitch' ? !!D.find(dice => dice.id === dieId && dice.glitchBonus)
      : false;
    if (!valid || Number(getState().bag?.[dieId]) < 1) {
      toast('背包中沒有可投入的對應骰子，請重新整理背包');
      return;
    }
    timeCrystalBusy = true;
    toast('正在確認投入材料…');
    renderGloves();
    try {
      const flushed = await flushCloudSave();
      if (flushed === false) throw new Error('雲端存檔尚未同步完成，材料尚未投入，請稍後重試');
      if (getCurrentUser()?.id !== user.id) throw new Error('登入帳號已切換，請重新操作');
      const { data, error } = await supabaseClient.rpc('deposit_time_crystal_material', {
        p_die_id: dieId,
        p_expected_user_id: user.id
      });
      if (error) throw error;
      if (!data?.ok || !data?.bag || !data?.materials || !data?.updated_at) throw new Error('伺服器未確認材料投入結果');
      if (getCurrentUser()?.id !== user.id) throw new Error('登入帳號已切換，請重新載入存檔');
      if (typeof adoptServerBag !== 'function' || !adoptServerBag(data.bag, data.updated_at)) {
        throw new Error('材料已由伺服器處理，但本機存檔同步基準未能更新，請重新載入遊戲');
      }
      timeCrystalStatus = { ...(timeCrystalStatus || {}), materials: data.materials };
      timeCrystalPickerSlot = null;
      timeCrystalSelectedDieId = null;
      render();
      toast('材料已投入工坊');
    } catch (error) {
      console.error('Time Crystal material deposit failed', error);
      if (/already deposited|已投入/.test(error.message || '')) {
        timeCrystalPickerSlot = null;
        timeCrystalSelectedDieId = null;
        await loadTimeCrystalStatus(true);
      }
      toast(error.message || '材料投入失敗，請稍後重試');
    } finally {
      timeCrystalBusy = false;
      renderGloves();
    }
  }

  function canCraft(item) {
    const state = getState();
    return item.recipe.every(([id, count]) => (state.bag[id] || 0) >= count);
  }

  function renderGloves() {
    const activeUser = getCurrentUser();
    if (activeUser?.id) {
      if (timeCrystalStatusUserId !== activeUser.id && !timeCrystalStatusLoading && !timeCrystalBusy) void loadTimeCrystalStatus();
    } else if (timeCrystalStatusUserId) {
      timeCrystalStatus = null;
      timeCrystalStatusUserId = null;
      timeCrystalPickerSlot = null;
      timeCrystalSelectedDieId = null;
      timeCrystalExpanded = false;
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
    const materials = timeCrystalStatus?.materials || {};
    if (!materials.time || !materials.void || !materials.glitch) {
      toast('請先投入全部三種材料');
      return;
    }
    timeCrystalBusy = true;
    renderGloves();
    try {
      if (getCurrentUser()?.id !== user.id) throw new Error('登入帳號已切換，請重新操作');
      const { data, error } = await supabaseClient.rpc('craft_time_crystal');
      if (error) throw error;
      if (!data?.ok || !data?.owned) throw new Error('伺服器未確認合成結果');
      await loadTimeCrystalStatus(true);
      render();
      toast('合成成功：時序結晶已放入道具工坊');
    } catch (error) {
      console.error('Time Crystal crafting failed', error);
      toast(error.message || '時序結晶合成失敗，請稍後重試');
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
      const refreshTimeCrystalButton = target.closest('[data-refresh-time-crystal]');
      const toggleTimeCrystalButton = target.closest('[data-time-crystal-toggle]');
      const addTimeCrystalButton = target.closest('[data-time-crystal-add]');
      const selectTimeCrystalDieButton = target.closest('[data-time-crystal-select]');
      const confirmTimeCrystalButton = target.closest('[data-time-crystal-confirm]');
      const cancelTimeCrystalButton = target.closest('[data-time-crystal-cancel]');
      if (purchaseButton) purchaseGlove(purchaseButton.dataset.gloveAction);
      if (craftGloveButton) craft(craftGloveButton.dataset.craft);
      if (craftTimeCrystalButton) craftTimeCrystal();
      if (useTimeCrystalButton) activateTimeCrystal();
      if (refreshTimeCrystalButton) loadTimeCrystalStatus(true).then(renderGloves);
      if (toggleTimeCrystalButton) {
        timeCrystalExpanded = !timeCrystalExpanded;
        renderGloves();
      }
      if (addTimeCrystalButton) openTimeCrystalMaterialPicker(addTimeCrystalButton.dataset.timeCrystalAdd);
      if (selectTimeCrystalDieButton) {
        timeCrystalSelectedDieId = selectTimeCrystalDieButton.dataset.timeCrystalSelect;
        renderGloves();
      }
      if (confirmTimeCrystalButton) {
        event.preventDefault?.();
        return depositTimeCrystalMaterial();
      }
      if (cancelTimeCrystalButton) {
        timeCrystalPickerSlot = null;
        timeCrystalSelectedDieId = null;
        renderGloves();
      }
      const equipButton = target.closest('[data-equip]');
      if (equipButton) {
        const state = getState();
        state.equipped = equipButton.dataset.equip;
        save();
        render();
        toast('已裝備' + glove(state.equipped).name);
      }
    });
    if (timerManager?.setInterval && !timeCrystalTicker) {
      timeCrystalTicker = timerManager.setInterval(() => {
        if (getCurrentUser()?.id && timeCrystalStatusUserId === getCurrentUser()?.id && timeCrystalStatus?.owned) {
          renderGloves();
        }
      }, 1000, 'time-crystal-ui');
    }
    return true;
  }

  return { canCraft, renderGloves, purchaseGlove, craft, craftTimeCrystal, depositTimeCrystalMaterial, activateTimeCrystal, loadTimeCrystalStatus, setupGloveUI };
}
