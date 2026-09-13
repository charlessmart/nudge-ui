/**
 * Emits the development-only shared inspector client into a Next.js document.
 *
 * This is deliberately a server-rendered script rather than a client effect.
 * Root layouts that contain other client boundaries are not guaranteed to
 * hydrate a client component rendered beside `<body>`, but a module script in
 * the initial document is evaluated consistently before or during hydration.
 * The inspector UI and its private React graph remain in the external client
 * served by the sidecar, while transformed application components register the
 * host React Adapter through the page-global runtime seam.
 */
export function NudgeUiMount() {
  return (
    <script
      type="module"
      src="/__nudge_ui__/client.mjs"
      data-nudge-ui-client=""
      data-nudge-ui-manifest="/__nudge_ui__/manifest"
    />
  );
}
