/**
 * `@nudge-ui/css` — shared, browser-safe CSS/token knowledge.
 *
 * Root entry re-exports the browser-safe subpaths only. The Node/build-time
 * token-inventory subpath arrives in Stage 2 and must NOT be reachable from
 * this entry so importing value semantics cannot pull PostCSS or filesystem
 * assumptions into the inspector bundle.
 */
export * from "./model/index.ts";
export * from "./value-semantics/index.ts";
