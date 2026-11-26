import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const ui = read('../ui/guild.js');
const css = read('../guild.css');
const migration = read('../docs/migrations/20261125213600_guild_announcements.sql');

test('公會公告資料表啟用 RLS 並禁止客戶端直接寫入', () => {
  assert.match(migration, /create table if not exists public\.guild_announcements/);
  assert.match(migration, /alter table public\.guild_announcements enable row level security/);
  assert.match(migration, /revoke all on table public\.guild_announcements from public, anon, authenticated/);
  assert.match(migration, /guild_announcements_message_length check \(char_length\(message\) <= 200\)/);
});

test('公會資料 RPC 一併回傳公告、發布者與更新時間', () => {
  assert.match(migration, /create or replace function private\.guild_get_my_guild\(\)/);
  assert.match(migration, /'announcement', \([\s\S]*?'message', a\.message[\s\S]*?'updated_at', a\.updated_at[\s\S]*?'updated_by', coalesce\(pp\.username, '未知玩家'\)/);
  assert.match(migration, /left join public\.player_profiles pp on pp\.user_id = a\.updated_by/);
});

test('公告寫入 RPC 僅允許會長與副會長，並在伺服器限制 200 字', () => {
  assert.match(migration, /create or replace function private\.guild_update_announcement\(p_message text\)/);
  assert.match(migration, /security definer\s+set search_path to ''/);
  assert.match(migration, /gm\.role in \('leader', 'vice_leader'\)/);
  assert.match(migration, /guild_announcement_permission_denied/);
  assert.match(migration, /char_length\(v_message\) > 200/);
  assert.match(migration, /if v_message = '' then[\s\S]*?delete from public\.guild_announcements/);
  assert.match(migration, /revoke all on function private\.guild_update_announcement\(text\) from public, anon, authenticated/);
});

test('公告公開 RPC 只授權 authenticated 使用', () => {
  assert.match(migration, /create or replace function public\.guild_update_announcement\(p_message text\)/);
  assert.match(migration, /revoke all on function public\.guild_update_announcement\(text\) from public, anon/);
  assert.match(migration, /grant execute on function public\.guild_update_announcement\(text\) to authenticated/);
});

test('公會郵箱彈窗顯示公告並安全跳脫文字，主頁不再重複顯示', () => {
  assert.match(ui, /function renderMailboxOverlay\(\)/);
  assert.match(ui, /data-guild-mailbox-overlay/);
  assert.match(ui, /GUILD ANNOUNCEMENT/);
  assert.match(ui, /escapeHTML\(announcementMessage\)/);
  assert.match(ui, /escapeHTML\(announcement\.updated_by \|\| '未知玩家'\)/);
  assert.match(ui, /目前沒有公告/);
  const home = ui.slice(ui.indexOf('function renderHome()'), ui.indexOf('function render()'));
  assert.doesNotMatch(home, /guild-announcement-panel/);
  assert.match(home, /renderMailboxOverlay\(\)/);
});

test('設定頁只有會長與副會長可編輯公告', () => {
  assert.match(ui, /const canEditAnnouncement = \['leader', 'vice_leader'\]\.includes\(role\)/);
  assert.match(ui, /id="guildAnnouncementForm"/);
  assert.match(ui, /maxlength="200"/);
  assert.match(ui, /只有會長與副會長可發布、修改或清除公告/);
  assert.match(ui, /只有會長與副會長可以修改公會公告/);
  assert.match(ui, /rpc\('guild_update_announcement'/);
  assert.match(ui, /await load\(\);\s*toast\('公會公告已更新'\)/);
});

test('公告沿用公會資料載入，不增加獨立讀取、輪詢或 Realtime', () => {
  assert.match(ui, /rpc\('guild_get_my_guild'\)/);
  assert.doesNotMatch(ui, /rpc\('guild_get_announcement'/);
  assert.doesNotMatch(ui, /setInterval\s*\(/);
  assert.doesNotMatch(ui, /\.channel\s*\(/);
});

test('公告面板支援換行與手機版寬度', () => {
  assert.match(css, /guild-announcement-panel/);
  assert.match(css, /white-space:pre-wrap/);
  assert.match(css, /overflow-wrap:anywhere/);
  assert.match(css, /guild-announcement-settings/);
});


test('一般成員隱藏公告管理面板，但郵箱公告仍對所有成員顯示', () => {
  assert.match(ui, /const announcementPanel = isOrdinaryMember \? ''/);
  const mailbox = ui.slice(ui.indexOf('function renderMailboxOverlay()'), ui.indexOf('function renderRanking(rows)'));
  assert.match(mailbox, /guild-mailbox-announcement/);
  assert.match(mailbox, /escapeHTML\(announcementMessage\)/);
  assert.match(ui, /data-guild-mailbox-close/);
  assert.match(ui, /event\.key === 'Escape' && (mailboxOpen || findOpen)/);
});
