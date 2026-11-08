import type { ReactElement } from "react";
import type { FlowStateBinding } from "../canvas/frameContent.ts";
import { flowStatusFor, useFlows } from "./flowsStore.ts";

/** Says on the frame itself when it could not reach its state, because the page below it would look plausible anyway. */
export function FlowFrameStatus({ binding }: { readonly binding: FlowStateBinding }): ReactElement | null {
  const { status, replaying } = useFlows();
  const key = `${binding.flowId}/${binding.stateId}`;
  const result = flowStatusFor(status, binding.flowId, binding.stateId);
  if (replaying.has(key)) return <div className="flow-frame-status" data-test="flow-frame-replaying">Reaching this state…</div>;
  if (!result || result.ok) return null;
  return <div className="flow-frame-status" data-tone="error" role="alert" data-test="flow-frame-error">{result.message ?? "This state could not be reached."}</div>;
}
