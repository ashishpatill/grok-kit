#!/usr/bin/env node
import { isMainModule } from "../../../scripts/lib/is-main.mjs";

const INTENTS = {
  bug: [
    "Capture the failing command / stack trace (do not skip repro).",
    "debugger agent — localize, 1–2 hypotheses, stop after two failures.",
    "grok-kit verify-aci --phase drive",
    "grok-kit rubric-verify",
  ],
  feature: [
    "/plan-execute — parallel requirements as separate checkboxes; include verify command.",
    "Implement only after plan approval.",
    "grok-kit rubric-verify",
    "grok-kit verify-aci --phase all",
    "If a PR exists: grok-kit watch-ci --status-once",
  ],
  investigate: [
    "researcher — ≤12 bullets, paths, confidence. Bulky notes under .cursor/rlm-state/.",
    "Multi-package: write STATE.md, grok-kit state-tools check, grok-kit state-tools render-spawn, spawn depth-1 children with those contracts.",
  ],
  ship: [
    "grok-kit verify-aci --phase all must be ok",
    "grok-kit rubric-verify must-items pass",
    "grok-kit watch-ci --status-once — trust class/actor. Approval is a human wait, not a CI fail.",
    "Do not merge, restack, or force-push unless the user explicitly asked to land.",
  ],
  status: [
    "grok-kit flagship --when now — overview + visualise.",
    "If a host canvas skill is available, render the JSON there. Otherwise show mermaid in chat.",
  ],
};

const HELP = `route-task — print a compiled sequence, then leave this skill

Usage:
  grok-kit route-task <bug|feature|investigate|ship|status|list>
`;

export function listIntents() {
  return Object.keys(INTENTS);
}

export function sequenceFor(intent) {
  const steps = INTENTS[intent];
  if (!steps) return null;
  return {
    schemaVersion: 1,
    ok: true,
    intent,
    sticky: false,
    next: "Leave this skill. Run the steps in order.",
    steps,
  };
}

export function runRouteTask(argv, io = {}) {
  const stdout = io.stdout ?? ((text) => process.stdout.write(text));
  const cmd = argv[0];
  if (!cmd || cmd === "-h" || cmd === "--help") {
    stdout(HELP);
    return cmd ? 0 : 64;
  }
  if (cmd === "list") {
    stdout(`${JSON.stringify({ schemaVersion: 1, ok: true, intents: listIntents() })}\n`);
    return 0;
  }
  const verdict = sequenceFor(cmd);
  if (!verdict) {
    stdout(
      `${JSON.stringify({
        ok: false,
        error: `unknown intent ${cmd}`,
        intents: listIntents(),
      })}\n`
    );
    return 64;
  }
  stdout(`${JSON.stringify(verdict)}\n`);
  return 0;
}

export { HELP, INTENTS };

if (isMainModule(import.meta.url)) {
  process.exit(runRouteTask(process.argv.slice(2)));
}
