import { useMemo } from "react";
import type { ReactElement } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import { useChanges, revertChange } from "./changesLog.ts";
import type { ChangeRecord } from "./changesLog.ts";
import { StaleChangeIndicator } from "./canvas/StaleChangeIndicator.tsx";
import { Button } from "./ui/Button.tsx";
import { revertDomMutation, useDomMutations } from "./domMutations.ts";
import { presentChange } from "./changes/presentation.ts";

interface Group {
  key: string;
  label: string;
  file: string;
  changes: ChangeRecord[];
}

interface ChangesLogProps {
  onClearSession?: () => void;
}

function groupChanges(changes: ChangeRecord[]): Group[] {
  const map = new Map<string, Group>();
  for (const change of changes) {
    const presentation = presentChange(change);
    const key = presentation.groupKey;
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        label: presentation.groupLabel,
        file: presentation.file,
        changes: [],
      };
      map.set(key, group);
    }
    group.changes.push(change);
  }
  return Array.from(map.values());
}

export function ChangesLog({ onClearSession }: ChangesLogProps): ReactElement {
  const changes = useChanges();
  const domMutations = useDomMutations();
  const groups = useMemo(() => groupChanges(changes), [changes]);
  const total = changes.length + domMutations.length;

  return (
    <>
      <details className="dt-changes" data-test="changes-log">
        <summary className="dt-changes__title" data-test="changes-toggle">
          <span className="dt-changes__title-label">Changes</span>
          {total > 0 ? <span className="dt-changes__count">{total}</span> : null}
          <IconChevronDown className="dt-changes__toggle-icon" size={15} stroke={2} aria-hidden="true" />
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
                  {group.changes.map((change, i) => {
                    const presentation = presentChange(change);
                    return (
                      <div className="dt-changes__row" data-test="change-row" key={`${group.key}\u0000${presentation.property}\u0000${i}`} data-property={presentation.property}>
                        <span className="dt-changes__prop">{presentation.propertyLabel}</span>
                        <span className="dt-changes__value">
                          <span className="dt-changes__before">{presentation.before}</span>
                          <span className="dt-changes__arrow">→</span>
                          <span className="dt-changes__after">{presentation.after}</span>
                        </span>
                        <StaleChangeIndicator change={change} />
                        <Button
                          size="compact"
                          className="dt-changes__revert"
                          data-test="change-revert"
                          data-property={presentation.property}
                          onClick={() => revertChange(change)}
                        >
                          Revert
                        </Button>
                      </div>
                    );
                  })}
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
      {onClearSession ? (
        <div className="dt-changes__session-action" data-test="session-actions">
          <Button
            size="compact"
            variant="secondary"
            type="button"
            data-test="clear-session"
            onClick={onClearSession}
          >
            Clear Session
          </Button>
        </div>
      ) : null}
    </>
  );
}
