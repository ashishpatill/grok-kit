import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runVerifyAci } from "./verify-aci.mjs";

async function capture(argv) {
  let out = "";
  const code = await runVerifyAci(argv, {
    stdout: (text) => {
      out += text;
    },
  });
  return { code, out, json: out.trim().startsWith("{") ? JSON.parse(out) : null };
}

describe("verify-aci", () => {
  it("prints help", async () => {
    const { code, out } = await capture(["--help"]);
    assert.equal(code, 0);
    assert.match(out, /doctor \/ launch \/ drive/);
  });

  it("reports missing ACI", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "aci-missing-"));
    const { code, json } = await capture(["--root", dir]);
    assert.equal(code, 2);
    assert.equal(json.error, "missing-aci");
    assert.match(json.next, /verify\.sh/);
  });

  it("runs doctor, launch, drive and stops on first failure", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "aci-run-"));
    const scriptDir = path.join(dir, ".cursor", "verify");
    await mkdir(scriptDir, { recursive: true });
    const script = path.join(scriptDir, "verify.sh");
    await writeFile(
      script,
      `#!/usr/bin/env bash
set -euo pipefail
case "\${1:-all}" in
  doctor) echo doctor-ok; exit 0 ;;
  launch) echo launch-ok; exit 0 ;;
  drive) echo drive-fail; exit 7 ;;
  *) exit 1 ;;
esac
`
    );
    await chmod(script, 0o755);
    const { code, json } = await capture(["--root", dir, "--phase", "all"]);
    assert.equal(code, 7);
    assert.equal(json.ok, false);
    assert.equal(json.steps.length, 3);
    assert.equal(json.steps[0].ok, true);
    assert.equal(json.steps[2].ok, false);
    assert.equal(json.steps[2].phase, "drive");
  });

  it("honors feature-map surface commands", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "aci-map-"));
    const scriptDir = path.join(dir, ".cursor", "verify");
    await mkdir(scriptDir, { recursive: true });
    await writeFile(
      path.join(scriptDir, "feature-map.json"),
      JSON.stringify({
        schemaVersion: 1,
        surfaces: {
          unit: { doctor: "echo mapped-doctor", launch: "true", drive: "true" },
        },
      })
    );
    const { code, json } = await capture([
      "--root",
      dir,
      "--surface",
      "unit",
      "--phase",
      "doctor",
    ]);
    assert.equal(code, 0);
    assert.equal(json.ok, true);
    assert.equal(json.surface, "unit");
    assert.equal(json.steps[0].command, "echo mapped-doctor");
  });
});
