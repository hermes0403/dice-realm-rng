export function createPetTradingSearch({ supabaseClient, getCurrentUser, escapeHTML, documentRef = document, toast = () => {} }) {
  const doc = documentRef;
  let selectedPlayer = null;
  let searching = false;

  function setStatus(message) {
    const node = doc.getElementById('petTradeSearchHint');
    if (node) node.textContent = message;
  }

  function renderResults(rows) {
    const host = doc.getElementById('petTradeSearchResults');
    if (!host) return;
    host.innerHTML = '';
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
      small.textContent = '玩家識別碼：' + row.user_id;
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
    const results = doc.getElementById('petTradeSearchResults');
    if (panel) {
      panel.hidden = false;
      panel.textContent = '已選擇交易對象：' + (row.username || '未命名玩家') + '（' + row.user_id + '）';
    }
    if (invite) {
      invite.disabled = true;
      invite.textContent = '發送交易邀請（邀請服務尚未啟用）';
    }
    if (results) renderResults([row]);
    setStatus('玩家已選擇；正式邀請與交易房間服務尚未接通。');
  }

  async function search() {
    const input = doc.getElementById('petTradeTarget');
    const query = String(input?.value || '').trim();
    const host = doc.getElementById('petTradeSearchResults');
    if (!supabaseClient || !getCurrentUser()) {
      setStatus('請先登入雲端帳號，再搜尋玩家。');
      return;
    }
    if (query.length < 2) {
      setStatus('請至少輸入 2 個字的玩家名稱，或完整玩家 UUID。');
      return;
    }
    if (searching) return;
    searching = true;
    selectedPlayer = null;
    const panel = doc.getElementById('petTradeSelectedTarget');
    const invite = doc.getElementById('petTradeInviteBtn');
    if (panel) panel.hidden = true;
    if (invite) invite.disabled = true;
    if (host) host.textContent = '正在搜尋玩家…';
    setStatus('正在搜尋雲端玩家資料…');
    try {
      let request = supabaseClient.from('player_profiles')
        .select('user_id,username,last_seen')
        .neq('user_id', getCurrentUser().id)
        .limit(10);
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query);
      request = uuid ? request.eq('user_id', query) : request.ilike('username', '%' + query.replace(/[%,()]/g, '') + '%');
      const { data, error } = await request;
      if (error) throw error;
      const rows = (Array.isArray(data) ? data : []).filter(row => row?.user_id && row.user_id !== getCurrentUser()?.id);
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

  function setup() {
    const button = doc.getElementById('petTradeSearchBtn');
    const input = doc.getElementById('petTradeTarget');
    if (button) button.addEventListener('click', search);
    if (input) input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        search();
      }
    });
  }

  return { setup, search, getSelectedPlayer: () => selectedPlayer };
}
