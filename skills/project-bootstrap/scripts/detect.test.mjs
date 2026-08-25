import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALWAYS_ON, chooseAdaptation, detectProject } from "./detect.mjs";

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function tmp() {
  return mkdtemp(path.join(tmpdir(), "detect-"));
}

describe("detect", () => {
  it("classifies the grok-kit checkout as agentic-framework", () => {
    const detection = detectProject(KIT);
    assert.equal(detection.profile, "agentic-framework");
    assert.equal(detection.isKit, true);
    const adaptation = chooseAdaptation(detection);
    assert.ok(ALWAYS_ON.every((name) => adaptation.enabled.includes(name)));
    assert.ok(adaptation.enabled.includes("orchestrate-rlm"));
    assert.ok(adaptation.enabled.includes("skill-curator"));
    assert.equal(adaptation.enabled.includes("tell-proof"), false);
    assert.ok(adaptation.available.includes("refine-harness"));
    assert.ok(adaptation.available.includes("usage-learn"));
  });

  it("classifies a Tell-shaped tree as tell-proof", async () => {
    const dir = await tmp();
    await mkdir(path.join(dir, "packages/mcp"), { recursive: true });
    await writeFile(
      path.join(dir, "AGENTS.md"),
      "# Tell\n\ntell_proof_verify is required\n"
    );
    await writeFile(
      path.join(dir, "packages/mcp/package.json"),
      JSON.stringify({ name: "@tell/mcp" })
    );
    const detection = detectProject(dir);
    assert.equal(detection.profile, "tell-proof");
    assert.equal(detection.isTell, true);
    const adaptation = chooseAdaptation(detection);
    assert.ok(adaptation.enabled.includes("tell-proof"));
    assert.ok(adaptation.enabled.includes("orchestrate-rlm"));
    assert.deepEqual(adaptation.mcpRecommended, ["tell"]);
    assert.equal(adaptation.prove.ui, "tell_proof_verify");
  });

  it("picks nextjs-clerk-neon when Next and Clerk are present", async () => {
    const dir = await tmp();
    await writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({
        name: "app",
        dependencies: { next: "15.0.0", react: "19.0.0", "@clerk/nextjs": "6.0.0" },
      })
    );
    const detection = detectProject(dir);
    assert.equal(detection.profile, "nextjs-clerk-neon");
    const adaptation = chooseAdaptation(detection);
    assert.ok(adaptation.enabled.includes("tell-proof"));
    assert.deepEqual(adaptation.mcpRecommended, ["tell"]);
  });

  it("picks research-python for a pyproject without a JS UI", async () => {
    const dir = await tmp();
    await writeFile(path.join(dir, "pyproject.toml"), "[project]\nname='x'\n");
    const detection = detectProject(dir);
    assert.equal(detection.profile, "research-python");
    const adaptation = chooseAdaptation(detection);
    assert.ok(adaptation.enabled.includes("orchestrate-rlm"));
    assert.equal(adaptation.enabled.includes("tell-proof"), false);
  });

  it("keeps generic Next apps on generic + tell-proof feature", async () => {
    const dir = await tmp();
    await writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({
        name: "ui",
        dependencies: { next: "15.0.0", react: "19.0.0" },
      })
    );
    const detection = detectProject(dir);
    assert.equal(detection.profile, "generic");
    const adaptation = chooseAdaptation(detection);
    assert.ok(adaptation.enabled.includes("tell-proof"));
    assert.equal(adaptation.prove.ui, "tell_proof_verify");
  });

  it("honors a profile override without dropping tell-proof signals", async () => {
    const dir = await tmp();
    await mkdir(path.join(dir, "packages/mcp"), { recursive: true });
    await writeFile(
      path.join(dir, "packages/mcp/package.json"),
      JSON.stringify({ name: "@tell/mcp" })
    );
    const detection = detectProject(dir);
    const adaptation = chooseAdaptation(detection, "generic");
    assert.equal(adaptation.profile, "generic");
    assert.ok(adaptation.enabled.includes("tell-proof"));
  });
});
