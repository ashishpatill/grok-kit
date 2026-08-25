#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule, resolvePath } from "../../../scripts/lib/is-main.mjs";

const KIT = path.resolve(
  path.dirname(resolvePath(fileURLToPath(import.meta.url))),
  "../../.."
);

const HELP = `skill-curator — mechanical inventory (no auto-merge)

Usage:
  grok-kit skill-curator inventory [--kit DIR] [--also DIR]
`;

function parseArgs(argv) {
  const out = {
    cmd: argv[0] ?? "",
    kit: KIT,
    also: [],
    help: false,
  };
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`missing value for ${arg}`);
      return argv[i];
    };
    switch (arg) {
      case "-h":
      case "--help":
        out.help = true;
        break;
      case "--kit":
        out.kit = path.resolve(next());
        break;
      case "--also":
        out.also.push(path.resolve(next()));
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  return out;
}

export function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) return { name: "", description: "" };
  const end = text.indexOf("\n---", 4);
  const block = end === -1 ? text.slice(4) : text.slice(4, end);
  const name = block.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? "";
  const lines = block.split("\n");
  let description = "";
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^description:\s*(.*)$/);
    if (!match) continue;
    const rest = match[1].trim();
    if (rest === ">-" || rest === ">" || rest === "|" || rest === "") {
      const parts = [];
      for (let j = i + 1; j < lines.length; j += 1) {
        if (/^[a-zA-Z0-9_-]+:/.test(lines[j])) break;
        parts.push(lines[j].trim());
      }
      description = parts.join(" ").trim();
    } else {
      description = rest;
    }
    break;
  }
  return { name, description };
}

function tokens(text) {
  return new Set(
    String(text)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 3)
  );
}

function jaccard(a, b) {
  let inter = 0;
  for (const word of a) {
    if (b.has(word)) inter += 1;
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function listSkillDirs(root) {
  const skillsRoot = path.join(root, "skills");
  if (!existsSync(skillsRoot)) return [];
  return readdirSync(skillsRoot)
    .map((name) => path.join(skillsRoot, name))
    .filter((dir) => {
      try {
        return statSync(dir).isDirectory() && existsSync(path.join(dir, "SKILL.md"));
      } catch {
        return false;
      }
    });
}

export function inventoryFromDirs(dirs) {
  const skills = [];
  for (const dir of dirs) {
    const file = path.join(dir, "SKILL.md");
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    const meta = parseFrontmatter(text);
    skills.push({
      name: meta.name || path.basename(dir),
      description: meta.description,
      path: file,
      bytes: Buffer.byteLength(text),
    });
  }
  const overlap = [];
  for (let i = 0; i < skills.length; i += 1) {
    for (let j = i + 1; j < skills.length; j += 1) {
      const score = jaccard(
        tokens(`${skills[i].name} ${skills[i].description}`),
        tokens(`${skills[j].name} ${skills[j].description}`)
      );
      if (score >= 0.45) {
        overlap.push({
          a: skills[i].name,
          b: skills[j].name,
          score: Number(score.toFixed(2)),
        });
      }
    }
  }
  overlap.sort((x, y) => y.score - x.score);
  return {
    schemaVersion: 1,
    ok: true,
    skillCount: skills.length,
    skills,
    overlap,
    next: "Propose merges or archives. Do not delete without approval.",
  };
}

export function runSkillCurator(argv, io = {}) {
  const stdout = io.stdout ?? ((text) => process.stdout.write(text));
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    stdout(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    return 64;
  }
  if (options.help || options.cmd === "-h" || options.cmd === "--help") {
    stdout(HELP);
    return 0;
  }
  if (!options.cmd || options.cmd === "inventory") {
    if (!options.cmd) {
      stdout(HELP);
      return 64;
    }
    const dirs = [
      ...listSkillDirs(options.kit),
      ...options.also.flatMap((root) =>
        existsSync(path.join(root, "SKILL.md"))
          ? [root]
          : listSkillDirs(root)
      ),
    ];
    stdout(`${JSON.stringify(inventoryFromDirs(dirs))}\n`);
    return 0;
  }
  stdout(
    `${JSON.stringify({ ok: false, error: `unknown command ${options.cmd}` })}\n`
  );
  return 64;
}

export { HELP };

if (isMainModule(import.meta.url)) {
  process.exit(runSkillCurator(process.argv.slice(2)));
}
