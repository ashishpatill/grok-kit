#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const ALWAYS_ON = Object.freeze([
  "route-task",
  "cost-check",
  "verify-aci",
  "rubric-verify",
  "watch-ci",
  "session-handoff",
  "memory-sync",
  "plan-execute",
]);

export const GATED_AVAILABLE = Object.freeze(["refine-harness"]);

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function readText(file, max = 200_000) {
  try {
    return readFileSync(file, "utf8").slice(0, max);
  } catch {
    return "";
  }
}

function depNames(pkg) {
  const names = new Set();
  if (!pkg || typeof pkg !== "object") return names;
  for (const key of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ]) {
    const block = pkg[key];
    if (block && typeof block === "object") {
      for (const name of Object.keys(block)) names.add(name);
    }
  }
  return names;
}

function hasAnyFile(root, names) {
  return names.some((name) => existsSync(path.join(root, name)));
}

function hasSubdir(root, rel) {
  const dir = path.join(root, rel);
  if (!existsSync(dir)) return false;
  try {
    return readdirSync(dir, { withFileTypes: true }).some((entry) =>
      entry.isDirectory()
    );
  } catch {
    return false;
  }
}

export function detectProject(root) {
  const signals = [];
  const pkg = readJson(path.join(root, "package.json"));
  const deps = depNames(pkg);
  const agents = readText(path.join(root, "AGENTS.md"));
  const tellMcp = readJson(path.join(root, "packages/mcp/package.json"));

  const isKit =
    pkg?.name === "grok-kit" ||
    (existsSync(path.join(root, "skills/verify-aci/SKILL.md")) &&
      existsSync(path.join(root, "scripts/grok-kit.mjs")));
  if (isKit) signals.push("grok-kit");

  const isTell =
    pkg?.name === "tell" ||
    tellMcp?.name === "@tell/mcp" ||
    /tell_proof_verify/.test(agents);
  if (isTell) signals.push("tell-proof");

  const hasNext =
    deps.has("next") ||
    hasAnyFile(root, ["next.config.js", "next.config.mjs", "next.config.ts"]);
  if (hasNext) signals.push("next");

  const hasReact = deps.has("react");
  if (hasReact) signals.push("react");

  const hasVue = deps.has("vue") || deps.has("nuxt");
  const hasSvelte = deps.has("svelte") || deps.has("@sveltejs/kit");
  const hasClerk = [...deps].some(
    (name) => name === "clerk" || name.startsWith("@clerk/")
  );
  if (hasClerk) signals.push("clerk");

  const hasPython = hasAnyFile(root, [
    "pyproject.toml",
    "requirements.txt",
    "setup.py",
    "Pipfile",
  ]);
  if (hasPython) signals.push("python");

  const hasWorkspace =
    existsSync(path.join(root, "pnpm-workspace.yaml")) ||
    existsSync(path.join(root, "lerna.json")) ||
    Boolean(pkg?.workspaces);
  const hasPackagesDir = hasSubdir(root, "packages");
  const hasAppsDir = hasSubdir(root, "apps");
  const monorepo = hasWorkspace || hasPackagesDir || hasAppsDir;
  if (monorepo) signals.push("monorepo");

  const ui =
    Boolean(isTell) ||
    hasNext ||
    hasReact ||
    hasVue ||
    hasSvelte ||
    hasAppsDir;

  let profile = "generic";
  if (isKit) profile = "agentic-framework";
  else if (isTell) profile = "tell-proof";
  else if (hasNext && hasClerk) profile = "nextjs-clerk-neon";
  else if (hasPython && !hasNext && !hasReact) profile = "research-python";

  return {
    profile,
    signals,
    ui,
    monorepo,
    isKit,
    isTell,
    hasNext,
    hasPython,
    hasClerk,
  };
}

function uniq(list) {
  return [...new Set(list)];
}

export function chooseAdaptation(detection, profileOverride) {
  const profile = profileOverride ?? detection.profile;
  const enabled = [...ALWAYS_ON];
  const available = [...GATED_AVAILABLE];
  const mcpRecommended = [];

  const useOrchestrate =
    detection.monorepo ||
    detection.isKit ||
    detection.isTell ||
    profile === "agentic-framework" ||
    profile === "tell-proof" ||
    profile === "research-python";
  if (useOrchestrate) enabled.push("orchestrate-rlm");

  const useTellProof =
    detection.isTell ||
    profile === "tell-proof" ||
    (detection.ui && !detection.isKit);
  if (useTellProof) enabled.push("tell-proof");

  if (detection.isKit || profile === "agentic-framework") {
    enabled.push("skill-curator");
  }

  if (useTellProof) mcpRecommended.push("tell");

  let prove = { verify: "./.cursor/verify/verify.sh (replace drive())" };
  if (detection.isKit) {
    prove = { verify: "node scripts/grok-kit.mjs check" };
  } else if (detection.isTell || profile === "tell-proof") {
    prove = { verify: "pnpm test", ui: "tell_proof_verify" };
  } else if (detection.hasNext) {
    prove = { verify: "pnpm test / pnpm lint" };
    if (useTellProof) prove.ui = "tell_proof_verify";
  } else if (detection.hasPython || profile === "research-python") {
    prove = { verify: "pytest" };
  } else if (useTellProof) {
    prove.ui = "tell_proof_verify";
  }

  return {
    profile,
    signals: detection.signals,
    enabled: uniq(enabled),
    available: uniq(available),
    mcpRecommended: uniq(mcpRecommended),
    prove,
    ui: detection.ui,
    monorepo: detection.monorepo,
  };
}
