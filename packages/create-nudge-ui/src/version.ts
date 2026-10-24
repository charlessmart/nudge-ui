import { readFileSync } from "node:fs";

/** The published initializer version, read from the package that ships this module. */
export function initializerVersion(): string {
  const value: unknown = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  if (typeof value !== "object" || value === null || !("version" in value) || typeof value.version !== "string") {
    throw new TypeError("create-nudge-ui package metadata has no version.");
  }
  return value.version;
}
