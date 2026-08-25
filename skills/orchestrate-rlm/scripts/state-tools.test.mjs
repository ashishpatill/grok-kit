import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkState, renderSpawn, runStateTools } from "./state-tools.mjs";

const GOOD = `# STATE

## GOAL

Ship verify-aci for one repo.

## Acceptance

- \`node --test skills/verify-aci/scripts/verify-aci.test.mjs\`

## Budget

- max children: 2
- max passes: 1
- depth: 1

## Units

### unit-aci

- goal: add the verify runner
- paths: /workspace/skills/verify-aci
- verify: node --test skills/verify-aci/scripts/verify-aci.test.mjs
- done: runner JSON + tests
- non-goals: visual swarm
`;

describe("checkState", () => {
  it("accepts a complete STATE.md", () => {
    const v = checkState(GOOD);
    assert.equal(v.ok, true);
    assert.deepEqual(v.units, ["unit-aci"]);
  });

  it("rejects missing headings", () => {
    const v = checkState("# STATE\n\n## GOAL\n\nhi\n");
    assert.equal(v.ok, false);
    assert.ok(v.missing.includes("Acceptance"));
  });
});

describe("renderSpawn", () => {
  it("compiles a Task contract from units", () => {
    const v = renderSpawn(GOOD);
    assert.equal(v.ok, true);
    assert.equal(v.contracts.length, 1);
    assert.match(v.contracts[0], /goal: add the verify runner/);
    assert.match(v.contracts[0], /return: ≤8 bullets/);
  });
});

describe("CLI", () => {
  it("check and render-spawn round-trip a file", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "state-"));
    const file = path.join(dir, "STATE.md");
    await writeFile(file, GOOD);
    let out = "";
    const code = runStateTools(["check", file], {
      stdout: (t) => {
        out += t;
      },
    });
    assert.equal(code, 0);
    assert.equal(JSON.parse(out).ok, true);
    out = "";
    const code2 = runStateTools(["render-spawn", file], {
      stdout: (t) => {
        out += t;
      },
    });
    assert.equal(code2, 0);
    assert.equal(JSON.parse(out).contracts.length, 1);
  });
});
