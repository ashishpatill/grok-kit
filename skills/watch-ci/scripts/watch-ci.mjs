#!/usr/bin/env node
import { classifyPr, isTransient, EXIT } from "./policy.mjs";
import {
  loadFixture,
  readSnapshotFromGh,
  resolveContext,
  WatcherQueryError,
} from "./github.mjs";
import { isMainModule } from "../../../scripts/lib/is-main.mjs";

const HELP = `watch-ci — GitHub merge-state truth for one pull request

Usage:
  watch-ci [--pr N] [--owner O] [--repo R] [--status-once | --watch]
           [--interval SEC] [--timeout SEC] [--allow-draft] [--pretty]
           [--fixture FILE.json]

Default is --status-once (one JSON verdict, then exit).
--watch polls only while checks are pending or mergeability is unknown.

Exit codes:
  0  ready | merged | waiting on human approval
  2  conflicts | stale-base
  3  unresolved review threads
  4  failing checks | GitHub refused a green-looking list
  5  timeout (--watch)
  6  draft | changes-requested | closed
  7  status query incomplete
  8  pending checks
  64 usage
`;

function parseArgs(argv) {
  const out = {
    pr: null,
    owner: null,
    repo: null,
    watch: false,
    statusOnce: true,
    interval: 60,
    timeout: 0,
    allowDraft: false,
    pretty: false,
    fixture: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) throw usage(`missing value for ${arg}`);
      return argv[i];
    };
    switch (arg) {
      case "-h":
      case "--help":
        out.help = true;
        break;
      case "--pr":
        out.pr = Number(next().replace(/^#/, ""));
        break;
      case "--owner":
        out.owner = next();
        break;
      case "--repo":
        out.repo = next();
        break;
      case "--watch":
        out.watch = true;
        out.statusOnce = false;
        break;
      case "--status-once":
        out.statusOnce = true;
        out.watch = false;
        break;
      case "--interval":
        out.interval = Number(next());
        break;
      case "--timeout":
        out.timeout = Number(next());
        break;
      case "--allow-draft":
        out.allowDraft = true;
        break;
      case "--pretty":
        out.pretty = true;
        break;
      case "--fixture":
        out.fixture = next();
        break;
      case "--json":
        out.pretty = false;
        break;
      default:
        throw usage(`unknown argument: ${arg}`);
    }
  }
  if (out.pr != null && (!Number.isInteger(out.pr) || out.pr <= 0)) {
    throw usage("--pr must be a positive integer");
  }
  if (!Number.isFinite(out.interval) || out.interval <= 0) {
    throw usage("--interval must be > 0");
  }
  if (!Number.isFinite(out.timeout) || out.timeout < 0) {
    throw usage("--timeout must be >= 0");
  }
  return out;
}

function usage(message) {
  const error = new Error(message);
  error.code = "USAGE";
  return error;
}

function renderPretty(verdict) {
  const lines = [
    `${verdict.kind}\t${verdict.class}\t${verdict.actor}\texit ${verdict.exitCode}`,
    verdict.next,
  ];
  if (verdict.pr?.number) {
    lines.push(
      `PR #${verdict.pr.number} ${verdict.pr.owner ?? ""}/${verdict.pr.repo ?? ""} ${verdict.pr.mergeStateStatus ?? ""}`
    );
  }
  if (verdict.ci) {
    lines.push(
      `CI ${verdict.ci.kind} fail=${verdict.ci.failed.length} pending=${verdict.ci.pending.length} skip=${verdict.ci.skipped.length}`
    );
  }
  if (verdict.threads?.length) {
    lines.push(`threads ${verdict.threads.length}`);
  }
  return `${lines.join("\n")}\n`;
}

function render(verdict, pretty) {
  return pretty ? renderPretty(verdict) : `${JSON.stringify(verdict)}\n`;
}

function sleep(seconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, seconds * 1000);
  });
}

export async function runWatchCi(argv, io = {}) {
  const stdout = io.stdout ?? ((text) => process.stdout.write(text));
  const stderr = io.stderr ?? ((text) => process.stderr.write(text));
  const now = io.now ?? (() => Date.now());
  const wait = io.sleep ?? sleep;
  const load = io.loadFixture ?? loadFixture;
  const readGh = io.readSnapshotFromGh ?? readSnapshotFromGh;
  const resolve = io.resolveContext ?? resolveContext;

  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (error && error.code === "USAGE") {
      stderr(`${error.message}\n${HELP}`);
      return EXIT.usage;
    }
    throw error;
  }

  if (options.help) {
    stdout(HELP);
    return 0;
  }

  const classifyOptions = { allowDraft: options.allowDraft };

  const readOnce = async () => {
    if (options.fixture) return load(options.fixture);
    const ctx = await resolve({
      owner: options.owner,
      repo: options.repo,
      pr: options.pr,
    });
    return readGh(ctx);
  };

  try {
    if (!options.watch) {
      const snapshot = await readOnce();
      const verdict = classifyPr(snapshot, classifyOptions);
      stdout(render(verdict, options.pretty));
      return verdict.exitCode;
    }

    const started = now();
    while (true) {
      const snapshot = await readOnce();
      const verdict = classifyPr(snapshot, classifyOptions);
      stdout(render(verdict, options.pretty));
      if (!isTransient(verdict)) return verdict.exitCode;
      if (
        options.timeout > 0 &&
        now() - started >= options.timeout * 1000
      ) {
        const timeoutVerdict = {
          ...verdict,
          kind: "timeout",
          class: "timeout",
          actor: "none",
          exitCode: EXIT.timeout,
          next: "Timed out while checks were still pending or mergeability was unknown.",
        };
        stdout(render(timeoutVerdict, options.pretty));
        return EXIT.timeout;
      }
      await wait(options.interval);
    }
  } catch (error) {
    if (error instanceof WatcherQueryError) {
      const verdict = {
        schemaVersion: 1,
        kind: "waiting",
        actor: "none",
        class: "status-incomplete",
        exitCode: EXIT.statusQuery,
        next: error.failure.detail,
        failure: error.failure,
        pr: {
          owner: options.owner,
          repo: options.repo,
          number: options.pr,
        },
        ci: null,
        threads: [],
      };
      stdout(render(verdict, options.pretty));
      return EXIT.statusQuery;
    }
    throw error;
  }
}

export { parseArgs, HELP };

if (isMainModule(import.meta.url)) {
  runWatchCi(process.argv.slice(2))
    .then((code) => {
      process.exit(code);
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
      process.exit(1);
    });
}
