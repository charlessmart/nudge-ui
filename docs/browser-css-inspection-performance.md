# Browser CSS inspection performance

An inspection refresh resolves the selected authored state and the primary
selection's stable cascade together. Controls read that completed snapshot;
they do not start inspections during render.

Container conditions are evaluated by `createContainerQueryEvaluator(document)`.
The refresh collects matching rules first, skips irrelevant ancestor declarations,
and prefetches the element/condition pairs needed by both cascades. One temporary
stylesheet contains all probes, including each rule's complete nested container
chain. Each pair has a unique marker and custom property. The evaluator reads all
results before removing the sheet and markers, including when a read fails.
Results are cached only within that synchronous refresh. Persistent resolved-row
caches are bypassed for matching container conditions so subsequent refreshes
observe changed container sizes.

## Measure inspection work

Add `perf=1` to the bookmarklet script URL, for example:

```text
http://127.0.0.1:5199/bookmarklet.js?surface=page&perf=1
```

Refresh the host page before loading a new bundle. In the host page's console:

```js
window.__nudgeUiPerformance.reset();
// Select, hover, or drag an element.
window.__nudgeUiPerformance.read();
```

Counters record refreshes, inspections, container checks (including cache hits),
unique probe pairs, and probe batches. Work is grouped by the most recent pointer
gesture: selection, hover, drag, or idle. This grouping correlates asynchronous
work with gestures; it does not establish which event caused a refresh. Reset
between gestures and allow scheduled work to complete before reading results.
Use `dispose()` to remove diagnostic listeners. Counters are disabled by default.

## Local comparison

A Chrome trace on a 3,000-item fixture with 24 container conditions recorded:

| Selection metric | Previous probes | Batched refresh |
| --- | ---: | ---: |
| Inspections | 4 | 2 |
| Probe pairs | 240 | 120 |
| Probe batches | 240 | 1 |
| Style recalculations | 245 | 4 |
| Style recalculation time | 151.8 ms | 3.5 ms |

These measurements describe the local fixture, not Envato. Recheck that host
with the rebuilt bookmarklet before adding a manual size-query parser. Native
batched evaluation currently handles size and style queries without duplicating
the browser's query semantics.
