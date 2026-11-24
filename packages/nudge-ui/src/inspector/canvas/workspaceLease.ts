import { getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";

export interface WorkspaceLease {
  ownerId: string;
  projectId: string;
  acquiredAt: number;
  lastHeartbeat: number;
  /** Whether the owning document is visible and focused; a new tab only claims an idle owner's lease. */
  ownerActive?: boolean;
}

const LEASE_KEY_PREFIX = "nudge-ui:";
const HEARTBEAT_INTERVAL_MS = 5000;
const LEASE_EXPIRY_MS = 15000;

function leaseKey(): string {
  return `${LEASE_KEY_PREFIX}${getNudgeUiRuntimeConfig().projectId}:lease`;
}

function generateOwnerId(): string {
  return (
    crypto.randomUUID?.() ??
    `owner-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export function readLeaseRaw(): WorkspaceLease | null {
  try {
    const raw = localStorage.getItem(leaseKey());
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return null;
    // SAFETY: JSON.parse returns unknown; we narrow only the known lease fields below.
    const l = parsed as {
      ownerId?: unknown;
      projectId?: unknown;
      acquiredAt?: unknown;
      lastHeartbeat?: unknown;
      ownerActive?: unknown;
    };
    if (
      typeof l.ownerId !== "string" ||
      typeof l.projectId !== "string" ||
      typeof l.acquiredAt !== "number" ||
      typeof l.lastHeartbeat !== "number"
    ) {
      return null;
    }
    return {
      ownerId: l.ownerId,
      projectId: l.projectId,
      acquiredAt: l.acquiredAt,
      lastHeartbeat: l.lastHeartbeat,
      ownerActive: l.ownerActive === true,
    };
  } catch {
    return null;
  }
}

function writeLease(lease: WorkspaceLease): void {
  try {
    localStorage.setItem(leaseKey(), JSON.stringify(lease));
  } catch {
    /* storage unavailable */
  }
}

function deleteLease(): void {
  try {
    localStorage.removeItem(leaseKey());
  } catch {
  }
}

export function isLeaseExpired(lease: WorkspaceLease, now: number = Date.now()): boolean {
  return now - lease.lastHeartbeat > LEASE_EXPIRY_MS;
}

/** The person is looking at and can type into this document. */
export function isDocumentActive(): boolean {
  return document.visibilityState === "visible" && document.hasFocus();
}

let currentOwnerId: string | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let ownsLease = false;
let writeGuardEnabled = false;
const ownershipListeners = new Set<(hasLease: boolean) => void>();

function notifyOwnershipListeners(): void {
  const snapshot = ownsLease;
  for (const listener of ownershipListeners) {
    try {
      listener(snapshot);
    } catch {
    }
  }
}

function startHeartbeat(): void {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    if (!currentOwnerId || !ownsLease) return;
    const existing = readLeaseRaw();
    if (!existing || existing.ownerId !== currentOwnerId) {
      loseOwnership();
      return;
    }
    existing.lastHeartbeat = Date.now();
    existing.ownerActive = isDocumentActive();
    writeLease(existing);
  }, HEARTBEAT_INTERVAL_MS);
  window.addEventListener("focus", scheduleActivityReport);
  window.addEventListener("blur", scheduleActivityReport);
  document.addEventListener("visibilitychange", scheduleActivityReport);
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  window.removeEventListener("focus", scheduleActivityReport);
  window.removeEventListener("blur", scheduleActivityReport);
  document.removeEventListener("visibilitychange", scheduleActivityReport);
}

// Deferred so focus moving into one of this page's iframes still reads as active.
function scheduleActivityReport(): void {
  setTimeout(reportActivity, 0);
}

function reportActivity(): void {
  if (!currentOwnerId || !ownsLease) return;
  const existing = readLeaseRaw();
  if (!existing || existing.ownerId !== currentOwnerId) return;
  const active = isDocumentActive();
  if (existing.ownerActive === active) return;
  existing.ownerActive = active;
  writeLease(existing);
}

function loseOwnership(): void {
  ownsLease = false;
  stopHeartbeat();
  notifyOwnershipListeners();
}

function createLease(): WorkspaceLease {
  return {
    ownerId: currentOwnerId!,
    projectId: getNudgeUiRuntimeConfig().projectId,
    acquiredAt: Date.now(),
    lastHeartbeat: Date.now(),
    ownerActive: isDocumentActive(),
  };
}

export function acquireLease(): boolean {
  if (currentOwnerId) {
    const existing = readLeaseRaw();
    if (
      existing &&
      existing.ownerId === currentOwnerId &&
      !isLeaseExpired(existing)
    ) {
      if (!ownsLease) {
        ownsLease = true;
        startHeartbeat();
        notifyOwnershipListeners();
      }
      return true;
    }
    loseOwnership();
  }

  currentOwnerId = generateOwnerId();
  const existing = readLeaseRaw();

  // A live lease passes to this tab only when its owner is idle and the person is here.
  if (existing && !isLeaseExpired(existing) && (existing.ownerActive || !isDocumentActive())) {
    return false;
  }

  const lease = createLease();
  writeLease(lease);
  ownsLease = true;
  startHeartbeat();
  window.addEventListener("storage", handleStorageEvent);
  notifyOwnershipListeners();
  return true;
}

export function requestTakeover(): boolean {
  if (!currentOwnerId) {
    currentOwnerId = generateOwnerId();
  }
  const lease = createLease();
  writeLease(lease);
  ownsLease = true;
  startHeartbeat();
  window.addEventListener("storage", handleStorageEvent);
  notifyOwnershipListeners();
  return true;
}

/**
 * Takes over the lease the next time the person comes to, or interacts with, this document.
 * Only intent signals count, so two documents that both report focus cannot trade it back and forth.
 */
export function watchForTakeover(onTakeover: () => void): () => void {
  const take = () => {
    stop();
    if (!ownsLease) requestTakeover();
    onTakeover();
  };
  const takeWhenActive = () => {
    if (isDocumentActive()) take();
  };
  function stop(): void {
    window.removeEventListener("focus", take);
    document.removeEventListener("visibilitychange", takeWhenActive);
    window.removeEventListener("pointerdown", take, true);
    window.removeEventListener("keydown", take, true);
  }
  window.addEventListener("focus", take);
  document.addEventListener("visibilitychange", takeWhenActive);
  window.addEventListener("pointerdown", take, true);
  window.addEventListener("keydown", take, true);
  return stop;
}

/** Enable lease checks for state-changing controller actions in this document. */
export function enableWriteGuard(): void {
  writeGuardEnabled = true;
}

/** Off by default so unit-level modules work without the controller bootstrap. */
export function canWriteWorkspace(): boolean {
  return !writeGuardEnabled || hasWriteLease();
}

export function releaseLease(): void {
  if (!ownsLease) return;
  stopHeartbeat();
  window.removeEventListener("storage", handleStorageEvent);
  const existing = readLeaseRaw();
  if (existing && existing.ownerId === currentOwnerId) {
    deleteLease();
  }
  ownsLease = false;
  currentOwnerId = null;
  notifyOwnershipListeners();
}

export function hasWriteLease(): boolean {
  if (!ownsLease) return false;
  const existing = readLeaseRaw();
  if (
    !existing ||
    existing.ownerId !== currentOwnerId ||
    isLeaseExpired(existing)
  ) {
    loseOwnership();
    return false;
  }
  return true;
}

export function getActiveLeaseOwner(): { ownerId: string; acquiredAt: number } | null {
  const existing = readLeaseRaw();
  if (!existing || isLeaseExpired(existing)) return null;
  return { ownerId: existing.ownerId, acquiredAt: existing.acquiredAt };
}

export function getOwnerId(): string | null {
  return currentOwnerId;
}

export function subscribeOwnership(listener: (hasLease: boolean) => void): () => void {
  ownershipListeners.add(listener);
  return () => {
    ownershipListeners.delete(listener);
  };
}

function handleStorageEvent(event: StorageEvent): void {
  if (event.key !== leaseKey()) return;
  if (!ownsLease) return;

  if (event.newValue === null) {
    const lease = createLease();
    writeLease(lease);
    return;
  }

  const lease = readLeaseRaw();
  if (!lease || lease.ownerId === currentOwnerId) return;

  loseOwnership();
}
