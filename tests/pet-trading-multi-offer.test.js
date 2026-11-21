import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const service = readFileSync(new URL('../services/pet-trading-search.js', import.meta.url), 'utf8');
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


test('Realm Exchange is opened from its own tab beside the fusion machine', () => {
  assert.match(index, /data-pets-view="fusion"/);
  assert.match(index, /data-pets-view="trade"/);
  assert.match(index, /id="petsFusionView"/);
  assert.match(index, /id="petsTradeView"[^>]*hidden/);
  assert.match(service, /petsFusionView/);
  assert.match(service, /petsTradeView/);
});

test('trade lobby uses a scrollable player list instead of manual username or UUID search', () => {
  assert.doesNotMatch(index, /petTradeTarget|petTradeSearchBtn|輸入玩家名稱或完整 UUID/);
  assert.match(index, /id="petTradeSearchResults"/);
  assert.match(index, /id="petTradeRefreshPlayers"/);
  assert.match(index, /id="petTradeLoadMorePlayers"/);
  assert.match(service, /select\('user_id,username'\)/);
  assert.match(service, /PLAYER_PAGE_SIZE = 50/);
  assert.match(service, /目前在線/);
  assert.match(styles, /\.pet-trade-search-results\{display:flex;flex-direction:column;[\s\S]*?overflow-y:auto/);
});
