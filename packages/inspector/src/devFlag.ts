/**
 * Decides the shared dev gate from one bundler observation and one host
 * observation. Pure so every precedence rule is unit-testable without a
 * particular bundler present.
 *
 * Precedence: an explicit host flag wins (a compiler without a define must
 * still be authoritative); otherwise the bundler define decides; with neither,
 * development is assumed absent — the gate fails closed rather than guessing.
 */
export function resolveNudgeUiDev(
  bundlerDefinedDev: boolean | undefined,
  hostFlag: boolean | undefined,
): boolean {
  if (hostFlag !== undefined) return hostFlag;
  if (bundlerDefinedDev !== undefined) return bundlerDefinedDev;
  return false;
}

let hostDevFlag: boolean | undefined;

/**
 * Records whether the host Adapter is running a development server (ADR-0002).
 *
 * Vite and the standalone esbuild pipeline statically replace
 * `import.meta.env.DEV`, so their bundles need no runtime flag. Hosts whose
 * compiler cannot supply that define — Next.js/SWC has no equivalent of Vite's
 * `define` for `import.meta.env` — must call this before bootstrapping the
 * inspector. Passing `undefined` clears the override and restores the static
 * define as the sole authority.
 *
 * The flag is process-global state by design: every inspector Module shares
 * one dev gate, and a host configures it once per document, not per Module.
 */
export function setNudgeUiHostDevFlag(value: boolean | undefined): void {
  hostDevFlag = value;
}

/**
 * Dev-phase gate shared by every inspector Module (ADR-0002).
 */
export function isNudgeUiDev(): boolean {
  try {
    // Under Vite (and the standalone esbuild build) this member expression is
    // statically replaced, so the read cannot throw there. In a bundle whose
    // compiler defines nothing — Next.js/SWC — `import.meta.env` is undefined
    // and the bare property read throws a TypeError. A build-mode name (such
    // as the landing demo's `nudge-demo`) must never widen this gate; the
    // demo runtime opens it for its own document instead (ADR-0014).
    return resolveNudgeUiDev(import.meta.env.DEV === true, hostDevFlag);
  } catch {
    return resolveNudgeUiDev(undefined, hostDevFlag);
  }
}
