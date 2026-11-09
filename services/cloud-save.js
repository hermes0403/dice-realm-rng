export function createCloudSaveService(dependencies) {
  const {
    KEY, D, POTIONS, supabaseClient,
    getState, setState, getCurrentUser,
    fresh, normalizeGloves, migrateCurrency, ensurePetData,
    restoreAutoSellPrefs, totalUnique, render, refreshLeaderboards,
    toast, openAuth, showAuthMessage, timerManager,
    localStorageRef = globalThis.localStorage,
    documentRef = globalThis.document,
    windowRef = globalThis.window
  } = dependencies;
  const localStorage = localStorageRef;
  const document = documentRef;
  const windowObject = windowRef;

  let cloudSyncTimer = null;
  let cloudSyncBusy = false;
  let cloudSyncPending = false;
  let cloudSyncBlocked = false;
  let lastCloudSyncAt = 0;
  let exitFlushPromise = null;
  let lastExitFlushAt = 0;
  // Optimistic version + last acknowledged snapshot prevent stale writes and no-op uploads.
  let cloudSaveVersion = null;
  let lastSyncedPayload = null;
  let lastSyncedUserId = null;
  let cloudLoadInProgressUserId = null;
  const CLOUD_SYNC_MIN_INTERVAL = 5 * 60 * 1000;

  function isProjectRestrictionError(error) {
    const candidates = [error, error?.cause, error?.cause?.cause].filter(Boolean);
    const message = candidates.flatMap(candidate => [
      candidate?.message, candidate?.details, candidate?.hint, candidate?.reason, candidate?.code
    ]).filter(Boolean).join(' ').toLowerCase();
    return candidates.some(candidate =>
      Number(candidate?.status ?? candidate?.statusCode ?? candidate?.code) === 402
    ) || message.includes('exceed_egress_quota')
      || message.includes('project is restricted')
      || message.includes('egress quota');
  }
  function markCloudSyncBlocked(error) {
    if (!isProjectRestrictionError(error)) return false;
    const wasAlreadyBlocked = cloudSyncBlocked;
    cloudSyncBlocked = true;
    cloudSyncPending = false;
    if (!wasAlreadyBlocked) {
      try {
        const disconnectResult = supabaseClient?.realtime?.disconnect?.();
        if (disconnectResult && typeof disconnectResult.catch === 'function') {
          disconnectResult.catch(disconnectError => console.debug('Realtime disconnect skipped after cloud restriction', disconnectError));
        }
      } catch (disconnectError) {
        console.debug('Realtime disconnect skipped after cloud restriction', disconnectError);
      }
      for (const scope of ['presence-heartbeat', 'visit-tracking', 'weather-refresh', 'global-boost-refresh']) {
        timerManager?.clearScope?.(scope);
      }
    }
    if (cloudSyncTimer) {
      timerManager.clearTimeout(cloudSyncTimer);
      cloudSyncTimer = null;
    }
    const status = document?.getElementById?.('saveStatus');
    if (status) status.textContent = '本機已保存（雲端服務受限）';
    return true;
  }

  function userSaveKey(userId = getCurrentUser()?.id) {
    return userId ? KEY + '_user_' + String(userId) : null;
  }

  function localDirtyMarkerKey(userId) {
    return KEY + '_cloud_dirty_' + encodeURIComponent(String(userId));
  }

  function readLocalDirtyMarker(userId) {
    try {
      const raw = localStorage.getItem(localDirtyMarkerKey(userId));
      if (!raw) return null;
      const marker = JSON.parse(raw);
      return marker && typeof marker === 'object'
        ? marker
        : { userId: String(userId), baseVersion: null };
    } catch {
      return { userId: String(userId), baseVersion: null };
    }
  }

  function markLocalSaveDirty(userId) {
    if (!userId) return;
    const existing = readLocalDirtyMarker(userId);
    const marker = existing || {
      userId: String(userId),
      baseVersion: lastSyncedUserId === userId ? cloudSaveVersion : null,
      createdAt: Date.now()
    };
    marker.updatedAt = Date.now();
    try { localStorage.setItem(localDirtyMarkerKey(userId), JSON.stringify(marker)); }
    catch (error) { console.warn('Could not persist local save recovery marker', error); }
  }

  function clearLocalSaveDirty(userId) {
    if (!userId) return;
    try { localStorage.removeItem(localDirtyMarkerKey(userId)); } catch {}
  }

  function restoreLocalSaveForRecovery(localSave) {
    if (!localSave || typeof localSave !== 'object') return false;
    const S = migrateCurrency(normalizeGloves({ ...fresh(), ...localSave }));
    S.pets = Array.isArray(S.pets) ? S.pets.slice(0, 20) : [];
    ensurePetData(S.pets);
    S.equippedPetUids = Array.isArray(S.equippedPetUids)
      ? [...new Set(S.equippedPetUids)].filter(uid => S.pets.some(pet => String(pet.uid) === String(uid))).slice(0, 3)
      : [];
    S.bagCapacity = Math.min(200, Math.max(35, Math.floor(Number(S.bagCapacity) || 35)));
    S.potions = S.potions || fresh().potions;
    S.potions.inventory = Object.assign({ luck1: 0, luck2: 0, luck3: 0, speed1: 0, speed2: 0, angel1: 0, angel2: 0 }, S.potions.inventory || {});
    S.potions.active = S.potions.active || { type: '', expiresAt: 0 };
    S.potions.activeSpeed = S.potions.activeSpeed || { type: '', expiresAt: 0 };
    S.potions.angelCharges = Number(S.potions.angelCharges) || 0;
    S.potions.materials = S.potions.materials || {};
    S.potions.autoAddPotions = Array.isArray(S.potions.autoAddPotions) ? S.potions.autoAddPotions.slice(0, 2) : [];
    S.bag = S.bag || {};
    S.first = S.first || {};
    S.quest = S.quest || { rolls: 0, rare: 0, craft: 0 };
    S.achievements = S.achievements || {};
    S.adminGrantApplied = S.adminGrantApplied || {};
    S.halloweenUnlocked = S.halloweenUnlocked || { d33: false, d34: false };
    setState(S);
    restoreAutoSellPrefs();
    try {
      const scopedKey = userSaveKey(getCurrentUser()?.id);
      if (scopedKey) localStorage.setItem(scopedKey, JSON.stringify(S));
      localStorage.setItem(KEY, JSON.stringify(S));
    } catch {}
    render();
    return true;
  }

  async function recoverLocalSave(user, marker, localSave, remoteData, skipSync = false) {
    const latestLocalSave = (() => {
      try {
        return JSON.parse(localStorage.getItem(userSaveKey(user.id)) || 'null') || localSave;
      } catch {
        return localSave;
      }
    })();
    restoreLocalSaveForRecovery(latestLocalSave);

    let canSafelySync = marker?.baseVersion != null;
    if (!canSafelySync && !skipSync) {
      let remote = remoteData;
      if (remote === undefined) {
        const { data, error } = await supabaseClient.from('game_saves')
          .select('updated_at').eq('user_id', user.id).maybeSingle();
        if (error) throw error;
        remote = data;
      }
      canSafelySync = !remote;
    }

    if (canSafelySync && !skipSync && !cloudSyncBlocked) {
      cloudSaveVersion = marker?.baseVersion ?? null;
      lastSyncedPayload = null;
      lastSyncedUserId = user.id;
      document.getElementById('saveStatus').textContent = '本機進度已保留，正在安全檢查雲端版本…';
      scheduleCloudSync();
      return false;
    }

    cloudSaveVersion = null;
    lastSyncedPayload = null;
    lastSyncedUserId = null;
    document.getElementById('saveStatus').textContent = '本機進度已保留（雲端另有版本，尚未同步）';
    toast('偵測到尚未同步的本機進度，已保留本機資料；為避免覆蓋其他裝置的新存檔，暫不載入雲端版本。');
    return false;
  }

  function stableSerialize(value) {
    if (Array.isArray(value)) return '[' + value.map(stableSerialize).join(',') + ']';
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableSerialize(value[key])).join(',') + '}';
    }
    return JSON.stringify(value);
  }

  function clonePayload(value) {
    return value == null ? null : JSON.parse(JSON.stringify(value));
  }

  function diffPayload(previous, current) {
    if (!previous) return clonePayload(current) || {};
    const patch = {};
    for (const key of Object.keys(current)) {
      if (stableSerialize(previous[key]) !== stableSerialize(current[key])) {
        patch[key] = clonePayload(current[key]);
      }
    }
    return patch;
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
    if (!user || !supabaseClient || cloudSyncBlocked) return false;
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
      markCloudSyncBlocked(e);
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
    if (!initialUser || !supabaseClient || cloudSyncBlocked) return false;
    if (lastSyncedUserId !== initialUser.id) {
      document.getElementById('saveStatus').textContent = '雲端存檔尚未載入';
      return false;
    }
    if (cloudSyncBusy) {
      cloudSyncPending = true;
      return false;
    }
    cloudSyncPending = false;
    cloudSyncBusy = true;
    const syncingUserId = initialUser.id;
    try {
      await applyPendingGrants();
      if (cloudSyncBlocked || getCurrentUser()?.id !== syncingUserId) return false;
      const S = getState();
      const payload = savePayload();
      const patch = diffPayload(lastSyncedPayload, payload);

      // No changed save fields means no game_saves request at all.
      if (Object.keys(patch).length === 0) {
        document.getElementById('saveStatus').textContent = '雲端已同步';
        if (!cloudSyncPending) clearLocalSaveDirty(syncingUserId);
        return true;
      }

      const profilePayload = {
        username: (S.name || '旅人').trim().slice(0, 20) || '旅人',
        unique_dice: totalUnique(),
        rarest_den: Number(S.best?.den) || 0,
        ...achievementStats()
      };
      lastCloudSyncAt = Date.now();
      const { data: syncResult, error } = await supabaseClient.rpc('sync_player_game_save_delta', {
        p_expected_updated_at: cloudSaveVersion,
        p_save_patch: patch,
        p_profile: profilePayload
      });
      if (error) throw error;
      if (!syncResult?.ok) {
        if (syncResult?.conflict) {
          document.getElementById('saveStatus').textContent = '偵測到其他裝置更新，正在載入最新存檔…';
          await loadCloudSave({ syncAfterLoad: false, skipLocalRecovery: true });
          toast('偵測到其他裝置已更新雲端存檔；為避免覆蓋，本機尚未同步的進度已保留，請先確認兩邊資料。');
          return false;
        }
        throw new Error(syncResult?.message || 'Cloud save version check failed');
      }
      if (getCurrentUser()?.id !== syncingUserId) return false;
      cloudSaveVersion = syncResult.updated_at || null;
      if (Number.isFinite(Number(syncResult.total_rolls))) {
        S.rolls = Math.max(Number(S.rolls) || 0, Number(syncResult.total_rolls));
        payload.rolls = S.rolls;
      }
      S.petIncomePending = 0;
      lastSyncedPayload = clonePayload(payload);
      if (!cloudSyncPending && stableSerialize(savePayload()) === stableSerialize(lastSyncedPayload)) {
        clearLocalSaveDirty(syncingUserId);
      }
      try {
        localStorage.setItem(KEY, JSON.stringify(S));
        const scopedKey = userSaveKey(syncingUserId);
        if (scopedKey) localStorage.setItem(scopedKey, JSON.stringify(S));
      } catch (e) {}
      document.getElementById('saveStatus').textContent = '雲端已同步';
      return true;
    } catch (e) {
      console.error('Cloud sync failed', e);
      markLocalSaveDirty(syncingUserId);
      const restricted = markCloudSyncBlocked(e);
      cloudSyncPending = !restricted && getCurrentUser()?.id === syncingUserId;
      document.getElementById('saveStatus').textContent = restricted
        ? '本機已保存（雲端服務受限）'
        : '雲端同步失敗';
      return false;
    } finally {
      cloudSyncBusy = false;
      if (cloudSyncPending && !cloudSyncBlocked) scheduleCloudSync();
    }
  }

  function scheduleCloudSync() {
    const user = getCurrentUser();
    if (!user || !supabaseClient) return;
    if (lastSyncedUserId !== user.id) {
      cloudSyncPending = false;
      return;
    }
    if (cloudSyncBlocked) {
      cloudSyncPending = false;
      return;
    }
    cloudSyncPending = true;
    if (cloudSyncBusy || cloudSyncTimer) return;
    const elapsed = Date.now() - lastCloudSyncAt;
    const delay = lastCloudSyncAt
      ? Math.max(700, CLOUD_SYNC_MIN_INTERVAL - elapsed)
      : 700;
    const timer = timerManager.setTimeout(() => {
      if (cloudSyncTimer !== timer) return;
      cloudSyncTimer = null;
      if (!cloudSyncPending) return;
      cloudSyncPending = false;
      void syncCloudSave();
    }, delay, 'cloud-save-throttle');
    cloudSyncTimer = timer;
  }

  function scheduleSync() {
    if (!getCurrentUser()) return;
    scheduleCloudSync();
  }

  function save() {
    const S = getState();
    const user = getCurrentUser();
    if (user) {
      let previousLocal = null;
      try { previousLocal = localStorage.getItem(userSaveKey(user.id)); } catch {}
      const currentLocal = JSON.stringify(S);
      const localChanged = previousLocal !== currentLocal;
      const hasCloudChanges = lastSyncedUserId === user.id
        && Object.keys(diffPayload(lastSyncedPayload, savePayload())).length > 0;
      if (hasCloudChanges || ((cloudSyncBlocked || cloudLoadInProgressUserId === user.id) && localChanged)) {
        markLocalSaveDirty(user.id);
      }
    }
    try { const scopedKey = userSaveKey(); if (scopedKey) localStorage.setItem(scopedKey, JSON.stringify(S)); } catch (e) {}
    localStorage.setItem(KEY, JSON.stringify(S));
    document.getElementById('saveStatus').textContent = getCurrentUser()
      ? (cloudSyncBlocked ? '本機已保存（雲端服務受限）' : '雲端同步中…')
      : '本機存檔';
    if (getCurrentUser()) scheduleSync();
  }

  async function flushCloudSave() {
    if (!getCurrentUser() || !supabaseClient || cloudSyncBlocked) return false;
    if (cloudSyncTimer) {
      timerManager.clearTimeout(cloudSyncTimer);
      cloudSyncTimer = null;
    }
    cloudSyncPending = false;
    while (cloudSyncBusy) {
      await new Promise(resolve => timerManager.setTimeout(resolve, 100, 'cloud-save-flush-wait'));
    }
    return await syncCloudSave() === true;
  }

  async function flushOnExit(reason) {
    if (!getCurrentUser() || !supabaseClient) return false;
    if (exitFlushPromise) return exitFlushPromise;
    if (Date.now() - lastExitFlushAt < 1500) return false;
    lastExitFlushAt = Date.now();
    exitFlushPromise = flushCloudSave().finally(() => { exitFlushPromise = null; });
    const saved = await exitFlushPromise;
    if (saved !== true) console.warn('Final cloud backup did not complete:', reason);
    return saved === true;
  }

  document?.addEventListener?.('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushOnExit('visibilitychange');
  });
  windowObject?.addEventListener?.('pagehide', () => { void flushOnExit('pagehide'); });

  async function loadCloudSave({ syncAfterLoad = true, skipLocalRecovery = false } = {}) {
    const user = getCurrentUser();
    if (!user || !supabaseClient || cloudSyncBlocked) return false;
    try {
      const scopedKey = userSaveKey(user.id);
      const localSaveBeforeCloud = (() => {
        try { return JSON.parse(scopedKey ? localStorage.getItem(scopedKey) || 'null' : 'null'); }
        catch { return null; }
      })();
      const existingDirtyMarker = readLocalDirtyMarker(user.id);
      if (existingDirtyMarker) {
        return await recoverLocalSave(user, existingDirtyMarker, localSaveBeforeCloud, undefined, skipLocalRecovery);
      }
      cloudLoadInProgressUserId = user.id;
      const localPetDiscoveredBeforeCloud = { ...(getState()?.petDiscovered || {}) };
      const { data, error } = await supabaseClient.from('game_saves').select('save_data,updated_at').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      if (getCurrentUser()?.id !== user.id) return;
      const dirtyDuringLoad = readLocalDirtyMarker(user.id);
      if (dirtyDuringLoad) {
        let latestLocalSave = localSaveBeforeCloud;
        try { latestLocalSave = JSON.parse(localStorage.getItem(scopedKey) || 'null') || localSaveBeforeCloud; } catch {}
        return await recoverLocalSave(user, dirtyDuringLoad, latestLocalSave, data, skipLocalRecovery);
      }
      cloudSaveVersion = data?.updated_at || null;
      lastSyncedPayload = clonePayload(data?.save_data || null);
      lastSyncedUserId = user.id;
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
      await applyPendingGrants();
      if (syncAfterLoad) {
        const currentPayload = savePayload();
        if (!lastSyncedPayload || Object.keys(diffPayload(lastSyncedPayload, currentPayload)).length > 0) {
          if (!(await syncCloudSave())) return false;
        } else {
          document.getElementById('saveStatus').textContent = '雲端存檔已載入';
        }
      }
      if (!cloudSyncBlocked) await refreshLeaderboards();
      return !cloudSyncBlocked;
    } catch (e) {
      console.error(e);
      const restricted = markCloudSyncBlocked(e);
      if (/user.?banned|banned|被停權|已停權/i.test(String(e?.message || ''))) {
        await supabaseClient?.auth.signOut().catch(() => {});
        openAuth();
        showAuthMessage('偵測到違反遊戲規則\n已停權此帳號');
        document.getElementById('authMessage').style.whiteSpace = 'pre-line';
      } else if (restricted) {
        document.getElementById('saveStatus').textContent = '本機存檔（雲端服務受限）';
        toast('雲端服務目前受限，遊戲資料已保留在本機；雲端恢復後請重新載入。');
      } else {
        toast('讀取雲端存檔失敗，請重新登入');
      }
      return false;
    } finally {
      if (cloudLoadInProgressUserId === user.id) cloudLoadInProgressUserId = null;
    }
  }

  return { userSaveKey, save, savePayload, achievementStats, applyPendingGrants, syncCloudSave, flushCloudSave, loadCloudSave, scheduleSync, flushOnExit, isCloudSyncBlocked: () => cloudSyncBlocked, markCloudSyncBlocked };
}
