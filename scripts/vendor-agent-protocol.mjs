/**
 * Include the private agent protocol in a public package's release output.
 *
 * The browser inspector and MCP companion compile from one workspace source,
 * but consumers must not need an unpublished workspace dependency. Copy the
 * compiled module into each package and redirect emitted imports to that copy.
 */
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const packageRoot = resolve(process.argv[2] ?? process.cwd());
const outputRoot = resolve(packageRoot, "dist");
const protocolOutput = resolve(repositoryRoot, "packages/agent-protocol/dist");
const vendoredModule = resolve(outputRoot, "internal/agent-protocol");

for (const extension of ["js", "d.ts"]) {
  const source = resolve(protocolOutput, `index.${extension}`);
  if (!statSync(source, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Build @nudge-ui/agent-protocol before ${packageRoot}.`);
  }
  mkdirSync(dirname(vendoredModule), { recursive: true });
  copyFileSync(source, `${vendoredModule}.${extension}`);
}

rewriteProtocolImports(outputRoot);

function rewriteProtocolImports(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      rewriteProtocolImports(absolutePath);
      continue;
    }
    if (!entry.isFile() || !/\.(?:[cm]?js|d\.ts)$/.test(entry.name)) continue;

    const moduleSpecifier = relative(dirname(absolutePath), `${vendoredModule}.js`)
      .split(sep)
      .join("/");
    const relativeSpecifier = moduleSpecifier.startsWith(".")
      ? moduleSpecifier
      : `./${moduleSpecifier}`;
    const code = readFileSync(absolutePath, "utf8");
    const rewritten = code
      .replaceAll('"@nudge-ui/agent-protocol"', `"${relativeSpecifier}"`)
      .replaceAll("'@nudge-ui/agent-protocol'", `'${relativeSpecifier}'`);
    if (rewritten !== code) writeFileSync(absolutePath, rewritten);
  }
}
