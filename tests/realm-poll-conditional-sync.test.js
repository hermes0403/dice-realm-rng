const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../systems/realm-polls.js'), 'utf8');

test('公告只使用 60 秒補查，投票閒置時不啟動輪詢', () => {
  assert.match(source, /setInterval\(realmRefreshAnnouncement, 60000, 'realm-announcement-sync'\)/);
  assert.doesNotMatch(source, /setInterval\(realmPollTick,\s*1500/);
  assert.match(source, /setInterval\(realmRefreshPoll, 5000, 'realm-poll-sync'\)/);
  assert.match(source, /function realmSetPollSync\(active\)/);
  assert.match(source, /if \(!realmPollSyncTimer\) realmPollSyncTimer = timerManager\.setInterval\(realmRefreshPoll, 5000/);
  assert.match(source, /else if \(realmPollSyncTimer\)/);
});

test('投票生命週期與玩家投票結果透過 Broadcast 同步', () => {
  for (const event of ['admin_message', 'poll_started', 'poll_ended', 'poll_vote']) {
    assert.match(source, new RegExp("event: '" + event + "'"));
  }
  assert.match(source, /sendSocialBroadcast\('poll_started'/);
  assert.match(source, /sendSocialBroadcast\('poll_ended'/);
  assert.match(source, /sendSocialBroadcast\('poll_vote'/);
});

test('投票倒數每秒更新，且重新連線會立即同步', () => {
  assert.match(source, /realm-poll-countdown'\)/);
  assert.match(source, /}, 1000, 'realm-poll-countdown'\)/);
  assert.match(source, /\.subscribe\(status => \{\s*if \(status === 'SUBSCRIBED'\) realmPollTick\(\);/);
});
