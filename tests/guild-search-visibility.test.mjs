import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../docs/migrations/20261126123600_guild_search_members_can_browse.sql', import.meta.url), 'utf8');
const foundation = await readFile(new URL('../docs/migrations/20261124221835_guild_foundation.sql', import.meta.url), 'utf8');
const ui = await readFile(new URL('../ui/guild.js', import.meta.url), 'utf8');

test('已加入公會的玩家仍可搜尋公開公會，但不能加入第二個公會', () => {
  assert.match(migration, /v_uid\s+uuid\s*:=\s*auth\.uid\(\)/i);
  assert.match(migration, /if\s+v_uid\s+is\s+null[\s\S]*?authentication_required/i);
  assert.match(migration, /where\s+g\.is_public/i);
  assert.doesNotMatch(migration, /if\s+exists\s*\(\s*select\s+1\s+from\s+public\.guild_members\s+where\s+user_id\s*=\s*v_uid\s*\)\s+then\s+return\s+'\[\]'/i);
  assert.match(foundation, /if\s+exists\s*\(select\s+1\s+from\s+public\.guild_members\s+where\s+user_id\s*=\s*v_uid\)\s+then\s+raise\s+exception\s+'already_in_guild'/i);
});

test('尋找公會以 modal 呈現，已有公會時點擊加入會在前端阻擋 RPC', () => {
  assert.match(ui, /function renderFindOverlay\(\)/);
  assert.match(ui, /data-guild-find-overlay/);
  assert.match(ui, /data-guild-find-close/);
  assert.match(ui, /findOpen\s*=\s*true/);
  const apply = ui.slice(ui.indexOf("if (button.dataset.guildApply)"), ui.indexOf("if (button.dataset.guildReview)"));
  assert.match(apply, /if\s*\(currentData\?\.guild\)/);
  assert.ok(apply.indexOf("if (currentData?.guild)") < apply.indexOf("rpc('guild_apply'"));
  const results = ui.slice(ui.indexOf('function renderFindResultsMarkup'), ui.indexOf('function renderFindOverlay'));
  assert.match(results, /data-guild-apply/);
  assert.doesNotMatch(results, /disabled/);
});
