const ADMIN_CATEGORIES = [
  { id: 'actions', label: '管理員操作／施放', icon: '✦', description: '公告投票、獎勵發放、全服加成、天氣與系統設定' },
  { id: 'players', label: '玩家資料／管理', icon: '♙', description: '玩家名單、新玩家、在線狀況、24 小時統計與玩家紀錄' },
  { id: 'all', label: '全部功能', icon: '▦', description: '同時顯示兩大分類' }
];
const CATEGORY_TITLES = Object.fromEntries(ADMIN_CATEGORIES.filter(item => item.id !== 'all').map(item => [item.id, item.label]));
const FOLD_CATEGORIES = {
  adminIncomeMonitorFold: 'players',
  adminBroadcastFold: 'actions',
  adminGrantHistoryFold: 'players',
  adminPetFusionLogsFold: 'players',
  adminPetInventoryCountsFold: 'players',
  adminPetOddsManagementFold: 'actions',
  adminNewPlayersFold: 'players',
  adminAchievementCountsFold: 'players',
  adminOnlineCurveFold: 'players',
  adminPotionLogsFold: 'players',
  adminDeletedAccountsFold: 'players',
  adminRareRollFold: 'players',
  adminSuspiciousRollFold: 'players',
  adminClientAuditFold: 'players',
  adminGlobalBoostFold: 'actions',
  adminCoinBoostFold: 'actions',
  adminWeatherControlFold: 'actions',
  adminPlayerWeatherFold: 'actions',
  adminWeatherHistoryFold: 'players'
};

export function classifyAdminFold(fold) {
  const id = fold?.id || '';
  if (FOLD_CATEGORIES[id]) return FOLD_CATEGORIES[id];
  const title = (fold?.querySelector('summary')?.textContent || fold?.textContent || '').toLowerCase();
  if (/全體玩家發放|指定玩家發放|訊息／全服投票|全服天氣控制|指定玩家天氣|全體運氣／速度加成|金錢收益倍率|寵物合成機率管理/.test(title)) return 'actions';
  return 'players';
}
export function matchesAdminFold(fold, query) {
  const needle = String(query || '').trim().toLocaleLowerCase();
  if (!needle) return true;
  return [fold?.querySelector('summary')?.textContent || '', fold?.textContent || ''].join(' ').toLocaleLowerCase().includes(needle);
}
export function ensureFoldId(fold, index) {
  if (fold.id) return fold.id;
  const summary = fold.querySelector('summary')?.textContent || '';
  const knownIds = [
    [/^全體玩家發放\\s/, 'adminAllGrantFold'], [/^全體玩家發放寵物/, 'adminAllPetGrantFold'],
    [/^指定玩家發放/, 'adminSingleGrantFold'], [/^玩家停權／解封/, 'adminPlayerBanFold'],
    [/^刪除玩家帳號/, 'adminDeletePlayerFold'], [/^玩家在線狀況/, 'adminPlayersFold'],
    [/^反作弊／客戶端完整性/, 'adminClientAuditFold'], [/^最近合成紀錄/, 'adminCraftLogsFold']
  ];
  const known = knownIds.find(([pattern]) => pattern.test(summary));
  if (known) { fold.id = known[1]; return fold.id; }
  const slug = summary.replace(/[^\\p{L}\\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 24) || 'item';
  fold.id = `adminNavigationItem-${index}-${slug}`;
  return fold.id;
}
export function setupAdminNavigation(documentRef = document) {
  const page = documentRef?.getElementById('page-admin');
  if (!page || page.dataset.adminNavigationReady === 'true') return;
  const notice = page.querySelector(':scope > .notice');
  if (!notice) return;
  const folds = [...page.querySelectorAll(':scope > details.admin-fold')];
  if (!folds.length) return;

  const shell = documentRef.createElement('div');
  shell.className = 'admin-navigation';
  shell.innerHTML = `
    <div class="admin-navigation-head">
      <div class="admin-navigation-heading">
        <span class="admin-navigation-eyebrow">DICE REALM · CONTROL CENTER</span>
        <strong>管理控制台</strong>
        <span>管理員操作與玩家資料分開整理</span>
      </div>
      <label class="admin-search">
        <span aria-hidden="true">⌕</span><span class="sr-only">搜尋管理員功能</span>
        <input type="search" data-admin-search placeholder="搜尋功能名稱或關鍵字…" autocomplete="off">
        <button type="button" data-admin-clear aria-label="清除搜尋" hidden>清除</button>
      </label>
    </div>
    <div class="admin-navigation-layout">
      <nav class="admin-category-nav" aria-label="管理功能分類"></nav>
      <div class="admin-category-content">
        <div class="admin-navigation-status"><span data-admin-active-title>玩家資料／管理</span><span data-admin-count aria-live="polite"></span></div>
        <div class="admin-category-groups"></div>
        <div class="admin-empty-state" data-admin-empty hidden>找不到符合的管理功能，請更換關鍵字。</div>
      </div>
    </div>`;
  const nav = shell.querySelector('.admin-category-nav');
  const navButtons = new Map();
  for (const category of ADMIN_CATEGORIES) {
    const button = documentRef.createElement('button');
    button.type = 'button'; button.className = 'admin-category-tab'; button.dataset.adminCategory = category.id;
    button.innerHTML = `<span class="admin-category-icon" aria-hidden="true">${category.icon}</span><span class="admin-category-copy"><strong>${category.label}</strong><small>${category.description}</small></span><span class="admin-category-count" data-category-count="${category.id}">0</span>`;
    button.setAttribute('aria-pressed', 'false'); nav.append(button); navButtons.set(category.id, button);
  }
  const groupsRoot = shell.querySelector('.admin-category-groups');
  const groups = new Map();
  for (const category of ADMIN_CATEGORIES.filter(item => item.id !== 'all')) {
    const group = documentRef.createElement('section'); group.className = 'admin-category-group'; group.dataset.adminGroup = category.id;
    const heading = documentRef.createElement('div'); heading.className = 'admin-category-title';
    heading.innerHTML = `<span>${category.icon}</span><div><strong>${CATEGORY_TITLES[category.id]}</strong><small>${category.description}</small></div>`;
    group.append(heading); groupsRoot.append(group); groups.set(category.id, group);
  }
  folds.forEach((fold, index) => { ensureFoldId(fold, index); fold.dataset.adminCategory = classifyAdminFold(fold); groups.get(fold.dataset.adminCategory).append(fold); });
  const activityButton = page.querySelector(':scope > #adminActivityButton');
  if (activityButton) { activityButton.classList.add('admin-activity-entry'); groups.get('actions').prepend(activityButton); }
  page.querySelectorAll(':scope > .admin-category-title').forEach(node => node.remove());
  page.insertBefore(shell, notice.nextSibling);

  const search = shell.querySelector('[data-admin-search]'), clear = shell.querySelector('[data-admin-clear]');
  const count = shell.querySelector('[data-admin-count]'), activeTitle = shell.querySelector('[data-admin-active-title]');
  const empty = shell.querySelector('[data-admin-empty]');
  let activeCategory = 'players';
  const applyFilters = () => {
    const query = search.value.trim(); let visible = 0;
    for (const [categoryId, group] of groups) {
      let groupVisible = 0;
      for (const fold of group.querySelectorAll('.admin-fold')) {
        const match = matchesAdminFold(fold, query);
        const show = match && (activeCategory === 'all' || activeCategory === categoryId);
        fold.hidden = !show; if (show) { visible++; groupVisible++; }
      }
      const activityMatch = activityButton && (!query || activityButton.textContent.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
      const hasActivity = categoryId === 'actions' && activityMatch && (activeCategory === 'all' || activeCategory === 'actions');
      if (activityButton && categoryId === 'actions') activityButton.hidden = !hasActivity;
      group.hidden = activeCategory !== 'all' && activeCategory !== categoryId;
      if (activeCategory === 'all' && groupVisible === 0 && !hasActivity) group.hidden = true;
    }
    for (const category of ADMIN_CATEGORIES) {
      const button = navButtons.get(category.id);
      button.setAttribute('aria-pressed', String(category.id === activeCategory));
      const amount = category.id === 'all'
        ? folds.filter(fold => matchesAdminFold(fold, query)).length
        : [...groups.get(category.id).querySelectorAll('.admin-fold')].filter(fold => matchesAdminFold(fold, query)).length;
      button.querySelector('[data-category-count]').textContent = String(amount);
    }
    clear.hidden = !query;
    activeTitle.textContent = activeCategory === 'all' ? '全部功能' : CATEGORY_TITLES[activeCategory];
    count.textContent = query ? `符合 ${visible} 項` : `${visible} 項功能`;
    empty.hidden = visible > 0 || Boolean(activityButton && !activityButton.hidden);
  };
  nav.addEventListener('click', event => {
    const button = event.target.closest('[data-admin-category]');
    if (!button) return;
    activeCategory = button.dataset.adminCategory; applyFilters();
  });
  search.addEventListener('input', applyFilters);
  clear.addEventListener('click', () => { search.value = ''; applyFilters(); search.focus({ preventScroll: true }); });
  page.dataset.adminNavigationReady = 'true'; applyFilters();
}
if (typeof document !== 'undefined') setupAdminNavigation(document);
