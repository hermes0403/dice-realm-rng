import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../docs/migrations/20261127071700_guild_leader_potion_gifting.sql');
const guild = read('../ui/guild.js');
const cloud = read('../services/cloud-save.js');
const script = read('../script.js');
const index = read('../index.html');
const sw = read('../sw.js');
const css = read('../guild.css');
const equipment = read('../data/equipment.js');

test('gift mail is private, indexed and has a bounded potion allowlist', () => {
  assert.match(migration, /create table public\.guild_potion_gift_mail/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.guild_potion_gift_mail from public, anon, authenticated/);
  assert.match(migration, /unique \(sender_id, request_id, recipient_id\)/);
  for (const id of ['luck1','luck2','luck3','speed1','speed2','money1','money2','angel1','angel2']) assert.ok(migration.includes("'" + id + "'"));
});

test('mail potion labels stay aligned with the game potion definitions', () => {
  const allowed = new Set(['luck1','luck2','luck3','speed1','speed2','money1','money2','angel1','angel2']);
  const definitions = [...equipment.matchAll(/id:'([^']+)',name:'([^']+)'/g)]
    .filter(match => allowed.has(match[1]));
  assert.equal(definitions.length, allowed.size);
  for (const [, id, name] of definitions) assert.ok(migration.includes("when '" + id + "' then '" + name + "'"), id);
});

test('sending requires leader role, guild recipients and an atomic locked inventory deduction', () => {
  assert.match(migration, /guild_potion_gift_leader_only/);
  assert.match(migration, /guild_potion_gift_recipient_not_member/);
  assert.match(migration, /from public\.game_saves where user_id = v_uid for update/);
  assert.match(migration, /v_balance < v_total/);
  assert.match(migration, /update public\.game_saves[\s\S]*?set save_data = v_save_data, updated_at = clock_timestamp\(\)/);
  assert.match(migration, /with inserted as \([\s\S]*?insert into public\.guild_potion_gift_mail/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(v_uid::text \|\| ':' \|\| p_request_id::text, 0\)\)/);
  assert.match(migration, /guild_potion_gift_request_conflict/);
  assert.match(migration, /already_sent/);
});

test('claim is recipient-only, locked and one-time, including after leaving the guild', () => {
  assert.match(migration, /where id = p_gift_id and recipient_id = v_uid[\s\S]*?for update/);
  assert.match(migration, /guild_potion_gift_already_claimed/);
  assert.match(migration, /from public\.game_saves where user_id = v_uid for update/);
  assert.doesNotMatch(migration, /guild_potion_gift_membership_required/);
});

test('mailbox combines ordinary guild messages and claimable potion gifts', () => {
  assert.match(migration, /'guild_reward'::text as mail_type/);
  assert.match(migration, /'potion_gift'::text as mail_type/);
  assert.match(migration, /你的會長贈予你/);
  assert.match(migration, /guild_potion_gift_mail where recipient_id = v_uid and claimed_at is null/);
});

test('only leaders see gifting; mail remains available to recipients without a current guild', () => {
  assert.match(guild, /data-guild-potion-gift-open/);
  assert.match(guild, /currentData\?\.my_role !== 'leader'/);
  assert.match(guild, /rpc\('guild_send_potion_gift'/);
  assert.match(guild, /rpc\('guild_claim_potion_gift'/);
  assert.match(guild, /data-guild-potion-gift-claim/);
  assert.match(guild, /你的會長贈予你/);
  assert.match(guild, /flushCloudSave\(\)/);
  assert.match(guild, /adoptServerPotions\(/);
  assert.match(guild, /ensurePotionGiftRequestId\(\)/);
  assert.match(guild, /diceRealmGuildPotionGiftRequest:/);
  assert.match(css, /\.guild-potion-gift-overlay/);
  assert.match(css, /@media\(max-width:520px\)[\s\S]*?guild-potion-gift-recipient-list/);
});

test('server potion changes are adopted into the versioned cloud save baseline', () => {
  assert.match(cloud, /function adoptServerPotions\(inventory, updatedAt\)/);
  assert.match(cloud, /nextPayload\.potions\.inventory = clonePayload\(inventory\)/);
  assert.match(cloud, /cloudSaveVersion = updatedAt/);
  assert.match(cloud, /return \{[\s\S]*adoptServerBag, adoptServerPotions/);
  assert.match(script, /adoptServerPotions:\(inventory,updatedAt\)/);
});

test('leader gift entry is inside Guild Settings and only visible to the guild leader', () => {
  assert.ok(!index.includes('guildLeaderGiftSetting'));
  assert.ok(!index.includes('data-guild-potion-gift-open'));
  assert.ok(guild.includes('(isLeader ? \'<button type="button" class="guild-settings-menu-button" data-guild-potion-gift-open><b>會長發放</b>'));
  assert.ok(guild.includes("button.matches('[data-guild-potion-gift-open]')"));
  assert.ok(guild.includes('renderPotionGiftOverlay(); return;'));
  assert.ok(guild.includes("currentData?.my_role !== 'leader'"));
  assert.ok(!guild.includes('guild-potion-gift-panel'));
});
test('PWA assets and service worker cache keys stay synchronized after the Guild Settings move', () => {
  assert.ok(index.includes('guild.css?v=20261127-t0157-trade-top-gap'));
  assert.ok(index.includes('script.js?v=20261127-t0157-trade-top-gap'));
  assert.ok(sw.includes('dice-realm-shell-v2.47'));
  assert.ok(sw.includes('script.js?v=20261127-t0157-trade-top-gap'));
  assert.ok(sw.includes('ui/guild.js?v=20261127-t0157-trade-top-gap'));
  assert.ok(sw.includes('services/cloud-save.js?v=20261127-t0156-guild-potion-gifting'));
  assert.ok(sw.includes('guild.css?v=20261127-t0157-trade-top-gap'));
});
