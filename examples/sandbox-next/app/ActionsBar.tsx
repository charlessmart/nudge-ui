"use client";

import { ClientBadge } from "./ClientBadge";
import { NavToSecond } from "./NavToSecond";

/** Invoking from a client module makes this callsite semantically editable; server-page invocations stay identified but not editable (ADR-0010). */
export function ActionsBar() {
  return (
    <section className="actions">
      <ClientBadge label="client island" tone="accent" disabled={false} />
      <NavToSecond />
    </section>
  );
}
