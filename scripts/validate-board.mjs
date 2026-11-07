import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROLES = new Set(['棒子', '叉子', 'barry', '老查']);
const SIDES = new Map([
  ['棒子', 'owner_side'], ['叉子', 'owner_side'],
  ['barry', 'collaborator_side'], ['老查', 'collaborator_side']
]);
const STATUSES = new Set(['open', 'in_progress', 'blocked', 'review', 'returned', 'done', 'cancelled']);
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
    fields,
    body,
    delegation,
    lockEvents: parseLockEvents(body)
  };
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

function validateBoardDirectory(boardDir) {
  const errors = [];
  const tasks = [];
  const byId = new Map();

  for (const filePath of taskFiles(boardDir)) {
    let task;
    try {
      task = parseTaskFile(filePath);
    } catch (error) {
      errors.push(error.message);
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

  return { tasks, errors };
}

function printCapacityReport(tasks, side) {
  if (!side) return;
  if (!['owner_side', 'collaborator_side'].includes(side)) {
    throw new Error(`Unknown side ${side}; use owner_side or collaborator_side`);
  }
  const active = tasks.filter(task => !path.dirname(task.filePath).endsWith(`${path.sep}archive`)
    && SIDES.get(task.fields.from) === side && ['in_progress', 'review'].includes(task.fields.status));
  const communicate = active.filter(task => task.delegation && task.fields.status === 'in_progress');
  console.log(`\n${side} capacity: ${active.length}/5 ${active.length >= 5 ? 'CAPACITY_BLOCKED' : 'AVAILABLE'}`);
  for (const task of active) console.log(`- ${task.fields.id} ${task.fields.status} owner=${task.fields.owner || '(unassigned)'}`);
  console.log(`Communicate priority: ${communicate.length ? 'BLOCKED' : 'CLEAR'}`);
  for (const task of communicate) console.log(`- ${task.fields.id} communicate task (highest priority)`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const boardDir = path.join(projectRoot, 'board');
  const sideArg = process.argv.find(arg => arg.startsWith('--side='))?.slice('--side='.length);
  const { tasks, errors } = validateBoardDirectory(boardDir);
  printCapacityReport(tasks, sideArg);
  if (errors.length) {
    console.error(`\nBoard validation failed (${errors.length} issue${errors.length === 1 ? '' : 's'}):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`Board validation passed: ${tasks.length} task files checked.`);
  }
}

export { parseFrontmatter, parseDelegation, parseLockEvents, parseTaskFile, validateBoardDirectory };
