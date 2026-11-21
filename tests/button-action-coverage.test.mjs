import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('主要遊戲按鈕都有實際點擊事件或明確的委派事件', async () => {
  const [script, dice, inventory, pets, selling, trade, weather, account, onboarding, codex, display, equipment, potions, admin, polls, weekly] = await Promise.all([
    read('script.js'), read('systems/dice.js'), read('ui/inventory.js'), read('systems/pets.js'),
    read('ui/pet-selling.js'), read('services/pet-trading-search.js'), read('systems/weather.js'),
    read('services/account-actions.js'), read('ui/onboarding.js'), read('ui/codex.js'),
    read('ui/display-controls.js'), read('ui/equipment.js'), read('ui/potions.js'),
    read('admin/ui-bindings.js'), read('systems/realm-polls.js'), read('systems/weekly-realm-event.js')
  ]);

  const checks = [
    ['背包升級', script, /getElementById\('upgradeBagBtn'\)\.onclick=/],
    ['主頁擲骰與登入', script, /getElementById\('rollBtn'\)\.onclick=doRoll[\s\S]*?getElementById\('authOpenBtn'\)\.onclick=openAuth/],
    ['自動擲骰與停止', dice, /getElementById\('autoBtn'\)\.onclick[\s\S]*?getElementById\('stopBtn'\)\.onclick/],
    ['背包鎖定與出售', inventory, /getElementById\('lockDiceModeBtn'\)\.addEventListener\('click'[\s\S]*?getElementById\('sellSelectedDiceBtn'\)\.addEventListener\('click'/],
    ['寵物融合', pets, /getElementById\('petDiceCraftBtn'\)\?\.addEventListener\('click'/],
    ['寵物自動裝備', pets, /getElementById\('petAutoEquipBestBtn'\)\?\.addEventListener\('click'/],
    ['寵物出售與自動出售設定', selling, /target\.closest\('#petSellBtn'\)[\s\S]*?target\.closest\('#petAutoSellBtn'\)/],
    ['交易邀請與收件匣刷新', trade, /refreshPlayersButton\.addEventListener\('click'/],
    ['交易載入更多玩家', trade, /loadMorePlayersButton\.addEventListener\('click'/],
    ['交易發送邀請', trade, /invite\.addEventListener\('click', sendInvitation\)/],
    ['交易接受／拒絕', trade, /makeActionButton\('接受'[\s\S]*?makeActionButton\('拒絕'/],
    ['交易送出內容與準備確認', trade, /saveOffer\.addEventListener\('click'[\s\S]*?confirm\.addEventListener\('click'/],
    ['天氣召喚、骰子投入與自動投入', weather, /closest\('\[data-weather-deposit\]'\)[\s\S]*?closest\('#summonWeatherBtn'\)[\s\S]*?closest\('#autoDepositWeatherBtn'\)/],
    ['玩家名稱、登出與刪除帳號', account, /bindInitialButton\('saveName'[\s\S]*?bindInitialButton\('resetBtn'[\s\S]*?bindInitialButton\('profileLogoutBtn'/],
    ['教學導覽', onboarding, /onboardingPrevious[\s\S]*?onboardingNext[\s\S]*?replayTutorialBtn/],
    ['圖鑑分類', codex, /closest\('\[data-codex-category\]'\)/],
    ['全螢幕', display, /addEventListener\('click', toggleFullscreen\)/],
    ['手套與藥水 UI 初始化', equipment, /setupGloveUI\(\)[\s\S]*?setupPotionUI\(\)/],
    ['藥水合成、使用與自動添加', potions, /closest\('\[data-craft-potion\]'\)[\s\S]*?closest\('\[data-use-potion\]'\)[\s\S]*?closest\('\[data-toggle-auto-add\]'\)/],
    ['管理員主要操作', admin, /adminRefreshBtn[\s\S]*?adminSingleGrantBtn[\s\S]*?adminGrantBtn[\s\S]*?adminCoinBoostApply/],
    ['全服公告與投票', polls, /adminBroadcastSendBtn[\s\S]*?adminPollStartBtn[\s\S]*?realmPollButtons/],
    ['每週獎勵通知關閉', weekly, /data-weekly-reward-close/]
  ];
  for (const [label, source, pattern] of checks) assert.match(source, pattern, label + ' 缺少事件綁定');
});

test('交易按鈕在網路或伺服器失敗後會恢復可操作狀態', async () => {
  const trade = await read('services/pet-trading-search.js');
  assert.match(trade, /if \(button\) button\.disabled = false/);
  assert.match(trade, /button\.disabled = false;\s*setStatus\('邀請狀態更新失敗/);
  assert.match(trade, /saveOffer\.disabled = false/);
  assert.match(trade, /confirm\.disabled = false/);
  assert.match(trade, /saveOffer\.textContent = '重試送出交易內容/);
});
