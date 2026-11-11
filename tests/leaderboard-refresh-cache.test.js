import test from 'node:test';
import assert from 'node:assert/strict';
import { createLeaderboardSystem } from '../systems/leaderboards.js';

function installLeaderboardDom() {
  const previousDocument = globalThis.document;
  const elements = new Map(['localRank', 'rareRank', 'moneyRank', 'incomeRank'].map(id => [id, { innerHTML: '' }]));
  globalThis.document = {
    getElementById(id) { return elements.get(id) || null; }
  };
  return {
    elements,
    restore() {
      if (previousDocument === undefined) delete globalThis.document;
      else globalThis.document = previousDocument;
    }
  };
}

function createSystem({ now = () => 1000, isCloudSyncBlocked = () => false, markCloudSyncBlocked = () => false, rpcError = null } = {}) {
  let queries = 0;
  const supabaseClient = {
    from(table) {
      assert.equal(table, 'player_profiles');
      queries++;
      return {
        select() { return this; },
        order() { return this; },
        async limit() {
          return {
            data: [{ user_id: 'user-1', username: 'Player', total_rolls: 10, unique_dice: 2, rarest_den: 100, achievement_count: 1 }],
            error: rpcError
          };
        }
      };
    }
  };
  const system = createLeaderboardSystem({
    supabaseClient,
    getCurrentUser: () => ({ id: 'user-1' }),
    escapeHTML: value => String(value),
    format: value => String(value),
    compactNum: value => String(value),
    isCloudSyncBlocked,
    markCloudSyncBlocked,
    now
  });
  return { system, get queries() { return queries; } };
}

test('concurrent leaderboard refreshes share one request and cache for 60 seconds', async () => {
  const dom = installLeaderboardDom();
  let now = 1000;
  const fixture = createSystem({ now: () => now });
  try {
    const first = fixture.system.refreshLeaderboards();
    const second = fixture.system.refreshLeaderboards();
    await Promise.all([first, second]);
    assert.equal(fixture.queries, 1);

    await fixture.system.refreshLeaderboards();
    assert.equal(fixture.queries, 1, 'opening the leaderboard again within 60 seconds should use cache');

    now += 60001;
    await fixture.system.refreshLeaderboards();
    assert.equal(fixture.queries, 2, 'the cache should expire after 60 seconds');
  } finally {
    dom.restore();
  }
});

test('explicit force refresh bypasses leaderboard cache', async () => {
  const dom = installLeaderboardDom();
  const fixture = createSystem();
  try {
    await fixture.system.refreshLeaderboards();
    await fixture.system.refreshLeaderboards({ force: true });
    assert.equal(fixture.queries, 2);
  } finally {
    dom.restore();
  }
});

test('blocked leaderboard refresh does not query Supabase', async () => {
  const dom = installLeaderboardDom();
  const fixture = createSystem({ isCloudSyncBlocked: () => true });
  try {
    assert.equal(await fixture.system.refreshLeaderboards(), false);
    assert.equal(fixture.queries, 0);
    assert.match(dom.elements.get('localRank').innerHTML, /雲端服務受限/);
  } finally {
    dom.restore();
  }
});
