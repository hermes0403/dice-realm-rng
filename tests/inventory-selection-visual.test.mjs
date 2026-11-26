import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const inventory = await readFile(new URL('../ui/inventory.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../style.css', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('出售模式明確標示逐顆選取，且取消後同步移除選取狀態', () => {
  assert.match(inventory, /tile\.classList\.toggle\('is-sell-selected',\s*selected\)/);
  assert.match(inventory, /data-sell-index="\$\{n\}"/);
  assert.match(inventory, /input\.dataset\.sellSelect\s*\+\s*':'\s*\+\s*input\.dataset\.sellIndex/);
  assert.match(inventory, /remaining\.has\(key\)/);
  assert.match(styles, /\.inventory-tile\.is-sell-selected/);
  assert.match(styles, /\.inventory-tile\.is-sell-selected::after/);
  assert.match(styles, /content:"✓"/);
});

test('主頁只將區塊標題改為自動出售，容量與說明仍保留', () => {
  assert.match(html, /<h2>自動出售<\/h2>/);
  assert.doesNotMatch(html, /<h2>背包與自動出售<\/h2>/);
  assert.match(html, /id="bagCapacity"/);
  assert.match(html, /勾選擲到後要自動出售的骰子/);
});
