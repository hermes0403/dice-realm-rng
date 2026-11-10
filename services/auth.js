/**
 * Authentication UI, device-account policy and signed-in session lifecycle.
 *
 * The application composition root supplies cross-module services and state
 * accessors. Browser platform APIs remain local to this browser-facing service.
 */
export async function runCloudSessionInitialization({
  loadPetFusionOdds,
  heartbeat,
  loadWeatherSummonData,
  afterInitialization,
  isCloudSyncBlocked = () => false
}) {
  const steps = [
    () => loadPetFusionOdds(),
    () => heartbeat(),
    () => loadWeatherSummonData(false)
  ];
  for (const step of steps) {
    if (isCloudSyncBlocked()) return false;
    await step();
    if (isCloudSyncBlocked()) return false;
  }
  if (typeof afterInitialization === 'function') {
    await afterInitialization();
    if (isCloudSyncBlocked()) return false;
  }
  return true;
}
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
    loadWeatherSummonData,
    startRealmPollSync,
    stopRealmPollSync,
    startGlobalRealtime,
    stopGlobalRealtime,
    isCloudSyncBlocked = () => false,
    timerManager
  } = deps;

  let authBusy = false;
  let authServiceRestricted = false;
  let authStateSubscription = null;

  function showAuthMessage(message) {
    const element = document.getElementById('authMessage');
    if (element) element.textContent = message;
  }

  function openAuth() {
    document.getElementById('authModal').style.display = 'flex';
    showAuthMessage('');
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
    ['authLoginBtn', 'authSignupBtn', 'authResetBtn', 'authGoogleBtn'].forEach(id => {
      const button = document.getElementById(id);
      if (button) button.disabled = disabled;
    });
  }

  function isEmailRateLimitError(error) {
    const message = String(error?.message || error?.msg || error?.error_description || '').toLowerCase();
    return message.includes('email rate limit')
      || message.includes('rate limit exceeded')
      || message.includes('too many requests')
      || error?.status === 429;
  }

  function isProjectRestrictionError(error) {
    const candidates = [error, error?.cause, error?.cause?.cause].filter(Boolean);
    const message = candidates.flatMap(candidate => [
      candidate?.message, candidate?.details, candidate?.hint, candidate?.code
    ]).filter(Boolean).join(' ').toLowerCase();
    return candidates.some(candidate =>
      Number(candidate?.status ?? candidate?.statusCode ?? candidate?.code) === 402
    ) || message.includes('exceed_egress_quota')
      || message.includes('project is restricted')
      || message.includes('egress quota');
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
    if (authServiceRestricted) {
      showAuthMessage('Supabase 雲端服務目前因流量額度限制而暫停，暫時無法登入。請待專案服務恢復後重新整理頁面；本機已保存的遊戲資料不會因這個提示而被清除。');
      return;
    }
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
      if (isProjectRestrictionError(error)) {
        authServiceRestricted = true;
        showAuthMessage('Supabase 雲端服務目前因流量額度限制而暫停，暫時無法登入。請待專案服務恢復後重新整理頁面；本機已保存的遊戲資料不會因這個提示而被清除。');
      } else if (/provider.*(disabled|not enabled|unsupported)|unsupported provider/i.test(message)) {
        showAuthMessage('Google 登入尚未在 Supabase 啟用，請等管理員完成 Google OAuth 設定後再試。');
      } else {
        showAuthMessage(error?.message || '無法啟動 Google 登入，請稍後重試。');
      }
    } finally {
      authBusy = false;
      setAuthButtonsDisabled(false);
    }
  }

  async function authAction(mode) {
    if (authBusy) return;
    if (authServiceRestricted) {
      showAuthMessage('Supabase 雲端服務目前因流量額度限制而暫停，暫時無法登入。請待專案服務恢復後重新整理頁面；本機已保存的遊戲資料不會因這個提示而被清除。');
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
      showAuthMessage('密碼至少需要 6 位。');
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
        if (result.data?.session && !result.data?.user?.email_confirmed_at) {
          await supabaseClient.auth.signOut().catch(() => {});
          setCurrentUser(null);
          document.body.classList.add('auth-required');
          document.getElementById('authModal').style.display = 'flex';
          showAuthMessage('註冊已送出，但信箱尚未驗證，因此不能進入遊戲。請先點擊寄到信箱的確認連結；若連結顯示無法連結或已失效，請重新取得有效的確認信。');
          return;
        }
        showAuthMessage('已送出註冊要求。信箱驗證完成前不能進入遊戲，請查看收件匣、垃圾郵件及促銷內容。');
        return;
      }
      if (mode === 'reset') {
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
      if (isProjectRestrictionError(error)) {
        authServiceRestricted = true;
        showAuthMessage('Supabase 雲端服務目前因流量額度限制而暫停，暫時無法登入。請待專案服務恢復後重新整理頁面；本機已保存的遊戲資料不會因這個提示而被清除。');
      } else if (/user.?banned|banned|被停權|已停權/i.test(message)) {
        await supabaseClient.auth.signOut().catch(() => {});
        showAuthMessage('偵測到違反遊戲規則\n已停權此帳號');
        document.getElementById('authMessage').style.whiteSpace = 'pre-line';
        document.getElementById('authModal').style.display = 'flex';
      } else if (mode === 'signup' && isEmailRateLimitError(error)) {
        showAuthMessage('Supabase 郵件服務目前回報寄送上限，這是伺服器端限制，網站前端無法自行解除。');
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
      // On sign-out, clear any previous player's weather subscription.
      // Signed-in tracking/subscriptions start only after cloud load and initialization succeed.
      if (!incomingUser) {
        stopRealmPollSync?.();
        stopGlobalRealtime?.();
        timerManager.setTimeout(() => recordGameVisit('visit'), 700, 'auth-visit-record');
        setupPlayerWeatherSubscription();
      }
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
            const isGoogleUser = user.app_metadata?.provider === 'google'
              || user.identities?.some(identity => identity.provider === 'google');
            toast(isGoogleUser ? 'Google 帳號登入成功！可以開始遊玩了。' : '信箱驗證成功！可以開始遊玩了。');
          }
          let cloudLoadSucceeded = false;
          try {
            let cloudLoadTimeout;
            try {
              cloudLoadSucceeded = (await Promise.race([
                loadCloudSave(),
                new Promise((_, reject) => {
                  cloudLoadTimeout = timerManager.setTimeout(
                    () => reject(new Error('雲端存檔載入逾時（20 秒）。請檢查網路後重新整理；若仍發生，請提供此訊息。')),
                    20000,
                    'auth-cloud-load-timeout'
                  );
                })
              ])) !== false;
            } finally {
              timerManager.clearTimeout(cloudLoadTimeout);
            }
          } catch (loadError) {
            console.error('Cloud save load timeout/failure', loadError);
            toast(loadError?.message || '雲端存檔載入失敗，請重新整理');
            document.getElementById('saveStatus').textContent = '雲端載入逾時／失敗';
          }
          // When cloud access is restricted, keep the local game usable and avoid
          // immediately issuing more profile, leaderboard, grant and weather reads.
          if (!cloudLoadSucceeded) return;
          if (getCurrentUser()?.id === user.id) {
            const initializationComplete = await runCloudSessionInitialization({
              loadPetFusionOdds,
              heartbeat,
              loadWeatherSummonData,
              afterInitialization: async () => {
                await recordGameVisit('visit');
                if (!isCloudSyncBlocked() && getCurrentUser()?.id === user.id) {
                  startGlobalRealtime?.();
                  setupPlayerWeatherSubscription();
                  await startRealmPollSync?.();
                }
              },
              isCloudSyncBlocked
            });
            if (!initializationComplete) return;
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
