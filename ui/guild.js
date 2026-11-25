import { escapeHTML } from '../core/format.js';

const ROLE_LABELS = { leader: '會長', vice_leader: '副會長', officer: '幹部', member: '一般成員' };
const VIEWS = {
  tasks: { label: '今日任務', title: '公會今日任務', description: '公會任務系統尚未開放。正式任務與進度接上伺服器後，會在這裡顯示。' },
  ranking: { label: '公會排行榜', title: '公會排行榜', description: '公會排行榜尚未開放，目前不會顯示虛構排名或分數。' },
  settings: { label: '公會設定', title: '公會設定', description: '公會設定功能尚未開放。現階段公會名稱、介紹與加入方式尚不能在此修改。' }
};

export function createGuildSystem({ supabaseClient, getCurrentUser, documentRef = document, toast = () => {} }) {
  const root = () => documentRef.getElementById('guildContent');
  let busy = false;
  let currentData = null;
  let activeView = 'home';
  let searchResults = [];

  async function rpc(name, params = {}) {
    if (!supabaseClient) throw new Error('雲端服務暫時無法使用');
    const { data, error } = await supabaseClient.rpc(name, params);
    if (error) throw error;
    return data;
  }

  function message(text, kind = 'info') {
    const el = documentRef.getElementById('guildMessage');
    if (!el) return;
    el.textContent = text;
    el.dataset.kind = kind;
  }

  function roleLabel(role) { return ROLE_LABELS[role] || '一般成員'; }

  function navMarkup(showTabs = true) {
    const tabs = [
      ['tasks', '今日任務'],
      ['ranking', '公會排行榜'],
      ['find', '尋找公會'],
      ['settings', '公會設定']
    ];
    return '<nav class="guild-nav" aria-label="公會導覽">' +
      '<button type="button" class="guild-nav-back" data-go="roll">返回主頁</button>' +
      (showTabs ? tabs.map(([key, label]) => '<button type="button" class="guild-nav-tab' + (activeView === key ? ' is-active' : '') +
        '" data-guild-view="' + key + '"' + (activeView === key ? ' aria-current="page"' : '') + '>' + label + '</button>').join('') : '') +
      '</nav>';
  }

  function renderGuest() {
    root().innerHTML = navMarkup(false) +
      '<div class="guild-empty card"><div class="eyebrow">GUILD NETWORK</div><h2>登入後加入公會</h2>' +
      '<p class="muted">公會資料會綁定目前登入的遊戲帳號。</p>' +
      '<button class="primary" type="button" data-guild-login>登入／註冊</button></div>';
  }

  function renderCreatePanel() {
    return '<section class="card guild-panel"><div class="eyebrow">CREATE GUILD</div><h2>建立公會</h2>' +
      '<form id="guildCreateForm" class="guild-form">' +
      '<label>公會名稱<input name="name" minlength="2" maxlength="24" required placeholder="2～24 個字"></label>' +
      '<label>公會介紹<textarea name="description" maxlength="160" rows="3" placeholder="最多 160 字"></textarea></label>' +
      '<button class="primary" type="submit">建立公會</button></form>' +
      '<p class="mini">建立者會自動成為會長；每位玩家同一時間只能加入一個公會。</p></section>';
  }

  function renderFindPanel() {
    return '<section class="card guild-panel"><div class="eyebrow">FIND GUILD</div><h2>尋找公會</h2>' +
      '<div class="guild-search"><input id="guildSearchInput" maxlength="24" placeholder="輸入公會名稱" aria-label="輸入公會名稱">' +
      '<button type="button" id="guildSearchBtn">搜尋</button></div>' +
      '<div id="guildSearchResults" class="guild-results"><p class="muted">輸入名稱後搜尋公開公會。</p></div></section>';
  }

  function renderNoGuild() {
    const view = activeView === 'home' ? 'find' : activeView;
    if (view === 'find') {
      root().innerHTML = navMarkup() + '<div class="guild-empty-state">' + renderCreatePanel() + renderFindPanel() + '</div>';
      return;
    }
    renderFeatureView(view);
  }

  function renderFeatureView(view) {
    const feature = VIEWS[view];
    if (!feature) { activeView = 'home'; render(); return; }
    root().innerHTML = navMarkup() +
      '<section class="card guild-feature-placeholder"><div class="eyebrow">GUILD NETWORK</div>' +
      '<h2>' + feature.title + '</h2><p>' + feature.description + '</p>' +
      '<span class="guild-coming-soon">COMING SOON</span></section>';
  }

  function renderMembers(members) {
    return members.map((member, index) => {
      const name = escapeHTML(member.username || '未知玩家');
      const role = member.role || 'member';
      const initial = escapeHTML((member.username || '?').trim().slice(0, 1) || '?');
      return '<div class="guild-member-row"><span class="guild-member-identity"><span class="guild-member-avatar">' +
        initial + '</span><span class="guild-member-name">' + name + (index === 0 && role === 'leader' ? '<small>公會創建者</small>' : '') +
        '</span></span><span class="guild-role role-' + escapeHTML(role) + '">' + escapeHTML(roleLabel(role)) + '</span></div>';
    }).join('') || '<p class="muted">目前沒有成員資料。</p>';
  }

  function renderHome() {
    const data = currentData;
    const guild = data.guild;
    const members = Array.isArray(data.members) ? data.members : [];
    const apps = Array.isArray(data.applications) ? data.applications : [];
    const canManage = ['leader', 'vice_leader', 'officer'].includes(data.my_role);
    const isLeader = data.my_role === 'leader';
    const count = Number(guild.member_count) || members.length;
    root().innerHTML = navMarkup() +
      '<section class="guild-banner card"><div class="eyebrow">GUILD NETWORK · ' + escapeHTML(roleLabel(data.my_role)) + '</div>' +
      '<div class="guild-banner-title"><div><h2>' + escapeHTML(guild.name) + '</h2><p>' +
      escapeHTML(guild.description || '尚未設定公會介紹') + '</p></div><span class="guild-member-count">' + count + ' 人</span></div></section>' +
      '<section class="card guild-panel guild-roster-panel"><div class="section-head"><div><div class="eyebrow">MEMBER DIRECTORY</div>' +
      '<h3>公會成員 <span class="guild-count-inline">· ' + count + ' 人</span></h3></div><span class="pill">' +
      members.length + ' MEMBERS</span></div><div class="guild-member-list">' + renderMembers(members) + '</div></section>' +
      (canManage ? '<section class="card guild-panel"><div class="section-head"><div><div class="eyebrow">APPLICATIONS</div>' +
        '<h3>加入申請</h3></div><span class="pill">' + apps.length + ' PENDING</span></div>' +
        '<div class="guild-app-list">' + (apps.map(a => '<div class="guild-app-row"><div><b>' +
          escapeHTML(a.username || '未知玩家') + '</b><p>' + escapeHTML(a.message || '沒有附加訊息') +
          '</p></div><div class="guild-app-actions"><button type="button" data-guild-review="approve" data-app-id="' +
          escapeHTML(a.id) + '">核准</button><button class="quiet" type="button" data-guild-review="reject" data-app-id="' +
          escapeHTML(a.id) + '">拒絕</button></div></div>').join('') || '<p class="muted">目前沒有待處理申請。</p>') + '</div></section>' : '') +
      '<section class="guild-actions"><button type="button" class="danger" id="guildLeaveBtn" ' +
      (isLeader ? 'disabled' : '') + '>退出公會</button><p class="mini">' +
      (isLeader ? '會長需先完成會長轉讓或解散程序，才能退出公會。' : '退出後即可申請加入其他公會。') +
      '</p></section>';
  }

  function render() {
    if (!root()) return;
    if (!getCurrentUser()) { renderGuest(); return; }
    if (!currentData?.guild) { renderNoGuild(); return; }
    if (activeView === 'find') {
      root().innerHTML = navMarkup() + '<section class="card guild-find-existing"><div class="eyebrow">FIND GUILD</div>' +
        '<h2>尋找公會</h2><p class="muted">你目前已加入「' + escapeHTML(currentData.guild.name) +
        '」。你可以瀏覽公開公會，但需先退出目前公會才能加入其他公會。</p>' +
        '<div class="guild-search"><input id="guildSearchInput" maxlength="24" placeholder="輸入公會名稱" aria-label="輸入公會名稱">' +
        '<button type="button" id="guildSearchBtn">搜尋</button></div><div id="guildSearchResults" class="guild-results">' +
        '<p class="muted">輸入名稱後搜尋公開公會。</p></div></section>';
      return;
    }
    if (VIEWS[activeView]) { renderFeatureView(activeView); return; }
    activeView = 'home';
    renderHome();
  }

  function renderSearchResults(rows) {
    searchResults = Array.isArray(rows) ? rows : [];
    const el = documentRef.getElementById('guildSearchResults');
    if (!el) return;
    if (!searchResults.length) { el.innerHTML = '<p class="muted">沒有找到符合的公開公會。</p>'; return; }
    const alreadyJoined = Boolean(currentData?.guild);
    el.innerHTML = searchResults.map(g => '<article class="guild-result-row"><div><b>' + escapeHTML(g.name) +
      '</b><p>' + escapeHTML(g.description || '尚未設定介紹') + '</p><small>會長：' +
      escapeHTML(g.leader_name || '未知玩家') + ' · ' + (Number(g.member_count) || 0) + ' 人</small></div>' +
      '<button type="button" data-guild-apply="' + escapeHTML(g.id) + '" ' + (alreadyJoined ? 'disabled' : '') + '>' +
      (alreadyJoined ? '已加入其他公會' : (g.join_mode === 'open' ? '直接加入' : '申請加入')) + '</button></article>').join('');
  }

  async function load() {
    if (!root()) return;
    if (!getCurrentUser()) { currentData = null; renderGuest(); return; }
    root().innerHTML = navMarkup() + '<div class="card"><p class="muted">正在載入公會資料…</p></div>';
    try {
      currentData = await rpc('guild_get_my_guild');
      if (!currentData?.guild) activeView = activeView === 'home' ? 'find' : activeView;
      else if (activeView === 'find') activeView = 'home';
      render();
      message('');
    } catch (error) {
      root().innerHTML = navMarkup() + '<div class="card"><p class="muted">公會資料載入失敗，請稍後重試。</p>' +
        '<button type="button" id="guildRetryBtn">重新載入</button></div>';
      message(error.message || '載入失敗', 'error');
    }
  }

  async function run(action) {
    if (busy) return;
    busy = true;
    try { await action(); }
    catch (error) { message(error.message || '操作失敗，請稍後再試。', 'error'); }
    finally { busy = false; }
  }

  documentRef.addEventListener('submit', event => {
    if (event.target?.id !== 'guildCreateForm') return;
    event.preventDefault();
    const form = new FormData(event.target);
    run(async () => {
      await rpc('guild_create', { p_name: String(form.get('name') || '').trim(), p_description: String(form.get('description') || '').trim() });
      toast('公會建立成功');
      activeView = 'home';
      await load();
    });
  });

  documentRef.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.guildView) {
      activeView = button.dataset.guildView;
      render();
      return;
    }
    if (button.matches('[data-guild-login]')) { documentRef.getElementById('authOpenBtn')?.click(); return; }
    if (button.id === 'guildRetryBtn') { load(); return; }
    if (button.id === 'guildSearchBtn') {
      run(async () => {
        const query = documentRef.getElementById('guildSearchInput')?.value?.trim() || '';
        const rows = await rpc('guild_search', { p_query: query, p_limit: 20 });
        renderSearchResults(rows);
      });
      return;
    }
    if (button.dataset.guildApply) {
      run(async () => {
        const result = await rpc('guild_apply', { p_guild_id: button.dataset.guildApply, p_message: '' });
        toast(result?.joined ? '已加入公會' : '已送出加入申請');
        activeView = 'home';
        await load();
      });
      return;
    }
    if (button.dataset.guildReview) {
      run(async () => {
        await rpc('guild_review_application', { p_application_id: button.dataset.appId, p_approve: button.dataset.guildReview === 'approve' });
        toast(button.dataset.guildReview === 'approve' ? '已核准申請' : '已拒絕申請');
        await load();
      });
      return;
    }
    if (button.id === 'guildLeaveBtn') {
      run(async () => {
        if (!window.confirm('確定要退出目前公會嗎？')) return;
        await rpc('guild_leave');
        toast('已退出公會');
        activeView = 'find';
        await load();
      });
    }
  });

  return { load };
}
