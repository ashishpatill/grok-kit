import path from "node:path";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function resolvePath(filePath) {
  try {
    return realpathSync(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

/** True when this module was the process entry, including via skill symlinks. */
export function isMainModule(metaUrl, argv1 = process.argv[1]) {
  if (!argv1) return false;
  return resolvePath(fileURLToPath(metaUrl)) === resolvePath(argv1);
}
