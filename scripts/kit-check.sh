#!/usr/bin/env bash
# Unit tests + frontmatter + offline user-journey for grok-kit ACI tools.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== unit tests =="
bash "$ROOT/scripts/run-unit-tests.sh"

echo "== skill frontmatter =="
node <<'NODE'
const fs = require("fs");
const path = require("path");
const root = process.cwd();
const skills = fs.readdirSync(path.join(root, "skills"));
for (const name of skills) {
  const file = path.join(root, "skills", name, "SKILL.md");
  if (!fs.existsSync(file)) {
    console.error(`missing ${file}`);
    process.exit(1);
  }
  const text = fs.readFileSync(file, "utf8");
  if (!text.startsWith("---\n")) {
    console.error(`${file}: missing YAML frontmatter`);
    process.exit(1);
  }
  if (!/^name:\s+\S+/m.test(text) || !/^description:/m.test(text)) {
    console.error(`${file}: need name and description`);
    process.exit(1);
  }
}
const agents = fs.readdirSync(path.join(root, "agents")).filter((f) => f.endsWith(".md"));
for (const name of agents) {
  const file = path.join(root, "agents", name);
  const text = fs.readFileSync(file, "utf8");
  if (!/^name:/m.test(text) || !/^description:/m.test(text)) {
    console.error(`${file}: need name and description`);
    process.exit(1);
  }
}
console.log(`ok ${skills.length} skills, ${agents.length} agents`);
NODE

echo "== e2e user journey =="
bash "$ROOT/scripts/e2e-kit-aci.sh"

echo "kit-check ok"
