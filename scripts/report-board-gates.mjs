import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateBoardDirectory } from './validate-board.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const boardDir = path.join(projectRoot, 'board');
const outputPath = process.argv.find(arg => arg.startsWith('--output='))?.slice('--output='.length);
if (!outputPath) throw new Error('Usage: node scripts/report-board-gates.mjs --output=<absolute-json-path>');

const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim();
const originMain = execFileSync('git', ['rev-parse', 'origin/main'], { cwd: projectRoot, encoding: 'utf8' }).trim();
if (head !== originMain) throw new Error(`Refusing stale scan: HEAD=${head}, origin/main=${originMain}`);

const { tasks, errors, warnings, gateAnalysis } = validateBoardDirectory(boardDir, { recordChecks: 'warning' });
const checkRows = [
  ...Object.entries(gateAnalysis.capacity_tasks_by_side).flatMap(([side, ids]) => ids.map(taskId => ({
    check: 7, side, task_id: taskId, result: gateAnalysis.checks[side].capacity_status
  }))),
  ...Object.entries(gateAnalysis.capacity_unknown_by_side).flatMap(([side, entries]) => entries.map(entry => ({
    check: 7, side, task_id: entry.id, result: 'UNKNOWN', reasons: entry.reasons
  }))),
  ...gateAnalysis.communicate_candidates.map(candidate => ({
    check: 8, side: candidate.side || 'UNKNOWN_SIDE', task_id: candidate.id,
    condition: candidate.condition, status: candidate.status,
    result: candidate.valid ? 'TRIGGERED' : 'UNKNOWN', reasons: candidate.reasons
  }))
];
const report = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  source: { branch: execFileSync('git', ['branch', '--show-current'], { cwd: projectRoot, encoding: 'utf8' }).trim(), head, origin_main: originMain },
  scanned_locations: ['board/', 'board/archive/'],
  task_file_count: tasks.length,
  checks: gateAnalysis.checks,
  check_rows: checkRows,
  in_progress: gateAnalysis.in_progress,
  communicate_candidates: gateAnalysis.communicate_candidates,
  open_communicate_candidates: gateAnalysis.open_communicate_candidates,
  returned_tasks: gateAnalysis.returned_tasks,
  archive_in_progress: gateAnalysis.archive_in_progress,
  unparsed_in_progress: gateAnalysis.unparsed_in_progress,
  validator: { error_count: errors.length, warning_count: warnings.length, errors, warnings }
};

const serialized = `${JSON.stringify(report, null, 2)}\n`;
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, serialized, 'utf8');
const bytes = fs.readFileSync(outputPath);
process.stdout.write(JSON.stringify({
  output: path.resolve(outputPath),
  size_bytes: bytes.length,
  sha256: crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase(),
  source_head: head,
  task_file_count: tasks.length,
  in_progress_count: gateAnalysis.in_progress.length,
  open_communicate_candidate_count: gateAnalysis.open_communicate_candidates.length,
  returned_task_count: gateAnalysis.returned_tasks.length,
  archive_in_progress_count: gateAnalysis.archive_in_progress.length,
  error_count: errors.length,
  warning_count: warnings.length
}, null, 2) + '\n');
