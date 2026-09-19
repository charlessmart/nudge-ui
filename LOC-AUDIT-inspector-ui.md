# LOC-reduction audit — `packages/nudge-ui/src/inspector/` UI layer

Scope: `styleEditors/ canvas/ shell/ tokens/ changes/ prompt/ inline-text/ projection/ agent/`
(`hosts/`, `css/`, `compiler/` excluded — other agents). Every non-test file in all nine directories was read in full by me or by a dedicated deep-read pass; every claim below carries a `file:line`.

**Headline: this subsystem cannot be halved behavior-preservingly.** Realistic total is **~2,900–4,200 lines of 45,653 (~6–9 %)**: **~1,850–2,600 src** of 25,087 (7–10 %) and **~1,000–1,600 test** of 20,566 (5–8 %). ~580 of that is deletion of verified dead code. Everything else is 3–13 % per directory. The remaining ~90 % is either distinct domain logic, a documented wire/security boundary, or deliberate defensive validation. Reaching ~50 % requires deleting features (see §d).

---

## (a) Quantitative map

### Whole `inspector/`

| subdir | src | #src | test | #test | total |
|---|---:|---:|---:|---:|---:|
| canvas | 6027 | 28 | 4771 | 21 | 10798 |
| styleEditors | 5515 | 34 | 4333 | 20 | 9848 |
| tokens | 4307 | 17 | 3942 | 9 | 8249 |
| projection | 2322 | 7 | 1548 | 5 | 3870 |
| changes | 2303 | 12 | 1191 | 5 | 3494 |
| shell | 1945 | 15 | 1287 | 4 | 3232 |
| agent | 2297 | 7 | 749 | 3 | 3046 |
| inline-text | 1394 | 3 | 1566 | 2 | 2960 |
| **9-dir subtotal** | **24110** | **123** | **19387** | **69** | **43497** |
| ui | 2334 | 33 | 481 | 2 | 2815 |
| componentSemantics | 1541 | 11 | 1089 | 5 | 2630 |
| overlay | 1509 | 13 | 884 | 6 | 2393 |
| prompt | 977 | 7 | 1179 | 4 | 2156 |
| inspection | 1063 | 5 | 861 | 6 | 1924 |
| conformance | 1734 | 6 | 158 | 5 | 1892 |
| runtime | 760 | 6 | 783 | 7 | 1543 |
| selection | 808 | 8 | 579 | 5 | 1387 |
| (root) | 614 | 7 | 235 | 3 | 849 |
| session | 274 | 4 | 119 | 2 | 393 |
| settings | 370 | 2 | 0 | 0 | 370 |
| spacing | 206 | 1 | 79 | 1 | 285 |
| \_\_stubs\_\_ | 87 | 2 | 41 | 1 | 128 |
| **inspector total** | **38387** | **228** | **25875** | **116** | **64262** |

The nine target dirs **including `prompt/`** = **25,087 src + 20,566 test = 45,653**. CSS inside them: **2,272 lines / 20 files** (styleEditors 813, shell 556, tokens 299, canvas 281, agent 232, prompt 91) — see §c.5.

### Largest source files

| file | LOC | category | what it actually is |
|---|---:|---|---|
| `tokens/resolution.ts` | 1610 | cascade + matching + cache | **zero `switch`/`case`**; all property-family decomposition goes through one interpreter (`interpretValue`, called at `:349,:398,:443`). 190 comment / 102 blank lines encoding cache-invalidation contracts |
| `inline-text/inlineTextEditor.ts` | 1360 | contenteditable session controller | ~200 LOC Range/Selection, ~46 LOC registration, ~215 LOC handlers, ~450 LOC lifecycle/intent |
| `styleEditors/LayoutSection.tsx` | 848 | 10 sub-components in one file | size/flex/grid/align/inset editing |
| `projection/textProjection.ts` | 812 | text projection + report ledger | ~155 LOC of ledger parallel to `structuralProjection` + `renderedInstance` |
| `agent/client.ts` | 785 | class-based transport state machine | **zero `fetch(`, zero `new URL(`, zero `EventSource`** |
| `tokens/TokenField.tsx` | 761 | React field | `TokenField` (139) delegating to `TokenValueField` (355) + helpers |
| `projection/structuralProjection.ts` | 691 | structural projection + legality | ~156 LOC of the same ledger |
| `canvas/agentPresentation.ts` | 599 | readiness handshake + command switch | **not** a data table |
| `canvas/sessionStore.ts` | 570 | persistence + defensive validation | own `isRecord`/`hasOnlyKeys`/`isSameOriginUrl` |
| `canvas/canvasStore.ts` | 561 | store + camera math | card-creation prologue ×4; own store plumbing |
| `tokens/resolution/cssomCollector.ts` | 559 | CSSOM walker + observer | two duped char scanners |
| `styleEditors/BorderEditor.tsx` | 558 | border domain | 166 LOC of border-presence heuristics (`:32-197`) |
| `shell/InspectorShell.tsx` | 544 | panel orchestration | 8 near-identical editor invocations `:502-509` |
| `changes/codecs.ts` | 515 | wire serialization | the same field set enumerated **3× per kind, ×4 kinds** |
| `agent/httpTransport.ts` | 376 | network adapter | 4 near-identical POST blocks; 6 endpoint guards |
| `projection/renderedInstance.ts` | 359 | instance identity + ledger | **36 % of the file is ledger** (`:180-254,:293-359`) |
| `shell/CopyPromptButton.tsx` | 287 | panel + store | 2 raw `useSyncExternalStore` triples; `label`/`icon` are parallel ternaries over the same predicates |
| `shell/ChangesLog.tsx` | 277 | panel + store | 4 raw `useSyncExternalStore` triples (20 lines) |

### Test shape

- In the 9 dirs: 20,566 test LOC. `beforeEach`/`afterEach`/`beforeAll` blocks = **1,888 (9.1 %)**; blank+import = **2,763 (13.4 %)**; object-literal fixture fields = **848 (4.1 %)**. 1,167 `it()` blocks in the whole inspector ⇒ ~22 LOC/case; only **27** `it.each` uses.
- 21 test files hand-write `document.body.innerHTML = ""` setup; 20 re-implement managed-stylesheet teardown; 14 set `IS_REACT_ACT_ENVIRONMENT`; 9 hand-roll `createRoot`/`act` mounting (`CanvasCard`, `CanvasElementOverlay`, `ChangesLog`, `CopyPromptButton`, `McpConnectionDialog`, `TokenDropdown`, `ui.test`, `sessionContext`, `useBrowserCssInspection`).
- 43 source files ≤80 LOC carry **1,143 test LOC** (1.3× their source): `canvas/normalizeUrl.ts` 34/104, `canvas/linkEligibility.ts` 67/171, `canvas/rendererCidIndex.ts` 27/62, `prompt/copyToClipboard.ts` 33/59.
- Two of the three existing `_testUtils.ts` files are correctly shared and are **not** the problem: `changes/_testUtils.ts` (32 LOC) is reused by `prompt/` and `projection/` tests; `styleEditors/_testUtils.ts` (140) is imported by 22 test files — it just ships no lifecycle helper.
- **Constraint:** `oxlint.config.ts:27` sets `anti-slop/no-module-mocking: "error"` with no test override, which is why tests drive the *real* `workspaceChangeStore`. Fixture factories — not shared fake stores — are the correct test reduction.

---

## (b) Ranked reduction opportunities

Tiers: **T0** = verified dead code (no behaviour surface). **T1** = mechanical / diff-verified. **T2** = real abstraction change.

| # | Tier | Opportunity | Files (evidence) | Saved | Risk |
|---|---|---|---|---|---|
| 1 | T0 | **Delete dead `TokenDropdown`.** Verified: only its own test imports it; absent from `package.json#exports`; referenced only by `package.json:83` and `vitest.unit.config.ts:7` | `tokens/TokenDropdown.tsx` (115) + `.test.tsx` (275) + `.css` (5) + `ui/styles.ts:26,61` | **395** | none |
| 2 | T0 | **Delete dead `InsetSection`.** Zero non-test importers repo-wide; doc comment promises callers that don't exist; it is a 6-line wrapper over the already-exported `SpacingField` (`SpacingBox.tsx:108`) | `styleEditors/InsetSection.tsx` (40) + `.test.tsx` (89) | **129** | none |
| 3 | T0 | **Delete 5 zero-caller compatibility wrappers**: `const r = store.X(); if (r) project(store.getSnapshot()); return r;` — production calls `workspaceChangeStore.*` directly (`changesLog.ts:149,209,216,234,246`) | `changes/workspaceChanges.ts:270-300` | **31** | none |
| 4 | T0 | Delete dead compatibility re-export (0 importers) | `conformance/projection.ts` (16) | **16** | none |
| 5 | T0 | Drop unreachable preset tables: `presets` is read only in the non-`inputOnly` branch (`LayoutComboField.tsx:201-219`), and all three call sites pass `inputOnly` | `styleEditors/LayoutSection.tsx:35-37` | **6** | none |
| 6 | T2 | **Schema-drive `changes/codecs.ts`.** Per kind the field set is enumerated **three times** — `hasOnlyKeys([...])`, a `typeof value.x ===` chain, a serialize literal — and again in deserialize: 4 serializers + 4 deserializers (`:203-369`, 153 LOC) where **the text pair `:261-283`↔`:347-369` differs only by the return annotation**, plus 56 LOC of shadow interfaces `:43-101`, plus 8 helper validators `:412-499`. One `FieldSpec[] {key,required,check}` + generic validate/encode/decode; alias `SerializableChange = ChangeRecord` | `changes/codecs.ts` (515), `changes/editModel.ts:112-181` | **100–160** | **med-high** |
| 7 | T1 | **One renderer→parent send helper.** 24 sites repeat `getRendererIdentity()` → guard → `{type, protocolVersion: PROTOCOL_VERSION, payload, ...identity}` → `sendToParent()` | `canvas/rendererBootstrap.ts`, `rendererElementSelector.ts`, `rendererStylesheet.ts`, `canvas/frameProtocol.ts` | **90–140** | medium |
| 8 | T1 | **`bindEvents` symmetry in the inline editor.** Teardown `:794-816` unrolls 23 `removeEventListener`; setup `:1247-1267` lists 18 `addEventListener` + a loop for 6 capture events — **the two lists have already drifted**, which is the evidence. Also `reject(reason,message)` factory (12 five-line `{kind:"rejected"…}` literals at `:532,540,548,556,564,572,1291,1298,1316,1323,1339,1352`), one `guardSessionStart()` (3 + 2 preamble copies), one commit/cancel keydown block, `focusSafely` | `inline-text/inlineTextEditor.ts` | **90–115** | low |
| 9 | T1 | **`changes/` non-codec cleanup**: `afterWorkspaceMutation()` for the 7× `reapply(...)`+`markForVerification(…)` pairs (`changesLog.ts:151-218`); `undo` `:208-213` ≡ `redo` `:215-220` modulo one call; delete the 5-line `reconcileVerifiedChanges` passthrough `:176-180`; `dropDiagnostics(predicate)` for the 3 identical sweeps (`previewDiagnostics.ts:76-83,96-103,152-160`); `textTargetKey(target,{includeBeforeText})` for `textStableIdentity:124-133` vs `changeKey` text branch; hoist `isRecord`/`hasOnlyKeys`/`isNonNegativeSafeInteger` (byte-identical in `editModel.ts:188-198` and `codecs.ts:501-515`) | `changes/` | **80–115** | low |
| 10 | T1 | **Projection mechanical items**: `createDocumentProjectionAdapter(doc, applyManagedStyles)` for the 4/5-shared method literals (`workspaceProjection.ts:94-103` ≡ `rendererStylesheet.ts:55-64`); `ensureStyleElement(doc,id)`+`writeStyleText` (`managedStylesheet.ts:57-63` ≡ `rendererStylesheet.ts:43-49` ≡ `shell/panelLayout.ts:11-17`); one boundary-guard module for 3 inline `hasOnlyKeys`; `sourceSiteCandidates()` (`textProjection.ts:291-299` ≡ `renderedInstance.ts:59-67`); `ResolutionResult` ×2; intra-file prune dup (`structuralProjection.ts:292-297`→`:622-631`); drop the `escapeAttrValue` alias | `projection/`, `shell/panelLayout.ts` | **65–90** | low |
| 11 | T1 | **`agent/` plumbing.** `send(key,path,{method,body,query,signal})` for 4 near-identical POST blocks (`httpTransport.ts:243-248,320-325,346-351,360-369`) + 6 endpoint guards `:225,242,269,319,345,359`; one `resetConnection()` for the **6 byte-identical 4-line connection resets** (`client.ts:252-255,325-328,514-517,523-526,643-646,694-697`); `runAbortable(slot,fn)` for the 4 abort/try/catch/finally skeletons `:263-294,348-389,434-458,495-536`; `withStoredSession` for the storage triple `:98-134` | `agent/` | **50–75** | low-med |
| 12 | T1 | **`tokenGroup`/guard/tokenizer de-dup in tokens/**: import `splitTopLevel` from `css/value-semantics/cssSyntax.ts:51-70` instead of the byte-duplicated copies; delete `collectLocalAliases` (67 lines, exactly one caller at `:1140` inside the test-only `resolveRuleFixture`, duplicating `:956-993`); one revision-memo helper for the 7 hand-written cache-hit tests; `editActions.baseRecord` for the 9 shared fields (`:126-140` ≡ `:211-227`); lift `TokensPanel`'s `effectiveRows` out of the per-row loop (`:89-92`, also fixes O(n²)) | `tokens/resolution.ts`, `resolution/selectorSemantics.ts`, `editActions.ts`, `TokensPanel.tsx` | **140–205** | low |
| 13 | T1 | **`cssomCollector` scanner merge** — `findTopLevelColon:354-382` duplicates the quote/escape/paren/bracket/brace loop of `parseCssomDeclarations:327-349`; 2 identical `out.push` blocks (`:466-476` ≡ `:485-495`); @media/@supports regexes computed twice | `tokens/resolution/cssomCollector.ts` | **30–45** | low |
| 14 | T1 | **One external-store primitive.** `new Set<() => void>` + subscribe + notify is hand-rolled **18×** repo-wide (4 in scope: `canvasStore:65`, `projection:47`, `projection:186`, `workspaceLease:81`); no factory exists anywhere. Same for the revision channel + the 11+6+11 hand-written `useSyncExternalStore(s,g,g)` wrappers (`shell/openStore.ts:34-36`, `ChangesLog.tsx:99-120`, `CopyPromptButton.tsx:53-62`) | `canvas/`, `shell/`, `projection/`, `prompt/clipboardHandoff.ts`, `changes/previewDiagnostics.ts` | **60–105** | low |
| 15 | T1 | **Table-drive the 12 inline side/axis SVG indicators.** Three copies of "rect + line, 4 orientations" differing only in coordinates (e.g. padding-left `rect(3,3,18,18)/line(6.75,7)` vs margin-left `rect(7,5,14,14)/line(3,5)`) | `styleEditors/SpacingBox.tsx:214-294` (80) + `ui/SideValuesField.tsx:228-262` (35) | **70–85** | low |
| 16 | T1 | **Canvas store + protocol + geometry**: `createCard()` for the 4× `lastUsedCardSize ?? defaultViewportSize()` → `computeNewCardPosition` → `card-${++cardIdCounter}` prologue; merge `updateCardTitle`/`updateCardUrl`; delete the 23-line identity `ownValue` switch + `ProtocolObject` (`frameProtocol.ts:390-440`) and collapse 4 report guards `:303-352`; one affine projection for the 5 copies of `left + x*zoom, top + y*zoom`; one `buildReplaceStylesMessage` (`projection.ts:113-125` ≡ `:259-271`); one `sendToCardFrame` for 4 `postMessage(…, origin)`; merge the duplicated element lookup (`rendererSelectionProxy.ts:24-37` ≡ `CanvasElementOverlay.tsx:87-97`); the 3× route literal in `agentPresentation.ts:188-198,328-332,383-387`; `openStore`'s listener set | `canvas/` | **185–275** | low-med |
| 17 | T1 | **`styleEditors` mechanical**: one `PropertyTokenField` for the 4 `ControlSurface > TokenField` blocks (`BoxShadowEditor:27-45`, `AspectRatioField:34-50`, `GapField:36-58`, `LayoutSection:313-334`); one `EditorSection` shell (the `editor__title` + wrapper block is hand-written in **12 files / 21 occurrences**) + delete the verbatim add/remove toggle pair (`BorderEditor:349-369` ≡ `ColorPicker:95-115`); one `SettingsMenu` over `PopoverListbox` for the 3 sites repeating inert `query=""` + `onQueryChange={() => undefined}` + check-mark logic; one draft-text-input machine (`GridValueField:45-108` ≡ `GridChildSection:49-105`); 7-row table for `EmptyState.tsx:22-28` | `styleEditors/` | **200–290** | low-med |
| 18 | T1 | **`shell/` mechanical**: fold `AppShell.tsx` (16, pure passthrough that recomputes a value already computed at `InspectorShell.tsx:115`) into `InspectorShell`/`index.ts`; spec-array for the 8 editor invocations `InspectorShell.tsx:502-509`; derive `CopyPromptButton`'s `label` (`:137-147`) and `icon` (`:149-155`) from one discriminant instead of two 6-branch ternaries over the same predicates | `shell/` | **31–41** | low-med |
| 19 | T1 | **`prompt/`+`agent/` small**: delete `boundedEvidence` (`generatePrompt.ts:192-194` — a **pure alias** of `boundRuntimeEvidence`); shared `semanticEvidenceLines` (evidence pair duplicated 3× at `:178-179`/`:227-228`/`:412-413`); one `refKey()` for `:204-213` vs `:312-321` (differ by one field); alias the 3 byte-identical `protocol.ts:95-118` interfaces and reuse exported `PairingRequest`/`PromptDispatchRequest`; one `copy(text,kind,errorMessage)` + `copied: union\|null` for the 3 parallel `copied*` booleans in `McpConnectionDialog.tsx:112-114,149-180` | `prompt/`, `agent/` | **39–63** | low |
| 20 | T2 | **Projection document-report ledger.** Beyond #14, `textProjection`, `structuralProjection` and `renderedInstance` each define the same ledger: `notifyDiagnostics`, `sameReports`, `storeReports`, `reportsForSnapshot`, `scheduleValidation`, `getDocumentState` + MutationObserver install, `recordCanvas…Reports`, `clearCanvas…Reports`, `get…Diagnostics`, `reset…`, `prune…` (~310 parallel lines across the three). `storeReports` is **byte-identical** at `textProjection.ts:494-497` ≡ `structuralProjection.ts:387-390` ≡ `renderedInstance.ts:197-200`; `clearCanvas*` is byte-identical 4 lines. One `createDocumentReportLedger<P,A,R>(cfg)` with `reportId`/`reportOf`/`toStatus`/`snapshotKey` hooks. **Prototype on `renderedInstance.ts` (359 LOC) first.** | `projection/` | **75–125** | medium |
| 21 | T2 | **Collapse the 3 near-identical element-resolution pipelines** in `resolution.ts` (`:1345-1374` / `:1465-1522` / `:1578-1610`): the 4-line tail, the 14-line computed/confidence loop (differs only by the `state==="base" \|\| !prop.resolvedValue` guard), the `rowsFromMatches` triple and the cache hit+store blocks all repeat | `tokens/resolution.ts` | **85–125** | medium |
| 22 | T2 | **Token-field internals**: 2 probe-span color paths (`:183-191`/`:197-201`), 2 alpha derivations (`:271-275`/`:296-300`), 2 nudge-key handlers (`:391-424`/`:451-471`); `tokenGroup:95-97` ≡ `catalog.ts:164-166`; `formatNumber:128-130` ≡ `nudgeValue.ts:86` | `tokens/TokenField.tsx` | **35–55** | medium |
| 23 | T2 | **Shared property-field context.** 42 editor element usages carry **317 JSX props (avg 7.5)**; ~205 are the same plumbing (`domElement`/`editTarget`/`selection`/`onAfterEdit`/`revision`/`entries`/`tokenRows`) as standalone lines in `styleEditors` alone, and the interfaces repeat `onAfterEdit?: () => void` ×29, `selection?: StyleSelection \| null` ×22, `domElement: HTMLElement` ×18, `editTarget?: EditTarget` ×14 | `styleEditors/` (+ `shell/InspectorShell.tsx:502-509`) | **150–250** | medium |
| 24 | T2 | **Shared JSON guard module** for `isRecord` (10 definitions repo-wide; 5 in scope: `sessionStore:56`, `agentPresentation:140`, `editModel:188`, `codecs:501`, `httpTransport:29`) and `hasOnlyKeys` (7) | new `guards.ts` | **25–40** | low + **policy** (see caveat) |

**Subtotals.** T0 = **577** (213 src + 364 test). T1 = **1,073–1,517 src**. T2 = **580–885 src**. T1+T2 = **1,653–2,402 src of 25,087 (6.6–9.6 %)**; total with T0 = **1,866–2,615 (7.4–10.4 %)**.

### Caveat that must be budgeted, not assumed away

`oxlint.config.ts:31-34` sets `anti-slop/no-unknown-parameters`, `no-unknown-returns` and `no-unsafe-dictionary-type` to **error** repo-wide, with a 29-file override list (`:38-68`) downgrading them to `warn` for the files that legitimately parse untrusted data — the boundary files (`projection/textProjection.ts`, `renderedInstance.ts`, `structuralProjectionBoundary.ts`, `agent/httpTransport.ts`, `verification.ts`, `prompt/clipboardHandoff.ts`, `canvas/frameProtocol.ts`, `canvas/sessionStore.ts`, …). The `isRecord`/`hasOnlyKeys` duplication is largely a **consequence of that per-file allowlist**. `pnpm exec oxlint --config oxlint.config.ts` currently reports **42 errors + 65 warnings** across the six analysed dirs, 31 of them in `changes/codecs.ts` + `editModel.ts` (which are *not* allowlisted). So #24 and #14 need an `oxlint.config.ts` override entry for the new shared module — a policy edit, not a pure refactor. It still reduces the violation count (4 copies → 1), which is the argument for doing it.

### Test-side reductions

| # | Opportunity | Evidence | Saved |
|---|---|---|---:|
| T1 | **Shared app-host lifecycle helper.** 21 files hand-write `resetPendingRules` → remove `#nudge-ui-styles` → `innerHTML=""`; `styleEditors/_testUtils.ts` is already imported by 22 test files but ships no lifecycle helper | `styleEditors/`, `canvas/`, `shell/` tests | 250–350 |
| T2 | **Fixture factories.** No `ResolvedProperty`/`TokenEntry` factory exists repo-wide (40 `: TokenEntry = {` literals / 20 files; 281 raw fixture field lines in `styleEditors`; `evidence: { reason: "test fixture" }` ×16 in `BorderEditor.test.tsx`). `GapField.test.tsx:29-40` already shows the local fix. `generatePrompt.test.ts` has 26 `sourceSite:`, 25 `locator:`, 9 `presentation:` literals inside `StructuralChange` fixtures → a `ref(cid,src,text,extra)` saves 150–200 there alone | all | 200–380 |
| T3 | **Two independent `AgentBridgeTransport` fakes**: `ButtonTransport` (`CopyPromptButton.test.tsx:53-89`) and `FakeTransport` (`client.test.ts:34-90`) implement the same 4 methods; `listeningStatus()` ≡ `status()`, `flush()` ≡ `flush()`. Also `verification.test.ts:52-55` ≡ `clipboardHandoff.test.ts:39-42` rAF stub, and near-identical `styleChange` factories | `agent/`, `prompt/` tests | 80–110 |
| T4 | **`it.each` conversions**: `rendererStylesheet.test.ts:35-243` (208-line pure table over `makeMsg` overrides + expected `reason`, 17 tests); `resolution.test.ts` border-radius cluster `:1797-1840`, leaf/null cluster `:809-891`, inherited pair `:1028-1068`; `cssomCollector.test.ts` at-rule pair `:70-107` + observer quartet; `catalog.test.ts` classify block | canvas, tokens | 350–500 |
| T5 | **Generalize `mockComputedStyle`** (flat-record only today) so the 6 independent `window.getComputedStyle` monkeypatches in `LayoutSection.test.tsx:293-571` (~95 lines) collapse; add `typeInput()` without blur (the native-setter boilerplate is hand-rolled 6× because `_testUtils.ts:108 setInputValue` always blurs) | `styleEditors/` | 95–125 |
| T6 | **Add `canvas/_testUtils.ts`** — `makeElementChange`/`makeTokenChange` are re-declared in `staleChangeDetector.test.ts:33-70`; the `[attr="v"]` regex parser is verbatim-duplicated at `:69-85` and `:98-113`; there is no canvas fixture module although `changes/_testUtils.ts` exists. Plus shared React mount harness for the 9 files hand-rolling `createRoot`/`act` | `canvas/` | 110–165 |
| T7 | Delete vacuous assertions: 7 `TokenField.test.tsx` tests call `selected.domElement.remove()` without ever passing `domElement`; `SpacingBox.test.tsx:75-131` asserts raw SVG coordinates that become vacuous once #15 lands | tokens, styleEditors | 20–30 |

**Test total: ~1,000–1,600 of 20,566 (5–8 %).** Worth stating plainly: only 9.1 % of test lines sit in setup blocks, so the conservative floor really is ~1,000. The value semantics are per-property (`line-height "1.6"→"160%"`, `aspect-ratio` must not gain `px`, `opacity "0.6"→"60%"`, border `0 solid` suppression), so a generic "renders label / writes on change" contract suite would assert nothing the real tests exist for. `resolution.test.ts` (1,868) and the `conformance/*Cases.ts` corpora are intentionally exhaustive cross-products.

---

## (c) What cannot shrink (and why)

1. **`styleEditors/BorderEditor.tsx:32-197` — 166 LOC of border-presence semantics.** Tailwind preflight `border: 0 solid`, structured `width|style|color` decomposition, per-face painted detection, `isZeroWidthValue` splitting authored forms. Five dedicated tests pin it. `valuesAreLinked`/`sideComponentSignature`/`borderLinkDeclaration` are its dialect; `BorderRadiusEditor`'s 20-line analogue is **not** the same shape, and a merged schema would re-encode both dialects as flags.
2. **`tokens/resolution.ts:936-1343` — cascade and inheritance.** `resolveLineage` nearest-wins custom-property inheritance, `var()` fallback cycling, `resolveInheritedProperties`, exact-vs-probable confidence, `computeSpecificityCore`, `isElementSensitiveSelector`, plus a load-bearing cache contract: `disposeDocumentResolution:92-107` deliberately bumps revision monotonically because resetting to `(0,0)` resurrects stale caches. The 190 comment lines are that contract, not padding.
3. **`inline-text/inlineTextEditor.ts` (~1,000 of 1,360).** Every branch encodes a documented browser quirk: the empty-first-child Chromium caret bug `:618-624`, IME Enter/Escape ownership `:862-869`, deferred blur commit `:898-906`, `beforeinput` target-ranges `:919-924`, `History` patching `:1098-1119`, host-ownership/restore-draft invariants `:343-377`. Per-input-type handling is **already** table-driven (`ALLOWED_INPUT_TYPES:410-420`), so there is no repetitive branch family to collapse. Only the registration symmetry (#8) is a real win.
4. **`projection/` policy (~900).** Text safety model `textProjection.ts:233-289`, exact-text-node resolution `:207-231`, marker codec `:97-145`, empty-affordance lifecycle `:382-477`; structural containment/legality `structuralProjection.ts:43-131`; evidence-only identity refusal `renderedInstance.ts:95-112`; CSSOM rehydration back-off `managedStylesheet.ts:128-180`. The reversal mechanisms differ fundamentally (structural reverses application order via a `Comment` placeholder `:437,481`; text restores in place from a marker `:517-534`), so a unified "apply/revert" abstraction would be fake. `normalizedText` looks duplicated but is **not** (`textProjection.ts:172-174` vs `renderedInstance.ts:55-57` with `.slice(0,120) || null`).
5. **`canvas/` lifecycle + wire compatibility (~2,600–3,000).** `workspaceLease.ts` heartbeat/expiry/storage race; `rendererBootstrap.ts` owner/teardown + `history.pushState` patching `:96-119`; a 27-member version-gated message union that must keep rejecting old shapes; the `r\d+`/cid/src/realm element-identity triple check (a security boundary that must fail closed); `sessionStore.ts` ~200 lines of deliberately defensive hydration validation; `agentPresentation` readiness waiters `:262-321`; camera fit/focus math `:101-118,380-448`.
6. **`changes/` predicates.** Degraded annotations must yield `file: ""` (not `0`); `instanceOverride` is only valid under `scope === "rendered-instance"` (`codecs.ts:140-141`); `isUnsafeRepeatedSourceOverride` `:397-406`; `value.target.beforeText === value.before` (`editModel.ts:180`); the load-bearing NaN gate `codecs.ts:193` pinned by `codecs.test.ts:131-138` and relied on by `sessionStore.ts:172-174`; `mergeWithExisting`'s non-uniform per-kind rules `model.ts:86-122`. The *mechanics* compress (#6); the *predicates* are the product guarantee.
7. **`agent/` trust boundary.** The duplicated `protocolVersion`/`projectId` guards across `httpTransport.ts:234,250` and `client.ts:503` are **deliberate defense-in-depth**; deduping them weakens it. `statusPayload:133-173` and `eventPayload:175-198` are field-by-field schema guards — replacing them with a library is a dependency change, not a simplification.
8. **`shell/stateValue.ts` (13 importers), `shortcuts.ts` (5), `styleState.ts` (11), `panelLayout.ts` (3), `DomNavigation.tsx`.** Real high-fan-in behaviour, not shallow wrappers. The "tiny file per helper" hypothesis is **false** here: inlining them saves ~0 lines and breaks 37 import edges. Same for the other ≤80-LOC modules: `toolbarScale.ts` + `resizeHandleScale.ts` merge for ~6 lines, not 37. **Merging distinct small modules does not reduce LOC.**
9. **CSS (2,272 lines).** Cross-file shared declarations total ~399 lines and extracting them into utilities requires adding class names in TSX, so net LOC would likely **rise**. CSS is effectively irreducible at ~0–200 lines of churn-heavy savings; I would not spend effort here.

---

## (d) Where ~50 % would actually have to come from

Compression tops out at **~6–9 %** of these nine directories. Cutting half is a **product-scope** decision, and the honest menu is:

| cut | LOC (src+test) | what the product loses |
|---|---:|---|
| Canvas subsystem (`canvas/` + canvas wiring in `shell/`) | ~10,800 | the entire side-by-side canvas mode |
| `agent/` MCP bridge + dialog | 3,046 | agent connection UI |
| `inline-text/` editing | 2,960 | in-place text editing |
| `overlay/` element selection (+ `ui/`, `selection/`) | ~4,200 | manual element picking and the whole inspector panel's selection model |
| `conformance/` case corpora | 1,892 | value-semantics regression corpus |
| `componentSemantics/` | 2,630 | React component props/bindings panel |
| One of `TokenField`'s modes (raw ⇄ chip) | ~250 + tests | token-chip editing **or** raw-value editing |
| Interaction-state resolution (`:hover`/`:focus` preview) | ~300 + tests | state-scoped editing |

Deleting Canvas + agent + inline-text + overlay/selection alone would exceed half of `inspector/`. Any "halve the LOC" plan that keeps every feature is not achievable in this subsystem. The realistic refactor target is **~2,900–4,200 lines (6–9 %)**.

---

## Recommended order

1. **T0 deletes (rows 1–5)** — 577 LOC, zero risk, no behaviour surface.
2. **Test scaffolding (T1–T3, T5–T6)** — ~700–1,000 LOC, and it makes every later refactor cheap. Note `no-module-mocking: error` forbids shared fake stores; fixture factories are the right shape.
3. **T1 mechanical merges (rows 7–19)** — ~1,070–1,520 src, each independently verifiable by diff. Do the `oxlint.config.ts` allowlist entry for the new shared guard/store modules in the same change.
4. **Re-assess before the three T2 rows**: `codecs.ts` schema (#6) and the projection ledger (#20) each sit on a boundary with a large pinned test surface; land them one at a time with the existing suite as the oracle. `#23` (property-field context) touches render behaviour across ~25 components and is the one most likely to need test updates.
