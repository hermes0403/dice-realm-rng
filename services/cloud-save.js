export function createCloudSaveService(dependencies) {
  const {
    KEY, D, POTIONS, supabaseClient,
    getState, setState, getCurrentUser,
    fresh, normalizeGloves, migrateCurrency, ensurePetData,
    restoreAutoSellPrefs, totalUnique, render, refreshLeaderboards,
    toast, openAuth, showAuthMessage, timerManager,
    localStorageRef = globalThis.localStorage,
    documentRef = globalThis.document
  } = dependencies;
  const localStorage = localStorageRef;
  const document = documentRef;

  let cloudSyncTimer = null;
  let cloudSyncBusy = false;
  // Version captured when this client loads the cloud save; stale tabs cannot overwrite newer saves.
  let cloudSaveVersion = null;

  function userSaveKey(userId = getCurrentUser()?.id) {
    return userId ? KEY + '_user_' + String(userId) : null;
  }

  function savePayload() {
    const S = getState();
    return {
      dumplingWeatherRewardClaimed: !!S.dumplingWeatherRewardClaimed,
      pets: Array.isArray(S.pets) ? S.pets : [],
      equippedPetUids: Array.isArray(S.equippedPetUids) ? S.equippedPetUids.slice(0, 3) : [],
      petDiscovered: S.petDiscovered || {},
      petSkillLuckCharges: Number(S.petSkillLuckCharges) || 0,
      petSkillDaily: S.petSkillDaily || {},
      name: S.name, joined: S.joined, rolls: S.rolls, bag: S.bag,
      bagCapacity: S.bagCapacity, first: S.first, rollCounts: S.rollCounts || {},
      gloves: S.gloves, equipped: S.equipped, best: S.best, coins: S.coins,
      currencyVersion: 2, adminGrantApplied: S.adminGrantApplied || {},
      autoSellThreshold: S.autoSellThreshold, autoDeleteDice: S.autoDeleteDice || [],
      autoSold: S.autoSold, autoDepositWeatherEnabled: !!S.autoDepositWeatherEnabled,
      autoDepositThreshold: Number(S.autoDepositThreshold) || 700,
      autoDepositDice: S.autoDepositDice || [], questDate: S.questDate, quest: S.quest,
      dailyQuestCompletions: Number(S.dailyQuestCompletions) || 0,
      weatherConvertAt: Number(S.weatherConvertAt) || 0,
      achievements: S.achievements, potions: S.potions,
      petAutoSellRarities: S.petAutoSellRarities || {},
      halloweenUnlocked: S.halloweenUnlocked || { d33: false, d34: false }
    };
  }

  function achievementStats() {
    const entries = Object.values(getState().achievements || {}).filter(a => a && (a.unlockedAt || a.rewardGiven));
    const times = entries.map(a => a.unlockedAt).filter(Boolean).sort();
    return { achievement_count: entries.length, achievement_reached_at: times.length ? times[times.length - 1] : null };
  }

  async function applyPendingGrants() {
    const user = getCurrentUser();
    if (!user || !supabaseClient) return false;
    const S = getState();
    S.adminGrantApplied = S.adminGrantApplied || {};
    S.potions = S.potions || fresh().potions;
    S.potions.inventory = Object.assign({ luck1: 0, luck2: 0, luck3: 0, speed1: 0, speed2: 0, angel1: 0, angel2: 0 }, S.potions.inventory || {});
    try {
      const { data, error } = await supabaseClient.from('player_grants')
        .select('coins_total,luck1_total,luck2_total,luck3_total,angel1_total,angel2_total,dice_grants')
        .eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      if (!data || getCurrentUser()?.id !== user.id) return false;
      let changed = false;
      for (const col of ['coins_total', 'luck1_total', 'luck2_total', 'luck3_total', 'angel1_total', 'angel2_total']) {
        const total = Math.max(0, Number(data[col]) || 0);
        const applied = Math.max(0, Number(S.adminGrantApplied[col]) || 0);
        const delta = Math.max(0, total - applied);
        if (delta > 0) {
          if (col === 'coins_total') S.coins = (Number(S.coins) || 0) + delta;
          else {
            const id = col.replace('_total', '');
            S.potions.inventory[id] = (Number(S.potions.inventory[id]) || 0) + delta;
          }
          changed = true;
        }
        S.adminGrantApplied[col] = Math.max(applied, total);
      }
      const diceGrants = data.dice_grants && typeof data.dice_grants === 'object' ? data.dice_grants : {};
      for (const [diceId, rawTotal] of Object.entries(diceGrants)) {
        if (!/^d[0-9]+$/.test(diceId)) continue;
        const col = 'dice_' + diceId;
        const total = Math.max(0, Number(rawTotal) || 0);
        const applied = Math.max(0, Number(S.adminGrantApplied[col]) || 0);
        const delta = Math.max(0, total - applied);
        if (delta > 0) {
          S.bag = S.bag || {};
          S.first = S.first || {};
          S.bag[diceId] = (Number(S.bag[diceId]) || 0) + delta;
          if (!S.first[diceId]) S.first[diceId] = new Date().toISOString();
          changed = true;
        }
        S.adminGrantApplied[col] = Math.max(applied, total);
      }
      if (changed) {
        localStorage.setItem(KEY, JSON.stringify(S));
        const scopedKey = userSaveKey(user.id);
        if (scopedKey) localStorage.setItem(scopedKey, JSON.stringify(S));
      }
      return changed;
    } catch (e) {
      console.warn('Admin grant sync failed', e);
      return false;
    }
  }

  async function syncCloudSave() {
    if (cloudSyncTimer) {
      timerManager.clearTimeout(cloudSyncTimer);
      cloudSyncTimer = null;
    }
    const initialUser = getCurrentUser();
    if (!initialUser || !supabaseClient) return;
    if (cloudSyncBusy) {
      scheduleCloudSync(1200);
      return;
    }
    cloudSyncBusy = true;
    const syncingUserId = initialUser.id;
    try {
      await applyPendingGrants();
      if (getCurrentUser()?.id !== syncingUserId) return;
      const S = getState();
      const payload = savePayload();
      const now = new Date().toISOString();
      const profilePayload = {
        username: (S.name || '旅人').trim().slice(0, 20) || '旅人',
        total_rolls: Number(S.rolls) || 0,
        unique_dice: totalUnique(),
        rarest_den: Number(S.best?.den) || 0,
        coins: Number(S.coins) || 0,
        ...achievementStats()
      };
      const { data: syncResult, error } = await supabaseClient.rpc('sync_player_game_save', {
        p_expected_updated_at: cloudSaveVersion,
        p_save_data: payload,
        p_profile: profilePayload
      });
      if (error) throw error;
      if (!syncResult?.ok) {
        if (syncResult?.conflict) {
          document.getElementById('saveStatus').textContent = '偵測到其他裝置更新，正在載入最新存檔…';
          await loadCloudSave();
          toast('偵測到其他分頁或裝置已更新存檔，已載入最新雲端資料；請確認剛才的操作是否需要重做。');
          return;
        }
        throw new Error(syncResult?.message || 'Cloud save version check failed');
      }
      cloudSaveVersion = syncResult.updated_at || null;
      if (Number.isFinite(Number(syncResult.total_rolls))) {
        S.rolls = Math.max(Number(S.rolls) || 0, Number(syncResult.total_rolls));
      }
      S.petIncomePending = 0;
      try {
        localStorage.setItem(KEY, JSON.stringify(S));
        const scopedKey = userSaveKey(syncingUserId);
        if (scopedKey) localStorage.setItem(scopedKey, JSON.stringify(S));
      } catch (e) {}
      document.getElementById('saveStatus').textContent = '雲端已同步';
    } catch (e) {
      console.error('Cloud sync failed', e);
      document.getElementById('saveStatus').textContent = '雲端同步失敗';
    } finally {
      cloudSyncBusy = false;
    }
  }

  function scheduleCloudSync(delay) {
    timerManager.clearTimeout(cloudSyncTimer);
    const timer = timerManager.setTimeout(() => {
      if (cloudSyncTimer !== timer) return;
      cloudSyncTimer = null;
      syncCloudSave();
    }, delay, 'cloud-save-debounce');
    cloudSyncTimer = timer;
  }

  function scheduleSync(delay = 700) {
    if (!getCurrentUser()) return;
    scheduleCloudSync(delay);
  }

  function save() {
    const S = getState();
    try { const scopedKey = userSaveKey(); if (scopedKey) localStorage.setItem(scopedKey, JSON.stringify(S)); } catch (e) {}
    localStorage.setItem(KEY, JSON.stringify(S));
    document.getElementById('saveStatus').textContent = getCurrentUser() ? '雲端同步中…' : '本機存檔';
    if (getCurrentUser()) scheduleSync(700);
  }

  async function flushCloudSave() {
    if (!getCurrentUser() || !supabaseClient) return;
    if (cloudSyncTimer) {
      timerManager.clearTimeout(cloudSyncTimer);
      cloudSyncTimer = null;
    }
    while (cloudSyncBusy) await new Promise(resolve => timerManager.setTimeout(resolve, 100, 'cloud-save-flush-wait'));
    await syncCloudSave();
    while (cloudSyncBusy) await new Promise(resolve => timerManager.setTimeout(resolve, 100, 'cloud-save-flush-wait'));
  }

  async function loadCloudSave({ syncAfterLoad = true } = {}) {
    const user = getCurrentUser();
    if (!user || !supabaseClient) return;
    try {
      const scopedKey = userSaveKey(user.id);
      const localSaveBeforeCloud = (() => {
        try { return JSON.parse(scopedKey ? localStorage.getItem(scopedKey) || 'null' : 'null'); }
        catch { return null; }
      })();
      const localPetDiscoveredBeforeCloud = { ...(getState()?.petDiscovered || {}) };
      const { data, error } = await supabaseClient.from('game_saves').select('save_data,updated_at').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      cloudSaveVersion = data?.updated_at || null;
      if (getCurrentUser()?.id !== user.id) return;
      let S;
      if (data?.save_data?.bag) {
        S = migrateCurrency(normalizeGloves({ ...fresh(), ...data.save_data }));
        S.petIncomePending = Math.max(0, Number(localSaveBeforeCloud?.petIncomePending) || 0);
        if (S.petIncomePending > 0) S.coins = (Number(S.coins) || 0) + S.petIncomePending;
        // Cloud inventory is authoritative. Never union local pet snapshots into it:
        // a stale browser copy could otherwise resurrect a pet already sold on the server.
        S.pets = Array.isArray(data.save_data.pets) ? data.save_data.pets.slice(0, 20) : [];
        ensurePetData(S.pets);
        S.equippedPetUids = Array.isArray(data.save_data.equippedPetUids)
          ? [...new Set(data.save_data.equippedPetUids)].filter(uid => S.pets.some(pet => String(pet.uid) === String(uid))).slice(0, 3)
          : [];
        S.petDiscovered = { ...localPetDiscoveredBeforeCloud, ...(localSaveBeforeCloud?.petDiscovered || {}), ...(data.save_data.petDiscovered || {}) };
        S.petAutoSellRarities = { ...(localSaveBeforeCloud?.petAutoSellRarities || {}), ...(data.save_data.petAutoSellRarities || {}) };
        S.autoDeleteDice = Array.isArray(S.autoDeleteDice) ? S.autoDeleteDice.filter(id => D.some(d => d.id === id && !d.weather && Number(d.den) >= 2 && Number(d.den) <= 600000)) : [];
        S.autoDepositDice = Array.isArray(S.autoDepositDice) ? S.autoDepositDice.filter(id => D.some(d => d.id === id && !!d.weather && Number(d.den) >= 2 && Number(d.den) <= 1000000)) : [];
        S.adminGrantApplied = S.adminGrantApplied || {};
        S.bagCapacity = Math.min(200, Math.max(35, Math.floor(Number(S.bagCapacity) || 35)));
        S.potions = S.potions || fresh().potions;
        S.potions.inventory = Object.assign({ luck1: 0, luck2: 0, luck3: 0, speed1: 0, speed2: 0, angel1: 0, angel2: 0 }, S.potions.inventory || {});
        S.potions.active = S.potions.active || { type: '', expiresAt: 0 };
        S.potions.activeSpeed = S.potions.activeSpeed || { type: '', expiresAt: 0 };
        if (S.potions.active.type && POTIONS.find(p => p.id === S.potions.active.type)?.speed) {
          S.potions.activeSpeed = S.potions.active;
          S.potions.active = { type: '', expiresAt: 0 };
        }
        S.potions.angelCharges = Number(S.potions.angelCharges) || 0;
        S.potions.autoAdd = !!S.potions.autoAdd;
        S.potions.materials = S.potions.materials || {};
        S.potions.autoAddPotions = Array.isArray(S.potions.autoAddPotions) ? S.potions.autoAddPotions.slice(0, 2) : [];
        S.halloweenUnlocked = S.halloweenUnlocked || { d33: false, d34: false };
        S.potions.autoAddPotions = Array.isArray(S.potions.autoAddPotions) ? S.potions.autoAddPotions.slice(0, 2) : [];
        S.bag = S.bag || {};
        S.first = S.first || {};
        S.quest = S.quest || { rolls: 0, rare: 0, craft: 0 };
        S.achievements = S.achievements || {};
        setState(S);
        restoreAutoSellPrefs();
        if (scopedKey) localStorage.setItem(scopedKey, JSON.stringify(S));
        localStorage.setItem(KEY, JSON.stringify(S));
        render();
        document.getElementById('saveStatus').textContent = '雲端存檔已載入';
      } else {
        S = migrateCurrency(normalizeGloves({ ...fresh(), ...(localSaveBeforeCloud?.bag ? localSaveBeforeCloud : {}) }));
        S.petAutoSellRarities = localSaveBeforeCloud?.petAutoSellRarities || {};
        setState(S);
        if (scopedKey) localStorage.setItem(scopedKey, JSON.stringify(S));
        localStorage.setItem(KEY, JSON.stringify(S));
        render();
      }
      const grantsChanged = await applyPendingGrants();
      if (syncAfterLoad && (!data?.save_data?.bag || grantsChanged)) await syncCloudSave();
      await refreshLeaderboards();
    } catch (e) {
      console.error(e);
      if (/user.?banned|banned|被停權|已停權/i.test(String(e?.message || ''))) {
        await supabaseClient?.auth.signOut().catch(() => {});
        openAuth();
        showAuthMessage('偵測到違反遊戲規則\n已停權此帳號');
        document.getElementById('authMessage').style.whiteSpace = 'pre-line';
      } else toast('讀取雲端存檔失敗，請重新登入');
    }
  }

  return { userSaveKey, save, savePayload, achievementStats, applyPendingGrants, syncCloudSave, flushCloudSave, loadCloudSave, scheduleSync };
}
