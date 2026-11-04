import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const navigation = readFileSync(new URL('../ui/navigation.js', import.meta.url), 'utf8');

test('limited event entry is placed between welcome hero and stats', () => {
  const welcome = html.indexOf('WELCOME TO THE DICE REALM');
  const entry = html.indexOf('class="limited-event-entry"');
  const stats = html.indexOf('class="stats"', welcome);
  assert.ok(welcome >= 0 && entry > welcome && stats > entry);
});

test('event preview separates public coming-soon content from admin-only content', () => {
  assert.match(html, /id="eventLockedPanel"/);
  assert.match(html, /11\/6開啟 敬請期待\.\./);
  assert.match(html, /id="eventAdminPanel" hidden/);
  assert.match(navigation, /eventAdminPanel\) eventAdminPanel\.hidden = !allowed/);
  assert.match(navigation, /if \(!isAdmin\(\)\) \{ toast\('沒有管理員權限'\)/);
});

test('dragon crystal egg odds are the requested 100 percent table', () => {
  const expected = [
    ['晶銅獸', '45%'], ['鏡冰靈', '30%'], ['晶龍哨兵', '15.6%'],
    ['異核雙子龍', '8.5%'], ['月光龍', '1.5%'], ['鯊皇', '0.4%']
  ];
  for (const [pet, chance] of expected) {
    assert.ok(html.includes(pet), pet);
    assert.ok(html.includes(chance), chance);
  }
  assert.equal([45, 30, 15.6, 8.5, 1.5, 0.4].reduce((a, b) => a + b, 0), 100);
});
