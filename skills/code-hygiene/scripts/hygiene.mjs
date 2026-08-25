#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isMainModule } from "../../../scripts/lib/is-main.mjs";
import {
  inventoryFromDirs,
  listSkillDirs,
} from "../../skill-curator-manual/scripts/skill-curator.mjs";

const HELP = `hygiene — ranked code drift (human decides scrap / fix / keep)

Usage:
  hygiene [--root DIR] [--limit N] [--batch N] [--kinds k1,k2] [--explain PATH]
          [--short] [--write]

Aliases via grok-kit: drift, scrap, code-hygiene.

Does not delete files. Optional --write is gitignored. Do not dump into always-on rules.
`;

export const THRESHOLDS = Object.freeze({
  oversizedCode: 500,
  oversizedDoc: 800,
  oversizedHigh: 1000,
  todoPile: 8,
  debugLogs: 5,
  commentedRun: 25,
  emptyBytes: 12,
  maxFiles: 8000,
  maxBytes: 400_000,
  duplicateCopies: 3,
  limitDefault: 20,
  batchDefault: 3,
});

const SKIP_DIRS = new Set([
  ".git",
  ".cursor",
  ".next",
  ".turbo",
  ".cache",
  ".venv",
  ".idea",
  ".vscode",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "out",
  "vendor",
  "venv",
  "__pycache__",
]);

const SKIP_BASENAMES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  ".ds_store",
  ".gitkeep",
  ".keep",
]);

const COMMON_BASENAMES = new Set([
  "index.js",
  "index.ts",
  "index.mjs",
  "index.cjs",
  "index.jsx",
  "index.tsx",
  "readme.md",
  "license",
  "license.md",
  "changelog.md",
  "package.json",
  "skill.md",
  ".gitignore",
  "dockerfile",
  "makefile",
]);

const SOURCE_EXT = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".py",
]);

const TEXT_EXT = new Set([
  ...SOURCE_EXT,
  ".md",
  ".mdc",
  ".json",
  ".yml",
  ".yaml",
  ".toml",
  ".sh",
  ".bash",
  ".css",
  ".html",
  ".vue",
  ".svelte",
  ".sql",
  ".go",
  ".rs",
]);

const SKIP_REL_PREFIX = ["templates/", "fixtures/", "docs/", "assets/"];

const IMPORT_RE =
  /(?:from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\)|import\(\s*['"]([^'"]+)['"]\))/g;
const PY_IMPORT_RE =
  /(?:^|\n)\s*(?:from\s+([A-Za-z0-9_.]+)\s+import|import\s+([A-Za-z0-9_.]+))/g;
const TODO_COMMENT_RE = /(?:\/\/|#)\s*(TODO|FIXME|HACK|XXX)\b/g;
const CONSOLE_RE = /\bconsole\.(log|debug|info)\s*\(/g;
const DEBUGGER_RE = /^\s*debugger\s*;/m;
const JSON_CLONE_RE = /JSON\.parse\s*\(\s*JSON\.stringify/;
const EVAL_RE = /(?:^|[^\w.$])eval\s*\(/;
const COMMENT_CODE_RE =
  /^\s*(\/\/|#)\s*.*\b(const|let|var|function|return|import|export|class|if|for|def)\b/;

const RANK = Object.freeze({ high: 0, med: 1, low: 2 });

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function relPosix(root, abs) {
  return path.relative(root, abs).split(path.sep).join("/");
}

function extOf(rel) {
  return path.extname(rel).toLowerCase();
}

function isTestFile(rel) {
  const base = path.basename(rel).toLowerCase();
  return (
    /\.(test|spec)\./.test(base) ||
    /(^|\/)tests?\//.test(rel) ||
    /(^|\/)__tests__\//.test(rel)
  );
}

function skipRel(rel) {
  const lower = rel.toLowerCase();
  if (SKIP_REL_PREFIX.some((prefix) => lower.startsWith(prefix))) return true;
  if (lower.endsWith(".min.js")) return true;
  return false;
}

export function parseArgs(argv) {
  const out = {
    root: process.cwd(),
    limit: THRESHOLDS.limitDefault,
    batch: THRESHOLDS.batchDefault,
    kinds: [],
    explain: null,
    write: false,
    short: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`missing value for ${arg}`);
      return argv[i];
    };
    switch (arg) {
      case "-h":
      case "--help":
        out.help = true;
        break;
      case "--root":
        out.root = path.resolve(next());
        break;
      case "--limit":
        out.limit = Number(next());
        break;
      case "--batch":
        out.batch = Number(next());
        break;
      case "--kinds":
        out.kinds = next()
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean);
        break;
      case "--explain":
        out.explain = next();
        break;
      case "--write":
        out.write = true;
        break;
      case "--short":
        out.short = true;
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(out.limit) || out.limit <= 0) {
    throw new Error("--limit must be > 0");
  }
  if (!Number.isFinite(out.batch) || out.batch <= 0) {
    throw new Error("--batch must be > 0");
  }
  return out;
}

export function walkFiles(root) {
  const out = [];
  const stack = [root];
  while (stack.length && out.length < THRESHOLDS.maxFiles) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        stack.push(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name.startsWith(".")) continue;
      if (SKIP_BASENAMES.has(entry.name.toLowerCase())) continue;
      const rel = relPosix(root, abs);
      if (rel.startsWith("..")) continue;
      if (skipRel(rel)) continue;
      const ext = extOf(rel);
      if (!TEXT_EXT.has(ext)) continue;
      out.push({ abs, rel });
      if (out.length >= THRESHOLDS.maxFiles) return out;
    }
  }
  return out;
}

function readText(abs) {
  try {
    const st = statSync(abs);
    if (!st.isFile() || st.size > THRESHOLDS.maxBytes) return null;
    const buf = readFileSync(abs);
    if (buf.includes(0)) return null;
    return buf.toString("utf8");
  } catch {
    return null;
  }
}

function lineCount(text) {
  if (!text) return 0;
  return text.split(/\r?\n/).length;
}

function oversizedLimit(rel) {
  return extOf(rel) === ".md" || extOf(rel) === ".mdc"
    ? THRESHOLDS.oversizedDoc
    : THRESHOLDS.oversizedCode;
}

function isEntryPoint(text, rel, pkgRefs) {
  if (!text) return false;
  if (text.startsWith("#!")) return true;
  if (text.includes("isMainModule")) return true;
  if (/(^|\/)bin\//.test(rel)) return true;
  if (pkgRefs.has(rel) || pkgRefs.has(rel.replace(/\.(mjs|cjs|js|ts)$/, ""))) {
    return true;
  }
  return false;
}

function packageRefs(root) {
  const refs = new Set();
  const pkg = readJson(path.join(root, "package.json"));
  if (!pkg || typeof pkg !== "object") return refs;
  const add = (value) => {
    if (typeof value !== "string") return;
    const trimmed = value.replace(/^\.\//, "");
    refs.add(trimmed);
  };
  add(pkg.main);
  add(pkg.module);
  add(pkg.types);
  if (pkg.bin && typeof pkg.bin === "string") add(pkg.bin);
  if (pkg.bin && typeof pkg.bin === "object") {
    for (const value of Object.values(pkg.bin)) add(value);
  }
  const walkExports = (node) => {
    if (typeof node === "string") add(node);
    else if (node && typeof node === "object") {
      for (const value of Object.values(node)) walkExports(value);
    }
  };
  walkExports(pkg.exports);
  return refs;
}

function resolveImport(fromRel, spec, filesByRel) {
  if (!spec || !(spec.startsWith("./") || spec.startsWith("../"))) return null;
  const fromDir = path.posix.dirname(fromRel);
  const base = path.posix.normalize(path.posix.join(fromDir, spec));
  const candidates = [base];
  if (!path.posix.extname(base)) {
    for (const ext of [".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json"]) {
      candidates.push(`${base}${ext}`);
    }
    candidates.push(path.posix.join(base, "index.js"));
    candidates.push(path.posix.join(base, "index.ts"));
    candidates.push(path.posix.join(base, "index.mjs"));
  }
  for (const cand of candidates) {
    if (filesByRel.has(cand)) return cand;
  }
  return null;
}

function collectJsImports(fromRel, text, filesByRel, used) {
  IMPORT_RE.lastIndex = 0;
  let match;
  while ((match = IMPORT_RE.exec(text))) {
    const spec = match[1] || match[2] || match[3];
    const resolved = resolveImport(fromRel, spec, filesByRel);
    if (resolved) used.add(resolved);
  }
}

function collectPyImports(text, filesByRel, used) {
  PY_IMPORT_RE.lastIndex = 0;
  let match;
  while ((match = PY_IMPORT_RE.exec(text))) {
    const mod = match[1] || match[2];
    if (!mod) continue;
    const relBase = mod.replace(/\./g, "/");
    for (const cand of [
      `${relBase}.py`,
      `${relBase}/__init__.py`,
      `src/${relBase}.py`,
    ]) {
      if (filesByRel.has(cand)) used.add(cand);
    }
  }
}

function consecutiveCommentCode(text) {
  let run = 0;
  let best = 0;
  for (const line of text.split(/\r?\n/)) {
    if (COMMENT_CODE_RE.test(line)) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

function liveCode(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (
        trimmed.startsWith("//") ||
        trimmed.startsWith("#") ||
        trimmed.startsWith("*")
      ) {
        return false;
      }
      if (/^['"`]/.test(trimmed)) return false;
      if (/=\s*\//.test(line) || /=\s*new RegExp/.test(line)) return false;
      return true;
    })
    .join("\n");
}

function finding(kind, severity, filePath, why, suggestedAction, risk, extra = {}) {
  return {
    id: `${kind}:${filePath}`,
    kind,
    severity,
    path: filePath,
    why,
    suggestedAction,
    risk,
    ...extra,
  };
}

function skillNoProve(root) {
  const findings = [];
  const skillsRoot = path.join(root, "skills");
  if (!existsSync(skillsRoot)) return findings;
  let names;
  try {
    names = readdirSync(skillsRoot);
  } catch {
    return findings;
  }
  for (const name of names) {
    const dir = path.join(skillsRoot, name);
    const scripts = path.join(dir, "scripts");
    if (!existsSync(path.join(dir, "SKILL.md")) || !existsSync(scripts)) continue;
    let entries;
    try {
      entries = readdirSync(scripts);
    } catch {
      continue;
    }
    const hasScript = entries.some((file) => file.endsWith(".mjs") || file.endsWith(".js"));
    const hasTest = entries.some((file) => file.endsWith(".test.mjs") || file.endsWith(".test.js"));
    if (hasScript && !hasTest) {
      const rel = `skills/${name}/scripts`;
      findings.push(
        finding(
          "skill-no-prove",
          "med",
          rel,
          "Skill has a compiler script but no unit test beside it.",
          "fix",
          "Regressions can land unnoticed. Add a test or delete the unused script."
        )
      );
    }
  }
  return findings;
}

function skillOverlapFindings(root) {
  const dirs = listSkillDirs(root);
  if (dirs.length < 2) return [];
  const inv = inventoryFromDirs(dirs);
  return (inv.overlap ?? []).slice(0, 8).map((pair) =>
    finding(
      "skill-overlap",
      "low",
      `skills/${pair.a}`,
      `Description overlap with ${pair.b} (Jaccard ${pair.score}).`,
      "read",
      "Merging the wrong pair drops a real workflow. Human applies curator changes.",
      { other: `skills/${pair.b}`, score: pair.score }
    )
  );
}

export function collectFindings(root) {
  const files = walkFiles(root);
  const filesByRel = new Map(files.map((file) => [file.rel, file]));
  const pkgRefs = packageRefs(root);
  const used = new Set();
  const findings = [];
  const byBase = new Map();
  const importers = new Map();

  for (const file of files) {
    const base = path.basename(file.rel).toLowerCase();
    if (!COMMON_BASENAMES.has(base)) {
      const list = byBase.get(base) ?? [];
      list.push(file.rel);
      byBase.set(base, list);
    }
    const text = readText(file.abs);
    if (text == null) continue;
    file.text = text;
    file.lines = lineCount(text);
    file.entry = isEntryPoint(text, file.rel, pkgRefs);
    if (SOURCE_EXT.has(extOf(file.rel))) {
      collectJsImports(file.rel, text, filesByRel, used);
      if (extOf(file.rel) === ".py") collectPyImports(text, filesByRel, used);
    }
  }

  IMPORT_RE.lastIndex = 0;
  for (const file of files) {
    if (!file.text || !SOURCE_EXT.has(extOf(file.rel))) continue;
    IMPORT_RE.lastIndex = 0;
    let match;
    while ((match = IMPORT_RE.exec(file.text))) {
      const spec = match[1] || match[2] || match[3];
      const resolved = resolveImport(file.rel, spec, filesByRel);
      if (!resolved) continue;
      const list = importers.get(resolved) ?? [];
      list.push(file.rel);
      importers.set(resolved, list);
    }
  }

  for (const file of files) {
    const text = file.text;
    if (text == null) continue;
    const rel = file.rel;
    const lines = file.lines ?? lineCount(text);
    const limit = oversizedLimit(rel);
    if (lines >= THRESHOLDS.oversizedHigh) {
      findings.push(
        finding(
          "oversized",
          "high",
          rel,
          `${lines} lines (threshold ${THRESHOLDS.oversizedHigh}). Hard to read and easy to drift.`,
          "fix",
          "Blind splits can break callers. Extract after reading the public surface."
        )
      );
    } else if (lines >= limit && SOURCE_EXT.has(extOf(rel))) {
      findings.push(
        finding(
          "oversized",
          "med",
          rel,
          `${lines} lines (threshold ${limit}). Consider a split or a references/ file.`,
          "read",
          "A long file may still be the right module. Read before splitting."
        )
      );
    }

    TODO_COMMENT_RE.lastIndex = 0;
    const todos = text.match(TODO_COMMENT_RE)?.length ?? 0;
    if (todos >= THRESHOLDS.todoPile) {
      findings.push(
        finding(
          "todo-pile",
          "med",
          rel,
          `${todos} unfinished-work comment markers. They are rotting in-tree.`,
          "fix",
          "Some reminders are load-bearing. Convert or delete with the user."
        )
      );
    }

    const trimmed = text.trim();
    if (
      trimmed.length <= THRESHOLDS.emptyBytes &&
      !isTestFile(rel) &&
      extOf(rel) !== ".md"
    ) {
      findings.push(
        finding(
          "empty-stub",
          "high",
          rel,
          "File is empty or nearly empty.",
          "scrap",
          "Confirm it is not a required placeholder, then delete."
        )
      );
    }

    if (SOURCE_EXT.has(extOf(rel)) && !isTestFile(rel)) {
      const code = liveCode(text);
      DEBUGGER_RE.lastIndex = 0;
      CONSOLE_RE.lastIndex = 0;
      const hasDebugger = DEBUGGER_RE.test(code);
      const logs = code.match(CONSOLE_RE)?.length ?? 0;
      if (hasDebugger) {
        findings.push(
          finding(
            "debug-leftover",
            "high",
            rel,
            "Contains a debugger statement.",
            "scrap",
            "Removing it is usually safe; keep only if this is a documented debug harness."
          )
        );
      } else if (logs >= THRESHOLDS.debugLogs) {
        findings.push(
          finding(
            "debug-leftover",
            "med",
            rel,
            `${logs} console.log/debug/info calls. Likely leftover noise.`,
            "fix",
            "CLI tools may print on purpose. Prefer stdout helpers over stray logs."
          )
        );
      }
      if (JSON_CLONE_RE.test(code)) {
        findings.push(
          finding(
            "json-clone",
            "low",
            rel,
            "Deep-clones via JSON round-trip. Slow and drops types/undefined.",
            "fix",
            "Replace with a structured clone or a typed copy after checking callers."
          )
        );
      }
      if (EVAL_RE.test(code)) {
        findings.push(
          finding(
            "eval-use",
            "high",
            rel,
            "Calls the eval builtin. Easy footgun and usually unnecessary.",
            "fix",
            "Confirm there is no dynamic contract, then replace with explicit code."
          )
        );
      }
      const commentRun = consecutiveCommentCode(text);
      if (commentRun >= THRESHOLDS.commentedRun) {
        findings.push(
          finding(
            "commented-out",
            "med",
            rel,
            `${commentRun} consecutive commented-out code lines. Garbage that hides the live path.`,
            "scrap",
            "Git already keeps history. Delete the block unless the user wants it restored."
          )
        );
      }
    }
  }

  for (const [base, paths] of byBase) {
    if (paths.length < THRESHOLDS.duplicateCopies) continue;
    findings.push(
      finding(
        "duplicate-name",
        "med",
        paths[0],
        `${paths.length} files named ${base}: ${paths.slice(0, 6).join(", ")}.`,
        "read",
        "Same name is not the same module. Compare before merging.",
        { copies: paths.slice(0, 8) }
      )
    );
  }

  for (const file of files) {
    if (!SOURCE_EXT.has(extOf(file.rel))) continue;
    if (isTestFile(file.rel) || file.entry) continue;
    if (used.has(file.rel)) continue;
    if (skipRel(file.rel)) continue;
    findings.push(
      finding(
        "likely-orphan",
        "high",
        file.rel,
        "No inbound relative import found. Candidate dead file.",
        "scrap",
        "Dynamic import, PATH CLI, or string-built paths will false-positive. Search before delete."
      )
    );
  }

  findings.push(...skillNoProve(root));
  findings.push(...skillOverlapFindings(root));

  return { findings, importers, filesScanned: files.length };
}

export function rankFindings(findings) {
  return [...findings].sort((a, b) => {
    const sa = RANK[a.severity] ?? 9;
    const sb = RANK[b.severity] ?? 9;
    if (sa !== sb) return sa - sb;
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.path.localeCompare(b.path);
  });
}

export function renderMermaid(summary) {
  const kinds = summary.byKind ?? {};
  const nodes = Object.entries(kinds)
    .slice(0, 8)
    .map(([kind, count], i) => `    k${i}["${kind} ${count}"]`)
    .join("\n");
  const links = Object.keys(kinds)
    .slice(0, 8)
    .map((_, i) => `    hygiene --> k${i}`)
    .join("\n");
  return `flowchart TB
  subgraph hygiene [code hygiene]
    hygiene["findings ${summary.findingCount ?? 0}"]
    high["high ${summary.high ?? 0}"]
    med["med ${summary.med ?? 0}"]
${nodes || '    none["clean"]'}
  end
  hygiene --> high
  hygiene --> med
${Object.keys(kinds).length ? links : ""}
`;
}

function summarize(findings) {
  const byKind = {};
  let high = 0;
  let med = 0;
  let low = 0;
  for (const item of findings) {
    byKind[item.kind] = (byKind[item.kind] ?? 0) + 1;
    if (item.severity === "high") high += 1;
    else if (item.severity === "med") med += 1;
    else low += 1;
  }
  return {
    findingCount: findings.length,
    high,
    med,
    low,
    byKind,
  };
}

function attachImporters(findings, importers) {
  return findings.map((item) => {
    const inbound = importers.get(item.path) ?? [];
    if (inbound.length === 0) return item;
    return { ...item, importers: inbound.slice(0, 8) };
  });
}

export function shortLine(summary) {
  return `hygiene findings=${summary.findingCount} high=${summary.high}. /code-hygiene to read and decide.`;
}

export function buildHygiene(root, options = {}) {
  const scanned = collectFindings(root);
  let findings = rankFindings(scanned.findings);
  if (options.kinds?.length) {
    const allow = new Set(options.kinds);
    findings = findings.filter((item) => allow.has(item.kind));
  }
  if (options.explain) {
    const target = options.explain.split(path.sep).join("/");
    findings = findings.filter(
      (item) =>
        item.path === target ||
        item.path.endsWith(`/${target}`) ||
        item.path.startsWith(`${target}/`) ||
        (Array.isArray(item.copies) && item.copies.includes(target))
    );
  }
  const limited = findings.slice(0, options.limit ?? THRESHOLDS.limitDefault);
  const withImports = attachImporters(limited, scanned.importers);
  const summary = summarize(withImports);
  const batch = options.batch ?? THRESHOLDS.batchDefault;
  const mermaid = renderMermaid(summary);
  return {
    schemaVersion: 1,
    ok: true,
    filesScanned: scanned.filesScanned,
    summary,
    findings: withImports,
    present: withImports.slice(0, batch),
    mermaid,
    readLoop: {
      batchSize: batch,
      options: ["scrap", "fix", "keep"],
      rule: "Present at most 3 findings. Explain each file in plain language. Wait for scrap | fix | keep. Do not auto-delete.",
    },
    hostHints: [
      "If a host deslop skill is available, use it only on files the user already chose to scrap.",
      "If a host code-quality review skill is available, pin cheap and apply only to decided files.",
    ],
    next: [
      "Read present[] files. Explain, then wait.",
      "Implement only chosen scrap/fix.",
      "grok-kit verify-aci --phase drive",
    ],
  };
}

function writeReport(root, payload) {
  const file = path.join(root, ".cursor/hygiene.json");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  const ignore = path.join(root, ".gitignore");
  let existing = "";
  if (existsSync(ignore)) existing = readFileSync(ignore, "utf8");
  if (!existing.includes(".cursor/hygiene.json")) {
    const prefix = existing && !existing.endsWith("\n") ? "\n" : "";
    writeFileSync(ignore, `${existing}${prefix}.cursor/hygiene.json\n`);
  }
  return file;
}

export function runHygiene(argv, io = {}) {
  const stdout = io.stdout ?? ((text) => process.stdout.write(text));
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    stdout(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    return 64;
  }
  if (options.help) {
    stdout(HELP);
    return 0;
  }
  const payload = buildHygiene(options.root, {
    limit: options.limit,
    batch: options.batch,
    kinds: options.kinds,
    explain: options.explain,
  });
  if (options.write) {
    payload.written = writeReport(options.root, payload);
  }
  if (options.short) {
    stdout(
      `${JSON.stringify({
        schemaVersion: 1,
        ok: true,
        line: shortLine(payload.summary),
        summary: payload.summary,
      })}\n`
    );
    return 0;
  }
  stdout(`${JSON.stringify(payload)}\n`);
  return 0;
}

export { HELP };

if (isMainModule(import.meta.url)) {
  process.exit(runHygiene(process.argv.slice(2)));
}
