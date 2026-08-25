import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeConsent } from "../../../scripts/consent.mjs";
import {
  appendEvent,
  applyProposals,
  propose,
  readEvents,
  recordCli,
  runLearn,
  summarize,
} from "./learn.mjs";

async function withEnv(dir, fn) {
  const prevConsent = process.env.GROK_KIT_CONSENT_FILE;
  const prevUsage = process.env.GROK_KIT_USAGE_FILE;
  const prevProp = process.env.GROK_KIT_PROPOSALS_FILE;
  process.env.GROK_KIT_CONSENT_FILE = path.join(dir, "consent.json");
  process.env.GROK_KIT_USAGE_FILE = path.join(dir, "usage.jsonl");
  process.env.GROK_KIT_PROPOSALS_FILE = path.join(dir, "proposals.json");
  try {
    return await fn();
  } finally {
    if (prevConsent === undefined) delete process.env.GROK_KIT_CONSENT_FILE;
    else process.env.GROK_KIT_CONSENT_FILE = prevConsent;
    if (prevUsage === undefined) delete process.env.GROK_KIT_USAGE_FILE;
    else process.env.GROK_KIT_USAGE_FILE = prevUsage;
    if (prevProp === undefined) delete process.env.GROK_KIT_PROPOSALS_FILE;
    else process.env.GROK_KIT_PROPOSALS_FILE = prevProp;
  }
}

function run(argv) {
  let out = "";
  const code = runLearn(argv, {
    stdout: (text) => {
      out += text;
    },
  });
  return { code, out, json: out.trim().startsWith("{") ? JSON.parse(out) : null };
}

describe("learn", () => {
  it("prints help", () => {
    const { code, out } = run(["--help"]);
    assert.equal(code, 0);
    assert.match(out, /--i-consent/);
  });

  it("does not record without usage-learn consent", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "learn-"));
    await withEnv(dir, async () => {
      const result = recordCli("verify-aci", ["--phase", "drive"]);
      assert.equal(result.reason, "consent-required");
      assert.equal(existsSync(process.env.GROK_KIT_USAGE_FILE), false);
    });
  });

  it("summarizes skills and workflows then applies only with consent", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "learn-"));
    await mkdir(path.join(dir, ".cursor/rules"), { recursive: true });
    await withEnv(dir, async () => {
      writeConsent({
        file: process.env.GROK_KIT_CONSENT_FILE,
        scopes: { usageLearn: true },
        source: "test",
      });
      const base = Date.parse("2026-08-25T10:00:00.000Z");
      const sessionA = ["route-task", "verify-aci", "watch-ci", "state-tools"];
      const sessionB = ["route-task", "verify-aci", "watch-ci", "state-tools"];
      let i = 0;
      for (const command of sessionA) {
        appendEvent({
          command,
          ts: new Date(base + i * 60_000).toISOString(),
          args: command === "route-task" ? ["ship"] : [],
        });
        i += 1;
      }
      for (const command of sessionB) {
        appendEvent({
          command,
          ts: new Date(base + 5 * 3_600_000 + i * 60_000).toISOString(),
          args: command === "route-task" ? ["ship"] : [],
        });
        i += 1;
      }
      const summary = summarize(readEvents());
      assert.ok(summary.topSkills[0].count >= 2);
      assert.ok(summary.topWorkflows.length >= 1);
      const proposals = propose(summary, { enabled: ["verify-aci"] });
      assert.ok(proposals.length >= 1);
      assert.ok(proposals.some((item) => item.kind === "enable-feature"));

      await writeFile(
        path.join(dir, ".cursor/grok-kit.json"),
        JSON.stringify({
          profile: "generic",
          enabled: ["verify-aci"],
          available: ["refine-harness"],
          mcpRecommended: [],
          prove: { verify: "true" },
        })
      );
      const blocked = applyProposals(dir, proposals, { iConsent: false });
      assert.equal(blocked.reason, "consent-required");
      const cliBlocked = run(["apply", "--root", dir]);
      assert.equal(cliBlocked.code, 0);
      assert.equal(cliBlocked.json.reason, "consent-required");
      const allowed = applyProposals(dir, proposals, { iConsent: true });
      assert.equal(allowed.ok, true);
      assert.ok(allowed.applied.length >= 1);
      const manifest = JSON.parse(
        await readFile(path.join(dir, ".cursor/grok-kit.json"), "utf8")
      );
      assert.ok(manifest.enabled.includes("orchestrate-rlm"));
      assert.ok(Array.isArray(manifest.learned?.workflows));
      const gitignore = await readFile(path.join(dir, ".gitignore"), "utf8");
      assert.match(gitignore, /grok-kit-proposals\.json/);
      const rulePath = path.join(dir, ".cursor/rules/grok-kit-project.mdc");
      const rule = await readFile(rulePath, "utf8");
      assert.doesNotMatch(rule, /Ship path:/);
      assert.match(rule, /KV-cache/);
      const beforeJson = await readFile(
        path.join(dir, ".cursor/grok-kit.json"),
        "utf8"
      );
      const beforeRule = rule;
      const again = applyProposals(dir, proposals, {
        iConsent: true,
        now: "2026-08-26T00:00:00.000Z",
      });
      assert.equal(again.reason, "no-op");
      assert.equal(
        await readFile(path.join(dir, ".cursor/grok-kit.json"), "utf8"),
        beforeJson
      );
      assert.equal(await readFile(rulePath, "utf8"), beforeRule);
    });
  });

  it("tick is a no-op without consent", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "learn-"));
    await withEnv(dir, async () => {
      const { code, json } = run(["tick", "--root", dir]);
      assert.equal(code, 0);
      assert.equal(json.reason, "consent-required");
    });
  });

  it("tick writes proposals when usage-learn is consented", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "learn-"));
    await mkdir(path.join(dir, ".cursor"), { recursive: true });
    await withEnv(dir, async () => {
      writeConsent({
        file: process.env.GROK_KIT_CONSENT_FILE,
        scopes: { usageLearn: true },
        source: "test",
      });
      await writeFile(
        path.join(dir, ".cursor/grok-kit.json"),
        JSON.stringify({
          profile: "generic",
          enabled: ["verify-aci"],
          available: ["usage-learn"],
          mcpRecommended: [],
          prove: { verify: "true" },
        })
      );
      appendEvent({ command: "orchestrate-rlm", ts: "2026-08-25T10:00:00.000Z" });
      appendEvent({ command: "orchestrate-rlm", ts: "2026-08-25T10:01:00.000Z" });
      const { code, json } = run(["tick", "--root", dir]);
      assert.equal(code, 0);
      assert.equal(json.ok, true);
      assert.equal(json.improveSkipped, true);
      assert.ok(json.proposed >= 1);
      assert.equal(existsSync(process.env.GROK_KIT_PROPOSALS_FILE), true);
    });
  });
});
