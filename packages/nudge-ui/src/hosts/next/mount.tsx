/** Server-rendered script, not a client effect: layouts with other client boundaries may never hydrate a component rendered beside `<body>`. */

import { NUDGE_UI_CLIENT_PATH, NUDGE_UI_MANIFEST_PATH } from "../../transport/index.ts";
import { DOCUMENT_HEAD_SCRIPT } from "../../inspector/canvas/documentHeadScript.ts";
import { REACT_RENDERER_CAPTURE_SCRIPT } from "../reactRendererCapture.ts";

/** The first child of the root layout's `<head>`: React DOM must find the DevTools hook it extends when it loads (ADR-0034). */
export function NudgeUiHead() {
  return <script data-nudge-ui-head="" dangerouslySetInnerHTML={{ __html: REACT_RENDERER_CAPTURE_SCRIPT }} />;
}

export function NudgeUiMount() {
  return (
    <>
      {/* A parser-inserted classic script runs as the HTML streams in, ahead of the app's async chunks in practice, so animation libraries read the clock the Inspection tool can slow. */}
      <script data-nudge-ui-clock="" dangerouslySetInnerHTML={{ __html: DOCUMENT_HEAD_SCRIPT }} />
      <script
        dangerouslySetInnerHTML={{
          __html: `window.addEventListener("error", function(event) {
  const target = event.target;
  if (target instanceof HTMLScriptElement && target.hasAttribute("data-nudge-ui-client")) {
    console.warn("[nudge-ui] inspector bootstrap failed to load.");
  }
}, true);`,
        }}
      />
      <script
        type="module"
        src={NUDGE_UI_CLIENT_PATH}
        data-nudge-ui-client=""
        data-nudge-ui-manifest={NUDGE_UI_MANIFEST_PATH}
      />
    </>
  );
}
