import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createLeaderboardSystem } from '../systems/leaderboards.js';

const root = new URL('../', import.meta.url);
const readProjectFile = path => readFileSync(new URL(path, root), 'utf8');

function createElement() {
  return {
    innerHTML: '',
    querySelectorAll() { return []; }
  };
}

function createDocument() {
  const ids = ['localRank', 'rareRank', 'moneyRank', 'incomeRank', 'myRankStrip'];
  const elements = Object.fromEntries(ids.map(id => [id, createElement()]));
  const myRankValues = Array.from({ length: 4 }, () => ({ textContent: '—' }));
  elements.myRankStrip.querySelectorAll = () => myRankValues;
  return { elements, myRankValues, getElementById: id => elements[id] || null };
}

test('adds the fourth earnings rank entry without changing the existing three rankings', async () => {
  const previousDocument = globalThis.document;
  const document = createDocument();
  globalThis.document = document;
  let selectedFields = '';
  const rows = [
    { user_id: 'u1', username: '玩家甲', total_rolls: 20, unique_dice: 5, rarest_den: 2048, achievement_count: 2 },
    { user_id: 'u2', username: '玩家乙', total_rolls: 10, unique_dice: 3, rarest_den: 1024, achievement_count: 1 }
  ];
  const supabaseClient = {
    from(table) {
      assert.equal(table, 'player_profiles');
      return {
        select(fields) {
          selectedFields = fields;
          return { order() { return { limit: async () => ({ data: rows, error: null }) }; } };
        }
      };
    }
  };

  try {
    const system = createLeaderboardSystem({
      supabaseClient,
      getCurrentUser: () => ({ id: 'u1' }),
      escapeHTML: value => String(value),
      format: value => String(value),
      compactNum: value => String(value)
    });
    await system.refreshLeaderboards();

    assert.match(document.elements.localRank.innerHTML, /玩家甲/);
    assert.match(document.elements.rareRank.innerHTML, /1\/2048/);
    assert.match(document.elements.moneyRank.innerHTML, /完成 2 個成就/);
    assert.match(document.elements.myRankStrip.innerHTML, /賺錢排行榜/);
    assert.equal(document.myRankValues[3].textContent, '待後端開放');
    assert.match(document.elements.incomeRank.innerHTML, /尚未開放/);
    assert.doesNotMatch(selectedFields, /pet_income_per_second/);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('keeps the earnings leaderboard unavailable when the profile query fails', async () => {
  const previousDocument = globalThis.document;
  const document = createDocument();
  globalThis.document = document;
  const supabaseClient = {
    from() {
      return { select() { return { order() { return { limit: async () => ({ data: null, error: new Error('offline') }) }; } }; } };
    }
  };

  try {
    const system = createLeaderboardSystem({
      supabaseClient,
      getCurrentUser: () => null,
      escapeHTML: value => String(value),
      format: value => String(value),
      compactNum: value => String(value)
    });
    await system.refreshLeaderboards();
    assert.match(document.elements.incomeRank.innerHTML, /尚未開放/);
    assert.match(document.elements.myRankStrip.innerHTML, /待後端開放/);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('renames the best-dice label and keeps the four-card strip mobile-friendly', () => {
  const html = readProjectFile('index.html');
  const css = readProjectFile('style.css');
  assert.match(html, /最佳骰子 TOP 10/);
  assert.match(html, /💸 每秒賺錢 TOP 10/);
  assert.match(html, /id="incomeRank"/);
  assert.match(css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:600px\)\{\.my-rank-strip\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}\}/);
});
