export function createPetTradingSearch({ supabaseClient, getCurrentUser, getState = () => ({ pets: [] }), petById = () => null, onTradeCompleted = () => {}, escapeHTML, documentRef = document, toast = () => {} }) {
  const doc = documentRef;
  let selectedPlayer = null;
  let searchResults = [];
  let searching = false;
  let refreshing = false;
  let refreshQueued = false;
  let observedAuthUserId = null;
  const realtimeChannels = new Map();

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
    const ownOffer = ownIsA ? session.offered_pet_uid_a : session.offered_pet_uid_b;
    const otherOffer = ownIsA ? session.offered_pet_uid_b : session.offered_pet_uid_a;
    const ownConfirmed = ownIsA ? session.confirmed_a : session.confirmed_b;
    const otherConfirmed = ownIsA ? session.confirmed_b : session.confirmed_a;
    const pets = Array.isArray(getState()?.pets) ? getState().pets : [];
    const heading = doc.createElement('strong');
    heading.textContent = '交易房間 · 一對一寵物交換';
    const ownLabel = doc.createElement('label');
    ownLabel.textContent = '選擇你要交換的寵物';
    const select = doc.createElement('select');
    select.className = 'field pet-trade-offer-select';
    select.setAttribute('aria-label', '選擇要交換的寵物');
    const placeholder = doc.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '請選擇一隻寵物';
    select.append(placeholder);
    for (const item of pets) {
      const definition = petById(item?.id);
      if (!item?.uid || !definition) continue;
      const option = doc.createElement('option');
      option.value = String(item.uid);
      option.textContent = definition.name + ' · ' + (definition.rarity || '寵物') + ' · ' + (Number(item.kg) || 0) + ' kg';
      select.append(option);
    }
    select.value = ownOffer || '';
    const other = doc.createElement('div');
    other.className = 'pet-trade-offer-summary';
    if (otherOffer) {
      const item = pets.find(pet => String(pet.uid) === String(otherOffer));
      const definition = item ? petById(item.id) : null;
      other.textContent = '對方已提出寵物：' + (definition?.name || '已選擇寵物') + (item ? ' · ' + (Number(item.kg) || 0) + ' kg' : '');
    } else {
      other.textContent = '等待對方選擇寵物';
    }
    const state = doc.createElement('small');
    state.className = 'pet-trade-confirm-state';
    state.textContent = '你的確認：' + (ownConfirmed ? '已確認' : '尚未確認') + ' · 對方確認：' + (otherConfirmed ? '已確認' : '尚未確認');
    const confirm = doc.createElement('button');
    confirm.type = 'button';
    confirm.className = 'primary pet-trade-confirm-button';
    confirm.textContent = ownConfirmed ? '已確認，等待對方' : '確認交換內容';
    confirm.disabled = !ownOffer || !otherOffer || ownConfirmed;
    const hint = doc.createElement('small');
    hint.className = 'pet-trade-room-hint';
    hint.textContent = '任一方更換寵物，雙方確認會自動重置。交易完成前不會轉移寵物。';
    select.addEventListener('change', async () => {
      if (!select.value || select.value === ownOffer) return;
      select.disabled = true;
      confirm.disabled = true;
      try {
        const { error } = await supabaseClient.rpc('set_pet_trade_offer', {
          p_session_id: session.id,
          p_pet_uid: select.value
        });
        if (error) throw error;
        toast('交易寵物已更新，雙方需要重新確認');
        await refreshInvitations();
      } catch (error) {
        console.warn('Pet trade offer update failed', error);
        hint.textContent = error?.message?.includes('pet_inventory_locked_by_trade')
          ? '寵物目前已鎖定，請先取消其他交易房間。'
          : '寵物選擇失敗，請重新整理交易房間。';
        select.disabled = false;
        select.value = ownOffer || '';
      }
    });
    confirm.addEventListener('click', async () => {
      confirm.disabled = true;
      try {
        const { data, error } = await supabaseClient.rpc('confirm_pet_trade', {
          p_session_id: session.id
        });
        if (error) throw error;
        const result = Array.isArray(data) ? data[0] : data;
        if (result?.completed) {
          toast('寵物交換完成！雙方背包已更新。');
          await onTradeCompleted();
        } else {
          toast('已確認交易內容，等待對方確認');
        }
        await refreshInvitations();
      } catch (error) {
        console.warn('Pet trade confirmation failed', error);
        hint.textContent = error?.message?.includes('offered_pet_no_longer_owned')
          ? '選擇的寵物已不在持有清單，請重新選擇。'
          : '確認失敗：' + (error?.message || '請重新整理後再試。');
        confirm.disabled = false;
      }
    });
    room.append(heading, ownLabel, select, other, state, confirm, hint);
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
          .select('id,invitation_id,participant_a,participant_b,status,created_at,expires_at,offered_pet_uid_a,offered_pet_uid_b,confirmed_a,confirmed_b,revision')
          .in('invitation_id', acceptedIds);
        if (sessions.error) throw sessions.error;
        sessionsByInvitation = new Map((sessions.data || []).map(row => [row.invitation_id, row]));
      }
      syncRealtimeChannels(user, [...sessionsByInvitation.values()]);
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
        item.className = 'pet-trade-invitation';
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
            + (session.status === 'active' && !sessionExpired ? ' · 15 分鐘有效 · 寵物交換尚未開放' : '');
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
