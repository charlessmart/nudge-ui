/** Server-rendered script, not a client effect: layouts with other client boundaries may never hydrate a component rendered beside `<body>`. */

import { NUDGE_UI_CLIENT_PATH, NUDGE_UI_MANIFEST_PATH } from "../../transport/index.ts";
export function NudgeUiMount() {
  return (
    <>
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
