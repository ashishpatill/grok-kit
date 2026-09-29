#!/usr/bin/env node
/**
 * P1.X3 — thin conformance suite.
 * Wraps existing green stub smokes into one `npm run conformance` with a
 * pass/fail summary. No Neon / secrets required (stub-only tracks).
 *
 * Exit 0 = all suites green; non-zero = at least one failed.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');

/** @type {{ id: string; label: string; script: string }[]} */
const SUITES = [
  { id: 'contract', label: 'P1.M9 cold-start contract', script: 'contract:smoke' },
  { id: 'cli', label: 'P1.M5 CLI twin', script: 'cli:smoke' },
  { id: 'import', label: 'P1.M6 import pipeline', script: 'import:smoke' },
  { id: 'workers', label: 'P1.M7 workers', script: 'workers:smoke' },
  { id: 'graph', label: 'P1.G1 graph orchestrator', script: 'graph:smoke' },
  { id: 'curator', label: 'P1.G2 curator client', script: 'curator:smoke' },
  { id: 'nodes', label: 'P1.G3 nodes + Moose stand-in', script: 'nodes:smoke' },
  { id: 'demo:stuck-debug', label: 'P1.G4 stuck-debug demo', script: 'demo:stuck-debug' },
];

const quiet = process.argv.includes('--quiet');
const filter = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);

const selected = filter
  ? SUITES.filter((s) => s.id === filter || s.script === filter)
  : SUITES;

if (selected.length === 0) {
  console.error(`Unknown suite filter: ${filter}`);
  console.error(`Known: ${SUITES.map((s) => s.id).join(', ')}`);
  process.exit(2);
}

console.log('P1.X3 conformance suite');
console.log(`  root: ${root}`);
console.log(`  suites: ${selected.map((s) => s.id).join(', ')}`);
console.log('');

/** @type {{ id: string; label: string; ok: boolean; ms: number; code: number | null }[]} */
const results = [];

for (const suite of selected) {
  process.stdout.write(`→ ${suite.id} … `);
  if (!quiet) console.log('');
  const started = Date.now();
  const child = spawnSync('npm', ['run', '-s', suite.script], {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  const ms = Date.now() - started;
  const ok = child.status === 0;
  if (quiet) {
    // still surface failure tails so CI isn't silent
    if (!ok) {
      const out = [child.stdout, child.stderr].filter(Boolean).join('\n').trim();
      if (out) console.log(out.split('\n').slice(-40).join('\n'));
    }
  }
  console.log(`${ok ? 'PASS' : 'FAIL'} ${suite.id} (${ms} ms, exit ${child.status ?? 'null'})`);
  if (!quiet) console.log('');
  results.push({ id: suite.id, label: suite.label, ok, ms, code: child.status });
}

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).length;
const totalMs = results.reduce((a, r) => a + r.ms, 0);

console.log('─'.repeat(60));
console.log('Conformance summary');
console.log('─'.repeat(60));
for (const r of results) {
  const mark = r.ok ? 'PASS' : 'FAIL';
  console.log(`  ${mark.padEnd(4)}  ${r.id.padEnd(18)}  ${String(r.ms).padStart(6)} ms  ${r.label}`);
}
console.log('─'.repeat(60));
console.log(
  failed === 0
    ? `ALL GREEN — ${passed}/${results.length} suites (${totalMs} ms)`
    : `${failed} FAILED / ${results.length} suites (${totalMs} ms)`,
);

process.exit(failed === 0 ? 0 : 1);
