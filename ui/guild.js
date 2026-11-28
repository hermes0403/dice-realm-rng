import { escapeHTML } from '../core/format.js';

const ROLE_LABELS = { leader: '隊長', vice_leader: '副隊長', member: '普通成員' };
const NAME_COLOR_OPTIONS = [
  { value: 'default', label: '預設紫藍' },
  { value: 'nebula', label: '星雲紫' },
  { value: 'ice', label: '冰晶藍' },
  { value: 'ember', label: '熾焰紅' },
  { value: 'emerald', label: '翡翠綠' },
  { value: 'solar', label: '日耀金' }
];
const BADGE_EFFECT_OPTIONS = [
  { value: 'none', label: '無特效' },
  { value: 'pulse', label: '脈衝光暈' },
  { value: 'orbit', label: '星環環繞' },
  { value: 'radiant', label: '星芒輻射' }
];
const BACKGROUND_OPTIONS = [
  { value: 'default', label: '預設星空' },
  { value: 'nebula', label: '深空星雲' },
  { value: 'aurora', label: '極光幻境' },
  { value: 'eclipse', label: '日蝕暗影' },
  { value: 'crimson', label: '赤紅星域' }
];
const NAME_COLOR_IDS = new Set(NAME_COLOR_OPTIONS.map(option => option.value));
const BADGE_EFFECT_IDS = new Set(BADGE_EFFECT_OPTIONS.map(option => option.value));
const BACKGROUND_IDS = new Set(BACKGROUND_OPTIONS.map(option => option.value));
// Current guild-level unlocks expose only the initial rewards; remaining styles stay reserved for future levels.
const LV9_NAME_COLOR_OPTIONS = NAME_COLOR_OPTIONS.filter(option => ['default', 'nebula', 'ice'].includes(option.value));
const LV15_BADGE_EFFECT_OPTIONS = BADGE_EFFECT_OPTIONS.filter(option => ['none', 'orbit'].includes(option.value));
const LV19_BACKGROUND_OPTIONS = BACKGROUND_OPTIONS.filter(option => ['default', 'aurora'].includes(option.value));
const LV9_NAME_COLOR_IDS = new Set(LV9_NAME_COLOR_OPTIONS.map(option => option.value));
const LV15_BADGE_EFFECT_IDS = new Set(LV15_BADGE_EFFECT_OPTIONS.map(option => option.value));
const LV19_BACKGROUND_IDS = new Set(LV19_BACKGROUND_OPTIONS.map(option => option.value));
function safeCosmetic(value, allowed, fallback) {
  return typeof value === 'string' && allowed.has(value) ? value : fallback;
}
const NAV_ITEMS = [
  { key: 'tasks', label: '今日任務', description: '查看公會每日任務', icon: '✓', tone: 'green' },
  { key: 'ranking', label: '公會排行榜', description: '查看公會排名與獎勵', icon: '♜', tone: 'gold' },
  { key: 'mailbox', label: '公會郵箱', description: '查看公會通知與會長贈禮', icon: '✉', tone: 'blue' },
  { key: 'find', label: '尋找公會', description: '搜尋並加入其他公會', icon: '⌕', tone: 'teal' },
  { key: 'settings', label: '公會設定', description: '查看設定與退出公會', icon: '⚙', tone: 'purple' }
];
const VIEWS = {
  tasks: { title: '公會今日任務', description: '加入公會後即可查看每日任務與共享經驗。' },
  ranking: { title: '公會排行榜', description: '依公會等級與總 XP 排名，只顯示公開公會資訊。' },
  settings: { title: '公會設定', description: '查看公會設定及退出選項。' }
};

export function createGuildSystem({ supabaseClient, getCurrentUser, getState = () => ({}), POTIONS = [], flushCloudSave = async () => false, adoptServerPotions = () => false, documentRef = document, toast = () => {} }) {
  const root = () => documentRef.getElementById('guildContent');
  let busy = false;
  let currentData = null;
  let activeView = 'home';
  let activeSettingsSection = 'menu';
  let showAllMembers = false;
  let searchResults = [];
  let leaveConfirmStep = 0;
  let mailboxOpen = false;
  let mailboxRows = [];
  let mailboxLoading = false;
  let mailboxError = '';
  let potionGiftOpen = false;
  let potionGiftRequestId = null;
  let potionGiftRequestUserId = null;
  let findOpen = false;
  let findQuery = '';
  let findLoading = false;
  let findError = '';
  let searchPerformed = false;

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

  function roleLabel(role) { return ROLE_LABELS[role] || '普通成員'; }
  function guildNameStyle(guild) {
    const value = safeCosmetic(guild?.name_color, LV9_NAME_COLOR_IDS, 'default');
    return value === 'default' ? '' : ' class="guild-name-color-unlocked guild-name-color-' + value + '"';
  }

  function guildBadgeMarkup(guild) {
    const effect = safeCosmetic(guild?.badge_effect, LV15_BADGE_EFFECT_IDS, 'none');
    return effect === 'orbit'
      ? '<span class="guild-name-badge guild-name-badge-orbit" aria-label="星環徽章">✦</span>'
      : '';
  }

  function navMarkup() {
    const unreadCount = Math.max(0, Number(currentData?.mail_unread_count) || 0);
    return '<div class="guild-nav-grid" aria-label="公會功能導覽">' +
      NAV_ITEMS.map(item => {
        const active = item.key === 'mailbox' ? mailboxOpen : item.key === 'find' ? findOpen : item.key !== 'home' && activeView === item.key;
        const action = item.go ? ' data-go="' + item.go + '"' : ' data-guild-view="' + item.key + '"';
        const label = item.key === 'mailbox' && unreadCount ? item.label + ' (' + unreadCount + ')' : item.label;
        const description = item.key === 'mailbox' && unreadCount ? '未讀 ' + unreadCount + ' 封升級通知' : item.description;
        return '<button type="button" class="guild-nav-card tone-' + item.tone + (active ? ' is-active' : '') + '"' +
          action + (active ? ' aria-current="page"' : '') + '>' +
          '<span class="guild-nav-icon" aria-hidden="true">' + item.icon + '</span>' +
          '<span class="guild-nav-copy"><b>' + label + '</b><small>' + description + '</small></span>' +
          '<span class="guild-nav-arrow" aria-hidden="true">›</span></button>';
      }).join('') + '</div>';
  }

  function renderGuest() {
    root().innerHTML = navMarkup() +
      '<section class="guild-empty card"><div class="guild-empty-emblem" aria-hidden="true">✦</div>' +
      '<div class="eyebrow">GUILD NETWORK</div><h2>登入後加入公會</h2>' +
      '<p class="muted">公會資料會綁定目前登入的遊戲帳號。</p>' +
      '<button class="primary" type="button" data-guild-login>登入／註冊</button></section>' + renderMailboxOverlay();
  }

  function renderCreatePanel() {
    return '<section class="card guild-panel"><div class="eyebrow">CREATE GUILD</div><h2>建立公會</h2>' +
      '<form id="guildCreateForm" class="guild-form">' +
      '<label>公會名稱<input name="name" minlength="2" maxlength="16" required placeholder="2～16 個字"></label>' +
      '<label>公會介紹<textarea name="description" maxlength="160" rows="3" placeholder="最多 160 字"></textarea></label>' +
      '<button class="primary" type="submit">建立公會</button></form>' +
      '<p class="mini">建立者會自動成為隊長；每位玩家同一時間只能加入一個公會。</p></section>';
  }

  function renderFindPanel() {
    return '<section class="card guild-panel"><div class="eyebrow">FIND GUILD</div><h2>尋找公會</h2>' +
      '<div class="guild-search"><input id="guildSearchInput" maxlength="16" placeholder="輸入公會名稱" aria-label="輸入公會名稱">' +
      '<button type="button" id="guildSearchBtn">搜尋</button></div>' +
      '<div id="guildSearchResults" class="guild-results"><p class="muted">輸入名稱後搜尋公開公會。</p></div></section>';
  }

  function renderNoGuild() {
    if (activeView === 'home') activeView = 'find';
    if (activeView === 'find') {
      root().innerHTML = navMarkup() + '<div class="guild-empty-state">' + renderCreatePanel() + '</div>' + renderMailboxOverlay() + renderFindOverlay();
      return;
    }
    if (activeView === 'ranking') { loadRanking(); return; }
    renderFeatureView(activeView);
  }

  function renderBackButton() {
    return '<div class="guild-subpage-head" style="display:flex;align-items:center;margin:0 0 12px">' +
      '<button type="button" class="guild-nav-card tone-blue guild-back-button" data-guild-back style="min-height:42px;padding:9px 14px;gap:8px;border-radius:12px">' +
      '<span aria-hidden="true">‹</span><span>返回公會主頁</span></button></div>';
  }

  function renderFeatureView(view) {
    const feature = VIEWS[view];
    if (!feature) { activeView = 'home'; render(); return; }
    root().innerHTML = renderBackButton() +
      '<section class="card guild-feature-placeholder"><div class="guild-feature-icon" aria-hidden="true">' +
      (view === 'tasks' ? '✓' : view === 'ranking' ? '♜' : '⚙') + '</div>' +
      '<div class="eyebrow">GUILD NETWORK</div><h2>' + feature.title + '</h2><p>' + feature.description + '</p>' +
      '<span class="guild-coming-soon">' + (view === 'tasks' ? '加入公會後開放' : '尚未開放') + '</span></section>';
  }

  function renderTasks(data) {
    const guild = data?.guild;
    const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
    if (!guild) {
      renderFeatureView('tasks');
      return;
    }
    const level = Math.max(1, Math.min(20, Number(guild.level) || 1));
    const xpTotal = Math.max(0, Number(guild.xp_total) || 0);
    const xpInLevel = Math.max(0, Number(guild.xp_in_level) || 0);
    const xpToNext = Math.max(0, Number(guild.xp_to_next) || 0);
    const xpPercent = level >= 20 ? 100 : (xpToNext > 0 ? Math.min(100, xpInLevel / xpToNext * 100) : 0);
    const taskCards = tasks.map(task => {
      const progress = Math.max(0, Number(task.progress) || 0);
      const waitingForMember = task.key === 'all_login' && task.eligible === false;
      const target = waitingForMember ? 0 : Math.max(1, Number(task.target) || 1);
      const cycles = Math.max(0, Number(task.cycles_completed) || 0);
      const percent = target > 0 ? Math.min(100, progress / target * 100) : 0;
      let progressLabel = waitingForMember ? '' : Math.round(progress) + ' / ' + target;
      if (task.key === 'online') progressLabel = '已領取 ' + cycles + ' 輪 · 本輪 ' + Math.floor(progress / 60) + ' / 30 分鐘';
      if (task.key === 'rolls') progressLabel = '已領取 ' + cycles + ' 輪 · 本輪 ' + Math.floor(progress) + ' / 1,000 次';
      if (task.key === 'all_login' && !waitingForMember) progressLabel = progress + ' / ' + target + ' 人';
      if (task.key === 'login') progressLabel = (task.completed ? '1' : '0') + ' / 1';
      const xpLabel = waitingForMember ? '尚未開放' : (task.key === 'online' || task.key === 'rolls'
        ? '每輪 +' + Math.max(0, Number(task.xp) || 0) + ' XP'
        : '+' + Math.max(0, Number(task.xp) || 0) + ' XP');
      const stateLabel = waitingForMember ? ''
        : (task.completed ? '✓ 本輪已完成' : '進行中');
      return '<article class="guild-task-card' + (task.completed ? ' is-complete' : '') + '">' +
        '<div class="guild-task-top"><div><b>' + escapeHTML(task.title || '每日任務') + '</b>' +
        (progressLabel ? '<small>' + escapeHTML(progressLabel) + '</small>' : '') + '</div><span class="guild-task-xp">' +
        xpLabel + '</span></div>' +
        (target > 0 ? '<div class="guild-task-track" role="progressbar" aria-label="' + escapeHTML(task.title || '每日任務') +
        '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(percent) + '">' +
        '<span style="width:' + percent.toFixed(2) + '%"></span></div>' : '') +
        (stateLabel ? '<small class="guild-task-state">' + stateLabel + '</small>' : '') + '</article>';
    }).join('');
    root().innerHTML = renderBackButton() +
      '<section class="card guild-xp-panel"><div class="eyebrow">GUILD PROGRESSION</div>' +
      '<div class="guild-xp-heading"><div><span class="guild-level-label">公會等級</span><strong>Lv.' + level +
      '</strong></div><span class="guild-xp-total">' + xpTotal.toLocaleString('en-US') + ' XP</span></div>' +
      '<div class="guild-task-track guild-xp-track" role="progressbar" aria-label="公會升級進度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
      Math.round(xpPercent) + '"><span style="width:' + xpPercent.toFixed(2) + '%"></span></div>' +
      '<p class="guild-xp-caption">' + (level >= 20 ? '已達最高等級' :
      xpInLevel.toLocaleString('en-US') + ' / ' + xpToNext.toLocaleString('en-US') + ' XP · 下一級') + '</p></section>' +
      '<section class="guild-task-section"><div class="section-head"><div><div class="eyebrow">DAILY GUILD QUESTS</div>' +
      '<h3>今日任務</h3></div><span class="guild-roster-total">每日 00:00 重置</span></div>' +
      '<div class="guild-task-list">' + (taskCards || '<p class="muted">目前沒有任務資料。</p>') + '</div>' +
      '<p class="guild-task-note">在線每滿 30 分鐘、擲骰每滿 1,000 次都會重複獲得 XP；全員登入獎勵：2 人公會需 2 人登入；3～4 人公會需至少 3 人登入，每日最多發放一次。</p>' +
      '<button type="button" class="guild-task-refresh" data-guild-refresh>重新整理進度</button></section>';
  }

  async function loadTasks() {
    activeView = 'tasks';
    if (!currentData?.guild) {
      renderFeatureView('tasks');
      return;
    }
    root().innerHTML = renderBackButton() +
      '<section class="card guild-feature-placeholder"><p class="muted">正在載入公會每日任務…</p></section>';
    try {
      const data = await rpc('guild_get_daily_tasks');
      if (activeView !== 'tasks') return;
      renderTasks(data);
    } catch (error) {
      if (activeView !== 'tasks') return;
      root().innerHTML = renderBackButton() +
        '<section class="card guild-feature-placeholder"><h2>任務載入失敗</h2>' +
        '<p>無法取得公會每日任務，請稍後重試。</p><button type="button" data-guild-refresh>重新載入</button></section>';
      message(error.message || '任務載入失敗', 'error');
    }
  }


  function renderMailboxOverlay() {
    if (!mailboxOpen) return '';
    const guild = currentData?.guild;
    const announcement = guild?.announcement && typeof guild.announcement === 'object' ? guild.announcement : null;
    const announcementMessage = typeof announcement?.message === 'string' ? announcement.message : '';
    const announcementUpdatedAt = announcement?.updated_at
      ? new Date(announcement.updated_at).toLocaleString('zh-TW', { hour12: false }) : '';
    const announcementPanel = guild ? '<section class="guild-mailbox-announcement"><div class="section-head"><div>' +
      '<div class="eyebrow">GUILD ANNOUNCEMENT</div><h3>公會公告</h3></div><span class="guild-roster-total">ANNOUNCEMENT</span></div>' +
      (announcementMessage ? '<p class="guild-announcement-message">' + escapeHTML(announcementMessage) + '</p>' +
        '<small class="guild-announcement-meta">發布者：' + escapeHTML(announcement.updated_by || '未知玩家') +
        (announcementUpdatedAt ? ' · ' + escapeHTML(announcementUpdatedAt) : '') + '</small>' :
        '<p class="muted guild-announcement-empty">目前沒有公告。</p>') + '</section>' : '';
    const mails = Array.isArray(mailboxRows) ? mailboxRows : [];
    const mailItems = mails.map(mail => {
      const date = mail.created_at ? new Date(mail.created_at).toLocaleString('zh-TW', { hour12: false }) : '時間未知';
      const isGift = mail.mail_type === 'potion_gift';
      const claimed = Boolean(mail.claimed_at);
      const read = Boolean(mail.is_read);
      const topLabel = isGift
        ? 'POTION GIFT · ' + escapeHTML(mail.sender_name || '公會長')
        : 'GUILD MAIL · Lv.' + Math.max(1, Number(mail.guild_level) || 1);
      const rewardLabel = isGift ? '贈禮內容' : '獲得獎勵';
      const rewardText = mail.reward_text || (isGift ? '公會長贈禮' : '公會升級獎勵');
      const action = isGift
        ? (claimed
          ? '<span class="guild-mail-read-label">已領取</span>'
          : '<button type="button" class="guild-mail-gift-claim" data-guild-potion-gift-claim="' + escapeHTML(mail.id || '') + '">領取</button>')
        : (read
          ? '<span class="guild-mail-read-label">已讀</span>'
          : '<button type="button" class="guild-mail-read-button" data-guild-mail-read="' + escapeHTML(mail.id || '') + '">標記已讀</button>');
      return '<article class="guild-mail-card' + (read ? ' is-read' : ' is-unread') + (isGift ? ' is-potion-gift' : '') + '">' +
        '<div class="guild-mail-top"><span>' + topLabel + '</span><small>' + escapeHTML(date) + '</small></div>' +
        '<h3>' + escapeHTML(mail.subject || (isGift ? '你的會長贈予你' : '公會升級通知')) + '</h3>' +
        '<p>' + escapeHTML(mail.body || '') + '</p>' +
        '<div class="guild-mail-reward"><b>' + rewardLabel + '</b><span>' + escapeHTML(rewardText) + '</span></div>' +
        action + '</article>';
    }).join('');
    const content = mailboxLoading
      ? '<p class="muted guild-mailbox-empty">正在載入公會郵件…</p>'
      : mailboxError
        ? '<p class="muted guild-mailbox-empty">無法取得公會郵件，請稍後重試。</p><button type="button" data-guild-mail-refresh>重新載入</button>'
        : '<div class="guild-mailbox-list-head"><span>' + mails.filter(mail => !mail.is_read).length + ' 封未讀郵件</span>' +
          '<button type="button" class="guild-mail-refresh" data-guild-mail-refresh>重新整理</button></div>' +
          '<div class="guild-mail-list">' + (mailItems || '<p class="muted guild-mailbox-empty">目前沒有公會郵件。</p>') + '</div>';
    return '<div class="guild-mailbox-overlay" data-guild-mailbox-overlay>' +
      '<section class="card guild-mailbox-dialog" role="dialog" aria-modal="true" aria-labelledby="guildMailboxTitle">' +
      '<header class="guild-mailbox-header"><div><div class="eyebrow">GUILD MAILBOX</div><h2 id="guildMailboxTitle">公會郵箱</h2>' +
      '<p>公告、公會升級獎勵與會長贈禮都會集中在這裡。</p></div>' +
      '<button type="button" class="guild-mailbox-close" data-guild-mailbox-close aria-label="關閉公會郵箱">✕</button></header>' +
      announcementPanel + '<section class="guild-mailbox-messages"><div class="section-head"><div><div class="eyebrow">REWARD MESSAGES</div>' +
      '<h3>公會郵件</h3></div><span class="guild-roster-total">' +
      (guild ? mails.filter(mail => !mail.is_read).length + ' UNREAD' : 'MAILBOX') + '</span></div>' +
      content + '</section></section></div>';
  }

  function updatePotionGiftPreview(form) {
    if (!form) return;
    const recipientCount = form.querySelectorAll('input[name="recipientIds"]:checked').length;
    const amount = Math.max(0, Math.floor(Number(form.elements.namedItem('amount')?.value) || 0));
    const preview = documentRef.getElementById('guildPotionGiftTotal');
    if (preview) preview.textContent = (recipientCount * amount).toLocaleString('en-US') + ' 瓶 · ' + recipientCount + ' 位成員';
  }

  function ensurePotionGiftRequestId() {
    const userId = String(getCurrentUser()?.id || '');
    if (!userId) return null;
    if (potionGiftRequestUserId !== userId) {
      potionGiftRequestId = null;
      potionGiftRequestUserId = userId;
    }
    const storageKey = 'diceRealmGuildPotionGiftRequest:' + userId;
    let storage = null;
    try { storage = documentRef.defaultView?.localStorage || globalThis.localStorage || null; } catch {}
    if (!potionGiftRequestId) {
      try {
        const saved = storage?.getItem(storageKey);
        if (saved && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved)) {
          potionGiftRequestId = saved;
        }
      } catch {}
    }
    if (!potionGiftRequestId) {
      const cryptoRef = documentRef.defaultView?.crypto || globalThis.crypto;
      if (!cryptoRef?.randomUUID) return null;
      potionGiftRequestId = cryptoRef.randomUUID();
      try { storage?.setItem(storageKey, potionGiftRequestId); } catch {}
    }
    return potionGiftRequestId;
  }

  function clearPotionGiftRequestId(userIdOverride) {
    const userId = String(userIdOverride || potionGiftRequestUserId || getCurrentUser()?.id || '');
    if (userId) {
      try {
        const storage = documentRef.defaultView?.localStorage || globalThis.localStorage || null;
        storage?.removeItem('diceRealmGuildPotionGiftRequest:' + userId);
      } catch {}
    }
    if (!userIdOverride || potionGiftRequestUserId === userId) {
      potionGiftRequestId = null;
      potionGiftRequestUserId = null;
    }
  }

  function renderPotionGiftOverlay() {
    if (!potionGiftOpen || currentData?.my_role !== 'leader') return '';
    const inventory = getState()?.potions?.inventory || {};
    const potionOptions = POTIONS.map(potion => {
      const owned = Math.max(0, Number(inventory[potion.id]) || 0);
      return '<option value="' + escapeHTML(potion.id) + '"' + (owned < 1 ? ' disabled' : '') + '>' +
        escapeHTML(potion.name) + '（持有 ×' + owned.toLocaleString('en-US') + '）</option>';
    }).join('');
    const members = Array.isArray(currentData.members) ? currentData.members : [];
    const recipients = members.filter(member => member.role !== 'leader' && member.user_id);
    const recipientRows = recipients.map(member =>
      '<label class="guild-potion-gift-recipient"><input type="checkbox" name="recipientIds" value="' +
      escapeHTML(member.user_id) + '"><span><b>' + escapeHTML(member.username || '未知玩家') +
      '</b><small>' + escapeHTML(roleLabel(member.role)) + '</small></span></label>'
    ).join('');
    return '<div class="guild-potion-gift-overlay" data-guild-potion-gift-overlay>' +
      '<section class="card guild-potion-gift-dialog" role="dialog" aria-modal="true" aria-labelledby="guildPotionGiftTitle">' +
      '<header class="guild-mailbox-header"><div><div class="eyebrow">GUILD LEADER GIFT</div>' +
      '<h2 id="guildPotionGiftTitle">會長發放</h2><p>選擇自己的藥水、每位成員的數量與收件人。</p></div>' +
      '<button type="button" class="guild-mailbox-close" data-guild-potion-gift-close aria-label="關閉會長發放">✕</button></header>' +
      '<form id="guildPotionGiftForm" class="guild-potion-gift-form">' +
      '<label>藥水種類<select name="potionId" required><option value="" disabled selected>選擇持有中的藥水</option>' +
      potionOptions + '</select></label>' +
      '<label>每位成員數量<input name="amount" type="number" min="1" max="1000000" step="1" value="1" required></label>' +
      '<div class="guild-potion-gift-recipient-head"><b>收件成員</b><button type="button" data-guild-potion-gift-select-all>全選</button></div>' +
      '<div class="guild-potion-gift-recipient-list">' +
      (recipientRows || '<p class="muted">目前沒有可贈送的其他成員。</p>') + '</div>' +
      '<div class="guild-potion-gift-preview"><span>預計總發送量</span><b id="guildPotionGiftTotal">0 瓶 · 0 位成員</b></div>' +
      '<button type="submit" class="guild-potion-gift-submit"' + (recipients.length ? '' : ' disabled') + '>送出贈禮</button>' +
      '</form></section></div>';
  }

  documentRef.addEventListener('input', event => {
    if (event.target?.closest?.('#guildPotionGiftForm')) updatePotionGiftPreview(event.target.closest('#guildPotionGiftForm'));
  });
  documentRef.addEventListener('change', event => {
    if (event.target?.closest?.('#guildPotionGiftForm')) updatePotionGiftPreview(event.target.closest('#guildPotionGiftForm'));
  });

  async function loadMailbox() {
    mailboxOpen = true;
    mailboxLoading = Boolean(getCurrentUser());
    mailboxError = '';
    mailboxRows = [];
    render();
    if (!getCurrentUser()) {
      mailboxLoading = false;
      mailboxError = '請先登入後查看公會郵件。';
      render();
      return;
    }
    try {
      const rows = await rpc('guild_get_mailbox', { p_limit: 50 });
      if (!mailboxOpen) return;
      mailboxRows = Array.isArray(rows) ? rows : [];
      mailboxLoading = false;
      render();
    } catch (error) {
      if (!mailboxOpen) return;
      mailboxLoading = false;
      mailboxError = error.message || '郵件載入失敗';
      render();
      message(mailboxError, 'error');
    }
  }

  function renderRanking(rows) {
    const ranking = Array.isArray(rows) ? rows : [];
    const items = ranking.map(guild => {
      const rank = Math.max(1, Number(guild.rank) || 1);
      const level = Math.max(1, Number(guild.level) || 1);
      const xp = Math.max(0, Number(guild.xp_total) || 0);
      const members = Math.max(0, Number(guild.member_count) || 0);
      return '<article class="guild-ranking-row">' +
        '<span class="guild-ranking-rank">#' + rank + '</span>' +
        '<span class="guild-ranking-main"><b' + guildNameStyle(guild) + '>' + escapeHTML(guild.name || '未命名公會') + guildBadgeMarkup(guild) + '</b>' +
        '<small>Lv.' + level + '</small></span>' +
        '<span class="guild-ranking-stats"><b>' + xp.toLocaleString('en-US') + ' XP</b>' +
        '<small>' + members + ' 位成員</small></span></article>';
    }).join('');
    root().innerHTML = renderBackButton() +
      '<section class="card guild-ranking-panel"><div class="section-head"><div>' +
      '<div class="eyebrow">GUILD LEADERBOARD</div><h3>公會排行榜</h3></div>' +
      '<button type="button" class="guild-ranking-refresh" data-guild-ranking-refresh>重新整理</button></div>' +
      '<p class="guild-ranking-note">依公會等級由高至低、總 XP 由高至低排序；只顯示公開公會資訊。</p>' +
      '<div class="guild-ranking-list">' + (items || '<p class="guild-ranking-empty">目前沒有公開公會。</p>') +
      '</div></section>';
  }

  async function loadRanking() {
    activeView = 'ranking';
    root().innerHTML = renderBackButton() +
      '<section class="card guild-ranking-panel"><p class="muted">正在載入公會排行榜…</p></section>';
    try {
      const rows = await rpc('guild_get_ranking');
      if (activeView !== 'ranking') return;
      renderRanking(rows);
      message('');
    } catch (error) {
      if (activeView !== 'ranking') return;
      root().innerHTML = renderBackButton() +
        '<section class="card guild-ranking-panel"><h3>排行榜載入失敗</h3>' +
        '<p>無法取得公開公會排名，請稍後重試。</p>' +
        '<button type="button" class="guild-ranking-refresh" data-guild-ranking-refresh>重新載入</button></section>';
      message(error.message || '排行榜載入失敗', 'error');
    }
  }


  function renderLeaveConfirmation() {
    if (!leaveConfirmStep) return '';
    const guildName = escapeHTML(currentData?.guild?.name || '目前公會');
    const finalStep = leaveConfirmStep === 2;
    return '<div class="guild-leave-overlay"><section class="card guild-leave-dialog" role="dialog" aria-modal="true" aria-labelledby="guildLeaveDialogTitle">' +
      '<div class="eyebrow">LEAVE GUILD</div>' +
      '<h3 id="guildLeaveDialogTitle">' + (finalStep ? '最後確認' : '確認退出公會') + '</h3>' +
      '<p>' + (finalStep
        ? '請再次確認，你確定要退出「' + guildName + '」嗎？確認後會立即離開公會。'
        : '你即將退出「' + guildName + '」。離開後將不再是公會成員，請確認是否繼續。') + '</p>' +
      '<div class="guild-leave-dialog-actions">' +
      '<button type="button" class="guild-leave-cancel" data-guild-leave-cancel>取消</button>' +
      (finalStep
        ? '<button type="button" class="guild-leave-confirm" data-guild-leave-confirm>確認退出公會</button>'
        : '<button type="button" class="guild-leave-next" data-guild-leave-next>下一步</button>') +
      '</div></section></div>';
  }

  function renderSettings() {
    const guild = currentData?.guild;
    if (!guild) { renderFeatureView('settings'); return; }
    const role = currentData.my_role;
    const isOrdinaryMember = role === 'member';
    const isLeader = role === 'leader';
    const canEdit = isLeader;
    const canEditAnnouncement = ['leader', 'vice_leader'].includes(role);
    const canEditCosmetics = ['leader', 'vice_leader'].includes(role);
    const announcementDisabled = canEditAnnouncement ? '' : ' disabled';
    const announcementMessage = typeof guild.announcement?.message === 'string' ? guild.announcement.message : '';
    const disabled = canEdit ? '' : ' disabled';
    const joinMode = guild.join_mode === 'open' ? 'open' : 'application';
    const leavePanel = '<section class="card guild-settings-panel guild-leave-panel"><div class="eyebrow">GUILD MEMBERSHIP</div>' +
      '<h3>退出公會</h3><p class="guild-leave-description">' +
      (isLeader ? '隊長需先完成隊長轉讓或解散程序，才能退出公會。' : '退出前會再次確認，避免誤觸。') +
      '</p><button type="button" class="guild-leave-button" id="guildLeaveBtn" ' + (isLeader ? 'disabled' : '') + '>退出公會</button></section>';
    if (activeSettingsSection === 'menu') {
      const menu = '<section class="card guild-settings-menu"><div class="eyebrow">GUILD CONTROL</div><h2>公會設定</h2><div class="guild-settings-menu-grid">' +
        (isOrdinaryMember ? '' : '<button type="button" class="guild-settings-menu-button" data-guild-settings-section="basic"><b>公會基本設定</b><small>公會名稱、介紹、加入方式與公告</small><span>›</span></button>') +
        (isLeader ? '<button type="button" class="guild-settings-menu-button" data-guild-settings-section="promotion"><b>公會晉升成員</b><small>任命或撤除副隊長職位</small><span>›</span></button>' : '') +
        (isLeader ? '<button type="button" class="guild-settings-menu-button" data-guild-potion-gift-open><b>會長發放</b><small>把自己持有的藥水贈送給公會成員，對方可在公會郵箱領取</small><span>›</span></button>' : '') +
        '<button type="button" class="guild-settings-menu-button" data-guild-settings-section="cosmetics"><b>公會專屬外觀</b><small>名稱顏色、徽章特效與專屬背景</small><span>›</span></button>' +
        '</div></section>';
      root().innerHTML = renderBackButton() + menu + leavePanel + renderLeaveConfirmation() + renderPotionGiftOverlay(); return;
    }
    const back = '<button type="button" class="guild-settings-back" data-guild-settings-back>‹ 返回公會設定</button>';
    if (activeSettingsSection === 'basic') {
      const basicPanel = '<section class="card guild-settings-panel"><div class="eyebrow">GUILD BASIC SETTINGS</div><h2>公會基本設定</h2>' +
        '<form id="guildSettingsForm" class="guild-settings-form">' +
        '<label>公會名稱<input name="name" type="text" minlength="2" maxlength="16" required value="' + escapeHTML(guild.name || '') + '"' + disabled + '><small>2～16 個字</small></label>' +
        '<label>公會介紹<textarea name="description" maxlength="160" rows="4"' + disabled + '>' + escapeHTML(guild.description || '') + '</textarea><small>最多 160 字</small></label>' +
        '<label>加入方式<select name="join_mode"' + disabled + '><option value="application"' + (joinMode === 'application' ? ' selected' : '') + '>需審核申請</option><option value="open"' + (joinMode === 'open' ? ' selected' : '') + '>公開直接加入</option></select><small>選擇玩家加入公會時，是否需要隊長或副隊長審核</small></label>' +
        (canEdit ? '<button class="primary" type="submit">儲存基本設定</button>' : '<p class="guild-settings-readonly">只有隊長可以修改公會名稱、介紹與加入方式。</p>') +
        '</form></section>';
      const announcementPanel = '<section class="card guild-settings-panel guild-announcement-settings"><div class="eyebrow">GUILD ANNOUNCEMENT</div><h3>公會公告</h3>' +
        '<form id="guildAnnouncementForm" class="guild-settings-form"><label>公告內容<textarea name="message" maxlength="200" rows="4"' + announcementDisabled + '>' + escapeHTML(announcementMessage) +
        '</textarea><small>最多 200 字；留空可清除公告</small></label>' +
        (canEditAnnouncement ? '<button class="primary" type="submit">發布公告</button>' : '<p class="guild-settings-readonly">只有隊長與副隊長可發布、修改或清除公告。</p>') +
        '</form></section>';
      root().innerHTML = back + basicPanel + announcementPanel + renderLeaveConfirmation(); return;
    }
    if (activeSettingsSection === 'cosmetics') {
      const unlocks = Array.isArray(guild.reward_unlocks) ? guild.reward_unlocks : [];
      const hasUnlock = key => unlocks.some(item => item.reward_key === key);
      const cosmeticControl = (field,label,options,allowed,fallback,rewardKey,requiredLevel) => {
        const unlocked=hasUnlock(rewardKey), value=safeCosmetic(guild[field],allowed,fallback);
        const optionRows=(unlocked?options:options.slice(0,1)).map(option=>'<option value="'+option.value+'"'+(value===option.value?' selected':'')+'>'+escapeHTML(option.label)+'</option>').join('');
        const selectDisabled=!canEditCosmetics||!unlocked?' disabled':'';
        const note=unlocked?(canEditCosmetics?'已解鎖，隊長與副隊長可以更換。':'已解鎖；目前設定僅供檢視。'):'尚未解鎖，公會達到 Lv.'+requiredLevel+' 後即可使用。';
        return '<label class="guild-cosmetic-control">'+escapeHTML(label)+'<select name="'+field+'"'+selectDisabled+'>'+optionRows+'</select><small>'+note+'</small></label>';
      };
      const panel='<section class="card guild-settings-panel guild-cosmetics-panel"><div class="eyebrow">GUILD APPEARANCE</div><h2>公會專屬外觀</h2><p class="guild-cosmetics-note">外觀由公會升級解鎖，所有成員都會看到相同設定。</p>' +
        '<form id="guildCosmeticsForm" class="guild-settings-form">'+
        cosmeticControl('name_color','公會名稱顏色',LV9_NAME_COLOR_OPTIONS,LV9_NAME_COLOR_IDS,'default','name_color',9)+
        cosmeticControl('badge_effect','公會徽章特效',LV15_BADGE_EFFECT_OPTIONS,LV15_BADGE_EFFECT_IDS,'none','badge_effect',15)+
        cosmeticControl('background_theme','公會專屬背景',LV19_BACKGROUND_OPTIONS,LV19_BACKGROUND_IDS,'default','guild_background',19)+
        (canEditCosmetics?'<button class="primary" type="submit">儲存外觀</button>':'<p class="guild-settings-readonly">只有隊長與副隊長可以更換外觀；目前為檢視模式。</p>')+
        '</form></section>';
      root().innerHTML=back+panel+renderLeaveConfirmation(); return;
    }
    if (activeSettingsSection === 'promotion' && isLeader) {
      const members=Array.isArray(currentData.members)?currentData.members:[];
      const viceCount=members.filter(member=>member.role==='vice_leader').length;
      const rows=members.filter(member=>member.role!=='leader').map(member=>{
        const isVice=member.role==='vice_leader', cannotPromote=!isVice&&viceCount>=2;
        const action=isVice
          ? '<button type="button" class="guild-promotion-demote" data-guild-member-role="member" data-guild-member-id="'+escapeHTML(member.user_id||'')+'" data-guild-member-name="'+escapeHTML(member.username||'未知玩家')+'">撤除副隊長</button>'
          : '<button type="button" class="guild-promotion-promote" data-guild-member-role="vice_leader" data-guild-member-id="'+escapeHTML(member.user_id||'')+'" data-guild-member-name="'+escapeHTML(member.username||'未知玩家')+'"'+(cannotPromote?' disabled':'')+'>晉升副隊長</button>';
        return '<div class="guild-promotion-row"><div><b>'+escapeHTML(member.username||'未知玩家')+'</b><small>'+(isVice?'目前職位：副隊長':'目前職位：普通成員')+'</small></div>'+action+'</div>';
      }).join('');
      const panel='<section class="card guild-settings-panel guild-promotion-panel"><div class="eyebrow">GUILD MEMBER PROMOTION</div><h2>公會晉升成員</h2><p class="guild-cosmetics-note">隊長可任命或撤除副隊長。每個公會最多 2 位副隊長。</p>' +
        '<div class="guild-promotion-list">'+(rows||'<p class="muted">目前沒有可調整職位的成員。</p>')+'</div><small class="guild-promotion-count">副隊長名額：'+viceCount+' / 2</small></section>';
      root().innerHTML=back+panel+renderLeaveConfirmation(); return;
    }
    activeSettingsSection='menu'; renderSettings();
  }

  function renderMembers(members) {
    const visible = showAllMembers ? members : members.slice(0, 3);
    const rows = visible.map((member, index) => {
      const username = String(member.username || '未知玩家').trim();
      const name = escapeHTML(username);
      const role = member.role || 'member';
      const initial = escapeHTML(username.slice(0, 1) || '?');
      const level = Number(member.level);
      const levelLabel = Number.isFinite(level) && level > 0 ? '<span class="guild-member-level">Lv.' + level + '</span>' : '';
      const crown = role === 'leader' ? '<span class="guild-member-crown" aria-label="隊長">♛</span>' : '';
      const actorRole = currentData?.my_role;
      const canRemoveTarget = Boolean(member.user_id) && (
        (actorRole === 'leader' && ['vice_leader', 'member'].includes(role)) ||
        (actorRole === 'vice_leader' && role === 'member')
      );
      const removeAction = canRemoveTarget
        ? '<button type="button" class="guild-member-remove" data-guild-remove-member="' + escapeHTML(member.user_id) +
          '" data-guild-remove-name="' + name + '">移除</button>'
        : '';
      return '<div class="guild-member-row"><span class="guild-member-identity"><span class="guild-member-avatar avatar-tone-' +
        (index % 4) + '">' + initial + crown + '</span><span class="guild-member-name"><b>' + name + '</b></span></span>' +
        '<span class="guild-role role-' + escapeHTML(role) + '">' + escapeHTML(roleLabel(role)) + '</span>' +
        levelLabel + (removeAction ? '<span class="guild-member-actions">' + removeAction + '</span>' : '') + '</div>';
    }).join('');
    const toggle = members.length > 3
      ? '<button type="button" class="guild-members-toggle" data-guild-members-toggle aria-expanded="' + showAllMembers + '">' +
        (showAllMembers ? '收起成員' : '⌄ 查看更多成員') + '</button>'
      : '';
    return (rows || '<p class="muted">目前沒有成員資料。</p>') + toggle;
  }

  function renderHome() {
    const data = currentData;
    const guild = data.guild;
    const members = Array.isArray(data.members) ? data.members : [];
    const apps = Array.isArray(data.applications) ? data.applications : [];
    const canManage = ['leader', 'vice_leader'].includes(data.my_role);
    const count = Number(guild.member_count) || members.length;
    const unlocks = Array.isArray(guild.reward_unlocks) ? guild.reward_unlocks : [];
    const hasUnlock = key => unlocks.some(item => item.reward_key === key);
    const nameColor = hasUnlock('name_color') ? safeCosmetic(guild.name_color, LV9_NAME_COLOR_IDS, 'default') : 'default';
    const badgeEffect = hasUnlock('badge_effect') ? safeCosmetic(guild.badge_effect, LV15_BADGE_EFFECT_IDS, 'none') : 'none';
    const backgroundTheme = hasUnlock('guild_background') ? safeCosmetic(guild.background_theme, LV19_BACKGROUND_IDS, 'default') : 'default';
    const bannerClass = 'guild-banner card' + (hasUnlock('guild_background') ? ' has-reward-background' : '') +
      (backgroundTheme !== 'default' ? ' guild-bg-' + backgroundTheme : '');
    const emblemClass = 'guild-banner-emblem' + (hasUnlock('badge_frame') ? ' has-reward-frame' : '') +
      (badgeEffect !== 'none' ? ' has-reward-effect guild-badge-effect-' + badgeEffect : '');
    const nameClass = nameColor !== 'default' ? ' class="guild-name-color-unlocked guild-name-color-' + nameColor + '"' : '';
    const guildTitle = hasUnlock('guild_title') ? '<span class="guild-exclusive-title">星域公會</span>' : '';
    const rewardUnlockMarkup = unlocks.length ? '<section class="card guild-panel guild-reward-unlocks"><div class="eyebrow">GUILD REWARDS</div><h3>已解鎖公會獎勵</h3><div class="guild-reward-chip-list">' +
      unlocks.map(item => '<span class="guild-reward-chip">Lv.' + Math.max(1, Number(item.level) || 1) + ' · ' + escapeHTML(item.reward_text || '') + '</span>').join('') +
      '</div></section>' : '';
    root().innerHTML = navMarkup() +
      '<section class="' + bannerClass + '"><div class="' + emblemClass + '" aria-hidden="true"><span>✦</span></div>' +
      '<div class="guild-banner-main"><div class="guild-banner-topline"><span class="eyebrow">GUILD PROFILE</span>' +
      '<span class="guild-joined"><i></i> 已加入</span><span class="guild-level-pill">Lv.' + Math.max(1, Number(guild.level) || 1) + '</span></div><h2' + nameClass + '>' + escapeHTML(guild.name) + '</h2>' + guildTitle +
      '<p class="guild-banner-description">' + escapeHTML(guild.description || '一起探索、一起成長，征服無限的骰界！') + '</p>' +
      '<div class="guild-banner-meta"><span>♟ ' + count + ' 位成員</span>' +
      '<span>◆ ' + escapeHTML(roleLabel(data.my_role)) + '</span></div></div></section>' +
      rewardUnlockMarkup + '<section class="card guild-panel guild-roster-panel"><div class="section-head"><div><div class="eyebrow">MEMBER DIRECTORY</div>' +
      '<h3>公會成員 <span class="guild-count-inline">· ' + count + ' 人</span></h3></div>' +
      '<span class="guild-roster-total">' + members.length + ' MEMBERS</span></div>' +
      '<div class="guild-member-list">' + renderMembers(members) + '</div></section>' +
      (canManage ? '<section class="card guild-panel guild-applications"><div class="section-head"><div><div class="eyebrow">APPLICATIONS</div>' +
        '<h3>加入申請</h3></div><span class="guild-roster-total">' + apps.length + ' PENDING</span></div>' +
        '<div class="guild-app-list">' + (apps.map(a => '<div class="guild-app-row"><div><b>' +
          escapeHTML(a.username || '未知玩家') + '</b><p>' + escapeHTML(a.message || '沒有附加訊息') +
          '</p></div><div class="guild-app-actions"><button type="button" data-guild-review="approve" data-app-id="' +
          escapeHTML(a.id) + '">核准</button><button class="quiet" type="button" data-guild-review="reject" data-app-id="' +
          escapeHTML(a.id) + '">拒絕</button></div></div>').join('') || '<p class="muted">目前沒有待處理申請。</p>') + '</div></section>' : '') + renderMailboxOverlay() + renderFindOverlay() + renderPotionGiftOverlay();
  }

  function render() {
    if (!root()) return;
    if (!getCurrentUser()) { renderGuest(); return; }
    if (!currentData?.guild) { renderNoGuild(); return; }
    if (activeView === 'find') activeView = 'home';
    if (activeView === 'tasks') { loadTasks(); return; }
    if (activeView === 'ranking') { loadRanking(); return; }
    if (activeView === 'settings') { renderSettings(); return; }
    if (VIEWS[activeView]) { renderFeatureView(activeView); return; }
    activeView = 'home';
    renderHome();
  }

  function renderFindResultsMarkup() {
    if (findLoading) return '<p class="muted guild-mailbox-empty">正在搜尋公開公會…</p>';
    if (findError) return '<p class="guild-find-error" role="alert">' + escapeHTML(findError) + '</p>';
    if (!searchPerformed) return '<p class="muted guild-mailbox-empty">輸入公會名稱後搜尋；留空可瀏覽公開公會。</p>';
    if (!searchResults.length) return '<p class="muted guild-mailbox-empty">沒有找到符合的公開公會。</p>';
    const alreadyJoined = Boolean(currentData?.guild);
    return searchResults.map(g => '<article class="guild-result-row"><div><b' + guildNameStyle(g) + '>' + escapeHTML(g.name) + guildBadgeMarkup(g) +
      '</b><p>' + escapeHTML(g.description || '尚未設定介紹') + '</p><small>隊長：' +
      escapeHTML(g.leader_name || '未知玩家') + ' · ' + (Number(g.member_count) || 0) + ' 人</small></div>' +
      '<button type="button" data-guild-apply="' + escapeHTML(g.id) + '"' +
      (alreadyJoined ? ' aria-label="目前已有公會，無法加入"' : '') + '>' +
      (alreadyJoined ? '目前已有公會' : (g.join_mode === 'open' ? '直接加入' : '申請加入')) + '</button></article>').join('');
  }

  function renderFindOverlay() {
    if (!findOpen) return '';
    return '<div class="guild-find-overlay" data-guild-find-overlay>' +
      '<section class="card guild-find-dialog" role="dialog" aria-modal="true" aria-labelledby="guildFindTitle">' +
      '<header class="guild-mailbox-header"><div><div class="eyebrow">FIND GUILD NETWORK</div><h2 id="guildFindTitle">尋找公會</h2>' +
      '<p>' + (currentData?.guild
        ? '你目前已加入「' + escapeHTML(currentData.guild.name) + '」，仍可瀏覽其他公開公會。'
        : '搜尋並瀏覽目前開放的公開公會。') + '</p></div>' +
      '<button type="button" class="guild-mailbox-close" data-guild-find-close aria-label="關閉尋找公會">✕</button></header>' +
      '<div class="guild-search"><input id="guildSearchInput" maxlength="16" value="' + escapeHTML(findQuery) +
      '" placeholder="輸入公會名稱（留空瀏覽全部）" aria-label="輸入公會名稱">' +
      '<button type="button" id="guildSearchBtn"' + (findLoading ? ' disabled' : '') + '>搜尋</button></div>' +
      '<div id="guildSearchResults" class="guild-results" aria-live="polite">' + renderFindResultsMarkup() + '</div>' +
      '</section></div>';
  }

  function renderSearchResults(rows) {
    searchResults = Array.isArray(rows) ? rows : [];
    searchPerformed = true;
    findLoading = false;
    findError = '';
    const el = documentRef.getElementById('guildSearchResults');
    if (el) el.innerHTML = renderFindResultsMarkup();
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
    if (event.target?.id === 'guildPotionGiftForm') {
      event.preventDefault();
      if (currentData?.my_role !== 'leader') { message('只有公會隊長可以發放藥水。', 'error'); return; }
      const formElement = event.target;
      const form = new FormData(formElement);
      const potionId = String(form.get('potionId') || '');
      const amount = Number(form.get('amount'));
      const recipientIds = Array.from(formElement.querySelectorAll('input[name="recipientIds"]:checked'))
        .map(input => String(input.value || '')).filter(Boolean);
      if (!POTIONS.some(potion => potion.id === potionId)) { message('請選擇有效的藥水。', 'error'); return; }
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000) {
        message('每位成員的數量必須是 1～1,000,000 的整數。', 'error'); return;
      }
      if (!recipientIds.length || recipientIds.length > 30) {
        message('請選擇至少一位、最多 30 位收件成員。', 'error'); return;
      }
      if (!ensurePotionGiftRequestId()) { message('目前瀏覽器無法建立安全的贈送識別碼，請更新瀏覽器後再試。', 'error'); return; }
      const requestUserId = String(getCurrentUser()?.id || '');
      const submitButton = formElement.querySelector('button[type="submit"]');
      if (submitButton) { submitButton.disabled = true; submitButton.textContent = '送出中…'; }
      void run(async () => {
        const flushed = await flushCloudSave();
        if (flushed !== true) throw new Error('雲端存檔尚未完成同步，請稍後再試。');
        if (String(getCurrentUser()?.id || '') !== requestUserId) throw new Error('登入帳號已切換，請重新開啟公會頁面後再送出。');
        const result = await rpc('guild_send_potion_gift', {
          p_request_id: potionGiftRequestId, p_potion_id: potionId,
          p_amount: amount, p_recipient_ids: recipientIds
        });
        if (!result?.ok || !result.inventory || !result.updated_at) throw new Error('贈送結果尚未確認，請重新整理郵箱與存檔。');
        const adopted = adoptServerPotions(result.inventory, result.updated_at);
        potionGiftOpen = false;
        clearPotionGiftRequestId(requestUserId);
        render();
        if (!adopted) message('贈禮已送出，雲端庫存已更新；請重新載入遊戲以同步本機顯示。', 'info');
        else {
          toast('已贈送給 ' + result.gift_count + ' 位成員，共扣除 ' + result.total_amount + ' 瓶藥水');
          message('會長贈禮已送出。', 'success');
        }
      }).finally(() => { if (submitButton?.isConnected) submitButton.disabled = false; });
      return;
    }
    if (event.target?.id === 'guildAnnouncementForm') {
      event.preventDefault();
      if (!['leader', 'vice_leader'].includes(currentData?.my_role)) {
        message('只有隊長與副隊長可以修改公會公告。', 'error');
        return;
      }
      const form = new FormData(event.target);
      const announcementMessage = String(form.get('message') || '').trim();
      if (Array.from(announcementMessage).length > 200) {
        message('公會公告最多 200 字。', 'error');
        return;
      }
      run(async () => {
        await rpc('guild_update_announcement', { p_message: announcementMessage });
        await load();
        toast('公會公告已更新');
        message('公會公告已更新。', 'success');
      });
      return;
    }
    if (event.target?.id === 'guildCosmeticsForm') {
      event.preventDefault();
      if (!['leader', 'vice_leader'].includes(currentData?.my_role)) {
        message('只有隊長與副隊長可以更換公會外觀。', 'error');
        return;
      }
      const form = new FormData(event.target);
      run(async () => {
        await rpc('guild_update_cosmetics', {
          p_name_color: String(form.get('name_color') || 'default'),
          p_badge_effect: String(form.get('badge_effect') || 'none'),
          p_background_theme: String(form.get('background_theme') || 'default')
        });
        await load();
        toast('公會外觀已更新');
        message('公會外觀已更新。', 'success');
      });
      return;
    }
    if (event.target?.id === 'guildSettingsForm') {
      event.preventDefault();
      if (currentData?.my_role !== 'leader') {
        message('只有隊長可以修改公會設定。', 'error');
        return;
      }
      const form = new FormData(event.target);
      const guildName = String(form.get('name') || '').trim();
      const guildNameLength = Array.from(guildName).length;
      if (guildNameLength < 2 || guildNameLength > 16) {
        message('公會名稱必須為 2～16 字。', 'error');
        return;
      }
      run(async () => {
        await rpc('guild_update_settings', {
          p_name: guildName,
          p_description: String(form.get('description') || ''),
          p_join_mode: String(form.get('join_mode') || 'application')
        });
        await load();
        toast('公會設定已儲存');
        message('公會設定已儲存。', 'success');
      });
      return;
    }
    if (event.target?.id !== 'guildCreateForm') return;
    event.preventDefault();
    const form = new FormData(event.target);
    const guildName = String(form.get('name') || '').trim();
    const guildNameLength = Array.from(guildName).length;
    if (guildNameLength < 2 || guildNameLength > 16) {
      message('公會名稱必須為 2～16 字。', 'error');
      return;
    }
    run(async () => {
      await rpc('guild_create', { p_name: guildName, p_description: String(form.get('description') || '').trim() });
      toast('公會建立成功');
      activeView = 'home';
      await load();
    });
  });

  documentRef.addEventListener('click', async event => {
    const findOverlay = event.target.closest('[data-guild-find-overlay]');
    if (findOverlay && event.target === findOverlay) {
      findOpen = false;
      render();
      return;
    }
    const potionGiftOverlay = event.target.closest('[data-guild-potion-gift-overlay]');
    if (potionGiftOverlay && event.target === potionGiftOverlay) {
      potionGiftOpen = false;
      render();
      return;
    }
    const mailboxOverlay = event.target.closest('[data-guild-mailbox-overlay]');
    if (mailboxOverlay && event.target === mailboxOverlay) {
      mailboxOpen = false;
      render();
      return;
    }
    const button = event.target.closest('button');
    if (!button) return;
    if (button.matches('[data-guild-potion-gift-open]')) {
      if (currentData?.my_role !== 'leader') { message('只有公會隊長可以發放藥水。', 'error'); return; }
      if (!ensurePotionGiftRequestId()) { message('目前瀏覽器無法建立安全的贈送識別碼。', 'error'); return; }
      potionGiftOpen = true;
      render();
      updatePotionGiftPreview(documentRef.getElementById('guildPotionGiftForm'));
      return;
    }
    if (button.matches('[data-guild-potion-gift-close]')) {
      potionGiftOpen = false;
      render();
      return;
    }
    if (button.matches('[data-guild-potion-gift-select-all]')) {
      const form = documentRef.getElementById('guildPotionGiftForm');
      const inputs = Array.from(form?.querySelectorAll('input[name="recipientIds"]') || []);
      const selectAll = !inputs.every(input => input.checked);
      for (const input of inputs) input.checked = selectAll;
      button.textContent = selectAll ? '取消全選' : '全選';
      updatePotionGiftPreview(form);
      return;
    }
    if (button.matches('[data-guild-potion-gift-claim]')) {
      const giftId = button.dataset.guildPotionGiftClaim;
      if (!giftId || button.disabled) return;
      const claimUserId = String(getCurrentUser()?.id || '');
      button.disabled = true;
      void run(async () => {
        const flushed = await flushCloudSave();
        if (flushed !== true) throw new Error('雲端存檔尚未完成同步，請稍後再試。');
        if (String(getCurrentUser()?.id || '') !== claimUserId) throw new Error('登入帳號已切換，請重新開啟公會郵箱後再領取。');
        const result = await rpc('guild_claim_potion_gift', { p_gift_id: giftId });
        if (!result?.ok || !result.inventory || !result.updated_at) throw new Error('領取結果尚未確認，請重新整理郵箱與存檔。');
        const adopted = adoptServerPotions(result.inventory, result.updated_at);
        await load();
        await loadMailbox();
        if (adopted) toast('已領取 ' + result.potion_name + ' × ' + result.potion_amount);
        else message('贈禮已領取，請重新載入遊戲以同步本機庫存。', 'info');
      }).finally(() => { if (button.isConnected) button.disabled = false; });
      return;
    }
    if (button.matches('[data-guild-find-close]')) {
      findOpen = false;
      render();
      return;
    }
    if (button.matches('[data-guild-mailbox-close]')) {
      mailboxOpen = false;
      render();
      return;
    }
    if (button.matches('[data-guild-back]')) {
      leaveConfirmStep = 0;
      activeView = currentData?.guild ? 'home' : 'find';
      render();
      return;
    }
    if (button.dataset.guildView) {
      leaveConfirmStep = 0;
      if (button.dataset.guildView === 'mailbox') {
        activeView = currentData?.guild ? 'home' : 'find';
        loadMailbox();
        return;
      }
      if (button.dataset.guildView === 'find') {
        if (!getCurrentUser()) { documentRef.getElementById('authOpenBtn')?.click(); return; }
        findOpen = true;
        activeView = currentData?.guild ? 'home' : 'find';
        render();
        return;
      }
      activeView = button.dataset.guildView;
      if (activeView === 'settings') activeSettingsSection = 'menu';
      if (activeView === 'tasks') loadTasks();
      else render();
      return;
    }
    if (button.dataset.guildSettingsSection) { activeSettingsSection=button.dataset.guildSettingsSection; renderSettings(); return; }
    if (button.matches('[data-guild-settings-back]')) { activeSettingsSection='menu'; renderSettings(); return; }
    if (button.matches('[data-guild-member-role]')) {
      if (currentData?.my_role!=='leader') { message('只有隊長可以晉升或撤除副隊長。','error'); return; }
      const targetId=button.dataset.guildMemberId, targetName=button.dataset.guildMemberName||'這位成員', nextRole=button.dataset.guildMemberRole;
      const actionText=nextRole==='vice_leader'?'晉升為副隊長':'撤除副隊長職位並降為普通成員';
      if (!targetId || !window.confirm('確定要將「'+targetName+'」'+actionText+'嗎？')) return;
      run(async()=>{ await rpc('guild_update_member_role',{p_user_id:targetId,p_role:nextRole}); await load(); activeSettingsSection='promotion'; renderSettings(); toast(nextRole==='vice_leader'?'已晉升為副隊長':'已撤除副隊長職位'); message('「'+targetName+'」的公會職位已更新。','success'); });
      return;
    }
    if (button.matches('[data-guild-ranking-refresh]')) { loadRanking(); return; }
    if (button.matches('[data-guild-mail-refresh]')) { loadMailbox(); return; }
    if (button.matches('[data-guild-mail-read]')) {
      const mailId = button.dataset.guildMailRead;
      if (!mailId) return;
      run(async () => {
        const result = await rpc('guild_mark_mail_read', { p_mail_id: mailId });
        if (result?.updated && currentData) currentData.mail_unread_count = Math.max(0, (Number(currentData.mail_unread_count) || 0) - 1);
        await loadMailbox();
      });
      return;
    }
    if (button.matches('[data-guild-refresh]')) { loadTasks(); return; }
    if (button.matches('[data-guild-remove-member]')) {
      const targetId = button.dataset.guildRemoveMember;
      const targetName = button.dataset.guildRemoveName || '這位成員';
      if (!window.confirm('確定要將「' + targetName + '」移出公會嗎？')) return;
      run(async () => {
        await rpc('guild_remove_member', { p_user_id: targetId });
        await load();
        toast('已移除成員');
        message('已移除「' + targetName + '」。', 'success');
      });
      return;
    }
    if (button.matches('[data-guild-members-toggle]')) {
      showAllMembers = !showAllMembers;
      render();
      return;
    }
    if (button.matches('[data-guild-login]')) { documentRef.getElementById('authOpenBtn')?.click(); return; }
    if (button.id === 'guildRetryBtn') { load(); return; }
    if (button.id === 'guildSearchBtn') {
      if (findLoading) return;
      findQuery = documentRef.getElementById('guildSearchInput')?.value?.trim() || '';
      findLoading = true;
      findError = '';
      searchPerformed = true;
      render();
      try {
        const rows = await rpc('guild_search', { p_query: findQuery, p_limit: 20 });
        renderSearchResults(rows);
      } catch (error) {
        findLoading = false;
        findError = error.message || '搜尋失敗，請稍後重試。';
        render();
      }
      return;
    }
    if (button.dataset.guildApply) {
      if (currentData?.guild) {
        const notice = '你目前已加入「' + currentData.guild.name + '」，請先退出目前公會後再加入。';
        toast(notice);
        message(notice, 'error');
        return;
      }
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
      if (busy || currentData?.my_role === 'leader') return;
      leaveConfirmStep = 1;
      render();
      return;
    }
    if (button.matches('[data-guild-leave-cancel]')) {
      leaveConfirmStep = 0;
      render();
      return;
    }
    if (button.matches('[data-guild-leave-next]')) {
      if (leaveConfirmStep !== 1 || currentData?.my_role === 'leader') return;
      leaveConfirmStep = 2;
      render();
      return;
    }
    if (button.matches('[data-guild-leave-confirm]')) {
      if (busy || leaveConfirmStep !== 2 || currentData?.my_role === 'leader') return;
      const confirmButton = button;
      const action = run(async () => {
        if (!currentData?.guild?.id) throw new Error('公會資料已變更，請重新載入。');
        await rpc('guild_leave');
        leaveConfirmStep = 0;
        toast('已退出公會');
        activeView = 'find';
        await load();
      });
      confirmButton.disabled = true;
      void action.finally(() => { confirmButton.disabled = false; });
      return;
    }
  });

  documentRef.addEventListener('keydown', event => {
    if (event.key === 'Escape' && (mailboxOpen || findOpen || potionGiftOpen)) {
      mailboxOpen = false;
      findOpen = false;
      potionGiftOpen = false;
      render();
    }
  });

  return { load };
}
