/** Navigation and page switching for the Dice Realm UI. */
export function createNavigationUI({
  pages,
  isAdmin,
  toast,
  loadAdminDashboard,
  refreshLeaderboards,
  loadWeatherSummonData,
  renderPetsPage,
  loadSharkEvent
}) {
  let leaderboardRefreshTimer = null;

  function updateAdminVisibility() {
    const allowed = isAdmin();
    document.body.classList.toggle('admin-pets-unlocked', allowed);
    document.querySelectorAll('[data-page="admin"],[data-page="event"],[data-go="event"]').forEach(button => {
      button.hidden = !allowed;
    });
    const eventPanel = document.getElementById('page-event');
    if (eventPanel) eventPanel.hidden = !allowed;
    const panel = document.getElementById('page-admin');
    if (panel) panel.hidden = !allowed;
    const odds = document.getElementById('adminPetOddsManagementFold');
    if (odds) odds.hidden = !allowed;
    if (!allowed && (panel?.classList.contains('active') || eventPanel?.classList.contains('active'))) go('roll');
  }

  function navHTML() {
    return pages.map(([id, name, icon]) =>
      `<button data-page="${id}" data-nav-id="${id}" class="${id === 'roll' ? 'active' : ''}" ${id === 'admin' || id === 'event' ? 'hidden' : ''}>${icon} ${name}</button>`
    ).join('');
  }

  function go(id) {
    if ((id === 'admin' || id === 'event') && !isAdmin()) {
      toast('沒有管理員權限');
      return;
    }
    document.querySelectorAll('.page').forEach(page => {
      page.classList.toggle('active', page.id === 'page-' + id);
    });
    document.querySelectorAll('[data-page]').forEach(button => {
      button.classList.toggle('active', button.dataset.page === id);
    });
    if (id !== 'leaderboard' && leaderboardRefreshTimer !== null) {
      window.clearInterval(leaderboardRefreshTimer);
      leaderboardRefreshTimer = null;
    }
    if (id === 'admin') loadAdminDashboard();
    if (id === 'event') loadSharkEvent?.();
    if (id === 'leaderboard') {
      refreshLeaderboards();
      if (leaderboardRefreshTimer === null) {
        leaderboardRefreshTimer = window.setInterval(() => {
          if (document.getElementById('page-leaderboard')?.classList.contains('active')) {
            refreshLeaderboards({ force: true });
          }
        }, 60 * 1000);
      }
    }
    if (id === 'weather-summon') loadWeatherSummonData();
    if (id === 'pets') renderPetsPage();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.getElementById('sideNav').innerHTML = '<small>GAME MENU</small>' + navHTML();
  document.getElementById('mobileNav').innerHTML = navHTML();
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-page],[data-go]');
    if (!button) return;
    go(button.dataset.page || button.dataset.go);
  });

  return { updateAdminVisibility, navHTML, go };
}
