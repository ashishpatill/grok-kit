import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assessGitHubMerge,
  classifyPr,
  isReviewGateCheck,
  isTransient,
  summarizeCi,
} from "./policy.mjs";

function facts(overrides = {}) {
  return {
    owner: "acme",
    repo: "app",
    number: 12,
    url: "https://github.com/acme/app/pull/12",
    state: "OPEN",
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "APPROVED",
    headRefOid: "head",
    headRefName: "feat",
    baseRefName: "main",
    mergedAt: null,
    ...overrides,
  };
}

function snapshot(overrides = {}) {
  return {
    facts: facts(overrides.facts),
    checks: overrides.checks ?? [
      { name: "test", kind: "passed", reportedState: "SUCCESS" },
    ],
    threads: overrides.threads ?? [],
    commitRollups: overrides.commitRollups ?? [
      { oid: "head", state: "SUCCESS" },
    ],
    checksRead: overrides.checksRead ?? "ok",
    threadsRead: overrides.threadsRead ?? "ok",
  };
}

describe("assessGitHubMerge", () => {
  it("covers the merge-state vs rollup truth table", () => {
    const cases = [
      ["BLOCKED", "FAILURE", "refused"],
      ["BLOCKED", "ERROR", "refused"],
      ["BLOCKED", "PENDING", "allowed"],
      ["BLOCKED", "SUCCESS", "allowed"],
      ["BLOCKED", null, "allowed"],
      ["UNSTABLE", "FAILURE", "allowed"],
      ["UNKNOWN", "ERROR", "allowed"],
      ["CLEAN", "SUCCESS", "allowed"],
      ["HAS_HOOKS", "SUCCESS", "allowed"],
    ];
    for (const [mergeStateStatus, headRollupState, expected] of cases) {
      assert.equal(
        assessGitHubMerge({ mergeStateStatus, headRollupState }).kind,
        expected,
        `${mergeStateStatus}+${headRollupState}`
      );
    }
  });
});

describe("review gates", () => {
  it("does not treat Code Review Gate as pending CI", () => {
    const ci = summarizeCi(
      snapshot({
        facts: { mergeStateStatus: "BLOCKED", reviewDecision: "REVIEW_REQUIRED" },
        checks: [
          { name: "Code Review Gate", kind: "pending", reportedState: "PENDING" },
          { name: "test", kind: "passed", reportedState: "SUCCESS" },
        ],
        commitRollups: [{ oid: "head", state: "SUCCESS" }],
      })
    );
    assert.equal(ci.kind, "ci-clean");
    assert.equal(ci.pending.length, 0);
    assert.equal(ci.gates.length, 1);
    assert.equal(isReviewGateCheck(ci.gates[0]), true);
  });
});

describe("classifyPr priority and actor split", () => {
  it("reports merged", () => {
    const v = classifyPr(snapshot({ facts: { state: "MERGED", mergedAt: "2026-01-01" } }));
    assert.equal(v.kind, "merged");
    assert.equal(v.exitCode, 0);
    assert.equal(v.actor, "none");
  });

  it("reports closed as a human problem", () => {
    const v = classifyPr(snapshot({ facts: { state: "CLOSED" } }));
    assert.equal(v.kind, "closed");
    assert.equal(v.actor, "human");
    assert.equal(v.exitCode, 6);
  });

  it("conflicts beat threads and CI", () => {
    const v = classifyPr(
      snapshot({
        facts: { mergeable: "CONFLICTING", mergeStateStatus: "DIRTY" },
        threads: [{ id: "t1", resolved: false, body: "nit" }],
        checks: [{ name: "test", kind: "failed", reportedState: "FAILURE" }],
      })
    );
    assert.equal(v.class, "conflicts");
    assert.equal(v.actor, "human");
    assert.equal(v.exitCode, 2);
  });

  it("unresolved threads beat failing CI", () => {
    const v = classifyPr(
      snapshot({
        threads: [{ id: "t1", resolved: false, body: "please fix" }],
        checks: [{ name: "test", kind: "failed", reportedState: "FAILURE" }],
      })
    );
    assert.equal(v.class, "threads");
    assert.equal(v.actor, "agent");
    assert.equal(v.exitCode, 3);
  });

  it("ignores resolved threads", () => {
    const v = classifyPr(
      snapshot({
        threads: [{ id: "t1", resolved: true, body: "old" }],
      })
    );
    assert.equal(v.kind, "ready");
  });

  it("turns a green visible list plus GitHub refusal into github-rejected", () => {
    const v = classifyPr(
      snapshot({
        facts: { mergeStateStatus: "BLOCKED", reviewDecision: null },
        checks: [{ name: "test", kind: "passed", reportedState: "SUCCESS" }],
        commitRollups: [{ oid: "head", state: "FAILURE" }],
      })
    );
    assert.equal(v.class, "github-rejected");
    assert.equal(v.kind, "blocker");
    assert.equal(v.actor, "agent");
    assert.equal(v.exitCode, 4);
    assert.match(v.next, /Trust merge state/);
  });

  it("failing checks are an agent blocker", () => {
    const v = classifyPr(
      snapshot({
        facts: { mergeStateStatus: "UNSTABLE" },
        checks: [{ name: "test", kind: "failed", reportedState: "FAILURE" }],
        commitRollups: [
          { oid: "old", state: "SUCCESS" },
          { oid: "head", state: "FAILURE" },
        ],
      })
    );
    assert.equal(v.class, "failing-checks");
    assert.equal(v.ci.hadPreviousPassingCi, true);
    assert.match(v.next, /one rebuild only/);
  });

  it("skipped checks do not fail the PR", () => {
    const v = classifyPr(
      snapshot({
        checks: [
          { name: "optional", kind: "skipped", reportedState: "SKIPPED" },
          { name: "test", kind: "passed", reportedState: "SUCCESS" },
        ],
      })
    );
    assert.equal(v.kind, "ready");
  });

  it("pending checks wait without a sleep-loop instruction unless watch", () => {
    const v = classifyPr(
      snapshot({
        facts: { mergeStateStatus: "UNSTABLE", reviewDecision: null },
        checks: [{ name: "test", kind: "pending", reportedState: "PENDING" }],
        commitRollups: [{ oid: "head", state: "PENDING" }],
      })
    );
    assert.equal(v.class, "pending-checks");
    assert.equal(v.exitCode, 8);
    assert.equal(isTransient(v), true);
    assert.match(v.next, /Do not start a sleep loop/);
  });

  it("BLOCKED + clean CI is human approval, not a CI failure", () => {
    const v = classifyPr(
      snapshot({
        facts: {
          mergeStateStatus: "BLOCKED",
          reviewDecision: "REVIEW_REQUIRED",
        },
        checks: [
          { name: "test", kind: "passed", reportedState: "SUCCESS" },
          { name: "Code Review Gate", kind: "code-review-gate", reportedState: "PENDING" },
        ],
        commitRollups: [{ oid: "head", state: "SUCCESS" }],
      })
    );
    assert.equal(v.class, "approval");
    assert.equal(v.actor, "human");
    assert.equal(v.exitCode, 0);
    assert.equal(v.kind, "waiting");
    assert.equal(isTransient(v), false);
  });

  it("does not declare ready when checks or threads could not be read", () => {
    const v = classifyPr(snapshot({ threadsRead: "failed" }));
    assert.equal(v.class, "status-incomplete");
    assert.equal(v.exitCode, 7);
    assert.equal(isTransient(v), true);
  });

  it("still reports draft when check reads failed", () => {
    const v = classifyPr(
      snapshot({
        facts: { isDraft: true },
        checksRead: "failed",
        threadsRead: "failed",
      })
    );
    assert.equal(v.class, "draft");
    assert.equal(v.actor, "human");
  });

  it("draft is a human gate unless allowDraft", () => {
    const blocked = classifyPr(snapshot({ facts: { isDraft: true } }));
    assert.equal(blocked.class, "draft");
    assert.equal(blocked.actor, "human");
    const allowed = classifyPr(snapshot({ facts: { isDraft: true } }), {
      allowDraft: true,
    });
    assert.equal(allowed.kind, "ready");
  });

  it("changes requested is an agent blocker", () => {
    const v = classifyPr(
      snapshot({ facts: { reviewDecision: "CHANGES_REQUESTED" } })
    );
    assert.equal(v.class, "changes-requested");
    assert.equal(v.actor, "agent");
    assert.equal(v.exitCode, 6);
  });

  it("BEHIND with clean CI is stale-base, not ready and not a CI retry", () => {
    const v = classifyPr(
      snapshot({
        facts: { mergeStateStatus: "BEHIND", reviewDecision: null },
      })
    );
    assert.equal(v.class, "stale-base");
    assert.equal(v.actor, "human");
    assert.equal(v.exitCode, 2);
    assert.match(v.next, /do not retry CI/);
  });

  it("UNKNOWN mergeability is not ready", () => {
    const v = classifyPr(
      snapshot({
        facts: { mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN" },
      })
    );
    assert.equal(v.class, "status-incomplete");
    assert.equal(v.exitCode, 7);
  });

  it("CLEAN + approved + passing checks is ready", () => {
    const v = classifyPr(snapshot());
    assert.equal(v.kind, "ready");
    assert.equal(v.class, "ready");
    assert.equal(v.exitCode, 0);
    assert.match(v.next, /Do not merge unless explicitly asked/);
  });

  it("HAS_HOOKS can still be ready", () => {
    const v = classifyPr(snapshot({ facts: { mergeStateStatus: "HAS_HOOKS" } }));
    assert.equal(v.kind, "ready");
  });
});
