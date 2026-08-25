#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isMainModule } from "../../../scripts/lib/is-main.mjs";

const HEADINGS = [
  "Goal",
  "Done",
  "Decisions",
  "Next steps",
  "Key paths",
  "Open risks",
  "Verify commands",
];

const SECRET_RX = /(API_KEY|SECRET|TOKEN)\s*=\s*['"][^'"]+/;

const HELP = `session-handoff — write and check a gitignored handoff file

Usage:
  grok-kit session-handoff init [--root DIR] [--project NAME] [--force]
  grok-kit session-handoff check [--root DIR] [--max-lines N]
`;

function parseArgs(argv) {
  const out = {
    cmd: argv[0] ?? "",
    root: process.cwd(),
    project: "project",
    force: false,
    maxLines: 80,
    help: false,
  };
  for (let i = 1; i < argv.length; i += 1) {
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
      case "--project":
        out.project = next();
        break;
      case "--force":
        out.force = true;
        break;
      case "--max-lines":
        out.maxLines = Number(next());
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(out.maxLines) || out.maxLines <= 0) {
    throw new Error("--max-lines must be > 0");
  }
  return out;
}

function handoffPath(root) {
  return path.join(root, ".cursor", "handoff.md");
}

export function skeleton(project, date = new Date().toISOString().slice(0, 10)) {
  return `# Handoff — ${project} — ${date}

## Goal

(describe)

## Done

-

## Decisions

-

## Next steps

1.

## Key paths

-

## Open risks

-

## Verify commands

\`\`\`bash
grok-kit verify-aci --phase doctor
grok-kit flagship --when end
\`\`\`
`;
}

export function checkHandoff(text, { maxLines = 80 } = {}) {
  const headings = [...text.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
  const missing = HEADINGS.filter(
    (name) => !headings.some((h) => h.toLowerCase() === name.toLowerCase())
  );
  const warnings = [];
  const lines = text.split(/\r?\n/);
  if (lines.length > maxLines) {
    warnings.push(`handoff is ${lines.length} lines; keep ≤${maxLines}`);
  }
  const placeholder = /\(describe\)/i.test(text);
  const secrets = SECRET_RX.test(text);
  return {
    schemaVersion: 1,
    ok: missing.length === 0 && !placeholder && !secrets,
    missing,
    placeholder,
    secrets,
    warnings,
    lineCount: lines.length,
  };
}

export function runSessionHandoff(argv, io = {}) {
  const stdout = io.stdout ?? ((text) => process.stdout.write(text));
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    stdout(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    return 64;
  }
  if (options.help || options.cmd === "-h" || options.cmd === "--help") {
    stdout(HELP);
    return 0;
  }
  if (!options.cmd) {
    stdout(HELP);
    return 64;
  }
  if (options.cmd === "init") {
    const dest = handoffPath(options.root);
    if (existsSync(dest) && !options.force) {
      stdout(
        `${JSON.stringify({
          schemaVersion: 1,
          ok: true,
          action: "skip",
          path: dest,
        })}\n`
      );
      return 0;
    }
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, skeleton(options.project));
    stdout(
      `${JSON.stringify({
        schemaVersion: 1,
        ok: true,
        action: "create",
        path: dest,
        next: "Fill in (describe) and run session-handoff check.",
      })}\n`
    );
    return 0;
  }
  if (options.cmd === "check") {
    const dest = handoffPath(options.root);
    if (!existsSync(dest)) {
      stdout(
        `${JSON.stringify({
          ok: false,
          error: "missing-handoff",
          path: dest,
          next: "grok-kit session-handoff init",
        })}\n`
      );
      return 2;
    }
    const verdict = checkHandoff(readFileSync(dest, "utf8"), {
      maxLines: options.maxLines,
    });
    stdout(`${JSON.stringify({ ...verdict, path: dest })}\n`);
    return verdict.ok ? 0 : 1;
  }
  stdout(
    `${JSON.stringify({ ok: false, error: `unknown command ${options.cmd}` })}\n`
  );
  return 64;
}

export { HELP, HEADINGS };

if (isMainModule(import.meta.url)) {
  process.exit(runSessionHandoff(process.argv.slice(2)));
}
