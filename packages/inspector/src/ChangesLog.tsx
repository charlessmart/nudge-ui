import { useMemo } from "react";
import type { ReactElement } from "react";
import { ChevronDown } from "lucide-react";
import { isTokenChange, useChanges, revertChange } from "./changesLog.ts";
import type { ChangeRecord } from "./changesLog.ts";
import { StaleChangeIndicator } from "./canvas/StaleChangeIndicator.tsx";
import { Button } from "./ui/Button.tsx";
import { formatInspectorLabel } from "./ui/labels.ts";
import { revertDomMutation, useDomMutations } from "./domMutations.ts";

interface Group {
  key: string;
  label: string;
  file: string;
  changes: ChangeRecord[];
}

function groupChanges(changes: ChangeRecord[]): Group[] {
  const map = new Map<string, Group>();
  for (const change of changes) {
    const key = isTokenChange(change)
      ? ["token", change.tokenName, change.file, change.line, change.contextLabel].join("\u0000")
      : [change.cid, change.file, change.line, change.selector, change.scope ?? "source-site"].join("\u0000");
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        label: isTokenChange(change) ? `Global token · ${change.tokenName}` : change.cid,
        file: change.file,
        changes: [],
      };
      map.set(key, group);
    }
    group.changes.push(change);
  }
  return Array.from(map.values());
}

function displayBefore(rec: ChangeRecord): string {
  if (isTokenChange(rec)) return rec.oldRawValue;
  if (rec.oldToken) return rec.oldToken.name;
  if (rec.rawValue !== undefined && rec.newToken) return rec.rawValue;
  return "(original)";
}

function displayAfter(rec: ChangeRecord): string {
  if (isTokenChange(rec)) return rec.rawValue;
  if (rec.newToken) return rec.newToken.name;
  if (rec.rawValue !== undefined) return rec.rawValue;
  return "";
}

export function ChangesLog(): ReactElement {
  const changes = useChanges();
  const domMutations = useDomMutations();
  const groups = useMemo(() => groupChanges(changes), [changes]);
  const total = changes.length + domMutations.length;

  return (
    <details className="dt-changes" data-test="changes-log">
      <summary className="dt-changes__title" data-test="changes-toggle">
        <span className="dt-changes__title-label">Changes</span>
        {total > 0 ? <span className="dt-changes__count">{total}</span> : null}
        <ChevronDown className="dt-changes__toggle-icon" size={15} strokeWidth={2} aria-hidden="true" />
      </summary>
      <div className="dt-changes__content">
        {groups.length === 0 && domMutations.length === 0 ? (
          <div className="dt-changes__empty" data-test="changes-empty">
            No changes yet
          </div>
        ) : (
          <>
          {groups.map((group) => (
            <div className="dt-changes__group" data-test="changes-group" key={group.key} data-cid={group.label}>
              <div className="dt-changes__group-title">
                <span>{group.label}</span>
                <span className="dt-changes__group-file">{group.file}</span>
              </div>
              {group.changes.map((change, i) => (
                <div className="dt-changes__row" data-test="change-row" key={`${group.key}\u0000${change.property}\u0000${i}`} data-property={change.property}>
                  <span className="dt-changes__prop">{isTokenChange(change) ? change.contextLabel : formatInspectorLabel(change.property)}</span>
                  <span className="dt-changes__value">
                    <span className="dt-changes__before">{displayBefore(change)}</span>
                    <span className="dt-changes__arrow">→</span>
                    <span className="dt-changes__after">{displayAfter(change)}</span>
                  </span>
                  <StaleChangeIndicator change={change} />
                  <Button
                    size="compact"
                    className="dt-changes__revert"
                    data-test="change-revert"
                    data-property={change.property}
                    onClick={() => revertChange(change)}
                  >
                    Revert
                  </Button>
                </div>
              ))}
            </div>
          ))}
          {domMutations.map((mutation) => (
            <div className="dt-changes__group" data-test="dom-change" key={mutation.id} data-cid={mutation.cid}>
              <div className="dt-changes__group-title">
                <span>{mutation.cid}</span>
                <span className="dt-changes__group-file">{mutation.file}</span>
              </div>
              <div className="dt-changes__row" data-test="dom-change-row" data-action={mutation.action}>
                <span className="dt-changes__prop">{mutation.action === "move" ? "Move in DOM" : "Delete from DOM"}</span>
                <span className="dt-changes__value">
                  <span className="dt-changes__before">{mutation.action === "move" ? `${mutation.from.parentTag} · position ${mutation.from.index + 1}` : "Visible"}</span>
                  <span className="dt-changes__arrow">→</span>
                  <span className="dt-changes__after">{mutation.action === "move" && mutation.to ? `${mutation.to.parentTag} · position ${mutation.to.index + 1}` : "Removed"}</span>
                </span>
                {mutation.stale ? <span className="dt-changes__conflict" data-test="dom-mutation-stale">React replaced this node. Apply this structural change in code.</span> : null}
                <Button
                  size="compact"
                  className="dt-changes__revert"
                  data-test="dom-change-revert"
                  onClick={() => revertDomMutation(mutation)}
                >
                  Revert
                </Button>
              </div>
            </div>
          ))}
          </>
        )}
      </div>
    </details>
  );
}
