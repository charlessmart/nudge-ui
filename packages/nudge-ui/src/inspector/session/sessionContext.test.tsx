// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  InspectorSessionProvider,
  useDocumentSession,
  useInspectorSession,
  useSessionContext,
} from "./sessionContext.tsx";
import { createWorkspace } from "./sessionFactory.ts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("InspectorSessionProvider", () => {
  let host: HTMLDivElement | undefined;

  afterEach(() => {
    host?.remove();
    host = undefined;
  });

  it("delivers owner and session handles without adding domain state", () => {
    const workspace = createWorkspace();
    const inspector = workspace.createInspectorSession(document.body);
    const documentSession = inspector.createDocumentSession(document);
    const received: {
      workspace: typeof workspace;
      inspector: typeof inspector;
      document: typeof documentSession | null;
    }[] = [];

    function Probe(): null {
      received.push({
        workspace: useSessionContext().workspace,
        inspector: useInspectorSession(),
        document: useDocumentSession(),
      });
      return null;
    }

    host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <InspectorSessionProvider inspector={inspector} documentSession={documentSession}>
          <Probe />
        </InspectorSessionProvider>,
      );
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ workspace, inspector, document: documentSession });

    act(() => root.unmount());
    workspace.dispose();
  });
});
