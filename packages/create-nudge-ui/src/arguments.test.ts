import { describe, expect, it } from "vitest";
import { parseArguments } from "./arguments.ts";
import { formatCommand, installCommand } from "./installer.ts";

describe("parseArguments", () => {
  it("parses explicit setup controls", () => {
    expect(parseArguments(["--framework", "astro", "--package-manager=pnpm", "--dry-run"])).toEqual({
      framework: "astro",
      packageManager: "pnpm",
      dryRun: true,
      help: false,
    });
  });

  it("rejects unsupported values and options", () => {
    expect(() => parseArguments(["--framework", "react"])).toThrow(/vite-react/);
    expect(() => parseArguments(["--wat"])).toThrow(/Unknown option/);
  });

  it("accepts npm's pass-through separator", () => {
    expect(parseArguments(["--", "--framework", "astro"]).framework).toBe("astro");
  });

  it("reports missing option values", () => {
    expect(() => parseArguments(["--framework"])).toThrow("--framework requires a value.");
    expect(() => parseArguments(["--package-manager", "--dry-run"]))
      .toThrow("--package-manager requires a value.");
  });
});

describe("installCommand", () => {
  it("uses the package manager's development dependency syntax", () => {
    expect(formatCommand(installCommand("npm", "nudge-ui/astro")))
      .toBe("npm install --save-dev nudge-ui/astro");
    expect(formatCommand(installCommand("pnpm", "nudge-ui/astro")))
      .toBe("pnpm add -D nudge-ui/astro");
    expect(formatCommand(installCommand("yarn", "nudge-ui/astro")))
      .toBe("yarn add -D nudge-ui/astro");
    expect(formatCommand(installCommand("bun", "nudge-ui/astro")))
      .toBe("bun add --dev nudge-ui/astro");
  });
});
