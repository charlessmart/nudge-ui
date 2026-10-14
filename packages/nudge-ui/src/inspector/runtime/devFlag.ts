/** An explicit host flag wins; otherwise the bundler define; neither means not-development. */
export function resolveNudgeUiDev(
  bundlerDefinedDev: boolean | undefined,
  hostFlag: boolean | undefined,
): boolean {
  if (hostFlag !== undefined) return hostFlag;
  if (bundlerDefinedDev !== undefined) return bundlerDefinedDev;
  return false;
}

let hostDevFlag: boolean | undefined;

/** For hosts whose compiler cannot supply the bundler define (Next.js/SWC); call before bootstrapping, `undefined` clears it. */
export function setNudgeUiHostDevFlag(value: boolean | undefined): void {
  hostDevFlag = value;
}

export function isNudgeUiDev(): boolean {
  try {
    // Statically replaced under Vite; where nothing defines it (Next.js/SWC)
    // this read throws and the catch fails closed.
    return resolveNudgeUiDev(import.meta.env.DEV === true, hostDevFlag);
  } catch {
    return resolveNudgeUiDev(undefined, hostDevFlag);
  }
}
