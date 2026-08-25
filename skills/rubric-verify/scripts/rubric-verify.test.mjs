import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runRubricVerify, scoreRubric } from "./rubric-verify.mjs";

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

describe("scoreRubric", () => {
  it("scores mechanical items and leaves judgment unscored", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rubric-"));
    await writeFile(path.join(dir, "keep.txt"), "hello kit");
    const verdict = await scoreRubric({
      root: dir,
      dryRun: false,
      diffText: "diff --git a/skills/watch-ci/scripts/policy.mjs b/skills/watch-ci/scripts/policy.mjs\n+export",
      rubric: {
        schemaVersion: 1,
        task: "demo",
        items: [
          { id: "exists", kind: "path-exists", path: "keep.txt", severity: "must", claim: "file exists" },
          { id: "diff", kind: "diff-path", pattern: "skills/watch-ci/", severity: "must", claim: "touched watch-ci" },
          { id: "secrets", kind: "diff-excludes", pattern: "API_KEY\\s*=", severity: "must", claim: "no secrets" },
          { id: "grep", kind: "grep-worktree", path: "keep.txt", pattern: "hello", severity: "must", claim: "content" },
          { id: "cmd", kind: "command", command: "true", expectExit: 0, severity: "must", claim: "true" },
          { id: "judge", kind: "judgment", claim: "descriptions stay trigger-only", severity: "must" },
          { id: "should-miss", kind: "path-exists", path: "nope.txt", severity: "should", claim: "optional" },
        ],
      },
    });
    assert.equal(verdict.ok, true);
    assert.equal(verdict.score.mustFail, 0);
    assert.equal(verdict.score.shouldFail, 1);
    assert.equal(verdict.score.judgment, 1);
  });

  it("fails the run on a must failure", async () => {
    const verdict = await scoreRubric({
      root: process.cwd(),
      dryRun: true,
      diffText: "",
      rubric: {
        schemaVersion: 1,
        items: [{ id: "x", kind: "diff-path", pattern: "does-not-appear", severity: "must" }],
      },
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.score.mustFail, 1);
  });

  it("diff-excludes ignores removed lines", async () => {
    const verdict = await scoreRubric({
      root: process.cwd(),
      dryRun: true,
      diffText: `diff --git a/old.js b/old.js\n--- a/old.js\n+++ b/old.js\n-${["API", "_KEY"].join("")}=${JSON.stringify("gone")}\n+const ok = true;\n`,
      rubric: {
        schemaVersion: 1,
        items: [
          {
            id: "secrets",
            kind: "diff-excludes",
            pattern: "(API_KEY|SECRET|TOKEN)\\s*=\\s*['\\\"][^'\\\"]+",
            severity: "must",
          },
        ],
      },
    });
    assert.equal(verdict.ok, true);
  });
});

describe("runRubricVerify CLI", () => {
  it("prints help", async () => {
    let out = "";
    const code = await runRubricVerify(["--help"], {
      stdout: (t) => {
        out += t;
      },
    });
    assert.equal(code, 0);
    assert.match(out, /judgment/);
  });

  it("scores a rubric file against a patch", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rubric-cli-"));
    await mkdir(path.join(dir, "skills", "verify-aci"), { recursive: true });
    await writeFile(path.join(dir, "skills", "verify-aci", "SKILL.md"), "name: verify-aci\n");
    const rubricPath = path.join(dir, "rubric.json");
    const diffPath = path.join(dir, "change.patch");
    await writeFile(
      rubricPath,
      JSON.stringify({
        schemaVersion: 1,
        task: "aci",
        items: [
          { id: "skill", kind: "path-exists", path: "skills/verify-aci/SKILL.md", severity: "must" },
          { id: "diff", kind: "diff-path", pattern: "verify-aci", severity: "must" },
        ],
      })
    );
    await writeFile(diffPath, "+ added skills/verify-aci/SKILL.md\n");
    let out = "";
    const code = await runRubricVerify(
      ["--rubric", rubricPath, "--diff", diffPath, "--root", dir],
      {
        stdout: (t) => {
          out += t;
        },
      }
    );
    const json = JSON.parse(out);
    assert.equal(code, 0);
    assert.equal(json.ok, true);
  });

  it("defaults to .cursor/verify/rubric.json", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rubric-default-"));
    await mkdir(path.join(dir, ".cursor", "verify"), { recursive: true });
    await writeFile(path.join(dir, "keep.txt"), "ok");
    await writeFile(
      path.join(dir, ".cursor", "verify", "rubric.json"),
      JSON.stringify({
        schemaVersion: 1,
        items: [
          {
            id: "keep",
            kind: "path-exists",
            path: "keep.txt",
            severity: "must",
          },
        ],
      })
    );
    let out = "";
    const code = await runRubricVerify(["--root", dir, "--diff", "/dev/null"], {
      stdout: (t) => {
        out += t;
      },
    });
    assert.equal(code, 0, out);
    assert.equal(JSON.parse(out).ok, true);
  });

  it("auto-diff includes untracked files so secret excludes still fire", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rubric-untracked-"));
    git(dir, ["init", "-q"]);
    git(dir, ["config", "user.email", "e2e@example.com"]);
    git(dir, ["config", "user.name", "E2E"]);
    await writeFile(path.join(dir, "README.md"), "# app\n");
    git(dir, ["add", "README.md"]);
    git(dir, ["-c", "commit.gpgsign=false", "commit", "-qm", "init"]);
    await writeFile(
      path.join(dir, "leak.js"),
      `const ${["API", "_KEY"].join("")}=${JSON.stringify("sk-live")};\n`
    );
    const rubricPath = path.join(dir, "rubric.json");
    await writeFile(
      rubricPath,
      JSON.stringify({
        schemaVersion: 1,
        items: [
          {
            id: "secrets",
            kind: "diff-excludes",
            pattern: "(API_KEY|SECRET|TOKEN)\\s*=\\s*['\\\"][^'\\\"]+",
            severity: "must",
          },
        ],
      })
    );
    let out = "";
    const code = await runRubricVerify(
      ["--rubric", rubricPath, "--root", dir],
      {
        stdout: (t) => {
          out += t;
        },
      }
    );
    assert.equal(code, 1, out);
    assert.equal(JSON.parse(out).ok, false);
  });
});
