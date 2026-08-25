#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "./lib/is-main.mjs";

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const SCOPE_FLAGS = Object.freeze({
  "user-layer": "userLayer",
  "project-apply": "projectApply",
  "mcp-slim": "mcpSlim",
  "usage-learn": "usageLearn",
  "harness-improve": "harnessImprove",
});

export const NOTICE = `grok-kit install — explicit consent required

Enabling the plugin does not write your ~/.cursor files or other repos.
Install with consent does the following:

1. User layer (~/.cursor)
   - Copy agents (verifier, debugger, researcher)
   - Install ~/.cursor/rules/grok-kit.mdc (always-on router for consented machines)
   - Symlink skills, local plugin, and ~/.local/bin/grok-kit
   - Merge sessionStart + stop into ~/.cursor/hooks.json (keeps other events)

2. Per-project adaptation
   - sessionStart may write into git repos that lack .cursor/grok-kit.json:
       .cursor/grok-kit.json
       .cursor/rules/grok-kit-project.mdc
     plus a thin bootstrap if those files are missing (does not overwrite rich AGENTS.md)
   - Also adapts the current directory now if it is a git repo (pass --no-apply-cwd to skip)

3. MCP slim (omit with --skip-mcp-slim)
   - Backup ~/.cursor/mcp.json and replace it with ICM-only
   - Product MCP (Tell, databases, deploy, browser) stays project-scoped

4. Usage learn (opt-in: --learn)
   - Record grok-kit command and slash-skill names locally (no file contents, no secrets)
   - Infer common workflows and write .cursor/grok-kit-proposals.json

5. Harness improve (opt-in: --improve, implies --learn)
   - Adapt grok-kit.json enabled features and learned workflow bullets to match usage
   - Never rewrite User Rules, persona, or kit SKILL.md files
   - Skill-text changes still go through /refine-harness (human approve)

This will NOT:
   - Enable Tell or other product MCP globally
   - Rewrite Cursor User Rules / persona
   - Force-push, merge, or modify remotes
   - Apply to directories that are not git work trees
   - Improve the harness without --improve or learn apply --i-consent

Non-interactive: grok-kit install --i-consent
Optional: grok-kit install --i-consent --learn --improve
Interactive: type I CONSENT
This repo only (no user layer): grok-kit apply --root .
Revoke later: grok-kit consent revoke
`;

const HELP = `consent — show, write, or revoke grok-kit install consent

Usage:
  consent notice
  consent status
  consent check [--scope user-layer|project-apply|mcp-slim|usage-learn|harness-improve]
  consent write [--scopes user-layer,project-apply,mcp-slim,usage-learn,harness-improve] [--source TEXT]
  consent revoke

File: ~/.cursor/grok-kit-consent.json (override GROK_KIT_CONSENT_FILE)
`;

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function kitVersion() {
  return readJson(path.join(KIT, "plugin.json"))?.version ?? "0.0.0";
}

export function consentPath(home = process.env.HOME ?? "") {
  if (process.env.GROK_KIT_CONSENT_FILE) {
    return process.env.GROK_KIT_CONSENT_FILE;
  }
  return path.join(home, ".cursor/grok-kit-consent.json");
}

export function emptyScopes() {
  return {
    userLayer: false,
    projectApply: false,
    mcpSlim: false,
    usageLearn: false,
    harnessImprove: false,
  };
}

export function parseScopeList(text) {
  const scopes = emptyScopes();
  if (!text || !String(text).trim()) return scopes;
  for (const part of String(text)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)) {
    const key = SCOPE_FLAGS[part];
    if (!key) throw new Error(`unknown consent scope: ${part}`);
    scopes[key] = true;
  }
  return scopes;
}

export function allScopes(overrides = {}) {
  return {
    ...emptyScopes(),
    userLayer: true,
    projectApply: true,
    mcpSlim: true,
    ...overrides,
  };
}

export function readConsent(file = consentPath()) {
  const data = readJson(file);
  if (!data || data.schemaVersion !== 1 || typeof data.scopes !== "object") {
    return null;
  }
  const scopes = {
    ...emptyScopes(),
    ...data.scopes,
  };
  return {
    schemaVersion: 1,
    kitVersion: data.kitVersion ?? null,
    consentedAt: data.consentedAt ?? null,
    source: data.source ?? null,
    scopes: {
      userLayer: Boolean(scopes.userLayer),
      projectApply: Boolean(scopes.projectApply),
      mcpSlim: Boolean(scopes.mcpSlim),
      usageLearn: Boolean(scopes.usageLearn),
      harnessImprove: Boolean(scopes.harnessImprove),
    },
  };
}

export function hasScope(consent, flagOrKey) {
  if (!consent) return false;
  const key = SCOPE_FLAGS[flagOrKey] ?? flagOrKey;
  return Boolean(consent.scopes?.[key]);
}

export function writeConsent(options = {}) {
  const file = options.file ?? consentPath();
  const record = {
    schemaVersion: 1,
    kitVersion: kitVersion(),
    consentedAt: options.now ?? new Date().toISOString(),
    source: options.source ?? "install --i-consent",
    scopes: {
      ...emptyScopes(),
      ...options.scopes,
    },
  };
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

export function revokeConsent(file = consentPath()) {
  if (existsSync(file)) unlinkSync(file);
  return { ok: true, revoked: true, file };
}

export function parseArgs(argv) {
  const out = {
    cmd: argv[0] ?? null,
    scope: "project-apply",
    scopesText: "user-layer,project-apply,mcp-slim",
    source: "consent write",
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
      case "--scope":
        out.scope = next();
        break;
      case "--scopes":
        out.scopesText = next();
        break;
      case "--source":
        out.source = next();
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  return out;
}

export function runConsent(argv, io = {}) {
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
    case "notice":
      stdout(NOTICE);
      return 0;
    case "status": {
      const file = consentPath();
      const consent = readConsent(file);
      stdout(
        `${JSON.stringify({
          schemaVersion: 1,
          ok: true,
          file,
          consented: Boolean(consent),
          consent,
        })}\n`
      );
      return 0;
    }
    case "check": {
      const consent = readConsent();
      const allowed = hasScope(consent, options.scope);
      stdout(
        `${JSON.stringify({
          schemaVersion: 1,
          ok: allowed,
          scope: options.scope,
          consented: Boolean(consent),
        })}\n`
      );
      return allowed ? 0 : 1;
    }
    case "write": {
      const record = writeConsent({
        scopes: parseScopeList(options.scopesText),
        source: options.source,
      });
      stdout(`${JSON.stringify({ ok: true, file: consentPath(), consent: record })}\n`);
      return 0;
    }
    case "revoke": {
      stdout(`${JSON.stringify(revokeConsent())}\n`);
      return 0;
    }
    default:
      stdout(`${JSON.stringify({ ok: false, error: `unknown command: ${cmd}` })}\n`);
      return 64;
  }
}

export { HELP };

if (isMainModule(import.meta.url)) {
  process.exit(runConsent(process.argv.slice(2)));
}
