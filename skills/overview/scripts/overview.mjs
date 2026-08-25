#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isMainModule } from "../../../scripts/lib/is-main.mjs";

const HELP = `overview — project status (flagship / visualise / overview)

Usage:
  overview [--root DIR] [--when start|end|now] [--mode overview|visualise|flagship]
           [--short] [--write]

Session start/end: grok-kit flagship --when start|end
Status JSON:       grok-kit overview
Picture:           grok-kit visualise

Does not rewrite always-on rules (KV cache). Optional --write is gitignored.
If a host canvas skill is available, render the JSON there for the visual look.
`;

const WHENS = new Set(["start", "end", "now"]);
const MODES = new Set(["overview", "visualise", "visualize", "flagship"]);

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function git(root, args) {
  try {
    return execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

export function parseArgs(argv) {
  const out = {
    root: process.cwd(),
    when: "now",
    mode: "overview",
    short: false,
    write: false,
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
      case "--when":
        out.when = next();
        break;
      case "--mode":
        out.mode = next();
        break;
      case "--short":
        out.short = true;
        break;
      case "--write":
        out.write = true;
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!WHENS.has(out.when)) throw new Error(`unknown --when: ${out.when}`);
  if (!MODES.has(out.mode)) throw new Error(`unknown --mode: ${out.mode}`);
  if (out.mode === "visualize") out.mode = "visualise";
  return out;
}

export function gitSnapshot(root) {
  const inside = git(root, ["rev-parse", "--is-inside-work-tree"]) === "true";
  if (!inside) {
    return { repo: false, branch: null, dirtyCount: 0, dirty: [], recent: [] };
  }
  const branch = git(root, ["branch", "--show-current"]) || "HEAD";
  const porcelain = git(root, ["status", "--porcelain"]);
  const dirty = porcelain
    ? porcelain
        .split("\n")
        .map((line) => line.slice(3).trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];
  const log = git(root, ["log", "-5", "--pretty=%h %s"]);
  const recent = log
    ? log
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
  return {
    repo: true,
    branch,
    dirtyCount: dirty.length,
    dirty,
    recent,
  };
}

export function kitSnapshot(root) {
  const manifest = readJson(path.join(root, ".cursor/grok-kit.json"));
  const handoff = path.join(root, ".cursor/handoff.md");
  let handoffState = "missing";
  if (existsSync(handoff)) {
    const text = readFileSync(handoff, "utf8");
    handoffState = /\(describe\)/.test(text) ? "needs-fill" : "ready";
  }
  const lastVerify = readJson(path.join(root, ".cursor/verify/last.json"));
  return {
    profile: manifest?.profile ?? null,
    enabled: Array.isArray(manifest?.enabled) ? manifest.enabled.slice(0, 12) : [],
    prove: manifest?.prove?.verify ?? null,
    handoff: handoffState,
    lastVerifyOk: lastVerify?.ok ?? null,
  };
}

export function renderMermaid(kit, gitInfo) {
  const branch = (gitInfo.branch || "none").replace(/"/g, "");
  const profile = (kit.profile || "unknown").replace(/"/g, "");
  const enabled = (kit.enabled || []).slice(0, 8);
  const nodes = enabled
    .map((name, i) => {
      const id = `f${i}`;
      const label = String(name).replace(/"/g, "");
      return `    ${id}["${label}"]`;
    })
    .join("\n");
  const links = enabled.map((_, i) => `    profile --> f${i}`).join("\n");
  return `flowchart TB
  subgraph git [git]
    branch["${branch}"]
    dirty["dirty ${gitInfo.dirtyCount ?? 0}"]
  end
  subgraph kit [grok-kit]
    profile["${profile}"]
${nodes || '    none["no grok-kit.json"]'}
  end
  branch --> profile
  dirty --> profile
${enabled.length ? links : ""}
`;
}

export function shortLine(payload) {
  const branch = payload.git?.branch || "n/a";
  const dirty = payload.git?.dirtyCount ?? 0;
  const profile = payload.kit?.profile || "none";
  const when = payload.when || "now";
  return `flagship ${when} branch=${branch} dirty=${dirty} profile=${profile}. /overview for status, /visualise for the picture, /code-hygiene for drift.`;
}

export function buildOverview(root, options = {}) {
  const when = options.when ?? "now";
  const gitInfo = gitSnapshot(root);
  const kit = kitSnapshot(root);
  const mermaid = renderMermaid(kit, gitInfo);
  const look =
    "If a host canvas skill is available, render this JSON as a status canvas (cards + diagram). Otherwise show the mermaid in chat.";
  return {
    schemaVersion: 1,
    ok: true,
    when,
    mode: options.mode ?? "overview",
    git: gitInfo,
    kit,
    mermaid,
    look,
    next:
      when === "end"
        ? ["Fill /session-handoff if the session was deep.", "grok-kit flagship --when end"]
        : ["grok-kit overview", "grok-kit visualise", "grok-kit flagship --when start", "grok-kit hygiene"],
  };
}

export function runOverview(argv, io = {}) {
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
  const payload = buildOverview(options.root, {
    when: options.when,
    mode: options.mode,
  });
  if (options.write) {
    const file = path.join(options.root, ".cursor/overview.json");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
    payload.written = file;
    const ignore = path.join(options.root, ".gitignore");
    let existing = "";
    if (existsSync(ignore)) existing = readFileSync(ignore, "utf8");
    if (!existing.includes(".cursor/overview.json")) {
      const prefix = existing && !existing.endsWith("\n") ? "\n" : "";
      writeFileSync(ignore, `${existing}${prefix}.cursor/overview.json\n`);
    }
  }
  if (options.short) {
    stdout(
      `${JSON.stringify({
        schemaVersion: 1,
        ok: true,
        line: shortLine(payload),
        when: payload.when,
      })}\n`
    );
    return 0;
  }
  if (options.mode === "visualise") {
    stdout(
      `${JSON.stringify({
        schemaVersion: 1,
        ok: true,
        mode: "visualise",
        mermaid: payload.mermaid,
        look: payload.look,
        git: { branch: payload.git.branch, dirtyCount: payload.git.dirtyCount },
        kit: { profile: payload.kit.profile },
      })}\n`
    );
    return 0;
  }
  stdout(`${JSON.stringify(payload)}\n`);
  return 0;
}

export { HELP };

if (isMainModule(import.meta.url)) {
  process.exit(runOverview(process.argv.slice(2)));
}
