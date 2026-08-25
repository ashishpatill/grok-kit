import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COMMANDS, HELP, runGrokKit } from "./grok-kit.mjs";

describe("grok-kit dispatcher", () => {
  it("lists compiled commands", () => {
    for (const name of [
      "verify-aci",
      "watch-ci",
      "rubric-verify",
      "state-tools",
      "bootstrap",
      "apply",
      "consent",
      "route-task",
      "session-handoff",
      "skill-curator",
      "check",
      "install",
      "seed-icm",
    ]) {
      assert.ok(COMMANDS[name], name);
    }
    assert.match(HELP, /verify-aci/);
    assert.match(HELP, /apply/);
    assert.match(HELP, /--i-consent/);
    assert.match(HELP, /\.local\/bin\/grok-kit/);
  });

  it("prints help", async () => {
    let out = "";
    const code = await runGrokKit(["--help"], {
      stdout: (t) => {
        out += t;
      },
      spawnFile: async () => {
        throw new Error("should not spawn");
      },
    });
    assert.equal(code, 0);
    assert.match(out, /bootstrap/);
  });

  it("rejects unknown commands", async () => {
    let out = "";
    const code = await runGrokKit(["sticky-mode"], {
      stdout: (t) => {
        out += t;
      },
      spawnFile: async () => {
        throw new Error("should not spawn");
      },
    });
    assert.equal(code, 64);
    assert.match(out, /unknown command/);
  });

  it("dispatches remaining args to the skill script", async () => {
    const calls = [];
    const code = await runGrokKit(["watch-ci", "--fixture", "x.json"], {
      stdout: () => {},
      spawnFile: async (kind, file, args) => {
        calls.push({ kind, file, args });
        return 0;
      },
    });
    assert.equal(code, 0);
    assert.equal(calls[0].kind, "node");
    assert.match(calls[0].file, /watch-ci\.mjs$/);
    assert.deepEqual(calls[0].args, ["--fixture", "x.json"]);
  });
});
