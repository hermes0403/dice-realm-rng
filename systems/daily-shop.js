/** Per-player daily shop. Stock is generated once per Taipei calendar day and saved with the player's game state. */
const PRODUCTS = [
  { id: 'luck1', type: 'potion', itemId: 'luck1', name: '幸運藥水 I', chance: 50, price: 1000000, tier: 'common', desc: '運氣提升，持續 5 分鐘。' },
  { id: 'luck2', type: 'potion', itemId: 'luck2', name: '幸運藥水 II', chance: 15, price: 3000000, tier: 'rare', desc: '更高幅度的運氣提升，持續 5 分鐘。' },
  { id: 'luck3', type: 'potion', itemId: 'luck3', name: '幸運藥水 III', chance: 5, price: 8000000, tier: 'epic', desc: '高階運氣提升，持續 5 分鐘。' },
  { id: 'speed1', type: 'potion', itemId: 'speed1', name: '速度藥水 I', chance: 25, price: 1000000, tier: 'common', desc: '擲骰速度提升，持續 5 分鐘。' },
  { id: 'speed2', type: 'potion', itemId: 'speed2', name: '速度藥水 II', chance: 12.5, price: 3000000, tier: 'rare', desc: '更高幅度的速度提升，持續 5 分鐘。' },
  { id: 'money1', type: 'potion', itemId: 'money1', name: '錢錢藥水 I', chance: 25, price: 1500000, tier: 'common', desc: '金錢收益 ×2.5，持續 5 分鐘。' },
  { id: 'money2', type: 'potion', itemId: 'money2', name: '錢錢藥水 II', chance: 12.5, price: 4000000, tier: 'rare', desc: '金錢收益 ×5，持續 5 分鐘。' },
  { id: 'angel1', type: 'potion', itemId: 'angel1', name: '天堂藥水 I', chance: 1, price: 25000000, tier: 'legendary', desc: '提升下一抽的特殊機率。' },
  { id: 'd10', type: 'dice', itemId: 'd10', name: '✺ 極光骰子', chance: 3, price: 8000000, tier: 'rare', desc: '1/1,024 · 極光在骰面周圍流轉。' },
  { id: 'd12', type: 'dice', itemId: 'd12', name: '☄ 彗星骰子', chance: 1.2, price: 20000000, tier: 'epic', desc: '1/4,096 · 拖著彗尾穿越暗色星空。' },
  { id: 'd13', type: 'dice', itemId: 'd13', name: '☼ 日冕骰子', chance: 0.5, price: 40000000, tier: 'legendary', desc: '1/8,192 · 微型日冕向外迸發。' }
];

const STOCK_RANGES = {
  luck1: [1, 3], luck2: [1, 3], luck3: [1, 1], speed1: [1, 3], speed2: [1, 2],
  money1: [1, 2], money2: [1, 1], angel1: [1, 1], d10: [1, 2], d12: [1, 2], d13: [1, 2]
};

function rollItemStock(productId, random = Math.random) {
  const [min, max] = STOCK_RANGES[productId] || [1, 1];
  return min + Math.floor(random() * (max - min + 1));
}

export function taipeiDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return values.year + '-' + values.month + '-' + values.day;
}

export function rollDailyStock(random = Math.random) {
  const selected = [];
  for (const product of PRODUCTS) {
    if (random() * 100 < product.chance) selected.push(product.id);
    if (selected.length === 6) break;
  }
  if (selected.length < 2) {
    const fallback = [...PRODUCTS].sort((a, b) => b.chance - a.chance || PRODUCTS.indexOf(a) - PRODUCTS.indexOf(b));
    for (const product of fallback) {
      if (!selected.includes(product.id)) selected.push(product.id);
      if (selected.length === 2) break;
    }
  }
  return selected;
}

export function createDailyShopSystem(deps) {
  const {
    getState, getCurrentUser, isCloudSaveReady, save, render, toast,
    format, documentRef, timerManager
  } = deps;

  function ensureDailyStock() {
    const user = getCurrentUser();
    if (!user || !isCloudSaveReady(user.id)) return false;
    const state = getState();
    const today = taipeiDateKey();
    if (state.dailyShop?.date === today && Array.isArray(state.dailyShop.items)) {
      const shop = state.dailyShop;
      let changed = false;
      if (!shop.stock || typeof shop.stock !== 'object') {
        shop.stock = Object.fromEntries(shop.items.map(id => [id, rollItemStock(id)]));
        changed = true;
      }
      if (Array.isArray(shop.purchased)) {
        shop.purchased = Object.fromEntries(shop.purchased.map(id => [id, 1]));
        changed = true;
      } else if (!shop.purchased || typeof shop.purchased !== 'object') {
        shop.purchased = {};
        changed = true;
      }
      if (changed) save();
      return false;
    }
    const items = rollDailyStock();
    state.dailyShop = {
      date: today,
      items,
      stock: Object.fromEntries(items.map(id => [id, rollItemStock(id)])),
      purchased: {}
    };
    save();
    return true;
  }

  function renderDailyShop() {
    const root = documentRef.getElementById('dailyShopContent');
    if (!root) return;
    const user = getCurrentUser();
    if (!user) {
      root.innerHTML = '<div class="daily-shop-empty"><span>◈</span><h3>登入後開啟專屬商店</h3><p>每位玩家每天會獲得不同的商品組合。</p><button type="button" class="primary" data-daily-shop-login>登入帳號</button></div>';
      return;
    }
    if (!isCloudSaveReady(user.id)) {
      root.innerHTML = '<div class="daily-shop-empty"><span>◈</span><h3>正在同步玩家資料</h3><p>雲端存檔完成後即可查看今日商品。</p></div>';
      return;
    }
    ensureDailyStock();
    const state = getState();
    const shop = state.dailyShop;
    const purchased = shop.purchased && typeof shop.purchased === 'object' ? shop.purchased : {};
    const products = shop.items.map(id => PRODUCTS.find(product => product.id === id)).filter(Boolean);
    const balance = Math.max(0, Number(state.coins) || 0);
    root.innerHTML = `
      <div class="daily-shop-toolbar"><div><span class="daily-shop-kicker">DAILY ROTATION · TAIPEI TIME</span><strong>今日商品 <b>${products.length}</b> / 6</strong></div><div class="daily-shop-balance"><small>目前持有</small><b>${format(balance)}$</b></div></div>
      <div class="daily-shop-track" aria-label="每日商店商品，可左右滑動">
        ${products.map((product, index) => {
          const totalStock = Math.max(1, Number(shop.stock?.[product.id]) || 1);
          const bought = Math.max(0, Number(purchased[product.id]) || 0);
          const remaining = Math.max(0, totalStock - bought);
          const soldOut = remaining === 0;
          const icon = product.type === 'potion' ? ({luck1:'🧪',luck2:'⚗️',luck3:'✦',speed1:'💨',speed2:'🌪️',money1:'💰',money2:'🪙',angel1:'🪽'}[product.itemId] || '✧') : ({d10:'✺',d12:'☄',d13:'☼'}[product.itemId] || '🎲');
          return `<article class="daily-shop-card daily-shop-${product.tier}">
            <div class="daily-shop-card-top"><span class="daily-shop-index">0${index + 1} / DAILY STOCK</span></div>
            <div class="daily-shop-art" aria-hidden="true">${icon}</div>
            <h3>${product.name}</h3><p class="daily-shop-desc">${product.desc}</p><p class="daily-shop-stock">庫存 ${remaining} / ${totalStock}</p>
            <div class="daily-shop-buy-row"><strong>${format(product.price)}<small>$</small></strong>
              <button type="button" class="primary" data-buy-daily-item="${product.id}" ${soldOut || balance < product.price ? 'disabled' : ''}>${soldOut ? '已售罄' : balance < product.price ? '金錢不足' : '立即購買'}</button>
            </div>
          </article>`;
        }).join('')}
      </div>
      <div class="daily-shop-foot"><span>每日 00:00 刷新 · 商品售完為止</span></div>`;
  }

  function purchase(productId) {
    const user = getCurrentUser();
    if (!user || !isCloudSaveReady(user.id)) {
      toast('請先登入並完成雲端同步');
      return;
    }
    ensureDailyStock();
    const state = getState();
    const shop = state.dailyShop;
    const product = PRODUCTS.find(item => item.id === productId);
    if (!product || !shop.items.includes(productId)) {
      toast('這項商品不在今日商店中');
      return;
    }
    shop.purchased = shop.purchased && typeof shop.purchased === 'object' ? shop.purchased : {};
    shop.stock = shop.stock && typeof shop.stock === 'object' ? shop.stock : {};
    const totalStock = Math.max(1, Number(shop.stock[productId]) || 1);
    const bought = Math.max(0, Number(shop.purchased[productId]) || 0);
    if (bought >= totalStock) {
      toast('這項商品今日庫存已售完');
      return;
    }
    if (product.type === 'dice') {
      const used = Object.values(state.bag || {}).reduce((sum, count) => sum + Math.max(0, Number(count) || 0), 0);
      if (used >= (Number(state.bagCapacity) || 35)) {
        toast('背包已滿，請先擴充容量或整理骰子');
        return;
      }
    }
    const balance = Math.max(0, Number(state.coins) || 0);
    if (balance < product.price) {
      toast('金錢不足，無法購買');
      return;
    }
    state.coins = balance - product.price;
    if (product.type === 'potion') {
      state.potions = state.potions || { inventory: {} };
      state.potions.inventory = state.potions.inventory || {};
      state.potions.inventory[product.itemId] = (Number(state.potions.inventory[product.itemId]) || 0) + 1;
    } else {
      state.bag = state.bag || {};
      state.bag[product.itemId] = (Number(state.bag[product.itemId]) || 0) + 1;
      state.first = state.first || {};
      if (!state.first[product.itemId]) state.first[product.itemId] = new Date().toISOString();
    }
    shop.purchased[productId] = bought + 1;
    save();
    render();
    renderDailyShop();
    toast('購買成功：' + product.name);
  }

  function millisecondsUntilTaipeiMidnight() {
    const now = Date.now();
    const taipei = new Date(now + 8 * 60 * 60 * 1000);
    const nextMidnightUtc = Date.UTC(
      taipei.getUTCFullYear(), taipei.getUTCMonth(), taipei.getUTCDate() + 1
    ) - 8 * 60 * 60 * 1000;
    return Math.max(1000, nextMidnightUtc - now + 250);
  }

  function scheduleMidnightRefresh() {
    timerManager.setTimeout(() => {
      if (getCurrentUser() && isCloudSaveReady(getCurrentUser().id)) {
        const changed = ensureDailyStock();
        if (changed && documentRef.getElementById('page-daily-shop')?.classList.contains('active')) renderDailyShop();
      }
      scheduleMidnightRefresh();
    }, millisecondsUntilTaipeiMidnight(), 'daily-shop-midnight-refresh');
  }

  function setup() {
    documentRef.addEventListener('click', event => {
      const login = event.target.closest('[data-daily-shop-login]');
      if (login) {
        documentRef.getElementById('authOpenBtn')?.click();
        return;
      }
      const buy = event.target.closest('[data-buy-daily-item]');
      if (buy) purchase(buy.dataset.buyDailyItem);
    });
    scheduleMidnightRefresh();
  }

  return { setup, ensureDailyStock, renderDailyShop, purchase };
}
