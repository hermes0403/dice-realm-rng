export function createPetTradingSearch({ supabaseClient, getCurrentUser, getState = () => ({ pets: [] }), petById = () => null, petArt = null, onTradeCompleted = () => {}, escapeHTML, documentRef = document, toast = () => {} }) {
  const doc = documentRef;
  let selectedPlayer = null;
  let searchResults = [];
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
      host.textContent = '找不到符合條件的玩家。';
      return;
    }
    for (const row of rows) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'pet-trade-search-result';
      button.setAttribute('aria-pressed', String(selectedPlayer?.user_id === row.user_id));
      const name = doc.createElement('span');
      const strong = doc.createElement('strong');
      strong.textContent = row.username || '未命名玩家';
      const small = doc.createElement('small');
      small.textContent = '玩家代碼：' + String(row.user_id).slice(0, 8).toUpperCase();
      name.append(strong, small);
      const action = doc.createElement('span');
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
      panel.textContent = '已選擇交易對象：' + (row.username || '未命名玩家') + '（' + row.user_id + '）';
    }
    if (invite) {
      invite.disabled = false;
      invite.textContent = '發送交易邀請';
    }
    renderResults(searchResults);
    setStatus('玩家已選擇，可以發送交易邀請。邀請有效時間為 2 分鐘。');
  }

  async function search() {
    const input = doc.getElementById('petTradeTarget');
    const query = String(input?.value || '').trim();
    const host = doc.getElementById('petTradeSearchResults');
    const user = getCurrentUser();
    if (!supabaseClient || !user) {
      setStatus('請先登入雲端帳號，再搜尋玩家。');
      return;
    }
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query);
    const safeNameQuery = query.replace(/[\\%_(),]/g, '').trim();
    if (!uuid && safeNameQuery.length < 2) {
      setStatus('請輸入至少 2 個有效字元的玩家名稱，或完整玩家 UUID。');
      return;
    }
    if (searching) return;
    searching = true;
    selectedPlayer = null;
    searchResults = [];
    const panel = doc.getElementById('petTradeSelectedTarget');
    const invite = doc.getElementById('petTradeInviteBtn');
    if (panel) panel.hidden = true;
    if (invite) invite.disabled = true;
    if (host) host.textContent = '正在搜尋玩家…';
    setStatus('正在搜尋雲端玩家資料…');
    try {
      let request = supabaseClient.from('player_profiles')
        .select('user_id,username')
        .neq('user_id', user.id)
        .limit(10);
      request = uuid ? request.eq('user_id', query) : request.ilike('username', '%' + safeNameQuery + '%');
      const { data, error } = await request;
      if (error) throw error;
      const rows = (Array.isArray(data) ? data : []).filter(row => row?.user_id && row.user_id !== user.id);
      searchResults = rows;
      renderResults(rows);
      setStatus(rows.length ? '找到 ' + rows.length + ' 位玩家，選擇一位作為交易對象。' : '沒有找到符合條件的玩家。');
    } catch (error) {
      console.warn('Pet trade player search failed', error);
      if (host) host.textContent = '搜尋失敗，請稍後再試。';
      setStatus('無法讀取玩家清單，請確認登入狀態後重試。');
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
        card.className = 'pet-trade-pet-card pet-trade-pet-option' + (selected ? ' is-selected' : '');
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
    confirm.textContent = ownConfirmed ? '已確認，等待對方' : '確認交易內容';
    confirm.disabled = !ownOffer.length || !otherOffer.length || ownConfirmed || JSON.stringify(draftOffer) !== JSON.stringify(ownOffer);
    const hint = doc.createElement('small');
    hint.className = 'pet-trade-room-hint';
    hint.textContent = '寵物只有在雙方確認且伺服器完成交換後才會轉移。';

    function updateDraftUI() {
      ownCount.textContent = draftOffer.length + ' / 4 隻';
      saveOffer.disabled = JSON.stringify(draftOffer) === JSON.stringify(ownOffer);
      saveOffer.textContent = saveOffer.disabled ? '交易內容已送出' : '送出交易內容（' + draftOffer.length + ' 隻）';
      confirm.disabled = !ownOffer.length || !otherOffer.length || ownConfirmed || JSON.stringify(draftOffer) !== JSON.stringify(ownOffer);
      if (JSON.stringify(draftOffer) !== JSON.stringify(ownOffer)) {
        hint.textContent = '你有尚未送出的選擇，送出後雙方確認狀態會重置。';
      } else {
        hint.textContent = '寵物只有在雙方確認且伺服器完成交換後才會轉移。';
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
      saveOffer.disabled = true;
      try {
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
        hint.textContent = error?.message?.includes('pet_not_owned_or_duplicate_uid')
          ? '其中一隻寵物已不在你的背包，請重新整理後選擇。'
          : error?.message?.includes('trade_offer_limit_exceeded')
            ? '每次交易最多只能提供 4 隻寵物。'
            : '交易內容送出失敗，請重新整理交易房間。';
        saveOffer.disabled = false;
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
          toast('已確認交易內容，等待對方確認');
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
      const otherIds = [...new Set(rows.map(row => row.sender_id === user.id ? row.recipient_id : row.sender_id))];
      let names = new Map();
      if (otherIds.length) {
        const profiles = await supabaseClient.from('player_profiles').select('user_id,username').in('user_id', otherIds);
        if (!profiles.error) names = new Map((profiles.data || []).map(row => [row.user_id, row.username || '未命名玩家']));
      }
      host.replaceChildren();
      if (!rows.length) {
        host.textContent = '目前沒有交易邀請。';
        return;
      }
      for (const row of rows) {
        const incoming = row.recipient_id === user.id;
        const item = doc.createElement('div');
        item.className = 'pet-trade-invitation' + (row.status === 'accepted' ? ' pet-trade-room-active' : '') + (sessionsByInvitation.get(row.id)?.status === 'completed' ? ' pet-trade-completed' : '');
        const summary = doc.createElement('div');
        const title = doc.createElement('strong');
        title.textContent = (incoming ? '收到邀請：' : '已邀請：') + (names.get(incoming ? row.sender_id : row.recipient_id) || '玩家');
        const meta = doc.createElement('small');
        const expiry = new Date(row.expires_at);
        const invitationExpired = row.status === 'pending'
          && !Number.isNaN(expiry.getTime())
          && expiry.getTime() <= Date.now();
        meta.textContent = row.status === 'pending'
          ? (invitationExpired ? '邀請已逾期' : '等待回覆 · ' + (Number.isNaN(expiry.getTime()) ? '有效期限 2 分鐘' : '期限 ' + expiry.toLocaleTimeString()))
          : '狀態：' + ({accepted:'已接受',rejected:'已拒絕',cancelled:'已取消',expired:'已逾期'}[row.status] || row.status);
        summary.append(title, meta);
        item.append(summary);
        const session = sessionsByInvitation.get(row.id);
        if (session) {
          const roomStatus = doc.createElement('small');
          const expiryTime = Date.parse(session.expires_at);
          const sessionExpired = !Number.isFinite(expiryTime) || expiryTime <= Date.now();
          const createdTime = Date.parse(session.created_at);
          const sessionLabels = { active: sessionExpired ? '交易房間已逾期' : '交易房間已建立', cancelled: '交易房間已取消', expired: '交易房間已逾期', completed: '交易已完成' };
          const roomId = String(session.id || '').slice(0, 8).toUpperCase();
          const createdLabel = Number.isFinite(createdTime) ? ' · 建立於 ' + new Date(createdTime).toLocaleTimeString() : '';
          roomStatus.textContent = (sessionLabels[session.status] || '交易房間狀態：' + session.status)
            + (roomId ? ' · 房間 ' + roomId : '')
            + createdLabel
            + (session.status === 'active' && !sessionExpired ? ' · 15 分鐘有效 · 雙方最多各提供 4 隻寵物' : '');
          item.append(roomStatus);
          if (session.status === 'active' && !sessionExpired) item.append(makeTradeRoom(session, user));
          if (session.status === 'active') {
            item.append(makeSessionActionButton(session.id, sessionExpired ? '更新逾期狀態' : '取消交易房間'));
          }
        }
        if (row.status === 'pending' && !invitationExpired && incoming) {
          item.append(makeActionButton('接受', row.id, 'accept', '已接受邀請'));
          item.append(makeActionButton('拒絕', row.id, 'reject', '已拒絕邀請'));
        } else if (row.status === 'pending' && !invitationExpired && !incoming) {
          item.append(makeActionButton('取消邀請', row.id, 'cancel', '已取消邀請'));
        }
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
    const button = doc.getElementById('petTradeSearchBtn');
    const input = doc.getElementById('petTradeTarget');
    const invite = doc.getElementById('petTradeInviteBtn');
    const refresh = doc.getElementById('petTradeRefreshInvites');
    if (button) button.addEventListener('click', search);
    if (invite) invite.addEventListener('click', sendInvitation);
    if (refresh) refresh.addEventListener('click', refreshInvitations);
    if (input) input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        search();
      }
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
        });
      });
    }
    refreshInvitations();
  }

  return { setup, search, refreshInvitations, getSelectedPlayer: () => selectedPlayer };
}
