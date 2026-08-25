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
  it("prints help", () => {
    let out = "";
    const code = runSessionHandoff(["--help"], {
      stdout: (t) => {
        out += t;
      },
    });
    assert.equal(code, 0);
    assert.match(out, /init/);
  });

  it("init writes a skeleton that check rejects until filled", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "handoff-"));
    let out = "";
    const code = runSessionHandoff(
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
    const skip = runSessionHandoff(["init", "--root", dir], {
      stdout: (t) => {
        out += t;
      },
    });
    assert.equal(skip, 0);
    assert.equal(JSON.parse(out).action, "skip");
  });

  it("check passes a filled handoff and rejects secrets", () => {
    const filled = skeleton("kit").replace("(describe)", "Ship the PATH CLI.");
    assert.equal(checkHandoff(filled).ok, true);
    const leaked = `${filled}\n${["API", "_KEY"].join("")}=${JSON.stringify("sk-test")}\n`;
    assert.equal(checkHandoff(leaked).ok, false);
    assert.equal(checkHandoff(leaked).secrets, true);
  });
});
