// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  createDocumentSession,
  createInspectorSession,
  createWorkspace,
} from "./sessionFactory.ts";

describe("session factory ownership", () => {
  it("disposes document, inspector, and workspace children in order exactly once", () => {
    const workspace = createWorkspace();
    const inspector = workspace.createInspectorSession(document.body);
    const documentSession = inspector.createDocumentSession(document);
    const disposed: string[] = [];

    documentSession.registerCleanup(() => disposed.push("document"));
    inspector.registerCleanup(() => disposed.push("inspector"));
    workspace.registerCleanup(() => disposed.push("workspace"));

    workspace.dispose();
    workspace.dispose();
    inspector.dispose();
    documentSession.dispose();

    expect(disposed).toEqual(["document", "inspector", "workspace"]);
    expect(workspace.disposed).toBe(true);
    expect(inspector.disposed).toBe(true);
    expect(documentSession.disposed).toBe(true);
  });

  it("ignores cleanup registration after disposal", () => {
    const workspace = createWorkspace();
    const cleanup = vi.fn();
    const lateCleanup = vi.fn();

    workspace.registerCleanup(cleanup);
    workspace.dispose();
    const unregisterLateCleanup = workspace.registerCleanup(lateCleanup);
    unregisterLateCleanup();
    workspace.dispose();

    expect(cleanup).toHaveBeenCalledOnce();
    expect(lateCleanup).not.toHaveBeenCalled();
  });

  it("keeps convenience constructors attached to their explicit owner", () => {
    const workspace = createWorkspace();
    const inspector = createInspectorSession(document.body, workspace);
    const documentSession = createDocumentSession(document, inspector);
    const cleanup = vi.fn();

    documentSession.registerCleanup(cleanup);
    workspace.dispose();

    expect(inspector.workspace).toBe(workspace);
    expect(documentSession.inspector).toBe(inspector);
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
