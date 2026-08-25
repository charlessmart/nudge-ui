// Astro sandbox battery: pages / and /about on port 4322.
import { launch, finish } from "./harness.mjs";
import { runPage } from "./battery.mjs";

const BASE = "http://localhost:4322";
const SANDBOX = "astro";

const { browser, context } = await launch();
try {
  await runPage({ context, sandbox: SANDBOX, url: `${BASE}/`, name: "index", discoverPages: true });
  await runPage({ context, sandbox: SANDBOX, url: `${BASE}/about`, name: "about" });
} finally {
  await browser.close();
  finish(SANDBOX.toLowerCase());
}
