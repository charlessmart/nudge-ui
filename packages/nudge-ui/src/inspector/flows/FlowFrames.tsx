import { useState, type ReactElement } from "react";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { IconCopy, IconEye, IconEyeOff, IconPlus, IconRoute } from "@tabler/icons-react";
import type { FlowDefinition } from "../../transport/flows.ts";
import { flowStateOf } from "../canvas/frameContent.ts";
import { closeFlowCards, getFlowCards, openFlowCards, useCanvasCards } from "../canvas/canvasStore.ts";
import { copyToClipboard } from "../prompt/copyToClipboard.ts";
import { setSelectedElement } from "../selection/selectionStore.ts";
import { Button } from "../ui/Button.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { InspectorStyle } from "../ui/InspectorStyle.tsx";
import { showToast } from "../ui/Toast.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import { portalContainer } from "../ui/portalContainer.ts";
import { AddMenuIntro } from "../navigator/AddPageMenu.tsx";
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
      <Button variant="quiet" className="flows-panel__copy-prompt" data-test="flows-copy-prompt" onClick={() => void copyFlowPrompt().then((copied) => setCopyFailed(!copied))}>
        <IconCopy size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
        Copy prompt
      </Button>
      {copyFailed ? <p className="flows-panel__problem" role="alert">Could not copy the prompt.</p> : null}
    </>
  );
}

/** Adds flows from the Flows title: the coding agent maps them, so it offers the prompt that asks it to. */
export function AddFlowMenu(): ReactElement | null {
  const { load } = useFlows();
  const [open, setOpen] = useState(false);
  if (load !== "ready") return null;
  async function copy(): Promise<void> {
    if (await copyFlowPrompt()) setOpen(false);
    else showToast({ tone: "error", title: "Could not copy the prompt", description: "Allow clipboard access for this page, then try again." });
  }
  return (
    <BasePopover.Root open={open} onOpenChange={setOpen}>
      {/* Stays mounted while the menu is open: swapping the tooltip's wrapper away would remount the trigger the popover anchors to. */}
      <Tooltip content="Add flow" stableTrigger>
        <BasePopover.Trigger
          render={
            <IconButton
              variant="quiet"
              size="compact"
              label="Add flow"
              aria-haspopup="dialog"
              aria-expanded={open}
              data-test="flows-add"
            />
          }
        >
          <IconPlus size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" />
        </BasePopover.Trigger>
      </Tooltip>
      <BasePopover.Portal container={portalContainer()}>
        <BasePopover.Positioner className="add-page-menu__positioner" side="bottom" align="start" sideOffset={6}>
          <BasePopover.Popup className="add-page-menu" aria-label="Add flow" data-test="flows-add-menu">
            <AddMenuIntro text="Ask your agent to map flows." copyTestId="flows-copy-prompt" onCopy={() => void copy()} />
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}

/** Styles for the Flows section: its empty state, refused files and groups. */
export function FlowFramesStyle(): ReactElement {
  return <InspectorStyle testId="flows-panel-styles" css={flowsStyles} />;
}

/** Fills the Flows section until an agent maps a flow, and explains flow files the schema refuses. */
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
      <p>Ask your agent to map flows to show them on the canvas.</p>
      {load === "ready" ? <CopyPromptButton /> : null}
    </div>
  );
}

/** The flows an agent mapped, each with its states listed beneath it; a state opens as a live frame on the Canvas. */
export function FlowGroups({ activeCardId }: { readonly activeCardId: string | null }): ReactElement | null {
  const { flows, status, replaying } = useFlows();
  const cards = useCanvasCards();
  if (flows.length === 0) return null;

  function open(flow: FlowDefinition, stateId?: string): void {
    setSelectedElement(null);
    openFlowCards(flow, stateId);
  }

  const activeState = flowStateOf(cards.find((card) => card.id === activeCardId)?.content);

  return (
    <div className="flows-panel" data-test="flows-panel">
      <ul className="flows-panel__groups">
        {flows.map((flow) => {
          const isOpen = cards.length > 0 && getFlowCards(flow.id).length > 0;
          return (
            <li key={flow.id} className="flows-panel__flow" data-test="flows-flow" data-flow-id={flow.id}>
              <div className="flows-panel__header">
                <div className="flows-panel__title">
                  <IconRoute className="navigator__item-icon" size={14} stroke={1.8} aria-hidden="true" />
                  <span className="flows-panel__label">{flow.title}</span>
                </div>
                <Button
                  variant="quiet"
                  size="compact"
                  type="button"
                  className="flows-panel__toggle"
                  aria-label={`${isOpen ? "Hide" : "Show"} ${flow.title} on canvas`}
                  data-test="flows-toggle"
                  data-open={isOpen ? "true" : undefined}
                  onClick={() => isOpen ? closeFlowCards(flow.id) : open(flow)}
                >
                  {isOpen
                    ? <IconEyeOff size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" />
                    : <IconEye size="var(--icon-size-small)" stroke="var(--icon-stroke-width)" aria-hidden="true" />}
                  {isOpen ? "Hide" : "Show"}
                </Button>
              </div>
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
            </li>
          );
        })}
      </ul>
    </div>
  );
}
