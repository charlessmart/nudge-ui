import { IconHistory } from "@tabler/icons-react";
import { useState, type ReactElement } from "react";
import { Button } from "../ui/Button.tsx";
import { getLiveCardId, placeCheckpointOnCanvas, saveManualCheckpoint, useVersionHistory } from "./store.ts";
import { getFocusedCardId, getSelectedCardId } from "../canvas/canvasStore.ts";
import type { CheckpointOrigin } from "./model.ts";

function originLabel(origin: CheckpointOrigin): string {
  switch (origin.kind) {
    case "proposal": return "Proposal";
    case "comparison": return "Before";
    case "manual": return "Saved";
    case "implementation": return "Implemented";
  }
}

export function VersionHistoryPanel(): ReactElement {
  const history = useVersionHistory();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkpoints = [...history.checkpoints].reverse();
  const handoffByProposal = new Map(history.handoffs.map((handoff) => [handoff.proposalCheckpointId, handoff]));
  const resultCheckpointIds = new Set(
    history.handoffs.flatMap((handoff) => handoff.outcome.kind === "accepted" || handoff.outcome.kind === "review-needed"
      ? [handoff.outcome.resultCheckpointId]
      : []),
  );

  async function handleSave(): Promise<void> {
    const cardId = getLiveCardId(getSelectedCardId(), getFocusedCardId());
    if (!cardId || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await saveManualCheckpoint(cardId);
      if (!result.ok) setError(result.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="version-history" data-test="version-history">
      <summary>
        <IconHistory size="var(--icon-size-small)" aria-hidden="true" />
        Versions ({checkpoints.length})
      </summary>
      <div className="version-history__list">
        <div className="version-history__item">
          <span>
            Save the current draft without copying
            <small>Shared source · snapshots stay on the canvas as images</small>
          </span>
          <Button
            size="compact"
            variant="secondary"
            type="button"
            data-test="version-history-save"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving…" : "Save version"}
          </Button>
        </div>
        {error ? (
          <p className="copy-prompt__hint" data-test="version-history-error" role="status">
            {error}
          </p>
        ) : null}
        {checkpoints.length === 0 ? (
          <p className="copy-prompt__hint" data-test="version-history-empty">
            No versions yet. Copy a prompt or save a version to keep a visual checkpoint.
          </p>
        ) : checkpoints.map((checkpoint) => {
          const handoff = handoffByProposal.get(checkpoint.id);
          const isResult = resultCheckpointIds.has(checkpoint.id);
          return (
            <div className="version-history__item" key={checkpoint.id}>
              <span>
                {checkpoint.label} · {originLabel(checkpoint.origin)}
                <small>
                  {new Date(checkpoint.createdAt).toLocaleString()}
                  {handoff ? ` · ${handoff.transport === "agent" ? "sent to agent" : "copied"} · shared source` : null}
                  {isResult ? " · result" : null}
                </small>
              </span>
              <Button
                size="compact"
                variant="secondary"
                type="button"
                data-test={`version-history-place-${checkpoint.id}`}
                onClick={() => placeCheckpointOnCanvas(checkpoint.id)}
              >
                Place on canvas
              </Button>
            </div>
          );
        })}
      </div>
    </details>
  );
}
