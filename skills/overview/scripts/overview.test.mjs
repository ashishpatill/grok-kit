import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  buildOverview,
  renderMermaid,
  runOverview,
  shortLine,
} from "./overview.mjs";

function run(argv) {
  let out = "";
  const code = runOverview(argv, {
    stdout: (text) => {
      out += text;
    },
  });
  return { code, out, json: out.trim().startsWith("{") ? JSON.parse(out) : null };
}

describe("overview", () => {
  it("prints help", () => {
    const { code, out } = run(["--help"]);
    assert.equal(code, 0);
    assert.match(out, /flagship/);
    assert.match(out, /visualise/);
  });

  it("snapshots a git repo and keeps mermaid free of timestamps", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "overview-"));
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("git", ["config", "user.email", "e2e@example.com"], { cwd: dir });
    execFileSync("git", ["config", "user.name", "E2E"], { cwd: dir });
    await writeFile(path.join(dir, "README.md"), "# App\n");
    execFileSync("git", ["add", "README.md"], { cwd: dir });
    execFileSync("git", ["commit", "-qm", "init"], { cwd: dir });
    await mkdir(path.join(dir, ".cursor"), { recursive: true });
    await writeFile(
      path.join(dir, ".cursor/grok-kit.json"),
      JSON.stringify({
        profile: "generic",
        enabled: ["route-task", "verify-aci"],
        prove: { verify: "true" },
      })
    );
    const payload = buildOverview(dir, { when: "start", mode: "flagship" });
    assert.equal(payload.ok, true);
    assert.equal(payload.git.repo, true);
    assert.equal(payload.kit.profile, "generic");
    assert.match(payload.mermaid, /flowchart/);
    assert.doesNotMatch(payload.mermaid, /\d{4}-\d{2}-\d{2}T/);
    const line = shortLine(payload);
    assert.match(line, /flagship start/);
    assert.match(line, /\/overview/);

    const vis = run(["--root", dir, "--mode", "visualise"]);
    assert.equal(vis.code, 0);
    assert.equal(vis.json.mode, "visualise");
    assert.match(vis.json.mermaid, /generic/);

    const brief = run(["--root", dir, "--when", "start", "--short"]);
    assert.equal(brief.code, 0);
    assert.match(brief.json.line, /branch=/);
  });

  it("renderMermaid includes enabled features", () => {
    const text = renderMermaid(
      { profile: "tell-proof", enabled: ["tell-proof"] },
      { branch: "main", dirtyCount: 0 }
    );
    assert.match(text, /tell-proof/);
    assert.match(text, /main/);
  });
});
