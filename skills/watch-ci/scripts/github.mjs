import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isReviewGateCheck } from "./policy.mjs";

export class WatcherQueryError extends Error {
  constructor(failure) {
    super(failure.detail);
    this.name = "WatcherQueryError";
    this.failure = failure;
  }
}

export function parseRepoFromRemote(value) {
  let normalized = String(value ?? "").trim();
  if (normalized.startsWith("git@github.com:")) {
    normalized = `https://github.com/${normalized.slice(15)}`;
  }
  if (normalized.startsWith("ssh://git@github.com/")) {
    normalized = `https://github.com/${normalized.slice(21)}`;
  }
  try {
    const url = new URL(normalized);
    const parts = url.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "github.com" ||
      parts.length !== 2
    ) {
      return null;
    }
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}

export function parsePrUrl(value) {
  const url = new URL(String(value));
  const parts = url.pathname.split("/").filter(Boolean);
  if (
    url.hostname !== "github.com" ||
    parts.length !== 4 ||
    parts[2] !== "pull"
  ) {
    throw new WatcherQueryError({
      kind: "invalid-context-url",
      retryable: false,
      detail: `not a GitHub pull URL: ${value}`,
      rawValue: String(value),
    });
  }
  const number = Number(parts[3]);
  if (!Number.isInteger(number) || number <= 0) {
    throw new WatcherQueryError({
      kind: "invalid-context-url",
      retryable: false,
      detail: `invalid PR number in URL: ${value}`,
      rawValue: String(value),
    });
  }
  return { owner: parts[0], repo: parts[1], number };
}

export function classifyGhCheck(raw) {
  const name = String(raw?.name ?? raw?.context ?? "check");
  const details = {
    name,
    description: typeof raw.description === "string" ? raw.description : "",
    link:
      typeof raw.link === "string"
        ? raw.link
        : typeof raw.detailsUrl === "string"
          ? raw.detailsUrl
          : typeof raw.targetUrl === "string"
            ? raw.targetUrl
            : "",
    workflow:
      typeof raw.workflow === "string"
        ? raw.workflow
        : typeof raw.workflowName === "string"
          ? raw.workflowName
          : "",
  };
  const bucket = String(raw?.bucket ?? "").toLowerCase();
  const state = String(raw?.state ?? raw?.conclusion ?? "").toUpperCase();
  const status = String(raw?.status ?? "").toUpperCase();

  if (isReviewGateCheck(details) || name === "Code Review Gate") {
    return { ...details, kind: "code-review-gate", reportedState: state || "PENDING" };
  }
  if (
    bucket === "fail" ||
    ["FAILURE", "ERROR", "ACTION_REQUIRED", "TIMED_OUT", "CANCELLED"].includes(
      state
    )
  ) {
    return { ...details, kind: "failed", reportedState: state || "FAILURE" };
  }
  if (bucket === "pending" || status === "IN_PROGRESS" || status === "QUEUED") {
    return { ...details, kind: "pending", reportedState: state || "PENDING" };
  }
  if (bucket === "skipping" || state === "SKIPPED" || state === "NEUTRAL") {
    return { ...details, kind: "skipped", reportedState: state || "SKIPPED" };
  }
  if (bucket === "pass" || state === "SUCCESS" || state === "PASS") {
    return { ...details, kind: "passed", reportedState: state || "SUCCESS" };
  }
  if (status && status !== "COMPLETED") {
    return { ...details, kind: "pending", reportedState: status };
  }
  if (state === "PENDING" || state === "EXPECTED") {
    return { ...details, kind: "pending", reportedState: state };
  }
  return { ...details, kind: "failed", reportedState: state || "UNKNOWN" };
}

export function parseStatusCheckRollup(value) {
  if (!Array.isArray(value)) return [];
  const checks = [];
  for (const node of value) {
    if (!node || typeof node !== "object") continue;
    const typename = node.__typename;
    if (typename === "CheckRun" || node.name) {
      const status = String(node.status ?? "").toUpperCase();
      const conclusion = String(node.conclusion ?? "").toUpperCase();
      checks.push(
        classifyGhCheck({
          name: node.name,
          status,
          conclusion,
          state: status === "COMPLETED" ? conclusion : "PENDING",
          bucket:
            status !== "COMPLETED"
              ? "pending"
              : conclusion === "SUCCESS"
                ? "pass"
                : conclusion === "SKIPPED" || conclusion === "NEUTRAL"
                  ? "skipping"
                  : "fail",
          detailsUrl: node.detailsUrl,
          workflowName: node.workflowName,
        })
      );
      continue;
    }
    if (typename === "StatusContext" || node.context) {
      checks.push(
        classifyGhCheck({
          name: node.context,
          state: node.state,
          targetUrl: node.targetUrl,
        })
      );
    }
  }
  return checks;
}

export function parsePullRequestFacts(raw, owner, repo) {
  const number = Number(raw?.number);
  const commits = Array.isArray(raw?.commits) ? raw.commits : [];
  const head = commits.length > 0 ? commits[commits.length - 1] : null;
  const reviewDecision =
    raw?.reviewDecision === "" || raw?.reviewDecision == null
      ? null
      : String(raw.reviewDecision);
  let state = String(raw?.state ?? "OPEN").toUpperCase();
  if (raw?.mergedAt) state = "MERGED";
  return {
    owner,
    repo,
    number: Number.isInteger(number) ? number : null,
    url: typeof raw?.url === "string" ? raw.url : null,
    state,
    isDraft: Boolean(raw?.isDraft),
    mergeable: raw?.mergeable ?? "UNKNOWN",
    mergeStateStatus: String(raw?.mergeStateStatus ?? "UNKNOWN").toUpperCase(),
    reviewDecision,
    headRefOid: head?.oid ?? raw?.headRefOid ?? null,
    headRefName: raw?.headRefName ?? null,
    baseRefName: raw?.baseRefName ?? null,
    mergedAt: raw?.mergedAt ?? null,
  };
}

export function parseReviewThreads(graphqlJson) {
  const nodes =
    graphqlJson?.data?.repository?.pullRequest?.reviewThreads?.nodes;
  if (!Array.isArray(nodes)) {
    throw new WatcherQueryError({
      kind: "missing-key",
      retryable: true,
      detail: "missing reviewThreads.nodes",
    });
  }
  const threads = [];
  for (const node of nodes) {
    if (node?.isResolved === true) continue;
    const comment = node?.comments?.nodes?.[0] ?? null;
    threads.push({
      id: String(node?.id ?? ""),
      resolved: false,
      author: comment?.author?.login ?? null,
      body: comment?.body ?? "",
      path: comment?.path ?? null,
      line: comment?.line ?? null,
    });
  }
  return threads;
}

export async function loadFixture(filePath) {
  const raw = JSON.parse(await readFile(filePath, "utf8"));
  if (!raw.facts) {
    throw new Error(`fixture ${filePath} is missing facts`);
  }
  return {
    facts: raw.facts,
    checks: raw.checks ?? [],
    threads: raw.threads ?? [],
    commitRollups: raw.commitRollups ?? [],
    threadsRead: raw.threadsRead ?? "ok",
    checksRead: raw.checksRead ?? "ok",
  };
}

const THREADS_QUERY = `query ReviewThreads($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          comments(first: 1) {
            nodes {
              body
              path
              line
              author { login }
            }
          }
        }
      }
    }
  }
}`;

const PR_JSON_FIELDS = [
  "number",
  "url",
  "state",
  "isDraft",
  "mergeable",
  "mergeStateStatus",
  "reviewDecision",
  "headRefName",
  "baseRefName",
  "commits",
  "statusCheckRollup",
].join(",");

export function runCommand(argv, { timeoutMs = 45_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new WatcherQueryError({
          kind: "command-exit",
          retryable: true,
          detail: `${argv.join(" ")} timed out`,
          code: -1,
        })
      );
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

async function runJson(run, argv) {
  const result = await run(argv);
  if (result.code !== 0) {
    throw new WatcherQueryError({
      kind: "command-exit",
      retryable: true,
      detail:
        result.stderr.trim().split("\n")[0] ||
        `${argv.join(" ")} exited ${result.code}`,
      code: result.code,
    });
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new WatcherQueryError({
      kind: "json-parse",
      retryable: true,
      detail: `${argv.join(" ")}: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

export async function readSnapshotFromGh(opts) {
  const run = opts.run ?? runCommand;
  const owner = opts.owner;
  const repo = opts.repo;
  const pr = opts.pr;
  const repoSel = `${owner}/${repo}`;

  let view;
  try {
    view = await runJson(run, [
      "gh",
      "pr",
      "view",
      String(pr),
      "-R",
      repoSel,
      "--json",
      PR_JSON_FIELDS,
    ]);
  } catch (error) {
    if (error instanceof WatcherQueryError) throw error;
    throw new WatcherQueryError({
      kind: "command-exit",
      retryable: true,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const facts = parsePullRequestFacts(view, owner, repo);
  let checks = [];
  let checksRead = "ok";
  try {
    const rawChecks = await runJson(run, [
      "gh",
      "pr",
      "checks",
      String(pr),
      "-R",
      repoSel,
      "--json",
      "name,state,bucket,description,link,workflow",
    ]);
    const list = Array.isArray(rawChecks) ? rawChecks : [];
    checks = list.map((row) => classifyGhCheck(row));
  } catch (error) {
    const detail =
      error instanceof WatcherQueryError ? error.failure.detail : String(error);
    checks = parseStatusCheckRollup(view.statusCheckRollup);
    // Repos with no check runs make `gh pr checks` exit 1. That is empty, not unread.
    checksRead = /no checks reported/i.test(detail) || checks.length > 0 ? "ok" : "failed";
  }

  let threads = [];
  let threadsRead = "ok";
  try {
    const graphql = await runJson(run, [
      "gh",
      "api",
      "graphql",
      "-f",
      `query=${THREADS_QUERY}`,
      "-F",
      `owner=${owner}`,
      "-F",
      `repo=${repo}`,
      "-F",
      `pr=${pr}`,
    ]);
    threads = parseReviewThreads(graphql);
  } catch {
    threadsRead = "failed";
  }

  const commitRollups = (Array.isArray(view.commits) ? view.commits : []).map(
    (commit) => ({
      oid: commit.oid,
      state: commit.statusCheckRollup?.state ?? null,
    })
  );

  return {
    facts,
    checks,
    threads,
    commitRollups,
    checksRead,
    threadsRead,
  };
}

export async function resolveContext(opts) {
  const run = opts.run ?? runCommand;
  let owner = opts.owner ?? null;
  let repo = opts.repo ?? null;
  let pr = opts.pr ?? null;

  if (!owner || !repo) {
    try {
      const viewed = await runJson(run, ["gh", "repo", "view", "--json", "nameWithOwner"]);
      const nwo = String(viewed?.nameWithOwner ?? "");
      const [o, r] = nwo.split("/");
      if (o && r) {
        owner = owner ?? o;
        repo = repo ?? r;
      }
    } catch {
      const origin = await run(["git", "remote", "get-url", "origin"]);
      const parsed = parseRepoFromRemote(origin.stdout.trim());
      if (parsed) {
        owner = owner ?? parsed.owner;
        repo = repo ?? parsed.repo;
      }
    }
  }

  if (pr == null) {
    const viewed = await runJson(run, [
      "gh",
      "pr",
      "view",
      "--json",
      "number,url",
    ]);
    pr = Number(viewed.number);
    if ((!owner || !repo) && viewed.url) {
      const parsed = parsePrUrl(viewed.url);
      owner = owner ?? parsed.owner;
      repo = repo ?? parsed.repo;
    }
  }

  if (!owner || !repo || !pr) {
    throw new WatcherQueryError({
      kind: "missing-key",
      retryable: false,
      detail: "need --owner --repo --pr, or a current-branch pull request",
    });
  }

  return { owner, repo, pr: Number(pr) };
}
