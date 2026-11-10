import { NUDGE_FLOWS_DIRECTORY, NUDGE_FLOWS_STATUS_FILE } from "../../transport/flows.ts";

/** Prompt text that has a coding agent map the application's flows into files Nudge can load. */
export function flowAgentInstructions(origin: string): string {
  return `Map this application's key user flows for Nudge, a visual inspector running at ${origin}. Nudge shows each flow on its Canvas as a row of live frames of the real app, one per state. Do not change application source. Only write files under ${NUDGE_FLOWS_DIRECTORY}/.

Read the routes, screens, forms, data fetching and client state. Pick the flows a designer would review (onboarding, the core task, checkout, settings), up to about eight states each. Include the states that are hard to see by hand: loading, empty, error and success.

Write one ${NUDGE_FLOWS_DIRECTORY}/<flow-id>.json per flow:

{
  "version": 1,
  "id": "checkout",
  "title": "Checkout",
  "viewport": { "width": 390, "height": 844 },
  "states": [
    { "id": "cart", "label": "Cart", "tag": "default", "route": "/cart",
      "seed": { "localStorage": { "cart": "[\\"mug\\"]" } } },
    { "id": "declined", "label": "Card declined", "tag": "error", "route": "/checkout",
      "network": [{ "match": "POST /api/pay", "status": 402, "json": { "message": "Card declined" } }],
      "steps": [
        { "fill": { "role": "textbox", "name": "Name" }, "value": "Ada" },
        { "click": { "role": "button", "name": "Pay" } },
        { "waitFor": { "role": "alert" } }
      ] }
  ],
  "edges": [{ "from": "cart", "to": "declined", "label": "Pay" }]
}

How a state is reached, in the order to prefer:
1. "route": the same-origin path and query. Use this alone whenever the URL fully determines the screen.
2. "seed": localStorage and sessionStorage values for this frame only. Other frames never see them. Frames also start with a copy of the developer's own storage, so a state that must be signed out lists the keys to hide in "hideStorage" (* matches any run of characters, ["*"] hides everything). A seed is applied after hiding.
3. "network": mock responses, matched as "METHOD /path" with * as a wildcard. Fields: status, json or text, delayMs, hold (never answers, for loading states), passthrough.
4. "expectRoute": only when the route redirects on purpose (a signed-out visit to /chat lands on /login). Name the path the frame should end on; steps then run there.
5. "steps", run after the page loads: click, hover, fill with value, select with value, press with optional on, waitFor, waitMs. End a sequence with waitFor on what proves the state was reached.

Locators: prefer { "role", "name" }, then { "text" } or { "testId" }, and { "selector" } only as a last resort. Do not rely on source line numbers or generated class names.

Rules:
- ids are lowercase letters, digits and hyphens. Edge from and to must name states in the same file.
- Give each edge a short "label" naming what moves the user on: the button or link they press, or the response that sends them there ("Pay", "402"). The Canvas draws it on the arrow between the frames.
- Requests other than GET, HEAD and OPTIONS are blocked unless a network rule matches them, so replays cannot change real data. Mock each write. Mark a read-only POST such as a GraphQL query with passthrough. Set "allowMutations": true on a state only if I confirm it is safe.
- Mocks run in the browser, so they cannot change data a server renders before the page arrives. Reach those states with a route or query parameter, or list what you could not reach when you report back.
- Reads (GET, HEAD) that no rule matches go to the real server, with whatever the browser holds. Mock every read a state depends on. A seeded fake token will be refused by a real backend, and a state that asserts on text the real data does not contain fails for that reason, not because the screen is wrong.
- A path such as "GET /rest/v1/items" matches that path on every host. When the app calls a backend on another origin (Supabase, Firebase, an API on another port), write the host in the pattern, for example "GET https://*.supabase.co/rest/v1/items*", so a different service with the same path is not mocked by accident. The replay result lists a relative rule that answered another host's request.
- Connections to other origins (WebSocket, EventSource, realtime) are held in "connecting" and never reach the server, so live indicators will read as connecting. Set "allowRealtime": true on a state only if I confirm it is safe. Same-origin connections are untouched.
- Cookies belong to the browser and cannot be seeded, hidden or isolated per frame. If the app signs in with a cookie, tell me which states depend on it instead of assuming a frame is signed out.
- Do not put real credentials or personal data in these files. They are meant to be committed.

Nudge picks up changes within a couple of seconds. Tell me to open the Flows tab, and open each flow. Each time a frame replays, the result is written to ${NUDGE_FLOWS_STATUS_FILE}: ok, the failed step and its message, the writes that were blocked, mock rules that matched no request ("unusedRules"), reads that reached a real server ("passedThrough"), relative rules that answered another host ("foreignMatches") and held connections ("heldConnections"). An unused rule usually means the pattern is wrong; check it against passedThrough. Files that could not be parsed are listed in the Flows tab and at ${origin}/__nudge_ui__/flows under "errors". Read those, fix the recipes and repeat until every state is ok. You cannot open a browser from here, so you will not see a result until I do. Finish by listing the flows, and any states you could not reach and why.`;
}
