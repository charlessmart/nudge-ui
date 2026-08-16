import { designToolProjectId } from "virtual:design-tokens";

export interface WorkspaceLease {
  ownerId: string;
  projectId: string;
  acquiredAt: number;
  lastHeartbeat: number;
}

const LEASE_KEY_PREFIX = "design-tool:";
const HEARTBEAT_INTERVAL_MS = 5000;
const LEASE_EXPIRY_MS = 15000;

function leaseKey(): string {
  return `${LEASE_KEY_PREFIX}${designToolProjectId}:lease`;
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
    /* ignore */
  }
}

export function isLeaseExpired(lease: WorkspaceLease, now: number = Date.now()): boolean {
  return now - lease.lastHeartbeat > LEASE_EXPIRY_MS;
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
      /* ignore */
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
    writeLease(existing);
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function loseOwnership(): void {
  ownsLease = false;
  stopHeartbeat();
  notifyOwnershipListeners();
}

function createLease(): WorkspaceLease {
  return {
    ownerId: currentOwnerId!,
    projectId: designToolProjectId,
    acquiredAt: Date.now(),
    lastHeartbeat: Date.now(),
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

  if (existing && !isLeaseExpired(existing)) {
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

/** Enable lease checks for state-changing controller actions in this document. */
export function enableWriteGuard(): void {
  writeGuardEnabled = true;
}

/**
 * Unit-level modules are also used without the browser controller bootstrap.
 * Once the controller enables the guard, only the current lease owner may
 * mutate or persist its canonical workspace state.
 */
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
