#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isMainModule } from "../../../scripts/lib/is-main.mjs";
import {
  emitEpisodic,
  memoryEmitEnabled,
} from "../../lib/bot-memory-propose.mjs";

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
  grok-kit session-handoff close [--root DIR] [--project NAME] [--max-lines N] [--no-emit]

close = check, then emit an episodic handoff record via MCP propose() when
DATABASE_URL/BOT_MEMORY_URL is set (P2.K2). Pass --no-emit or MEMORY_EMIT=0
to skip the memory write.
`;

function parseArgs(argv) {
  const out = {
    cmd: argv[0] ?? "",
    root: process.cwd(),
    project: "project",
    force: false,
    maxLines: 80,
    help: false,
    noEmit: false,
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
      case "--no-emit":
        out.noEmit = true;
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

function summarizeHandoff(body, project) {
  const lines = String(body || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const pick = (heading) => {
    const i = lines.findIndex((l) => l === `## ${heading}`);
    if (i < 0) return "";
    const out = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      if (lines[j].startsWith("## ")) break;
      out.push(lines[j]);
    }
    return out.join(" ").slice(0, 280);
  };
  const goal = pick("Goal");
  const done = pick("Done");
  const next = pick("Next steps");
  return `Session handoff for ${project}: goal=${goal || "(none)"}; done=${done || "(none)"}; next=${next || "(none)"}`.slice(
    0,
    900
  );
}

export async function runSessionHandoff(argv, io = {}) {
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
  if (options.cmd === "close") {
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
    const body = readFileSync(dest, "utf8");
    const verdict = checkHandoff(body, { maxLines: options.maxLines });
    if (!verdict.ok) {
      stdout(`${JSON.stringify({ ...verdict, path: dest, action: "close" })}\n`);
      return 1;
    }
    const slug = String(options.project || "project")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project";
    const namespace = `handoff-${slug}`;
    let memory = { skipped: true, reason: "emit-disabled" };
    const wantEmit = !options.noEmit && (io.proposeFn || memoryEmitEnabled());
    if (wantEmit) {
      memory = await emitEpisodic({
        namespace,
        text: summarizeHandoff(body, slug),
        metadata: {
          author: "session-handoff",
          origin: "session-handoff-close",
          scope: "node_local",
          source_session: `handoff-${slug}-${Date.now()}`,
          importance: 6,
        },
        proposeFn: io.proposeFn,
        databaseUrl: io.databaseUrl,
      });
    }
    stdout(
      `${JSON.stringify({
        schemaVersion: 1,
        ok: true,
        action: "close",
        path: dest,
        namespace,
        memory,
      })}\n`
    );
    return memory.status === "error" ? 1 : 0;
  }
  stdout(
    `${JSON.stringify({ ok: false, error: `unknown command ${options.cmd}` })}\n`
  );
  return 64;
}

export { HELP, HEADINGS };

if (isMainModule(import.meta.url)) {
  runSessionHandoff(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
      process.exit(1);
    });
}
