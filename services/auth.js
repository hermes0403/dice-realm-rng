export const SESSION_OFFLINE_TIMEOUT_MS = 100000;

// Backgrounding the app or being offline must not revoke a valid login session.
// Supabase token expiry and normal authentication checks remain authoritative.
export function hasSessionExpiredAfterOffline() {
  return false;
}

export function getLoginFailureMessage(error) {
  const message = String(error?.message || error?.msg || error?.error_description || '').toLowerCase();
  if (error?.status === 429 || message.includes('too many requests') || message.includes('rate limit')) {
    return '登入嘗試太頻繁，請先停止重複操作，稍後再試。';
  }
  if (message.includes('invalid login credentials') || message.includes('invalid_credentials')
    || message.includes('email or password') || message.includes('user not found')) {
    return '帳號或密碼不正確。第一次使用請按「建立新帳號」；已經註冊則請檢查 Email 和密碼，或使用「忘記密碼」。';
  }
  return error?.message || '登入失敗，請確認帳號資料後再試。';
}

export function getAuthEmailRateLimitMessage(mode, error) {
  const rawMessage = String(error?.message || error?.msg || error?.error_description || '');
  const cooldown = rawMessage.match(/only request this after\s+(\d+)\s+seconds?/i);
  const emailType = mode === 'reset' ? '密碼重設信' : '註冊驗證信';
  if (cooldown) {
    return '郵件請求太密集，伺服器要求再等待 ' + cooldown[1] + ' 秒。這次沒有寄出' + emailType + '，請等待後再試，不要連續按按鈕。';
  }
  return 'Supabase 郵件服務目前達到寄送上限，這次沒有寄出' + emailType + '。請先停止重複操作；這是伺服器端限制，網站無法自行提高額度。';
}

function isCloudRestrictionError(error) {
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

export async function runCloudSessionInitialization({
  userId,
  loadCloudSave,
  isCloudSaveReady,
  getCloudLoadError = () => null,
  isCurrentUser = () => true,
  loadPetFusionOdds,
  heartbeat,
  loadWeatherSummonData,
  recordGameVisit,
  setupPlayerWeatherSubscription,
  applyPetLoginSkill,
  onboardingMaybeShow,
  onCloudRestriction = () => {},
  isCloudSyncBlocked = () => false
}) {
  if (!isCurrentUser(userId) || isCloudSyncBlocked()) return false;
  if (!isCloudSaveReady(userId)) {
    try {
      await loadCloudSave();
    } catch (error) {
      if (isCloudRestrictionError(error)) onCloudRestriction(error);
      throw error;
    }
  }
  if (!isCurrentUser(userId) || !isCloudSaveReady(userId) || isCloudSyncBlocked()) {
    const loadError = getCloudLoadError();
    if (isCloudRestrictionError(loadError)) onCloudRestriction(loadError);
    return false;
  }

  const steps = [
    applyPetLoginSkill,
    loadPetFusionOdds,
    heartbeat,
    () => loadWeatherSummonData?.(false),
    recordGameVisit,
    setupPlayerWeatherSubscription,
    onboardingMaybeShow
  ];
  for (const step of steps) {
    if (typeof step !== 'function' || !isCurrentUser(userId)) continue;
    try {
      await step();
    } catch (error) {
      if (isCloudRestrictionError(error)) {
        onCloudRestriction(error);
        return false;
      }
      console.warn('Non-critical post-login initialization failed', error);
    }
    if (isCloudSyncBlocked()) {
      onCloudRestriction();
      return false;
    }
  }
  return isCurrentUser(userId) && isCloudSaveReady(userId) && !isCloudSyncBlocked();
}

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
    loadWeatherSummonData,
    applyPetLoginSkill = () => 0,
    isCloudSaveReady = () => false,
    getCloudLoadError = () => null,
    onboardingMaybeShow = () => false,
    timerManager
  } = deps;

  let authBusy = false;
  let authServiceRestricted = false;
  let authStateSubscription = null;
  let sessionInitPromise = null;
  let sessionInitUserId = null;
  let sessionInitAttemptedUserId = null;
  let sessionGeneration = 0;
  let cloudLoadPromise = null;
  let cloudLoadUserId = null;
  let recoveryMode = false;
  let signupCooldownInterval = null;
  let offlineLifecycleListenersAttached = false;
  let offlineSignOutBusy = false;
  const SESSION_OFFLINE_KEY = 'diceRealmSessionOfflineAtV1';

  function getSessionStorage() {
    try { return globalThis.sessionStorage; } catch { return null; }
  }

  function markSessionOffline() {
    const storage = getSessionStorage();
    if (!storage || !getCurrentUser()) return;
    try {
      if (!storage.getItem(SESSION_OFFLINE_KEY)) {
        storage.setItem(SESSION_OFFLINE_KEY, String(Date.now()));
      }
    } catch {}
  }

  function clearSessionOfflineMark() {
    try { getSessionStorage()?.removeItem(SESSION_OFFLINE_KEY); } catch {}
  }

  function hasExpiredOfflineMarker() {
    const storage = getSessionStorage();
    if (!storage) return false;
    try { return hasSessionExpiredAfterOffline(storage.getItem(SESSION_OFFLINE_KEY)); }
    catch { return false; }
  }

  async function enforceOfflineSessionTimeout() {
    const storage = getSessionStorage();
    if (!storage || !getCurrentUser() || offlineSignOutBusy) return false;
    let offlineStartedAt = 0;
    try { offlineStartedAt = Number(storage.getItem(SESSION_OFFLINE_KEY)) || 0; } catch {}
    if (!hasSessionExpiredAfterOffline(offlineStartedAt)) {
      if (offlineStartedAt) clearSessionOfflineMark();
      return false;
    }

    offlineSignOutBusy = true;
    try {
      const { error } = await supabaseClient.auth.signOut({ scope: 'local' });
      if (error) throw error;
      clearSessionOfflineMark();
      document.body.classList.add('auth-required');
      document.getElementById('authModal').style.display = 'flex';
      document.getElementById('authCloseBtn').hidden = true;
      document.getElementById('authOpenBtn').hidden = false;
      showAuthMessage('離線已超過 100 秒，為了保護帳號，請重新登入。');
      return true;
    } catch (error) {
      console.warn('Offline session expiry could not be completed', error);
      showAuthMessage('離線已超過 100 秒，請恢復網路後重新登入。');
      return false;
    } finally {
      offlineSignOutBusy = false;
    }
  }

  function attachOfflineLifecycleListeners() {
    if (offlineLifecycleListenersAttached) return;
    const documentObject = globalThis.document;
    const windowObject = globalThis.window;
    if (!documentObject?.addEventListener) return;
    offlineLifecycleListenersAttached = true;
    const onVisibilityChange = () => {
      if (documentObject.visibilityState === 'hidden') markSessionOffline();
      else void enforceOfflineSessionTimeout();
    };
    const onPageHide = () => markSessionOffline();
    const onPageShow = () => void enforceOfflineSessionTimeout();
    const onOffline = () => markSessionOffline();
    const onOnline = () => void enforceOfflineSessionTimeout();
    documentObject.addEventListener('visibilitychange', onVisibilityChange);
    windowObject?.addEventListener('pagehide', onPageHide);
    windowObject?.addEventListener('pageshow', onPageShow);
    windowObject?.addEventListener('offline', onOffline);
    windowObject?.addEventListener('online', onOnline);
    timerManager?.setTimeout?.(() => void enforceOfflineSessionTimeout(), 0, 'auth-offline-session-check');
  }
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
    const resendButton = globalThis.document?.getElementById('authResendBtn');

    if (remaining > 0) {
      const totalSeconds = Math.ceil(remaining / 1000);
      const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
      const seconds = String(totalSeconds % 60).padStart(2, '0');
      if (status) {
        status.hidden = false;
        status.textContent = '郵件操作冷卻中：' + minutes + ':' + seconds + '。倒數結束後才能重新註冊、寄送驗證信或申請重設密碼。';
      }
      if (signupButton) signupButton.disabled = true;
      if (resetButton) resetButton.disabled = true;
      if (resendButton) resendButton.disabled = true;
      return;
    }

    if (status) {
      status.hidden = true;
      status.textContent = '';
    }
    if (signupButton) signupButton.disabled = authBusy;
    if (resetButton) resetButton.disabled = authBusy;
    if (resendButton) resendButton.disabled = authBusy;
    if (signupCooldownInterval && timerManager?.clearInterval) {
      timerManager.clearInterval(signupCooldownInterval);
      signupCooldownInterval = null;
    }
  }

  function startSignupCooldown(durationMs = SIGNUP_COOLDOWN_MS) {
    const safeDuration = Math.max(1000, Number(durationMs) || SIGNUP_COOLDOWN_MS);
    try {
      localStorage.setItem(SIGNUP_COOLDOWN_KEY, String(Date.now() + safeDuration));
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

  function setRecoveryMode(enabled) {
    recoveryMode = !!enabled;
    const loginPanel = document.getElementById('authLoginPanel');
    const recoveryPanel = document.getElementById('authRecoveryPanel');
    const closeButton = document.getElementById('authCloseBtn');
    if (loginPanel) loginPanel.hidden = recoveryMode;
    if (recoveryPanel) recoveryPanel.hidden = !recoveryMode;
    if (closeButton) closeButton.hidden = recoveryMode || !getCurrentUser();
  }

  function setUsernameSignupMode(enabled) {
    const loginPanel = document.getElementById('authLoginPanel');
    const signupPanel = document.getElementById('authUsernameSignupPanel');
    if (loginPanel) loginPanel.hidden = !!enabled;
    if (signupPanel) signupPanel.hidden = !enabled;
    showAuthMessage('');
  }

  function openUsernameSignup() {
    setRecoveryMode(false);
    setUsernameSignupMode(true);
  }

  function closeUsernameSignup() {
    setUsernameSignupMode(false);
  }

  function openAuth() {
    setRecoveryMode(false);
    setUsernameSignupMode(false);
    document.getElementById('authModal').style.display = 'flex';
    showAuthMessage('');
    updateSignupCooldownUI();
  }

  function closeAuth() {
    if (!getCurrentUser() || recoveryMode) {
      document.body.classList.add('auth-required');
      document.getElementById('authModal').style.display = 'flex';
      return;
    }
    document.getElementById('authModal').style.display = 'none';
    document.body.classList.remove('auth-required');
  }

  function setAuthButtonsDisabled(disabled) {
    ['authLoginBtn', 'authSignupBtn', 'authUsernameSignupOpenBtn', 'authUsernameSignupSubmitBtn', 'authUsernameSignupCancelBtn', 'authResetBtn', 'authResendBtn',
      'authPasswordUpdateBtn', 'authPasswordCancelBtn', 'authRetryCloudBtn'].forEach(id => {
      const button = document.getElementById(id);
      if (button) button.disabled = disabled;
    });
    const cooldownActive = getSignupCooldownRemaining() > 0;
    ['authSignupBtn', 'authResetBtn', 'authResendBtn'].forEach(id => {
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

  function getServerCooldownMs(error) {
    const raw = String(error?.message || error?.msg || error?.error_description || '');
    const match = raw.match(/only request this after\s+(\d+)\s+seconds?/i);
    return match ? (Number(match[1]) + 1) * 1000 : SIGNUP_COOLDOWN_MS;
  }

  function loadCloudSaveOnce(userId) {
    if (isCloudSaveReady(userId)) return Promise.resolve(true);
    if (cloudLoadPromise) {
      if (cloudLoadUserId === userId) return cloudLoadPromise;
      return cloudLoadPromise.catch(() => {}).then(() => loadCloudSaveOnce(userId));
    }
    cloudLoadUserId = userId;
    cloudLoadPromise = Promise.resolve()
      .then(() => loadCloudSave())
      .finally(() => {
        cloudLoadPromise = null;
        cloudLoadUserId = null;
      });
    return cloudLoadPromise;
  }

  function startSessionInitialization(user, event = 'INITIAL_SESSION', force = false) {
    if (!user?.id) return Promise.resolve(false);
    if (authServiceRestricted) {
      showAuthMessage('Supabase 雲端服務目前受到額度限制，暫時無法完成登入載入。請待服務恢復後再試。');
      return Promise.resolve(false);
    }
    if (sessionInitPromise && sessionInitUserId === user.id) return sessionInitPromise;
    if (!force && sessionInitAttemptedUserId === user.id) {
      return Promise.resolve(!!isCloudSaveReady(user.id));
    }

    sessionInitAttemptedUserId = user.id;
    sessionInitUserId = user.id;
    const generation = ++sessionGeneration;
    const state = getState();
    if (state.name === '旅人' || !state.name) {
      const base = String(user.user_metadata?.username || (user.email || '玩家').split('@')[0])
        .replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 12) || '玩家';
      state.name = base + '_' + user.id.slice(0, 4);
      localStorage.setItem(KEY, JSON.stringify(state));
    }

    document.getElementById('authModal').style.display = 'flex';
    document.body.classList.add('auth-required');
    document.getElementById('authOpenBtn').hidden = true;
    document.getElementById('authCloseBtn').hidden = true;
    const retryButton = document.getElementById('authRetryCloudBtn');
    if (retryButton) retryButton.hidden = true;
    showAuthMessage('登入成功，正在載入雲端存檔…');

    let timeoutId = null;
    let initializationCancelled = false;
    const initialization = runCloudSessionInitialization({
      userId: user.id,
      loadCloudSave: () => loadCloudSaveOnce(user.id),
      isCloudSaveReady,
      getCloudLoadError,
      isCurrentUser: id => !initializationCancelled && getCurrentUser()?.id === id,
      loadPetFusionOdds,
      heartbeat,
      loadWeatherSummonData,
      recordGameVisit: () => recordGameVisit('visit'),
      setupPlayerWeatherSubscription,
      applyPetLoginSkill,
      onboardingMaybeShow,
      onCloudRestriction: () => { authServiceRestricted = true; }
    });
    const timeout = new Promise((_, reject) => {
      timeoutId = timerManager.setTimeout(
        () => reject(new Error('雲端存檔載入逾時。請檢查網路後按「重新載入雲端存檔」；若仍失敗，請重新整理頁面。')),
        20000,
        'auth-cloud-load-timeout'
      );
    });

    sessionInitPromise = Promise.race([initialization, timeout])
      .then(ready => {
        if (!ready) throw new Error('雲端存檔尚未完成載入，遊戲暫時保持鎖定。');
        if (generation !== sessionGeneration || getCurrentUser()?.id !== user.id) return false;
        document.getElementById('playerName').textContent = getState()?.name || '玩家';
        document.getElementById('authCloseBtn').hidden = false;
        if (retryButton) retryButton.hidden = true;
        closeAuth();
        if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') {
          toast(event === 'PASSWORD_RECOVERY' ? '密碼已更新，登入成功。' : '登入成功！可以開始遊玩了。');
        }
        return true;
      })
      .catch(error => {
        initializationCancelled = true;
        if (generation === sessionGeneration && getCurrentUser()?.id === user.id) {
          console.error('Cloud session initialization failed', error);
          document.getElementById('authModal').style.display = 'flex';
          document.body.classList.add('auth-required');
          document.getElementById('authCloseBtn').hidden = true;
          if (retryButton) retryButton.hidden = false;
          showAuthMessage(authServiceRestricted
            ? 'Supabase 雲端服務目前受到額度限制，暫時無法完成登入載入。請待服務恢復後再試；本機資料不會因此清除。'
            : error?.message || '雲端存檔載入失敗，請稍後重試。');
          document.getElementById('saveStatus').textContent = '雲端載入逾時／失敗';
        }
        return false;
      })
      .finally(() => {
        timerManager.clearTimeout(timeoutId);
        if (generation === sessionGeneration) {
          sessionInitPromise = null;
          sessionInitUserId = null;
        }
      });
    return sessionInitPromise;
  }

  async function authAction(mode) {
    if (authBusy) return;
    if (authServiceRestricted) {
      showAuthMessage('Supabase 雲端服務目前受到額度限制，暫時無法登入或寄送郵件。請待專案服務恢復後再試。');
      return;
    }
    if (['signup', 'reset', 'resend'].includes(mode) && getSignupCooldownRemaining() > 0) {
      updateSignupCooldownUI();
      showAuthMessage('郵件操作暫停中，請等待畫面上的倒數結束後再試。');
      return;
    }
    if (!supabaseClient) {
      showAuthMessage('登入模組載入失敗，請重新整理網頁。');
      return;
    }

    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const isEmailIdentifier = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (mode === 'usernameSignup') {
      const username = document.getElementById('authUsernameSignupName').value.trim();
      const signupPassword = document.getElementById('authUsernameSignupPassword').value;
      const confirm = document.getElementById('authUsernameSignupPasswordConfirm').value;
      if (!username) { showAuthMessage('請輸入玩家名稱。'); return; }
      if (signupPassword.length < 8) { showAuthMessage('新密碼至少需要 8 位。'); return; }
      if (signupPassword !== confirm) { showAuthMessage('兩次輸入的密碼不一致。'); return; }
    } else if (!email || (mode !== 'login' && !isEmailIdentifier) || (mode === 'login' && !isEmailIdentifier && !/^[\p{L}\p{N}_-]{3,20}$/u.test(email.normalize('NFKC').trim()))) {
      showAuthMessage(mode === 'login' ? '請輸入玩家名稱或有效的 Gmail。' : '請輸入有效的 Email 地址。');
      return;
    }
    // New email registrations require 8 characters; existing accounts may
    // still sign in with an older 6–7 character password.
    if (mode === 'signup' && password.length < 8) {
      showAuthMessage('密碼至少需要 8 位。');
      return;
    }
    if (mode === 'login' && password.length < 6) {
      showAuthMessage('密碼至少需要 6 位。');
      return;
    }

    authBusy = true;
    setAuthButtonsDisabled(true);
    showAuthMessage(mode === 'signup' ? '正在建立帳號…' : mode === 'resend' ? '正在重新寄送驗證信…' : '處理中…');
    try {
      let result;
      if (mode === 'usernameSignup' || (mode === 'login' && !isEmailIdentifier)) {
        const action = mode === 'usernameSignup' ? 'username_register' : 'username_login';
        const username = mode === 'usernameSignup'
          ? document.getElementById('authUsernameSignupName').value.trim()
          : email;
        const signupPassword = mode === 'usernameSignup'
          ? document.getElementById('authUsernameSignupPassword').value
          : password;
        const { data, error } = await supabaseClient.functions.invoke('dice-rng-auth', {
          body: { action, username, password: signupPassword }
        });
        if (error) throw new Error(data?.error || error.message || '玩家名稱登入服務暫時無法使用。');
        if (data?.error) throw new Error(data.error);
        if (data?.session) {
          // Username login returns a session for the UID resolved by the server.
          // Confirm that exact identity became the active browser session before
          // loading any player data; never continue with a previous account.
          const expectedUserId = data.session.user?.id || null;
          const { data: activated, error: sessionError } = await supabaseClient.auth.setSession(data.session);
          if (sessionError) throw sessionError;
          const signedUser = activated?.user || activated?.session?.user || null;
          if (!signedUser?.id || (expectedUserId && signedUser.id !== expectedUserId)) {
            await supabaseClient.auth.signOut().catch(() => {});
            setCurrentUser(null);
            throw new Error('登入帳號確認失敗，請重新登入。');
          }
          if (!enforceDeviceAccountLimit(signedUser)) {
            await supabaseClient.auth.signOut().catch(() => {});
            setCurrentUser(null);
            return;
          }
          setCurrentUser(signedUser);
          await startSessionInitialization(signedUser, 'SIGNED_IN', true);
          return;
        }
        if (mode === 'usernameSignup' && data?.success === true) {
          // Registration creates the account without a session. If another player
          // (for example the admin account) is still signed in on this browser,
          // end that session before asking the player to log in as the new account.
          let signupNotice = '帳號已建立，請使用剛設定的「建立帳號名稱」登入；它與遊戲暱稱不同。';
          const { data: activeSession, error: sessionReadError } = await supabaseClient.auth.getSession();
          if (sessionReadError) {
            signupNotice = '帳號已建立，但無法確認目前登入狀態。請先登出原帳號，再登入新帳號。';
          } else if (activeSession?.session) {
            const { error: signOutError } = await supabaseClient.auth.signOut();
            if (signOutError) {
              signupNotice = '帳號已建立，但原本帳號登出失敗。請先手動登出，再登入新帳號。';
            }
          }
          document.getElementById('authEmail').value = username;
          document.getElementById('authPassword').value = '';
          document.getElementById('authUsernameSignupName').value = '';
          document.getElementById('authUsernameSignupPassword').value = '';
          document.getElementById('authUsernameSignupPasswordConfirm').value = '';
          setUsernameSignupMode(false);
          showAuthMessage(signupNotice);
          document.getElementById('authEmail').focus();
          return;
        }
        showAuthMessage(data?.message || '操作完成，請返回登入。');
        return;
      }
      if (mode === 'signup') {
        result = await supabaseClient.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: 'https://hermes0403.github.io/dice-realm-rng/' }
        });
      } else if (mode === 'login') {
        result = await supabaseClient.auth.signInWithPassword({ email, password });
      } else if (mode === 'resend') {
        result = await supabaseClient.auth.resend({
          type: 'signup',
          email,
          options: { emailRedirectTo: 'https://hermes0403.github.io/dice-realm-rng/' }
        });
      } else {
        result = await supabaseClient.auth.resetPasswordForEmail(email, {
          redirectTo: 'https://hermes0403.github.io/dice-realm-rng/'
        });
      }
      if (result.error) throw result.error;

      if (mode === 'signup') {
        startSignupCooldown();
        const signedUser = result.data?.user;
        if (result.data?.session && signedUser?.email_confirmed_at) {
          const accountResult = checkAndRecordDeviceAccount(signedUser.email);
          if (!accountResult.allowed) {
            await supabaseClient.auth.signOut().catch(() => {});
            setCurrentUser(null);
            showAuthMessage('此裝置今日已登入過 3 個不同帳號，暫時無法登入第 4 個帳號。明天台灣時間 00:00 後會重置。');
            return;
          }
          setCurrentUser(signedUser);
          await startSessionInitialization(signedUser, 'SIGNED_IN', true);
          return;
        }
        if (result.data?.session && signedUser && !signedUser.email_confirmed_at) {
          await supabaseClient.auth.signOut().catch(() => {});
          setCurrentUser(null);
        }
        showAuthMessage('如果此 Email 尚未註冊，系統會寄出「骰界 RNG」驗證信，點擊「驗證信箱並進入骰界」；若沒看到，請檢查垃圾郵件。驗證完成後會自動返回遊戲。');
        return;
      }
      if (mode === 'resend') {
        startSignupCooldown();
        showAuthMessage('若此 Email 有尚未完成的註冊，系統會重新寄送驗證信。請檢查收件匣與垃圾郵件；完成驗證後點擊信中的按鈕返回遊戲。');
        return;
      }
      if (mode === 'reset') {
        startSignupCooldown();
        showAuthMessage('若此 Email 已註冊，系統會寄出密碼重設信。請點擊信中的連結，返回遊戲後設定新密碼。');
        return;
      }

      const signedUser = result.data?.user;
      if (!signedUser?.email_confirmed_at) {
        await supabaseClient.auth.signOut().catch(() => {});
        setCurrentUser(null);
        document.body.classList.add('auth-required');
        document.getElementById('authModal').style.display = 'flex';
        setRecoveryMode(false);
        showAuthMessage('此帳號的信箱尚未驗證，不能進入遊戲。請先完成 Email 驗證；若尚未收到信件，可按「重新寄送驗證信」。');
        return;
      }
      const accountResult = checkAndRecordDeviceAccount(signedUser.email);
      if (!accountResult.allowed) {
        await supabaseClient.auth.signOut().catch(() => {});
        setCurrentUser(null);
        document.body.classList.add('auth-required');
        document.getElementById('authModal').style.display = 'flex';
        document.getElementById('authCloseBtn').hidden = true;
        showAuthMessage('此裝置今日已登入過 3 個不同帳號，暫時無法登入第 4 個帳號。明天台灣時間 00:00 後會重置；已使用過的 3 個帳號仍可繼續登入。');
        return;
      }
      setCurrentUser(signedUser);
      await startSessionInitialization(signedUser, 'SIGNED_IN', true);
    } catch (error) {
      const message = String(error?.message || error?.msg || error?.error_description || '');
      if (isProjectRestrictionError(error)) {
        authServiceRestricted = true;
        showAuthMessage('Supabase 雲端服務目前因流量額度限制而暫停，暫時無法登入或寄送郵件。請待專案服務恢復後再試；本機已保存的資料不會因這個提示而被清除。');
      } else if (['signup', 'reset', 'resend'].includes(mode) && isEmailRateLimitError(error)) {
        startSignupCooldown(getServerCooldownMs(error));
        showAuthMessage(getAuthEmailRateLimitMessage(mode, error));
      } else if (/user.?banned|banned|被停權|已停權/i.test(message)) {
        await supabaseClient.auth.signOut().catch(() => {});
        showAuthMessage('偵測到違反遊戲規則\n已停權此帳號');
        document.getElementById('authMessage').style.whiteSpace = 'pre-line';
        document.getElementById('authModal').style.display = 'flex';
      } else if (mode === 'login') {
        showAuthMessage(getLoginFailureMessage(error));
      } else if (mode === 'signup' && /database error saving new user/i.test(message)) {
        showAuthMessage('目前無法建立此帳號，請稍後再試；若持續發生，請聯絡管理員。');
      } else {
        showAuthMessage(error?.message || '操作失敗，請稍後重試。');
      }
    } finally {
      authBusy = false;
      setAuthButtonsDisabled(false);
    }
  }

  async function updateRecoveredPassword() {
    if (authBusy || !recoveryMode || !getCurrentUser()) return;
    const password = document.getElementById('authNewPassword').value;
    const confirmation = document.getElementById('authNewPasswordConfirm').value;
    if (password.length < 8) {
      showAuthMessage('新密碼至少需要 8 位。');
      return;
    }
    if (password !== confirmation) {
      showAuthMessage('兩次輸入的新密碼不一致，請重新確認。');
      return;
    }
    authBusy = true;
    setAuthButtonsDisabled(true);
    showAuthMessage('正在更新密碼…');
    try {
      const { data, error } = await supabaseClient.auth.updateUser({ password });
      if (error) throw error;
      const user = data?.user || getCurrentUser();
      if (!user?.id) throw new Error('無法確認帳號狀態，請重新登入。');
      setCurrentUser(user);
      setRecoveryMode(false);
      document.getElementById('authNewPassword').value = '';
      document.getElementById('authNewPasswordConfirm').value = '';
      await startSessionInitialization(user, 'PASSWORD_RECOVERY', true);
    } catch (error) {
      if (isProjectRestrictionError(error)) {
        authServiceRestricted = true;
        showAuthMessage('Supabase 雲端服務目前受到限制，暫時無法更新密碼。請稍後再試。');
      } else {
        showAuthMessage(error?.message || '更新密碼失敗，請重新取得有效的重設連結。');
      }
    } finally {
      authBusy = false;
      setAuthButtonsDisabled(false);
    }
  }

  async function cancelPasswordRecovery() {
    if (authBusy) return;
    authBusy = true;
    setAuthButtonsDisabled(true);
    try {
      await supabaseClient.auth.signOut();
      setRecoveryMode(false);
      showAuthMessage('已取消密碼更新，請使用 Email 與密碼登入。');
    } catch (error) {
      showAuthMessage(error?.message || '無法取消密碼更新，請重新整理頁面。');
    } finally {
      authBusy = false;
      setAuthButtonsDisabled(false);
    }
  }

  async function retryCloudLoad() {
    const user = getCurrentUser();
    if (!user || authBusy) return;
    authBusy = true;
    setAuthButtonsDisabled(true);
    showAuthMessage('正在重新載入雲端存檔…');
    try {
      await startSessionInitialization(user, 'RETRY', true);
    } finally {
      authBusy = false;
      setAuthButtonsDisabled(false);
    }
  }

  function showAuthCallbackError() {
    const location = globalThis.window?.location;
    const params = new URLSearchParams(location?.search || '');
    const hashParams = new URLSearchParams((location?.hash || '').replace(/^#/, ''));
    const code = params.get('error_code') || params.get('error')
      || hashParams.get('error_code') || hashParams.get('error') || '';
    if (!code && !params.get('error_description') && !hashParams.get('error_description')) return;
    setRecoveryMode(false);
    document.getElementById('authModal').style.display = 'flex';
    document.body.classList.add('auth-required');
    const message = /otp_expired|access_denied|email_not_confirmed/i.test(code)
      ? '驗證連結已過期或已失效。請輸入 Email，按「重新寄送驗證信」取得新的連結。'
      : '驗證連結無法使用。請確認連結完整，或重新寄送一封驗證信。';
    document.getElementById('authOpenBtn').hidden = false;
    document.getElementById('authCloseBtn').hidden = true;
    showAuthMessage(message);
    if (location && globalThis.window?.history?.replaceState) {
      const cleanSearch = new URLSearchParams(params);
      ['error', 'error_code', 'error_description'].forEach(key => cleanSearch.delete(key));
      const query = cleanSearch.toString();
      const cleanHash = hashParams.has('error') || hashParams.has('error_code')
        || hashParams.has('error_description') ? '' : (location.hash || '');
      globalThis.window.history.replaceState({}, document.title,
        location.pathname + (query ? '?' + query : '') + cleanHash);
    }
  }

  function registerAuthStateListener() {
    if (!supabaseClient) return null;
    if (authStateSubscription) return authStateSubscription;
    authStateSubscription = supabaseClient.auth.onAuthStateChange((event, session) => {
      const previousUser = getCurrentUser();
      const incomingUser = session?.user || null;

      if (incomingUser) clearSessionOfflineMark();

      if ((event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')
        && incomingUser && previousUser?.id === incomingUser.id) {
        setCurrentUser(incomingUser);
        updateAdminVisibility();
        return;
      }

      if (event === 'PASSWORD_RECOVERY' && incomingUser) {
        if (!incomingUser.email_confirmed_at) {
          setCurrentUser(null);
          setRecoveryMode(false);
          document.getElementById('authModal').style.display = 'flex';
          document.body.classList.add('auth-required');
          showAuthMessage('此帳號的信箱尚未驗證，不能更新密碼或進入遊戲。請先完成 Email 驗證。');
          timerManager.setTimeout(() => supabaseClient.auth.signOut().catch(() => {}), 0, 'auth-recovery-unverified-signout');
          return;
        }
        if (!enforceDeviceAccountLimit(incomingUser)) return;
        setCurrentUser(incomingUser);
        setRecoveryMode(true);
        document.getElementById('authModal').style.display = 'flex';
        document.body.classList.add('auth-required');
        document.getElementById('authOpenBtn').hidden = true;
        document.getElementById('authCloseBtn').hidden = true;
        updateAdminVisibility();
        showAuthMessage('已確認重設密碼連結。請輸入並確認新密碼，完成後即可返回遊戲。');
        return;
      }

      if (incomingUser && !incomingUser.email_confirmed_at) {
        setCurrentUser(null);
        setRecoveryMode(false);
        document.body.classList.add('auth-required');
        document.getElementById('authModal').style.display = 'flex';
        document.getElementById('authCloseBtn').hidden = true;
        document.getElementById('authOpenBtn').hidden = false;
        updateAdminVisibility();
        showAuthMessage('信箱尚未驗證，不能進入遊戲。請先完成 Email 確認；若尚未收到信件，可按「重新寄送驗證信」。');
        timerManager.setTimeout(() => supabaseClient.auth.signOut().catch(() => {}), 0, 'auth-signout');
        return;
      }

      if (incomingUser && !enforceDeviceAccountLimit(incomingUser)) return;

      if (!incomingUser) {
        clearSessionOfflineMark();
        sessionGeneration++;
        sessionInitPromise = null;
        sessionInitUserId = null;
        sessionInitAttemptedUserId = null;
        recoveryMode = false;
        if (previousUser) {
          timerManager.setTimeout(() => {
            Promise.resolve(releaseDeviceLock(previousUser.id)).catch(error => {
              console.warn('Device lock release after sign-out failed', error);
            });
          }, 0, 'auth-release-device-lock');
        }
        setCurrentUser(null);
        setRecoveryMode(false);
        timerManager.setTimeout(() => {
          try { setupPlayerWeatherSubscription(); }
          catch (error) { console.warn('Player weather unsubscribe failed', error); }
        }, 0, 'auth-clear-player-weather');
        document.getElementById('authOpenBtn').hidden = false;
        document.getElementById('authCloseBtn').hidden = true;
        document.getElementById('authModal').style.display = 'flex';
        document.getElementById('saveStatus').textContent = '本機存檔';
        updateAdminVisibility();
        timerManager.setTimeout(() => recordGameVisit('visit'), 700, 'auth-visit-record');
        return;
      }

      setCurrentUser(incomingUser);
      document.getElementById('authOpenBtn').hidden = true;
      document.getElementById('authCloseBtn').hidden = true;
      document.getElementById('authModal').style.display = 'flex';
      document.body.classList.add('auth-required');
      setRecoveryMode(false);
      document.getElementById('authCloseBtn').hidden = true;
      updateAdminVisibility();
      timerManager.setTimeout(() => {
        if (getCurrentUser()?.id === incomingUser.id) {
          void startSessionInitialization(incomingUser, event);
        }
      }, 0, 'auth-session-init');
    });
    showAuthCallbackError();
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
    openUsernameSignup,
    closeUsernameSignup,
    authAction,
    updateRecoveredPassword,
    cancelPasswordRecovery,
    retryCloudLoad,
    registerAuthStateListener,
    unregisterAuthStateListener
  };
}
