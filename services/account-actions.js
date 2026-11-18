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
    syncCloudSave,
    toast,
    stopAuto,
    KEY,
    localStorageRef,
    fresh,
    refreshLeaderboards
  } = dependencies;

  function requestPlayerName(currentName) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:10020;background:#050711dd;backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:18px';
      const panel = document.createElement('div');
      panel.style.cssText = 'width:min(100%,420px);padding:20px;border:1px solid #6574b5;border-radius:16px;background:#101529;color:#fff;box-shadow:0 20px 70px #000b';
      const title = document.createElement('h3');
      title.textContent = '更改玩家名稱';
      title.style.margin = '0 0 12px';
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 20;
      input.value = currentName;
      input.autocomplete = 'nickname';
      input.setAttribute('aria-label', '新的玩家名稱');
      input.style.cssText = 'box-sizing:border-box;width:100%;padding:12px;border:1px solid #59658f;border-radius:9px;background:#080d1b;color:#fff;font-size:16px';
      const hint = document.createElement('p');
      hint.textContent = '最多 20 個字，名稱不可空白，也不可與其他玩家重複。';
      hint.style.cssText = 'font-size:12px;color:#aeb9dc;margin:9px 0 14px';
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = '取消';
      const submit = document.createElement('button');
      submit.type = 'button';
      submit.className = 'primary';
      submit.textContent = '確認更改';
      actions.append(cancel, submit);
      panel.append(title, input, hint, actions);
      overlay.append(panel);
      document.body.append(overlay);
      const finish = value => {
        document.removeEventListener('keydown', onKeydown);
        overlay.remove();
        resolve(value);
      };
      const onKeydown = event => {
        if (event.key === 'Escape') finish(null);
        if (event.key === 'Enter') finish(input.value);
      };
      cancel.addEventListener('click', () => finish(null));
      submit.addEventListener('click', () => finish(input.value));
      overlay.addEventListener('click', event => { if (event.target === overlay) finish(null); });
      document.addEventListener('keydown', onKeydown);
      input.focus();
      input.select();
    });
  }

  async function handleSaveName() {
    const currentName = String(getState()?.name || '旅人');
    const enteredName = await requestPlayerName(currentName);
    if (enteredName === null || enteredName === undefined) return;
    const name = String(enteredName).trim().slice(0, 20);
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
  }
  async function handleResetAccount() {
    const message = document.getElementById('accountActionMessage');
    message.textContent = '刪除帳號會永久移除登入帳號與雲端進度。';
    toast('刪除帳號需要完成兩次確認');
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
  }
  async function handleLogout() {
    const user = getCurrentUser();
    if (!user) { toast('目前沒有登入雲端帳號'); return; }
    const button = document.getElementById('profileLogoutBtn');
    const message = document.getElementById('accountActionMessage');
    if (button) button.disabled = true;
    if (message) message.textContent = '正在保存最新遊戲進度，完成後會自動登出…';
    toast('正在保存雲端進度…');
    try {
      // Persist locally first, then wait for the final cloud backup before sign-out.
      save();
      const flushPromise = Promise.resolve().then(() => flushCloudSave());
      let timeoutId;
      const saved = await Promise.race([
        flushPromise,
        new Promise((_, reject) => {
          timeoutId = globalThis.setTimeout(() => reject(new Error('雲端同步等待超過 20 秒。請確認網路或稍後重試；目前仍保持登入，避免進度遺失。')), 20000);
        })
      ]).finally(() => globalThis.clearTimeout(timeoutId));
      if (getCurrentUser()?.id !== user.id) return;
      if (saved !== true) throw new Error('雲端同步未確認完成，請稍後重試');
      const { error } = await supabaseClient.auth.signOut();
      if (error) throw error;
      if (message) message.textContent = '已完成雲端保存並登出。';
      toast('存檔完成，已登出雲端帳號');
    } catch (error) {
      if (message) message.textContent = '登出未完成：' + (error?.message || '請稍後重試');
      toast('登出未完成：' + (error?.message || '請稍後重試'));
    } finally {
      if (button) button.disabled = false;
    }
  }

  // Keep direct listeners for the current controls, with document delegation
  // as a fallback if a future render replaces one of these buttons.
  const initiallyBoundButtons = new WeakSet();
  const bindInitialButton = (id, handler) => {
    const button = document.getElementById(id);
    if (!button?.addEventListener) return;
    button.addEventListener('click', event => {
      event?.preventDefault?.();
      if (!button.disabled) return handler();
    });
    initiallyBoundButtons.add(button);
  };
  bindInitialButton('saveName', handleSaveName);
  bindInitialButton('resetBtn', handleResetAccount);
  bindInitialButton('profileLogoutBtn', handleLogout);

  document.addEventListener?.('click', event => {
    const button = event.target?.closest?.('#saveName, #resetBtn, #profileLogoutBtn');
    if (!button || button.disabled || initiallyBoundButtons.has(button)) return;
    event.preventDefault();
    if (button.id === 'saveName') void handleSaveName();
    else if (button.id === 'resetBtn') void handleResetAccount();
    else if (button.id === 'profileLogoutBtn') void handleLogout();
  }, true);

}
