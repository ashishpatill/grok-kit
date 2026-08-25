import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildRsi, runRsi } from "./rsi.mjs";

function run(argv) {
  let out = "";
  const code = runRsi(argv, {
    stdout: (text) => {
      out += text;
    },
  });
  return { code, out, json: out.trim().startsWith("{") ? JSON.parse(out) : null };
}

describe("rsi", () => {
  it("prints help", () => {
    const { code, out } = run(["--help"]);
    assert.equal(code, 0);
    assert.match(out, /review before ship/);
  });

  it("bundles flagship and hygiene without merging", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rsi-"));
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("git", ["config", "user.email", "e2e@example.com"], { cwd: dir });
    execFileSync("git", ["config", "user.name", "E2E"], { cwd: dir });
    await writeFile(path.join(dir, "README.md"), "# App\n");
    execFileSync("git", ["add", "README.md"], { cwd: dir });
    execFileSync("git", ["commit", "-qm", "init"], { cwd: dir });
    await mkdir(path.join(dir, ".cursor"), { recursive: true });
    await writeFile(
      path.join(dir, ".cursor/grok-kit.json"),
      JSON.stringify({ profile: "tell-proof", enabled: ["tell-proof"] })
    );
    await writeFile(path.join(dir, "src-dead.mjs"), "export const dead = 1;\n");

    const payload = buildRsi(dir);
    assert.equal(payload.ok, true);
    assert.equal(payload.sticky, false);
    assert.match(payload.flagship.line, /flagship/);
    assert.match(payload.hygiene.line, /hygiene findings=/);
    assert.ok(payload.steps.some((step) => /watch-ci/.test(step)));
    assert.match(payload.next, /Merge only if the user asked/);
    assert.doesNotMatch(JSON.stringify(payload), /\d{4}-\d{2}-\d{2}T/);

    const brief = run(["--root", dir, "--short"]);
    assert.equal(brief.code, 0);
    assert.match(brief.json.line, /flagship/);
    assert.match(brief.json.line, /hygiene findings=/);
  });
});
