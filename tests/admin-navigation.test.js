import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyAdminFold, ensureFoldId, matchesAdminFold } from '../admin/navigation.js';
function fold(id, summary, content = summary) {
  return { id, textContent: content, querySelector(selector) { return selector === 'summary' ? { textContent: summary } : null; } };
}
test('管理功能依操作或玩家資料分成兩大分類', () => {
  const cases = [
    ['adminIncomeMonitorFold','全體玩家每秒賺錢監控','players'],['adminBroadcastFold','管理員訊息／全服投票','actions'],
    ['adminGrantHistoryFold','管理員發放紀錄','players'],['adminPetFusionLogsFold','全體玩家寵物合成紀錄','players'],
    ['adminPetInventoryCountsFold','全服各寵物持有數量','players'],['adminPetOddsManagementFold','寵物合成機率管理','actions'],
    ['adminNewPlayersFold','新加入的玩家','players'],['adminAchievementCountsFold','各項成就完成玩家數','players'],
    ['adminOnlineCurveFold','近 24 小時每小時造訪數','players'],['adminPotionLogsFold','藥水使用／合成紀錄','players'],
    ['adminDeletedAccountsFold','刪除帳號紀錄','players'],['adminRareRollFold','稀有擲骰紀錄','players'],
    ['adminSuspiciousRollFold','可疑擲骰模式檢查','players'],['adminClientAuditFold','反作弊／客戶端完整性','players'],
    ['adminGlobalBoostFold','全體運氣／速度加成','actions'],['adminCoinBoostFold','金錢收益倍率設定','actions'],
    ['adminWeatherControlFold','全服天氣控制','actions'],['adminPlayerWeatherFold','指定玩家天氣控制','actions'],
    ['adminWeatherHistoryFold','全服天氣紀錄','players']
  ];
  for (const [id,title,expected] of cases) assert.equal(classifyAdminFold(fold(id,title)),expected,id);
});
test('沒有既有 ID 的功能依標題分類', () => {
  assert.equal(classifyAdminFold(fold('','玩家停權／解封')),'players');
  assert.equal(classifyAdminFold(fold('','全體玩家發放')),'actions');
  assert.equal(classifyAdminFold(fold('','全體玩家發放寵物')),'actions');
  assert.equal(classifyAdminFold(fold('','最近合成紀錄')),'records');
  assert.equal(classifyAdminFold(fold('','玩家在線狀況')),'players');
});
test('搜尋同時比對標題與內容，忽略大小寫及首尾空白', () => {
  const item=fold('example','金錢收益倍率設定','指定玩家或全服限時加成');
  assert.equal(matchesAdminFold(item,'  金錢收益  '),true); assert.equal(matchesAdminFold(item,'全服限時'),true);
  assert.equal(matchesAdminFold(item,'不存在的功能'),false); assert.equal(matchesAdminFold(item,''),true);
});
test('缺少 ID 的功能會取得穩定且可辨識的 ID', () => {
  assert.equal(ensureFoldId(fold('','全體玩家發放 發放遊戲幣或藥水'),0),'adminAllGrantFold');
  assert.equal(ensureFoldId(fold('','全體玩家發放寵物'),1),'adminAllPetGrantFold');
  assert.equal(ensureFoldId(fold('','玩家停權／解封'),2),'adminPlayerBanFold');
});
test('管理員導覽不使用會強制捲動的快速捷徑', () => {
  const js=readFileSync(new URL('../admin/navigation.js',import.meta.url),'utf8');
  assert.doesNotMatch(js,/scrollIntoView/); assert.doesNotMatch(js,/admin-quick-actions/);
  assert.match(js,/let activeCategory = 'players'/); assert.match(js,/id: 'actions', label: '管理員操作／施放'/); assert.match(js,/admin-navigation-layout/);
});
test('管理員頁面的 26 個功能區塊全部可分類', () => {
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const a=html.indexOf('<section class="page" id="page-admin"'),z=html.indexOf('</section>',a),section=html.slice(a,z);
  const entries=[...section.matchAll(/<details class="admin-fold"([^>]*)>\s*<summary>(.*?)<\/summary>/gs)];
  assert.equal(entries.length,26);
  const categories=new Set(['actions','players']);
  for(const [,attrs,raw] of entries){const id=attrs.match(/id="([^"]+)"/)?.[1]||'';const title=raw.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();assert.ok(categories.has(classifyAdminFold(fold(id,title))),title);}
  assert.match(section,/id="adminActivityButton"/);
});
