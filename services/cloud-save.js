export function createCloudSaveService(dependencies) {
  const {
    KEY, D, POTIONS, supabaseClient,
    getState, setState, getCurrentUser,
    fresh, normalizeGloves, migrateCurrency, ensurePetData,
    restoreAutoSellPrefs, totalUnique, getPetIncomePerSecond = () => 0, render, refreshLeaderboards,
    toast, openAuth, showAuthMessage, timerManager,
    localStorageRef = globalThis.localStorage,
    documentRef = globalThis.document,
    windowRef = globalThis.window
  } = dependencies;
  const localStorage = localStorageRef;
  const document = documentRef;
  const windowObject = windowRef;
  const localWriterId = 'writer-' + Date.now() + '-' + Math.random().toString(36).slice(2);

  let cloudSyncTimer = null;
  let cloudSyncBusy = false;
  let cloudSyncPending = false;
  let lastCloudSyncAt = 0;
  // Per-account optimistic version guard for multi-tab and multi-device writes.
  let cloudSaveVersion = null;
  let lastSyncedPayload = null;
  let lastSyncedUserId = null;
  let cloudLoadReadyUserId = null;
  let lastCloudLoadError = null;
  const grantCheckAtByUser = new Map();
  const CLOUD_SYNC_MIN_INTERVAL = 5 * 60 * 1000;
  const GRANT_CHECK_INTERVAL = 5 * 60 * 1000;

  function userSaveKey(userId = getCurrentUser()?.id) {
    return userId ? KEY + '_user_' + String(userId) : null;
  }

  function localSavedAtKey(userId = getCurrentUser()?.id) {
    return userId ? KEY + '_local_saved_at_' + String(userId) : null;
  }

  function cloudBaseHistoryKey(userId = getCurrentUser()?.id) {
    return userId ? KEY + '_cloud_base_history_' + String(userId) : null;
  }

  function readCloudBase(userId, version = null) {
    try {
      const key = cloudBaseHistoryKey(userId);
      const history = JSON.parse(key ? localStorage.getItem(key) || '[]' : '[]');
      if (!Array.isArray(history)) return null;
      if (version) return history.find(entry => entry?.version === version && entry?.payload) || null;
      return history.find(entry => entry?.version && entry?.payload) || null;
    } catch {
      return null;
    }
  }

  function writeCloudBase(userId, payload, version) {
    const key = cloudBaseHistoryKey(userId);
    if (!key) return;
    try {
      const history = JSON.parse(localStorage.getItem(key) || '[]');
      const entries = Array.isArray(history) ? history : [];
      const next = version && payload
        ? [{ version, payload: clonePayload(payload) }, ...entries.filter(entry => entry?.version !== version)]
        : entries;
      localStorage.setItem(key, JSON.stringify(next.slice(0, 4)));
    } catch (error) {
      console.warn('Cloud save baseline cache failed', error);
    }
  }

  function persistLocalSnapshot(state, userId = getCurrentUser()?.id) {
    const snapshot = {
      ...state,
      _cloudBaseVersion: userId ? (cloudSaveVersion || null) : null,
      _cloudWriterId: localWriterId
    };
    try {
      const scopedKey = userSaveKey(userId);
      if (scopedKey) localStorage.setItem(scopedKey, JSON.stringify(snapshot));
      localStorage.setItem(KEY, JSON.stringify(snapshot));
    } catch (error) {
      console.warn('Local save snapshot failed', error);
    }
  }

  function preserveLegacyLocalSnapshot(userId, snapshot, cloudVersion) {
    if (!snapshot || !userId) return;
    try {
      const key = KEY + '_recovery_' + String(userId);
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, JSON.stringify({
        savedAt: Date.now(),
        cloudVersion: cloudVersion || null,
        snapshot: clonePayload(snapshot)
      }));
    } catch (error) {
      console.warn('Legacy local recovery copy failed', error);
    }
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

  function valuesEqual(left, right) {
    return stableSerialize(left) === stableSerialize(right);
  }

  function mergeCounterDelta(baseValue, localValue, cloudValue, allowDecrease = false) {
    const base = Math.max(0, Number(baseValue) || 0);
    const local = Math.max(0, Number(localValue) || 0);
    const cloud = Math.max(0, Number(cloudValue) || 0);
    const delta = allowDecrease ? local - base : Math.max(0, local - base);
    return Math.max(0, cloud + delta);
  }

  function mergeCounterMap(baseValue, localValue, cloudValue, allowDecrease = false) {
    const base = baseValue && typeof baseValue === 'object' ? baseValue : {};
    const local = localValue && typeof localValue === 'object' ? localValue : {};
    const cloud = cloudValue && typeof cloudValue === 'object' ? cloudValue : {};
    const merged = {};
    for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(cloud)])) {
      const count = mergeCounterDelta(base[key], local[key], cloud[key], allowDecrease);
      if (count > 0) merged[key] = count;
    }
    return merged;
  }

  function mergeMaxMap(baseValue, localValue, cloudValue) {
    const base = baseValue && typeof baseValue === 'object' ? baseValue : {};
    const local = localValue && typeof localValue === 'object' ? localValue : {};
    const cloud = cloudValue && typeof cloudValue === 'object' ? cloudValue : {};
    const merged = {};
    for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(cloud)])) {
      const count = Math.max(0, Number(base[key]) || 0, Number(local[key]) || 0, Number(cloud[key]) || 0);
      if (count > 0) merged[key] = count;
    }
    return merged;
  }

  function mergeFirstMap(baseValue, localValue, cloudValue) {
    const base = baseValue && typeof baseValue === 'object' ? baseValue : {};
    const local = localValue && typeof localValue === 'object' ? localValue : {};
    const cloud = cloudValue && typeof cloudValue === 'object' ? cloudValue : {};
    const merged = {};
    for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(cloud)])) {
      const candidates = [base[key], local[key], cloud[key]].filter(value => typeof value === 'string' && value);
      if (!candidates.length) continue;
      candidates.sort((a, b) => {
        const at = Date.parse(a), bt = Date.parse(b);
        if (Number.isFinite(at) && Number.isFinite(bt)) return at - bt;
        return 0;
      });
      merged[key] = candidates[0];
    }
    return merged;
  }

  function mergeSetDelta(baseValue, localValue, cloudValue) {
    const base = new Set(Array.isArray(baseValue) ? baseValue : []);
    const local = new Set(Array.isArray(localValue) ? localValue : []);
    const cloud = new Set(Array.isArray(cloudValue) ? cloudValue : []);
    const merged = new Set(cloud);
    for (const value of new Set([...base, ...local, ...cloud])) {
      if (local.has(value) !== base.has(value)) {
        if (local.has(value)) merged.add(value);
        else merged.delete(value);
      }
    }
    return [...merged];
  }

  function mergePetInstances(baseValue, localValue, cloudValue, preserveCloudRemovals = false) {
    const toMap = value => new Map(
      (Array.isArray(value) ? value : [])
        .filter(pet => pet && typeof pet === 'object' && typeof pet.uid === 'string' && pet.uid)
        .map(pet => [pet.uid, pet])
    );
    const base = toMap(baseValue);
    const local = toMap(localValue);
    const cloudList = Array.isArray(cloudValue) ? cloudValue : [];
    const legacyCloudPets = cloudList.filter(pet => !pet || typeof pet.uid !== 'string' || !pet.uid);
    const merged = toMap(cloudList);

    // In a normal three-way merge, a local removal since the shared baseline
    // is respected. If local lifetime counters regressed, treat that snapshot
    // as stale: keep cloud-side removals authoritative while still retaining
    // locally-created pet UIDs that are absent from the baseline.
    // Regression coverage: tests/cloud-save-pet-authority.test.js.
    if (!preserveCloudRemovals) {
      for (const uid of base.keys()) {
        if (!local.has(uid)) merged.delete(uid);
      }
    }
    for (const [uid, pet] of local) {
      if (!base.has(uid) && !merged.has(uid)) merged.set(uid, clonePayload(pet));
    }
    return [...legacyCloudPets, ...merged.values()];
  }

  function mergeObjectMap(baseValue, localValue, cloudValue, preserveMissing = false) {
    const base = baseValue && typeof baseValue === 'object' ? baseValue : {};
    const local = localValue && typeof localValue === 'object' ? localValue : {};
    const cloud = cloudValue && typeof cloudValue === 'object' ? cloudValue : {};
    const merged = { ...cloud };
    if (preserveMissing) {
      for (const [key, value] of Object.entries(base)) if (!(key in merged)) merged[key] = value;
    }
    for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(cloud)])) {
      const localChanged = !valuesEqual(base[key], local[key]);
      const cloudChanged = !valuesEqual(base[key], cloud[key]);
      if (localChanged && !cloudChanged) {
        if (local[key] === undefined) {
          if (!preserveMissing) delete merged[key];
        } else merged[key] = clonePayload(local[key]);
      } else if (localChanged && cloudChanged && local[key] && cloud[key]
        && typeof local[key] === 'object' && typeof cloud[key] === 'object'
        && !Array.isArray(local[key]) && !Array.isArray(cloud[key])) {
        merged[key] = { ...base[key], ...local[key], ...cloud[key] };
      }
    }
    return merged;
  }

  function mergeCloudSavePayload(baseValue, localValue, cloudValue) {
    const base = baseValue && typeof baseValue === 'object' ? baseValue : {};
    const local = localValue && typeof localValue === 'object' ? localValue : {};
    const cloud = cloudValue && typeof cloudValue === 'object' ? cloudValue : {};
    const merged = clonePayload(cloud) || {};

    // A version-tagged local snapshot can still be stale if another tab
    // overwrote it with older state. Do not merge its regressed counters or
    // removals, but preserve pet UIDs created locally after the shared baseline.
    let localProgressRegressed = (Number(local.rolls) || 0) < (Number(base.rolls) || 0);
    for (const [diceId, count] of Object.entries(base.rollCounts || {})) {
      if ((Number(local.rollCounts?.[diceId]) || 0) < (Number(count) || 0)) localProgressRegressed = true;
    }
    for (const diceId of Object.keys(base.first || {})) {
      if (!local.first?.[diceId]) localProgressRegressed = true;
    }
    if ((Number(base.best?.den) || 0) > (Number(local.best?.den) || 0)) localProgressRegressed = true;
    if (localProgressRegressed) {
      merged.pets = mergePetInstances(base.pets, local.pets, cloud.pets, true);
      const baseEquipped = new Set(Array.isArray(base.equippedPetUids) ? base.equippedPetUids : []);
      const mergedEquipped = new Set(Array.isArray(cloud.equippedPetUids) ? cloud.equippedPetUids : []);
      for (const uid of Array.isArray(local.equippedPetUids) ? local.equippedPetUids : []) {
        if (!baseEquipped.has(uid)) mergedEquipped.add(uid);
      }
      merged.equippedPetUids = [...mergedEquipped]
        .filter(uid => merged.pets.some(pet => String(pet.uid) === String(uid))).slice(0, 3);
      return merged;
    }
    const protectedFields = new Set([
      'rolls', 'rollCounts', 'bag', 'autoSold', 'first', 'best',
      'lockedDice', 'autoDeleteDice', 'autoDepositDice', 'bagCapacity',
      'petDiscovered', 'achievements', 'halloweenUnlocked', 'adminGrantApplied',
      'pets', 'equippedPetUids', 'petAutoSellRarities'
    ]);

    for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(cloud)])) {
      if (protectedFields.has(key)) continue;
      const localChanged = !valuesEqual(base[key], local[key]);
      const cloudChanged = !valuesEqual(base[key], cloud[key]);
      if (localChanged && !cloudChanged) {
        if (local[key] === undefined) delete merged[key];
        else merged[key] = clonePayload(local[key]);
      }
      // If both sides changed a transaction-backed field, cloud wins to avoid
      // duplicating a purchase, sale, grant, potion or other server transaction.
    }

    merged.rolls = mergeCounterDelta(base.rolls, local.rolls, cloud.rolls);
    merged.rollCounts = mergeCounterMap(base.rollCounts, local.rollCounts, cloud.rollCounts);
    merged.bag = mergeCounterMap(base.bag, local.bag, cloud.bag, true);
    merged.autoSold = mergeCounterDelta(base.autoSold, local.autoSold, cloud.autoSold);
    merged.first = mergeFirstMap(base.first, local.first, cloud.first);

    const bestCandidates = [base.best, local.best, cloud.best]
      .filter(item => item && Number(item.den) > 0);
    if (bestCandidates.length) {
      merged.best = bestCandidates.reduce((best, item) =>
        Number(item.den) > Number(best.den) ? item : best
      );
    }

    merged.lockedDice = mergeSetDelta(base.lockedDice, local.lockedDice, cloud.lockedDice);
    merged.autoDeleteDice = mergeSetDelta(base.autoDeleteDice, local.autoDeleteDice, cloud.autoDeleteDice);
    merged.autoDepositDice = mergeSetDelta(base.autoDepositDice, local.autoDepositDice, cloud.autoDepositDice);
    merged.bagCapacity = Math.max(
      Number(base.bagCapacity) || 0,
      Number(local.bagCapacity) || 0,
      Number(cloud.bagCapacity) || 0
    ) || cloud.bagCapacity;

    merged.petDiscovered = mergeObjectMap(base.petDiscovered, local.petDiscovered, cloud.petDiscovered, true);
    merged.adminGrantApplied = mergeMaxMap(base.adminGrantApplied, local.adminGrantApplied, cloud.adminGrantApplied);
    merged.weatherConvertAt = Math.max(
      Number(base.weatherConvertAt) || 0,
      Number(local.weatherConvertAt) || 0,
      Number(cloud.weatherConvertAt) || 0
    );
    merged.achievements = mergeObjectMap(base.achievements, local.achievements, cloud.achievements, true);
    merged.petAutoSellRarities = mergeObjectMap(base.petAutoSellRarities, local.petAutoSellRarities, cloud.petAutoSellRarities);
    merged.halloweenUnlocked = {
      ...(base.halloweenUnlocked || {}),
      ...(local.halloweenUnlocked || {}),
      ...(cloud.halloweenUnlocked || {})
    };
    for (const key of Object.keys(merged.halloweenUnlocked)) {
      merged.halloweenUnlocked[key] = !!(
        base.halloweenUnlocked?.[key] || local.halloweenUnlocked?.[key] || cloud.halloweenUnlocked?.[key]
      );
    }

    // Merge pet inventory by UID delta from the shared baseline. This preserves
    // a locally-created pet during a concurrent cloud update while respecting
    // sales/removals made by either device.
    merged.pets = mergePetInstances(base.pets, local.pets, cloud.pets);
    merged.equippedPetUids = mergeSetDelta(base.equippedPetUids, local.equippedPetUids, cloud.equippedPetUids)
      .filter(uid => merged.pets.some(pet => String(pet.uid) === String(uid))).slice(0, 3);
    return merged;
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
      petSkillLogin: S.petSkillLogin || { lastDate: null, streak: 0, reward: 0 },
      petSkillSpeed: S.petSkillSpeed || { activatedAt: 0, expiresAt: 0, cooldownUntil: 0 },
      name: S.name, joined: S.joined, rolls: S.rolls, bag: S.bag,
      lockedDice: Array.isArray(S.lockedDice) ? S.lockedDice.filter(key => typeof key === 'string') : [],
      bagCapacity: S.bagCapacity, first: S.first, rollCounts: S.rollCounts || {},
      gloves: S.gloves, equipped: S.equipped, items: S.items || {}, equippedItem: S.equippedItem || '', best: S.best, coins: S.coins,
      currencyVersion: 2, adminGrantApplied: S.adminGrantApplied || {}, dailyShop: S.dailyShop || null,
      autoSellThreshold: S.autoSellThreshold, autoDeleteDice: S.autoDeleteDice || [],
      autoSold: S.autoSold, autoDepositWeatherEnabled: !!S.autoDepositWeatherEnabled,
      autoDepositThreshold: Number(S.autoDepositThreshold) || 700,
      autoDepositDice: S.autoDepositDice || [], questDate: S.questDate, quest: S.quest,
      dailyQuestCompletions: Number(S.dailyQuestCompletions) || 0,
      weatherConvertAt: Number(S.weatherConvertAt) || 0,
      achievements: S.achievements, achievementRulesVersion: 2, potions: S.potions,
      petAutoSellRarities: S.petAutoSellRarities || {},
      halloweenUnlocked: S.halloweenUnlocked || { d33: false, d34: false }
    };
  }

  function achievementStats() {
    const entries = Object.values(getState().achievements || {}).filter(a => a && !a.rejectedByNewThreshold && (a.unlockedAt || a.rewardGiven));
    const times = entries.map(a => a.unlockedAt).filter(Boolean).sort();
    return { achievement_count: entries.length, achievement_reached_at: times.length ? times[times.length - 1] : null };
  }

  async function applyPendingGrants(force = false) {
    const user = getCurrentUser();
    if (!user || !supabaseClient) return false;
    const lastCheckAt = grantCheckAtByUser.get(user.id) || 0;
    if (!force && Date.now() - lastCheckAt < GRANT_CHECK_INTERVAL) return false;
    const S = getState();
    S.adminGrantApplied = S.adminGrantApplied || {};
    S.potions = S.potions || fresh().potions;
    S.potions.inventory = Object.assign({ luck1: 0, luck2: 0, luck3: 0, speed1: 0, speed2: 0, angel1: 0, angel2: 0 }, S.potions.inventory || {});
    try {
      const { data, error } = await supabaseClient.from('player_grants')
        .select('coins_total,luck1_total,luck2_total,luck3_total,angel1_total,angel2_total,dice_grants')
        .eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      if (getCurrentUser()?.id !== user.id) return false;
      grantCheckAtByUser.set(user.id, Date.now());
      if (!data) return false;
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
    if (!initialUser || !supabaseClient) return false;
    if (cloudLoadReadyUserId !== initialUser.id) {
      document.getElementById('saveStatus').textContent = '新帳號雲端存檔載入中，暫停同步以保護資料';
      return false;
    }
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
      if (getCurrentUser()?.id !== syncingUserId) return false;
      const S = getState();
      // Freeze the exact request snapshot; nested arrays/objects must not keep live state references.
      const payload = clonePayload(savePayload());
      const patch = diffPayload(lastSyncedPayload, payload);

      // An unchanged snapshot should not produce any game_saves request.
      if (Object.keys(patch).length === 0) {
        document.getElementById('saveStatus').textContent = '雲端已同步';
        return true;
      }

      const profilePayload = {
        username: (S.name || '旅人').trim().slice(0, 20) || '旅人',
        unique_dice: totalUnique(),
        rarest_den: Number(S.best?.den) || 0,
        pet_income_per_second: Math.max(0, Math.floor(Number(getPetIncomePerSecond()) || 0)),
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
          document.getElementById('saveStatus').textContent = '偵測到其他裝置更新，正在合併存檔差異…';
          const conflictBasePayload = clonePayload(lastSyncedPayload);
          const conflictBaseVersion = cloudSaveVersion;
          const conflictLocalSnapshot = clonePayload(getState());
          await loadCloudSave({
            syncAfterLoad: false,
            conflictBasePayload,
            conflictBaseVersion,
            conflictLocalSnapshot
          });
          cloudSyncPending = true;
          toast('已重新比對其他分頁／裝置的存檔差異，正在保留可安全合併的進度並重新同步。');
          return false;
        }
        throw new Error(syncResult?.message || 'Cloud save version check failed');
      }
      if (getCurrentUser()?.id !== syncingUserId) return false;
      cloudSaveVersion = syncResult.updated_at || null;
      if (Number.isFinite(Number(syncResult.total_rolls))) {
        S.rolls = Math.max(Number(S.rolls) || 0, Number(syncResult.total_rolls));
      }
      // The RPC only persisted the immutable snapshot captured before the request.
      // Never mark live state as synced here: mutations can happen while the RPC is
      // in flight (e.g. a pet fusion), and doing so would silently drop that delta.
      lastSyncedPayload = clonePayload(payload);
      writeCloudBase(syncingUserId, lastSyncedPayload, cloudSaveVersion);
      const latestPayload = savePayload();
      if (Object.keys(diffPayload(lastSyncedPayload, latestPayload)).length > 0) {
        cloudSyncPending = true;
      }
      S.petIncomePending = 0;
      S._cloudBaseVersion = cloudSaveVersion;
      try {
        persistLocalSnapshot(S, syncingUserId);
        const savedAtKey = localSavedAtKey(syncingUserId);
        if (savedAtKey) {
          const previousSavedAt = Number(localStorage.getItem(savedAtKey)) || 0;
          const cloudSavedAt = Date.parse(syncResult.updated_at || '') || Date.now();
          localStorage.setItem(savedAtKey, String(Math.max(previousSavedAt, cloudSavedAt)));
        }
      } catch (e) {}
      document.getElementById('saveStatus').textContent = '雲端已同步';
      return true;
    } catch (e) {
      console.error('Cloud sync failed', e);
      cloudSyncPending = getCurrentUser()?.id === syncingUserId;
      document.getElementById('saveStatus').textContent = '雲端同步失敗';
      return false;
    } finally {
      cloudSyncBusy = false;
      if (cloudSyncPending) scheduleCloudSync();
      if (resumeRefreshPending) {
        resumeRefreshPending = false;
        void refreshCloudSaveOnResume('sync-complete');
      }
    }
  }

  function scheduleCloudSync() {
    const user = getCurrentUser();
    if (!user || !supabaseClient) return;
    if (cloudLoadReadyUserId !== user.id) {
      cloudSyncPending = true;
      return;
    }
    cloudSyncPending = true;
    if (cloudSyncBusy || cloudSyncTimer) return;
    const elapsed = Date.now() - lastCloudSyncAt;
    const delay = lastCloudSyncAt ? Math.max(700, CLOUD_SYNC_MIN_INTERVAL - elapsed) : 700;
    const timer = timerManager.setTimeout(() => {
      if (cloudSyncTimer !== timer) return;
      cloudSyncTimer = null;
      if (!cloudSyncPending) return;
      cloudSyncPending = false;
      syncCloudSave();
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
    const accountReady = !!user && cloudLoadReadyUserId === user.id;
    // During an account switch, never write the previous player's in-memory
    // state into the new player's UID-scoped local snapshot.
    persistLocalSnapshot(S, accountReady ? user.id : null);
    try {
      const savedAtKey = accountReady ? localSavedAtKey(user.id) : null;
      if (savedAtKey) localStorage.setItem(savedAtKey, String(Date.now()));
    } catch (e) {}
    document.getElementById('saveStatus').textContent = accountReady
      ? '已儲存本機，雲端每 5 分鐘備份'
      : user ? '新帳號存檔載入中' : '本機存檔';
    if (accountReady) scheduleSync();
  }

  async function flushCloudSave() {
    const user = getCurrentUser();
    if (!user || !supabaseClient || cloudLoadReadyUserId !== user.id) return false;
    if (cloudSyncTimer) {
      timerManager.clearTimeout(cloudSyncTimer);
      cloudSyncTimer = null;
    }
    while (cloudSyncBusy) await new Promise(resolve => timerManager.setTimeout(resolve, 100, 'cloud-save-flush-wait'));
    const saved = await syncCloudSave();
    while (cloudSyncBusy) await new Promise(resolve => timerManager.setTimeout(resolve, 100, 'cloud-save-flush-wait'));
    return saved === true;
  }

  let exitFlushPromise = null;
  let lastExitFlushAt = 0;
  let resumeRefreshPromise = null;
  let resumeRefreshPending = false;
  let lastResumeRefreshAt = 0;

  async function refreshCloudSaveOnResume(reason = 'resume') {
    const user = getCurrentUser();
    if (!user || !supabaseClient || cloudLoadReadyUserId !== user.id) return false;
    if (document?.visibilityState === 'hidden') return false;
    if (resumeRefreshPromise) return resumeRefreshPromise;
    if (reason !== 'sync-complete' && Date.now() - lastResumeRefreshAt < 2500) return false;
    if (cloudSyncBusy) {
      resumeRefreshPending = true;
      return false;
    }

    lastResumeRefreshAt = Date.now();
    resumeRefreshPromise = (async () => {
      if (getCurrentUser()?.id !== user.id) return false;
      document.getElementById('saveStatus').textContent = '頁面恢復中，正在核對雲端存檔…';
      await loadCloudSave({ syncAfterLoad: false });
      const stillSignedIn = getCurrentUser()?.id === user.id;
      const loaded = stillSignedIn && cloudLoadReadyUserId === user.id;
      if (loaded && cloudSyncPending) scheduleCloudSync();
      if (!loaded) console.warn('Cloud save resume reconciliation did not complete:', reason);
      return loaded;
    })().finally(() => {
      resumeRefreshPromise = null;
      if (resumeRefreshPending) {
        resumeRefreshPending = false;
        void refreshCloudSaveOnResume('sync-complete');
      }
    });
    return resumeRefreshPromise;
  }

  async function flushOnExit(reason) {
    if (!getCurrentUser() || !supabaseClient) return false;
    // visibilitychange and pagehide can fire together; share one final backup request.
    if (exitFlushPromise) return exitFlushPromise;
    if (Date.now() - lastExitFlushAt < 1500) return false;
    lastExitFlushAt = Date.now();
    exitFlushPromise = flushCloudSave().finally(() => { exitFlushPromise = null; });
    const saved = await exitFlushPromise;
    if (saved !== true) console.warn('Final cloud backup did not complete:', reason);
    return saved === true;
  }

  // Backup as soon as the player backgrounds or closes the game page.
  document?.addEventListener?.('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushOnExit('visibilitychange');
    else void refreshCloudSaveOnResume('visibilitychange');
  });
  windowObject?.addEventListener?.('pagehide', () => { void flushOnExit('pagehide'); });
  windowObject?.addEventListener?.('pageshow', () => { void refreshCloudSaveOnResume('pageshow'); });
  windowObject?.addEventListener?.('online', () => { void refreshCloudSaveOnResume('online'); });

  async function loadCloudSave({
    syncAfterLoad = true,
    renderAfterLoad = true,
    conflictBasePayload = null,
    conflictBaseVersion = null,
    conflictLocalSnapshot = null
  } = {}) {
    lastCloudLoadError = null;
    const user = getCurrentUser();
    if (!user || !supabaseClient) return;
    const wasReadyForUser = cloudLoadReadyUserId === user.id;
    cloudLoadReadyUserId = wasReadyForUser ? user.id : null;
    if (lastSyncedUserId !== user.id) {
      cloudSaveVersion = null;
      lastSyncedPayload = null;
      lastSyncedUserId = user.id;
    }
    try {
      const scopedKey = userSaveKey(user.id);
      const localSaveAtLoadStart = (() => {
        try { return scopedKey ? localStorage.getItem(scopedKey) : null; }
        catch { return null; }
      })();
      const localSaveBeforeCloud = (() => {
        try { return JSON.parse(localSaveAtLoadStart || 'null'); }
        catch { return null; }
      })();
      const localPetDiscoveredBeforeCloud = { ...(getState()?.petDiscovered || {}) };
      const { data, error } = await supabaseClient.from('game_saves')
        .select('save_data,updated_at').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      if (getCurrentUser()?.id !== user.id) return;

      cloudSaveVersion = data?.updated_at || null;
      lastSyncedPayload = clonePayload(data?.save_data || null);
      lastSyncedUserId = user.id;

      const localSaveAfterCloud = (() => {
        try { return scopedKey ? localStorage.getItem(scopedKey) : null; }
        catch { return null; }
      })();
      const localChangedDuringLoad = localSaveAfterCloud !== localSaveAtLoadStart;
      let latestLocalSnapshot = localSaveBeforeCloud;
      if (localChangedDuringLoad) {
        try { latestLocalSnapshot = JSON.parse(localSaveAfterCloud || 'null'); }
        catch { latestLocalSnapshot = null; }
      }
      const sameTabMutationDuringLoad = !!(
        localChangedDuringLoad &&
        latestLocalSnapshot?._cloudWriterId === localWriterId &&
        localSaveBeforeCloud?.bag
      );
      let localSnapshotForMerge = latestLocalSnapshot;
      if (conflictBasePayload && conflictLocalSnapshot?.bag) {
        const localVersionMatches = latestLocalSnapshot?._cloudBaseVersion === conflictBaseVersion;
        if (!localVersionMatches) {
          const currentStateSnapshot = clonePayload(getState());
          localSnapshotForMerge = {
            ...(currentStateSnapshot?.bag ? currentStateSnapshot : conflictLocalSnapshot),
            _cloudBaseVersion: conflictBaseVersion
          };
        }
      } else if (!localSnapshotForMerge?.bag && conflictLocalSnapshot?.bag) {
        localSnapshotForMerge = { ...conflictLocalSnapshot, _cloudBaseVersion: conflictBaseVersion };
      }

      let S;
      if (data?.save_data?.bag) {
        const cloudPayload = data.save_data;
        const localSnapshotVersion = localSnapshotForMerge?._cloudBaseVersion || null;
        const storedBase = localSnapshotVersion
          ? readCloudBase(user.id, localSnapshotVersion)
          : null;
        const basePayload = conflictBasePayload || storedBase?.payload ||
          (sameTabMutationDuringLoad ? localSaveBeforeCloud : null);
        let mergedPayload = cloudPayload;
        let usedLegacyFallback = false;

        if (localSnapshotForMerge?.bag && basePayload) {
          mergedPayload = mergeCloudSavePayload(basePayload, localSnapshotForMerge, cloudPayload);
        } else if (localSnapshotForMerge?.bag && !basePayload) {
          // Legacy local saves have no trustworthy common version. Keep one
          // recovery copy, but never let an unversioned snapshot replace cloud.
          preserveLegacyLocalSnapshot(user.id, localSnapshotForMerge, data.updated_at);
          usedLegacyFallback = true;
        }

        S = migrateCurrency(normalizeGloves({ ...fresh(), ...mergedPayload }));
        S.petIncomePending = Math.max(0, Number(localSnapshotForMerge?.petIncomePending) || 0);
        if (S.petIncomePending > 0) S.coins = (Number(S.coins) || 0) + S.petIncomePending;

        // Keep the UID-delta pet merge produced above. Cloud-only deletions
        // stay deleted; local additions/removals made since the baseline survive.
        S.pets = Array.isArray(S.pets) ? S.pets.slice(0, 20) : [];
        ensurePetData(S.pets);
        S.equippedPetUids = Array.isArray(S.equippedPetUids)
          ? [...new Set(S.equippedPetUids)]
            .filter(uid => S.pets.some(pet => String(pet.uid) === String(uid))).slice(0, 3)
          : [];
        S.petDiscovered = {
          ...localPetDiscoveredBeforeCloud,
          ...(localSnapshotForMerge?.petDiscovered || {}),
          ...(cloudPayload.petDiscovered || {})
        };
        S.petAutoSellRarities = {
          ...(localSnapshotForMerge?.petAutoSellRarities || {}),
          ...(cloudPayload.petAutoSellRarities || {})
        };
        S.autoDeleteDice = Array.isArray(S.autoDeleteDice)
          ? S.autoDeleteDice.filter(id => D.some(d => d.id === id && !d.weather && Number(d.den) >= 2 && Number(d.den) <= 600000))
          : [];
        S.autoDepositDice = Array.isArray(S.autoDepositDice)
          ? S.autoDepositDice.filter(id => D.some(d => d.id === id && !!d.weather && Number(d.den) >= 2 && Number(d.den) <= 1000000))
          : [];
        S.adminGrantApplied = S.adminGrantApplied || {};
        S.bagCapacity = Math.min(200, Math.max(35, Math.floor(Number(S.bagCapacity) || 35)));
        S.potions = S.potions || fresh().potions;
        S.potions.inventory = Object.assign({
          luck1: 0, luck2: 0, luck3: 0, speed1: 0, speed2: 0, angel1: 0, angel2: 0
        }, S.potions.inventory || {});
        S.potions.active = S.potions.active || { type: '', expiresAt: 0 };
        S.potions.activeSpeed = S.potions.activeSpeed || { type: '', expiresAt: 0 };
        if (S.potions.active.type && POTIONS.find(p => p.id === S.potions.active.type)?.speed) {
          S.potions.activeSpeed = S.potions.active;
          S.potions.active = { type: '', expiresAt: 0 };
        }
        S.potions.angelCharges = Number(S.potions.angelCharges) || 0;
        S.potions.autoAdd = !!S.potions.autoAdd;
        S.potions.materials = S.potions.materials || {};
        S.potions.autoAddPotions = Array.isArray(S.potions.autoAddPotions)
          ? S.potions.autoAddPotions.slice(0, 2) : [];
        {
          let left = 4;
          for (const id of Object.keys(S.potions.materials)) {
            const n = Math.max(0, Number(S.potions.materials[id]) || 0);
            const keep = Math.min(n, left);
            if (keep) S.potions.materials[id] = keep;
            else delete S.potions.materials[id];
            left -= keep;
          }
        }
        S.halloweenUnlocked = S.halloweenUnlocked || { d33: false, d34: false };
        S._cloudBaseVersion = data.updated_at || null;
        setState(S);
        restoreAutoSellPrefs();
        persistLocalSnapshot(S, user.id);
        writeCloudBase(user.id, cloudPayload, data.updated_at);
        if (renderAfterLoad) render();
        document.getElementById('saveStatus').textContent = usedLegacyFallback
          ? '雲端存檔已載入；舊版本機資料另存為復原備份'
          : '雲端存檔已載入';
      } else {
        S = migrateCurrency(normalizeGloves({
          ...fresh(),
          ...(latestLocalSnapshot?.bag ? latestLocalSnapshot : {})
        }));
        if (!latestLocalSnapshot?.bag) {
          // First-time accounts receive a unique game nickname from their
          // login name, never the previous account's in-memory state.
          const baseName = String(user.user_metadata?.username || '玩家')
            .normalize('NFKC').replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 12) || '玩家';
          S.name = (baseName + '_' + String(user.id).slice(0, 4)).slice(0, 20);
        }
        S.petAutoSellRarities = latestLocalSnapshot?.petAutoSellRarities || {};
        S._cloudBaseVersion = null;
        setState(S);
        restoreAutoSellPrefs();
        persistLocalSnapshot(S, user.id);
        if (renderAfterLoad) render();
      }

      // The correct account state is now installed. Only now may any save write
      // to this UID; all earlier saves were blocked during account switching.
      cloudLoadReadyUserId = user.id;
      await applyPendingGrants(true);
      if (syncAfterLoad) await syncCloudSave();
      else if (data?.save_data?.bag && stableSerialize(savePayload()) !== stableSerialize(data.save_data)) {
        cloudSyncPending = true;
      }
      await refreshLeaderboards();
      cloudLoadReadyUserId = user.id;
    } catch (e) {
      cloudLoadReadyUserId = null;
      lastCloudLoadError = e;
      console.error(e);
      if (/user.?banned|banned|被停權|已停權/i.test(String(e?.message || ''))) {
        await supabaseClient?.auth.signOut().catch(() => {});
        openAuth();
        showAuthMessage('偵測到違反遊戲規則\n已停權此帳號');
        document.getElementById('authMessage').style.whiteSpace = 'pre-line';
      } else if (Number(e?.status ?? e?.statusCode) === 402
        || /exceed_egress_quota|project is restricted|egress quota/i.test(String(e?.message || e?.code || ''))) {
        toast('Supabase 雲端服務目前受到流量額度限制，暫時無法載入雲端存檔。本機資料不會因此清除。');
      } else toast('讀取雲端存檔失敗，請檢查網路後重試');
    }
  }

  function isLoadedFor(userId) { return !!userId && cloudLoadReadyUserId === userId; }
  function getLastCloudLoadError() { return lastCloudLoadError; }

  return { userSaveKey, save, savePayload, achievementStats, applyPendingGrants, syncCloudSave, flushCloudSave, loadCloudSave, scheduleSync, flushOnExit, refreshCloudSaveOnResume, isLoadedFor, getLastCloudLoadError };
}
