export type NudgeUiEnvironmentSwitch = "off" | "on" | null;

export function readNudgeUiEnvironmentSwitch(
  env: Readonly<Record<string, string | undefined>> = process.env,
): NudgeUiEnvironmentSwitch {
  const value = env.NUDGE_UI?.trim().toLowerCase();
  if (value === "0" || value === "false" || value === "off") return "off";
  if (value === "1" || value === "true" || value === "on") return "on";
  return null;
}

export function isNudgeUiEnabled(
  enabled: boolean | undefined,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return enabled !== false && readNudgeUiEnvironmentSwitch(env) !== "off";
}

/** Manifest fields derived from the environment at request time. */
export function automationManifestFields(
  env: Readonly<Record<string, string | undefined>> = process.env,
): { inspectAutomatedBrowsers?: true } {
  return readNudgeUiEnvironmentSwitch(env) === "on" ? { inspectAutomatedBrowsers: true } : {};
}
