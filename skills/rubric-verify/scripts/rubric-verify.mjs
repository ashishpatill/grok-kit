#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HELP = `rubric-verify — score a short repo-grounded checklist against a diff

Usage:
  rubric-verify --rubric FILE.json [--diff FILE.patch] [--root DIR] [--dry-run]

Item kinds:
  path-exists     worktree path exists
  diff-path       unified diff mentions a path/pattern
  diff-excludes   unified diff must NOT match a pattern
  grep-worktree   file contents match (or --negate)
  command         run a command (skipped with --dry-run)
  judgment        left for a cheap verifier — not auto-scored

must failures fail the run. should failures warn. judgment items are unscored.
`;

function parseArgs(argv) {
  const out = {
    rubric: null,
    diff: null,
    root: process.cwd(),
    dryRun: false,
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
      case "--rubric":
        out.rubric = next();
        break;
      case "--diff":
        out.diff = next();
        break;
      case "--root":
        out.root = path.resolve(next());
        break;
      case "--dry-run":
        out.dryRun = true;
        break;
      case "--json":
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  return out;
}

function runCommand(argv, cwd) {
  return new Promise((resolve) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c) => {
      stdout += c;
    });
    child.stderr.on("data", (c) => {
      stderr += c;
    });
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    child.on("error", (error) =>
      resolve({ code: 1, stdout: "", stderr: error.message })
    );
  });
}

function asRegex(pattern) {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

function matches(haystack, pattern) {
  const rx = asRegex(pattern);
  if (rx) return rx.test(haystack);
  return haystack.includes(pattern);
}

export async function scoreRubric({ rubric, diffText, root, dryRun }) {
  const items = Array.isArray(rubric.items) ? rubric.items : [];
  const results = [];
  for (const item of items) {
    results.push(await scoreItem(item, { diffText, root, dryRun }));
  }
  const mustFail = results.filter((r) => r.severity === "must" && r.status === "fail");
  const shouldFail = results.filter((r) => r.severity === "should" && r.status === "fail");
  const judgment = results.filter((r) => r.status === "judgment");
  const mustPass = results.filter((r) => r.severity === "must" && r.status === "pass");
  const shouldPass = results.filter((r) => r.severity === "should" && r.status === "pass");
  return {
    schemaVersion: 1,
    ok: mustFail.length === 0,
    task: rubric.task ?? "",
    score: {
      mustPass: mustPass.length,
      mustFail: mustFail.length,
      shouldPass: shouldPass.length,
      shouldFail: shouldFail.length,
      judgment: judgment.length,
    },
    items: results,
  };
}

async function scoreItem(item, ctx) {
  const severity = item.severity === "should" ? "should" : "must";
  const base = {
    id: item.id ?? item.claim ?? "item",
    claim: item.claim ?? "",
    kind: item.kind,
    severity,
  };
  switch (item.kind) {
    case "judgment":
      return { ...base, status: "judgment", detail: "left for the cheap verifier" };
    case "path-exists": {
      const target = path.resolve(ctx.root, item.path ?? "");
      const ok = existsSync(target);
      return {
        ...base,
        status: ok ? "pass" : "fail",
        detail: ok ? `exists ${item.path}` : `missing ${item.path}`,
      };
    }
    case "diff-path": {
      const ok = matches(ctx.diffText, item.pattern ?? "");
      return {
        ...base,
        status: ok ? "pass" : "fail",
        detail: ok ? "path present in diff" : `diff missing ${item.pattern}`,
      };
    }
    case "diff-excludes": {
      const hit = matches(ctx.diffText, item.pattern ?? "");
      return {
        ...base,
        status: hit ? "fail" : "pass",
        detail: hit ? `diff matched forbidden ${item.pattern}` : "forbidden pattern absent",
      };
    }
    case "grep-worktree": {
      const file = path.resolve(ctx.root, item.path ?? "");
      if (!existsSync(file)) {
        return { ...base, status: "fail", detail: `missing ${item.path}` };
      }
      const body = readFileSync(file, "utf8");
      const hit = matches(body, item.pattern ?? "");
      const negate = Boolean(item.negate);
      const ok = negate ? !hit : hit;
      return {
        ...base,
        status: ok ? "pass" : "fail",
        detail: ok ? "worktree match" : `no match in ${item.path}`,
      };
    }
    case "command": {
      if (ctx.dryRun) {
        return { ...base, status: "skip", detail: "dry-run: command not executed" };
      }
      const command = item.command;
      if (!command) {
        return { ...base, status: "fail", detail: "missing command" };
      }
      const result = await runCommand(["bash", "-lc", command], ctx.root);
      const expect = item.expectExit ?? 0;
      const ok = result.code === expect;
      return {
        ...base,
        status: ok ? "pass" : "fail",
        detail: ok ? `exit ${result.code}` : `exit ${result.code}, expected ${expect}`,
      };
    }
    default: {
      return {
        ...base,
        status: "fail",
        detail: `unknown kind ${item.kind}`,
      };
    }
  }
}

export async function runRubricVerify(argv, io = {}) {
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
  if (!options.rubric) {
    stdout(`${JSON.stringify({ ok: false, error: "--rubric is required" })}\n`);
    return 64;
  }
  let rubric;
  try {
    rubric = JSON.parse(readFileSync(path.resolve(options.rubric), "utf8"));
  } catch (error) {
    stdout(
      `${JSON.stringify({ ok: false, error: `invalid rubric: ${error.message}` })}\n`
    );
    return 2;
  }
  if (rubric.schemaVersion !== 1 || !Array.isArray(rubric.items)) {
    stdout(
      `${JSON.stringify({ ok: false, error: "rubric must have schemaVersion 1 and items[]" })}\n`
    );
    return 2;
  }

  let diffText = "";
  if (options.diff) {
    diffText = readFileSync(path.resolve(options.diff), "utf8");
  } else {
    const unstaged = await runCommand(["git", "diff"], options.root);
    const staged = await runCommand(["git", "diff", "--cached"], options.root);
    diffText = `${staged.stdout}\n${unstaged.stdout}`;
  }

  const verdict = await scoreRubric({
    rubric,
    diffText,
    root: options.root,
    dryRun: options.dryRun,
  });
  stdout(`${JSON.stringify(verdict)}\n`);
  return verdict.ok ? 0 : 1;
}

export { HELP, parseArgs };

function isMainModule(metaUrl) {
  if (!process.argv[1]) return false;
  const self = fileURLToPath(metaUrl);
  let invoked;
  try {
    invoked = realpathSync(process.argv[1]);
  } catch {
    invoked = path.resolve(process.argv[1]);
  }
  return self === invoked;
}

const isMain = isMainModule(import.meta.url);
if (isMain) {
  runRubricVerify(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
      process.exit(1);
    });
}
