import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs, renderProjectRule, runApply } from "./apply.mjs";

async function tmp() {
  return mkdtemp(path.join(tmpdir(), "apply-"));
}

function run(argv) {
  let out = "";
  const code = runApply(argv, {
    stdout: (text) => {
      out += text;
    },
  });
  return { code, out, json: out.trim().startsWith("{") ? JSON.parse(out) : null };
}

function gitInit(dir) {
  execFileSync("git", ["init", "-q"], { cwd: dir });
}

describe("apply", () => {
  it("prints help", () => {
    const { code, out } = run(["--help"]);
    assert.equal(code, 0);
    assert.match(out, /--if-missing/);
    assert.match(out, /tell-proof/);
  });

  it("rejects unknown flags", () => {
    const { code, json } = run(["--nope"]);
    assert.equal(code, 64);
    assert.equal(json.ok, false);
  });

  it("detect-only writes nothing", async () => {
    const dir = await tmp();
    await mkdir(path.join(dir, "packages/mcp"), { recursive: true });
    await writeFile(
      path.join(dir, "AGENTS.md"),
      "# Tell\n\ntell_proof_verify here\n"
    );
    await writeFile(
      path.join(dir, "packages/mcp/package.json"),
      JSON.stringify({ name: "@tell/mcp" })
    );
    const { code, json } = run(["--root", dir, "--detect-only"]);
    assert.equal(code, 0);
    assert.equal(json.profile, "tell-proof");
    assert.ok(json.enabled.includes("tell-proof"));
    assert.equal(existsSync(path.join(dir, ".cursor/grok-kit.json")), false);
  });

  it("applies a Tell-shaped tree without clobbering AGENTS.md", async () => {
    const dir = await tmp();
    await mkdir(path.join(dir, "packages/mcp"), { recursive: true });
    const original = "# Tell\n\nExisting rich AGENTS. tell_proof_verify listed.\n";
    await writeFile(path.join(dir, "AGENTS.md"), original);
    await writeFile(
      path.join(dir, "packages/mcp/package.json"),
      JSON.stringify({ name: "@tell/mcp" })
    );
    const { code, json } = run(["--root", dir]);
    assert.equal(code, 0, json && JSON.stringify(json));
    assert.equal(json.profile, "tell-proof");
    const agents = await readFile(path.join(dir, "AGENTS.md"), "utf8");
    assert.ok(agents.startsWith(original.trim()));
    assert.match(agents, /grok-kit apply/);
    assert.match(agents, /tell_proof_verify/);
    const manifest = JSON.parse(
      await readFile(path.join(dir, ".cursor/grok-kit.json"), "utf8")
    );
    assert.equal(manifest.profile, "tell-proof");
    assert.ok(manifest.enabled.includes("tell-proof"));
    const rule = await readFile(
      path.join(dir, ".cursor/rules/grok-kit-project.mdc"),
      "utf8"
    );
    assert.match(rule, /alwaysApply: true/);
    assert.match(rule, /tell_proof_verify/);
    assert.match(rule, /tell-proof/);
    assert.equal(existsSync(path.join(dir, ".cursor/mcp.json")), false);
  });

  it("skips the second --if-missing run", async () => {
    const dir = await tmp();
    run(["--root", dir, "--profile", "generic"]);
    const { code, json } = run(["--root", dir, "--if-missing"]);
    assert.equal(code, 0);
    assert.equal(json.skipped, true);
    assert.equal(json.reason, "already-adapted");
    assert.equal(json.profile, "generic");
  });

  it("--require-git skips a non-git directory", async () => {
    const dir = await tmp();
    const { code, json } = run(["--root", dir, "--require-git"]);
    assert.equal(code, 0);
    assert.equal(json.reason, "not-a-git-repo");
    assert.equal(existsSync(path.join(dir, ".cursor/grok-kit.json")), false);
  });

  it("applies inside a git repo when --require-git is set", async () => {
    const dir = await tmp();
    gitInit(dir);
    const { code, json } = run(["--root", dir, "--require-git", "--profile", "generic"]);
    assert.equal(code, 0, json && JSON.stringify(json));
    assert.equal(json.skipped, undefined);
    assert.equal(existsSync(path.join(dir, ".cursor/grok-kit.json")), true);
  });

  it("dry-run does not write adaptation files", async () => {
    const dir = await tmp();
    const { code, json } = run(["--root", dir, "--dry-run"]);
    assert.equal(code, 0);
    assert.equal(json.dryRun, true);
    assert.equal(existsSync(path.join(dir, ".cursor/grok-kit.json")), false);
    assert.equal(existsSync(path.join(dir, ".cursor/rules/core.mdc")), false);
  });

  it("writes Tell MCP only with --write-mcp and skips a second copy", async () => {
    const dir = await tmp();
    await mkdir(path.join(dir, "packages/mcp"), { recursive: true });
    await writeFile(
      path.join(dir, "packages/mcp/package.json"),
      JSON.stringify({ name: "@tell/mcp" })
    );
    const first = run(["--root", dir, "--write-mcp"]);
    assert.equal(first.code, 0, first.json && JSON.stringify(first.json));
    assert.equal(first.json.mcpWritten, true);
    const mcp = JSON.parse(
      await readFile(path.join(dir, ".cursor/mcp.json"), "utf8")
    );
    assert.equal(mcp.mcpServers.tell.command, "pnpm");
    const second = run(["--root", dir, "--write-mcp"]);
    assert.equal(second.code, 0);
    assert.equal(second.json.mcpWritten, false);
  });

  it("renderProjectRule stays a thin router", () => {
    const text = renderProjectRule({
      profile: "tell-proof",
      enabled: ["route-task", "tell-proof"],
      available: ["refine-harness"],
      mcpRecommended: ["tell"],
      prove: { verify: "pnpm test", ui: "tell_proof_verify" },
    });
    assert.match(text, /only these enabled features/);
    assert.match(text, /tell_proof_verify/);
    assert.ok(text.split("\n").length < 40);
  });

  it("parseArgs resolves --root", () => {
    const options = parseArgs(["--root", ".", "--if-missing"]);
    assert.equal(options.ifMissing, true);
    assert.equal(path.isAbsolute(options.root), true);
  });
});
