import { rmSync } from "node:fs";
import { basename } from "node:path";

/** Removes only the disposable project copy created by the Playwright config. */
export default function cleanupFixture() {
  const root = process.env.DESIGN_TOOL_STANDALONE_E2E_ROOT;
  if (root && basename(root).startsWith("design-tool-standalone-e2e-")) {
    rmSync(root, { recursive: true, force: true });
  }
}
