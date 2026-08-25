#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule, resolvePath } from "./lib/is-main.mjs";
import { recordCli } from "../skills/usage-learn/scripts/learn.mjs";

const ROOT = path.resolve(
  path.dirname(resolvePath(fileURLToPath(import.meta.url))),
  ".."
);

export const COMMANDS = Object.freeze({
  "verify-aci": {
    kind: "node",
    file: "skills/verify-aci/scripts/verify-aci.mjs",
  },
  "watch-ci": {
    kind: "node",
    file: "skills/watch-ci/scripts/watch-ci.mjs",
  },
  "rubric-verify": {
    kind: "node",
    file: "skills/rubric-verify/scripts/rubric-verify.mjs",
  },
  "state-tools": {
    kind: "node",
    file: "skills/orchestrate-rlm/scripts/state-tools.mjs",
  },
  bootstrap: {
    kind: "node",
    file: "skills/project-bootstrap/scripts/bootstrap.mjs",
  },
  apply: {
    kind: "node",
    file: "skills/project-bootstrap/scripts/apply.mjs",
  },
  "route-task": {
    kind: "node",
    file: "skills/route-task/scripts/route-task.mjs",
  },
  "session-handoff": {
    kind: "node",
    file: "skills/session-handoff/scripts/session-handoff.mjs",
  },
  "skill-curator": {
    kind: "node",
    file: "skills/skill-curator-manual/scripts/skill-curator.mjs",
  },
  learn: {
    kind: "node",
    file: "skills/usage-learn/scripts/learn.mjs",
  },
  check: {
    kind: "bash",
    file: "scripts/kit-check.sh",
  },
  consent: {
    kind: "node",
    file: "scripts/consent.mjs",
  },
  install: {
    kind: "bash",
    file: "scripts/install-user-layer.sh",
  },
  "seed-icm": {
    kind: "bash",
    file: "scripts/seed-icm-from-memory.sh",
  },
});

const HELP = `grok-kit — compiled kit tools (works from any repo after install)

Usage:
  grok-kit <command> [args]

Install puts this on PATH as ~/.local/bin/grok-kit. From a checkout:
  node scripts/grok-kit.mjs <command> [args]

Commands:
  verify-aci         doctor / launch / drive
  watch-ci           GitHub merge-state (default --status-once)
  rubric-verify      score .cursor/verify/rubric.json (or --rubric)
  state-tools        check | render-spawn STATE.md
  bootstrap          copy project layer (verify ACI, ignores, core rule, rubric)
  apply              detect stack, bootstrap, write .cursor/grok-kit.json + project rule
  consent            notice | status | check | write | revoke (install consent)
  route-task         print compiled bug|feature|investigate|ship sequence
  session-handoff    init | check .cursor/handoff.md
  skill-curator      inventory kit skills; flag overlapping descriptions
  learn              observe usage; propose/apply harness tweaks (consent)
  check              kit unit tests + offline user journey
  install            user-layer; requires --i-consent (skills, agents, PATH, optional MCP slim)
  seed-icm           seed ICM from HOT_MEMORY_FILE / HOT_USER_FILE

Examples:
  grok-kit verify-aci --root . --phase doctor
  grok-kit watch-ci --pretty
  grok-kit rubric-verify
  grok-kit route-task feature
  grok-kit bootstrap --root /path/to/app --profile generic
  grok-kit apply --root /path/to/app
  grok-kit install --i-consent
  grok-kit install --i-consent --learn --improve
  grok-kit consent status
  grok-kit learn summarize
`;

function spawnFile(kind, file, args) {
  const abs = path.join(ROOT, file);
  const argv =
    kind === "bash"
      ? ["bash", abs, ...args]
      : [process.execPath, abs, ...args];
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), {
      stdio: "inherit",
      cwd: process.cwd(),
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

export async function runGrokKit(argv, io = {}) {
  const stdout = io.stdout ?? ((text) => process.stdout.write(text));
  const spawnImpl = io.spawnFile ?? spawnFile;
  const cmd = argv[0];
  if (!cmd || cmd === "-h" || cmd === "--help") {
    stdout(HELP);
    return cmd ? 0 : 64;
  }
  const spec = COMMANDS[cmd];
  if (!spec) {
    stdout(`unknown command: ${cmd}\n${HELP}`);
    return 64;
  }
  const code = await spawnImpl(spec.kind, spec.file, argv.slice(1));
  try {
    const record = io.recordCli ?? recordCli;
    record(cmd, argv.slice(1));
  } catch {
    // Usage logging is fail-open and never changes the command's exit code.
  }
  return code;
}

export { HELP, ROOT };

if (isMainModule(import.meta.url)) {
  runGrokKit(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
      process.exit(1);
    });
}
