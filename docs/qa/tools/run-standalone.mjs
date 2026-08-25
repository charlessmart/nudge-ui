// Raw HTML (standalone CLI) battery: prototype served on 4180.
import { launch, finish } from "./harness.mjs";
import { runPage } from "./battery.mjs";

const BASE = "http://127.0.0.1:4180";
const SANDBOX = "raw-html";

const { browser, context } = await launch();
try {
  await runPage({ context, sandbox: SANDBOX, url: `${BASE}/`, name: "index" });
} finally {
  await browser.close();
  finish(SANDBOX);
}
