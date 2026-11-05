import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyAdminFold, ensureFoldId, matchesAdminFold } from '../admin/navigation.js';

function fold(id, summary, content = summary) {
  return {
    id,
    textContent: content,
    querySelector(selector) {
      return selector === 'summary' ? { textContent: summary } : null;
    }
  };
}

test('既有管理功能會分配到正確分類', () => {
  const cases = [
    ['adminIncomeMonitorFold', 'economy'],
    ['adminBroadcastFold', 'weather'],
    ['adminGrantHistoryFold', 'economy'],
    ['adminPetFusionLogsFold', 'pets'],
    ['adminPetInventoryCountsFold', 'pets'],
    ['adminPetOddsManagementFold', 'pets'],
    ['adminNewPlayersFold', 'players'],
    ['adminAchievementCountsFold', 'monitoring'],
    ['adminOnlineCurveFold', 'monitoring'],
    ['adminPotionLogsFold', 'security'],
    ['adminDeletedAccountsFold', 'security'],
    ['adminRareRollFold', 'security'],
    ['adminSuspiciousRollFold', 'security'],
    ['adminClientAuditFold', 'security'],
    ['adminGlobalBoostFold', 'economy'],
    ['adminCoinBoostFold', 'economy'],
    ['adminWeatherControlFold', 'weather'],
    ['adminPlayerWeatherFold', 'weather'],
    ['adminWeatherHistoryFold', 'security']
  ];
  for (const [id, expected] of cases) {
    assert.equal(classifyAdminFold(fold(id, '測試功能')), expected, id);
  }
});

test('沒有既有 ID 的功能也能依標題分類', () => {
  assert.equal(classifyAdminFold(fold('', '玩家停權／解封')), 'players');
  assert.equal(classifyAdminFold(fold('', '全體玩家發放')), 'economy');
  assert.equal(classifyAdminFold(fold('', '全體玩家發放寵物')), 'pets');
  assert.equal(classifyAdminFold(fold('', '最近合成紀錄')), 'security');
});

test('功能搜尋同時比對標題與內容，並忽略大小寫及首尾空白', () => {
  const item = fold('example', '金錢收益倍率設定', '指定玩家或全服限時加成');
  assert.equal(matchesAdminFold(item, '  金錢收益  '), true);
  assert.equal(matchesAdminFold(item, '全服限時'), true);
  assert.equal(matchesAdminFold(item, '不存在的功能'), false);
  assert.equal(matchesAdminFold(item, ''), true);
});

test('管理員面板載入導覽模組，且既有事件 ID 均保留', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /admin\/navigation\.js/);
  const ids = [
    'adminRefreshBtn', 'adminIncomeMonitorFold', 'adminBroadcastFold',
    'adminGrantHistoryFold', 'adminPetFusionLogsFold', 'adminPetInventoryCountsFold',
    'adminPetOddsManagementFold', 'adminNewPlayersFold', 'adminAchievementCountsFold',
    'adminOnlineCurveFold', 'adminPotionLogsFold', 'adminDeletedAccountsFold',
    'adminRareRollFold', 'adminSuspiciousRollFold', 'adminGlobalBoostFold',
    'adminCoinBoostFold', 'adminWeatherControlFold', 'adminPlayerWeatherFold',
    'adminWeatherHistoryFold', 'adminSetWeatherBtn', 'adminSetPlayerWeatherBtn',
    'adminGrantBtn', 'adminSingleGrantBtn', 'adminDeletePlayerBtn'
  ];
  for (const id of ids) assert.ok(html.includes(`id="${id}"`), `missing existing id: ${id}`);
});

test('快速操作目標有穩定 ID，避免搬動區塊後失效', () => {
  const grant = fold('', '全體玩家發放 發放遊戲幣或藥水');
  const petGrant = fold('', '全體玩家發放寵物');
  assert.equal(ensureFoldId(grant, 0), 'adminAllGrantFold');
  assert.equal(ensureFoldId(petGrant, 1), 'adminAllPetGrantFold');
});

test('管理員頁面的 26 個既有功能區塊全部可分類', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const section = html.match(/<section class="page" id="page-admin"[\s\S]*?<\/section>/)?.[0] || '';
  const entries = [...section.matchAll(/<details class="admin-fold"([^>]*)>\s*<summary>([\s\S]*?)<\/summary>/g)];
  assert.equal(entries.length, 26);
  const categories = new Set(['players', 'economy', 'pets', 'weather', 'monitoring', 'security']);
  for (const [, attributes, rawSummary] of entries) {
    const id = attributes.match(/id="([^"]+)"/)?.[1] || '';
    const summary = rawSummary.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    assert.ok(categories.has(classifyAdminFold(fold(id, summary))), summary);
  }
});
