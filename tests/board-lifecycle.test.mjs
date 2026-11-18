import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseRecordAuthor, parseTaskIndex, recordTimestampIssue, splitMarkdownTableRow, validateBoardDirectory
} from '../scripts/validate-board.mjs';

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

function writeDoneTask(board, { id = 'T-0001', from = 'barry', doneBy = 'barry', section = '紀錄', record, newline = '\n' } = {}) {
  const body = [`## ${section}`, '', record, ''].join(newline);
  const content = taskFile({
    id, status: 'done', from, doneBy, doneAt: '2026-11-11', body
  }).replace(/\r?\n/g, newline);
  writeTask(board, id, content);
}

test('a valid human proxy acceptance in an approved section satisfies Check 2', t => {
  const board = makeBoard(t);
  writeDoneTask(board, {
    record: '- 2026-11-11 10:30 [代記:barry/老查] 驗收通過。來源：Barry 明確同意結案。證據：PR #1 已合併。'
  });
  const result = validateTestBoard(board);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test('Check 2 accepts the explicit 驗收 section but not 完工回報', t => {
  const board = makeBoard(t);
  const accepted = '- 2026-11-11 10:30 [棒子] 驗收通過。來源：棒子明確同意。證據：PR #1。';
  writeDoneTask(board, { from: '棒子', doneBy: '棒子', section: '驗收', record: accepted });
  assert.deepEqual(validateTestBoard(board).warnings, []);

  writeDoneTask(board, { id: 'T-0002', from: '棒子', doneBy: '棒子', section: '完工回報', record: accepted });
  const result = validateTestBoard(board);
  assert.ok(result.warnings.some(warning => warning.includes('T-0002-test.md [檢查 2]')));
});

test('Check 2 requires human authority from the task from-side and matching done_by', t => {
  const board = makeBoard(t);
  writeDoneTask(board, {
    from: '棒子', doneBy: '棒子',
    record: '- 2026-11-11 10:30 [barry] 驗收通過。來源：Barry 指示。證據：PR #1。'
  });
  const result = validateTestBoard(board);
  assert.ok(result.warnings.some(warning => warning.includes('T-0001-test.md [檢查 2]')));
});

test('GPT-only and UNKNOWN_SIDE labels cannot qualify as human acceptance', t => {
  for (const label of ['叉子', '棒子明確驗收／叉子代記']) {
    const board = fs.mkdtempSync(path.join(os.tmpdir(), 'dice-board-case-'));
    const archive = path.join(board, 'archive');
    fs.mkdirSync(archive, { recursive: true });
    const cleanup = () => fs.rmSync(board, { recursive: true, force: true });
    try {
      writeDoneTask(board, {
        from: '棒子', doneBy: '棒子',
        record: `- 2026-11-11 10:30 [${label}] 驗收通過。來源：人類決定。證據：PR #1。`
      });
      const result = validateTestBoard(board);
      assert.ok(result.warnings.some(warning => warning.includes('T-0001-test.md [檢查 2]')));
      if (label.includes('／')) {
        assert.ok(result.warnings.some(warning => warning.includes('UNKNOWN_SIDE')));
      }
    } finally {
      cleanup();
    }
  }
});

test('done_by must be the human decision-maker, and impact notifications are not acceptance', t => {
  const board = makeBoard(t);
  writeDoneTask(board, {
    from: '棒子', doneBy: '叉子',
    record: '- 2026-11-11 10:30 [棒子] 驗收通過。來源：棒子明確同意。證據：PR #1。'
  });
  writeDoneTask(board, {
    id: 'T-0002', from: '棒子', doneBy: '棒子',
    record: '- 2026-11-11 10:30 [impact][棒子] 驗收通過。來源：棒子明確同意。證據：PR #1。'
  });
  const result = validateTestBoard(board);
  assert.ok(result.warnings.some(warning => warning.includes('T-0001-test.md [檢查 2]')));
  assert.ok(result.warnings.some(warning => warning.includes('T-0002-test.md [檢查 2]')));
});

test('Check 2 requires 來源 and 證據 in the same record', t => {
  const board = makeBoard(t);
  writeDoneTask(board, {
    record: [
      '- 2026-11-11 10:30 [代記:barry/老查] 驗收通過。來源：Barry 明確同意。',
      '- 2026-11-11 10:31 [老查] 證據：PR #1 已合併。'
    ].join('\n')
  });
  assert.ok(validateTestBoard(board).warnings.some(warning => warning.includes('[檢查 2]')));
});

test('Check 2 rejects an empty 來源 or 證據 field', t => {
  for (const record of [
    '- 2026-11-11 10:30 [barry] 驗收通過。來源： 證據：PR #1。',
    '- 2026-11-11 10:30 [barry] 驗收通過。來源：Barry 明確同意。證據：'
  ]) {
    const board = fs.mkdtempSync(path.join(os.tmpdir(), 'dice-board-empty-evidence-'));
    fs.mkdirSync(path.join(board, 'archive'), { recursive: true });
    try {
      writeDoneTask(board, { record });
      assert.ok(validateTestBoard(board).warnings.some(warning => warning.includes('[檢查 2]')));
    } finally {
      fs.rmSync(board, { recursive: true, force: true });
    }
  }
});

test('Check 2 rejects empty child-bullet 來源 and 證據 values but accepts both populated', t => {
  const cases = [
    {
      record: '- 2026-11-11 10:30 [barry] 驗收通過。\n  - 來源：\n  - 證據：PR #1。',
      expected: '缺來源'
    },
    {
      record: '- 2026-11-11 10:30 [barry] 驗收通過。\n  - 來源：Barry 明確同意。\n  - 證據：',
      expected: '缺證據'
    }
  ];
  for (const { record } of cases) {
    const board = fs.mkdtempSync(path.join(os.tmpdir(), 'dice-board-child-empty-'));
    fs.mkdirSync(path.join(board, 'archive'), { recursive: true });
    try {
      writeDoneTask(board, { record });
      assert.ok(validateTestBoard(board).warnings.some(warning => warning.includes('[檢查 2]')));
    } finally {
      fs.rmSync(board, { recursive: true, force: true });
    }
  }

  const board = makeBoard(t);
  writeDoneTask(board, {
    record: '- 2026-11-11 10:30 [barry] 驗收通過。\n  - 來源：Barry 明確同意。\n  - 證據：PR #1。'
  });
  assert.deepEqual(validateTestBoard(board).warnings, []);
});

test('Check 2 excludes negated acceptance decisions', t => {
  for (const phrase of [
    '驗收未通過', '驗收：待棒子確認', '驗收不通過', '驗收失敗', '驗收被退回',
    '尚未驗收通過', '不是驗收通過', '無法驗收通過', '拒絕驗收通過',
    '未驗收完成', '等待驗收完成', '不得視為驗收通過'
  ]) {
    const board = fs.mkdtempSync(path.join(os.tmpdir(), 'dice-board-negated-acceptance-'));
    fs.mkdirSync(path.join(board, 'archive'), { recursive: true });
    try {
      writeDoneTask(board, {
        record: `- 2026-11-11 10:30 [barry] ${phrase}。來源：Barry 說明。證據：PR #1。`
      });
      assert.ok(validateTestBoard(board).warnings.some(warning => warning.includes('[檢查 2]')), phrase);
    } finally {
      fs.rmSync(board, { recursive: true, force: true });
    }
  }
});

test('Check 2 rejects mixed positive and negated decisions, and ignores 來源/證據 text', t => {
  const cases = [
    {
      record: '- 2026-11-17 17:29 [barry] 驗收失敗，待修復後再驗收。來源：人類決定。證據：PR #1。',
      accepted: false
    },
    {
      record: '- 2026-11-17 17:29 [barry] 驗收未通過。來源：人類決定。證據：PR #1。請重新驗收',
      accepted: false
    },
    {
      record: '- 2026-11-17 17:29 [barry] 驗收通過。來源：Barry 的待驗收通知。證據：PR #1。',
      accepted: true
    },
    {
      record: '- 2026-11-17 17:29 [barry] 驗收通過。來源：棒子說「還沒驗收的部分已經好了」。證據：PR #1。',
      accepted: true
    },
    {
      record: [
        '- 2026-11-17 17:29 [barry] 驗收通過。',
        '  - 來源：棒子說「還沒驗收的部分已經好了」。',
        '  - 證據：PR #1。'
      ].join('\n'),
      accepted: true
    }
  ];
  for (const [index, item] of cases.entries()) {
    const board = makeBoard(t);
    writeDoneTask(board, { record: item.record });
    const result = validateTestBoard(board);
    const hasCheck2Warning = result.warnings.some(warning => warning.includes('[檢查 2]'));
    assert.equal(!hasCheck2Warning, item.accepted, `case ${index + 1}: ${item.record}`);
  }
});

test('Check 2 requires an affirmative outcome near 驗收, not merely a request or pending status', t => {
  const cases = [
    { decision: '請 barry 驗收', accepted: false },
    { decision: '已提交驗收，等候結果', accepted: false },
    { decision: '驗收中', accepted: false },
    { decision: '驗收通過', accepted: true },
    { decision: '驗收：棒子明確確認本任務已完成並同意結案', accepted: true },
    { decision: '驗收：已完成', accepted: true }
  ];
  for (const [index, item] of cases.entries()) {
    const board = makeBoard(t);
    writeDoneTask(board, {
      record: `- 2026-11-17 17:29 [barry] ${item.decision}。來源：人類決定。證據：PR #1。`
    });
    const result = validateTestBoard(board);
    const hasCheck2Warning = result.warnings.some(warning => warning.includes('[檢查 2]'));
    assert.equal(!hasCheck2Warning, item.accepted, `case ${index + 1}: ${item.decision}`);
  }
});

test('Check 2 accepts the real-format proxy record for owner-side from=叉子 and done_by=棒子', t => {
  const board = makeBoard(t);
  writeDoneTask(board, {
    from: '叉子', doneBy: '棒子',
    record: '- 2026-11-17 17:29 [代記:棒子/叉子] 驗收：棒子明確確認本任務已完成並同意結案。來源：棒子於 2026-11-17 對話表示「以上都好了」。證據：PR #145 merge commit 1019d12bceb4ca5ac1ca36018bd61e019aec1ec9。'
  });
  const result = validateTestBoard(board);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test('Check 2 diagnostics report the first failed condition with actual values and file line', t => {
  const cases = [
    {
      id: 'T-0001', from: 'barry', doneBy: 'barry',
      record: '- 2026-11-17 17:29 [barry] 驗收未通過。來源：人類決定。證據：PR #1。',
      expected: 'no positive acceptance decision; actual record="- 2026-11-17 17:29 [barry] 驗收未通過。來源：人類決定。證據：PR #1。"'
    },
    {
      id: 'T-0002', from: '棒子', doneBy: '棒子',
      record: '- 2026-11-17 17:29 [barry] 驗收：已完成。來源：人類決定。證據：PR #1。',
      expected: 'acceptance human=barry side=collaborator_side does not match from=棒子 side=owner_side'
    },
    {
      id: 'T-0003', from: '棒子', doneBy: '叉子',
      record: '- 2026-11-17 17:29 [棒子] 驗收：已完成。來源：人類決定。證據：PR #1。',
      expected: 'done_by=叉子 does not match acceptance human 棒子'
    },
    {
      id: 'T-0004', from: 'barry', doneBy: 'barry',
      record: '- 2026-11-17 17:29 [barry] 驗收：已完成。來源： 證據：PR #1。',
      expected: '來源=(missing/empty)'
    },
    {
      id: 'T-0005', from: 'barry', doneBy: 'barry',
      record: '- 2026-11-17 17:29 [barry] 驗收：已完成。來源：人類決定。證據：',
      expected: '證據=(missing/empty)'
    }
  ];
  const board = makeBoard(t);
  for (const item of cases) writeDoneTask(board, item);
  const result = validateTestBoard(board);
  for (const item of cases) {
    const warning = result.warnings.find(value => value.startsWith(`${item.id}-test.md [檢查 2]`));
    assert.ok(warning, `missing diagnostic for ${item.id}`);
    assert.match(warning, /line \d+:/);
    assert.ok(warning.includes(item.expected), warning);
  }
});

test('Check 2 diagnostic line number includes the complete frontmatter offset', t => {
  const board = makeBoard(t);
  const record = '- 2026-11-17 17:29 [barry] 驗收未通過。來源：人類決定。證據：PR #1。';
  writeDoneTask(board, { record });
  const filePath = path.join(board, 'T-0001-test.md');
  const physicalLines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const expectedLine = physicalLines.findIndex(line => line === record) + 1;
  const result = validateTestBoard(board);
  const warning = result.warnings.find(value => value.startsWith('T-0001-test.md [檢查 2]'));
  assert.ok(warning, 'missing Check 2 diagnostic');
  assert.ok(warning.includes(`line ${expectedLine}:`), `expected physical line ${expectedLine}, got: ${warning}`);
});

test('Check 2 reports no allowed-section record, or the GPT-only author label when present', t => {
  const board = makeBoard(t);
  writeDoneTask(board, { id: 'T-0001', section: '進度紀錄', record: '- 2026-11-17 17:29 [叉子] 實作完成。' });
  writeDoneTask(board, { id: 'T-0002', record: '- 2026-11-17 17:29 [叉子] 實作完成。' });
  const result = validateTestBoard(board);
  assert.ok(result.warnings.some(value => value.includes('T-0001-test.md [檢查 2] no acceptance record found in an allowed section')));
  assert.ok(result.warnings.some(value => value.includes('T-0002-test.md [檢查 2]') && value.includes('author label=叉子')));
});

test('record author labels must immediately follow the date and optional time', () => {
  assert.equal(parseRecordAuthor('- 2026-11-11 10:30 [barry] 驗收通過').label, 'barry');
  assert.equal(parseRecordAuthor('- 2026-11-14 16:xx [叉子] malformed timestamp').side, 'owner_side');
  assert.equal(parseRecordAuthor('- 2026-11-11 10:30 驗收通過 [T-0019]').side, 'UNKNOWN_SIDE');
});

test('UNKNOWN_SIDE warnings are collected even after an earlier valid acceptance', t => {
  const board = makeBoard(t);
  writeDoneTask(board, {
    record: [
      '- 2026-11-11 10:30 [barry] 驗收通過。來源：Barry 明確同意。證據：PR #1。',
      '- 2026-11-11 10:31 [not-a-role] 補充紀錄。'
    ].join('\n')
  });
  const result = validateTestBoard(board);
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some(warning => warning.includes('UNKNOWN_SIDE label=not-a-role')));
});

test('a pending or generic mention of 驗收 is not an acceptance decision', t => {
  const board = makeBoard(t);
  writeDoneTask(board, {
    record: '- 2026-11-11 10:30 [barry] 等待驗收。來源：Barry 的待驗收通知。證據：PR #1。'
  });
  assert.ok(validateTestBoard(board).warnings.some(warning => warning.includes('[檢查 2]')));
});

test('Check 2 ignores tasks completed before the effective date', t => {
  const board = makeBoard(t);
  writeTask(board, 'T-0001', taskFile({ id: 'T-0001', status: 'done', doneBy: 'barry', doneAt: '2026-11-10' }));
  assert.deepEqual(validateTestBoard(board).warnings, []);
});

test('Check 2 recognizes an ISO timestamp in done_at when applying the effective date', t => {
  const board = makeBoard(t);
  const content = taskFile({ id: 'T-0001', status: 'done', doneBy: 'barry', doneAt: '2026-11-11T10:00:00+08:00' });
  writeTask(board, 'T-0001', content);
  const result = validateTestBoard(board);
  assert.ok(result.warnings.some(warning => warning.includes('[檢查 2]')));
});

test('recordChecks defaults to warnings and error mode promotes record violations', t => {
  const board = makeBoard(t);
  writeDoneTask(board, { record: '- 2026-11-11 [老查] 已完成。' });
  const warningResult = validateTestBoard(board);
  assert.deepEqual(warningResult.errors, []);
  assert.ok(warningResult.warnings.some(warning => warning.includes('[檢查 2]')));

  const errorResult = validateBoardDirectory(board, { checkIndex: false, recordChecks: 'error' });
  assert.ok(errorResult.errors.some(error => error.includes('[檢查 2]')));
});

test('recordChecks supports M2 side-specific severities for later PR-diff validation', t => {
  const board = makeBoard(t);
  writeDoneTask(board, { from: '棒子', doneBy: '棒子', record: '- 2026-11-11 [叉子] 已完成。' });
  writeTask(board, 'T-0002', taskFile({
    id: 'T-0002', from: 'barry', body: '## 紀錄\n\n- 2026-11-11 [老查] collaborator-side record\n'
  }));
  const result = validateBoardDirectory(board, {
    checkIndex: false,
    recordChecks: { check2: 'error', check3: { owner_side: 'warning', collaborator_side: 'error' } }
  });
  assert.ok(result.warnings.some(warning => warning.includes('[檢查 3]') && warning.includes('owner_side')));
  assert.ok(result.errors.some(error => error.includes('[檢查 2]')));
  assert.ok(result.errors.some(error => error.includes('[檢查 3]') && error.includes('collaborator_side')));
});

test('side-specific record checks block Barry violations and warn for Owner violations', t => {
  const board = makeBoard(t);
  writeDoneTask(board, {
    id: 'T-0001', from: 'barry', doneBy: 'barry',
    record: '- 2026-11-11 [老查] implementation completed'
  });
  writeDoneTask(board, {
    id: 'T-0002', from: '棒子', doneBy: '棒子',
    record: '- 2026-11-11 [叉子] implementation completed'
  });
  writeTask(board, 'T-0003', taskFile({
    id: 'T-0003', from: 'barry', body: '## 紀錄\n\n- 2026-11-11 [老查] missing time\n'
  }));
  writeTask(board, 'T-0004', taskFile({
    id: 'T-0004', from: '棒子', body: '## 紀錄\n\n- 2026-11-11 [叉子] missing time\n'
  }));

  const result = validateBoardDirectory(board, {
    checkIndex: false,
    recordChecks: {
      check2: { owner_side: 'warning', collaborator_side: 'error' },
      check3: { owner_side: 'warning', collaborator_side: 'error' }
    }
  });

  assert.ok(result.errors.some(error => error.includes('T-0001-test.md [檢查 2]')));
  assert.ok(result.errors.some(error => error.includes('T-0003:') && error.includes('[檢查 3]')));
  assert.ok(result.warnings.some(warning => warning.includes('T-0002-test.md [檢查 2]')));
  assert.ok(result.warnings.some(warning => warning.includes('T-0004:') && warning.includes('[檢查 3]')));
});

test('timestamp validation accepts HH:MM and HH:MM:SS and rejects invalid ranges and dates', () => {
  const record = line => ({ lines: [{ text: line }] });
  assert.equal(recordTimestampIssue(record('- 2026-11-11 19:36 [barry] update')), null);
  assert.equal(recordTimestampIssue(record('- 2026-11-11 19:36:00 [barry] update')), null);
  assert.match(recordTimestampIssue(record('- 2026-11-11 [barry] update')), /missing time/);
  assert.match(recordTimestampIssue(record('- 2026-11-11 16:xx [叉子] update')), /malformed time/);
  assert.match(recordTimestampIssue(record('- 2026-11-11 24:00 [叉子] update')), /out-of-range/);
  assert.match(recordTimestampIssue(record('- 2026-11-11 19:60 [叉子] update')), /out-of-range/);
  assert.match(recordTimestampIssue(record('- 2026-11-11 19:36:60 [叉子] update')), /out-of-range/);
  assert.match(recordTimestampIssue(record('- 2026-11-31 19:36 [叉子] update')), /invalid calendar date/);
  assert.equal(recordTimestampIssue(record('- 2026-11-10 [叉子] historical')), null);
});

test('timestamp scanning includes 完工回報 while acceptance validation excludes it', t => {
  const board = makeBoard(t);
  writeDoneTask(board, {
    from: '棒子', doneBy: '棒子', section: '完工回報',
    record: '- 2026-11-11 [叉子] implementation report'
  });
  const result = validateTestBoard(board);
  assert.ok(result.warnings.some(warning => warning.includes('[檢查 3] missing time')));
  assert.ok(result.warnings.some(warning => warning.includes('[檢查 2]')));
});

test('timestamp scanning handles LF and CRLF records without treating child bullets as new records', t => {
  for (const newline of ['\n', '\r\n']) {
    const board = fs.mkdtempSync(path.join(os.tmpdir(), 'dice-board-newline-'));
    fs.mkdirSync(path.join(board, 'archive'), { recursive: true });
    try {
      writeDoneTask(board, {
        newline,
        record: [
          '- 2026-11-11 19:36 [代記:barry/老查] 驗收通過。',
          '  - 來源：Barry 明確同意。',
          '  - 證據：PR #1。'
        ].join(newline)
      });
      const result = validateTestBoard(board);
      assert.deepEqual(result.errors, []);
      assert.deepEqual(result.warnings, []);
    } finally {
      fs.rmSync(board, { recursive: true, force: true });
    }
  }
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
