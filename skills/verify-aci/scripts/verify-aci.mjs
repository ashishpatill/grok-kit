#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HELP = `verify-aci — run the project's doctor / launch / drive script

Usage:
  verify-aci [--root DIR] [--phase all|doctor|launch|drive] [--surface NAME]

Looks for, in order:
  $VERIFY_SCRIPT
  <root>/.cursor/verify/verify.sh
  <root>/scripts/verify.sh

If --surface is set and <root>/.cursor/verify/feature-map.json defines that
surface's command for the phase, that command runs instead of verify.sh.

Exit 0 on success, 2 if the ACI script is missing, otherwise the script's exit.
`;

function parseArgs(argv) {
  const out = { root: process.cwd(), phase: "all", surface: null, help: false };
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
      case "--phase":
        out.phase = next();
        break;
      case "--surface":
        out.surface = next();
        break;
      case "--json":
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!["all", "doctor", "launch", "drive"].includes(out.phase)) {
    throw new Error("--phase must be all|doctor|launch|drive");
  }
  return out;
}

function findScript(root) {
  const env = process.env.VERIFY_SCRIPT;
  if (env && existsSync(env)) return path.resolve(env);
  const candidates = [
    path.join(root, ".cursor", "verify", "verify.sh"),
    path.join(root, "scripts", "verify.sh"),
  ];
  return candidates.find((file) => existsSync(file)) ?? null;
}

async function loadFeatureMap(root) {
  const file = path.join(root, ".cursor", "verify", "feature-map.json");
  if (!existsSync(file)) return null;
  return JSON.parse(await readFile(file, "utf8"));
}

function surfaceCommand(map, surface, phase) {
  const entry = map?.surfaces?.[surface];
  if (!entry || typeof entry !== "object") return null;
  if (entry.useProjectScript) return null;
  const command = entry[phase];
  return typeof command === "string" && command.trim() ? command.trim() : null;
}

function runShell(command, cwd) {
  return new Promise((resolve) => {
    const child = spawn("bash", ["-lc", command], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.on("error", (error) => {
      resolve({ code: 1, stdout: "", stderr: error.message });
    });
  });
}

async function runPhase({ root, script, phase, surface, map }) {
  const started = Date.now();
  let command;
  if (surface && map) {
    const mapped = surfaceCommand(map, surface, phase);
    if (mapped) command = mapped;
  }
  if (!command) {
    if (!script) {
      return {
        phase,
        ok: false,
        exit: 2,
        durationMs: 0,
        error: "missing-aci",
        stdout: "",
        stderr: "",
      };
    }
    command = `bash ${JSON.stringify(script)} ${JSON.stringify(phase)}`;
  }
  const result = await runShell(command, root);
  return {
    phase,
    ok: result.code === 0,
    exit: result.code,
    durationMs: Date.now() - started,
    command,
    stdout: result.stdout.slice(-4000),
    stderr: result.stderr.slice(-4000),
  };
}

export async function runVerifyAci(argv, io = {}) {
  const stdout = io.stdout ?? ((text) => process.stdout.write(text));
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    stdout(
      `${JSON.stringify({ ok: false, error: error.message })}\n`
    );
    return 64;
  }
  if (options.help) {
    stdout(HELP);
    return 0;
  }

  const root = options.root;
  const script = findScript(root);
  const map = await loadFeatureMap(root);
  const surface = options.surface ?? map?.defaultSurface ?? null;
  const phases =
    options.phase === "all" ? ["doctor", "launch", "drive"] : [options.phase];

  if (!script && !(surface && map)) {
    const verdict = {
      schemaVersion: 1,
      ok: false,
      error: "missing-aci",
      root,
      next: "Copy templates/_shared/verify/verify.sh to .cursor/verify/verify.sh (or run /project-bootstrap).",
    };
    stdout(`${JSON.stringify(verdict)}\n`);
    return 2;
  }

  const logDir = path.join(root, ".cursor", "verify");
  await mkdir(logDir, { recursive: true });
  const steps = [];
  for (const phase of phases) {
    const step = await runPhase({ root, script, phase, surface, map });
    steps.push(step);
    if (!step.ok) break;
  }

  const ok = steps.every((step) => step.ok);
  const verdict = {
    schemaVersion: 1,
    ok,
    root,
    script,
    phase: options.phase,
    surface,
    steps: steps.map(({ stdout: _s, stderr: _e, ...rest }) => rest),
    logPath: path.join(logDir, "last.json"),
  };

  const logBody = {
    ...verdict,
    steps,
  };
  await writeFile(verdict.logPath, `${JSON.stringify(logBody, null, 2)}\n`);
  await writeFile(
    path.join(logDir, "last.log"),
    steps
      .map(
        (step) =>
          `## ${step.phase} exit=${step.exit}\n${step.command ?? ""}\n${step.stdout}\n${step.stderr}\n`
      )
      .join("\n")
  );

  stdout(`${JSON.stringify(verdict)}\n`);
  if (!ok) return steps.find((step) => !step.ok)?.exit ?? 1;
  return 0;
}

export { parseArgs, findScript, HELP };

const isMain =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  runVerifyAci(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
      process.exit(1);
    });
}
