import test from 'node:test'; import assert from 'node:assert/strict'; import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8'),ui=read('../ui/guild.js'),css=read('../guild.css'),sql=read('../docs/migrations/20261127010000_guild_member_promotion.sql');
test('三種職位並將舊幹部轉為普通成員',()=>{assert.match(ui,/leader: '隊長', vice_leader: '副隊長', member: '普通成員'/);assert.match(sql,/update public\.guild_members set role='member' where role='officer'/);assert.match(sql,/update public\\.guild_members set role='member' where role='officer'/);});
test('設定分成基本設定、晉升成員、專屬外觀，公告整合於基本設定',()=>{for(const x of ['公會基本設定','公會晉升成員','公會專屬外觀','guildAnnouncementForm','activeSettingsSection === \'basic\'','activeSettingsSection === \'cosmetics\'','activeSettingsSection === \'promotion\''])assert.ok(ui.includes(x));});
test('僅隊長可見晉升入口及操作',()=>{assert.match(ui,/isLeader \? '<button type="button" class="guild-settings-menu-button" data-guild-settings-section="promotion"/);assert.match(ui,/晉升副隊長/);assert.match(ui,/撤除副隊長/);assert.match(ui,/rpc\('guild_update_member_role'/);});
test('副隊長最多兩位且資料庫強制限制',()=>{assert.match(sql,/when 'vice_leader' then 2/);assert.match(ui,/副隊長名額：/);assert.match(sql,/guild_role_limit_reached/);});
test('晉升 RPC 僅隊長可改同公會成員，不能改隊長或自己',()=>{assert.match(sql,/v_actor_role<>'leader'/);assert.match(sql,/p_user_id=v_uid/);assert.match(sql,/v_target_role='leader'/);assert.match(sql,/where guild_id=v_guild_id and user_id=p_user_id/);});
test('審核與讀取權限不再保留幹部職位',()=>{assert.doesNotMatch(sql,/officer/);assert.match(sql,/if v_role in \('leader', 'vice_leader'\) then/);});
test('手機版成員管理可用',()=>{assert.match(css,/guild-promotion-row/);assert.match(css,/@media\(max-width:520px\)[\s\S]*?guild-promotion-row/);});
