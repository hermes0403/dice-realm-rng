import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateBoardDirectory } from '../scripts/validate-board.mjs';

function makeBoard(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dice-board-'));
  const board = path.join(root, 'board');
  fs.mkdirSync(path.join(board, 'archive'), { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return board;
}

function taskFile({ id, status = 'open', from = 'barry', to = 'any', owner = '', reviewer = '', doneBy = '', doneAt = '', body = '' }) {
  const slug = id.toLowerCase();
  return `---
id: ${id}
title: Test ${id}
status: ${status}
from: ${from}
to: ${to}
owner: ${owner}
contributors: []
reviewer: ${reviewer}
priority: P2
created: 2026-11-07
updated: 2026-11-07
depends_on: []
branch:
done_by: ${doneBy}
done_at: ${doneAt}
---

## 任務

測試任務。

${body}`;
}

function writeTask(board, id, content) {
  fs.writeFileSync(path.join(board, `${id}-test.md`), content, 'utf8');
}

function createValidCommunicatePair(board, status = 'returned') {
  const communicateId = 'T-0002';
  const lock = '- 2026-11-07 19:00 [barry] [COMMUNICATE_LOCK] task=T-0002 actor=barry at=2026-11-07 19:00';
  const unlock = '- 2026-11-07 19:10 [barry] [COMMUNICATE_UNLOCK] task=T-0002 actor=barry at=2026-11-07 19:10';
  const originalBody = `## 紀錄\n\n${lock}${status === 'done' ? `\n${unlock}` : ''}\n`;
  writeTask(board, 'T-0001', taskFile({ id: 'T-0001', status: 'in_progress', body: originalBody }));
  const delegation = [
    '## 委派資訊',
    '- 關聯原任務：T-0001',
    '- 原需求方：barry',
    '- 接收方：叉子',
    ''
  ].join('\n');
  writeTask(board, communicateId, taskFile({
    id: communicateId,
    status,
    from: 'barry',
    to: '叉子',
    owner: '叉子',
    reviewer: 'barry',
    doneBy: status === 'done' ? 'barry' : '',
    doneAt: status === 'done' ? '2026-11-07' : '',
    body: delegation
  }));
}

test('ordinary task files pass without using the returned state', t => {
  const board = makeBoard(t);
  writeTask(board, 'T-0001', taskFile({ id: 'T-0001' }));
  const result = validateBoardDirectory(board);
  assert.deepEqual(result.errors, []);
  assert.equal(result.tasks.length, 1);
});

test('an empty delegation section copied from the template remains an ordinary task', t => {
  const board = makeBoard(t);
  const emptyDelegation = [
    '## 委派資訊',
    '- 關聯原任務：',
    '- 原需求方：',
    '- 接收方：',
    ''
  ].join('\n');
  writeTask(board, 'T-0001', taskFile({ id: 'T-0001', body: emptyDelegation }));
  const result = validateBoardDirectory(board);
  assert.deepEqual(result.errors, []);
});

test('returned is accepted only for a communicate task with a matching active lock', t => {
  const board = makeBoard(t);
  createValidCommunicatePair(board, 'returned');
  const result = validateBoardDirectory(board);
  assert.deepEqual(result.errors, []);
});

test('a communicate task cannot be marked done before the original task is unlocked', t => {
  const board = makeBoard(t);
  createValidCommunicatePair(board, 'done');
  const result = validateBoardDirectory(board);
  assert.deepEqual(result.errors, []);
});

test('returned is rejected for an ordinary task', t => {
  const board = makeBoard(t);
  writeTask(board, 'T-0001', taskFile({ id: 'T-0001', status: 'returned' }));
  const result = validateBoardDirectory(board);
  assert.ok(result.errors.some(error => error.includes('returned is only valid for communicate tasks')));
});

test('a communicate task is rejected when the original task lock is missing', t => {
  const board = makeBoard(t);
  const delegation = [
    '## 委派資訊',
    '- 關聯原任務：T-0001',
    '- 原需求方：barry',
    '- 接收方：叉子',
    ''
  ].join('\n');
  writeTask(board, 'T-0001', taskFile({ id: 'T-0001', status: 'in_progress' }));
  writeTask(board, 'T-0002', taskFile({ id: 'T-0002', status: 'returned', from: 'barry', to: '叉子', owner: '叉子', reviewer: 'barry', body: delegation }));
  const result = validateBoardDirectory(board);
  assert.ok(result.errors.some(error => error.includes('has no matching COMMUNICATE_LOCK record')));
});

test('a communicate task must match the original requester, recipient and reviewer', t => {
  const board = makeBoard(t);
  createValidCommunicatePair(board, 'returned');
  const communicatePath = path.join(board, 'T-0002-test.md');
  const source = fs.readFileSync(communicatePath, 'utf8').replace('- 接收方：叉子', '- 接收方：棒子');
  fs.writeFileSync(communicatePath, source, 'utf8');
  const result = validateBoardDirectory(board);
  assert.ok(result.errors.some(error => error.includes('to must match 委派資訊的接收方')));
});

test('communicate lock record author and delegated actor must match', t => {
  const board = makeBoard(t);
  createValidCommunicatePair(board, 'returned');
  const originalPath = path.join(board, 'T-0001-test.md');
  const source = fs.readFileSync(originalPath, 'utf8').replace('actor=barry at=', 'actor=叉子 at=');
  fs.writeFileSync(originalPath, source, 'utf8');
  const result = validateBoardDirectory(board);
  assert.ok(result.errors.some(error => error.includes('lock actor does not belong to the original task')));
  assert.ok(result.errors.some(error => error.includes('lock record role prefix must match actor')));
});

test('the receiving permission group may create the communicate task for the original requester', t => {
  const board = makeBoard(t);
  const lock = '- 2026-11-07 19:00 [barry] [COMMUNICATE_LOCK] task=T-0002 actor=barry at=2026-11-07 19:00';
  writeTask(board, 'T-0001', taskFile({ id: 'T-0001', status: 'in_progress', body: `## 紀錄\n\n${lock}\n` }));
  const delegation = [
    '## 委派資訊',
    '- 關聯原任務：T-0001',
    '- 原需求方：barry',
    '- 接收方：棒子',
    ''
  ].join('\n');
  writeTask(board, 'T-0002', taskFile({
    id: 'T-0002', status: 'in_progress', from: '叉子', to: '棒子', owner: '棒子', reviewer: 'barry', body: delegation
  }));
  const result = validateBoardDirectory(board);
  assert.deepEqual(result.errors, []);
});
