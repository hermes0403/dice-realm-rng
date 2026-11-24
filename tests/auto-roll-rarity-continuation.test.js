import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../systems/dice.js', import.meta.url), 'utf8');

test('auto-roll rarity reveal never waits for manual confirmation', () => {
  assert.match(source, /if \(autoTimer\) \{[\s\S]*?auto-rarity-reveal-cleanup[\s\S]*?return;[\s\S]*?if \(staged\)/);
});

test('auto-roll special reveal never waits for manual confirmation', () => {
  assert.match(source, /if \(autoTimer\) \{[\s\S]*?auto-small-reveal-cleanup[\s\S]*?return;[\s\S]*?await wait\(720\)/);
});

test('manual single-roll rarity reveal still supports the continue button', () => {
  assert.match(source, /await waitForRevealDismiss\(overlay\)/);
});
