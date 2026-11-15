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

  function navHTML() {
    return pages.map(([id, name, icon]) =>
      `<button data-page="${id}" data-nav-id="${id}" class="${id === 'roll' ? 'active' : ''}" ${id === 'admin' ? 'hidden' : ''}>${icon} ${name}</button>`
    ).join('');
  }

  function setWorkshopCategory(category) {
    document.querySelectorAll('[data-workshop-category]').forEach(button => button.classList.toggle('active', button.dataset.workshopCategory === category));
    document.getElementById('workshop-gloves-panel')?.toggleAttribute('hidden', category !== 'gloves');
    document.getElementById('workshop-potions-panel')?.toggleAttribute('hidden', category !== 'potions');
    document.getElementById('workshop-items-panel')?.toggleAttribute('hidden', category !== 'items');
  }

  function go(id) {
    if (id === 'admin' && !isAdmin()) {
      toast('沒有管理員權限');
      return;
    }
    document.querySelectorAll('.page').forEach(page => {
      page.classList.toggle('active', page.id === 'page-' + id);
    });
    document.querySelectorAll('[data-page]').forEach(button => {
      button.classList.toggle('active', button.dataset.page === id);
    });
    if (id === 'admin') loadAdminDashboard();
    if (id === 'leaderboard') refreshLeaderboards();
    if (id === 'weather-summon') loadWeatherSummonData();
    if (id === 'pets') renderPetsPage();
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
    const button = event.target.closest('[data-page],[data-go]');
    if (!button) return;
    go(button.dataset.page || button.dataset.go);
  });

  return { updateAdminVisibility, navHTML, go };
}
