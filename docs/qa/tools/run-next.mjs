// Next.js sandbox battery: /, /second, /pricing on port 5177.
import { launch, finish } from "./harness.mjs";
import { runPage } from "./battery.mjs";

const BASE = "http://localhost:5177";
const SANDBOX = "next";

const { browser, context } = await launch();
try {
  await runPage({ context, sandbox: SANDBOX, url: `${BASE}/`, name: "home", discoverPages: true });
  await runPage({ context, sandbox: SANDBOX, url: `${BASE}/second`, name: "second" });
  await runPage({ context, sandbox: SANDBOX, url: `${BASE}/pricing`, name: "pricing" });
} finally {
  await browser.close();
  finish(SANDBOX);
}
