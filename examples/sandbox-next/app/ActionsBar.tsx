"use client";

import { ClientBadge } from "./ClientBadge";
import { NavToSecond } from "./NavToSecond";

/**
 * A client island that INVOKES ClientBadge from within a client module.
 * Callsite wrappers exist only in client modules, so this invocation is
 * semantically editable while server-page invocations remain
 * identified-but-not-editable (ADR-0010 capability contract).
 */
export function ActionsBar() {
  return (
    <section className="actions">
      <ClientBadge label="client island" tone="accent" disabled={false} />
      <NavToSecond />
    </section>
  );
}
