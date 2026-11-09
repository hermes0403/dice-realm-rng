/** Cloud leaderboard queries and rendering. */
export function createLeaderboardSystem({ supabaseClient, getCurrentUser, escapeHTML, format, compactNum, isCloudSyncBlocked = () => false, markCloudSyncBlocked = () => false, now = () => Date.now(), cacheMs = 30 * 1000, failureCooldownMs = 10 * 1000 }) {
  let refreshInFlight = null;
  let lastRefreshAt = 0;
  let lastFailedAt = 0;

  async function performLeaderboardRefresh() {
    const local = document.getElementById('localRank');
    const rare = document.getElementById('rareRank');
    const money = document.getElementById('moneyRank');
    const income = document.getElementById('incomeRank');
    const mine = document.getElementById('myRankStrip');
    if (!local || !rare || !money) return false;
    if (isCloudSyncBlocked()) {
      const blockedMessage = '<div class="empty">雲端服務受限，排行榜暫不可用。</div>';
      local.innerHTML = rare.innerHTML = money.innerHTML = blockedMessage;
      if (income) income.innerHTML = blockedMessage;
      return false;
    }
    if (!supabaseClient) {
      local.innerHTML = rare.innerHTML = money.innerHTML = '<div class="empty">雲端服務尚未載入，請重新整理。</div>';
      if (income) income.innerHTML = '<div class="empty">每秒收益排行榜尚未開放；等待伺服器權威資料完成。</div>';
      return false;
    }
    local.innerHTML = rare.innerHTML = money.innerHTML = '<div class="empty">正在更新排行榜…</div>';
    if (income) income.innerHTML = '<div class="empty">每秒收益排行榜尚未開放；等待伺服器權威資料完成。</div>';
    try {
      const fields = 'user_id,username,total_rolls,unique_dice,rarest_den,coins,achievement_count,achievement_reached_at,updated_at';
      const { data, error } = await supabaseClient.from('player_profiles').select(fields).order('total_rolls', { ascending: false }).limit(1000);
      if (error) throw error;
      const byUser = new Map();
      for (const row of data || []) {
        if (!row.user_id) continue;
        const old = byUser.get(row.user_id);
        if (!old || String(row.updated_at || '') > String(old.updated_at || '')) byUser.set(row.user_id, row);
      }
      const rows = [...byUser.values()].map(x => ({
        ...x,
        achievement_count: Number(x.achievement_count) || 0,
        achievement_reached_at: x.achievement_reached_at || '9999-12-31T23:59:59.999Z'
      }));
      const name = x => escapeHTML(x.username || '玩家');
      const medal = i => i < 3 ? ['🥇', '🥈', '🥉'][i] : '#' + (i + 1);
      const sortRoll = [...rows].sort((a, b) => (Number(b.total_rolls) || 0) - (Number(a.total_rolls) || 0));
      const sortRare = rows.filter(x => Number(x.rarest_den) > 0).sort((a, b) =>
        (Number(b.rarest_den) || 0) - (Number(a.rarest_den) || 0) || (Number(b.total_rolls) || 0) - (Number(a.total_rolls) || 0));
      const sortAchievement = [...rows].sort((a, b) =>
        (Number(b.achievement_count) || 0) - (Number(a.achievement_count) || 0) ||
        String(a.achievement_reached_at).localeCompare(String(b.achievement_reached_at)) ||
        String(a.user_id).localeCompare(String(b.user_id)));
      local.innerHTML = sortRoll.slice(0, 10).map((x, i) => `<div class="recipe"><div style="min-width:0;flex:1"><h3>${medal(i)} ${name(x)}</h3><p>已發現 ${format(x.unique_dice || 0)} 種骰子</p></div><span class="pill">${format(x.total_rolls || 0)} 次</span></div>`).join('') || '<div class="empty">目前還沒有排行榜資料，登入並擲骰後就會出現。</div>';
      rare.innerHTML = sortRare.slice(0, 10).map((x, i) => `<div class="recipe"><div style="min-width:0;flex:1"><h3>${medal(i)} ${name(x)}</h3><p>累積擲骰 ${format(x.total_rolls || 0)} 次</p></div><span class="pill">1/${compactNum(x.rarest_den)}</span></div>`).join('') || '<div class="empty">還沒有人上傳稀有骰子紀錄。</div>';
      money.innerHTML = sortAchievement.slice(0, 10).map((x, i) => `<div class="recipe"><div style="min-width:0;flex:1"><h3>${medal(i)} ${name(x)}</h3><p>完成 ${format(x.achievement_count || 0)} 個成就${Number(x.achievement_count) > 0 && x.achievement_reached_at !== '9999-12-31T23:59:59.999Z' ? ' · 最近達成 ' + new Date(x.achievement_reached_at).toLocaleDateString() : ''}</p></div><span class="pill">${format(x.achievement_count || 0)} 個</span></div>`).join('') || '<div class="empty">目前還沒有成就排行榜資料。</div>';
      if (mine) {
        const me = getCurrentUser()?.id;
        const rank = list => {
          if (!me) return '登入後顯示';
          const i = list.findIndex(x => x.user_id === me);
          return i < 0 ? '尚未上榜' : '第 ' + format(i + 1) + ' 名';
        };
        mine.innerHTML = `<div class="my-rank-card"><span class="my-rank-label">🎲 累積擲骰</span><div class="my-rank-value">${rank(sortRoll)}</div></div><div class="my-rank-card"><span class="my-rank-label">✦ 最佳骰子</span><div class="my-rank-value">${rank(sortRare)}</div></div><div class="my-rank-card"><span class="my-rank-label">🏆 成就</span><div class="my-rank-value">${rank(sortAchievement)}</div></div><div class="my-rank-card"><span class="my-rank-label">💸 賺錢排行榜</span><div class="my-rank-value">待後端開放</div></div>`;
      }
      return true;
    } catch (error) {
      markCloudSyncBlocked(error);
      console.error('Leaderboard load failed', error);
      const message = error?.message ? `排行榜載入失敗：${escapeHTML(error.message)}` : '雲端排行榜暫時無法載入。';
      local.innerHTML = rare.innerHTML = money.innerHTML = `<div class="empty">${message}</div>`;
      if (income) income.innerHTML = '<div class="empty">每秒收益排行榜尚未開放；等待伺服器權威資料完成。</div>';
      if (mine) mine.querySelectorAll('.my-rank-value').forEach((x, i) => { x.textContent = i === 3 ? '待後端開放' : '—'; });
      return false;
    }
  }

  async function refreshLeaderboards({ force = false } = {}) {
    if (refreshInFlight) return refreshInFlight;
    if (isCloudSyncBlocked()) return performLeaderboardRefresh();
    const currentTime = now();
    if (!force && lastRefreshAt && currentTime - lastRefreshAt < cacheMs) return true;
    if (!force && lastFailedAt && currentTime - lastFailedAt < failureCooldownMs) return false;
    refreshInFlight = (async () => {
      try {
        const succeeded = await performLeaderboardRefresh();
        if (succeeded) lastRefreshAt = now();
        else lastFailedAt = now();
        return succeeded;
      } finally {
        refreshInFlight = null;
      }
    })();
    return refreshInFlight;
  }

  return { refreshLeaderboards };
}
