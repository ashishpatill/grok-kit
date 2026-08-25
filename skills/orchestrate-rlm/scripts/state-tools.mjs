#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HELP = `state-tools — compile RLM STATE.md instead of narrating Task prompts

Usage:
  state-tools check <STATE.md>
  state-tools render-spawn <STATE.md>
`;

const REQUIRED = ["GOAL", "Acceptance", "Budget", "Units"];

export function parseState(text) {
  const headings = [...text.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
  const units = [...text.matchAll(/^###\s+(.+)$/gm)].map((m) => {
    const id = m[1].trim();
    const start = m.index + m[0].length;
    const rest = text.slice(start);
    const next = rest.search(/^###\s+/m);
    const body = (next === -1 ? rest : rest.slice(0, next)).trim();
    const field = (name) => {
      const hit = body.match(new RegExp(`^[-*]\\s+${name}:\\s*(.+)$`, "im"));
      return hit ? hit[1].trim() : "";
    };
    return {
      id,
      goal: field("goal"),
      paths: field("paths"),
      verify: field("verify"),
      done: field("done"),
      nonGoals: field("non-goals"),
      body,
    };
  });
  return { headings, units, text };
}

export function checkState(text) {
  const parsed = parseState(text);
  const missing = REQUIRED.filter(
    (name) => !parsed.headings.some((h) => h.toLowerCase() === name.toLowerCase())
  );
  const warnings = [];
  if (parsed.units.length === 0) missing.push("Units.### (at least one unit)");
  if (parsed.units.length > 5) {
    warnings.push(`depth-1 budget is 3–5 units; found ${parsed.units.length}`);
  }
  for (const unit of parsed.units) {
    if (!unit.goal) warnings.push(`${unit.id}: missing goal`);
    if (!unit.verify) warnings.push(`${unit.id}: missing verify`);
    if (!unit.done) warnings.push(`${unit.id}: missing done`);
  }
  return {
    schemaVersion: 1,
    ok: missing.length === 0,
    missing,
    warnings,
    unitCount: parsed.units.length,
    units: parsed.units.map((u) => u.id),
  };
}

export function renderSpawn(text) {
  const parsed = parseState(text);
  const contracts = parsed.units.map((unit) => {
    return [
      `goal: ${unit.goal || unit.id}`,
      "context:",
      `  - absolute paths: ${unit.paths || "(set paths)"}`,
      `  - constraints / non-goals: ${unit.nonGoals || "(none)"}`,
      `  - verify command: ${unit.verify || "(set verify)"}`,
      `  - definition of done: ${unit.done || "(set done)"}`,
      "return: ≤8 bullets + paths + open risks (no raw dumps)",
      "model: pin cheap/composer for explore; inherit only for judgment-heavy implement",
    ].join("\n");
  });
  return {
    schemaVersion: 1,
    ok: parsed.units.length > 0 && parsed.units.length <= 5,
    contracts,
  };
}

export function runStateTools(argv, io = {}) {
  const stdout = io.stdout ?? ((text) => process.stdout.write(text));
  const cmd = argv[0];
  if (!cmd || cmd === "-h" || cmd === "--help") {
    stdout(HELP);
    return cmd ? 0 : 64;
  }
  if (cmd !== "check" && cmd !== "render-spawn") {
    stdout(`${JSON.stringify({ ok: false, error: `unknown command ${cmd}` })}\n`);
    return 64;
  }
  const file = argv[1];
  if (!file) {
    stdout(`${JSON.stringify({ ok: false, error: "STATE.md path required" })}\n`);
    return 64;
  }
  const text = readFileSync(file, "utf8");
  if (cmd === "check") {
    const verdict = checkState(text);
    stdout(`${JSON.stringify(verdict)}\n`);
    return verdict.ok ? 0 : 1;
  }
  const verdict = renderSpawn(text);
  stdout(`${JSON.stringify(verdict)}\n`);
  return verdict.ok ? 0 : 1;
}

export { HELP };

const isMain =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  try {
    process.exit(runStateTools(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
    process.exit(1);
  }
}
