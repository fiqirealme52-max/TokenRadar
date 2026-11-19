// Token Radar (radar-2) — the entry program, Node 22, standard library only.
//
// Reads the sealed snapshot, scores every pre-token protocol with the model in
// lib/model.ts, and writes the ranked board, the dashboard data, the dashboard
// and screenshots, and the dossier the judge reads.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
//
// In the grader's container the snapshot lives at /input/snapshot.json and the
// output at /output; MAKEFUN_OUTPUT_DIR stands in for /output outside it.
// The program is deterministic: same snapshot in, same bytes out, every run.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, copyFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRadar, boardIssue, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const rootDir = dirname(fileURLToPath(import.meta.url));
const outDir = flagValue('--output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
const inputGiven = flagValue('--input', '/input');
const snapshotPath = inputGiven.endsWith('.json') ? inputGiven : join(inputGiven, 'snapshot.json');

/** The value after `--name value` or `--name=value` on the command line, else the fallback. */
function flagValue(name: string, fallback: string): string {
  const argv = process.argv.slice(2);
  const plain = argv.indexOf(name);
  if (plain >= 0 && plain + 1 < argv.length) return argv[plain + 1]!;
  const joined = argv.find((a) => a.startsWith(`${name}=`));
  return joined === undefined ? fallback : joined.slice(name.length + 1);
}

if (!existsSync(snapshotPath)) {
  process.stderr.write(`token radar: no snapshot at ${snapshotPath} — pass --input <snapshot.json|directory>\n`);
  process.exit(2);
}

const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const problem = boardIssue(board, snapshot);
if (problem !== null) {
  process.stderr.write(`token radar: the board fails the gate: ${problem}\n`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outDir, 'data.js'), dataScript(radar));

/** Copy a directory's regular files into `dest`, skipping dot-names; returns the names copied. */
function copyDir(from: string, dest: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(dest, { recursive: true });
  const names: string[] = [];
  for (const entry of readdirSync(from)) {
    if (entry.startsWith('.')) continue;
    const src = join(from, entry);
    if (!statSync(src).isFile()) continue;
    copyFileSync(src, join(dest, entry));
    names.push(entry);
  }
  return names;
}

const dashboardFiles = copyDir(join(rootDir, 'dashboard'), join(outDir, 'dashboard'));
const shotNames = copyDir(join(rootDir, 'screenshots'), join(outDir, 'screenshots'));
const shotPattern = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
if (shotNames.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shotNames.length} image(s) — hand in 3: the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const shot of shotNames) {
  if (!shotPattern.test(shot)) {
    process.stderr.write(`token radar: screenshots/${shot} is not a plain file name\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this output and compares bytes.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, { text_max_bytes: 65_536, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 } }),
);

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: wrote ${join(outDir, 'board.json')}, ${join(outDir, 'data.js')}, dashboard (${dashboardFiles.length} files), screenshots (${shotNames.length} images) and ${join(outDir, 'dossier.json')}\n`,
);
