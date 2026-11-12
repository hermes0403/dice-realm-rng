import { lockedDiceIndexes, unlockedDiceCount, consumeUnlockedDice } from '../systems/dice-locks.js';

/** Keep Halloween dice out of auto-sell preferences, including stale saved IDs. */
export function filterAutoSellDice(dice, selectedIds = []) {
  const halloweenIds = new Set(['d33', 'd34', 'd35', 'd36']);
  const safeIds = (Array.isArray(selectedIds) ? selectedIds : []).filter(id => !halloweenIds.has(id));
  const categoryOrder = item => item.weather
    ? ({ rain: 1, snow: 2, thunder: 3, crystal: 4, hell: 5 }[item.weather] ?? 6) : 0;
  const options = (Array.isArray(dice) ? dice : [])
    .filter(item => !halloweenIds.has(item.id) && Number(item.den) >= 2 && Number(item.den) <= 600000)
    .slice().sort((a, b) => categoryOrder(a) - categoryOrder(b) || Number(a.den) - Number(b.den));
  return { dice: options, selectedIds: safeIds };
}

/** Inventory rendering and its local selection/sale interactions. */
export function createInventoryUI({
  D,
  getState,
  format,
  escapeHTML,
  chanceText,
  persistAutoSellPrefs,
  save,
  toast,
  totalDice,
  byId,
  coinEarningMultiplier,
  checkDailyReward,
  render
}) {
  let inventorySellMode = false;
  let inventoryLockMode = false;
  function lockedSet(id, count) {
    return lockedDiceIndexes(getState(), id);
  }

  function updateLockModeButton() {
    const button = document.getElementById('lockDiceModeBtn');
    if (!button) return;
    button.textContent = inventoryLockMode ? '解除鎖定' : '鎖定';
    button.classList.toggle('active', inventoryLockMode);
  }

  function itemHTML(dice, owned = true) {
    const S = getState();
    const count = S.bag[dice.id] || 0;
    return `<article class="item ${dice.den >= 65536 ? 'ultra' : dice.den >= 2048 ? 'rare' : ''}" style="--c:${dice.color}"><div class="count">${owned ? '×' + count : '???'}</div><div class="ico ${['d33','d34','d35','d36'].includes(dice.id) ? 'halloween-compact' : ''}" style="color:${owned ? (dice.iconColor || dice.color) : '#525873'}">${owned ? dice.icon : '?'}</div><h3>${owned ? dice.name : '未知骰子'}</h3><p>${owned ? chanceText(dice) : '尚未發現'}</p><p>${owned ? dice.desc : '繼續擲骰以解鎖資料。'}</p>${owned && S.first[dice.id] ? `<p>首次：${new Date(S.first[dice.id]).toLocaleDateString()}</p>` : ''}</article>`;
  }

  function renderAutoSellOptions() {
    const S = getState();
    const box = document.getElementById('autoSellDiceOptions');
    if (!box) return;
    const savedIds = Array.isArray(S.autoDeleteDice) ? S.autoDeleteDice : [];
    const { dice, selectedIds: safeIds } = filterAutoSellDice(D, savedIds);
    if (safeIds.length !== savedIds.length) {
      S.autoDeleteDice = safeIds;
      persistAutoSellPrefs();
      save();
    }
    const renderOne = item => {
      const selected = safeIds.includes(item.id);
      const color = item.weather
        ? ({ rain: '#3298ff', snow: '#ffffff', thunder: '#fff000', crystal: '#d56bff', hell: '#ff3434' }[item.weather] || '#4df27c')
        : '#4df27c';
      const weatherLabel = ({ rain: '雨', snow: '雪', thunder: '打雷', crystal: '水晶', hell: '地獄' })[item.weather] || '天氣';
      return `<label class="auto-sell-option"><input type="checkbox" data-auto-delete="${item.id}" ${selected ? 'checked' : ''}><span style="color:${color}"><b>${chanceText(item)}</b> ${item.name}${item.weather ? `（${weatherLabel}）` : ''}</span></label>`;
    };
    box.innerHTML = dice.map(renderOne).join('');
  }

  function renderAutoDepositOptions() {
    const S = getState();
    const box = document.getElementById('autoDepositDiceOptions');
    if (!box) return;
    const order = { rain: 0, snow: 1, thunder: 2, crystal: 3, hell: 4 };
    const labels = { rain: '🌧️ 雨', snow: '❄️ 雪', thunder: '⚡ 雷', crystal: '💎 水晶', hell: '🔥 地獄' };
    const colors = { rain: '#3298ff', snow: '#ffffff', thunder: '#fff000', crystal: '#e34dff', hell: '#9b0018' };
    const dice = D.filter(item => !!item.weather && Number(item.den) >= 2 && Number(item.den) <= 1000000)
      .slice().sort((a, b) => (order[a.weather] ?? 99) - (order[b.weather] ?? 99) || a.den - b.den);
    let last = '';
    box.innerHTML = dice.map(item => {
      const selected = (S.autoDepositDice || []).includes(item.id);
      const color = colors[item.weather] || '#dce4ff';
      let heading = '';
      if (last !== item.weather) {
        last = item.weather;
        heading = `<div class="auto-weather-group-title" style="color:${color}">${labels[item.weather] || item.weather}天氣（機率由小到大）</div>`;
      }
      return `${heading}<label class="auto-sell-option"><input type="checkbox" data-auto-deposit-dice="${item.id}" ${selected ? 'checked' : ''}><span style="color:${color}"><b>${chanceText(item)}</b> ${escapeHTML(item.name)}</span></label>`;
    }).join('') || '<div class="empty">目前沒有可設定的天氣骰子。</div>';
  }

  function updateInventorySelectedCount() {
    const grid = document.getElementById('inventoryGrid');
    if (!grid) return;
    const total = grid.querySelectorAll('input[data-sell-select]:checked').length;
    const label = document.getElementById('inventorySelectedCount');
    const button = document.getElementById('sellSelectedDiceBtn');
    if (label) label.textContent = inventorySellMode ? `已選擇 ${format(total)} 顆骰子` : '';
    if (button) {
      button.textContent = inventorySellMode ? (total ? `出售已選骰子 (${format(total)})` : '取消選擇') : '出售';
      button.disabled = false;
    }
  }

  function renderInventory() {
    const S = getState();
    const grid = document.getElementById('inventoryGrid');
    const previouslySelected = inventorySellMode
      ? [...grid.querySelectorAll('input[data-sell-select]:checked')].map(input => input.dataset.sellSelect)
      : [];
    const halloweenIds = new Set(['d33', 'd34', 'd35', 'd36']);
    const mutationColors = { rain: '#3298ff', snow: '#ffffff', thunder: '#fff000', crystal: '#d56bff', hell: '#ff3434' };
    const categoryOrder = dice => halloweenIds.has(dice.id) ? 1 : dice.weather
      ? ({ rain: 2, snow: 3, thunder: 4, crystal: 5, hell: 6 }[dice.weather] ?? 7) : 0;
    const dice = D.filter(item => (Number(S.bag[item.id]) || 0) > 0)
      .sort((a, b) => categoryOrder(a) - categoryOrder(b) || Number(a.den) - Number(b.den));
    let html = '';
    for (const item of dice) {
      const count = Number(S.bag[item.id]) || 0;
      const halloween = halloweenIds.has(item.id);
      const color = halloween ? '#ff8a3d' : (mutationColors[item.weather] || '#4df27c');
      for (let n = 0; n < count; n++) {
        const locked = lockedSet(item.id, count).has(n);
        html += `<label class="inventory-tile ${locked ? 'dice-locked' : ''}" data-dice-id="${item.id}" data-dice-index="${n}" style="--rarity-color:${color};color:${color}" title="${escapeHTML(item.name)} · ${chanceText(item)}"><input type="checkbox" data-sell-select="${item.id}" ${locked ? "disabled" : ""} aria-label="選擇出售${escapeHTML(item.name)}第${n + 1}顆"><button type="button" class="dice-lock-star" data-toggle-dice-lock="1" aria-label="切換鎖定">${locked ? "★" : ""}</button><span class="tile-chance" style="color:${color}">${chanceText(item)}</span><span class="tile-icon" style="color:${color}">${item.icon}</span><span class="tile-name" style="color:${color}">${escapeHTML(item.name)}</span><span class="tile-index">#${n + 1}</span></label>`;
      }
    }
    grid.innerHTML = html || '<div class="empty" style="grid-column:1/-1">背包目前沒有骰子。</div>';
    if (inventorySellMode) {
      grid.classList.add('sell-select-mode');
      const remaining = new Map();
      for (const id of previouslySelected) remaining.set(id, (remaining.get(id) || 0) + 1);
      grid.querySelectorAll('input[data-sell-select]').forEach(input => {
        const count = remaining.get(input.dataset.sellSelect) || 0;
        if (count > 0) {
          input.checked = true;
          remaining.set(input.dataset.sellSelect, count - 1);
        }
      });
    }
    document.getElementById('bagCount').textContent = format(totalDice()) + ' 顆';
    updateInventorySelectedCount();
  }

  function sellMany(id, button) {
    const dice = byId(id);
    if (!dice) return;
    const row = button?.closest('.inventory-row');
    const input = row?.querySelector(`[data-sell-qty="${id}"]`);
    const S = getState();
    const have = Number(S.bag[id]) || 0;
    const available = unlockedDiceCount(S, id);
    const amount = Math.floor(Number(input?.value) || 0);
    if (have <= 0 || amount < 1) { toast('請輸入有效出售數量'); return; }
    if (amount > available) {
      toast('請取消星號在出售');
      if (input) input.value = String(available);
      return;
    }
    consumeUnlockedDice(S, id, amount);
    const earned = Math.floor(amount * coinEarningMultiplier());
    S.coins = (Number(S.coins) || 0) + earned;
    S.quest = S.quest || {};
    S.quest.coinsEarned = (Number(S.quest.coinsEarned) || 0) + earned;
    checkDailyReward();
    save();
    render();
    toast(`已出售${dice.name} ×${format(amount)}`);
  }

  function bagUpgradeCost(currentCapacity) {
    return 1000 + Math.max(0, Math.floor(Number(currentCapacity) || 35) - 35) * 500;
  }

  document.getElementById('autoSellDiceOptions').addEventListener('change', event => {
    const id = event.target.dataset.autoDelete;
    if (!id) return;
    const S = getState();
    const selected = new Set(S.autoDeleteDice || []);
    if (event.target.checked) selected.add(id);
    else selected.delete(id);
    S.autoDeleteDice = [...selected];
    persistAutoSellPrefs();
    save();
    toast(event.target.checked ? '已加入自動出售清單' : '已從自動出售清單移除');
  });

  document.getElementById('autoDepositDiceOptions').addEventListener('change', event => {
    const id = event.target.dataset.autoDepositDice;
    if (!id) return;
    const S = getState();
    const selected = new Set(S.autoDepositDice || []);
    if (event.target.checked) selected.add(id);
    else selected.delete(id);
    S.autoDepositDice = [...selected];
    save();
    toast(event.target.checked ? '已加入自動投入清單' : '已從自動投入清單移除');
  });

  document.getElementById('inventoryGrid').addEventListener('click', event => {
    const lock = event.target.closest('[data-toggle-dice-lock]');
    if (lock) {
      event.preventDefault();
      event.stopPropagation();
      if (!inventoryLockMode) return;
      const tile = lock.closest('.inventory-tile');
      const key = tile.dataset.diceId + ':' + tile.dataset.diceIndex;
      const S = getState(), locks = lockedSet(tile.dataset.diceId);
      if (locks.has(key)) locks.delete(key); else locks.add(key);
      S.lockedDice = [...locks];
      save();
      renderInventory();
      return;
    }
    const tile = event.target.closest('.inventory-tile');
    if (tile && inventoryLockMode) {
      event.preventDefault();
      const key = tile.dataset.diceId + ':' + tile.dataset.diceIndex;
      const S = getState(), locks = lockedSet();
      if (locks.has(key)) locks.delete(key); else locks.add(key);
      S.lockedDice = [...locks];
      save();
      renderInventory();
      return;
    }
    if (tile && (!inventorySellMode || tile.classList.contains('dice-locked'))) event.preventDefault();
  });
  document.getElementById('inventoryGrid').addEventListener('change', event => {
    if (event.target.matches('input[data-sell-select]')) updateInventorySelectedCount();
  });
  document.getElementById('lockDiceModeBtn').addEventListener('click', () => {
    if (inventorySellMode) {
      inventorySellMode = false;
      document.getElementById('inventoryGrid').classList.remove('sell-select-mode');
      updateInventorySelectedCount();
    }
    inventoryLockMode = !inventoryLockMode;
    updateLockModeButton();
  });
  updateLockModeButton();

  document.getElementById('sellSelectedDiceBtn').addEventListener('click', () => {
    const S = getState();
    const grid = document.getElementById('inventoryGrid');
    if (inventoryLockMode) {
      inventoryLockMode = false;
      updateLockModeButton();
    }
    if (!inventorySellMode) {
      inventorySellMode = true;
      grid.classList.add('sell-select-mode');
      updateInventorySelectedCount();
      toast('請點選要出售的單顆骰子');
      return;
    }
    const checked = [...grid.querySelectorAll('input[data-sell-select]:checked')];
    if (checked.some(input => input.closest('.inventory-tile')?.classList.contains('dice-locked'))) { toast('請取消星號在出售'); return; }
    if (!checked.length) {
      inventorySellMode = false;
      grid.classList.remove('sell-select-mode');
      updateInventorySelectedCount();
      return;
    }
    const counts = new Map();
    for (const input of checked) counts.set(input.dataset.sellSelect, (counts.get(input.dataset.sellSelect) || 0) + 1);
    const total = checked.length;
    const summary = [...counts.entries()].map(([id, count]) => {
      const dice = byId(id);
      return dice ? `${dice.name} ×${count}` : null;
    }).filter(Boolean).join('、');
    if (!window.confirm(`你即將出售 ${format(total)} 顆骰子：\n${summary}\n\n此舉動不可復原，確定要出售嗎？`)) return;
    let earned = 0;
    for (const [id, amount] of counts) {
      if (amount > unlockedDiceCount(S, id)) {
        toast('請取消星號在出售');
        return;
      }
    }
    for (const [id, amount] of counts) {
      if (!consumeUnlockedDice(S, id, amount)) {
        toast('請取消星號在出售');
        return;
      }
      earned += amount;
    }
    S.coins = (Number(S.coins) || 0) + earned;
    S.quest = S.quest || {};
    S.quest.coinsEarned = (Number(S.quest.coinsEarned) || 0) + earned;
    checkDailyReward();
    inventorySellMode = false;
    grid.classList.remove('sell-select-mode');
    save();
    render();
    toast(`已出售 ${format(total)} 顆骰子`);
  });

  return { itemHTML, renderAutoSellOptions, renderAutoDepositOptions, updateInventorySelectedCount, renderInventory, sellMany, bagUpgradeCost };
}
