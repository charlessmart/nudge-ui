// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  acquireLease,
  requestTakeover,
  releaseLease,
  hasWriteLease,
  getActiveLeaseOwner,
  getOwnerId,
  isLeaseExpired,
  readLeaseRaw,
  subscribeOwnership,
  watchForTakeover,
} from "./workspaceLease.ts";
import { nudgeUiProjectId } from "virtual:design-tokens";

const STORAGE_KEY = `nudge-ui:${nudgeUiProjectId}:lease`;

function otherOwner(ownerActive: boolean): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ownerId: "other-tab-id",
    projectId: nudgeUiProjectId,
    acquiredAt: Date.now(),
    lastHeartbeat: Date.now(),
    ownerActive,
  }));
}

function setDocumentActive(active: boolean): void {
  vi.spyOn(document, "hasFocus").mockReturnValue(active);
}

function clearAllState(): void {
  vi.restoreAllMocks();
  releaseLease();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

describe("workspaceLease", () => {
  beforeEach(clearAllState);
  afterEach(clearAllState);

  describe("acquireLease", () => {
    it("acquires a lease when none exists", () => {
      const result = acquireLease();
      expect(result).toBe(true);
      expect(hasWriteLease()).toBe(true);
      expect(getOwnerId()).not.toBeNull();

      const raw = readLeaseRaw();
      expect(raw).not.toBeNull();
      expect(raw!.projectId).toBe(nudgeUiProjectId);
      expect(raw!.ownerId).toBe(getOwnerId());
    });

    it("returns false when the person is using the tab that holds a live lease", () => {
      setDocumentActive(true);
      otherOwner(true);

      expect(acquireLease()).toBe(false);
      expect(hasWriteLease()).toBe(false);
    });

    it("takes an idle owner's live lease when the person is in this tab", () => {
      setDocumentActive(true);
      otherOwner(false);

      expect(acquireLease()).toBe(true);
      expect(readLeaseRaw()!.ownerId).toBe(getOwnerId());
    });

    it("leaves an idle owner's live lease alone when this tab opened in the background", () => {
      setDocumentActive(false);
      otherOwner(false);

      expect(acquireLease()).toBe(false);
      expect(readLeaseRaw()!.ownerId).toBe("other-tab-id");
    });

    it("records whether the owning tab is in use", () => {
      setDocumentActive(true);
      acquireLease();
      expect(readLeaseRaw()!.ownerActive).toBe(true);
    });

    it("acquires an expired lease", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ownerId: "expired-owner",
          projectId: nudgeUiProjectId,
          acquiredAt: Date.now() - 60000,
          lastHeartbeat: Date.now() - 20000,
        }),
      );

      const result = acquireLease();
      expect(result).toBe(true);
    });

    it("re-acquires the same lease when called again", () => {
      const first = acquireLease();
      expect(first).toBe(true);
      const ownerId = getOwnerId();

      const second = acquireLease();
      expect(second).toBe(true);
      expect(getOwnerId()).toBe(ownerId);
    });
  });

  describe("hasWriteLease", () => {
    it("returns false when no lease is acquired", () => {
      expect(hasWriteLease()).toBe(false);
    });

    it("returns true after acquiring", () => {
      acquireLease();
      expect(hasWriteLease()).toBe(true);
    });

    it("returns false after release", () => {
      acquireLease();
      releaseLease();
      expect(hasWriteLease()).toBe(false);
    });

    it("returns false when lease is stolen by another tab", () => {
      acquireLease();
      expect(hasWriteLease()).toBe(true);

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ownerId: "other-owner",
          projectId: nudgeUiProjectId,
          acquiredAt: Date.now(),
          lastHeartbeat: Date.now(),
        }),
      );

      const event = new StorageEvent("storage", {
        key: STORAGE_KEY,
        oldValue: null,
        newValue: JSON.stringify({
          ownerId: "other-owner",
          projectId: nudgeUiProjectId,
          acquiredAt: Date.now(),
          lastHeartbeat: Date.now(),
        }),
      });
      window.dispatchEvent(event);

      expect(hasWriteLease()).toBe(false);
    });
  });

  describe("requestTakeover", () => {
    it("overwrites an existing lease", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ownerId: "old-owner",
          projectId: nudgeUiProjectId,
          acquiredAt: Date.now() - 60000,
          lastHeartbeat: Date.now(),
        }),
      );

      const result = requestTakeover();
      expect(result).toBe(true);
      expect(hasWriteLease()).toBe(true);

      const raw = readLeaseRaw();
      expect(raw!.ownerId).not.toBe("old-owner");
    });
  });

  describe("watchForTakeover", () => {
    it.each([
      ["focus", () => window.dispatchEvent(new FocusEvent("focus"))],
      ["pointerdown", () => window.dispatchEvent(new Event("pointerdown"))],
      ["keydown", () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }))],
    ])("takes over once on %s", (_signal, dispatch) => {
      setDocumentActive(false);
      otherOwner(true);
      acquireLease();
      let takeovers = 0;
      watchForTakeover(() => { takeovers += 1; });

      dispatch();
      dispatch();

      expect(takeovers).toBe(1);
      expect(hasWriteLease()).toBe(true);
    });

    it("takes over when the tab becomes visible with focus, not when it only becomes visible", () => {
      const focused = vi.spyOn(document, "hasFocus").mockReturnValue(false);
      otherOwner(true);
      let takeovers = 0;
      watchForTakeover(() => { takeovers += 1; });

      document.dispatchEvent(new Event("visibilitychange"));
      expect(takeovers).toBe(0);
      focused.mockReturnValue(true);
      document.dispatchEvent(new Event("visibilitychange"));

      expect(takeovers).toBe(1);
      expect(hasWriteLease()).toBe(true);
    });

    it("stops watching when cancelled", () => {
      otherOwner(true);
      let takeovers = 0;
      const stop = watchForTakeover(() => { takeovers += 1; });
      stop();

      window.dispatchEvent(new FocusEvent("focus"));

      expect(takeovers).toBe(0);
      expect(readLeaseRaw()!.ownerId).toBe("other-tab-id");
    });
  });

  describe("releaseLease", () => {
    it("removes the lease from storage", () => {
      acquireLease();
      expect(readLeaseRaw()).not.toBeNull();

      releaseLease();
      expect(readLeaseRaw()).toBeNull();
      expect(hasWriteLease()).toBe(false);
    });

    it("is idempotent", () => {
      acquireLease();
      releaseLease();
      releaseLease();
      expect(hasWriteLease()).toBe(false);
    });
  });

  describe("getActiveLeaseOwner", () => {
    it("returns null when no lease exists", () => {
      expect(getActiveLeaseOwner()).toBeNull();
    });

    it("returns owner info when a lease exists", () => {
      acquireLease();
      const owner = getActiveLeaseOwner();
      expect(owner).not.toBeNull();
      expect(owner!.ownerId).toBe(getOwnerId());
    });
  });

  describe("isLeaseExpired", () => {
    it("returns false for a fresh lease", () => {
      const lease = {
        ownerId: "test",
        projectId: nudgeUiProjectId,
        acquiredAt: Date.now(),
        lastHeartbeat: Date.now(),
      };
      expect(isLeaseExpired(lease, Date.now())).toBe(false);
    });

    it("returns true when heartbeat is older than 15 seconds", () => {
      const lease = {
        ownerId: "test",
        projectId: nudgeUiProjectId,
        acquiredAt: Date.now() - 60000,
        lastHeartbeat: Date.now() - 16000,
      };
      expect(isLeaseExpired(lease, Date.now())).toBe(true);
    });
  });

  describe("subscribeOwnership", () => {
    it("notifies listeners on acquire", () => {
      const listener = vi.fn();
      subscribeOwnership(listener);
      acquireLease();
      expect(listener).toHaveBeenCalledWith(true);
    });

    it("notifies listeners on release", () => {
      acquireLease();
      const listener = vi.fn();
      subscribeOwnership(listener);
      releaseLease();
      expect(listener).toHaveBeenCalledWith(false);
    });

    it("can unsubscribe", () => {
      const listener = vi.fn();
      const unsub = subscribeOwnership(listener);
      unsub();
      acquireLease();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("storage event handling", () => {
    it("ignores unrelated storage keys", () => {
      acquireLease();
      expect(hasWriteLease()).toBe(true);

      const event = new StorageEvent("storage", {
        key: "unrelated-key",
        oldValue: null,
        newValue: "value",
      });
      window.dispatchEvent(event);

      expect(hasWriteLease()).toBe(true);
    });

    it("re-acquires when lease is externally removed", () => {
      acquireLease();
      const originalOwnerId = getOwnerId();

      localStorage.removeItem(STORAGE_KEY);

      const event = new StorageEvent("storage", {
        key: STORAGE_KEY,
        oldValue: JSON.stringify({}),
        newValue: null,
      });
      window.dispatchEvent(event);

      expect(hasWriteLease()).toBe(true);
      expect(readLeaseRaw()!.ownerId).toBe(originalOwnerId);
    });
  });
});
