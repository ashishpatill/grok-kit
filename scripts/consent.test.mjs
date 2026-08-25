import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  NOTICE,
  hasScope,
  parseScopeList,
  readConsent,
  revokeConsent,
  runConsent,
  writeConsent,
} from "./consent.mjs";

describe("consent", () => {
  it("prints notice and help", () => {
    let out = "";
    assert.equal(
      runConsent(["notice"], {
        stdout: (text) => {
          out += text;
        },
      }),
      0
    );
    assert.match(out, /I CONSENT/);
    assert.match(NOTICE, /--i-consent/);
    out = "";
    assert.equal(
      runConsent(["--help"], {
        stdout: (text) => {
          out += text;
        },
      }),
      0
    );
    assert.match(out, /consent status/);
  });

  it("round-trips write, check, revoke", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "consent-"));
    const file = path.join(dir, "grok-kit-consent.json");
    const prev = process.env.GROK_KIT_CONSENT_FILE;
    process.env.GROK_KIT_CONSENT_FILE = file;
    try {
      const record = writeConsent({
        scopes: parseScopeList("user-layer,project-apply"),
        source: "test",
        now: "2026-08-25T00:00:00.000Z",
        file,
      });
      assert.equal(record.scopes.userLayer, true);
      assert.equal(record.scopes.projectApply, true);
      assert.equal(record.scopes.mcpSlim, false);
      const body = JSON.parse(await readFile(file, "utf8"));
      assert.equal(body.source, "test");
      const consent = readConsent(file);
      assert.equal(hasScope(consent, "project-apply"), true);
      assert.equal(hasScope(consent, "mcp-slim"), false);
      let out = "";
      assert.equal(
        runConsent(["check", "--scope", "project-apply"], {
          stdout: (text) => {
            out += text;
          },
        }),
        0
      );
      assert.equal(JSON.parse(out).ok, true);
      out = "";
      assert.equal(
        runConsent(["check", "--scope", "mcp-slim"], {
          stdout: (text) => {
            out += text;
          },
        }),
        1
      );
      revokeConsent(file);
      assert.equal(existsSync(file), false);
      assert.equal(readConsent(file), null);
    } finally {
      if (prev === undefined) delete process.env.GROK_KIT_CONSENT_FILE;
      else process.env.GROK_KIT_CONSENT_FILE = prev;
    }
  });

  it("parses usage-learn and harness-improve without implying them by default", () => {
    const learned = parseScopeList("usage-learn,harness-improve");
    assert.equal(learned.usageLearn, true);
    assert.equal(learned.harnessImprove, true);
    assert.equal(learned.userLayer, false);
    const defaults = parseScopeList("user-layer,project-apply,mcp-slim");
    assert.equal(defaults.usageLearn, false);
    assert.equal(defaults.harnessImprove, false);
  });

  it("rejects unknown scopes", () => {
    assert.throws(() => parseScopeList("nope"), /unknown consent scope/);
  });
});
