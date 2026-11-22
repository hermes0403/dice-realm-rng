import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const diceSource = await readFile(new URL('../systems/dice.js', import.meta.url), 'utf8');
const cloudSource = await readFile(new URL('../services/cloud-save.js', import.meta.url), 'utf8');
const styleSource = await readFile(new URL('../style.css', import.meta.url), 'utf8');

test('roll counter is saved immediately through the shared save service', () => {
  const increment = diceSource.indexOf('state.rolls = Math.max(0, Number(state.rolls) || 0) + 1;');
  const saveAfterIncrement = diceSource.indexOf('save();', increment);
  const nextStatement = diceSource.indexOf('const face =', increment);
  assert.notEqual(increment, -1, 'roll counter increment exists');
  assert.ok(saveAfterIncrement > increment && saveAfterIncrement < nextStatement,
    'shared save() runs immediately after increment and before animation setup');
  assert.ok(!diceSource.slice(increment, nextStatement).includes('localStorage.setItem'),
    'roll counter does not bypass scoped save handling');
});

test('completed roll result is saved before async announcement and reveal work', () => {
  const result = diceSource.indexOf("documentRef.getElementById('resultSub').textContent =");
  const resultSave = diceSource.indexOf('save();', result);
  const announcement = diceSource.indexOf('broadcastRareRoll(dice,', result);
  assert.notEqual(result, -1, 'result UI update exists');
  assert.ok(resultSave > result && resultSave < announcement,
    'completed inventory/counter state is saved before async announcement');
});

test('cloud bootstrap only merges same-tab mutations made after the request began', () => {
  const request = cloudSource.indexOf("await supabaseClient.from('game_saves')");
  const localMutationCheck = cloudSource.indexOf('const localChangedDuringLoad = localSaveAfterCloud !== localSaveAtLoadStart', request);
  const writerCheck = cloudSource.indexOf('latestLocalSnapshot?._cloudWriterId === localWriterId', localMutationCheck);
  const temporaryBase = cloudSource.indexOf('(sameTabMutationDuringLoad ? localSaveBeforeCloud : null)', writerCheck);
  const merge = cloudSource.indexOf('mergeCloudSavePayload(basePayload, localSnapshotForMerge, cloudPayload)', temporaryBase);
  assert.notEqual(request, -1, 'cloud save request exists');
  assert.ok(localMutationCheck > request, 'local mutation is checked after the cloud request');
  assert.ok(writerCheck > localMutationCheck, 'only this tab’s own save is treated as an in-flight mutation');
  assert.ok(temporaryBase > writerCheck, 'the pre-request local snapshot is used as a temporary common base');
  assert.ok(merge > temporaryBase, 'only the in-flight local delta is merged into cloud state');
  assert.ok(!cloudSource.includes('localIsNewerThanCloud'),
    'the old whole-snapshot timestamp/roll-count heuristic is removed');
});

test('rare dice reveal uses five distinct cinematic tiers and preserves the 1/4096 moment', () => {
  assert.match(diceSource, /den === 4096 \? 'comet'/, '1/4096 uses its own comet reveal');
  assert.match(diceSource, /den < 100000 \? 'rare'/, '10,000–99,999 uses the rare tier');
  assert.match(diceSource, /den < 1000000 \? 'anomaly'/, '100,000–999,999 uses the anomaly tier');
  assert.match(diceSource, /den < 10000000 \? 'mythic'/, '1,000,000–9,999,999 uses the mythic tier');
  assert.match(diceSource, /: 'cosmic';/, '10,000,000+ uses the cosmic tier');
  assert.match(diceSource, /tier === 'comet' \? 720 : 750/, 'comet reveal has a staged entrance');
  assert.match(diceSource, /tier === 'anomaly' \? 2600/, 'anomaly keeps its long reveal');
  assert.match(diceSource, /tier === 'mythic' \? 3400/, 'mythic keeps its long reveal');
  assert.match(diceSource, /tier === 'cosmic' \? 4200/, 'cosmic keeps its longest reveal');
  assert.match(diceSource, /else if \(dice\.den === 4096\) await playRarityReveal\(dice\)/,
    '1/4096 no longer uses the compact 720ms Halloween reveal');
});

test('all reveal tiers have unique visual treatment and reduced-motion fallback', () => {
  for (const tier of ['comet', 'rare', 'anomaly', 'mythic', 'cosmic']) {
    assert.ok(styleSource.includes('.rarity-overlay.tier-' + tier), tier + ' visual theme exists');
  }
  assert.ok(styleSource.includes('.rarity-overlay.glitch-reveal'), 'glitch dice keep their dedicated visual identity');
  assert.ok(styleSource.includes('prefers-reduced-motion:reduce'), 'reduced-motion fallback remains available');
  assert.ok(styleSource.includes('@keyframes cosmicArrival'), 'cosmic tier has a dedicated arrival sequence');
});

test('rare reveal sound is generated locally without network or database requests', () => {
  assert.ok(diceSource.includes('function playRevealSound(tier, glitch = false)'), 'local sound generator exists');
  assert.ok(diceSource.includes('new AudioContextClass()'), 'sound uses browser audio only');
  assert.ok(!diceSource.includes('fetch('), 'reveal sound does not fetch external audio');
});
