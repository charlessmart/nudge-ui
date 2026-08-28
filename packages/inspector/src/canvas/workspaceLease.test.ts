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
} from "./workspaceLease.ts";
import { nudgeUiProjectId } from "virtual:design-tokens";

const STORAGE_KEY = `nudge-ui:${nudgeUiProjectId}:lease`;

function clearAllState(): void {
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



    it("returns false when another live lease exists", () => {
      acquireLease();

      // Simulate another tab by writing a different owner lease
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ownerId: "other-tab-id",
          projectId: nudgeUiProjectId,
          acquiredAt: Date.now(),
          lastHeartbeat: Date.now(),
        }),
      );

      releaseLease();

      const result = acquireLease();
      expect(result).toBe(false);
      expect(hasWriteLease()).toBe(false);
    });

    it("acquires an expired lease", () => {
      // Write an expired lease
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

      // Simulate storage event
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
