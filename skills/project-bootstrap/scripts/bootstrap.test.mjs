import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { planBootstrap, runBootstrap } from "./bootstrap.mjs";

describe("bootstrap", () => {
  it("prints help", () => {
    let out = "";
    const code = runBootstrap(["--help"], {
      stdout: (t) => {
        out += t;
      },
    });
    assert.equal(code, 0);
    assert.match(out, /--profile/);
  });

  it("creates a generic project layer and does not clobber a second run", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "boot-"));
    let out = "";
    const code = runBootstrap(["--root", dir, "--profile", "generic"], {
      stdout: (t) => {
        out += t;
      },
    });
    assert.equal(code, 0);
    const first = JSON.parse(out);
    assert.equal(first.ok, true);
    assert.equal(existsSync(path.join(dir, ".cursor/verify/verify.sh")), true);
    assert.equal(existsSync(path.join(dir, ".cursor/verify/rubric.json")), true);
    assert.equal(existsSync(path.join(dir, ".cursor/rules/core.mdc")), true);
    assert.equal(existsSync(path.join(dir, ".cursorignore")), true);
    assert.match(await readFile(path.join(dir, "AGENTS.md"), "utf8"), /verify-aci/);
    const gitignore = await readFile(path.join(dir, ".gitignore"), "utf8");
    assert.match(gitignore, /last\.json/);
    assert.match(gitignore, /grok-kit-proposals\.json/);
    assert.match(gitignore, /grok-kit-usage\.jsonl/);
    assert.match(gitignore, /overview\.json/);
    assert.match(gitignore, /hygiene\.json/);

    out = "";
    runBootstrap(["--root", dir, "--profile", "generic"], {
      stdout: (t) => {
        out += t;
      },
    });
    const second = JSON.parse(out);
    const verify = second.steps.find((s) => s.rel === ".cursor/verify/verify.sh");
    assert.equal(verify.action, "skip");
    const agents = second.steps.find((s) => s.rel === "AGENTS.md");
    assert.equal(agents.action, "skip");
  });

  it("loads tell-proof core.mdc from templates", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "boot-tell-"));
    runBootstrap(["--root", dir, "--profile", "tell-proof"], {
      stdout: () => {},
    });
    const core = await readFile(path.join(dir, ".cursor/rules/core.mdc"), "utf8");
    assert.match(core, /tell_proof_verify/);
    const agents = await readFile(path.join(dir, "AGENTS.md"), "utf8");
    assert.match(agents, /tell_apply/);
  });

  it("loads agentic-framework core.mdc from templates", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "boot-af-"));
    runBootstrap(["--root", dir, "--profile", "agentic-framework"], {
      stdout: () => {},
    });
    const core = await readFile(path.join(dir, ".cursor/rules/core.mdc"), "utf8");
    assert.match(core, /Agentic framework/);
  });

  it("skips AGENTS.md when verify-aci is already named without a slash", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "boot-skip-"));
    await writeFile(path.join(dir, "AGENTS.md"), "# App\n\nverify-aci is listed\n");
    const steps = planBootstrap(dir, { profile: "generic", forceVerify: false });
    const agents = steps.find((s) => s.rel === "AGENTS.md");
    assert.equal(agents.action, "skip");
  });

  it("appends a kit section to an existing AGENTS.md that lacks verify-aci", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "boot-agents-"));
    await writeFile(path.join(dir, "AGENTS.md"), "# App\n\n## Stack\n");
    const steps = planBootstrap(dir, {
      profile: "generic",
      forceVerify: false,
    });
    const agents = steps.find((s) => s.rel === "AGENTS.md");
    assert.equal(agents.action, "append");
    let out = "";
    runBootstrap(["--root", dir], {
      stdout: (t) => {
        out += t;
      },
    });
    const body = await readFile(path.join(dir, "AGENTS.md"), "utf8");
    assert.match(body, /# App/);
    assert.match(body, /\/watch-ci/);
  });

  it("dry-run writes nothing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "boot-dry-"));
    await mkdir(dir, { recursive: true });
    runBootstrap(["--root", dir, "--dry-run"], { stdout: () => {} });
    assert.equal(existsSync(path.join(dir, ".cursor/verify/verify.sh")), false);
  });
});
