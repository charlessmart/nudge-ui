/**
 * Ensure a stable release tag describes every public package in the workspace.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(new URL("..", import.meta.url).pathname);
const packageDirectories = [
  "agent-protocol",
  "create-nudge-ui",
  "css",
  "inspector",
  "plugin",
  "astro",
  "nextjs",
  "standalone",
  "mcp",
];
const releaseTag = process.argv.slice(2).find((argument) => argument !== "--");

if (!releaseTag || !/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(releaseTag)) {
  throw new Error("Release tags must use the stable SemVer form vMAJOR.MINOR.PATCH.");
}

const releaseVersion = releaseTag.slice(1);
for (const directory of packageDirectories) {
  const packagePath = resolve(repositoryRoot, "packages", directory, "package.json");
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  if (packageJson.version !== releaseVersion) {
    throw new Error(`${packageJson.name} is ${packageJson.version}; expected ${releaseVersion} for ${releaseTag}.`);
  }
  if (packageJson.private === true) {
    throw new Error(`${packageJson.name} is marked private and cannot be released.`);
  }
}

console.log(`${releaseTag} matches all ${packageDirectories.length} public packages.`);
