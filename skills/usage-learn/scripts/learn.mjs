#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { isMainModule } from "../../../scripts/lib/is-main.mjs";
import { hasScope, readConsent } from "../../../scripts/consent.mjs";
import { renderProjectRule } from "../../project-bootstrap/scripts/apply.mjs";

const HELP = `learn — observe common grok-kit skills/workflows; improve only with consent

Usage:
  learn record [--skill NAME] [--command NAME] [--intent NAME]
  learn summarize
  learn propose [--root DIR]
  learn apply [--root DIR] [--i-consent]
  learn tick [--root DIR]

Local log only (no file contents, no secrets). Observe after install --learn.
Apply adaptations after install --improve, or: learn apply --i-consent.
Never rewrites User Rules, persona, or kit SKILL.md files.
`;

export const LOG_COMMANDS = Object.freeze([
  "verify-aci",
  "watch-ci",
  "rubric-verify",
  "state-tools",
  "bootstrap",
  "apply",
  "route-task",
  "session-handoff",
  "skill-curator",
]);

const COMMAND_FEATURE = Object.freeze({
  "verify-aci": "verify-aci",
  "watch-ci": "watch-ci",
  "rubric-verify": "rubric-verify",
  "state-tools": "orchestrate-rlm",
  bootstrap: "project-bootstrap",
  apply: "project-bootstrap",
  "route-task": "route-task",
  "session-handoff": "session-handoff",
  "skill-curator": "skill-curator",
  "cost-check": "cost-check",
  "plan-execute": "plan-execute",
  "orchestrate-rlm": "orchestrate-rlm",
  "memory-sync": "memory-sync",
  "tell-proof": "tell-proof",
});

const OPTIONAL_FEATURES = Object.freeze([
  "orchestrate-rlm",
  "tell-proof",
  "skill-curator",
]);

const MAX_LINES = 2000;
const KEEP_LINES = 1500;
const SESSION_GAP_MS = 4 * 60 * 60 * 1000;
const INTENTS = new Set(["bug", "feature", "investigate", "ship"]);
const PHASES = new Set(["doctor", "launch", "drive", "all"]);
const IGNORE_LINES = Object.freeze([
  ".cursor/grok-kit-usage.jsonl",
  ".cursor/grok-kit-proposals.json",
]);

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function usagePath(home = process.env.HOME ?? "") {
  if (process.env.GROK_KIT_USAGE_FILE) return process.env.GROK_KIT_USAGE_FILE;
  return path.join(home, ".cursor/grok-kit-usage.jsonl");
}

export function proposalsPath(root, home = process.env.HOME ?? "") {
  if (process.env.GROK_KIT_PROPOSALS_FILE) {
    return process.env.GROK_KIT_PROPOSALS_FILE;
  }
  if (root) return path.join(root, ".cursor/grok-kit-proposals.json");
  return path.join(home, ".cursor/grok-kit-proposals.json");
}

export function canObserve(consent = readConsent()) {
  return (
    hasScope(consent, "usage-learn") || hasScope(consent, "harness-improve")
  );
}

export function canImprove(consent = readConsent(), iConsent = false) {
  return Boolean(iConsent) || hasScope(consent, "harness-improve");
}

export function featureFor(name) {
  return COMMAND_FEATURE[name] ?? name;
}

function projectKey(root) {
  if (!root) return null;
  return path.basename(path.resolve(root));
}

export function safeExtra(command, args = []) {
  const extra = {};
  if (command === "route-task" && INTENTS.has(args[0])) {
    extra.intent = args[0];
  }
  if (command === "verify-aci") {
    const phaseIdx = args.indexOf("--phase");
    if (phaseIdx >= 0 && PHASES.has(args[phaseIdx + 1])) {
      extra.phase = args[phaseIdx + 1];
    }
  }
  return extra;
}

export function readEvents(file = usagePath()) {
  if (!existsSync(file)) return [];
  const text = readFileSync(file, "utf8");
  const events = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row && row.command) events.push(row);
    } catch {
      // skip bad lines
    }
  }
  return events;
}

function trimLog(file) {
  const events = readEvents(file);
  if (events.length <= MAX_LINES) return;
  const kept = events.slice(-KEEP_LINES);
  writeFileSync(file, `${kept.map((row) => JSON.stringify(row)).join("\n")}\n`);
}

export function appendEvent(event, options = {}) {
  const consent = options.consent ?? readConsent();
  if (!canObserve(consent)) {
    return { ok: true, skipped: true, reason: "consent-required" };
  }
  const file = options.file ?? usagePath();
  mkdirSync(path.dirname(file), { recursive: true });
  const row = {
    schemaVersion: 1,
    ts: event.ts ?? new Date().toISOString(),
    kind: event.kind ?? "cli",
    command: event.command,
    host: event.host ?? (process.env.CURSOR_PLUGIN_ROOT ? "cursor" : "cli"),
    project: event.project ?? null,
    ...safeExtra(event.command, event.args ?? []),
    ...(event.intent ? { intent: event.intent } : {}),
    ...(event.phase ? { phase: event.phase } : {}),
  };
  writeFileSync(file, `${JSON.stringify(row)}\n`, { flag: "a" });
  trimLog(file);
  return { ok: true, skipped: false, file };
}

export function recordCli(command, args = [], options = {}) {
  if (!LOG_COMMANDS.includes(command)) {
    return { ok: true, skipped: true, reason: "not-logged" };
  }
  return appendEvent(
    {
      kind: "cli",
      command,
      args,
      project: projectKey(options.root ?? process.cwd()),
    },
    options
  );
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));
}

function sessionWorkflows(events) {
  const sorted = [...events].sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  const sessions = [];
  let current = [];
  let lastMs = 0;
  for (const event of sorted) {
    if (event.kind === "session") continue;
    const ms = Date.parse(event.ts) || 0;
    if (current.length && ms - lastMs > SESSION_GAP_MS) {
      sessions.push(current);
      current = [];
    }
    const feature = featureFor(event.command);
    if (current[current.length - 1] !== feature) current.push(feature);
    lastMs = ms;
  }
  if (current.length) sessions.push(current);
  const workflows = [];
  for (const steps of sessions) {
    if (steps.length < 2) continue;
    workflows.push(steps.slice(0, 5).join(" → "));
  }
  return countBy(workflows, (name) => name);
}

export function summarize(events) {
  const usable = events.filter((row) => row.kind !== "session");
  const topSkills = countBy(usable, (row) => featureFor(row.command)).slice(0, 8);
  const topWorkflows = sessionWorkflows(usable).slice(0, 5);
  const intents = countBy(
    usable.filter((row) => row.intent),
    (row) => row.intent
  );
  return {
    schemaVersion: 1,
    eventCount: usable.length,
    topSkills,
    topWorkflows,
    intents,
  };
}

function workflowLabel(stepsLine) {
  if (stepsLine.includes("verify-aci") && stepsLine.includes("watch-ci")) {
    return `Ship path: ${stepsLine}`;
  }
  if (stepsLine.includes("route-task") && stepsLine.includes("verify-aci")) {
    return `Prove after route: ${stepsLine}`;
  }
  if (stepsLine.includes("orchestrate-rlm")) {
    return `Multi-unit: ${stepsLine}`;
  }
  return `Frequent workflow: ${stepsLine}`;
}

export function propose(summary, context = {}) {
  const enabled = new Set(context.enabled ?? []);
  const proposals = [];
  const used = summary.topSkills ?? [];
  const workflows = summary.topWorkflows ?? [];

  for (const skill of used) {
    if (
      OPTIONAL_FEATURES.includes(skill.name) &&
      !enabled.has(skill.name) &&
      skill.count >= 2
    ) {
      proposals.push({
        id: `enable-${skill.name}`,
        kind: "enable-feature",
        feature: skill.name,
        reason: `Used ${skill.count} times but not enabled in grok-kit.json.`,
      });
    }
    if (proposals.length >= 3) break;
  }

  if (proposals.length < 3 && workflows[0] && workflows[0].count >= 2) {
    proposals.push({
      id: "pin-top-workflow",
      kind: "workflow-rule",
      text: workflowLabel(workflows[0].name),
      reason: `Most common sequence (${workflows[0].count} sessions): ${workflows[0].name}`,
    });
  }

  const names = new Set(used.map((row) => row.name));
  const total = summary.eventCount ?? 0;
  if (proposals.length < 3 && total >= 6 && !names.has("verify-aci")) {
    proposals.push({
      id: "nudge-verify-aci",
      kind: "nudge",
      text: "This machine rarely runs verify-aci. Prove with grok-kit verify-aci before claiming done.",
      reason: "High CLI use without prove-it.",
    });
  }
  if (proposals.length < 3 && total >= 8 && !names.has("cost-check")) {
    proposals.push({
      id: "nudge-cost-check",
      kind: "nudge",
      text: "No /cost-check in the usage log. Run it before large or expensive agent turns.",
      reason: "Spend control is unused.",
    });
  }
  if (proposals.length < 3 && names.has("verify-aci") && !names.has("watch-ci")) {
    proposals.push({
      id: "nudge-watch-ci",
      kind: "nudge",
      text: "You prove locally but rarely watch merge-state. After a PR: grok-kit watch-ci --status-once.",
      reason: "Ship path is incomplete without merge-state.",
    });
  }

  return proposals.slice(0, 3);
}

function ensureGitignore(root) {
  if (!root) return;
  const file = path.join(root, ".gitignore");
  let existing = "";
  if (existsSync(file)) existing = readFileSync(file, "utf8");
  const missing = IGNORE_LINES.filter((line) => !existing.includes(line));
  if (missing.length === 0) return;
  const prefix = existing && !existing.endsWith("\n") ? "\n" : "";
  writeFileSync(file, `${existing}${prefix}${missing.join("\n")}\n`);
}

export function applyProposals(root, proposals, options = {}) {
  const consent = options.consent ?? readConsent();
  if (!canImprove(consent, options.iConsent)) {
    return { ok: true, skipped: true, reason: "consent-required", applied: [] };
  }
  const jsonPath = path.join(root, ".cursor/grok-kit.json");
  const prev = readJson(jsonPath);
  if (!prev) {
    return { ok: false, error: "missing-grok-kit-json", applied: [] };
  }
  const enabled = [...(prev.enabled ?? [])];
  const workflows = [...(prev.learned?.workflows ?? [])];
  const applied = [];
  for (const proposal of proposals) {
    if (
      proposal.kind === "enable-feature" &&
      proposal.feature &&
      !enabled.includes(proposal.feature)
    ) {
      enabled.push(proposal.feature);
      applied.push(proposal.id);
    }
    if (
      proposal.kind === "workflow-rule" &&
      proposal.text &&
      !workflows.includes(proposal.text)
    ) {
      workflows.push(proposal.text);
      applied.push(proposal.id);
    }
  }
  const learned = {
    updatedAt: options.now ?? new Date().toISOString(),
    workflows: workflows.slice(-5),
    proposalIds: applied,
  };
  const next = { ...prev, enabled, learned };
  if (!options.dryRun) {
    mkdirSync(path.dirname(jsonPath), { recursive: true });
    writeFileSync(jsonPath, `${JSON.stringify(next, null, 2)}\n`);
    const rulePath = path.join(root, ".cursor/rules/grok-kit-project.mdc");
    mkdirSync(path.dirname(rulePath), { recursive: true });
    writeFileSync(
      rulePath,
      renderProjectRule({
        profile: prev.profile ?? "generic",
        enabled,
        available: prev.available ?? [],
        mcpRecommended: prev.mcpRecommended ?? [],
        prove: prev.prove ?? {},
        learned,
      })
    );
    ensureGitignore(root);
  }
  return { ok: true, skipped: false, applied, enabled, learned };
}

function writeProposals(root, payload) {
  const file = proposalsPath(root);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  if (root && !process.env.GROK_KIT_PROPOSALS_FILE) ensureGitignore(root);
  return file;
}

export function parseArgs(argv) {
  const out = {
    cmd: argv[0] ?? null,
    root: process.cwd(),
    skill: null,
    command: null,
    intent: null,
    iConsent: false,
    help: false,
  };
  if (!out.cmd || out.cmd === "-h" || out.cmd === "--help") {
    out.help = true;
    return out;
  }
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
      case "--skill":
        out.skill = next();
        break;
      case "--command":
        out.command = next();
        break;
      case "--intent":
        out.intent = next();
        break;
      case "--i-consent":
        out.iConsent = true;
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  return out;
}

function loadContext(root) {
  const prev = readJson(path.join(root, ".cursor/grok-kit.json"));
  return {
    enabled: prev?.enabled ?? [],
    profile: prev?.profile ?? null,
    available: prev?.available ?? [],
    prove: prev?.prove ?? {},
  };
}

export function runLearn(argv, io = {}) {
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
    return argv[0] ? 0 : 64;
  }
  const cmd = options.cmd;
  switch (cmd) {
    case "record": {
      const command = options.skill ?? options.command;
      if (!command) {
        stdout(`${JSON.stringify({ ok: false, error: "missing --skill or --command" })}\n`);
        return 64;
      }
      const result = appendEvent({
        kind: "skill",
        command,
        intent: options.intent ?? undefined,
        project: projectKey(options.root),
      });
      stdout(`${JSON.stringify({ schemaVersion: 1, ...result, command })}\n`);
      return 0;
    }
    case "summarize": {
      const summary = summarize(readEvents());
      stdout(`${JSON.stringify({ ok: true, ...summary })}\n`);
      return 0;
    }
    case "propose": {
      if (!canObserve()) {
        stdout(
          `${JSON.stringify({ ok: true, skipped: true, reason: "consent-required" })}\n`
        );
        return 0;
      }
      const summary = summarize(readEvents());
      const context = loadContext(options.root);
      const proposals = propose(summary, context);
      const payload = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        root: options.root,
        ...summary,
        proposals,
        apply: "grok-kit learn apply --root . --i-consent",
      };
      const file = writeProposals(options.root, payload);
      stdout(`${JSON.stringify({ ok: true, file, ...payload })}\n`);
      return 0;
    }
    case "apply": {
      const summary = summarize(readEvents());
      const context = loadContext(options.root);
      const proposals = propose(summary, context);
      const result = applyProposals(options.root, proposals, {
        iConsent: options.iConsent,
      });
      stdout(`${JSON.stringify({ schemaVersion: 1, ...result, proposals })}\n`);
      return result.ok === false ? 1 : 0;
    }
    case "tick": {
      const consent = readConsent();
      if (!canObserve(consent) && !canImprove(consent, false)) {
        stdout(
          `${JSON.stringify({
            ok: true,
            skipped: true,
            reason: "consent-required",
          })}\n`
        );
        return 0;
      }
      appendEvent({
        kind: "session",
        command: "session-start",
        project: projectKey(options.root),
      });
      const summary = summarize(readEvents());
      const context = loadContext(options.root);
      const proposals = propose(summary, context);
      const file = writeProposals(options.root, {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        ...summary,
        proposals,
      });
      let applied = [];
      let improve = { skipped: true };
      if (canImprove(consent, false) && existsSync(path.join(options.root, ".cursor/grok-kit.json"))) {
        improve = applyProposals(options.root, proposals, { consent });
        applied = improve.applied ?? [];
      }
      const top = (summary.topSkills ?? []).slice(0, 4).map((row) => row.name);
      stdout(
        `${JSON.stringify({
          ok: true,
          file,
          topSkills: top,
          topWorkflows: (summary.topWorkflows ?? []).slice(0, 2),
          proposed: proposals.length,
          applied,
          improveSkipped: Boolean(improve.skipped),
          hint: improve.skipped
            ? "Apply with grok-kit learn apply --i-consent"
            : "Adapted grok-kit.json from usage.",
        })}\n`
      );
      return 0;
    }
    default:
      stdout(`${JSON.stringify({ ok: false, error: `unknown command: ${cmd}` })}\n`);
      return 64;
  }
}

export { HELP };

if (isMainModule(import.meta.url)) {
  process.exit(runLearn(process.argv.slice(2)));
}
