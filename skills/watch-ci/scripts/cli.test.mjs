import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HELP, parseArgs, runWatchCi } from "./watch-ci.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("parseArgs", () => {
  it("defaults to status-once", () => {
    const opts = parseArgs([]);
    assert.equal(opts.statusOnce, true);
    assert.equal(opts.watch, false);
  });

  it("watch overrides status-once", () => {
    const opts = parseArgs(["--watch", "--interval", "2", "--timeout", "10"]);
    assert.equal(opts.watch, true);
    assert.equal(opts.statusOnce, false);
    assert.equal(opts.interval, 2);
  });

  it("rejects unknown flags", () => {
    assert.throws(() => parseArgs(["--graphite"]), /unknown argument/);
  });
});

describe("runWatchCi", () => {
  async function fixtureFile(body) {
    const dir = await mkdtemp(path.join(tmpdir(), "watch-ci-cli-"));
    const file = path.join(dir, "f.json");
    await writeFile(file, JSON.stringify(body));
    return file;
  }

  it("prints help", async () => {
    let out = "";
    const code = await runWatchCi(["--help"], {
      stdout: (t) => {
        out += t;
      },
    });
    assert.equal(code, 0);
    assert.match(out, /status-once/);
    assert.match(HELP, /Exit codes/);
  });

  it("classifies a ready fixture", async () => {
    const file = path.join(here, "../fixtures/ready.json");
    let out = "";
    const code = await runWatchCi(["--fixture", file], {
      stdout: (t) => {
        out += t;
      },
    });
    const verdict = JSON.parse(out);
    assert.equal(code, 0);
    assert.equal(verdict.kind, "ready");
  });

  it("pretty-prints blockers", async () => {
    const file = await fixtureFile({
      facts: {
        number: 9,
        owner: "acme",
        repo: "app",
        state: "OPEN",
        mergeable: "CONFLICTING",
        mergeStateStatus: "DIRTY",
        reviewDecision: null,
        isDraft: false,
      },
      checks: [],
      threads: [],
    });
    let out = "";
    const code = await runWatchCi(["--fixture", file, "--pretty"], {
      stdout: (t) => {
        out += t;
      },
    });
    assert.equal(code, 2);
    assert.match(out, /conflicts/);
  });

  it("--watch stops at a non-transient verdict", async () => {
    const file = path.join(here, "../fixtures/approval-wait.json");
    let sleeps = 0;
    const code = await runWatchCi(["--fixture", file, "--watch", "--interval", "1"], {
      stdout: () => {},
      sleep: async () => {
        sleeps += 1;
      },
    });
    assert.equal(code, 0);
    assert.equal(sleeps, 0);
  });

  it("--watch times out while pending", async () => {
    const file = path.join(here, "../fixtures/pending.json");
    let now = 0;
    const code = await runWatchCi(
      ["--fixture", file, "--watch", "--interval", "1", "--timeout", "5"],
      {
        stdout: () => {},
        now: () => now,
        sleep: async () => {
          now += 6000;
        },
      }
    );
    assert.equal(code, 5);
  });
});
