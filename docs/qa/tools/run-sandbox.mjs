// React (vite) sandbox battery: all dev routes on port 5173.
import { launch, finish } from "./harness.mjs";
import { runPage } from "./battery.mjs";

const BASE = "http://localhost:5173";
const SANDBOX = "react";

const PAGES = [
  ["index", "/"],
  ["playground", "/playground"],
  ["components", "/components"],
  ["component-props", "/component-props"],
  ["conformance", "/conformance"],
  ["examples-hub", "/examples"],
  ["examples-raw-css", "/examples/raw-css"],
  ["border-conformance", "/border-conformance"],
  ["color-conformance", "/color-conformance"],
  ["typography-conformance", "/typography-conformance"],
  ["spacing-conformance", "/spacing-conformance"],
];

const { browser, context } = await launch();
try {
  for (const [name, path] of PAGES) {
    await runPage({ context, sandbox: SANDBOX, url: `${BASE}${path}`, name });
  }
} finally {
  await browser.close();
  finish(SANDBOX);
}
