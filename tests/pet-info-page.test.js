import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PET_MUTATIONS } from '../data/pets.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('navigation and page now expose pet information instead of patch notes', async () => {
  const [config, html] = await Promise.all([read('config.js'), read('index.html')]);
  assert.ok(config.includes("['updates','寵物資訊','▤']"));
  assert.match(html, /<h2>寵物資訊<\/h2>/);
  assert.doesNotMatch(html, /遊戲更新日誌|REALM PATCH NOTES|update-log-card/);
});

test('pet information page lists six estimated weight acquisition odds to five decimal places', async () => {
  const html = await read('index.html');
  const rows = [
    '1K+ kg', '0.24990%',
    '50K+ kg', '0.02323%',
    '1M+ kg', '0.00930%',
    '25M+ kg', '0.00386%',
    '200M+ kg', '0.00333%',
    '1B+ kg', '0.00090%'
  ];
  for (const value of rows) assert.ok(html.includes(value), `missing weight odds value: ${value}`);
  assert.match(html, /概略估算/);
  assert.doesNotMatch(html, /1–99 kg|3,000,001 kg 以上/);
});

test('each appearance and weather mutation has its own information panel', async () => {
  const html = await read('index.html');
  const panels = html.match(/class="pet-info-panel /g) || [];
  assert.equal(panels.length, 9);
  const entries = [
    ['none', '無變異', '×1'],
    ['golden', '黃金', '×1.2'],
    ['diamond', '鑽石', '×1.6'],
    ['rainbow', '彩虹', '×2'],
    ['rain', '雨', '+1.2'],
    ['snow', '雪', '+1.3'],
    ['thunder', '打雷', '+1.4'],
    ['crystal', '水晶', '+1.7'],
    ['hell', '地獄', '+2']
  ];
  for (const [id, label, value] of entries) {
    assert.ok(html.includes(`data-pet-info="${id}"`), `missing panel: ${id}`);
    assert.ok(html.includes(`<h4>${label}</h4>`), `missing label: ${label}`);
    assert.ok(html.includes(`<strong>${value}</strong>`), `missing value: ${value}`);
  }
});

test('weather mutation data remains consistent with the published values', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(PET_MUTATIONS).map(([key, value]) => [key, value.multiplier])),
    { rain: 1.2, snow: 1.3, thunder: 1.4, crystal: 1.7, hell: 2 }
  );
});

test('mutation panels use distinct theme colors and rainbow uses a full gradient strip', async () => {
  const css = await read('style.css');
  for (const kind of ['none', 'golden', 'diamond', 'rainbow', 'rain', 'snow', 'thunder', 'crystal', 'hell']) {
    assert.ok(css.includes(`.pet-info-panel--${kind}`), `missing panel theme: ${kind}`);
  }
  assert.match(css, /pet-info-rainbow-strip[\s\S]*?linear-gradient\(90deg/);
  assert.match(css, /pet-info-panel--crystal\{border-color:#a78bfa/);
});

test('appearance and weather mutation panels are stacked as full-width horizontal rows', async () => {
  const css = await read('style.css');
  assert.match(css, /\.pet-info-grid\{display:flex;flex-direction:column/);
  assert.match(css, /\.pet-info-panel\{position:relative;display:grid;grid-template-columns/);
});
