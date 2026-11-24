import { escapeHTML } from '../core/format.js';

const ROLE_LABELS = { leader: '會長', vice_leader: '副會長', officer: '幹部', member: '一般成員' };

export function createGuildSystem({ supabaseClient, getCurrentUser, documentRef = document, toast = () => {} }) {
  const root = () => documentRef.getElementById('guildContent');
  let busy = false;

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

  function renderGuest() {
    root().innerHTML = `
      <div class="guild-empty card">
        <div class="eyebrow">GUILD NETWORK</div><h2>登入後加入公會</h2>
        <p class="muted">公會資料會綁定目前登入的遊戲帳號。</p>
        <button class="primary" type="button" data-guild-login>登入／註冊</button>
      </div>`;
  }

  function renderNoGuild() {
    root().innerHTML = `
      <div class="guild-columns">
        <section class="card guild-panel">
          <div class="eyebrow">CREATE GUILD</div><h2>建立公會</h2>
          <form id="guildCreateForm" class="guild-form">
            <label>公會名稱<input name="name" minlength="2" maxlength="24" required placeholder="2～24 個字"></label>
            <label>公會介紹<textarea name="description" maxlength="160" rows="3" placeholder="最多 160 字"></textarea></label>
            <button class="primary" type="submit">建立公會</button>
          </form>
          <p class="mini">建立者會自動成為會長；目前每位玩家只能加入一個公會。</p>
        </section>
        <section class="card guild-panel">
          <div class="eyebrow">FIND GUILD</div><h2>尋找公會</h2>
          <div class="guild-search"><input id="guildSearchInput" maxlength="24" placeholder="輸入公會名稱"><button type="button" id="guildSearchBtn">搜尋</button></div>
          <div id="guildSearchResults" class="guild-results"><p class="muted">輸入名稱後搜尋公開公會。</p></div>
        </section>
      </div>`;
  }

  function renderGuild(data) {
    const guild = data.guild;
    const members = Array.isArray(data.members) ? data.members : [];
    const apps = Array.isArray(data.applications) ? data.applications : [];
    const canManage = ['leader','vice_leader','officer'].includes(data.my_role);
    root().innerHTML = `
      <section class="guild-banner card">
        <div class="eyebrow">GUILD · ${escapeHTML(roleLabel(data.my_role))}</div>
        <div class="guild-banner-title"><div><h2>${escapeHTML(guild.name)}</h2><p>${escapeHTML(guild.description || '尚未設定公會介紹')}</p></div><span class="guild-member-count">${Number(guild.member_count) || 0} 人</span></div>
      </section>
      <section class="card guild-panel"><div class="section-head"><h3>公會成員</h3><span class="pill">${members.length} MEMBERS</span></div>
        <div class="guild-member-list">${members.map(m => `<div class="guild-member-row"><span>${escapeHTML(m.username || '未知玩家')}</span><span class="guild-role role-${escapeHTML(m.role)}">${escapeHTML(roleLabel(m.role))}</span></div>`).join('') || '<p class="muted">目前沒有成員資料。</p>'}</div>
      </section>
      ${canManage ? `<section class="card guild-panel"><div class="section-head"><h3>加入申請</h3><span class="pill">${apps.length} PENDING</span></div>
        <div class="guild-app-list">${apps.map(a => `<div class="guild-app-row"><div><b>${escapeHTML(a.username || '未知玩家')}</b><p>${escapeHTML(a.message || '沒有附加訊息')}</p></div><div class="guild-app-actions"><button type="button" data-guild-review="approve" data-app-id="${escapeHTML(a.id)}">核准</button><button class="quiet" type="button" data-guild-review="reject" data-app-id="${escapeHTML(a.id)}">拒絕</button></div></div>`).join('') || '<p class="muted">目前沒有待處理申請。</p>'}</div>
      </section>` : ''}
      <section class="guild-actions"><button type="button" class="danger" id="guildLeaveBtn">退出公會</button><p class="mini">會長需先完成會長轉讓或解散程序，才能退出公會。</p></section>`;
  }

  function renderSearchResults(rows) {
    const el = documentRef.getElementById('guildSearchResults');
    if (!el) return;
    if (!rows.length) { el.innerHTML = '<p class="muted">沒有找到符合的公開公會。</p>'; return; }
    el.innerHTML = rows.map(g => `
      <article class="guild-result-row">
        <div><b>${escapeHTML(g.name)}</b><p>${escapeHTML(g.description || '尚未設定介紹')}</p><small>會長：${escapeHTML(g.leader_name || '未知玩家')} · ${Number(g.member_count) || 0} 人</small></div>
        <button type="button" data-guild-apply="${escapeHTML(g.id)}">申請加入</button>
      </article>`).join('');
  }

  async function load() {
    if (!root()) return;
    if (!getCurrentUser()) { renderGuest(); return; }
    root().innerHTML = '<div class="card"><p class="muted">正在載入公會資料…</p></div>';
    try {
      const data = await rpc('guild_get_my_guild');
      if (data?.guild) renderGuild(data);
      else renderNoGuild();
      message('');
    } catch (error) {
      root().innerHTML = '<div class="card"><p class="muted">公會資料載入失敗，請稍後重試。</p><button type="button" id="guildRetryBtn">重新載入</button></div>';
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
      await load();
    });
  });

  documentRef.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.matches('[data-guild-login]')) { documentRef.getElementById('authOpenBtn')?.click(); return; }
    if (button.id === 'guildRetryBtn') { load(); return; }
    if (button.id === 'guildSearchBtn') {
      run(async () => {
        const query = documentRef.getElementById('guildSearchInput')?.value?.trim() || '';
        const rows = await rpc('guild_search', { p_query: query, p_limit: 20 });
        renderSearchResults(Array.isArray(rows) ? rows : []);
      });
      return;
    }
    if (button.dataset.guildApply) {
      run(async () => {
        await rpc('guild_apply', { p_guild_id: button.dataset.guildApply, p_message: '' });
        toast('加入公會操作已完成');
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
        await load();
      });
    }
  });

  return { load };
}
