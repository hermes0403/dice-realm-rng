const ADMIN_CATEGORIES = [
  { id: 'all', label: '全部' },
  { id: 'players', label: '玩家管理' },
  { id: 'economy', label: '經濟與獎勵' },
  { id: 'pets', label: '寵物管理' },
  { id: 'weather', label: '天氣與活動' },
  { id: 'monitoring', label: '數據監控' },
  { id: 'security', label: '紀錄與安全' }
];

const CATEGORY_TITLES = {
  players: '玩家管理',
  economy: '經濟與獎勵',
  pets: '寵物管理',
  weather: '天氣與活動',
  monitoring: '數據監控',
  security: '紀錄與安全'
};

const FOLD_CATEGORIES = {
  adminIncomeMonitorFold: 'economy',
  adminBroadcastFold: 'weather',
  adminGrantHistoryFold: 'economy',
  adminPetFusionLogsFold: 'pets',
  adminPetInventoryCountsFold: 'pets',
  adminPetOddsManagementFold: 'pets',
  adminNewPlayersFold: 'players',
  adminAchievementCountsFold: 'monitoring',
  adminOnlineCurveFold: 'monitoring',
  adminPotionLogsFold: 'security',
  adminDeletedAccountsFold: 'security',
  adminRareRollFold: 'security',
  adminSuspiciousRollFold: 'security',
  adminGlobalBoostFold: 'economy',
  adminCoinBoostFold: 'economy',
  adminWeatherControlFold: 'weather',
  adminPlayerWeatherFold: 'weather',
  adminWeatherHistoryFold: 'security'
};

export function classifyAdminFold(fold) {
  const id = fold?.id || '';
  if (FOLD_CATEGORIES[id]) return FOLD_CATEGORIES[id];
  const title = (fold?.querySelector('summary')?.textContent || fold?.textContent || '').toLowerCase();
  if (/玩家停權|解除停權|刪除玩家帳號|玩家在線狀況|新加入的玩家/.test(title)) return 'players';
  if (/全體玩家發放|指定玩家發放|發放紀錄|收益監控|運氣／速度加成|金錢收益倍率/.test(title)) return 'economy';
  if (/寵物/.test(title) && /持有數量|合成機率|合成紀錄|發放寵物/.test(title)) return 'pets';
  if (/天氣|訊息／全服投票|活動/.test(title)) return 'weather';
  if (/成就|造訪數|完整性|在線/.test(title)) return 'monitoring';
  return 'security';
}

export function matchesAdminFold(fold, query) {
  const needle = String(query || '').trim().toLocaleLowerCase();
  if (!needle) return true;
  const haystack = [
    fold?.querySelector('summary')?.textContent || '',
    fold?.textContent || ''
  ].join(' ').toLocaleLowerCase();
  return haystack.includes(needle);
}

function ensureFoldId(fold, index) {
  if (fold.id) return fold.id;
  const summary = fold.querySelector('summary')?.textContent || '';
  const knownIds = [
    [/^全體玩家發放\\s/, 'adminAllGrantFold'],
    [/^全體玩家發放寵物/, 'adminAllPetGrantFold'],
    [/^指定玩家發放/, 'adminSingleGrantFold'],
    [/^玩家停權／解封/, 'adminPlayerBanFold'],
    [/^刪除玩家帳號/, 'adminDeletePlayerFold'],
    [/^玩家在線狀況/, 'adminPlayersFold'],
    [/^反作弊／客戶端完整性/, 'adminClientAuditFold'],
    [/^最近合成紀錄/, 'adminCraftLogsFold']
  ];
  const known = knownIds.find(([pattern]) => pattern.test(summary));
  if (known) {
    fold.id = known[1];
    return fold.id;
  }
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
    <div class="admin-quick-actions" aria-label="常用管理操作">
      <span class="admin-quick-label">常用操作</span>
      <button type="button" data-admin-open="adminCoinBoostFold">金錢倍率</button>
      <button type="button" data-admin-open="adminAllGrantFold">發放獎勵</button>
      <button type="button" data-admin-open="adminWeatherControlFold">全服天氣</button>
      <button type="button" data-admin-open="adminBroadcastFold">全服訊息</button>
    </div>
    <div class="admin-tools">
      <label class="admin-search">
        <span class="sr-only">搜尋管理員功能</span>
        <span aria-hidden="true">⌕</span>
        <input type="search" data-admin-search placeholder="搜尋功能或關鍵字…" autocomplete="off">
        <button type="button" data-admin-clear aria-label="清除搜尋" hidden>清除</button>
      </label>
      <div class="admin-category-tabs" role="group" aria-label="管理功能分類"></div>
      <p class="admin-result-count" data-admin-count aria-live="polite"></p>
    </div>
    <div class="admin-category-groups"></div>
  `;

  const tabs = shell.querySelector('.admin-category-tabs');
  for (const category of ADMIN_CATEGORIES) {
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.className = 'admin-category-tab';
    button.dataset.adminCategory = category.id;
    button.textContent = category.label;
    button.setAttribute('aria-pressed', category.id === 'all' ? 'true' : 'false');
    tabs.append(button);
  }

  const groupsRoot = shell.querySelector('.admin-category-groups');
  const groups = new Map();
  for (const category of ADMIN_CATEGORIES.filter(item => item.id !== 'all')) {
    const group = documentRef.createElement('section');
    group.className = 'admin-category-group';
    group.dataset.adminGroup = category.id;
    const heading = documentRef.createElement('h3');
    heading.className = 'admin-category-title';
    heading.textContent = CATEGORY_TITLES[category.id];
    group.append(heading);
    groupsRoot.append(group);
    groups.set(category.id, group);
  }

  folds.forEach((fold, index) => {
    ensureFoldId(fold, index);
    fold.dataset.adminCategory = classifyAdminFold(fold);
    groups.get(fold.dataset.adminCategory).append(fold);
  });

  const activityButton = page.querySelector(':scope > #adminActivityButton');
  if (activityButton) {
    activityButton.classList.add('admin-activity-entry');
    groups.get('economy').prepend(activityButton);
  }

  page.querySelectorAll(':scope > .admin-category-title').forEach(node => node.remove());
  page.insertBefore(shell, folds[0]);
  const search = shell.querySelector('[data-admin-search]');
  const clear = shell.querySelector('[data-admin-clear]');
  const count = shell.querySelector('[data-admin-count]');
  let activeCategory = 'all';

  const applyFilters = () => {
    const query = search.value.trim();
    let visible = 0;
    for (const [categoryId, group] of groups) {
      let groupVisible = 0;
      for (const fold of group.querySelectorAll('.admin-fold')) {
        const match = (activeCategory === 'all' || activeCategory === categoryId) && matchesAdminFold(fold, query);
        fold.hidden = !match;
        if (match) {
          visible += 1;
          groupVisible += 1;
        }
      }
      const hasActivity = categoryId === 'economy' && activityButton && !query && (activeCategory === 'all' || activeCategory === 'economy');
      if (activityButton && categoryId === 'economy') activityButton.hidden = !hasActivity;
      group.hidden = groupVisible === 0 && !hasActivity;
    }
    clear.hidden = !query;
    count.textContent = query || activeCategory !== 'all' ? `顯示 ${visible} 項管理功能` : `共 ${visible} 項管理功能`;
  };

  tabs.addEventListener('click', event => {
    const button = event.target.closest('[data-admin-category]');
    if (!button) return;
    activeCategory = button.dataset.adminCategory;
    tabs.querySelectorAll('[data-admin-category]').forEach(tab => tab.setAttribute('aria-pressed', String(tab === button)));
    applyFilters();
  });
  search.addEventListener('input', applyFilters);
  clear.addEventListener('click', () => {
    search.value = '';
    search.focus();
    applyFilters();
  });
  shell.querySelectorAll('[data-admin-open]').forEach(button => {
    button.addEventListener('click', () => {
      const fold = documentRef.getElementById(button.dataset.adminOpen);
      if (!fold) return;
      activeCategory = fold.dataset.adminCategory || 'all';
      tabs.querySelectorAll('[data-admin-category]').forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.adminCategory === activeCategory)));
      search.value = '';
      applyFilters();
      fold.open = true;
      fold.scrollIntoView({ behavior: 'smooth', block: 'center' });
      fold.querySelector('summary')?.focus({ preventScroll: true });
    });
  });

  page.dataset.adminNavigationReady = 'true';
  applyFilters();
}
