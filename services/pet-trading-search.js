export function createPetTradingSearch({ supabaseClient, getCurrentUser, getState = () => ({ pets: [] }), petById = () => null, petArt = null, onTradeCompleted = () => {}, flushCloudSave = async () => true, escapeHTML, documentRef = document, toast = () => {} }) {
  const doc = documentRef;
  let selectedPlayer = null;
  let searchResults = [];
  let playerOffset = 0;
  const PLAYER_PAGE_SIZE = 50;
  let hasMorePlayers = false;
  let searching = false;
  let refreshing = false;
  let refreshQueued = false;
  let observedAuthUserId = null;
  const realtimeChannels = new Map();
  const completedSessionsHandled = new Set();
  const offerDrafts = new Map();

  function setStatus(message) {
    const node = doc.getElementById('petTradeSearchHint');
    if (node) node.textContent = message;
  }

  function renderResults(rows) {
    const host = doc.getElementById('petTradeSearchResults');
    if (!host) return;
    host.replaceChildren();
    if (!rows.length) {
      host.textContent = getCurrentUser() ? '目前沒有其他玩家。' : '請先登入雲端帳號。';
      return;
    }
    for (const row of rows) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'pet-trade-search-result' + (selectedPlayer?.user_id === row.user_id ? ' is-selected' : '');
      button.setAttribute('aria-pressed', String(selectedPlayer?.user_id === row.user_id));
      const name = doc.createElement('span');
      name.className = 'pet-trade-player-name';
      const strong = doc.createElement('strong');
      strong.textContent = row.username || '未命名玩家';
      name.append(strong);
      const action = doc.createElement('span');
      action.className = 'pet-trade-player-select-label';
      action.textContent = selectedPlayer?.user_id === row.user_id ? '已選擇' : '選擇';
      button.append(name, action);
      button.addEventListener('click', () => selectPlayer(row));
      host.append(button);
    }
  }

  function selectPlayer(row) {
    selectedPlayer = row;
    const panel = doc.getElementById('petTradeSelectedTarget');
    const invite = doc.getElementById('petTradeInviteBtn');
    if (panel) {
      panel.hidden = false;
      panel.textContent = '已選擇交易對象：' + (row.username || '未命名玩家');
    }
    if (invite) {
      invite.disabled = false;
      invite.textContent = '發送交易邀請';
    }
    renderResults(searchResults);
    setStatus('玩家已選擇，可以發送交易邀請。邀請有效時間為 2 分鐘。');
  }

  async function refreshPlayers({ append = false } = {}) {
    const host = doc.getElementById('petTradeSearchResults');
    const moreButton = doc.getElementById('petTradeLoadMorePlayers');
    const user = getCurrentUser();
    if (!host) return;
    if (!user || !supabaseClient) {
      host.textContent = '請先登入雲端帳號。';
      if (moreButton) moreButton.hidden = true;
      setStatus('');
      return;
    }
    if (searching) return;
    searching = true;
    if (!append) {
      playerOffset = 0;
      searchResults = [];
      host.textContent = '正在載入玩家列表…';
      selectedPlayer = null;
      const selected = doc.getElementById('petTradeSelectedTarget');
      const invite = doc.getElementById('petTradeInviteBtn');
      if (selected) selected.hidden = true;
      if (invite) invite.disabled = true;
    }
    setStatus('');
    const start = append ? playerOffset : 0;
    try {
      const { data, error } = await supabaseClient.from('player_profiles')
        .select('user_id,username')
        .neq('user_id', user.id)
        .order('username', { ascending: true })
        .range(start, start + PLAYER_PAGE_SIZE - 1);
      if (error) throw error;
      const rows = (Array.isArray(data) ? data : []).filter(row => row?.user_id && row.user_id !== user.id);
      searchResults = append ? [...searchResults, ...rows] : rows;
      playerOffset = start + rows.length;
      hasMorePlayers = rows.length === PLAYER_PAGE_SIZE;
      renderResults(searchResults);
      if (moreButton) moreButton.hidden = !hasMorePlayers;
      setStatus('');
    } catch (error) {
      console.warn('Pet trade player list failed', error);
      if (!append) host.textContent = '玩家列表載入失敗，請稍後重新整理。';
      setStatus('無法讀取玩家列表，請確認登入狀態後重試。');
      if (moreButton) moreButton.hidden = true;
    } finally {
      searching = false;
    }
  }

  async function sendInvitation() {
    const user = getCurrentUser();
    if (!user || !selectedPlayer || selectedPlayer.user_id === user.id) return;
    const button = doc.getElementById('petTradeInviteBtn');
    if (button) button.disabled = true;
    try {
      const { data, error } = await supabaseClient.rpc('create_pet_trade_invitation', {
        p_recipient_id: selectedPlayer.user_id
      });
      if (error) throw error;
      setStatus('交易邀請已送出，等待對方接受（2 分鐘內有效）。');
      if (button) button.textContent = '邀請已送出';
      toast('交易邀請已送出');
      await refreshInvitations();
      return data;
    } catch (error) {
      console.warn('Pet trade invitation failed', error);
      setStatus(error?.message?.includes('pending_invitation_exists')
        ? '你們之間已有尚未處理的邀請。'
        : error?.message?.includes('invitation_rate_limited')
          ? '邀請太頻繁，請稍後再試。'
          : '邀請未能送出，請稍後重新整理再試。');
      if (button) button.disabled = false;
    }
  }

  function makeActionButton(label, id, action, status) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'quiet pet-trade-invitation-action';
    button.textContent = label;
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const { error } = await supabaseClient.rpc('respond_pet_trade_invitation', {
          p_invitation_id: id,
          p_action: action
        });
        if (error) throw error;
        toast(status);
        await refreshInvitations();
      } catch (error) {
        console.warn('Pet trade invitation response failed', error);
        button.disabled = false;
        setStatus('邀請狀態更新失敗，請重新整理邀請清單。');
      }
    });
    return button;
  }

  function makeTradeRoom(session, user) {
    const room = doc.createElement('div');
    room.className = 'pet-trade-live-room';
    const ownIsA = user.id === session.participant_a;
    const ownOffer = ownIsA
      ? (Array.isArray(session.offered_pet_uids_a) ? session.offered_pet_uids_a : (session.offered_pet_uid_a ? [session.offered_pet_uid_a] : []))
      : (Array.isArray(session.offered_pet_uids_b) ? session.offered_pet_uids_b : (session.offered_pet_uid_b ? [session.offered_pet_uid_b] : []));
    const otherOffer = ownIsA
      ? (Array.isArray(session.offered_pet_uids_b) ? session.offered_pet_uids_b : (session.offered_pet_uid_b ? [session.offered_pet_uid_b] : []))
      : (Array.isArray(session.offered_pet_uids_a) ? session.offered_pet_uids_a : (session.offered_pet_uid_a ? [session.offered_pet_uid_a] : []));
    const ownSnapshots = ownIsA
      ? (Array.isArray(session.offered_pet_snapshots_a) ? session.offered_pet_snapshots_a : (session.offered_pet_snapshot_a ? [session.offered_pet_snapshot_a] : []))
      : (Array.isArray(session.offered_pet_snapshots_b) ? session.offered_pet_snapshots_b : (session.offered_pet_snapshot_b ? [session.offered_pet_snapshot_b] : []));
    const otherSnapshots = ownIsA
      ? (Array.isArray(session.offered_pet_snapshots_b) ? session.offered_pet_snapshots_b : (session.offered_pet_snapshot_b ? [session.offered_pet_snapshot_b] : []))
      : (Array.isArray(session.offered_pet_snapshots_a) ? session.offered_pet_snapshots_a : (session.offered_pet_snapshot_a ? [session.offered_pet_snapshot_a] : []));
    const ownConfirmed = ownIsA ? session.confirmed_a : session.confirmed_b;
    const otherConfirmed = ownIsA ? session.confirmed_b : session.confirmed_a;
    const revision = Number(session.revision) || 0;
    const pets = Array.isArray(getState()?.pets) ? getState().pets.filter(item => item?.uid && petById(item.id)) : [];
    let draft = offerDrafts.get(session.id);
    if (!draft || draft.revision !== revision) {
      draft = { revision, uids: [...ownOffer] };
      offerDrafts.set(session.id, draft);
    }
    let draftOffer = [...draft.uids];

    const heading = doc.createElement('div');
    heading.className = 'pet-trade-room-heading';
    const headingText = doc.createElement('div');
    const title = doc.createElement('strong');
    title.textContent = '交易房間';
    const subtitle = doc.createElement('small');
    subtitle.textContent = '雙方最多各提供 4 隻寵物；內容送出後，雙方都要重新確認。';
    headingText.append(title, subtitle);
    const roomCode = doc.createElement('span');
    roomCode.className = 'pet-trade-room-code';
    roomCode.textContent = 'ROOM ' + String(session.id || '').slice(0, 8).toUpperCase();
    heading.append(headingText, roomCode);

    function makePetCard(item, selectable = false, selected = false) {
      const definition = petById(item?.id);
      const card = doc.createElement(selectable ? 'button' : 'div');
      if (selectable) {
        card.type = 'button';
        card.className = 'pet-trade-pet-card pet-trade-pet-option' + (selected ? ' is-selected is-draft-selected' : '');
        card.setAttribute('aria-pressed', String(selected));
      } else {
        card.className = 'pet-trade-pet-card pet-trade-pet-preview';
      }
      const art = doc.createElement('div');
      art.className = 'pet-trade-pet-art';
      art.innerHTML = petArt && definition ? petArt(definition, true) : (definition?.icon || '◈');
      const name = doc.createElement('strong');
      name.textContent = definition?.name || '未知寵物';
      const rarity = doc.createElement('small');
      rarity.textContent = definition?.rarity || '寵物';
      const weight = doc.createElement('small');
      weight.textContent = (Number(item?.kg) || 0).toFixed(2) + ' kg';
      card.append(art, name, rarity, weight);
      return card;
    }

    const sides = doc.createElement('div');
    sides.className = 'pet-trade-offer-sides';
    const ownSide = doc.createElement('section');
    ownSide.className = 'pet-trade-offer-side pet-trade-own-side';
    const otherSide = doc.createElement('section');
    otherSide.className = 'pet-trade-offer-side pet-trade-other-side';

    const ownHead = doc.createElement('div');
    ownHead.className = 'pet-trade-side-head';
    const ownTitle = doc.createElement('strong');
    ownTitle.textContent = '你的提供';
    const ownCount = doc.createElement('span');
    ownCount.className = 'pet-trade-offer-count';
    ownHead.append(ownTitle, ownCount);
    const ownHint = doc.createElement('small');
    ownHint.className = 'pet-trade-side-hint';
    ownHint.textContent = '點選下方寵物加入或移除，最多 4 隻。';
    const ownSearch = doc.createElement('input');
    ownSearch.type = 'search';
    ownSearch.className = 'field pet-trade-pet-search';
    ownSearch.placeholder = '搜尋自己的寵物名稱…';
    ownSearch.setAttribute('aria-label', '搜尋自己的寵物');
    const ownGrid = doc.createElement('div');
    ownGrid.className = 'pet-trade-pet-picker';
    const saveOffer = doc.createElement('button');
    saveOffer.type = 'button';
    saveOffer.className = 'primary pet-trade-save-offer';
    saveOffer.textContent = '送出交易內容';
    saveOffer.disabled = true;
    ownSide.append(ownHead, ownHint, ownSearch, ownGrid, saveOffer);

    const otherHead = doc.createElement('div');
    otherHead.className = 'pet-trade-side-head';
    const otherTitle = doc.createElement('strong');
    otherTitle.textContent = '對方提供';
    const otherCount = doc.createElement('span');
    otherCount.className = 'pet-trade-offer-count';
    otherHead.append(otherTitle, otherCount);
    const otherHint = doc.createElement('small');
    otherHint.className = 'pet-trade-side-hint';
    otherHint.textContent = '對方送出後，這裡會顯示完整寵物資訊。';
    const otherGrid = doc.createElement('div');
    otherGrid.className = 'pet-trade-pet-picker pet-trade-other-pet-grid';
    if (otherSnapshots.length) {
      for (const item of otherSnapshots) otherGrid.append(makePetCard(item));
    } else {
      const empty = doc.createElement('div');
      empty.className = 'pet-trade-empty-offer';
      empty.textContent = '等待對方選擇寵物…';
      otherGrid.append(empty);
    }
    otherSide.append(otherHead, otherHint, otherGrid);
    sides.append(ownSide, otherSide);

    const state = doc.createElement('div');
    state.className = 'pet-trade-confirm-state';
    const ownState = doc.createElement('span');
    ownState.className = ownConfirmed ? 'is-confirmed' : '';
    ownState.textContent = '你：' + (ownConfirmed ? '已確認' : '尚未確認');
    const otherState = doc.createElement('span');
    otherState.className = otherConfirmed ? 'is-confirmed' : '';
    otherState.textContent = '對方：' + (otherConfirmed ? '已確認' : '尚未確認');
    state.append(ownState, otherState);

    const actions = doc.createElement('div');
    actions.className = 'pet-trade-room-actions';
    const confirm = doc.createElement('button');
    confirm.type = 'button';
    confirm.className = 'primary pet-trade-confirm-button';
    confirm.textContent = ownConfirmed ? '✓ 已準備，等待對方' : '✓ 準備完成';
    confirm.disabled = !ownOffer.length || !otherOffer.length || ownConfirmed || JSON.stringify(draftOffer) !== JSON.stringify(ownOffer);
    const hint = doc.createElement('small');
    hint.className = 'pet-trade-room-hint';
    hint.textContent = '確認前請再次檢查雙方提供的寵物；按下「準備完成」後，仍可在對方確認前取消房間。';

    function updateDraftUI() {
      ownCount.textContent = draftOffer.length + ' / 4 隻';
      saveOffer.disabled = JSON.stringify(draftOffer) === JSON.stringify(ownOffer);
      saveOffer.textContent = saveOffer.disabled ? '交易內容已送出' : '送出交易內容（' + draftOffer.length + ' 隻）';
      confirm.disabled = !ownOffer.length || !otherOffer.length || ownConfirmed || JSON.stringify(draftOffer) !== JSON.stringify(ownOffer);
      if (JSON.stringify(draftOffer) !== JSON.stringify(ownOffer)) {
        hint.textContent = '你有尚未送出的選擇，送出後雙方確認狀態會重置。';
      } else {
        hint.textContent = '雙方都準備完成後，伺服器才會執行交換。';
      }
    }

    function renderOwnPets(filter = '') {
      ownGrid.replaceChildren();
      const needle = String(filter || '').trim().toLocaleLowerCase();
      const visible = pets.filter(item => {
        const definition = petById(item.id);
        return !needle || String(definition?.name || '').toLocaleLowerCase().includes(needle);
      });
      if (!visible.length) {
        const empty = doc.createElement('div');
        empty.className = 'pet-trade-empty-offer';
        empty.textContent = pets.length ? '沒有符合名稱的寵物。' : '目前沒有可交易的寵物。';
        ownGrid.append(empty);
        updateDraftUI();
        return;
      }
      for (const item of visible) {
        const selected = draftOffer.includes(String(item.uid));
        const card = makePetCard(item, true, selected);
        card.addEventListener('click', () => {
          const uid = String(item.uid);
          if (draftOffer.includes(uid)) {
            draftOffer = draftOffer.filter(value => value !== uid);
          } else {
            if (draftOffer.length >= 4) {
              toast('每次交易最多只能提供 4 隻寵物');
              return;
            }
            draftOffer = [...draftOffer, uid];
          }
          offerDrafts.set(session.id, { revision, uids: [...draftOffer] });
          renderOwnPets(ownSearch.value);
        });
        ownGrid.append(card);
      }
      updateDraftUI();
    }

    ownSearch.addEventListener('input', () => renderOwnPets(ownSearch.value));
    renderOwnPets();

    otherCount.textContent = otherOffer.length + ' / 4 隻';
    saveOffer.addEventListener('click', async () => {
      if (saveOffer.disabled) return;
      saveOffer.disabled = true;
      try {
        const synced = await flushCloudSave();
        if (synced !== true) throw new Error('pet_trade_cloud_save_not_ready');
        const currentPets = Array.isArray(getState()?.pets) ? getState().pets : [];
        const currentUids = new Set(currentPets.map(item => String(item?.uid || '')).filter(Boolean));
        if (draftOffer.some(uid => !currentUids.has(String(uid)))) {
          throw new Error('pet_trade_local_inventory_changed');
        }
        const { error } = await supabaseClient.rpc('set_pet_trade_offers', {
          p_session_id: session.id,
          p_pet_uids: draftOffer
        });
        if (error) throw error;
        offerDrafts.delete(session.id);
        toast('交易內容已送出，雙方需要重新確認');
        await refreshInvitations();
      } catch (error) {
        console.warn('Pet trade offer update failed', error);
        const message = String(error?.message || '');
        hint.textContent = message.includes('pet_not_owned_or_duplicate_uid')
          ? '雲端背包尚未確認這隻寵物，已保留目前選擇；請稍後重試。'
          : message.includes('pet_trade_cloud_save_not_ready')
            ? '雲端存檔同步尚未完成，這次沒有送出交易內容；請稍後重試。'
            : message.includes('pet_trade_local_inventory_changed')
              ? '背包資料剛更新，這次沒有送出交易內容；請重新整理交易房間後選擇。'
              : message.includes('trade_offer_limit_exceeded')
                ? '每次交易最多只能提供 4 隻寵物。'
                : '交易內容送出失敗，已保留選擇；可以重新嘗試。';
        // Always restore the action after a rejected request. The player must
        // never be trapped with a permanently disabled "send offer" button.
        saveOffer.disabled = false;
        saveOffer.textContent = '重試送出交易內容（' + draftOffer.length + ' 隻）';
      }
    });

    confirm.addEventListener('click', async () => {
      confirm.disabled = true;
      try {
        const { data, error } = await supabaseClient.rpc('confirm_pet_trade', {
          p_session_id: session.id,
          p_expected_revision: revision
        });
        if (error) throw error;
        const result = Array.isArray(data) ? data[0] : data;
        if (result?.completed) {
          toast('寵物交換完成！正在同步雙方背包。');
        } else {
          toast('你已準備完成，等待對方確認');
        }
        await refreshInvitations();
      } catch (error) {
        console.warn('Pet trade confirmation failed', error);
        hint.textContent = error?.message?.includes('trade_offer_changed_reload')
          ? '交易內容剛剛有變更，正在重新整理，請再次確認。'
          : error?.message?.includes('offered_pet_no_longer_owned')
            ? '有寵物已不在持有清單，請重新選擇。'
            : '確認失敗：' + (error?.message || '請重新整理後再試。');
        confirm.disabled = false;
        if (error?.message?.includes('trade_offer_changed_reload')) await refreshInvitations();
      }
    });

    actions.append(confirm);
    room.append(heading, sides, state, actions, hint);
    return room;
  }

  function makeSessionActionButton(sessionId, label) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'quiet pet-trade-invitation-action';
    button.textContent = label;
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const { error } = await supabaseClient.rpc('cancel_pet_trade_session', {
          p_session_id: sessionId
        });
        if (error) throw error;
        toast(label === '取消交易房間' ? '交易房間已取消' : '逾期房間狀態已更新');
        await refreshInvitations();
      } catch (error) {
        console.warn('Pet trade session cancellation failed', error);
        button.disabled = false;
        setStatus('交易房間狀態更新失敗，請重新整理後再試。');
      }
    });
    return button;
  }

  function removeRealtimeChannels() {
    for (const channel of realtimeChannels.values()) {
      if (supabaseClient?.removeChannel) supabaseClient.removeChannel(channel);
      else channel.unsubscribe?.();
    }
    realtimeChannels.clear();
  }

  function ensureRealtimeChannel(key, table, filter) {
    if (!supabaseClient?.channel || realtimeChannels.has(key)) return;
    const channel = supabaseClient.channel(key)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table,
        filter
      }, () => {
        if (refreshing) refreshQueued = true;
        else void refreshInvitations();
      })
      .subscribe();
    realtimeChannels.set(key, channel);
  }

  function syncRealtimeChannels(user, sessions) {
    const wanted = new Set();
    const sentKey = 'pet-trade-invites-sent-' + user.id;
    const receivedKey = 'pet-trade-invites-received-' + user.id;
    wanted.add(sentKey);
    wanted.add(receivedKey);
    ensureRealtimeChannel(sentKey, 'pet_trade_invitations', 'sender_id=eq.' + user.id);
    ensureRealtimeChannel(receivedKey, 'pet_trade_invitations', 'recipient_id=eq.' + user.id);

    for (const session of sessions) {
      if (session.status !== 'active') continue;
      const key = 'pet-trade-session-' + session.id;
      wanted.add(key);
      ensureRealtimeChannel(key, 'pet_trade_sessions', 'id=eq.' + session.id);
    }

    for (const [key, channel] of realtimeChannels) {
      if (wanted.has(key)) continue;
      if (supabaseClient?.removeChannel) supabaseClient.removeChannel(channel);
      else channel.unsubscribe?.();
      realtimeChannels.delete(key);
    }
  }

  async function refreshInvitations() {
    const host = doc.getElementById('petTradeInvitations');
    const user = getCurrentUser();
    if (!host) return;
    if (!user) {
      removeRealtimeChannels();
      host.textContent = '登入後載入邀請。';
      return;
    }
    if (refreshing) {
      refreshQueued = true;
      return;
    }
    refreshing = true;
    host.textContent = '正在讀取邀請…';
    try {
      const { data, error } = await supabaseClient.from('pet_trade_invitations')
        .select('id,sender_id,recipient_id,status,created_at,expires_at')
        .or('sender_id.eq.' + user.id + ',recipient_id.eq.' + user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      const acceptedIds = rows.filter(row => row.status === 'accepted').map(row => row.id);
      let sessionsByInvitation = new Map();
      if (acceptedIds.length) {
        const sessions = await supabaseClient.from('pet_trade_sessions')
          .select('id,invitation_id,participant_a,participant_b,status,created_at,expires_at,offered_pet_uid_a,offered_pet_uid_b,offered_pet_snapshot_a,offered_pet_snapshot_b,offered_pet_uids_a,offered_pet_uids_b,offered_pet_snapshots_a,offered_pet_snapshots_b,confirmed_a,confirmed_b,revision')
          .in('invitation_id', acceptedIds);
        if (sessions.error) throw sessions.error;
        sessionsByInvitation = new Map((sessions.data || []).map(row => [row.invitation_id, row]));
      }
      syncRealtimeChannels(user, [...sessionsByInvitation.values()]);
      const completedSessionsToSync = [...sessionsByInvitation.values()]
        .filter(session => session.status === 'completed')
        .filter(session => !completedSessionsHandled.has(user.id + ':' + session.id));
      const activeSessions = [...sessionsByInvitation.values()].filter(session => {
        const expiry = Date.parse(session.expires_at);
        return session.status === 'active' && Number.isFinite(expiry) && expiry > Date.now();
      });
      const tradeView = doc.getElementById('petsTradeView');
      tradeView?.classList.toggle('is-trading', activeSessions.length > 0);
      host.replaceChildren();

      // While a trade is active, render only the live room. Keep invitation history
      // and the player directory out of the way until the session ends.
      if (activeSessions.length) {
        for (const session of activeSessions) {
          const roomOnly = doc.createElement('div');
          roomOnly.className = 'pet-trade-active-room-only';
          roomOnly.append(makeTradeRoom(session, user));
          host.append(roomOnly);
        }
        for (const session of completedSessionsToSync) {
          const syncKey = user.id + ':' + session.id;
          completedSessionsHandled.add(syncKey);
          try {
            await onTradeCompleted();
          } catch (syncError) {
            console.warn('Completed pet trade cloud save refresh failed', syncError);
            setStatus('交易已完成，但背包同步失敗，請重新整理遊戲。');
          }
        }
        return;
      }

      // The inbox is intentionally limited to incoming, unanswered requests.
      // Accepted sessions are rendered only in the active room view above; sent,
      // expired, rejected, cancelled and completed records are not inbox items.
      const pendingRequests = rows.filter(row => {
        if (row.recipient_id !== user.id || row.status !== 'pending') return false;
        const expiresAt = Date.parse(row.expires_at);
        return Number.isFinite(expiresAt) && expiresAt > Date.now();
      });
      const senderIds = [...new Set(pendingRequests.map(row => row.sender_id).filter(Boolean))];
      let names = new Map();
      if (senderIds.length) {
        const profiles = await supabaseClient.from('player_profiles').select('user_id,username').in('user_id', senderIds);
        if (!profiles.error) names = new Map((profiles.data || []).map(row => [row.user_id, row.username || '未命名玩家']));
      }
      if (!pendingRequests.length) {
        host.textContent = '目前沒有待處理的交易請求。';
        return;
      }
      for (const row of pendingRequests) {
        const item = doc.createElement('div');
        item.className = 'pet-trade-invitation pet-trade-request';
        const summary = doc.createElement('div');
        const title = doc.createElement('strong');
        title.textContent = '交易請求：' + (names.get(row.sender_id) || '玩家');
        const meta = doc.createElement('small');
        const expiry = Date.parse(row.expires_at);
        meta.textContent = '等待你回覆 · 有效期限 ' + new Date(expiry).toLocaleTimeString();
        summary.append(title, meta);
        item.append(summary);
        item.append(makeActionButton('接受', row.id, 'accept', '已接受交易請求'));
        item.append(makeActionButton('拒絕', row.id, 'reject', '已拒絕交易請求'));
        host.append(item);
      }
      for (const session of completedSessionsToSync) {
        const syncKey = user.id + ':' + session.id;
        completedSessionsHandled.add(syncKey);
        try {
          await onTradeCompleted();
        } catch (syncError) {
          console.warn('Completed pet trade cloud save refresh failed', syncError);
          setStatus('交易已完成，但背包同步失敗，請重新整理遊戲。');
        }
      }
    } catch (error) {
      console.warn('Pet trade invitation refresh failed', error);
      host.textContent = '邀請清單載入失敗，請稍後重試。';
    } finally {
      refreshing = false;
      if (refreshQueued) {
        refreshQueued = false;
        void refreshInvitations();
      }
    }
  }

  function setup() {
    const invite = doc.getElementById('petTradeInviteBtn');
    const refresh = doc.getElementById('petTradeRefreshInvites');
    const refreshPlayersButton = doc.getElementById('petTradeRefreshPlayers');
    const loadMorePlayersButton = doc.getElementById('petTradeLoadMorePlayers');
    if (invite) invite.addEventListener('click', sendInvitation);
    if (refresh) refresh.addEventListener('click', refreshInvitations);
    if (refreshPlayersButton) refreshPlayersButton.addEventListener('click', () => refreshPlayers());
    if (loadMorePlayersButton) loadMorePlayersButton.addEventListener('click', () => refreshPlayers({ append: true }));
    doc.querySelectorAll('[data-pets-view]').forEach(button => {
      button.addEventListener('click', () => {
        const view = button.dataset.petsView === 'trade' ? 'trade' : 'fusion';
        doc.getElementById('petsFusionView')?.toggleAttribute('hidden', view !== 'fusion');
        doc.getElementById('petsTradeView')?.toggleAttribute('hidden', view !== 'trade');
        doc.querySelectorAll('[data-pets-view]').forEach(tab => {
          const active = tab.dataset.petsView === view;
          tab.classList.toggle('active', active);
          tab.setAttribute('aria-pressed', String(active));
        });
        if (view === 'trade') {
          void refreshPlayers();
          void refreshInvitations();
        }
      });
    });
    if (supabaseClient?.auth?.onAuthStateChange) {
      supabaseClient.auth.onAuthStateChange((_event, session) => {
        const nextUserId = session?.user?.id || null;
        if (nextUserId !== observedAuthUserId) {
          observedAuthUserId = nextUserId;
          selectedPlayer = null;
          searchResults = [];
          offerDrafts.clear();
          renderResults([]);
          playerOffset = 0;
          hasMorePlayers = false;
          const selected = doc.getElementById('petTradeSelectedTarget');
          const inviteButton = doc.getElementById('petTradeInviteBtn');
          if (selected) {
            selected.hidden = true;
            selected.textContent = '';
          }
          if (inviteButton) {
            inviteButton.disabled = true;
            inviteButton.textContent = '發送交易邀請';
          }
          if (!nextUserId) {
            removeRealtimeChannels();
            const host = doc.getElementById('petTradeInvitations');
            if (host) host.textContent = '登入後載入邀請。';
            return;
          }
        }
        queueMicrotask(() => {
          void refreshInvitations();
          if (doc.getElementById('petsTradeView') && !doc.getElementById('petsTradeView').hidden) void refreshPlayers();
        });
      });
    }
    refreshInvitations();
  }

  return { setup, refreshPlayers, refreshInvitations, getSelectedPlayer: () => selectedPlayer };
}
