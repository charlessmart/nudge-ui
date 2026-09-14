import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";

const PROJECT_DIGEST_LENGTH = 24;

/**
 * Names a project deterministically across restarts. The root is canonicalized
 * first, so a symlinked working directory resolves to the same project — and
 * therefore the same durable session — as its real path.
 */
export function createProjectId(host: string, root: string): string {
  let canonical = root;
  try {
    canonical = realpathSync(root);
  } catch {
    /* an unresolvable root keeps its textual form */
  }
  const digest = createHash("sha256").update(canonical).digest("hex").slice(0, PROJECT_DIGEST_LENGTH);
  return `${host}:${digest}`;
}
