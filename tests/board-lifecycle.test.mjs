import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseTaskIndex, splitMarkdownTableRow, validateBoardDirectory } from '../scripts/validate-board.mjs';

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

function validateTestBoard(board) {
  return validateBoardDirectory(board, { checkIndex: false });
}

function writeIndex(board, rows, newline = '\n') {
  const source = [
    '# Board',
    '',
    '## 14. 目前任務索引',
    '',
    '| ID | 任務 | 狀態 | 依賴 |',
    '|---|---|---|---|',
    ...rows.map(row => `| ${row.id} | ${row.title || '測試任務'} | ${row.status || 'open'} | ${row.dependencies || '—'} |`),
    '',
    '索引以外的說明文字。'
  ].join(newline);
  fs.writeFileSync(path.join(board, 'README.md'), source, 'utf8');
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
  const result = validateTestBoard(board);
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
  const result = validateTestBoard(board);
  assert.deepEqual(result.errors, []);
});

test('returned is accepted only for a communicate task with a matching active lock', t => {
  const board = makeBoard(t);
  createValidCommunicatePair(board, 'returned');
  const result = validateTestBoard(board);
  assert.deepEqual(result.errors, []);
});

test('a communicate task cannot be marked done before the original task is unlocked', t => {
  const board = makeBoard(t);
  createValidCommunicatePair(board, 'done');
  const result = validateTestBoard(board);
  assert.deepEqual(result.errors, []);
});

test('returned is rejected for an ordinary task', t => {
  const board = makeBoard(t);
  writeTask(board, 'T-0001', taskFile({ id: 'T-0001', status: 'returned' }));
  const result = validateTestBoard(board);
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
  const result = validateTestBoard(board);
  assert.ok(result.errors.some(error => error.includes('has no matching COMMUNICATE_LOCK record')));
});

test('a communicate task must match the original requester, recipient and reviewer', t => {
  const board = makeBoard(t);
  createValidCommunicatePair(board, 'returned');
  const communicatePath = path.join(board, 'T-0002-test.md');
  const source = fs.readFileSync(communicatePath, 'utf8').replace('- 接收方：叉子', '- 接收方：棒子');
  fs.writeFileSync(communicatePath, source, 'utf8');
  const result = validateTestBoard(board);
  assert.ok(result.errors.some(error => error.includes('to must match 委派資訊的接收方')));
});

test('communicate lock record author and delegated actor must match', t => {
  const board = makeBoard(t);
  createValidCommunicatePair(board, 'returned');
  const originalPath = path.join(board, 'T-0001-test.md');
  const source = fs.readFileSync(originalPath, 'utf8').replace('actor=barry at=', 'actor=叉子 at=');
  fs.writeFileSync(originalPath, source, 'utf8');
  const result = validateTestBoard(board);
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
  const result = validateTestBoard(board);
  assert.deepEqual(result.errors, []);
});

test('an escaped pipe in a task title remains inside its Markdown table cell', () => {
  assert.deepEqual(
    splitMarkdownTableRow(String.raw`| T-0001 | A\|B | open | — |`),
    ['T-0001', 'A|B', 'open', '—']
  );
});

test('a pipe preceded by two backslashes remains a column delimiter', () => {
  assert.deepEqual(
    splitMarkdownTableRow(String.raw`| T-0001 | A\\ | open | — |`),
    ['T-0001', 'A\\\\', 'open', '—']
  );
});

test('task index parser accepts LF and CRLF and locates the section by its title', t => {
  const board = makeBoard(t);
  const rows = [{ id: 'T-0001', title: '測試', status: 'open' }];
  writeIndex(board, rows, '\n');
  assert.equal(parseTaskIndex(path.join(board, 'README.md')).rows[0].id, 'T-0001');
  writeIndex(board, rows, '\r\n');
  const source = fs.readFileSync(path.join(board, 'README.md'), 'utf8').replace('## 14. 目前任務索引', '## 99. 目前任務索引');
  fs.writeFileSync(path.join(board, 'README.md'), source, 'utf8');
  assert.equal(parseTaskIndex(path.join(board, 'README.md')).rows[0].status, 'open');
});

test('task index status mismatch is a validation error', t => {
  const board = makeBoard(t);
  writeTask(board, 'T-0001', taskFile({ id: 'T-0001', status: 'in_progress' }));
  writeIndex(board, [{ id: 'T-0001', status: 'open' }]);
  const result = validateBoardDirectory(board);
  assert.ok(result.errors.some(error => error.includes('task index status open does not match task file status in_progress')));
});

test('task index IDs must be in ascending order', t => {
  const board = makeBoard(t);
  writeIndex(board, [{ id: 'T-0002' }, { id: 'T-0001' }]);
  const result = validateBoardDirectory(board);
  assert.ok(result.errors.some(error => error.includes('not in ascending order')));
});

test('a blank row inside the task index table is rejected', t => {
  const board = makeBoard(t);
  const source = [
    '## 14. 目前任務索引', '',
    '| ID | 任務 | 狀態 | 依賴 |', '|---|---|---|---|',
    '| T-0001 | A | open | — |', '', '| T-0002 | B | open | — |', ''
  ].join('\n');
  fs.writeFileSync(path.join(board, 'README.md'), source, 'utf8');
  const result = validateBoardDirectory(board);
  assert.ok(result.errors.some(error => error.includes('blank row inside task index table')));
});

test('duplicate task index IDs are rejected', t => {
  const board = makeBoard(t);
  writeIndex(board, [{ id: 'T-0001' }, { id: 'T-0001' }]);
  const result = validateBoardDirectory(board);
  assert.ok(result.errors.some(error => error.includes('duplicate task index ID T-0001')));
});

test('duplicate task file IDs remain rejected across distinct filenames', t => {
  const board = makeBoard(t);
  fs.writeFileSync(path.join(board, 'T-0001-first.md'), taskFile({ id: 'T-0001' }), 'utf8');
  fs.writeFileSync(path.join(board, 'T-0001-second.md'), taskFile({ id: 'T-0001' }), 'utf8');
  const result = validateTestBoard(board);
  assert.ok(result.errors.some(error => error.includes('duplicate task id T-0001')));
});

test('missing task IDs are reported as compressed warning ranges only', t => {
  const board = makeBoard(t);
  writeIndex(board, [{ id: 'T-0001' }, { id: 'T-0004' }]);
  const result = validateBoardDirectory(board);
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.includes('task index ID gap: T-0002～T-0003（2 個）'));
});

test('index-only and task-file-only IDs warn without blocking, including archive files', t => {
  const board = makeBoard(t);
  writeTask(board, 'T-0001', taskFile({ id: 'T-0001', status: 'open' }));
  fs.writeFileSync(path.join(board, 'archive', 'T-0002-archived.md'), taskFile({ id: 'T-0002', status: 'done' }), 'utf8');
  writeTask(board, 'T-0003', taskFile({ id: 'T-0003', status: 'open' }));
  writeIndex(board, [{ id: 'T-0001', status: 'open' }, { id: 'T-0002', status: 'done' }, { id: 'T-0004', status: 'open' }]);
  const result = validateBoardDirectory(board);
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some(warning => warning.includes('task index T-0004 has no matching task file')));
  assert.ok(result.warnings.some(warning => warning.includes('task file T-0003 is missing from task index')));
  assert.ok(!result.warnings.some(warning => warning.includes('T-0002')));
});

test('task index requires a valid header and separator row', t => {
  const board = makeBoard(t);
  fs.writeFileSync(path.join(board, 'README.md'), [
    '## 14. 目前任務索引', '', '| 任務 | ID | 狀態 | 依賴 |', '|---|---|---|---|',
    '| A | T-0001 | open | — |'
  ].join('\n'), 'utf8');
  const result = validateBoardDirectory(board);
  assert.ok(result.errors.some(error => error.includes('task index header must be')));
});

test('task index rejects a missing separator row', t => {
  const board = makeBoard(t);
  fs.writeFileSync(path.join(board, 'README.md'), [
    '## 14. 目前任務索引', '', '| ID | 任務 | 狀態 | 依賴 |',
    '| T-0001 | A | open | — |'
  ].join('\n'), 'utf8');
  const result = validateBoardDirectory(board);
  assert.ok(result.errors.some(error => error.includes('separator row is missing or malformed')));
});

test('README is mandatory by default but test boards may explicitly disable index validation', t => {
  const board = makeBoard(t);
  writeTask(board, 'T-0001', taskFile({ id: 'T-0001' }));
  const required = validateBoardDirectory(board);
  assert.ok(required.errors.some(error => error.includes('required Board README is missing')));
  const testOnly = validateBoardDirectory(board, { checkIndex: false });
  assert.deepEqual(testOnly.errors, []);
});
