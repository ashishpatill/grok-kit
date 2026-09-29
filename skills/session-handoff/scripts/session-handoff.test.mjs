import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  checkHandoff,
  runSessionHandoff,
  skeleton,
} from "./session-handoff.mjs";

describe("session-handoff", () => {
  it("prints help", async () => {
    let out = "";
    const code = await runSessionHandoff(["--help"], {
      stdout: (t) => {
        out += t;
      },
    });
    assert.equal(code, 0);
    assert.match(out, /init/);
    assert.match(out, /close/);
  });

  it("init writes a skeleton that check rejects until filled", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "handoff-"));
    let out = "";
    const code = await runSessionHandoff(
      ["init", "--root", dir, "--project", "kit"],
      {
        stdout: (t) => {
          out += t;
        },
      }
    );
    assert.equal(code, 0);
    const created = JSON.parse(out);
    const body = await readFile(created.path, "utf8");
    assert.match(body, /## Goal/);
    const incomplete = checkHandoff(body);
    assert.equal(incomplete.ok, false);
    assert.equal(incomplete.placeholder, true);

    out = "";
    const skip = await runSessionHandoff(["init", "--root", dir], {
      stdout: (t) => {
        out += t;
      },
    });
    assert.equal(skip, 0);
    assert.equal(JSON.parse(out).action, "skip");
  });

  it("close emits episodic via propose when check passes", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "handoff-close-"));
    await runSessionHandoff(["init", "--root", dir, "--project", "grokkit"], {
      stdout: () => {},
    });
    const dest = path.join(dir, ".cursor", "handoff.md");
    const filled = skeleton("grokkit").replace("(describe)", "Ship P2.K2 episodic emit.");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(dest, filled);
    let out = "";
    let proposed = null;
    const code = await runSessionHandoff(["close", "--root", dir, "--project", "grokkit"], {
      stdout: (t) => {
        out += t;
      },
      proposeFn: async (args) => {
        proposed = args;
        return { status: "ok", decision: "auto_approved", reason: "episodic-or-node_local", id: "test-id" };
      },
    });
    assert.equal(code, 0);
    const verdict = JSON.parse(out);
    assert.equal(verdict.action, "close");
    assert.equal(verdict.namespace, "handoff-grokkit");
    assert.equal(verdict.memory.decision, "auto_approved");
    assert.equal(proposed.metadata.type, "episodic");
    assert.match(proposed.text, /Ship P2.K2/);
  });

  it("check passes a filled handoff and rejects secrets", () => {
    const filled = skeleton("kit").replace("(describe)", "Ship the PATH CLI.");
    assert.equal(checkHandoff(filled).ok, true);
    const leaked = `${filled}\n${["API", "_KEY"].join("")}=${JSON.stringify("sk-test")}\n`;
    assert.equal(checkHandoff(leaked).ok, false);
    assert.equal(checkHandoff(leaked).secrets, true);
  });
});
