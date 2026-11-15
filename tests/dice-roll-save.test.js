import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const diceSource = await readFile(new URL('../systems/dice.js', import.meta.url), 'utf8');
const cloudSource = await readFile(new URL('../services/cloud-save.js', import.meta.url), 'utf8');

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
  const announcement = diceSource.indexOf('broadcastRareRoll(dice)', result);
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
