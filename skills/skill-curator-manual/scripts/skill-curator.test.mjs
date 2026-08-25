import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  inventoryFromDirs,
  listSkillDirs,
  parseFrontmatter,
  runSkillCurator,
} from "./skill-curator.mjs";

describe("skill-curator", () => {
  it("prints help", () => {
    let out = "";
    const code = runSkillCurator(["--help"], {
      stdout: (t) => {
        out += t;
      },
    });
    assert.equal(code, 0);
    assert.match(out, /inventory/);
  });

  it("parses folded descriptions and flags overlap", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "curator-"));
    const a = path.join(dir, "alpha");
    const b = path.join(dir, "beta");
    await mkdir(a);
    await mkdir(b);
    await writeFile(
      path.join(a, "SKILL.md"),
      "---\nname: alpha\ndescription: >-\n  Verify completed work against tests.\n---\n# A\n"
    );
    await writeFile(
      path.join(b, "SKILL.md"),
      "---\nname: beta\ndescription: Verify completed work against tests and the plan.\n---\n# B\n"
    );
    const meta = parseFrontmatter(
      "---\nname: alpha\ndescription: >-\n  Verify completed work against tests.\n---\n"
    );
    assert.equal(meta.name, "alpha");
    assert.match(meta.description, /Verify completed work/);
    const report = inventoryFromDirs([a, b]);
    assert.equal(report.skillCount, 2);
    assert.ok(report.overlap.length >= 1);
  });

  it("scans a flat skills directory (user-layer ~/.cursor/skills)", async () => {
    const kit = await mkdtemp(path.join(tmpdir(), "curator-kit-"));
    await mkdir(path.join(kit, "skills", "cost-check"), { recursive: true });
    await writeFile(
      path.join(kit, "skills", "cost-check", "SKILL.md"),
      "---\nname: cost-check\ndescription: routing matrix\n---\n# C\n"
    );
    const user = await mkdtemp(path.join(tmpdir(), "curator-user-"));
    const skill = path.join(user, "verify-aci");
    await mkdir(skill);
    await writeFile(
      path.join(skill, "SKILL.md"),
      "---\nname: verify-aci\ndescription: prove it\n---\n# V\n"
    );
    assert.equal(listSkillDirs(user).length, 1);

    let out = "";
    const code = runSkillCurator(
      ["inventory", "--kit", kit, "--also", user],
      {
        stdout: (t) => {
          out += t;
        },
      }
    );
    assert.equal(code, 0, out);
    const json = JSON.parse(out);
    const names = json.skills.map((s) => s.name).sort();
    assert.deepEqual(names, ["cost-check", "verify-aci"]);
  });
});
