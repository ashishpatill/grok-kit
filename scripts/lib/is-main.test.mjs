import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isMainModule, resolvePath } from "./is-main.mjs";

describe("isMainModule", () => {
  it("matches a realpath'd invocation including via symlink", async () => {
    const self = fileURLToPath(new URL("./is-main.mjs", import.meta.url));
    const dir = await mkdtemp(path.join(tmpdir(), "is-main-"));
    const link = path.join(dir, "is-main.mjs");
    await symlink(self, link);
    assert.equal(isMainModule(pathToFileURL(self).href, link), true);
    assert.equal(isMainModule(pathToFileURL(self).href, self), true);
    assert.equal(isMainModule(pathToFileURL(self).href, "/tmp/not-this.mjs"), false);
    assert.equal(resolvePath(link), resolvePath(self));
  });
});
