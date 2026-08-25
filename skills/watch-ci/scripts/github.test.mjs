import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { classifyGhCheck, parsePrUrl, parsePullRequestFacts, parseRepoFromRemote, parseReviewThreads, parseStatusCheckRollup } from "./github.mjs";

describe("parseRepoFromRemote", () => {
  it("parses https and ssh remotes", () => {
    assert.deepEqual(
      parseRepoFromRemote("https://github.com/acme/app.git"),
      { owner: "acme", repo: "app" }
    );
    assert.deepEqual(parseRepoFromRemote("git@github.com:acme/app.git"), {
      owner: "acme",
      repo: "app",
    });
  });

  it("rejects non-github remotes", () => {
    assert.equal(parseRepoFromRemote("https://gitlab.com/acme/app.git"), null);
  });
});

describe("parsePrUrl", () => {
  it("parses a canonical pull URL", () => {
    assert.deepEqual(parsePrUrl("https://github.com/acme/app/pull/12"), {
      owner: "acme",
      repo: "app",
      number: 12,
    });
  });
});

describe("classifyGhCheck", () => {
  it("maps gh pr checks buckets", () => {
    assert.equal(classifyGhCheck({ name: "a", bucket: "pass", state: "SUCCESS" }).kind, "passed");
    assert.equal(classifyGhCheck({ name: "a", bucket: "fail", state: "FAILURE" }).kind, "failed");
    assert.equal(classifyGhCheck({ name: "a", bucket: "pending", state: "PENDING" }).kind, "pending");
    assert.equal(classifyGhCheck({ name: "a", bucket: "skipping", state: "SKIPPED" }).kind, "skipped");
  });

  it("classifies Code Review Gate as a gate, not pending CI", () => {
    const check = classifyGhCheck({
      name: "Code Review Gate",
      bucket: "pending",
      state: "PENDING",
    });
    assert.equal(check.kind, "code-review-gate");
  });
});

describe("parseStatusCheckRollup", () => {
  it("maps CheckRun conclusions", () => {
    const checks = parseStatusCheckRollup([
      { __typename: "CheckRun", name: "ok", status: "COMPLETED", conclusion: "SUCCESS" },
      { __typename: "CheckRun", name: "skip", status: "COMPLETED", conclusion: "SKIPPED" },
      { __typename: "CheckRun", name: "run", status: "IN_PROGRESS", conclusion: "" },
    ]);
    assert.equal(checks[0].kind, "passed");
    assert.equal(checks[1].kind, "skipped");
    assert.equal(checks[2].kind, "pending");
  });
});

describe("parsePullRequestFacts", () => {
  it("normalizes empty reviewDecision and merged state", () => {
    const facts = parsePullRequestFacts(
      {
        number: 3,
        state: "OPEN",
        reviewDecision: "",
        mergedAt: "2026-01-01T00:00:00Z",
        commits: [{ oid: "abc" }],
        mergeStateStatus: "clean",
      },
      "acme",
      "app"
    );
    assert.equal(facts.state, "MERGED");
    assert.equal(facts.reviewDecision, null);
    assert.equal(facts.headRefOid, "abc");
    assert.equal(facts.mergeStateStatus, "CLEAN");
  });
});

describe("parseReviewThreads", () => {
  it("drops resolved threads and keeps the first comment", () => {
    const threads = parseReviewThreads({
      data: {
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: [
                {
                  id: "keep",
                  isResolved: false,
                  comments: {
                    nodes: [{ body: "fix this", path: "a.ts", line: 4, author: { login: "r" } }],
                  },
                },
                { id: "drop", isResolved: true, comments: { nodes: [] } },
              ],
            },
          },
        },
      },
    });
    assert.equal(threads.length, 1);
    assert.equal(threads[0].id, "keep");
    assert.equal(threads[0].author, "r");
  });
});

describe("loadFixture", () => {
  it("reads a snapshot file", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "watch-ci-"));
    const file = path.join(dir, "snap.json");
    await writeFile(
      file,
      JSON.stringify({
        facts: { number: 1, state: "OPEN", mergeStateStatus: "CLEAN" },
        checks: [],
      })
    );
    const { loadFixture } = await import("./github.mjs");
    const snap = await loadFixture(file);
    assert.equal(snap.facts.number, 1);
    assert.equal(snap.checksRead, "ok");
  });
});
