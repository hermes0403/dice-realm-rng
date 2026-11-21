import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const service = readFileSync(new URL('../services/pet-trading-search.js', import.meta.url), 'utf8');
import { getPendingIncomingTradeRequests } from '../services/pet-trading-search.js';
const navigation = readFileSync(new URL('../ui/navigation.js', import.meta.url), 'utf8');
const config = readFileSync(new URL('../config.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../docs/database/pet-trading-multi-offer.sql', import.meta.url), 'utf8');

test('trade room supports up to four pets per participant', () => {
  assert.match(service, /draftOffer\.length >= 4/);
  assert.match(service, /set_pet_trade_offers/);
  assert.match(service, /p_pet_uids:\s*draftOffer/);
  assert.match(index, /雙方可各提供最多 4 隻寵物/);
});

test('both sides render multi-pet offer snapshots and confirmation state', () => {
  assert.match(service, /offered_pet_uids_a/);
  assert.match(service, /offered_pet_uids_b/);
  assert.match(service, /offered_pet_snapshots_a/);
  assert.match(service, /offered_pet_snapshots_b/);
  assert.match(service, /pet-trade-offer-sides/);
  assert.match(service, /pet-trade-confirm-state/);
});

test('confirmation is bound to the exact offer revision shown by the client', () => {
  assert.match(service, /p_expected_revision:\s*revision/);
  assert.match(service, /trade_offer_changed_reload/);
  assert.match(migration, /drop function if exists public\.confirm_pet_trade\(uuid\)/);
  assert.match(migration, /confirm_pet_trade\(p_session_id uuid, p_expected_revision integer\)/);
});

test('server migration validates ownership and exchanges all selected pets atomically', () => {
  assert.match(migration, /trade_offer_limit_exceeded/);
  assert.match(migration, /pet_not_owned_or_duplicate_uid/);
  assert.match(migration, /v_pets_a := v_remaining_a \|\| v_incoming_a/);
  assert.match(migration, /v_pets_b := v_remaining_b \|\| v_incoming_b/);
  assert.match(migration, /grant execute on function public\.set_pet_trade_offers\(uuid,text\[\]\) to authenticated/i);
});

test('trade UI has wide desktop layout and stacked mobile offer panels', () => {
  assert.match(styles, /\.pet-trade-columns\{display:grid;grid-template-columns:minmax\(250px,\.72fr\) minmax\(0,1\.28fr\)/);
  assert.match(styles, /@media\(max-width:760px\)\{[\s\S]*?\.pet-trade-offer-sides\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(styles, /\.pet-trade-pet-option\.is-selected/);
});


test('Realm Exchange is a main navigation entry between fusion and workshop', () => {
  assert.match(config, /\['pets','融合機','♧'\],\['trade','交易','⇄'\],\['workshop','工坊','⚒'\]/);
  assert.match(index, /id="petsFusionView"/);
  assert.match(index, /id="petsTradeView"[^>]*hidden/);
  assert.match(navigation, /id === 'trade' \? 'pets' : id/);
  assert.match(navigation, /function setPetView\(view\)/);
  assert.match(navigation, /if \(id === 'trade'\) setPetView\('trade'\)/);
  assert.match(index, /id="petsPageTitle"/);
  assert.doesNotMatch(index, /data-pets-view|pets-page-tabs/);
});

test('trade lobby uses a scrollable player list instead of manual username or UUID search', () => {
  assert.doesNotMatch(index, /petTradeTarget|petTradeSearchBtn|輸入玩家名稱或完整 UUID/);
  assert.match(index, /id="petTradeSearchResults"/);
  assert.match(index, /id="petTradeRefreshPlayers"/);
  assert.doesNotMatch(index, /petTradeLoadMorePlayers|載入更多玩家/);
  assert.match(service, /select\('user_id,username'\)/);
  assert.match(service, /PLAYER_LIMIT = 50/);
  assert.match(service, /range\(0, PLAYER_LIMIT - 1\)/);
  assert.doesNotMatch(service, /目前在線|最近離線|is-online|is-offline/);
  assert.doesNotMatch(index, /尋找交易對象|選擇下方玩家即可發送交易邀請/);
  assert.match(index, /玩家列表/);
  assert.match(styles, /\.pet-trade-search-results\{display:flex;flex-direction:column;[\s\S]*?max-height:144px[\s\S]*?overflow-y:auto/);
  assert.match(styles, /\.pet-trade-search-results \.pet-trade-search-result\{margin:0\}/);
  assert.match(styles, /\.pet-trade-search-result\{display:flex;flex:0 0 42px/);
});


test('trade player list waits for persisted auth restoration before showing logged-out state', () => {
  assert.match(service, /async function resolveCurrentUser\(\)/);
  assert.match(service, /supabaseClient\.auth\.getSession\(\)/);
  assert.match(service, /const user = await resolveCurrentUser\(\)/);
  assert.match(service, /正在確認雲端登入狀態/);
  assert.match(service, /目前尚未登入雲端帳號/);
  assert.match(service, /range\(0, PLAYER_LIMIT - 1\)/);
});

test('mobile navigation retains the original horizontal-scroll layout', () => {
  assert.match(styles, /\.mobile-nav/);
  assert.match(styles, /overflow-x:auto/);
  assert.doesNotMatch(styles, /T-0026 mobile fix: show the complete main navigation/);
});


test('trade has exactly one entry point in main navigation and opens only its own view', () => {
  assert.match(config, /\['pets','融合機','♧'\],\['trade','交易','⇄'\],\['workshop','工坊','⚒'\]/);
  assert.doesNotMatch(index, /data-pets-view|pets-page-tabs/);
  assert.match(navigation, /function setPetView\(view\)/);
  assert.match(navigation, /if \(fusionView\) fusionView\.hidden = trade/);
  assert.match(navigation, /if \(tradeView\) tradeView\.hidden = !trade/);
  assert.match(navigation, /if \(id === 'trade'\) setPetView\('trade'\)/);
  assert.match(navigation, /else if \(id === 'pets'\) \{\s*setPetView\('fusion'\)/);
});


test('leaving the trade navigation always closes the trade sub-view', () => {
  assert.match(navigation, /else \{\s*\/\/ Leaving the pets page must always close the trade sub-view\.\s*setPetView\('fusion'\);\s*\}/);
});

test('trade pet pickers use a horizontal swipe carousel and show an explicit ready action', () => {
  assert.match(styles, /\.pet-trade-pet-picker\{[\s\S]*?flex-wrap:nowrap[\s\S]*?overflow-x:auto/);
  assert.match(styles, /\.pet-trade-pet-card\{[\s\S]*?flex:0 0 116px/);
  assert.match(service, /✓ 準備完成/);
  assert.match(service, /你已準備完成，等待對方確認/);
});


test('active trade shows only the room and hides invitation lobby history', () => {
  assert.match(service, /activeSessions = \[\.\.\.sessionsByInvitation\.values\(\)\]/);
  assert.match(service, /classList\.toggle\('is-trading', activeSessions\.length > 0\)/);
  assert.match(service, /if \(activeSessions\.length\) \{[\s\S]*?roomOnly\.append\(makeTradeRoom\(session, user\)\)[\s\S]*?return;/);
  assert.match(styles, /#petsTradeView\.is-trading \.pet-trade-player-picker[\s\S]*?display:none !important/);
  assert.match(styles, /#petsTradeView\.is-trading \.pet-trade-room-head[\s\S]*?display:none !important/);
});

test('unsubmitted selected pets have a high-contrast selection border and marker', () => {
  assert.match(service, /is-selected is-draft-selected/);
  assert.match(styles, /\.pet-trade-pet-option\.is-draft-selected\{[\s\S]*?border:2px solid #55e0cb/);
  assert.match(styles, /content:'✓ 已選取'/);
});


test('trade offer submission waits for cloud-save sync and restores the send action after errors', () => {
  assert.match(service, /const synced = await flushCloudSave\(\)/);
  assert.match(service, /pet_trade_cloud_save_not_ready/);
  assert.match(service, /pet_trade_local_inventory_changed/);
  assert.match(service, /saveOffer\.disabled = false/);
  assert.match(service, /重試送出交易內容/);
});


test('交易邀請收件匣只顯示有效且尚未回覆的收到請求', () => {
  const now = Date.parse('2026-11-21T12:00:00Z');
  const rows = [
    { id: 'incoming', sender_id: 'other', recipient_id: 'me', status: 'pending', expires_at: '2026-11-21T12:02:00Z' },
    { id: 'sent', sender_id: 'me', recipient_id: 'other', status: 'pending', expires_at: '2026-11-21T12:02:00Z' },
    { id: 'accepted', sender_id: 'other', recipient_id: 'me', status: 'accepted', expires_at: '2026-11-21T12:02:00Z' },
    { id: 'expired', sender_id: 'other', recipient_id: 'me', status: 'pending', expires_at: '2026-11-21T11:59:59Z' },
    { id: 'cancelled', sender_id: 'other', recipient_id: 'me', status: 'cancelled', expires_at: '2026-11-21T12:02:00Z' },
    { id: 'rejected', sender_id: 'other', recipient_id: 'me', status: 'rejected', expires_at: '2026-11-21T12:02:00Z' }
  ];
  assert.deepEqual(getPendingIncomingTradeRequests(rows, { id: 'me' }, now).map(row => row.id), ['incoming']);
});

test('收件匣不再渲染已接受、逾期、取消、拒絕或已送出的歷史紀錄', () => {
  const start = service.indexOf('const pendingRequests = getPendingIncomingTradeRequests(rows, user)');
  const end = service.indexOf('for (const session of completedSessionsToSync)', start);
  const inboxRender = service.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(inboxRender, /交易請求：/);
  assert.match(inboxRender, /目前沒有待處理的交易請求/);
  assert.doesNotMatch(inboxRender, /row\.status|sessionLabels|roomStatus|建立於|房間已/);
  assert.match(inboxRender, /makeActionButton\('接受'/);
  assert.match(inboxRender, /makeActionButton\('拒絕'/);
});

test('trade player directory shows three visible rows and scrolls through up to fifty without a load-more button', () => {
  assert.match(service, /PLAYER_LIMIT = 50/);
  assert.match(service, /range\(0, PLAYER_LIMIT - 1\)/);
  assert.doesNotMatch(service, /petTradeLoadMorePlayers|append = false|append: true/);
  assert.doesNotMatch(index, /petTradeLoadMorePlayers|載入更多玩家/);
  assert.match(styles, /max-height:144px/);
  assert.match(styles, /overflow-y:auto/);
  assert.match(styles, /flex:0 0 42px/);
});

test('accept action waits for session, reports progress, and exposes errors instead of silently failing', () => {
  const start = service.indexOf('function makeActionButton');
  const end = service.indexOf('function makeTradeRoom', start);
  const action = service.slice(start, end);
  assert.match(action, /event\.preventDefault\(\)/);
  assert.match(action, /await resolveCurrentUser\(\)/);
  assert.match(action, /respond_pet_trade_invitation/);
  assert.match(action, /正在接受交易邀請/);
  assert.match(action, /已接受邀請，正在開啟交易房間/);
  assert.match(service, /node\.hidden = !message/);
  assert.match(action, /交易邀請處理失敗/);
});

test('交易邀請、接受／拒絕、送出內容與確認按鈕在失敗時可重新操作', () => {
  assert.match(service, /if \(button\) button\.disabled = false/);
  assert.match(service, /button\.disabled = false;\s*button\.textContent = label;[\s\S]*?setStatus\(/);
  assert.match(service, /saveOffer\.disabled = false/);
  assert.match(service, /confirm\.disabled = false/);
});
