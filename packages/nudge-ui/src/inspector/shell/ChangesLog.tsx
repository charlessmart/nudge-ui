import { useMemo, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import { isElementChange, useChanges, revertChange } from "../changes/changesLog.ts";
import type { ChangeRecord } from "../changes/changesLog.ts";
import { StaleChangeIndicator } from "../canvas/StaleChangeIndicator.tsx";
import { Button } from "../ui/Button.tsx";
import { presentChange } from "../changes/presentation.ts";
import {
  getStructuralChanges,
  getStructuralChangeDiagnostics,
  getStructuralDiagnosticRevision,
  revertStructuralChange,
  subscribeStructuralChanges,
  subscribeStructuralDiagnostics,
  type StructuralChange,
  type StructuralChangeDiagnostic,
} from "../projection/structuralProjection.ts";
import {
  getRenderedInstanceChangeDiagnostics,
  getRenderedInstanceDiagnosticRevision,
  subscribeRenderedInstanceDiagnostics,
} from "../projection/renderedInstance.ts";
import {
  getTextContentChangeDiagnostics,
  getTextProjectionDiagnosticRevision,
  subscribeTextProjectionDiagnostics,
} from "../projection/textProjection.ts";
import { SketchChanges } from "../sketch/SketchChanges.tsx";
import { useSketchStore } from "../sketch/store.ts";

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

function sourceFile(change: StructuralChange): string {
  return change.target.sourceSite.src.split(":").slice(0, -2).join(":") || change.target.sourceSite.src;
}

function structuralParentLabel(change: Extract<StructuralChange, { kind: "move" }>, side: "source" | "destination"): string {
  const parent = side === "source" ? change.source.parent : change.destination.parent;
  const tag = side === "source" ? change.presentation.sourceParentTag : change.presentation.destinationParentTag;
  return `${parent.sourceSite.cid} (${tag})`;
}

function structuralParentIdentityKey(ref: Extract<StructuralChange, { kind: "move" }>["source"]["parent"]): string {
  const { sourceSite, locator } = ref;
  return JSON.stringify([
    sourceSite.cid,
    sourceSite.src,
    locator.occurrence,
    locator.props,
    locator.ariaLabel ?? null,
  ]);
}

function structuralReasonLabel(reason: NonNullable<StructuralChangeDiagnostic["reason"]>): string {
  switch (reason) {
    case "target": return "target address";
    case "source-parent": return "source parent address";
    case "destination-parent": return "destination parent address";
    case "anchor": return "destination anchor";
    case "illegal-destination": return "illegal destination";
    case "react-override": return "React override";
  }
}

function structuralDiagnosticText(diagnostic: StructuralChangeDiagnostic): string {
  return `${diagnostic.document}: ${diagnostic.status}${diagnostic.reason ? ` (${structuralReasonLabel(diagnostic.reason)})` : ""}`;
}

export function ChangesLog({ onClearSession }: ChangesLogProps): ReactElement | null {
  const changes = useChanges();
  const sketchStore = useSketchStore();
  const sketches = sketchStore.items;
  const structuralChanges = useSyncExternalStore(
    subscribeStructuralChanges,
    getStructuralChanges,
    getStructuralChanges,
  );
  // Diagnostics arrive independently from structural state when a renderer
  // resolves a snapshot or its document observer detects a reconciliation.
  useSyncExternalStore(
    subscribeStructuralDiagnostics,
    getStructuralDiagnosticRevision,
    getStructuralDiagnosticRevision,
  );
  useSyncExternalStore(
    subscribeRenderedInstanceDiagnostics,
    getRenderedInstanceDiagnosticRevision,
    getRenderedInstanceDiagnosticRevision,
  );
  useSyncExternalStore(
    subscribeTextProjectionDiagnostics,
    getTextProjectionDiagnosticRevision,
    getTextProjectionDiagnosticRevision,
  );
  const groups = useMemo(() => groupChanges(changes), [changes]);
  const total = changes.length + structuralChanges.length + sketches.length;

  if (total === 0 && sketchStore.error === null) return null;

  return (
    <>
      <details className="changes" data-test="changes-log">
        <summary className="changes__title" data-test="changes-toggle">
          <span className="changes__title-label">Changes</span>
          {total > 0 ? <span className="changes__count">{total}</span> : null}
          <IconChevronDown className="changes__toggle-icon" size={15} stroke={2} aria-hidden="true" />
        </summary>
        <div className="changes__content">
          {groups.length === 0 && structuralChanges.length === 0 && sketches.length === 0 && sketchStore.error === null ? (
            <div className="changes__empty" data-test="changes-empty">
              No changes yet
            </div>
          ) : (
            <>
              {groups.map((group) => (
                <div className="changes__group" data-test="changes-group" key={group.key} data-cid={group.label}>
                  <div className="changes__group-title">
                    <span>{group.label}</span>
                    <span className="changes__group-file">{group.file}</span>
                  </div>
                  {group.changes.map((change, i) => {
                    const presentation = presentChange(change);
                    const instanceDiagnostics = isElementChange(change) && change.scope === "rendered-instance"
                      && change.instanceOverride
                      ? getRenderedInstanceChangeDiagnostics(change.instanceOverride.id)
                      : [];
                    const textDiagnostics = change.kind === "text-content"
                      ? getTextContentChangeDiagnostics(change.id)
                      : [];
                    return (
                      <div className="changes__row" data-test="change-row" key={`${group.key}\u0000${presentation.property}\u0000${i}`} data-property={presentation.property}>
                        <span className="changes__prop">{presentation.propertyLabel}</span>
                        <span className="changes__value">
                          <span className="changes__before">{presentation.before}</span>
                          <span className="changes__arrow">→</span>
                          <span className="changes__after">{presentation.after}</span>
                        </span>
                        {presentation.scope ? (
                          <span className="changes__scope" data-test="change-scope">
                            {presentation.scope === "source-site" ? "All outputs at source site" : "This rendered item only"}
                          </span>
                        ) : null}
                        {presentation.evidence ? (
                          <span className="changes__evidence" data-test="change-evidence">{presentation.evidence}</span>
                        ) : null}
                        <StaleChangeIndicator change={change} />
                        {instanceDiagnostics.map((diagnostic) => (
                          <span
                            className="changes__diagnostic"
                            data-test="instance-diagnostic"
                            data-document={diagnostic.document}
                            data-status={diagnostic.status}
                            key={`${diagnostic.document}:${diagnostic.status}`}
                          >
                            {diagnostic.document}: {diagnostic.status}
                          </span>
                        ))}
                        {textDiagnostics.map((diagnostic) => (
                          <span
                            className="changes__diagnostic"
                            data-test="text-projection-diagnostic"
                            data-document={diagnostic.document}
                            data-status={diagnostic.status}
                            key={`${diagnostic.document}:${diagnostic.status}`}
                          >
                            {diagnostic.document}: {diagnostic.status}
                          </span>
                        ))}
                        <Button
                          size="compact"
                          className="changes__revert"
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
              {structuralChanges.map((change) => (
                <div className="changes__group" data-test="dom-change" key={change.id} data-cid={change.target.sourceSite.cid}>
                  <div className="changes__group-title">
                    <span>{change.target.sourceSite.cid}</span>
                    <span className="changes__group-file">{sourceFile(change)}</span>
                  </div>
                  <div className="changes__row" data-test="dom-change-row" data-action={change.kind}>
                    <span className="changes__source-site" data-test="structural-source-site">Source site: {change.target.sourceSite.cid}</span>
                    <span className="changes__prop">{change.kind === "move" ? "Move in DOM" : "Delete from DOM"}</span>
                    <span className="changes__value">
                      <span className="changes__before">
                        {change.kind === "move"
                          ? structuralParentIdentityKey(change.source.parent) === structuralParentIdentityKey(change.destination.parent)
                            ? `${change.presentation.sourceParentTag} position ${change.presentation.fromIndex + 1}`
                            : `${structuralParentLabel(change, "source")} position ${change.presentation.fromIndex + 1}`
                          : "Visible"}
                      </span>
                      <span className="changes__arrow">→</span>
                      <span className="changes__after">
                        {change.kind === "move"
                          ? structuralParentIdentityKey(change.source.parent) === structuralParentIdentityKey(change.destination.parent)
                            ? `${change.presentation.destinationParentTag} position ${change.presentation.toIndex + 1}`
                            : `${structuralParentLabel(change, "destination")} position ${change.presentation.toIndex + 1}`
                          : "Removed"}
                      </span>
                    </span>
                    <span className="changes__scope" data-test="structural-scope">This rendered item only</span>
                    {getStructuralChangeDiagnostics(change.id).map((diagnostic) => (
                      <span
                        className="changes__diagnostic"
                        data-test="structural-diagnostic"
                        data-document={diagnostic.document}
                        data-status={diagnostic.status}
                        data-reason={diagnostic.reason}
                        key={`${diagnostic.document}:${diagnostic.status}:${diagnostic.reason ?? ""}`}
                      >
                        {structuralDiagnosticText(diagnostic)}
                      </span>
                    ))}
                    <Button
                      size="compact"
                      className="changes__revert"
                      data-test="dom-change-revert"
                      onClick={() => revertStructuralChange(change.id)}
                    >
                      Revert
                    </Button>
                  </div>
                </div>
              ))}
              <SketchChanges />
            </>
          )}
        </div>
      </details>
      {onClearSession ? (
        <div className="changes__session-action" data-test="session-actions">
          <Button
            variant="secondary"
            type="button"
            data-test="clear-session"
            onClick={onClearSession}
          >
            Clear Changes
          </Button>
        </div>
      ) : null}
    </>
  );
}
