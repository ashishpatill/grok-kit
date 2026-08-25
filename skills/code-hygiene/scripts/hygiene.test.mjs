import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  THRESHOLDS,
  buildHygiene,
  parseArgs,
  rankFindings,
  renderMermaid,
  runHygiene,
  shortLine,
} from "./hygiene.mjs";

function run(argv) {
  let out = "";
  const code = runHygiene(argv, {
    stdout: (text) => {
      out += text;
    },
  });
  return { code, out, json: out.trim().startsWith("{") ? JSON.parse(out) : null };
}

async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "hygiene-"));
  await mkdir(path.join(dir, "src"), { recursive: true });
  await mkdir(path.join(dir, "a"), { recursive: true });
  await mkdir(path.join(dir, "b"), { recursive: true });
  await mkdir(path.join(dir, "c"), { recursive: true });
  await mkdir(path.join(dir, "skills/orphan-skill/scripts"), { recursive: true });
  await writeFile(
    path.join(dir, "src/used.mjs"),
    `#!/usr/bin/env node
import { helper } from "./helper.mjs";
helper();
`
  );
  await writeFile(
    path.join(dir, "src/helper.mjs"),
    `export function helper() { return 1; }\n`
  );
  await writeFile(
    path.join(dir, "src/dead.mjs"),
    `export function dead() { return "unused"; }\n`
  );
  await writeFile(path.join(dir, "src/empty.mjs"), "\n");
  await writeFile(
    path.join(dir, "src/debug.mjs"),
    `#!/usr/bin/env node
debugger;
console.log(1);
console.log(2);
console.log(3);
console.log(4);
console.log(5);
console.log(6);
`
  );
  await writeFile(
    path.join(dir, "src/smells.mjs"),
    `#!/usr/bin/env node
const clone = JSON.parse(JSON.stringify({ a: 1 }));
eval("clone");
`
  );
  const todos = Array.from({ length: 10 }, (_, i) => `// TODO leftover ${i}`).join("\n");
  await writeFile(path.join(dir, "src/todos.mjs"), `${todos}\nexport const x = 1;\n`);
  const commented = Array.from(
    { length: 30 },
    (_, i) => `// const leftover${i} = ${i};`
  ).join("\n");
  await writeFile(
    path.join(dir, "src/commented.mjs"),
    `#!/usr/bin/env node\n${commented}\nexport const live = 1;\n`
  );
  const big = Array.from(
    { length: THRESHOLDS.oversizedCode + 20 },
    (_, i) => `export const n${i} = ${i};`
  ).join("\n");
  await writeFile(path.join(dir, "src/big.mjs"), `${big}\n`);
  await writeFile(path.join(dir, "a/same.ts"), "export const a = 1;\n");
  await writeFile(path.join(dir, "b/same.ts"), "export const b = 1;\n");
  await writeFile(path.join(dir, "c/same.ts"), "export const c = 1;\n");
  await writeFile(
    path.join(dir, "skills/orphan-skill/SKILL.md"),
    "---\nname: orphan-skill\ndescription: leftover compiler without tests\n---\n\n# X\n"
  );
  await writeFile(
    path.join(dir, "skills/orphan-skill/scripts/run.mjs"),
    `#!/usr/bin/env node\nconsole.log("run");\n`
  );
  return dir;
}

describe("code-hygiene", () => {
  it("prints help", () => {
    const { code, out } = run(["--help"]);
    assert.equal(code, 0);
    assert.match(out, /human decides/);
    assert.match(out, /--write/);
  });

  it("rejects unknown args", () => {
    const { code, json } = run(["--nope"]);
    assert.equal(code, 64);
    assert.equal(json.ok, false);
  });

  it("ranks drift on a fixture and never auto-deletes", async () => {
    const dir = await fixture();
    const payload = buildHygiene(dir, { limit: 50, batch: 3 });
    assert.equal(payload.ok, true);
    assert.equal(payload.present.length, 3);
    assert.deepEqual(payload.readLoop.options, ["scrap", "fix", "keep"]);
    assert.match(payload.readLoop.rule, /Do not auto-delete/);
    assert.doesNotMatch(payload.mermaid, /\d{4}-\d{2}-\d{2}T/);

    const kinds = new Set(payload.findings.map((item) => item.kind));
    assert.ok(kinds.has("likely-orphan"), "orphan");
    assert.ok(kinds.has("empty-stub"), "empty");
    assert.ok(kinds.has("todo-pile"), "todos");
    assert.ok(kinds.has("debug-leftover"), "debug");
    assert.ok(kinds.has("eval-use"), "eval");
    assert.ok(kinds.has("json-clone"), "clone");
    assert.ok(kinds.has("commented-out"), "comments");
    assert.ok(kinds.has("oversized"), "oversized");
    assert.ok(kinds.has("duplicate-name"), "dupes");
    assert.ok(kinds.has("skill-no-prove"), "skill test");

    const orphan = payload.findings.find((item) => item.path === "src/dead.mjs");
    assert.equal(orphan?.kind, "likely-orphan");
    assert.equal(orphan?.suggestedAction, "scrap");
    const helper = payload.findings.find((item) => item.path === "src/helper.mjs");
    assert.equal(helper, undefined);
    const used = payload.findings.find((item) => item.path === "src/used.mjs");
    assert.equal(used, undefined);

    assert.equal(existsSync(path.join(dir, "src/dead.mjs")), true);
    const ranked = rankFindings(payload.findings);
    assert.equal(ranked[0].severity, "high");
    const again = buildHygiene(dir, { limit: 50, batch: 3 });
    assert.equal(JSON.stringify(payload.findings), JSON.stringify(again.findings));
  });

  it("filters kinds, explains a path, and writes a gitignored dump", async () => {
    const dir = await fixture();
    const { code, json } = run([
      "--root",
      dir,
      "--kinds",
      "likely-orphan",
      "--explain",
      "src/dead.mjs",
    ]);
    assert.equal(code, 0);
    assert.equal(json.findings.length, 1);
    assert.equal(json.findings[0].path, "src/dead.mjs");

    const written = run(["--root", dir, "--write", "--limit", "5"]);
    assert.equal(written.code, 0);
    assert.match(written.json.written, /hygiene\.json/);
    const dump = JSON.parse(await readFile(path.join(dir, ".cursor/hygiene.json"), "utf8"));
    assert.equal(dump.ok, true);
    const gitignore = await readFile(path.join(dir, ".gitignore"), "utf8");
    assert.match(gitignore, /hygiene\.json/);
    assert.equal(existsSync(path.join(dir, "src/dead.mjs")), true);
  });

  it("short line stays free of timestamps", async () => {
    const dir = await fixture();
    const { code, json } = run(["--root", dir, "--short"]);
    assert.equal(code, 0);
    assert.match(json.line, /hygiene findings=/);
    assert.match(json.line, /\/code-hygiene/);
    assert.doesNotMatch(json.line, /\d{4}-\d{2}-\d{2}T/);
    assert.equal(shortLine(json.summary), json.line);
  });

  it("renderMermaid lists kinds without dates", () => {
    const text = renderMermaid({
      findingCount: 4,
      high: 2,
      med: 2,
      byKind: { "likely-orphan": 2, oversized: 2 },
    });
    assert.match(text, /flowchart/);
    assert.match(text, /likely-orphan 2/);
    assert.doesNotMatch(text, /\d{4}-\d{2}-\d{2}T/);
  });

  it("parseArgs reads limit and batch", () => {
    const opts = parseArgs(["--root", "/tmp", "--limit", "4", "--batch", "2"]);
    assert.equal(opts.limit, 4);
    assert.equal(opts.batch, 2);
    assert.equal(opts.root, path.resolve("/tmp"));
  });
});
