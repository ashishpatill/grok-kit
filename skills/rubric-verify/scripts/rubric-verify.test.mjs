import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runRubricVerify, scoreRubric } from "./rubric-verify.mjs";

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
});
