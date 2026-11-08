/** Account profile, self-deletion, and sign-out UI actions. */
export function setupAccountActions(dependencies) {
  const {
    documentRef: document,
    getState,
    setState,
    getCurrentUser,
    setCurrentUser,
    supabaseClient,
    SUPABASE_URL,
    SUPABASE_KEY,
    totalUnique,
    achievementStats,
    save,
    render,
    flushCloudSave,
    toast,
    stopAuto,
    KEY,
    localStorageRef,
    fresh,
    refreshLeaderboards
  } = dependencies;

  document.getElementById('saveName').onclick = async () => {
    const name = document.getElementById('profileNameInput').value.trim().slice(0, 20);
    if (!name) { toast('名稱不可空白'); return; }
    const currentUser = getCurrentUser();
    const state = getState();
    if (!currentUser || !supabaseClient) { toast('請先登入再更改名稱'); return; }
    const button = document.getElementById('saveName');
    button.disabled = true;
    try {
      const key = name.normalize('NFKC').trim().toLocaleLowerCase();
      const profiles = [];
      let profileFrom = 0;
      while (true) {
        const { data: batch, error } = await supabaseClient.from('player_profiles').select('user_id,username').range(profileFrom, profileFrom + 999);
        if (error) throw error;
        profiles.push(...(batch || []));
        if (!batch || batch.length < 1000) break;
        profileFrom += 1000;
      }
      if (profiles.some(profile => profile.user_id !== currentUser.id && String(profile.username || '').normalize('NFKC').trim().toLocaleLowerCase() === key)) {
        document.getElementById('accountActionMessage').textContent = '玩家名稱重複';
        toast('玩家名稱重複');
        return;
      }
      const now = new Date().toISOString();
      const { error: profileError } = await supabaseClient.from('player_profiles').upsert({
        user_id: currentUser.id,
        username: name,
        total_rolls: Number(state.rolls) || 0,
        unique_dice: totalUnique(),
        rarest_den: Number(state.best?.den) || 0,
        coins: Number(state.coins) || 0,
        ...achievementStats(),
        last_seen: now,
        updated_at: now
      }, { onConflict: 'user_id' });
      if (profileError) throw profileError;
      state.name = name;
      save();
      render();
      await syncCloudSave();
      document.getElementById('accountActionMessage').textContent = '名稱已更新';
      toast('名稱已更新');
    } catch (error) {
      const message = String(error.message || '請稍後重試');
      document.getElementById('accountActionMessage').textContent = message.includes('玩家名稱重複') ? '玩家名稱重複' : '更改名稱失敗';
      toast(message.includes('玩家名稱重複') ? '玩家名稱重複' : '更改名稱失敗：' + message);
    } finally {
      button.disabled = false;
    }
  };

  document.getElementById('resetBtn').onclick = async () => {
    const message = document.getElementById('accountActionMessage');
    if (!confirm('第一次確認：確定要刪除目前帳號及遊戲進度嗎？')) return;
    if (!confirm('第二次確認：這會永久刪除帳號資料，成功後將無法登入，且會從排行榜移除。確定刪除？')) return;
    if (!getCurrentUser() || !supabaseClient) {
      message.textContent = '目前沒有登入雲端帳號。若要刪除本機試玩資料，請先登入帳號；此按鈕不會只清空資料來假裝刪除帳號。';
      return;
    }
    const button = document.getElementById('resetBtn');
    button.disabled = true;
    message.textContent = '正在請求伺服器刪除帳號與相關資料…';
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session?.access_token) throw new Error('登入狀態已失效，請重新登入');
      const response = await fetch(SUPABASE_URL + '/functions/v1/dice-rng-admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + session.access_token
        },
        body: JSON.stringify({ action: 'delete_self_account', confirmTwice: true })
      });
      const result = await response.json().catch(() => ({ error: '伺服器回應格式錯誤' }));
      if (!response.ok || result.success === false || result.error) throw new Error(result.error || '伺服器尚未支援自助刪除帳號');
      if (result.deleted !== true) throw new Error('伺服器沒有確認帳號已刪除，為保護資料，本機不會清空存檔。請先在 dice-rng-admin 後端實作 delete_self_account。');
      stopAuto();
      localStorageRef.removeItem(KEY);
      await supabaseClient.auth.signOut();
      setCurrentUser(null);
      const nextState = fresh();
      setState(nextState);
      localStorageRef.setItem(KEY, JSON.stringify(nextState));
      render();
      message.textContent = '帳號已由伺服器刪除，並已登出。';
      toast('帳號刪除完成');
      await refreshLeaderboards();
    } catch (error) {
      message.textContent = '刪除失敗：' + (error.message || '請確認管理後端是否支援自助刪除帳號');
      toast(message.textContent);
    } finally {
      button.disabled = false;
    }
  };

  document.getElementById('profileLogoutBtn')?.addEventListener('click', async () => {
    if (!getCurrentUser()) { toast('目前沒有登入雲端帳號'); return; }
    const button = document.getElementById('profileLogoutBtn');
    if (button) button.disabled = true;
    try {
      // Flush the latest local game state before ending the authenticated session.
      const saved = await flushCloudSave();
      if (saved === false) throw new Error('雲端同步失敗，請確認網路後重試');
      const { error } = await supabaseClient.auth.signOut();
      if (error) throw error;
      toast('存檔完成，已登出雲端帳號');
    } catch (error) {
      toast('雲端存檔未完成，為避免進度遺失，暫時未登出：' + (error?.message || '請稍後重試'));
    } finally {
      if (button) button.disabled = false;
    }
  });
}
