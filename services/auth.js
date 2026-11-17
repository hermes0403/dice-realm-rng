/**
 * Authentication UI, device-account policy and signed-in session lifecycle.
 *
 * The application composition root supplies cross-module services and state
 * accessors. Browser platform APIs remain local to this browser-facing service.
 */
export function createAuthService(deps) {
  const {
    supabaseClient,
    DEVICE_ACCOUNT_LIMIT,
    KEY,
    getCurrentUser,
    setCurrentUser,
    getState,
    releaseDeviceLock,
    recordGameVisit,
    setupPlayerWeatherSubscription,
    updateAdminVisibility,
    toast,
    loadCloudSave,
    loadPetFusionOdds,
    heartbeat,
    refreshLeaderboards,
    loadWeatherSummonData,
    applyPetLoginSkill = () => 0,
    isCloudSaveReady = () => false,
    onboardingMaybeShow = () => false,
    timerManager
  } = deps;

  let authBusy = false;
  let authStateSubscription = null;
  let signupCooldownInterval = null;
  const SIGNUP_COOLDOWN_MS = 4 * 60 * 1000;
  const SIGNUP_COOLDOWN_KEY = 'diceRealmEmailActionCooldownUntilV1';

  function getSignupCooldownRemaining() {
    try {
      const until = Number(localStorage.getItem(SIGNUP_COOLDOWN_KEY)) || 0;
      return Math.max(0, until - Date.now());
    } catch {
      return 0;
    }
  }

  function updateSignupCooldownUI() {
    const remaining = getSignupCooldownRemaining();
    const status = globalThis.document?.getElementById('authCooldownMessage');
    const signupButton = globalThis.document?.getElementById('authSignupBtn');
    const resetButton = globalThis.document?.getElementById('authResetBtn');

    if (remaining > 0) {
      const totalSeconds = Math.ceil(remaining / 1000);
      const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
      const seconds = String(totalSeconds % 60).padStart(2, '0');
      if (status) {
        status.hidden = false;
        status.textContent = '郵件操作冷卻中：' + minutes + ':' + seconds + '。倒數結束後才能再次註冊或申請重設密碼。';
      }
      if (signupButton) signupButton.disabled = true;
      if (resetButton) resetButton.disabled = true;
      return;
    }

    if (status) {
      status.hidden = true;
      status.textContent = '';
    }
    if (signupButton) signupButton.disabled = authBusy;
    if (resetButton) resetButton.disabled = authBusy;
    if (signupCooldownInterval && timerManager?.clearInterval) {
      timerManager.clearInterval(signupCooldownInterval);
      signupCooldownInterval = null;
    }
  }

  function startSignupCooldown() {
    try {
      localStorage.setItem(SIGNUP_COOLDOWN_KEY, String(Date.now() + SIGNUP_COOLDOWN_MS));
    } catch {}
    updateSignupCooldownUI();
    if (!signupCooldownInterval && timerManager?.setInterval) {
      signupCooldownInterval = timerManager.setInterval(updateSignupCooldownUI, 1000, 'auth-signup-cooldown');
    }
  }

  function showAuthMessage(message) {
    const element = document.getElementById('authMessage');
    if (element) element.textContent = message;
  }

  function openAuth() {
    document.getElementById('authModal').style.display = 'flex';
    showAuthMessage('');
    updateSignupCooldownUI();
  }

  function closeAuth() {
    if (!getCurrentUser()) {
      document.body.classList.add('auth-required');
      document.getElementById('authModal').style.display = 'flex';
      return;
    }
    document.getElementById('authModal').style.display = 'none';
    document.body.classList.remove('auth-required');
  }

  function setAuthButtonsDisabled(disabled) {
    ['authLoginBtn', 'authGoogleBtn'].forEach(id => {
      const button = document.getElementById(id);
      if (button) button.disabled = disabled;
    });
    const cooldownActive = getSignupCooldownRemaining() > 0;
    ['authSignupBtn', 'authResetBtn'].forEach(id => {
      const button = document.getElementById(id);
      if (button) button.disabled = disabled || cooldownActive;
    });
    updateSignupCooldownUI();
  }

  function isEmailRateLimitError(error) {
    const message = String(error?.message || error?.msg || error?.error_description || '').toLowerCase();
    return message.includes('email rate limit')
      || message.includes('rate limit exceeded')
      || message.includes('too many requests')
      || error?.status === 429;
  }

  function taipeiDayKey() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());
    const values = {};
    for (const part of parts) values[part.type] = part.value;
    return values.year + '-' + values.month + '-' + values.day;
  }

  function getDeviceAccountLedger() {
    try {
      const raw = JSON.parse(localStorage.getItem('diceRealmDeviceAccountLimitV1') || 'null');
      if (raw && raw.day === taipeiDayKey() && Array.isArray(raw.accounts)) return raw;
    } catch {}
    return { day: taipeiDayKey(), accounts: [] };
  }

  function checkAndRecordDeviceAccount(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) return { allowed: true };
    const ledger = getDeviceAccountLedger();
    const exists = ledger.accounts.some(account => String(account).toLowerCase() === normalized);
    if (!exists && ledger.accounts.length >= DEVICE_ACCOUNT_LIMIT) {
      return { allowed: false, remaining: 0 };
    }
    if (!exists) ledger.accounts.push(normalized);
    localStorage.setItem('diceRealmDeviceAccountLimitV1', JSON.stringify(ledger));
    return {
      allowed: true,
      remaining: Math.max(0, DEVICE_ACCOUNT_LIMIT - ledger.accounts.length)
    };
  }

  function enforceDeviceAccountLimit(user) {
    if (!user?.email) return true;
    const result = checkAndRecordDeviceAccount(user.email);
    if (result.allowed) return true;

    setCurrentUser(null);
    document.body.classList.add('auth-required');
    document.getElementById('authModal').style.display = 'flex';
    document.getElementById('authCloseBtn').hidden = true;
    document.getElementById('authOpenBtn').hidden = false;
    showAuthMessage('此裝置今日已登入過 3 個不同帳號，暫時無法登入第 4 個帳號。明天台灣時間 00:00 後會重置；已使用過的 3 個帳號仍可繼續登入。');
    timerManager.setTimeout(() => supabaseClient?.auth.signOut().catch(() => {}), 0, 'auth-signout');
    return false;
  }

  async function googleSignIn() {
    if (authBusy) return;
    if (!supabaseClient?.auth?.signInWithOAuth) {
      showAuthMessage('Google 登入模組尚未就緒，請重新整理網頁。');
      return;
    }

    authBusy = true;
    setAuthButtonsDisabled(true);
    showAuthMessage('正在開啟 Google 帳號選擇…');
    try {
      const result = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'https://hermes0403.github.io/dice-realm-rng/',
          queryParams: { prompt: 'select_account' }
        }
      });
      if (result.error) throw result.error;
    } catch (error) {
      const message = String(error?.message || error?.msg || error?.error_description || '');
      if (error?.status === 402 || /exceed_egress_quota|project.*restricted|service.*restricted/i.test(message)) {
        showAuthMessage('Supabase 雲端服務目前受到額度限制，暫時無法登入。請待服務恢復後再試。');
      } else if (/provider.*(disabled|not enabled|unsupported)|unsupported provider/i.test(message)) {
        showAuthMessage('Google 登入尚未在 Supabase 啟用，請確認管理員已儲存 Provider 設定。');
      } else {
        showAuthMessage(error?.message || '無法啟動 Google 登入，請稍後重試。');
      }
    } finally {
      authBusy = false;
      setAuthButtonsDisabled(false);
      updateSignupCooldownUI();
    }
  }

  async function authAction(mode) {
    if (authBusy) return;
    if ((mode === 'signup' || mode === 'reset') && getSignupCooldownRemaining() > 0) {
      updateSignupCooldownUI();
      showAuthMessage('請稍候，郵件操作冷卻結束後才能再次註冊或申請重設密碼。');
      return;
    }
    if (!supabaseClient) {
      showAuthMessage('登入模組載入失敗，請重新整理網頁。');
      return;
    }

    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showAuthMessage('請輸入有效的 Email 地址。');
      return;
    }
    if (password.length < 6 && mode !== 'reset') {
      showAuthMessage('密碼由你自行設定，至少需要 6 位。');
      return;
    }

    authBusy = true;
    setAuthButtonsDisabled(true);
    showAuthMessage(mode === 'signup' ? '正在送出註冊要求…' : '處理中…');
    try {
      let result;
      if (mode === 'signup') {
        result = await supabaseClient.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: 'https://hermes0403.github.io/dice-realm-rng/' }
        });
      } else if (mode === 'login') {
        result = await supabaseClient.auth.signInWithPassword({ email, password });
      } else {
        result = await supabaseClient.auth.resetPasswordForEmail(email, {
          redirectTo: 'https://hermes0403.github.io/dice-realm-rng/'
        });
      }
      if (result.error) throw result.error;

      if (mode === 'signup') {
        startSignupCooldown();
        if (result.data?.session && !result.data?.user?.email_confirmed_at) {
          await supabaseClient.auth.signOut().catch(() => {});
          setCurrentUser(null);
          document.body.classList.add('auth-required');
          document.getElementById('authModal').style.display = 'flex';
          showAuthMessage('註冊要求已送出，請前往信箱查看驗證信（也請檢查垃圾郵件）。完成驗證後即可登入。');
          return;
        }
        showAuthMessage('註冊要求已送出，請前往信箱查看驗證信（也請檢查垃圾郵件）。完成驗證後即可登入。');
        return;
      }
      if (mode === 'reset') {
        startSignupCooldown();
        showAuthMessage('若此 Email 已註冊，系統會寄出重設密碼信；請稍候並檢查垃圾郵件。');
        return;
      }

      const signedUser = result.data?.user;
      if (!signedUser?.email_confirmed_at) {
        await supabaseClient.auth.signOut().catch(() => {});
        setCurrentUser(null);
        document.body.classList.add('auth-required');
        document.getElementById('authModal').style.display = 'flex';
        showAuthMessage('此帳號的信箱尚未驗證，不能進入遊戲。請先點擊信箱中的確認連結；若連結無法使用，請重新取得有效的確認信。');
        return;
      }
      if (!checkAndRecordDeviceAccount(signedUser.email)) {
        await supabaseClient.auth.signOut().catch(() => {});
        setCurrentUser(null);
        document.body.classList.add('auth-required');
        document.getElementById('authModal').style.display = 'flex';
        document.getElementById('authCloseBtn').hidden = true;
        showAuthMessage('此裝置今日已登入過 3 個不同帳號，暫時無法登入第 4 個帳號。明天台灣時間 00:00 後會重置；已使用過的 3 個帳號仍可繼續登入。');
        return;
      }
      showAuthMessage('登入成功，正在載入雲端存檔…');
    } catch (error) {
      const message = String(error?.message || error?.msg || error?.error_description || '');
      if (/user.?banned|banned|被停權|已停權/i.test(message)) {
        await supabaseClient.auth.signOut().catch(() => {});
        showAuthMessage('偵測到違反遊戲規則\n已停權此帳號');
        document.getElementById('authMessage').style.whiteSpace = 'pre-line';
        document.getElementById('authModal').style.display = 'flex';
      } else if ((mode === 'signup' || mode === 'reset') && isEmailRateLimitError(error)) {
        startSignupCooldown();
        showAuthMessage('Supabase 郵件服務目前回報寄送上限，這次沒有寄出郵件。請停止重複操作，等待冷卻倒數結束；伺服器寄信額度仍需由管理員處理。');
      } else if (mode === 'signup' && /database error saving new user/i.test(message)) {
        showAuthMessage('此 Gmail 可能曾用於被管理員刪除的帳號，無法再次註冊。');
      } else {
        showAuthMessage(error.message || '操作失敗，請稍後重試。');
      }
    } finally {
      authBusy = false;
      setAuthButtonsDisabled(false);
    }
  }

  function registerAuthStateListener() {
    if (!supabaseClient) return null;
    if (authStateSubscription) return authStateSubscription;
    authStateSubscription = supabaseClient.auth.onAuthStateChange(async (event, session) => {
      const previousUser = getCurrentUser();
      const incomingUser = session?.user || null;
      if ((event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')
        && incomingUser && previousUser?.id === incomingUser.id) {
        setCurrentUser(incomingUser);
        updateAdminVisibility();
        return;
      }
      if (incomingUser && !incomingUser.email_confirmed_at) {
        setCurrentUser(null);
        document.body.classList.add('auth-required');
        document.getElementById('authModal').style.display = 'flex';
        document.getElementById('authCloseBtn').hidden = true;
        document.getElementById('authOpenBtn').hidden = false;
        updateAdminVisibility();
        showAuthMessage('信箱尚未驗證，不能進入遊戲。請先完成 Email 確認；若確認連結顯示無法連結或已失效，請重新取得有效的確認信。');
        timerManager.setTimeout(() => supabaseClient.auth.signOut().catch(() => {}), 0, 'auth-signout');
        return;
      }
      if (incomingUser && !enforceDeviceAccountLimit(incomingUser)) return;
      if (!incomingUser && previousUser) await releaseDeviceLock(previousUser.id);

      setCurrentUser(incomingUser);
      timerManager.setTimeout(() => recordGameVisit('visit'), 700, 'auth-visit-record');
      setupPlayerWeatherSubscription();
      document.getElementById('authOpenBtn').hidden = !!getCurrentUser();
      document.body.classList.toggle('auth-required', !getCurrentUser());
      if (!getCurrentUser()) {
        document.getElementById('authModal').style.display = 'flex';
        document.getElementById('authCloseBtn').hidden = true;
      } else {
        document.getElementById('authCloseBtn').hidden = false;
      }
      updateAdminVisibility();

      if (getCurrentUser()) {
        const user = getCurrentUser();
        timerManager.setTimeout(async () => {
          if (!getCurrentUser() || getCurrentUser().id !== user.id) return;
          const state = getState();
          if (state.name === '旅人' || !state.name) {
            const base = (user.email || '玩家').split('@')[0]
              .replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 12) || '玩家';
            state.name = base + '_' + user.id.slice(0, 4);
            localStorage.setItem(KEY, JSON.stringify(state));
          }
          document.getElementById('playerName').textContent = getCurrentUser().email || state.name;
          closeAuth();
          if (event === 'SIGNED_IN' && user.email_confirmed_at) {
            toast('信箱驗證成功！可以開始遊玩了。');
          }
          let cloudLoadSucceeded = false;
          try {
            let cloudLoadTimeout;
            try {
              await Promise.race([
                loadCloudSave(),
                new Promise((_, reject) => {
                  cloudLoadTimeout = timerManager.setTimeout(
                    () => reject(new Error('雲端存檔載入逾時（20 秒）。請檢查網路後重新整理；若仍發生，請提供此訊息。')),
                    20000,
                    'auth-cloud-load-timeout'
                  );
                })
              ]);
              cloudLoadSucceeded = !!isCloudSaveReady(user.id);
            } finally {
              timerManager.clearTimeout(cloudLoadTimeout);
            }
          } catch (loadError) {
            console.error('Cloud save load timeout/failure', loadError);
            toast(loadError?.message || '雲端存檔載入失敗，請重新整理');
            document.getElementById('saveStatus').textContent = '雲端載入逾時／失敗';
          }
          if (cloudLoadSucceeded && getCurrentUser()?.id === user.id) {
            await applyPetLoginSkill();
            onboardingMaybeShow();
          }
          if (getCurrentUser()?.id === user.id) {
            await loadPetFusionOdds();
            await heartbeat();
            await refreshLeaderboards();
            await loadWeatherSummonData(false);
          }
        }, 0, 'auth-session-init');
      } else {
        document.getElementById('saveStatus').textContent = '本機存檔';
      }
    });
    return authStateSubscription;
  }

  function unregisterAuthStateListener() {
    authStateSubscription?.data?.subscription?.unsubscribe?.();
    authStateSubscription = null;
  }

  updateSignupCooldownUI();
  if (getSignupCooldownRemaining() > 0 && timerManager?.setInterval) {
    signupCooldownInterval = timerManager.setInterval(updateSignupCooldownUI, 1000, 'auth-signup-cooldown');
  }

  return {
    showAuthMessage,
    openAuth,
    closeAuth,
    authAction,
    googleSignIn,
    registerAuthStateListener,
    unregisterAuthStateListener
  };
}
