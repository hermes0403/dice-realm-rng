import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROLES = new Set(['棒子', '叉子', 'barry', '老查']);
const SIDES = new Map([
  ['棒子', 'owner_side'], ['叉子', 'owner_side'],
  ['barry', 'collaborator_side'], ['老查', 'collaborator_side']
]);
const STATUSES = new Set(['open', 'in_progress', 'blocked', 'review', 'returned', 'done', 'cancelled']);
const RECORD_EFFECTIVE_DATE = '2026-11-11';
const ACCEPTANCE_SECTIONS = new Set([
  '紀錄', '驗收紀錄', '補充驗收紀錄', 'Owner 驗收紀錄', '技術驗收結案紀錄', '驗收'
]);
const TIMESTAMP_SECTIONS = new Set([
  ...ACCEPTANCE_SECTIONS, '進度紀錄', '實作進度紀錄', '完工回報'
]);
const HUMAN_ROLES = new Set(['棒子', 'barry']);
const PROXY_LABELS = new Map([
  ['代記:棒子/叉子', { human: '棒子', gpt: '叉子' }],
  ['代記:barry/老查', { human: 'barry', gpt: '老查' }]
]);
const REQUIRED_FIELDS = [
  'id', 'title', 'status', 'from', 'to', 'owner', 'contributors', 'reviewer',
  'priority', 'created', 'updated', 'depends_on', 'branch', 'done_by', 'done_at'
];

function parseFrontmatter(source, filePath) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error(`${filePath}: missing YAML frontmatter`);

  const fields = {};
  for (const [index, line] of match[1].split(/\r?\n/).entries()) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const field = line.match(/^([A-Za-z_][A-Za-z0-9_]*):(?:\s*(.*))?$/);
    if (!field) throw new Error(`${filePath}: invalid frontmatter line ${index + 1}: ${line}`);
    if (Object.hasOwn(fields, field[1])) throw new Error(`${filePath}: duplicate field ${field[1]}`);
    fields[field[1]] = (field[2] ?? '').trim();
  }

  return { fields, body: source.slice(match[0].length) };
}

function parseDelegation(body) {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex(line => /^## 委派資訊\s*$/.test(line));
  if (start < 0) return null;
  const sectionLines = [];
  for (let index = start + 1; index < lines.length && !/^## /.test(lines[index]); index++) {
    sectionLines.push(lines[index]);
  }
  const read = label => sectionLines.find(line => line.startsWith(`- ${label}：`))?.slice(`- ${label}：`.length).trim() ?? '';
  const fields = {
    originalTaskId: read('關聯原任務'),
    requester: read('原需求方'),
    recipient: read('接收方')
  };
  return Object.values(fields).some(Boolean) ? fields : null;
}
function parseLockEvents(body) {
  const events = [];
  const pattern = /^- \d{4}-\d{2}-\d{2} \d{2}:\d{2} \[(棒子|叉子|barry|老查)\] \[(COMMUNICATE_LOCK|COMMUNICATE_UNLOCK)\] task=(T-\d{4}) actor=(棒子|叉子|barry|老查) at=(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s*$/gm;
  for (const match of body.matchAll(pattern)) {
    events.push({ author: match[1], type: match[2], communicateTaskId: match[3], actor: match[4], at: match[5], index: match.index });
  }
  return events;
}

function parseTaskFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const { fields, body } = parseFrontmatter(source, filePath);
  const delegation = parseDelegation(body);
  return {
    filePath,
    fileName: path.basename(filePath),
    bodyLineOffset: source.slice(0, source.length - body.length).split(/\r?\n/).length - 1,
    fields,
    body,
    delegation,
    lockEvents: parseLockEvents(body)
  };
}

function markdownSections(body) {
  const lines = body.split(/\r?\n/);
  const sections = [];
  let current = null;
  for (let index = 0; index < lines.length; index++) {
    const heading = lines[index].match(/^##\s+(.+?)\s*$/);
    if (heading) {
      if (current) current.endLine = index;
      current = { title: heading[1], startLine: index + 1, endLine: lines.length, lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push({ text: lines[index], line: index + 1 });
    }
  }
  return sections;
}

function parseSectionRecords(section) {
  const records = [];
  let current = null;
  for (const entry of section.lines) {
    if (/^-\s+\d{4}-\d{2}-\d{2}(?:\s|$)/.test(entry.text)) {
      if (current) records.push(current);
      current = { lines: [entry], line: entry.line };
    } else if (current) {
      current.lines.push(entry);
    }
  }
  if (current) records.push(current);
  return records.map(record => ({
    ...record,
    text: record.lines.map(entry => entry.text).join('\n')
  }));
}

function parseRecordAuthor(recordText) {
  const header = recordText.match(/^-\s+\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:[^\s]+)?\s+(?:\[impact\])?\[([^\]]+)\](?!\s*\[)/);
  const label = header?.[1] || '';
  if (!label) return { label: '', side: 'UNKNOWN_SIDE', human: null, gpt: null, impact: false };
  if (PROXY_LABELS.has(label)) {
    const proxy = PROXY_LABELS.get(label);
    return { label, side: SIDES.get(proxy.human), human: proxy.human, gpt: proxy.gpt, impact: /^-\s+\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:[^\s]+)?\s+\[impact\]/.test(recordText) };
  }
  if (SIDES.has(label)) {
    return {
      label,
      side: SIDES.get(label),
      human: HUMAN_ROLES.has(label) ? label : null,
      gpt: HUMAN_ROLES.has(label) ? null : label,
      impact: /^-\s+\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:[^\s]+)?\s+\[impact\]/.test(recordText)
    };
  }
  return { label, side: 'UNKNOWN_SIDE', human: null, gpt: null, impact: /^-\s+\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:[^\s]+)?\s+\[impact\]/.test(recordText) };
}

function isValidCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function recordTimestampIssue(record) {
  const match = record.lines[0].text.match(/^-\s+(\d{4}-\d{2}-\d{2})(.*)$/);
  if (!match) return null;
  const [, date, remainder] = match;
  if (date < RECORD_EFFECTIVE_DATE) return null;
  if (!isValidCalendarDate(date)) return `invalid calendar date ${date}`;

  const tail = remainder.trimStart();
  const timeMatch = tail.match(/^(\d{2}):(\d{2})(?::(\d{2}))?(?=\s|$)/);
  if (!timeMatch) {
    if (/^\d{1,2}:/.test(tail)) return `malformed time in ${date} ${tail.split(/\s+/)[0]}`;
    return `missing time in ${date}`;
  }
  const [, hourText, minuteText, secondText] = timeMatch;
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = secondText === undefined ? 0 : Number(secondText);
  if (hour > 23 || minute > 59 || second > 59) {
    return `out-of-range time ${hourText}:${minuteText}${secondText === undefined ? '' : `:${secondText}`}`;
  }
  return null;
}

function recordSeverity(recordChecks, check, side) {
  const fallback = recordChecks === 'error' ? 'error' : 'warning';
  if (!recordChecks || recordChecks === 'warning' || recordChecks === 'error') return fallback;
  const configured = recordChecks[check];
  if (typeof configured === 'string') return configured;
  if (configured && typeof configured === 'object') return configured[side] || configured.default || 'warning';
  return 'warning';
}

function addRecordIssue(message, severity, errors, warnings) {
  (severity === 'error' ? errors : warnings).push(message);
}

function hasNonEmptyRecordField(recordText, label) {
  const pattern = new RegExp(`${label}[：:][ \\t]*([^\\r\\n]*?)(?=(?:[ \\t]*[｜|][ \\t]*)?(?:來源|證據)[：:]|$)`, 'm');
  return Boolean(recordText.match(pattern)?.[1]?.trim());
}

function hasPositiveAcceptanceDecision(recordText) {
  const beforeNegations = ['不得視為', '尚未', '等待', '不予', '無法', '拒絕', '不是', '未', '沒', '不', '待'];
  const afterNegations = ['尚未', '退回', '駁回', '拒絕', '暫緩', '失敗', '未', '不', '待'];
  const positiveDecision = /通過|成功|完成|結案|確認|同意|\bOK\b/i;
  const negativeDecision = /(?:尚未|未|沒有|沒|不予|無法|拒絕|不|待|等候)[^，,。；;！？!?\n]{0,12}(?:通過|成功|完成|結案|確認|同意|\bOK\b)/i;
  const decisionText = recordText.split(/\r?\n/)
    .filter(line => !/^\s*[-*]\s*(?:來源|證據)[：:]/.test(line))
    .map(line => line.replace(/(?:來源|證據)[：:][\s\S]*?(?=(?:來源|證據)[：:]|$)/g, ''))
    .join('\n');
  let offset = decisionText.indexOf('驗收');
  let foundDecision = false;
  while (offset >= 0) {
    const prefix = decisionText.slice(0, offset);
    const suffix = decisionText.slice(offset + '驗收'.length).replace(/^\s*[:：]?\s*/, '').replace(/^被/, '');
    const negatedBefore = beforeNegations.some(word => prefix.endsWith(word));
    const negatedAfter = afterNegations.some(word => suffix.startsWith(word));
    const decisionClause = suffix.split(/[，,。；;！？!?\n]/, 1)[0].slice(0, 80);
    if (negatedBefore || negatedAfter || negativeDecision.test(decisionClause)) return false;
    if (positiveDecision.test(decisionClause)) foundDecision = true;
    offset = decisionText.indexOf('驗收', offset + '驗收'.length);
  }
  return foundDecision;
}

function acceptanceRecordFailure(record, author, { fromSide, from, doneBy }) {
  if (author.side === 'UNKNOWN_SIDE' || !author.human) {
    return `author label=${author.label || '(missing)'} is not a valid human acceptance author (UNKNOWN_SIDE or GPT-only)`;
  }
  if (author.impact) return `impact notification label=${author.label}`;
  if (!hasPositiveAcceptanceDecision(record.text)) {
    const actualText = record.text.replace(/\s+/g, ' ').trim();
    return `no positive acceptance decision; actual record=${JSON.stringify(actualText)}`;
  }
  if (author.side !== fromSide || SIDES.get(author.human) !== fromSide) {
    return `acceptance human=${author.human} side=${author.side} does not match from=${from} side=${fromSide || 'UNKNOWN_SIDE'}`;
  }
  if (doneBy !== author.human) return `done_by=${doneBy || '(empty)'} does not match acceptance human ${author.human}`;
  if (!hasNonEmptyRecordField(record.text, '來源')) return '來源=(missing/empty)';
  if (!hasNonEmptyRecordField(record.text, '證據')) return '證據=(missing/empty)';
  const date = record.lines[0].text.match(/^-\s+(\d{4}-\d{2}-\d{2})/)?.[1];
  if (!date || !isValidCalendarDate(date) || date < RECORD_EFFECTIVE_DATE) {
    return `record date=${date || '(missing/invalid)'} is earlier than ${RECORD_EFFECTIVE_DATE} or invalid`;
  }
  return null;
}

function validateTaskRecords(task, recordChecks, errors, warnings) {
  const sections = markdownSections(task.body);
  const acceptanceRecords = sections
    .filter(section => ACCEPTANCE_SECTIONS.has(section.title))
    .flatMap(section => parseSectionRecords(section).map(record => ({ ...record, section: section.title })));
  const timestampRecords = sections
    .filter(section => TIMESTAMP_SECTIONS.has(section.title))
    .flatMap(section => parseSectionRecords(section).map(record => ({ ...record, section: section.title })));

  for (const record of timestampRecords) {
    const issue = recordTimestampIssue(record);
    if (!issue) continue;
    const author = parseRecordAuthor(record.lines[0].text);
    const severity = author.side === 'UNKNOWN_SIDE'
      ? 'warning'
      : recordSeverity(recordChecks, 'check3', author.side);
    addRecordIssue(`${task.fields.id}:${record.line} [檢查 3] ${issue} (${record.section}; ${author.side})`, severity, errors, warnings);
    if (author.side === 'UNKNOWN_SIDE') {
      warnings.push(`${task.fields.id}:${record.line} [檢查 3] UNKNOWN_SIDE label=${author.label || '(missing)'}`);
    }
  }

  const { fields, fileName } = task;
  const effectiveTask = fields.status === 'done'
    && [fields.created, fields.done_at].some(value => {
      const date = (value || '').match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
      return Boolean(date && isValidCalendarDate(date) && date >= RECORD_EFFECTIVE_DATE);
    });
  if (!effectiveTask) return;

  const fromSide = SIDES.get(fields.from);
  const doneBy = (fields.done_by || '').match(/^(棒子|叉子|barry|老查)(?:（[^）]+）)?$/)?.[1] || null;
  const acceptanceAuthors = acceptanceRecords.map(record => ({ record, author: parseRecordAuthor(record.lines[0].text) }));
  for (const { record, author } of acceptanceAuthors) {
    if (author.side === 'UNKNOWN_SIDE') {
      warnings.push(`${fields.id}:${record.line} [檢查 2] UNKNOWN_SIDE label=${author.label || '(missing)'} cannot qualify as acceptance`);
    }
  }
  const evaluated = acceptanceAuthors.map(({ record, author }) => ({
    record,
    failure: acceptanceRecordFailure(record, author, { fromSide, from: fields.from, doneBy })
  }));
  const validAcceptance = evaluated.some(item => item.failure === null);

  if (!validAcceptance) {
    const severity = recordSeverity(recordChecks, 'check2', fromSide);
    if (!acceptanceRecords.length) {
      addRecordIssue(`${fileName} [檢查 2] no acceptance record found in an allowed section`, severity, errors, warnings);
    } else {
      const failureOrder = [
        'author label=', 'impact notification', 'no positive acceptance decision',
        'acceptance human=', 'done_by=', '來源=', '證據=', 'record date='
      ];
      for (const item of evaluated) {
        item.failureStage = item.failure === null ? 9 : failureOrder.findIndex(prefix => item.failure.startsWith(prefix));
      }
      const selected = evaluated.reduce((best, item) => item.failureStage > best.failureStage ? item : best);
      const line = selected.record.line + task.bodyLineOffset;
      addRecordIssue(`${fileName} [檢查 2] line ${line}: ${selected.failure}`, severity, errors, warnings);
    }
  }
}

function taskFiles(boardDir) {
  const files = [];
  for (const entry of fs.readdirSync(boardDir, { withFileTypes: true })) {
    if (entry.isFile() && /^T-\d{4}-.+\.md$/i.test(entry.name)) files.push(path.join(boardDir, entry.name));
    if (entry.isDirectory() && entry.name === 'archive') {
      for (const archived of fs.readdirSync(path.join(boardDir, 'archive'), { withFileTypes: true })) {
        if (archived.isFile() && /^T-\d{4}-.+\.md$/i.test(archived.name)) {
          files.push(path.join(boardDir, 'archive', archived.name));
        }
      }
    }
  }
  return files.sort();
}

function isArchivedTask(task) {
  return path.basename(path.dirname(task.filePath)) === 'archive';
}

function taskIdentityIssues(task, duplicateIds) {
  const issues = [];
  const idFromName = task.fileName.match(/^(T-\d{4})-/)?.[1];
  if (!/^T-\d{4}$/.test(task.fields.id || '') || task.fields.id !== idFromName) {
    issues.push('invalid or mismatched task ID');
  }
  if (duplicateIds.has(task.fields.id)) issues.push('duplicate task ID');
  if (!SIDES.has(task.fields.from)) issues.push('from does not map to a permission side');
  return issues;
}

function countInProgressBySide(tasks, errors = []) {
  const idCounts = new Map();
  for (const task of tasks) idCounts.set(task.fields.id, (idCounts.get(task.fields.id) || 0) + 1);
  const duplicateIds = new Set([...idCounts].filter(([, count]) => count > 1).map(([id]) => id));
  const counts = { owner_side: [], collaborator_side: [] };
  const unknown = { owner_side: [], collaborator_side: [] };
  const archived = [];

  for (const task of tasks.filter(item => item.fields.status === 'in_progress')) {
    const issues = taskIdentityIssues(task, duplicateIds);
    const side = SIDES.get(task.fields.from);
    if (isArchivedTask(task)) {
      archived.push({ id: task.fields.id, file: task.fileName, from: task.fields.from });
      continue;
    }
    if (issues.length) {
      const entry = { id: task.fields.id || task.fileName, file: task.fileName, reasons: issues };
      if (side) unknown[side].push(entry);
      else for (const key of Object.keys(unknown)) unknown[key].push(entry);
      continue;
    }
    counts[side].push(task);
  }

  // An unreadable file whose frontmatter still declares in_progress makes both
  // sides UNKNOWN: its from/ID cannot be safely established.
  for (const error of errors.filter(item => item.unparsedInProgress)) {
    const entry = { id: error.fileName, file: error.fileName, reasons: ['frontmatter cannot be parsed'] };
    for (const key of Object.keys(unknown)) unknown[key].push(entry);
  }
  return { counts, unknown, archived, duplicateIds };
}

function communicateTaskIssues(task, tasks, errors, duplicateIds) {
  const original = tasks.find(item => item.fields.id === task.delegation?.originalTaskId);
  const ownErrors = errors.filter(error => typeof error === 'string' && error.startsWith(`${task.fileName}:`));
  const relatedOriginalErrors = original ? errors.filter(error => typeof error === 'string' && error.startsWith(`${original.fileName}:`)
    && (error.includes(`references ${task.fields.id}`) || error.includes('more than one active communicate lock'))) : [];
  const issues = taskIdentityIssues(task, duplicateIds);
  if (!original) issues.push('linked original task is missing');
  if (duplicateIds.has(task.delegation?.originalTaskId)) issues.push('linked original task ID is duplicated');
  return [...issues, ...ownErrors, ...relatedOriginalErrors];
}

function analyzeAdmissionGates(tasks, errors = []) {
  const capacity = countInProgressBySide(tasks, errors);
  const communicate = { owner_side: [], collaborator_side: [] };
  const communicateUnknown = { owner_side: [], collaborator_side: [] };

  for (const task of tasks.filter(item => item.delegation && ['open', 'in_progress', 'returned'].includes(item.fields.status))) {
    const { fields, delegation } = task;
    const original = tasks.find(item => item.fields.id === delegation.originalTaskId);
    const validationIssues = communicateTaskIssues(task, tasks, errors, capacity.duplicateIds);
    const valid = !isArchivedTask(task) && validationIssues.length === 0;
    const fromSide = SIDES.get(fields.from);
    const toSide = SIDES.get(fields.to);
    const relevantSides = new Set();
    if (['open', 'in_progress'].includes(fields.status) && toSide) relevantSides.add(toSide);
    if (fields.status === 'returned' && fromSide) relevantSides.add(fromSide);
    const entry = {
      id: fields.id, from: fields.from, to: fields.to, status: fields.status,
      file: task.fileName, valid, originalTaskId: delegation.originalTaskId,
      reasons: valid ? [] : validationIssues
    };
    if (valid) {
      for (const side of relevantSides) communicate[side].push(entry);
    } else {
      for (const side of relevantSides) communicateUnknown[side].push(entry);
      if (!fromSide || (['open', 'in_progress'].includes(fields.status) && !toSide)) {
        for (const side of Object.keys(communicateUnknown)) communicateUnknown[side].push(entry);
      }
    }
  }

  const checks = {};
  for (const side of Object.keys(capacity.counts)) {
    const count = capacity.counts[side].length;
    const triggeringIds = new Set(communicate[side].map(task => task.id));
    checks[side] = {
      capacity_count: count,
      capacity_limit: 5,
      capacity_status: count > 5 ? 'EXCEEDED' : capacity.unknown[side].length ? 'UNKNOWN' : count === 5 ? 'FULL' : 'AVAILABLE',
      capacity_unknown: capacity.unknown[side],
      communicate_status: communicateUnknown[side].length ? 'UNKNOWN' : communicate[side].length ? 'TRIGGERED' : 'CLEAR',
      communicate_tasks: communicate[side],
      communicate_unknown: communicateUnknown[side],
      blocked_open_tasks: communicate[side].length && !communicateUnknown[side].length
        ? tasks.filter(task => task.fields.status === 'open'
          && SIDES.get(task.fields.from) === side && !triggeringIds.has(task.fields.id)
          && taskIdentityIssues(task, capacity.duplicateIds).length === 0
          && !isArchivedTask(task)).map(task => task.fields.id)
        : []
    };
  }
  const communicateCandidates = tasks.filter(task => task.delegation && ['open', 'in_progress', 'returned'].includes(task.fields.status)).map(task => {
    const issues = communicateTaskIssues(task, tasks, errors, capacity.duplicateIds);
    const side = task.fields.status === 'returned' ? SIDES.get(task.fields.from) : SIDES.get(task.fields.to);
    return {
      id: task.fields.id, from: task.fields.from, to: task.fields.to, status: task.fields.status,
      side, condition: task.fields.status === 'returned' ? 'B' : 'A',
      valid: !isArchivedTask(task) && issues.length === 0,
      reasons: isArchivedTask(task) ? ['task is in archive/'] : issues,
      location: isArchivedTask(task) ? 'archive/' : 'board/', file: task.fileName
    };
  });
  return {
    checks,
    capacity_tasks_by_side: Object.fromEntries(Object.entries(capacity.counts).map(([side, items]) => [side, items.map(task => task.fields.id)])),
    capacity_unknown_by_side: capacity.unknown,
    communicate_candidates: communicateCandidates,
    in_progress: tasks.filter(task => task.fields.status === 'in_progress').map(task => ({
      id: task.fields.id, from: task.fields.from, to: task.fields.to,
      status: task.fields.status, updated: task.fields.updated,
      location: isArchivedTask(task) ? 'archive/' : 'board/', file: task.fileName,
      side: SIDES.get(task.fields.from) || null,
      has_communicate_section: Boolean(task.delegation),
      valid: taskIdentityIssues(task, capacity.duplicateIds).length === 0,
      reasons: taskIdentityIssues(task, capacity.duplicateIds)
    })),
    open_communicate_candidates: tasks.filter(task => task.delegation && task.fields.status === 'open').map(task => ({
      id: task.fields.id, from: task.fields.from, to: task.fields.to, status: task.fields.status,
      valid: !isArchivedTask(task) && communicateTaskIssues(task, tasks, errors, capacity.duplicateIds).length === 0,
      location: isArchivedTask(task) ? 'archive/' : 'board/', file: task.fileName
    })),
    returned_tasks: tasks.filter(task => task.fields.status === 'returned').map(task => ({
      id: task.fields.id, from: task.fields.from, to: task.fields.to,
      is_communicate_candidate: Boolean(task.delegation),
      valid: Boolean(task.delegation) && !isArchivedTask(task)
        && communicateTaskIssues(task, tasks, errors, capacity.duplicateIds).length === 0,
      location: isArchivedTask(task) ? 'archive/' : 'board/', file: task.fileName
    })),
    archive_in_progress: capacity.archived,
    unparsed_in_progress: errors.filter(item => item?.unparsedInProgress).map(item => ({ file: item.fileName, status: 'in_progress', validity: 'UNKNOWN' }))
  };
}

function splitMarkdownTableRow(line) {
  const cells = [];
  let cell = '';
  let slashCount = 0;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '|') {
      if (slashCount % 2 === 1) {
        cell = cell.slice(0, -1) + '|';
      } else {
        cells.push(cell.trim());
        cell = '';
      }
      slashCount = 0;
      continue;
    }
    cell += char;
    slashCount = char === '\\' ? slashCount + 1 : 0;
  }
  if (cell.trim()) cells.push(cell.trim());
  if (line.trimStart().startsWith('|') && cells[0] === '') cells.shift();
  return cells;
}

function parseTaskIndex(readmePath) {
  if (!fs.existsSync(readmePath)) throw new Error(`${readmePath}: required Board README is missing`);
  const source = fs.readFileSync(readmePath, 'utf8');
  const lines = source.split(/\r?\n/);
  const headings = lines.map((line, index) => ({ line, index }))
    .filter(item => /^##\s+.*目前任務索引.*$/.test(item.line));
  if (headings.length !== 1) throw new Error(`${readmePath}: expected exactly one section heading containing 目前任務索引`);

  const sectionStart = headings[0].index + 1;
  let headerIndex = -1;
  for (let index = sectionStart; index < lines.length && !/^##\s/.test(lines[index]); index++) {
    if (lines[index].trim().startsWith('|')) {
      headerIndex = index;
      break;
    }
  }
  if (headerIndex < 0) throw new Error(`${readmePath}: task index table header is missing`);

  const header = splitMarkdownTableRow(lines[headerIndex]);
  if (header.join('|') !== 'ID|任務|狀態|依賴') throw new Error(`${readmePath}: task index header must be ID | 任務 | 狀態 | 依賴`);
  const separatorIndex = headerIndex + 1;
  if (!/^\s*\|?\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|?\s*$/.test(lines[separatorIndex] || '')) {
    throw new Error(`${readmePath}: task index separator row is missing or malformed`);
  }

  const rows = [];
  const errors = [];
  let pendingBlankLine = 0;
  for (let index = separatorIndex + 1; index < lines.length; index++) {
    const line = lines[index];
    if (/^##\s/.test(line)) break;
    if (!line.trim()) {
      if (rows.length && !pendingBlankLine) pendingBlankLine = index + 1;
      continue;
    }
    if (!line.trimStart().startsWith('|')) {
      if (rows.length) break;
      continue;
    }
    if (pendingBlankLine) {
      errors.push(`${readmePath}:${pendingBlankLine}: blank row inside task index table`);
      pendingBlankLine = 0;
    }
    const cells = splitMarkdownTableRow(line);
    if (cells.length !== 4) {
      errors.push(`${readmePath}:${index + 1}: task index row must contain exactly 4 columns`);
      continue;
    }
    if (!/^T-\d{4}$/.test(cells[0])) errors.push(`${readmePath}:${index + 1}: invalid task index ID ${cells[0] || '(empty)'}`);
    rows.push({ id: cells[0], title: cells[1], status: cells[2], dependencies: cells[3], line: index + 1 });
  }
  if (!rows.length) errors.push(`${readmePath}: task index contains no task rows`);

  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.id)) errors.push(`${readmePath}:${row.line}: duplicate task index ID ${row.id}`);
    seen.add(row.id);
  }
  const outOfOrder = rows.filter((row, index) => index > 0 && row.id < rows[index - 1].id);
  if (outOfOrder.length) errors.push(`${readmePath}: task index IDs are not in ascending order at ${outOfOrder.map(row => row.id).join(', ')}`);

  return { rows, errors };
}

function missingIdRanges(ids) {
  const numbers = [...new Set(ids.map(id => Number(id.slice(2))))].sort((a, b) => a - b);
  const ranges = [];
  for (let index = 1; index < numbers.length; index++) {
    const start = numbers[index - 1] + 1;
    const end = numbers[index] - 1;
    if (start > end) continue;
    ranges.push({ start: `T-${String(start).padStart(4, '0')}`, end: `T-${String(end).padStart(4, '0')}`, count: end - start + 1 });
  }
  return ranges;
}

function validateBoardDirectory(boardDir, { checkIndex = true, recordChecks = 'warning' } = {}) {
  const errors = [];
  const warnings = [];
  const tasks = [];
  const unparsedInProgress = [];
  const byId = new Map();

  for (const filePath of taskFiles(boardDir)) {
    let task;
    try {
      task = parseTaskFile(filePath);
    } catch (error) {
      errors.push(error.message);
      const source = fs.readFileSync(filePath, 'utf8');
      if (/^status:\s*in_progress\s*$/m.test(source)) {
        unparsedInProgress.push({ fileName: path.basename(filePath), unparsedInProgress: true });
      }
      continue;
    }

    const { fields, fileName, delegation, lockEvents } = task;
    tasks.push(task);
    for (const key of REQUIRED_FIELDS) {
      if (!Object.hasOwn(fields, key)) errors.push(`${fileName}: missing required field ${key}`);
    }

    const idFromName = fileName.match(/^(T-\d{4})-/)?.[1];
    if (fields.id !== idFromName) errors.push(`${fileName}: frontmatter id ${fields.id || '(empty)'} does not match filename`);
    if (byId.has(fields.id)) errors.push(`${fileName}: duplicate task id ${fields.id}`);
    else byId.set(fields.id, task);

    if (!STATUSES.has(fields.status)) errors.push(`${fileName}: unsupported status ${fields.status || '(empty)'}`);
    if (!ROLES.has(fields.from)) errors.push(`${fileName}: invalid from role ${fields.from || '(empty)'}`);
    if (fields.to !== 'any' && !ROLES.has(fields.to)) errors.push(`${fileName}: invalid to role ${fields.to || '(empty)'}`);
    if (fields.owner && !ROLES.has(fields.owner)) errors.push(`${fileName}: invalid owner role ${fields.owner}`);
    if (fields.reviewer && !ROLES.has(fields.reviewer)) errors.push(`${fileName}: invalid reviewer role ${fields.reviewer}`);
    // Older completed tasks may retain a parenthetical explanation after the role.
    if (fields.done_by && !ROLES.has(fields.done_by) && !/^(棒子|叉子|barry|老查)（[^）]+）$/.test(fields.done_by)) {
      errors.push(`${fileName}: invalid done_by role ${fields.done_by}`);
    }
    if (!/^P[0-3]$/.test(fields.priority || '')) errors.push(`${fileName}: invalid priority ${fields.priority || '(empty)'}`);

    const isCommunicateTask = Boolean(delegation);
    if (fields.status === 'returned' && !isCommunicateTask) {
      errors.push(`${fileName}: returned is only valid for communicate tasks`);
    }
    if (isCommunicateTask) {
      if (!/^T-\d{4}$/.test(delegation.originalTaskId)) errors.push(`${fileName}: invalid 關聯原任務`);
      if (!ROLES.has(delegation.requester)) errors.push(`${fileName}: invalid 原需求方`);
      if (!ROLES.has(delegation.recipient)) errors.push(`${fileName}: invalid 接收方`);
      if (fields.to !== delegation.recipient) errors.push(`${fileName}: to must match 委派資訊的接收方`);
      if (fields.reviewer !== delegation.requester) errors.push(`${fileName}: reviewer must be the 原需求方`);
      if (fields.owner && ROLES.has(delegation.recipient) && SIDES.get(fields.owner) !== SIDES.get(delegation.recipient)) {
        errors.push(`${fileName}: owner must belong to the 接收方 permission group`);
      }
    }
  }

  for (const task of tasks) {
    const { fields, fileName, delegation, lockEvents } = task;
    if (!delegation) continue;

    const original = byId.get(delegation.originalTaskId);
    if (!original) {
      errors.push(`${fileName}: original task ${delegation.originalTaskId} does not exist in board or archive`);
      continue;
    }

    if (SIDES.get(delegation.requester) !== SIDES.get(original.fields.from)) {
      errors.push(`${fileName}: 原需求方 must belong to the original task's permission group`);
    }
    if (['done', 'cancelled'].includes(original.fields.status)) {
      errors.push(`${fileName}: original task cannot be done or cancelled while a communicate task is linked`);
    }

    const lock = original.lockEvents.find(event => event.type === 'COMMUNICATE_LOCK' && event.communicateTaskId === fields.id);
    const unlock = original.lockEvents.find(event => event.type === 'COMMUNICATE_UNLOCK' && event.communicateTaskId === fields.id);
    if (!lock) errors.push(`${fileName}: original task ${delegation.originalTaskId} has no matching COMMUNICATE_LOCK record`);
    if (lock && SIDES.get(lock.actor) !== SIDES.get(original.fields.from)) {
      errors.push(`${fileName}: lock actor does not belong to the original task's permission group`);
    }
    if (lock && lock.author !== lock.actor) errors.push(`${fileName}: lock record role prefix must match actor`);
    if (unlock && unlock.actor !== delegation.requester) {
      errors.push(`${fileName}: unlock actor must match 原需求方`);
    }
    if (unlock && unlock.author !== unlock.actor) errors.push(`${fileName}: unlock record role prefix must match actor`);
    if (fields.status === 'done' && !unlock) errors.push(`${fileName}: done communicate task must have an unlock record on its original task`);
    if (fields.status === 'done' && fields.done_by !== delegation.requester) errors.push(`${fileName}: done_by must match 原需求方`);
    if (fields.status === 'done' && !fields.done_at) errors.push(`${fileName}: done communicate task must set done_at`);
    if (!['done', 'cancelled'].includes(fields.status) && unlock) errors.push(`${fileName}: original task was unlocked before communicate task was accepted`);
    if (lock && unlock && unlock.index < lock.index) errors.push(`${fileName}: COMMUNICATE_UNLOCK appears before COMMUNICATE_LOCK`);
    if (fields.status === 'returned' && !lock) errors.push(`${fileName}: returned task must keep its original task locked until accepted`);
  }

  for (const task of tasks) validateTaskRecords(task, recordChecks, errors, warnings);

  for (const task of tasks) {
    for (const event of task.lockEvents) {
      const communicateTask = byId.get(event.communicateTaskId);
      if (!communicateTask?.delegation || communicateTask.delegation.originalTaskId !== task.fields.id) {
        errors.push(`${task.fileName}: orphan ${event.type} references ${event.communicateTaskId}`);
      }
    }
    const activeLocks = task.lockEvents.filter(event => event.type === 'COMMUNICATE_LOCK').filter(lock => {
      const unlock = task.lockEvents.find(event => event.type === 'COMMUNICATE_UNLOCK' && event.communicateTaskId === lock.communicateTaskId);
      return !unlock || unlock.index < lock.index;
    });
    if (activeLocks.length > 1) errors.push(`${task.fileName}: more than one active communicate lock exists on the same original task`);
  }

  if (checkIndex) {
    const indexPath = path.join(boardDir, 'README.md');
    try {
      const index = parseTaskIndex(indexPath);
      errors.push(...index.errors);
      const indexById = new Map(index.rows.map(row => [row.id, row]));
      for (const row of index.rows) {
        const task = byId.get(row.id);
        if (!task) warnings.push(`task index ${row.id} has no matching task file in board or archive`);
        else if (row.status !== task.fields.status) {
          errors.push(`${row.id}: task index status ${row.status} does not match task file status ${task.fields.status}`);
        }
      }
      for (const task of tasks) {
        if (!indexById.has(task.fields.id)) {
          warnings.push(`task file ${task.fields.id} is missing from task index`);
        }
      }
      for (const range of missingIdRanges(index.rows.map(row => row.id))) {
        warnings.push(`task index ID gap: ${range.start}～${range.end}（${range.count} 個）`);
      }
    } catch (error) {
      errors.push(error.message);
    }
  }

  const gateAnalysis = analyzeAdmissionGates(tasks, [...errors, ...unparsedInProgress]);
  for (const [side, result] of Object.entries(gateAnalysis.checks)) {
    const capacitySeverity = recordSeverity(recordChecks, 'check7', side);
    const communicateSeverity = recordSeverity(recordChecks, 'check8', side);
    if (result.capacity_status === 'EXCEEDED') addRecordIssue(`${side} [檢查 7] in_progress capacity exceeded: ${result.capacity_count}/5`, capacitySeverity, errors, warnings);
    if (result.capacity_unknown.length) addRecordIssue(`${side} [檢查 7] capacity UNKNOWN: ${result.capacity_unknown.map(item => item.id).join(', ')}`, capacitySeverity, errors, warnings);
    if (result.communicate_status === 'TRIGGERED') addRecordIssue(`${side} [檢查 8] Communicate gate triggered: ${result.communicate_tasks.map(item => item.id).join(', ')}`, communicateSeverity, errors, warnings);
    if (result.communicate_status === 'UNKNOWN') addRecordIssue(`${side} [檢查 8] Communicate gate UNKNOWN: ${result.communicate_unknown.map(item => item.id).join(', ')}`, communicateSeverity, errors, warnings);
  }
  for (const task of gateAnalysis.archive_in_progress) {
    addRecordIssue(`${task.file} [檢查 7] archived task remains in_progress; excluded from capacity`,
      recordSeverity(recordChecks, 'check7', SIDES.get(task.from)), errors, warnings);
  }

  return { tasks, errors, warnings, gateAnalysis };
}

function printCapacityReport(tasks, side, gateAnalysis = analyzeAdmissionGates(tasks)) {
  if (!side) return;
  const sides = side === 'all' ? ['owner_side', 'collaborator_side'] : [side];
  if (sides.some(item => !['owner_side', 'collaborator_side'].includes(item))) {
    throw new Error(`Unknown side ${side}; use owner_side, collaborator_side, or all`);
  }
  for (const currentSide of sides) {
    const result = gateAnalysis.checks[currentSide];
    const countedIds = new Set(gateAnalysis.capacity_tasks_by_side[currentSide]);
    console.log(`${currentSide} capacity: ${result.capacity_count}/5 ${result.capacity_status}`);
    for (const task of tasks.filter(item => item.fields.status === 'in_progress' && countedIds.has(item.fields.id) && !isArchivedTask(item))) {
      console.log(`- ${task.fields.id} ${task.fields.status} owner=${task.fields.owner || '(unassigned)'}`);
    }
    for (const unknown of result.capacity_unknown) console.log(`- UNKNOWN ${unknown.id} ${unknown.reasons.join('; ')}`);
    console.log(`${currentSide} Communicate priority: ${result.communicate_status}`);
    for (const task of result.communicate_tasks) console.log(`- ${task.id} communicate task (highest priority)`);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const boardDir = path.join(projectRoot, 'board');
  const sideArg = process.argv.find(arg => arg.startsWith('--side='))?.slice('--side='.length);
  const { tasks, errors, warnings, gateAnalysis } = validateBoardDirectory(boardDir, { recordChecks: 'warning' });
  printCapacityReport(tasks, sideArg, gateAnalysis);
  if (warnings.length) {
    console.warn(`\nBoard validation warnings (${warnings.length}):`);
    for (const warning of warnings) console.warn(`- ${warning}`);
  }
  if (errors.length) {
    console.error(`\nBoard validation failed (${errors.length} issue${errors.length === 1 ? '' : 's'}):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`Board validation passed: ${tasks.length} task files checked.`);
  }
}

export {
  parseFrontmatter, parseDelegation, parseLockEvents, parseTaskFile, splitMarkdownTableRow,
  parseTaskIndex, missingIdRanges, markdownSections, parseSectionRecords, parseRecordAuthor,
  recordTimestampIssue, validateBoardDirectory, countInProgressBySide, analyzeAdmissionGates
};
