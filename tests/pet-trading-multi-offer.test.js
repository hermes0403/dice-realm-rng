import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const service = readFileSync(new URL('../services/pet-trading-search.js', import.meta.url), 'utf8');
const script = readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const cloudSave = readFileSync(new URL('../services/cloud-save.js', import.meta.url), 'utf8');
import { getPendingIncomingTradeRequests } from '../services/pet-trading-search.js';
const config = readFileSync(new URL('../config.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const navigation = readFileSync(new URL('../ui/navigation.js', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const guildModule = readFileSync(new URL('../ui/guild.js', import.meta.url), 'utf8');
const petSystem = readFileSync(new URL('../systems/pets.js', import.meta.url), 'utf8');
const petSelling = readFileSync(new URL('../ui/pet-selling.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../docs/database/pet-trading-multi-offer.sql', import.meta.url), 'utf8');
const countdownMigration = readFileSync(new URL('../docs/database/pet-trading-countdown.sql', import.meta.url), 'utf8');
const expiredSessionMigration = readFileSync(new URL('../supabase/migrations/20261122000100_expire_stale_pet_trade_sessions.sql', import.meta.url), 'utf8');

test('trade room supports up to four pets per participant', () => {
  assert.match(service, /draftOffer\.length >= 4/);
  assert.match(service, /set_pet_trade_offers/);
  assert.match(service, /p_pet_uids:\s*submittedOffer/);
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

test('trade sub-view is nested inside the pet page with balanced fusion and trade wrappers', () => {
  const petsPageStart = index.indexOf('<section class="page" id="page-pets">');
  const fusionViewStart = index.indexOf('<div id="petsFusionView"', petsPageStart);
  const tradeViewStart = index.indexOf('<div id="petsTradeView"', petsPageStart);
  const tradeViewEnd = index.indexOf('</div></section>', tradeViewStart);
  const workshopPageStart = index.indexOf('<section class="page" id="page-workshop">');
  const countDivs = markup => ({
    open: (markup.match(/<div\b/g) || []).length,
    close: (markup.match(/<\/div>/g) || []).length
  });
  assert.ok(petsPageStart >= 0 && petsPageStart < fusionViewStart && fusionViewStart < tradeViewStart);
  assert.ok(tradeViewEnd > tradeViewStart && tradeViewEnd < workshopPageStart);
  assert.deepEqual(countDivs(index.slice(petsPageStart, tradeViewStart)).open,
    countDivs(index.slice(petsPageStart, tradeViewStart)).close);
  assert.deepEqual(countDivs(index.slice(tradeViewStart, tradeViewEnd + 6)).open,
    countDivs(index.slice(tradeViewStart, tradeViewEnd + 6)).close);
  assert.equal(index.slice(petsPageStart, tradeViewStart).includes('</section>'), false);
});

test('trade lobby uses a scrollable player list instead of manual username or UUID search', () => {
  assert.doesNotMatch(index, /petTradeTarget|petTradeSearchBtn|輸入玩家名稱或完整 UUID/);
  assert.match(index, /id="petTradeSearchResults"/);
  assert.match(index, /id="petTradeRefreshPlayers"/);
  assert.doesNotMatch(index, /petTradeLoadMorePlayers|載入更多玩家/);
  assert.match(service, /select\('user_id,username'\)/);
  assert.match(service, /PLAYER_LIMIT = 40/);
  assert.match(service, /range\(0, PLAYER_LIMIT - 1\)/);
  assert.doesNotMatch(service, /目前在線|最近離線|is-online|is-offline/);
  assert.doesNotMatch(index, /尋找交易對象|選擇下方玩家即可發送交易邀請/);
  assert.match(index, /玩家列表/);
  assert.match(styles, /\.pet-trade-search-results\{display:flex;flex-direction:column;[\s\S]*?max-height:144px[\s\S]*?overflow-y:auto/);
  assert.match(styles, /\.pet-trade-search-results \.pet-trade-search-result\{margin:0\}/);
  assert.match(styles, /\.pet-trade-search-result\{display:flex;flex:0 0 42px/);
});


test('trade directory automatically refreshes on primary navigation and startup', () => {
  assert.match(service, /data-page="trade"[\s\S]*?void refreshPlayers\(\);[\s\S]*?void refreshInvitations\(\);/);
  assert.match(service, /Prime the directory during startup[\s\S]*?void refreshPlayers\(\);/);
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

test('trade player directory shows three visible rows and scrolls through up to forty without a load-more button', () => {
  assert.match(service, /PLAYER_LIMIT = 40/);
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


test('expired active trade sessions are cleaned and cannot block a new invitation acceptance', () => {
  assert.match(expiredSessionMigration, /set status = 'expired'[\s\S]*?where status = 'active'[\s\S]*?expires_at <= clock_timestamp\(\)/i);
  assert.match(expiredSessionMigration, /s\.status = 'active'[\s\S]*?s\.expires_at > clock_timestamp\(\)/i);
  assert.match(service, /player_already_has_active_trade/);
  assert.match(service, /你或對方已有尚未結束的交易房間/);
});

test('active trade room exposes a working cancel action before both players confirm', () => {
  assert.match(service, /const cancel = makeSessionActionButton\(session\.id, '取消交易房間'\)/);
  assert.match(service, /actions\.append\(confirm, cancel\)/);
  assert.match(service, /cancel_pet_trade_session/);
  assert.match(service, /交易房間已取消/);
});

test('completed trade sync is marked handled only after cloud refresh succeeds', () => {
  assert.match(service, /await onTradeCompleted\(\);\s*completedSessionsHandled\.add\(syncKey\)/);
  assert.doesNotMatch(service, /completedSessionsHandled\.add\(syncKey\);\s*try\s*\{\s*await onTradeCompleted/);
});


test('trade pet offer uses one sequential plus slot, excludes already selected pets, and supports replacement', () => {
  assert.match(service, /pet-trade-add-slot/);
  assert.match(service, /for \(let index = 0; index < draftOffer\.length; index \+= 1\)/);
  assert.match(service, /if \(draftOffer\.length < 4\)/);
  assert.match(service, /selectedUids\.has\(String\(item\.uid\)\)/);
  assert.match(service, /replacePet\.addEventListener/);
  assert.match(service, /取消選擇/);
  assert.match(service, /pet-trade-replace-pet/);
});

test('trade sub-view explicitly resets inherited top spacing and page layout', () => {
  assert.match(navigation, /page-pets.*classList\.toggle\('is-trade-view', trade\)/);
  assert.match(styles, /#page-pets\.is-trade-view\{margin-block-start:0!important;padding-block-start:0!important;\}/);
  assert.match(styles, /#petsTradeView \.pet-trade-layout\{display:block!important;margin:0!important;padding:0!important;min-height:0!important;\}/);
});

test('trade offer slots support removing a selected pet before submission', () => {
  assert.match(service, /pet-trade-remove-pet/);
  assert.match(service, /removePet\.addEventListener\('click'/);
  assert.match(service, /draftOffer = draftOffer\.filter\(\(_, index\) => index !== editingSlotIndex\)/);
  assert.match(service, /offerDrafts\.set\(session\.id, \{ revision, uids: \[\.\.\.draftOffer\] \}\)/);
});

test('effective trade player directory height remains compact after cascade overrides', () => {
  assert.doesNotMatch(styles, /\.pet-trade-search-results\{[^}]*max-height:390px/);
  assert.doesNotMatch(styles, /\.pet-trade-search-results\{[^}]*max-height:330px/);
  assert.match(styles, /#petsTradeView \.pet-trade-search-results\{max-height:141px\}/);
});

test('guild module and app shell use a fresh cache version with no stale settings sync reference', () => {
  assert.doesNotMatch(guildModule + script + index, /syncPotionGiftSettingsEntry/);
  assert.match(index, /script\.js\?v=20261128-t0166-server-countdown/);
  assert.match(script, /ui\/guild\.js\?v=20261127-t0157-trade-top-gap/);
  assert.match(sw, /dice-realm-shell-v2\.56/);
  assert.match(sw, /services\/pet-trading-search\.js\?v=20261128-t0166-server-countdown/);
  assert.match(script, /pet-trading-search\.js\?v=20261128-t0166-server-countdown/);
  assert.match(sw, /ui\/guild\.js\?v=20261127-t0157-trade-top-gap/);
});

test('trade room translates rarity labels and weight units into Chinese', () => {
  assert.match(service, /legendary: '傳奇'/);
  assert.match(service, /mythic: '神話'/);
  assert.match(service, /\+ ' 公斤'/);
  assert.doesNotMatch(service, /weight\.textContent = .*\+ ' kg'/);
});

test('confirmation status updates in the existing room without replacing the room DOM', () => {
  assert.match(service, /session\.offered_pet_snapshot_a, session\.offered_pet_snapshot_b\s*\]\)/);
  assert.doesNotMatch(service, /session\.offered_pet_snapshot_a, session\.offered_pet_snapshot_b,\s*session\.confirmed_a/);
  assert.match(service, /existing\.querySelector\('\[data-trade-own-state\]'\)/);
  assert.match(service, /existing\.querySelector\('\[data-trade-other-state\]'\)/);
  assert.match(service, /confirmButton\.dataset\.draftMatchesOffer/);
});


test('refreshing trade invitations never replaces an already visible active room with a loading message', () => {
  assert.match(service, /const hasVisibleTradeRoom = \[\.\.\.host\.children\]\.some\(node => node\.classList\.contains\('pet-trade-active-room-only'\)\)/);
  assert.match(service, /if \(!hasVisibleTradeRoom\) host\.textContent = '正在讀取邀請…'/);
});


test('trade pet names and rarity labels receive the same rarity class', () => {
  assert.match(service, /const rarityClass = .*'pet-rarity-' \+ rarityKey/);
  assert.match(service, /if \(rarityClass\) name\.classList\.add\(rarityClass\)/);
  assert.match(service, /if \(rarityClass\) rarity\.classList\.add\(rarityClass\)/);
  assert.match(service, /legendary: '傳奇'/);
});

test('trade completion refreshes cloud state and redraws pet pages without a full game render', () => {
  assert.match(script, /onTradeCompleted: async \(\) => \{\s*await loadCloudSave\(\{ renderAfterLoad: false \}\);\s*renderPetsPage\(\);\s*renderPetCodex\(\);/);
  assert.match(cloudSave, /renderAfterLoad = true/);
  assert.match(cloudSave, /if \(renderAfterLoad\) render\(\)/);
});


test('pet lock mode persists a star state and locked pets cannot be sold', () => {
  assert.match(index, /id="petLockModeBtn"/);
  assert.match(petSystem, /const locked = pet\.locked === true/);
  assert.match(petSystem, /data-pet-lock-toggle=/);
  assert.match(petSystem, /pet\.locked = pet\.locked !== true/);
  assert.match(petSelling, /pets\.filter\(item => item\?\.locked !== true\)/);
  assert.match(petSelling, /latestChosen = latestPets\.filter\(item => ids\.includes\(String\(item\.uid\)\) && item\?\.locked !== true\)/);
  assert.match(styles, /\.pet-lock-star\.is-locked/);
});

test('locked pets cannot enter a trade picker or confirm an already-open offer', () => {
  assert.match(service, /item\?\.locked !== true && petById\(item\.id\)/);
  assert.match(service, /latestPet\.locked === true/);
  assert.match(service, /hasLockedOfferedPet/);
  assert.match(service, /已鎖定或不在背包中的寵物/);
});


test('trade player directory filters the already-loaded list by username without extra queries', () => {
  assert.match(index, /id="petTradePlayerSearch"[^>]*type="search"/);
  assert.match(service, /let playerSearchQuery = ''/);
  assert.match(service, /rows\.filter\(row => String\(row\?\.username \|\| ''\)\.toLocaleLowerCase\(\)\.includes\(query\)\)/);
  assert.match(service, /playerSearch\.addEventListener\('input'/);
  assert.match(service, /找不到符合的玩家/);
  assert.match(service, /renderResults\(searchResults\)/);
});

test('trade offer submission exposes progress, prevents duplicate sends, and restores safe retry', () => {
  assert.match(service, /let offerSubmitting = false/);
  assert.match(service, /if \(saveOffer\.disabled \|\| offerSubmitting\) return/);
  assert.match(service, /正在同步雲端背包/);
  assert.match(service, /正在送出交易內容/);
  assert.match(service, /ownSide\.setAttribute\('aria-busy', 'true'\)/);
  assert.match(service, /ownSide\.inert = true/);
  assert.match(service, /p_pet_uids: submittedOffer/);
  assert.match(service, /saveOffer\.disabled = false/);
  assert.match(service, /重試送出交易內容/);
  assert.match(service, /ownSide\.inert = false/);
});


test('server countdown migration adds per-side readiness, revision and expiring connection leases', () => {
  for (const column of ['ready_at_a', 'ready_at_b', 'countdown_started_at', 'countdown_revision', 'ready_lease_until_a', 'ready_lease_until_b']) {
    assert.match(countdownMigration, new RegExp('ADD COLUMN IF NOT EXISTS ' + column));
  }
  assert.match(countdownMigration, /UPDATE public\.pet_trade_sessions[\s\S]*?confirmed_a = false[\s\S]*?revision = revision \+ 1[\s\S]*?WHERE status = 'active'/);
  assert.match(countdownMigration, /CREATE OR REPLACE FUNCTION public\.set_pet_trade_ready/);
  assert.match(countdownMigration, /auth\.uid\(\)/);
  assert.match(countdownMigration, /FOR UPDATE/);
  assert.match(countdownMigration, /countdown_started_at=clock_timestamp\(\)/);
});

test('ready cancellation and offer edits invalidate the entire countdown', () => {
  const readyFn = countdownMigration.slice(
    countdownMigration.indexOf('FUNCTION public.set_pet_trade_ready'),
    countdownMigration.indexOf('FUNCTION public.heartbeat_pet_trade_ready')
  );
  const offerFn = countdownMigration.slice(
    countdownMigration.indexOf('FUNCTION public.set_pet_trade_offers'),
    countdownMigration.indexOf('FUNCTION public.cancel_pet_trade_session')
  );
  const cancelFn = countdownMigration.slice(
    countdownMigration.indexOf('FUNCTION public.cancel_pet_trade_session'),
    countdownMigration.indexOf('REVOKE ALL ON FUNCTION public.set_pet_trade_ready')
  );
  for (const fn of [readyFn, offerFn, cancelFn]) {
    assert.match(fn, /countdown_started_at\s*=\s*null/);
    assert.match(fn, /countdown_revision\s*=\s*null/);
    assert.match(fn, /ready_lease_until_a\s*=\s*null/);
    assert.match(fn, /ready_lease_until_b\s*=\s*null/);
  }
  assert.match(readyFn, /confirmed_a=CASE WHEN v_user_id=participant_a THEN false/);
  assert.match(readyFn, /confirmed_b=CASE WHEN v_user_id=participant_b THEN false/);
});

test('final exchange is blocked until the server countdown and both live leases pass', () => {
  const finalizer = countdownMigration.slice(
    countdownMigration.indexOf('FUNCTION public.finalize_pet_trade'),
    countdownMigration.indexOf('FUNCTION public.confirm_pet_trade')
  );
  assert.match(finalizer, /countdown_started_at \+ interval '3 seconds' > clock_timestamp\(\)/);
  assert.match(finalizer, /countdown_revision is distinct from v_session\.revision/);
  assert.match(finalizer, /ready_lease_until_a <= clock_timestamp\(\)/);
  assert.match(finalizer, /ready_lease_until_b <= clock_timestamp\(\)/);
  assert.match(finalizer, /trade_countdown_invalidated/);
  assert.match(finalizer, /FOR UPDATE/);
  assert.match(finalizer, /pet_sale_tombstones/);
  assert.match(finalizer, /offered_pet_no_longer_owned/);
  assert.match(finalizer, /set status = 'completed'/);
  assert.match(finalizer, /update public\.game_saves[\s\S]*?update public\.game_saves/);
  assert.match(finalizer, /already_completed/);
});

test('legacy confirmation RPC can only set ready and cannot bypass finalization', () => {
  const compat = countdownMigration.slice(
    countdownMigration.indexOf('FUNCTION public.confirm_pet_trade'),
    countdownMigration.indexOf('FUNCTION public.set_pet_trade_offers')
  );
  assert.match(compat, /RETURN public\.set_pet_trade_ready\(p_session_id,p_expected_revision,true\)/);
  assert.doesNotMatch(compat, /update public\.game_saves|set status = 'completed'/);
  assert.match(countdownMigration, /REVOKE ALL ON FUNCTION public\.finalize_pet_trade/);
  assert.match(countdownMigration, /GRANT EXECUTE ON FUNCTION public\.finalize_pet_trade\(uuid,integer\) TO authenticated/);
});

test('client runs a server-timestamp countdown, renews only during countdown, and cancels on realtime loss', () => {
  assert.match(service, /rpc\('set_pet_trade_ready'/);
  assert.match(service, /rpc\('heartbeat_pet_trade_ready'/);
  assert.match(service, /rpc\('finalize_pet_trade'/);
  assert.match(service, /startedAtMs \+ 3000/);
  assert.match(service, /setInterval\(\(\) => void heartbeat\(\), 800\)/);
  assert.match(service, /CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED/);
  assert.match(service, /連線中斷，已停止倒數/);
  assert.match(service, /sessionRealtimeSignature/);
  assert.match(service, /pet-trade-countdown/);
  assert.match(service, /cancelCountdownsWhenLeavingTrade/);
  assert.match(service, /navigationTarget\\.dataset\\.page !== 'trade'/);
  assert.match(service, /if \\(ownConfirmed\\) countdownDisconnectHandlers\\.set/);
});
