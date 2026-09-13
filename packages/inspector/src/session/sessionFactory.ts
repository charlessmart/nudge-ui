import {
  createSessionOwner,
  type SessionOwner,
  type SessionOwnerImplementation,
} from "./lifecycle.ts";

/** The mounted DOM node that hosts an inspector session. */
export type InspectorHost = HTMLElement;

/** Resources that survive inspector remounts. */
export interface Workspace extends SessionOwner {
  createInspectorSession(host: InspectorHost): InspectorSession;
  createDocumentSession(doc: Document): DocumentSession;
}

/** Resources owned by one mounted inspector. */
export interface InspectorSession extends SessionOwner {
  readonly host: InspectorHost;
  readonly workspace: Workspace;
  createDocumentSession(doc: Document): DocumentSession;
}

/** Resources and caches associated with one inspected document lifetime. */
export interface DocumentSession extends SessionOwner {
  readonly document: Document;
  readonly inspector: InspectorSession | null;
  readonly workspace: Workspace;
}

function createDocumentSessionFor(
  workspace: Workspace,
  inspector: InspectorSession | null,
  parent: SessionOwnerImplementation,
  doc: Document,
): DocumentSession {
  const owner = createSessionOwner("document");
  const session: DocumentSession = {
    get id() {
      return owner.id;
    },
    get disposed() {
      return owner.disposed;
    },
    registerCleanup: owner.registerCleanup,
    dispose: owner.dispose,
    document: doc,
    inspector,
    workspace,
  };
  parent.adopt(owner);
  return session;
}

function createInspectorSessionFor(workspace: Workspace, parent: SessionOwnerImplementation, host: InspectorHost): InspectorSession {
  const owner = createSessionOwner("inspector");
  let session: InspectorSession;
  session = {
    get id() {
      return owner.id;
    },
    get disposed() {
      return owner.disposed;
    },
    registerCleanup: owner.registerCleanup,
    dispose: owner.dispose,
    host,
    workspace,
    createDocumentSession(doc): DocumentSession {
      return createDocumentSessionFor(workspace, session, owner, doc);
    },
  };
  parent.adopt(owner);
  return session;
}

/**
 * Creates the workspace owner. A workspace owns mounted inspector sessions
 * and any document sessions created directly from the workspace.
 */
export function createWorkspace(): Workspace {
  const owner = createSessionOwner("workspace");
  let workspace: Workspace;
  workspace = {
    get id() {
      return owner.id;
    },
    get disposed() {
      return owner.disposed;
    },
    registerCleanup: owner.registerCleanup,
    dispose: owner.dispose,
    createInspectorSession(host): InspectorSession {
      return createInspectorSessionFor(workspace, owner, host);
    },
    createDocumentSession(doc): DocumentSession {
      return createDocumentSessionFor(workspace, null, owner, doc);
    },
  };
  return workspace;
}

/** Creates an inspector session owned by the supplied workspace. */
export function createInspectorSession(workspace: Workspace, host: InspectorHost): InspectorSession {
  return workspace.createInspectorSession(host);
}

/** Creates a document session owned by a workspace or mounted inspector. */
export function createDocumentSession(
  owner: Workspace | InspectorSession,
  doc: Document,
): DocumentSession {
  return owner.createDocumentSession(doc);
}
