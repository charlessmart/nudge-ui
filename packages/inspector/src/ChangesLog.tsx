import { useMemo } from "react";
import type { ReactElement } from "react";
import { useChanges, revertChange } from "./changesLog.ts";
import type { ChangeRecord } from "./changesLog.ts";
import { CopyPromptButton } from "./CopyPromptButton.tsx";
import { Button } from "./ui/Button.tsx";

interface Group {
  key: string;
  cid: string;
  file: string;
  changes: ChangeRecord[];
}

function groupChanges(changes: ChangeRecord[]): Group[] {
  const map = new Map<string, Group>();
  for (const change of changes) {
    const key = [change.cid, change.file, change.line, change.selector, change.scope ?? "source-site"].join("\u0000");
    let group = map.get(key);
    if (!group) {
      group = { key, cid: change.cid, file: change.file, changes: [] };
      map.set(key, group);
    }
    group.changes.push(change);
  }
  return Array.from(map.values());
}

function displayBefore(rec: ChangeRecord): string {
  if (rec.oldToken) return rec.oldToken.name;
  if (rec.rawValue !== undefined && rec.newToken) return rec.rawValue;
  return "(original)";
}

function displayAfter(rec: ChangeRecord): string {
  if (rec.newToken) return rec.newToken.name;
  if (rec.rawValue !== undefined) return rec.rawValue;
  return "";
}

export function ChangesLog(): ReactElement {
  const changes = useChanges();
  const groups = useMemo(() => groupChanges(changes), [changes]);

  return (
    <div className="dt-changes" data-test="changes-log">
      <div className="dt-changes__title">Changes</div>
      <CopyPromptButton />
      {groups.length === 0 ? (
        <div className="dt-changes__empty" data-test="changes-empty">
          No changes yet
        </div>
      ) : (
        groups.map((group) => (
          <div className="dt-changes__group" data-test="changes-group" key={group.key} data-cid={group.cid}>
            <div className="dt-changes__group-title">
              {group.cid} <span className="dt-changes__group-file">{group.file}</span>
            </div>
            {group.changes.map((change, i) => (
              <div className="dt-changes__row" data-test="change-row" key={`${group.key}\u0000${change.property}\u0000${i}`} data-property={change.property}>
                <span className="dt-changes__prop">{change.property}</span>
                <span className="dt-changes__before">{displayBefore(change)}</span>
                <span className="dt-changes__arrow">→</span>
                <span className="dt-changes__after">{displayAfter(change)}</span>
                {change.previewResult?.status === "conflict" ? (
                  <span className="dt-changes__conflict" data-test="preview-conflict" title={`Computed: ${change.previewResult.computedValue}`}>
                    Preview blocked ({change.previewResult.reason})
                  </span>
                ) : null}
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
        ))
      )}
    </div>
  );
}
