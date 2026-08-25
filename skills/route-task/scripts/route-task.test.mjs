import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runRouteTask, sequenceFor } from "./route-task.mjs";

describe("route-task", () => {
  it("prints help", () => {
    let out = "";
    const code = runRouteTask(["--help"], {
      stdout: (t) => {
        out += t;
      },
    });
    assert.equal(code, 0);
    assert.match(out, /feature/);
  });

  it("lists intents and is not sticky", () => {
    let out = "";
    runRouteTask(["list"], {
      stdout: (t) => {
        out += t;
      },
    });
    const json = JSON.parse(out);
    assert.deepEqual(json.intents, ["bug", "feature", "investigate", "ship", "status"]);
    const feature = sequenceFor("feature");
    assert.equal(feature.sticky, false);
    assert.match(feature.steps.join("\n"), /verify-aci/);
  });

  it("rejects unknown intents", () => {
    let out = "";
    const code = runRouteTask(["sticky-mode"], {
      stdout: (t) => {
        out += t;
      },
    });
    assert.equal(code, 64);
    assert.match(out, /unknown intent/);
  });
});
