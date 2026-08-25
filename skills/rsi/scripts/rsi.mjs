#!/usr/bin/env node
import path from "node:path";
import { isMainModule } from "../../../scripts/lib/is-main.mjs";
import { buildOverview, shortLine as flagshipLine } from "../../overview/scripts/overview.mjs";
import { buildHygiene, shortLine as hygieneLine } from "../../code-hygiene/scripts/hygiene.mjs";

const HELP = `rsi — review before ship (flagship + hygiene + prove-it)

Usage:
  rsi [--root DIR] [--short]

Does not merge. Does not delete files. Do not dump into always-on rules.
`;

const STEPS = Object.freeze([
  "Read flagship status. Stay on top of branch/dirtiness/profile.",
  "Present hygiene present[] (≤3). Offer scrap / fix / keep. Do not auto-delete.",
  "grok-kit rubric-verify — must-items pass.",
  "grok-kit verify-aci --phase all — drive must prove the claim.",
  "If a PR exists: grok-kit watch-ci --status-once (merge-state, not a green list).",
  "Merge only if the user explicitly asked to land. Never force-push main.",
]);

export function parseArgs(argv) {
  const out = { root: process.cwd(), short: false, help: false };
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
      case "--short":
        out.short = true;
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  return out;
}

export function buildRsi(root) {
  const overview = buildOverview(root, { when: "now", mode: "flagship" });
  const hygiene = buildHygiene(root, { limit: 12, batch: 3 });
  return {
    schemaVersion: 1,
    ok: true,
    sticky: false,
    flagship: {
      line: flagshipLine(overview),
      git: {
        branch: overview.git?.branch,
        dirtyCount: overview.git?.dirtyCount,
      },
      profile: overview.kit?.profile ?? null,
    },
    hygiene: {
      line: hygieneLine(hygiene.summary),
      summary: hygiene.summary,
      present: hygiene.present,
    },
    mermaid: hygiene.mermaid,
    steps: [...STEPS],
    next: "Leave this skill. Follow steps. Merge only if the user asked.",
  };
}

export function runRsi(argv, io = {}) {
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
  const payload = buildRsi(options.root);
  if (options.short) {
    stdout(
      `${JSON.stringify({
        schemaVersion: 1,
        ok: true,
        line: `${payload.flagship.line} ${payload.hygiene.line}`,
        sticky: false,
      })}\n`
    );
    return 0;
  }
  stdout(`${JSON.stringify(payload)}\n`);
  return 0;
}

export { HELP, STEPS };

if (isMainModule(import.meta.url)) {
  process.exit(runRsi(process.argv.slice(2)));
}
