import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const sandboxRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const nudgeUiRoot = resolve(sandboxRoot, "../..");
const defaultCheckout = resolve(homedir(), "_work/newvato");
const newvatoCheckout = resolve(
  process.env["NEWVATO_CHECKOUT"] ?? defaultCheckout,
);
const webRoot = resolve(newvatoCheckout, "apps/web");
const pluginLink = resolve(webRoot, "node_modules/@nudge-ui/vite-react");
const expectedPlugin = resolve(nudgeUiRoot, "packages/plugin");
const required = process.env["NEWVATO_CONSUMER_REQUIRED"] === "true";

function skip(message) {
  console.warn(`Newvato consumer suite skipped: ${message}`);
  console.warn("Set NEWVATO_CONSUMER_REQUIRED=true to treat this setup problem as a failure.");
  process.exit(required ? 1 : 0);
}

function linkedToWorkspace(linkPath, expectedPath) {
  if (!existsSync(linkPath) || !lstatSync(linkPath).isSymbolicLink()) {
    return false;
  }
  return realpathSync(linkPath) === realpathSync(expectedPath);
}

function versionAtLeast(current, requiredVersion) {
  const currentParts = current.split(".").map(Number);
  const requiredParts = requiredVersion.split(".").map(Number);
  for (let index = 0; index < requiredParts.length; index++) {
    const currentPart = currentParts[index] ?? 0;
    const requiredPart = requiredParts[index] ?? 0;
    if (currentPart !== requiredPart) return currentPart > requiredPart;
  }
  return true;
}

if (!existsSync(resolve(webRoot, "package.json"))) {
  skip(
    `checkout not found at ${newvatoCheckout}. Set NEWVATO_CHECKOUT to the private checkout path.`,
  );
}

const newvatoPackage = JSON.parse(
  readFileSync(resolve(newvatoCheckout, "package.json"), "utf8"),
);
const requiredNode = newvatoPackage.engines?.node?.match(/>=([\d.]+)/)?.[1];
if (requiredNode && !versionAtLeast(process.versions.node, requiredNode)) {
  skip(
    `Newvato requires Node ${requiredNode} or newer; this command is using Node ${process.versions.node}. Activate the checkout's Node version, then rerun pnpm test:newvato.`,
  );
}

if (!linkedToWorkspace(pluginLink, expectedPlugin)) {
  skip(
    [
      "the Newvato web package is not linked to this Nudge UI workspace.",
      `Expected ${pluginLink} -> ${expectedPlugin}.`,
      `Create it with: ln -s ${expectedPlugin} ${pluginLink}.`,
      "Then rerun pnpm test:newvato.",
    ].join(" "),
  );
}

const playwright = resolve(sandboxRoot, "node_modules/.bin/playwright");
if (!existsSync(playwright)) {
  skip("Playwright is not installed for the sandbox workspace. Run pnpm install in Nudge UI.");
}

const result = spawnSync(
  playwright,
  ["test", "-c", "playwright.newvato.config.ts", "--project=newvato"],
  {
    cwd: sandboxRoot,
    env: {
      ...process.env,
      NEWVATO_CHECKOUT: newvatoCheckout,
    },
    stdio: "inherit",
  },
);

process.exit(result.status ?? 1);
