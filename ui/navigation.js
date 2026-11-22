/** Navigation and page switching for the Dice Realm UI. */
export function createNavigationUI({
  pages,
  isAdmin,
  toast,
  loadAdminDashboard,
  refreshLeaderboards,
  loadWeatherSummonData,
  renderPetsPage
}) {
  const primaryItems = [
    ['roll', '大廳', '✦'],
    ['inventory', '背包', '▦'],
    ['codex', '圖鑑', '◈'],
    ['workshop', '工坊', '⚒']
  ];
  const moreItems = [
    ['pets', '融合機', '♧'],
    ['trade', '交易', '⇄'],
    ['weather-summon', '天氣召喚', '✧'],
    ['quests', '任務成就', '☷'],
    ['leaderboard', '排行榜', '♜'],
    ['updates', '寵物資訊', '▤'],
    ['profile', '設定', '◎'],
    ['admin', '管理員面板', '⚙']
  ];

  function updateAdminVisibility() {
    const allowed = isAdmin();
    document.body.classList.toggle('admin-pets-unlocked', allowed);
    document.querySelectorAll('[data-page="admin"]').forEach(button => {
      button.hidden = !allowed;
    });
    const eventEntry = document.querySelector('.limited-event-entry');
    if (eventEntry) eventEntry.hidden = !allowed;
    const eventAdminPanel = document.getElementById('eventAdminPanel');
    if (eventAdminPanel) eventAdminPanel.hidden = !allowed;
    const eventLockedPanel = document.getElementById('eventLockedPanel');
    if (eventLockedPanel) eventLockedPanel.hidden = allowed;
    const panel = document.getElementById('page-admin');
    if (panel) panel.hidden = !allowed;
    const odds = document.getElementById('adminPetOddsManagementFold');
    if (odds) odds.hidden = !allowed;
    if (!allowed && panel?.classList.contains('active')) go('roll');
  }

  function buttonHTML([id, name, icon], extraClass = '') {
    return `<button type="button" data-page="${id}" class="${extraClass}" ${id === 'admin' ? 'hidden' : ''}><span class="nav-item-icon" aria-hidden="true">${icon}</span><span class="nav-item-label">${name}</span></button>`;
  }

  function navHTML() {
    return primaryItems.map(([id, name, icon]) =>
      buttonHTML([id, name, icon], `${id === 'roll' ? 'active' : ''} nav-primary-item`)
    ).join('') +
    '<button type="button" class="nav-more-toggle" data-more-toggle aria-expanded="false" aria-controls="realmMoreMenu"><span class="nav-item-icon" aria-hidden="true">▦</span><span class="nav-item-label">更多</span></button>' +
    `<div class="nav-more-menu" id="realmMoreMenu" hidden>${moreItems.map(item => buttonHTML(item, 'nav-more-item')).join('')}</div>`;
  }

  function setMoreMenu(open) {
    document.querySelectorAll('.nav-more-menu').forEach(menu => { menu.hidden = !open; });
    document.querySelectorAll('[data-more-toggle]').forEach(button => {
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
      button.classList.toggle('is-open', open);
    });
  }

  function setActiveNavigation(id) {
    const primaryActive = primaryItems.some(([pageId]) => pageId === id);
    document.querySelectorAll('#sideNav [data-page], #mobileNav [data-page]').forEach(button => {
      button.classList.toggle('active', button.dataset.page === id);
    });
    document.querySelectorAll('[data-more-toggle]').forEach(button => {
      button.classList.toggle('active', !primaryActive);
    });
  }

  function setWorkshopCategory(category) {
    document.querySelectorAll('[data-workshop-category]').forEach(button => button.classList.toggle('active', button.dataset.workshopCategory === category));
    document.getElementById('workshop-gloves-panel')?.toggleAttribute('hidden', category !== 'gloves');
    document.getElementById('workshop-potions-panel')?.toggleAttribute('hidden', category !== 'potions');
    document.getElementById('workshop-items-panel')?.toggleAttribute('hidden', category !== 'items');
  }

  function setPetView(view) {
    const trade = view === 'trade';
    const fusionView = document.getElementById('petsFusionView');
    const tradeView = document.getElementById('petsTradeView');
    const title = document.getElementById('petsPageTitle');
    if (fusionView) fusionView.hidden = trade;
    if (tradeView) tradeView.hidden = !trade;
    if (title) title.textContent = trade ? '交易' : '融合機';
  }

  function go(id) {
    if (id === 'more') {
      const menu = document.querySelector('#sideNav .nav-more-menu, #mobileNav .nav-more-menu');
      setMoreMenu(Boolean(menu?.hidden));
      return;
    }
    if (id === 'admin' && !isAdmin()) {
      toast('沒有管理員權限');
      return;
    }
    setMoreMenu(false);
    const pageId = id === 'trade' ? 'pets' : id;
    document.querySelectorAll('.page').forEach(page => {
      page.classList.toggle('active', page.id === 'page-' + pageId);
    });
    setActiveNavigation(id);
    if (id === 'trade') setPetView('trade');
    else if (id === 'pets') {
      setPetView('fusion');
      renderPetsPage();
    } else {
      // Leaving the pets page must always close the trade sub-view.
      setPetView('fusion');
    }
    if (id === 'admin') loadAdminDashboard();
    if (id === 'leaderboard') refreshLeaderboards();
    if (id === 'weather-summon') loadWeatherSummonData();
    if (id === 'workshop') setWorkshopCategory('gloves');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.getElementById('sideNav').innerHTML = '<small>GAME MENU</small>' + navHTML();
  document.getElementById('mobileNav').innerHTML = navHTML();
  document.addEventListener('click', event => {
    const eggButton = event.target.closest('[data-event-egg]');
    if (eggButton) {
      if (!isAdmin()) { toast('沒有管理員權限'); return; }
      const odds = document.getElementById('dragonCrystalOdds');
      const expanded = eggButton.getAttribute('aria-expanded') === 'true';
      if (odds) odds.hidden = expanded;
      eggButton.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      return;
    }
    const workshopButton = event.target.closest('[data-workshop-category]');
    if (workshopButton) { setWorkshopCategory(workshopButton.dataset.workshopCategory); return; }
    if (!event.target.closest('[data-more-toggle], .nav-more-menu')) setMoreMenu(false);
    const button = event.target.closest('[data-more-toggle], [data-page], [data-go]');
    if (!button) return;
    if (button.matches('[data-more-toggle]')) { go('more'); return; }
    go(button.dataset.page || button.dataset.go);
  });

  return { updateAdminVisibility, navHTML, go };
}
