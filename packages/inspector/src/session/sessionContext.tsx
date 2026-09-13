import { createContext, useContext, useMemo } from "react";
import type { ReactElement, ReactNode } from "react";
import type { DocumentSession, InspectorSession, Workspace } from "./sessionFactory.ts";

/** Handles delivered to editors through React without carrying domain state. */
export interface SessionContextValue {
  readonly workspace: Workspace;
  readonly inspector: InspectorSession;
  readonly document: DocumentSession | null;
}

export interface InspectorSessionProviderProps {
  readonly inspector: InspectorSession;
  readonly documentSession?: DocumentSession | null;
  readonly children?: ReactNode;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** Delivers the active inspector and document handles to editor descendants. */
export function InspectorSessionProvider({
  inspector,
  documentSession = null,
  children,
}: InspectorSessionProviderProps): ReactElement {
  const value = useMemo<SessionContextValue>(
    () => ({
      workspace: inspector.workspace,
      inspector,
      document: documentSession,
    }),
    [documentSession, inspector],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Returns all active session handles, or throws when no provider is mounted. */
export function useSessionContext(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSessionContext must be used inside InspectorSessionProvider.");
  }
  return value;
}

/** Returns the active mounted-inspector handle. */
export function useInspectorSession(): InspectorSession {
  return useSessionContext().inspector;
}

/** Returns the active inspected-document handle, when one is mounted. */
export function useDocumentSession(): DocumentSession | null {
  return useSessionContext().document;
}
