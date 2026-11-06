import { useState, type ReactElement } from "react";
import { IconChevronDown, IconChevronRight, IconCopy, IconEye, IconEyeOff, IconRoute } from "@tabler/icons-react";
import { NUDGE_FLOWS_DIRECTORY, type FlowDefinition } from "../../transport/flows.ts";
import { flowStateOf } from "../canvas/frameContent.ts";
import { closeFlowCards, getFlowCards, openFlowCards, useCanvasCards } from "../canvas/canvasStore.ts";
import { copyToClipboard } from "../prompt/copyToClipboard.ts";
import { setSelectedElement } from "../selection/selectionStore.ts";
import { Button } from "../ui/Button.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { InspectorStyle } from "../ui/InspectorStyle.tsx";
import { showToast } from "../ui/Toast.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import { flowAgentInstructions } from "./agentInstructions.ts";
import { flowNotes } from "./flowNotes.ts";
import { flowStatusFor, useFlows } from "./flowsStore.ts";
import flowsStyles from "./FlowFrames.css?inline";

async function copyFlowPrompt(): Promise<boolean> {
  try {
    await copyToClipboard(flowAgentInstructions(window.location.origin));
    showToast({ title: "Prompt copied", description: "Paste it into your coding agent." });
    return true;
  } catch {
    return false;
  }
}

function CopyPromptButton(): ReactElement {
  const [copyFailed, setCopyFailed] = useState(false);
  return (
    <>
      <Button variant="secondary" data-test="flows-copy-prompt" onClick={() => void copyFlowPrompt().then((copied) => setCopyFailed(!copied))}>
        <IconCopy size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
        Copy prompt
      </Button>
      {copyFailed ? <p className="flows-panel__problem" role="alert">Could not copy the prompt.</p> : null}
    </>
  );
}

/** The flow prompt in the add-page menu, once flows exist; until then the empty state offers it. */
export function FlowPromptMenuButton(): ReactElement | null {
  const { load, flows } = useFlows();
  if (load !== "ready" || flows.length === 0) return null;
  async function copy(): Promise<void> {
    if (!await copyFlowPrompt()) showToast({ tone: "error", title: "Could not copy the prompt" });
  }
  return (
    <Button variant="quiet" size="compact" type="button" data-test="flows-copy-prompt" onClick={() => void copy()}>
      <IconRoute size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" />
      Copy flow prompt
    </Button>
  );
}

/** Styles for the flow intro and groups, which sit in different parts of the Frames view. */
export function FlowFramesStyle(): ReactElement {
  return <InspectorStyle testId="flows-panel-styles" css={flowsStyles} />;
}

/** Heads the Frames view until an agent maps a flow, and explains flow files the schema refuses. */
export function FlowsIntro(): ReactElement | null {
  const { load, flows, errors } = useFlows();
  if (load === "unavailable") {
    return <p className="flows-panel__empty">Update Nudge and restart the dev server to use flows.</p>;
  }
  if (flows.length > 0 || errors.length > 0) {
    return errors.length > 0 ? (
      <div className="flows-panel__errors">
        {errors.map((error) => (
          <p key={error.file} className="flows-panel__problem" role="alert" data-test="flows-file-error">
            <code>{error.file}</code> {error.message}
          </p>
        ))}
      </div>
    ) : null;
  }
  return (
    <div className="flows-panel__intro" data-test="flows-empty">
      <IconRoute size={20} stroke={1.6} aria-hidden="true" />
      <h3>No flows yet</h3>
      <p>Your agent maps them to <code>{NUDGE_FLOWS_DIRECTORY}</code>.</p>
      {load === "ready" ? <CopyPromptButton /> : null}
    </div>
  );
}

/** The flows an agent mapped, each a collapsible group of states that open as live frames on the Canvas. */
export function FlowGroups({ activeCardId }: { readonly activeCardId: string | null }): ReactElement | null {
  const { flows, status, replaying } = useFlows();
  const cards = useCanvasCards();
  // A flow on the Canvas starts expanded; the chevron overrides that either way.
  const [expandedOverrides, setExpandedOverrides] = useState<ReadonlyMap<string, boolean>>(new Map());
  if (flows.length === 0) return null;

  function open(flow: FlowDefinition, stateId?: string): void {
    setSelectedElement(null);
    openFlowCards(flow, stateId);
  }

  function toggle(flowId: string, expanded: boolean): void {
    setExpandedOverrides((previous) => new Map(previous).set(flowId, !expanded));
  }

  const activeState = flowStateOf(cards.find((card) => card.id === activeCardId)?.content);

  return (
    <div className="flows-panel" data-test="flows-panel">
      <ul className="flows-panel__groups">
        {flows.map((flow) => {
          const isOpen = cards.length > 0 && getFlowCards(flow.id).length > 0;
          const expanded = expandedOverrides.get(flow.id) ?? isOpen;
          return (
            <li key={flow.id} className="flows-panel__flow" data-test="flows-flow" data-flow-id={flow.id}>
              <div className="flows-panel__header">
                <button
                  type="button"
                  className="flows-panel__expander"
                  data-test="flows-expander"
                  aria-label={`${expanded ? "Collapse" : "Expand"} ${flow.title}`}
                  aria-expanded={expanded}
                  onClick={() => toggle(flow.id, expanded)}
                >
                  {expanded ? <IconChevronDown size={12} aria-hidden="true" /> : <IconChevronRight size={12} aria-hidden="true" />}
                </button>
                <button type="button" className="flows-panel__title" onClick={() => toggle(flow.id, expanded)}>
                  <IconRoute className="navigator__item-icon" size={14} stroke={1.8} aria-hidden="true" />
                  <span className="flows-panel__label">{flow.title}</span>
                </button>
                <Tooltip content={isOpen ? "Hide on canvas" : "Show on canvas"}>
                  <IconButton
                    variant="quiet"
                    size="compact"
                    label={`${isOpen ? "Hide" : "Show"} ${flow.title} on canvas`}
                    data-test="flows-toggle"
                    data-open={isOpen ? "true" : undefined}
                    onClick={() => isOpen ? closeFlowCards(flow.id) : open(flow)}
                  >
                    {isOpen
                      ? <IconEyeOff size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" />
                      : <IconEye size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" />}
                  </IconButton>
                </Tooltip>
              </div>
              {expanded ? (
                <ul className="flows-panel__states">
                  {flow.states.map((state) => {
                    const result = flowStatusFor(status, flow.id, state.id);
                    const running = replaying.has(`${flow.id}/${state.id}`);
                    const tone = running ? "running" : !result ? undefined : result.ok ? "ok" : "error";
                    const active = activeState?.flowId === flow.id && activeState.stateId === state.id;
                    return (
                      <li key={state.id}>
                        <button
                          type="button"
                          className="flows-panel__state"
                          data-test="flows-state"
                          data-state-id={state.id}
                          data-active={active ? "true" : undefined}
                          onClick={() => open(flow, state.id)}
                        >
                          <span className="flows-panel__dot" data-tone={tone} />
                          <span className="flows-panel__label">{state.label}</span>
                          {state.tag ? <span className="flows-panel__tag">{state.tag}</span> : null}
                        </button>
                        {result && !result.ok && !running ? <p className="flows-panel__problem" role="alert">{result.message}</p> : null}
                        {result?.blocked.length ? (
                          <p className="flows-panel__blocked" data-test="flows-blocked" title={result.blocked.join("\n")}>
                            {result.blocked.length === 1 ? "Blocked 1 write" : `Blocked ${result.blocked.length} writes`}
                          </p>
                        ) : null}
                        {result && !running ? flowNotes(result).map((note) => (
                          <p key={note.test} className="flows-panel__blocked" data-test={note.test} data-tone={note.tone} title={note.items.join("\n")}>
                            {note.text}
                          </p>
                        )) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
