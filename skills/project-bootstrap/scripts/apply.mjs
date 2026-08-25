#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isMainModule } from "../../../scripts/lib/is-main.mjs";
import { hasScope, readConsent } from "../../../scripts/consent.mjs";
import { KIT, PROFILE_NAMES, runBootstrap } from "./bootstrap.mjs";
import { chooseAdaptation, detectProject } from "./detect.mjs";

const HELP = `apply — detect this repo, bootstrap a thin kit layer, write adaptation SoT

Usage:
  apply [--root DIR] [--profile NAME] [--if-missing] [--require-git]
        [--require-consent] [--detect-only] [--dry-run] [--write-mcp]

Detects stack, picks a profile, runs bootstrap (skip existing rich files),
and writes:
  .cursor/grok-kit.json
  .cursor/rules/grok-kit-project.mdc

Direct grok-kit apply is explicit per-repo consent. sessionStart passes
--require-consent so background apply runs only after grok-kit install --i-consent.

--if-missing        no-op when .cursor/grok-kit.json already exists
--require-git       skip when DIR is not a git work tree (sessionStart hook)
--require-consent   skip writes unless ~/.cursor/grok-kit-consent.json has project-apply
--detect-only       print adaptation JSON; write nothing
--write-mcp         copy Tell MCP into .cursor/mcp.json when recommended and missing

Profiles: ${PROFILE_NAMES.join(", ")}
`;

export const FEATURE_HOW = Object.freeze({
  "route-task": "`/route-task` (bug|feature|investigate|ship), then leave the skill.",
  "cost-check": "`/cost-check` before expensive runs. Auto Balance default.",
  "verify-aci": "`grok-kit verify-aci` (doctor / launch / drive).",
  "rubric-verify": "`grok-kit rubric-verify`.",
  "watch-ci": "`grok-kit watch-ci --status-once` (merge-state, not a green list).",
  "session-handoff": "`/session-handoff` at the end of a deep session.",
  "memory-sync": "`/memory-sync` for durable facts. Propose; never silent identity writes.",
  "plan-execute": "`/plan-execute` for ambiguous multi-file work, then Agent after approval.",
  "orchestrate-rlm":
    "`/orchestrate-rlm` for multi-unit work. `grok-kit state-tools` compiles STATE.md. Children summarize; depth 1.",
  "tell-proof":
    "UI prove: `tell_proof_verify` (not a screenshot). Never auto-apply `tell_apply`. Tell MCP stays project-scoped.",
  "skill-curator": "`grok-kit skill-curator` / `/skill-curator-manual` (manual apply).",
  "usage-learn":
    "Observe usage after `install --learn`. Adapt `grok-kit.json` only with `--improve` or `learn apply --i-consent`.",
});

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function kitVersion() {
  return readJson(path.join(KIT, "plugin.json"))?.version ?? "0.0.0";
}

export function isGitRepo(root) {
  try {
    execFileSync("git", ["-C", root, "rev-parse", "--is-inside-work-tree"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return existsSync(path.join(root, ".git"));
  }
}

export function parseArgs(argv) {
  const out = {
    root: process.cwd(),
    profile: null,
    dryRun: false,
    ifMissing: false,
    requireGit: false,
    detectOnly: false,
    writeMcp: false,
    requireConsent: false,
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
      case "--if-missing":
        out.ifMissing = true;
        break;
      case "--require-git":
        out.requireGit = true;
        break;
      case "--detect-only":
        out.detectOnly = true;
        break;
      case "--write-mcp":
        out.writeMcp = true;
        break;
      case "--require-consent":
        out.requireConsent = true;
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (out.profile && !PROFILE_NAMES.includes(out.profile)) {
    throw new Error(`unknown profile: ${out.profile}`);
  }
  return out;
}

export function writeIfChanged(file, contents) {
  if (existsSync(file)) {
    try {
      if (readFileSync(file, "utf8") === contents) return false;
    } catch {
      // fall through and write
    }
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents);
  return true;
}

export function renderProjectRule(adaptation) {
  const enabledLines = adaptation.enabled
    .map((name) => `- **${name}**: ${FEATURE_HOW[name] ?? name}`)
    .join("\n");
  const available = adaptation.available.map((name) => `\`${name}\``).join(", ");
  const mcp =
    adaptation.mcpRecommended.length > 0
      ? `- Recommended project MCP (do not enable globally): ${adaptation.mcpRecommended.join(", ")}`
      : "- No extra product MCP. User-global stays ICM-only.";
  const proveUi = adaptation.prove.ui
    ? `\n- UI prove: \`${adaptation.prove.ui}\``
    : "";
  // Learned workflows stay in grok-kit.json. Inlining them here would change
  // the always-on prefix every session and miss the KV cache.
  return `---
description: grok-kit adaptation for this repo (generated; re-run grok-kit apply)
alwaysApply: true
---

# grok-kit on this project

Generated by \`grok-kit apply\`. Do not hand-edit; regenerate instead.
Profile: **${adaptation.profile}**. Use **only these enabled features**. This file stays byte-stable (no timestamps, no per-session dumps) so Cursor can KV-cache the prompt prefix.

${enabledLines}

Gated/available (human-approve, not always-on): ${available || "none"}.

${mcp}
- Prove-it: \`${adaptation.prove.verify}\`${proveUi}
- Adaptation SoT: \`.cursor/grok-kit.json\`
- Learned workflows live in that JSON (\`learned.workflows\`), not in this always-on file.
`;
}

export function buildManifest(adaptation, extra = {}) {
  return {
    schemaVersion: 1,
    generatedBy: "grok-kit apply",
    kitVersion: kitVersion(),
    profile: adaptation.profile,
    signals: adaptation.signals,
    enabled: adaptation.enabled,
    available: adaptation.available,
    mcpRecommended: adaptation.mcpRecommended,
    prove: adaptation.prove,
    ...extra,
  };
}

function grokKitJsonPath(root) {
  return path.join(root, ".cursor/grok-kit.json");
}

function projectRulePath(root) {
  return path.join(root, ".cursor/rules/grok-kit-project.mdc");
}

function existingExtras(root) {
  const prev = readJson(grokKitJsonPath(root));
  const extra = {};
  if (prev && typeof prev.notes === "string") extra.notes = prev.notes;
  if (prev?.learned) extra.learned = prev.learned;
  return extra;
}

function mcpHasTell(root) {
  const mcp = readJson(path.join(root, ".cursor/mcp.json"));
  const servers = mcp?.mcpServers;
  if (!servers || typeof servers !== "object") return false;
  return Object.keys(servers).some((name) => name.toLowerCase() === "tell");
}

function mergeTellMcp(root) {
  const dest = path.join(root, ".cursor/mcp.json");
  const snippet = readJson(path.join(KIT, "docs/mcp-snippets/tell-proof.json"));
  const tell = snippet?.mcpServers?.tell;
  if (!tell) {
    return { rel: ".cursor/mcp.json", action: "skip", reason: "missing-snippet" };
  }
  if (mcpHasTell(root)) {
    return { rel: ".cursor/mcp.json", action: "skip", reason: "tell-present" };
  }
  const existed = existsSync(dest);
  const current = existed ? readJson(dest) ?? { mcpServers: {} } : { mcpServers: {} };
  if (!current.mcpServers || typeof current.mcpServers !== "object") {
    current.mcpServers = {};
  }
  current.mcpServers.tell = tell;
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, `${JSON.stringify(current, null, 2)}\n`);
  return {
    rel: ".cursor/mcp.json",
    action: existed ? "merge" : "create",
  };
}

function runCapturedBootstrap(args) {
  let out = "";
  const code = runBootstrap(args, {
    stdout: (text) => {
      out += text;
    },
  });
  let parsed = null;
  try {
    parsed = JSON.parse(out);
  } catch {
    parsed = { ok: false, error: "bootstrap-json", raw: out.slice(0, 500) };
  }
  return { code, parsed };
}

function publicAdaptation(adaptation) {
  return {
    profile: adaptation.profile,
    signals: adaptation.signals,
    enabled: adaptation.enabled,
    available: adaptation.available,
    mcpRecommended: adaptation.mcpRecommended,
    prove: adaptation.prove,
  };
}

function skippedPayload(root, reason, adaptation) {
  return {
    schemaVersion: 1,
    ok: true,
    skipped: true,
    reason,
    root,
    ...publicAdaptation(
      adaptation ?? {
        profile: null,
        signals: [],
        enabled: [],
        available: [],
        mcpRecommended: [],
        prove: {},
      }
    ),
  };
}

export function runApply(argv, io = {}) {
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

  const root = options.root;
  const jsonPath = grokKitJsonPath(root);

  if (options.requireGit && !isGitRepo(root)) {
    stdout(`${JSON.stringify(skippedPayload(root, "not-a-git-repo"))}\n`);
    return 0;
  }

  if (options.requireConsent && !options.detectOnly) {
    const already = options.ifMissing && existsSync(jsonPath);
    if (!already && !hasScope(readConsent(), "project-apply")) {
      stdout(`${JSON.stringify(skippedPayload(root, "consent-required"))}\n`);
      return 0;
    }
  }

  if (options.ifMissing && existsSync(jsonPath)) {
    const prev = readJson(jsonPath);
    stdout(
      `${JSON.stringify({
        schemaVersion: 1,
        ok: true,
        skipped: true,
        reason: "already-adapted",
        root,
        profile: prev?.profile ?? null,
        signals: prev?.signals ?? [],
        enabled: prev?.enabled ?? [],
        available: prev?.available ?? [],
        mcpRecommended: prev?.mcpRecommended ?? [],
        prove: prev?.prove ?? {},
      })}\n`
    );
    return 0;
  }

  const detection = detectProject(root);
  const adaptation = chooseAdaptation(detection, options.profile ?? undefined);

  if (options.detectOnly) {
    stdout(
      `${JSON.stringify({
        schemaVersion: 1,
        ok: true,
        root,
        dryRun: Boolean(options.dryRun),
        ...publicAdaptation(adaptation),
      })}\n`
    );
    return 0;
  }

  const bootArgs = [
    "--root",
    root,
    "--profile",
    adaptation.profile,
  ];
  if (options.dryRun) bootArgs.push("--dry-run");
  const boot = runCapturedBootstrap(bootArgs);
  if (boot.code !== 0 || boot.parsed?.ok === false) {
    stdout(
      `${JSON.stringify({
        ok: false,
        error: boot.parsed?.error ?? "bootstrap-failed",
        bootstrap: boot.parsed,
      })}\n`
    );
    return boot.code === 0 ? 1 : boot.code;
  }

  const files = [];
  const extras = existingExtras(root);
  const manifest = buildManifest(adaptation, {
    mcpWritten: false,
    ...extras,
  });
  const rule = renderProjectRule({ ...adaptation, learned: extras.learned });

  if (!options.dryRun) {
    const jsonChanged = writeIfChanged(
      jsonPath,
      `${JSON.stringify(manifest, null, 2)}\n`
    );
    files.push({
      rel: ".cursor/grok-kit.json",
      action: jsonChanged ? "write" : "unchanged",
    });
    const ruleChanged = writeIfChanged(projectRulePath(root), rule);
    files.push({
      rel: ".cursor/rules/grok-kit-project.mdc",
      action: ruleChanged ? "write" : "unchanged",
    });
    if (options.writeMcp && adaptation.mcpRecommended.includes("tell")) {
      const mcpStep = mergeTellMcp(root);
      files.push(mcpStep);
      manifest.mcpWritten = mcpStep.action !== "skip";
      writeIfChanged(jsonPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }
  } else {
    files.push({ rel: ".cursor/grok-kit.json", action: "dry-run" });
    files.push({ rel: ".cursor/rules/grok-kit-project.mdc", action: "dry-run" });
  }

  stdout(
    `${JSON.stringify({
      schemaVersion: 1,
      ok: true,
      root,
      dryRun: options.dryRun,
      ...publicAdaptation(adaptation),
      mcpWritten: Boolean(manifest.mcpWritten),
      bootstrap: {
        profile: boot.parsed.profile,
        steps: boot.parsed.steps,
      },
      files,
    })}\n`
  );
  return 0;
}

export { HELP };

if (isMainModule(import.meta.url)) {
  process.exit(runApply(process.argv.slice(2)));
}
