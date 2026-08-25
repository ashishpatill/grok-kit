#!/usr/bin/env node
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "../../../scripts/lib/is-main.mjs";

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const PROFILE_NAMES = Object.freeze([
  "generic",
  "nextjs-clerk-neon",
  "research-python",
  "agentic-framework",
  "tell-proof",
]);

const PROFILES = new Set(PROFILE_NAMES);

const GITIGNORE_LINES = [
  ".cursor/rlm-state/",
  ".cursor/handoff.md",
  "PENDING_MEMORY.md",
  ".cursor/verify/last.log",
  ".cursor/verify/last.json",
  ".cursor/grok-kit-usage.jsonl",
  ".cursor/grok-kit-proposals.json",
];

const HELP = `bootstrap — copy grok-kit project layer without overwriting rich files

Usage:
  bootstrap [--root DIR] [--profile NAME] [--dry-run] [--force-verify]

Profiles: generic, nextjs-clerk-neon, research-python, agentic-framework, tell-proof
`;

const GENERIC_CORE = `---
description: Repo invariants
alwaysApply: true
---

# Core

- Keep always-on rules tiny; put procedures in skills
- Prove claimed work with \`.cursor/verify/verify.sh\` (\`/verify-aci\`)
- Do not commit secrets
`;

const GENERIC_AGENTS = `# Project

## Stack

(describe)

## Run / test

\`./.cursor/verify/verify.sh\` (or \`/verify-aci\`)

## Conventions

## Skills index

/route-task  /verify-aci  /rubric-verify  /watch-ci  /plan-execute  /orchestrate-rlm

## Gotchas

## ICM topic

project-<slug>
`;

const KIT_SECTION = `
## grok-kit

- Adaptation SoT: \`.cursor/grok-kit.json\` (regenerate with \`grok-kit apply\`)
- Route work with \`/route-task\` (bug | feature | investigate | ship)
- Prove: \`/verify-aci\` (\`.cursor/verify/verify.sh\` doctor/launch/drive)
- Score the diff: \`/rubric-verify\`
- PR merge-state: \`/watch-ci --status-once\` (not a green checkbox list)
`;

const TELL_PROOF_SECTION = `
- UI prove: \`tell_proof_verify\` (Tell MCP). Never auto-apply \`tell_apply\` patches.
`;

export function parseArgs(argv) {
  const out = {
    root: process.cwd(),
    profile: "generic",
    dryRun: false,
    forceVerify: false,
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
      case "--profile":
        out.profile = next();
        break;
      case "--dry-run":
        out.dryRun = true;
        break;
      case "--force-verify":
        out.forceVerify = true;
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!PROFILES.has(out.profile)) {
    throw new Error(`unknown profile: ${out.profile}`);
  }
  return out;
}

function readKit(rel) {
  return readFileSync(path.join(KIT, rel), "utf8");
}

function planWrite(rel, contents, exists, force) {
  if (exists && !force) return { rel, action: "skip" };
  return { rel, action: exists ? "overwrite" : "create", contents };
}

export function planBootstrap(root, options) {
  const steps = [];
  steps.push(
    planWrite(
      ".cursor/verify/verify.sh",
      readKit("templates/_shared/verify/verify.sh"),
      existsSync(path.join(root, ".cursor/verify/verify.sh")),
      options.forceVerify
    )
  );
  steps.push(
    planWrite(
      ".cursor/verify/feature-map.json",
      readKit("templates/_shared/verify/feature-map.example.json"),
      existsSync(path.join(root, ".cursor/verify/feature-map.json")),
      false
    )
  );
  steps.push(
    planWrite(
      ".cursor/verify/rubric.json",
      readKit("templates/_shared/rubric/checklist.example.json"),
      existsSync(path.join(root, ".cursor/verify/rubric.json")),
      false
    )
  );
  const core =
    options.profile === "generic"
      ? GENERIC_CORE
      : readKit(`templates/${options.profile}/core.mdc`);
  steps.push(
    planWrite(
      ".cursor/rules/core.mdc",
      core,
      existsSync(path.join(root, ".cursor/rules/core.mdc")),
      false
    )
  );
  steps.push(
    planWrite(
      ".cursorignore",
      readKit("templates/_shared/project-layer/cursorignore"),
      existsSync(path.join(root, ".cursorignore")),
      false
    )
  );
  steps.push(
    planWrite(
      ".cursorindexingignore",
      readKit("templates/_shared/project-layer/.cursorindexingignore"),
      existsSync(path.join(root, ".cursorindexingignore")),
      false
    )
  );

  const agentsPath = path.join(root, "AGENTS.md");
  if (!existsSync(agentsPath)) {
    let body = GENERIC_AGENTS;
    if (options.profile !== "generic") {
      const snippet = readKit(`templates/${options.profile}/AGENTS.snippet.md`);
      body = body.replace("(describe)", snippet.trim());
    }
    steps.push({ rel: "AGENTS.md", action: "create", contents: body });
  } else {
    const current = readFileSync(agentsPath, "utf8");
    if (!/verify-aci/.test(current)) {
      const extra = options.profile === "tell-proof" ? TELL_PROOF_SECTION : "";
      steps.push({
        rel: "AGENTS.md",
        action: "append",
        contents: `${KIT_SECTION}${extra}`,
      });
    } else {
      steps.push({ rel: "AGENTS.md", action: "skip" });
    }
  }

  const gitignorePath = path.join(root, ".gitignore");
  const existingGit = existsSync(gitignorePath)
    ? readFileSync(gitignorePath, "utf8")
    : "";
  const missing = GITIGNORE_LINES.filter((line) => !existingGit.includes(line));
  if (missing.length === 0 && existsSync(gitignorePath)) {
    steps.push({ rel: ".gitignore", action: "skip" });
  } else {
    const prefix = existingGit && !existingGit.endsWith("\n") ? "\n" : "";
    steps.push({
      rel: ".gitignore",
      action: existsSync(gitignorePath) ? "append" : "create",
      contents: `${prefix}${missing.join("\n")}\n`,
    });
  }

  return steps;
}

function applyStep(root, step) {
  if (step.action === "skip") return;
  const dest = path.join(root, step.rel);
  mkdirSync(path.dirname(dest), { recursive: true });
  if (step.action === "append") {
    const prev = existsSync(dest) ? readFileSync(dest, "utf8") : "";
    writeFileSync(dest, `${prev}${step.contents}`);
  } else {
    writeFileSync(dest, step.contents);
  }
  if (step.rel.endsWith(".sh")) chmodSync(dest, 0o755);
}

export function runBootstrap(argv, io = {}) {
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
  const steps = planBootstrap(options.root, options);
  if (!options.dryRun) {
    for (const step of steps) applyStep(options.root, step);
  }
  stdout(
    `${JSON.stringify({
      schemaVersion: 1,
      ok: true,
      root: options.root,
      profile: options.profile,
      dryRun: options.dryRun,
      steps: steps.map(({ contents: _contents, ...rest }) => rest),
    })}\n`
  );
  return 0;
}

export { HELP, KIT, GITIGNORE_LINES, KIT_SECTION, TELL_PROOF_SECTION, PROFILES };

if (isMainModule(import.meta.url)) {
  process.exit(runBootstrap(process.argv.slice(2)));
}
