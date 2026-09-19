# LOC audit — `packages/nudge-ui/src/inspector/styleEditors/`

Scope: `packages/nudge-ui/src/inspector/styleEditors/` only. 34 source files, 4562 non-test
source LOC (+ `_testUtils.ts` 140 = 4702 with the shared test helper), 4333 test LOC, 9035 total.
Every claim below was read from source; line numbers are `file:line` against the current tree.

Method note: all 30 non-test files and all 20 test files were read end to end. Line counts are
`wc -l`. The shared UI primitives this directory composes (`../ui/SideValuesField.tsx` 262,
`Select.tsx` 249, `SegmentedControl.tsx` 72, `FieldRow.tsx` 42, `ControlSurface.tsx` 32,
`TextInput.tsx` 19) were read too, because the merge sketches depend on their real APIs.

---

## (a) Per-file table

`dup?` = is this file a near-duplicate of another file in scope (verified, not suspected).

| # | Path | LOC | Category | dup? |
|---|------|-----|----------|------|
| 1 | `LayoutSection.tsx` | 848 | section (composite) | no — but 9 internal subcomponents, 2 of which are dupes |
| 2 | `BorderEditor.tsx` | 558 | field (composite) | partial: link-state machine dup of `BorderRadiusEditor` |
| 3 | `SpacingBox.tsx` | 439 | section (4-side box) | no — the *only* 4-side implementation |
| 4 | `Typography.tsx` | 363 | section (composite) | no |
| 5 | `GridPicker.tsx` | 253 | field (composite + model) | no |
| 6 | `LayoutComboField.tsx` | 230 | field (combo) | partial: read/resync dup of `LayoutDropdown`/`GridValueField` |
| 7 | `BorderRadiusEditor.tsx` | 227 | field (composite) | partial: link-state machine dup of `BorderEditor` |
| 8 | `GridChildSection.tsx` | 200 | section (composite) | draft-input dup of `GridValueField` |
| 9 | `GridSection.tsx` | 191 | section (pure composition) | no |
| 10 | `gridChildModel.ts` | 178 | model | no — **irreducible** |
| 11 | `ColorPicker.tsx` | 135 | field | no |
| 12 | `GridValueField.tsx` | 111 | field | draft-input dup of `GridChildSection` |
| 13 | `layoutValue.ts` | 110 | helper (CSS read) | no — **irreducible** |
| 14 | `valuePolicy.ts` | 105 | helper (value semantics) | no — **irreducible** (table is a dup source, see M9) |
| 15 | `nudgeValue.ts` | 89 | helper (value semantics) | no — **irreducible** |
| 16 | `OpacityEditor.tsx` | 77 | field | no |
| 17 | `LayoutDropdown.tsx` | 68 | field (single-select) | partial: read/resync dup |
| 18 | `GapField.tsx` | 60 | field (single-property) | yes — single-property `TokenField` wrapper (M3) |
| 19 | `PositionInsets.tsx` | 53 | section (thin wrapper) | preamble dup + wraps `SpacingField` |
| 20 | `AspectRatioField.tsx` | 52 | field (single-property) | yes — M3 |
| 21 | `BoxShadowEditor.tsx` | 47 | field (single-property) | yes — M3 |
| 22 | `completeCssValue.ts` | 41 | helper (value semantics) | no — **irreducible** |
| 23 | `InsetSection.tsx` | 40 | section (thin wrapper) | **DEAD CODE** — zero importers (M1) |
| 24 | `LayoutBlockedIndicator.tsx` | 36 | ui atom | no |
| 25 | `AppearanceSection.tsx` | 27 | section (pure composition) | no |
| 26 | `rowLookup.ts` | 19 | helper | no — but under-used (M11) |
| 27 | `stringRecord.ts` | 5 | helper (types only) | no — trivial, inlinable |
| — | `_testUtils.ts` | 140 | test helper | no — under-used (T1–T4) |

### Component detail (the requested structural comparison)

Every editor in this directory consumes the **same props contract** and the **same store API**.
This is the single most important structural fact: there is no per-component data model to unify,
because there already is one.

Uniform props (7 of 7 sections, verbatim shape):

```ts
// LayoutSection.tsx:46-52, BorderEditor.tsx:199-205, SpacingBox.tsx:32-38,
// Typography.tsx:31-37, BorderRadiusEditor.tsx:70-77, BoxShadowEditor.tsx:12-18,
// OpacityEditor.tsx:22-28, ColorPicker.tsx:17-24, GridSection.tsx:29-39
{ element?/domElement: SelectedElement | HTMLElement; selection?: StyleSelection | null;
  entries?: TokenEntry[]; tokenRows?: ResolvedProperty[]; revision?: number;
  onAfterEdit?: () => void }
```

Uniform read/write path:

| Concern | Mechanism | Example |
|---|---|---|
| token row lookup | `findTokenRow(rows, prop)` (`rowLookup.ts:4-9`) | `BorderEditor.tsx:38,47,59` |
| authored value | `readAuthoredStyleValue` / `getLayoutValue` (`layoutValue.ts:35-50,101-109`) | `GridValueField.tsx:46` |
| computed fallback | `getStateStyleValue(el, prop, fallback)` | `LayoutDropdown.tsx:30`, `Typography.tsx:281` |
| layout default | `meaningfulLayoutValue` (`layoutValue.ts:25-33`) | `LayoutComboField.tsx:62,96`, `AspectRatioField.tsx:41` |
| inline block | `inlineAuthoredValue` (`layoutValue.ts:81-89`) | `GapField.tsx:34`, `LayoutComboField.tsx:111` |
| write | `setStyle` / `setStyles` / `setElementStyles` (`../tokens/editActions.ts`) | `LayoutSection.tsx:523,772` |
| token swap | `swapTokens` | `SpacingBox.tsx:369` |
| commit-time unit | `completeCssValue(raw, valuePolicyFor(prop))` | `LayoutComboField.tsx:146` |
| arrow-key nudge | `nudgeCssValue` | `LayoutComboField.tsx:157` |

Per-file specifics (abridged to what differs):

| Component | Style-state read/write | UI primitives composed | Hard-coded tables |
|---|---|---|---|
| `LayoutSection.tsx` | 11× `useComputedLayoutValue` wrapper (`831-844`) over `getStateStyleValue` (`846-848`); writes `setStyle`/`setStyles`; `layoutRevision` counter (`82-85`) threaded as `revision` to all children | `LayoutDropdown`, `LayoutComboField`, `GapField`, `AspectRatioField`, `PositionInsets`, `GridSection`, `TokenField`, `IconButton`, `InspectorPopover`, `PopoverListbox`, `SegmentedControl`, `FieldRow`, `ControlSurface` | `DISPLAY_OPTIONS`,`POSITION_OPTIONS`,`FLEX_DIRECTION_OPTIONS`,`ALIGN_CONTENT_OPTIONS`,`ALIGN_SELF_OPTIONS` (`29-33`); 4 preset arrays + 4 option arrays (`35-44`) |
| `BorderEditor.tsx` | `useBorderLinkedState` (`212-237`); `valuesAreLinked` (`122-135`); writes `setStyle`/`setStyles` (`275,281,298,524`) | `TokenField`, `FieldRow`, `IconButton`, `ToggleButton`, `PopoverListbox`, `ControlSurface` | `BORDER_STYLES` (`32`), `INVISIBLE_BORDER_STYLES` (`33`), `ZERO_WIDTH` (`34`), `BORDER_SIDES` (`35`), `BORDER_SIDE_ICONS` (`486-491`) |
| `SpacingBox.tsx` | `projectInspectorValues[ForSelection]` (`44-46`); `setStyles`/`swapTokens` (`345,369`); `useState(fieldsAdded)` (`121`) | `SideValuesField`+`SIDE_NAMES`+`MarginSideIndicator`, `TokenField`/`TokenValueField`, `IconButton` | `sideProperty()` naming (`200-202`), 2 zero-value regexes (`204-212`), **8 inline SVG icons (`214-294`)** |
| `Typography.tsx` | 6× `findTokenRow` (`57-103`); `getStateStyleValue` for style/weight/align (`281-282,317,324`); `setStyles` (`249-252`) | `TokenField`, `Select`, `SegmentedControl`, `AtRuleIndicator`, `ControlSurface` | `FONT_STYLE_OPTIONS` (`201-210`), 2 alignment option arrays (`121-141`) |
| `GridPicker.tsx` | `getLayoutValue` (`82-83`); `setStyles` (`172-175`) | raw `<button>` grid + custom popover positioning (`142-162`) | `GRID_PICKER_MAX_COLUMNS/ROWS` (`7-8`) |
| `LayoutComboField.tsx` | `meaningfulLayoutValue` + `inlineAuthoredValue`; `setStyle`; **canvas projection ack round-trip** (`69-73,80-102,119-129`) | `Select`, `TextInput`, `AtRuleIndicator`, `LayoutBlockedIndicator` | `CUSTOM_KEY` (`22`), `arrowDirection` (`226-230`) |
| `BorderRadiusEditor.tsx` | own linked/unlinked `useState` pair (`87-105`); `cornerAuthoredSignature`/`cornersAreLinked` (`41-49`); `linkAllCorners` (`51-68`) | `ToggleButton`, `TokenField`, `SideControls`, `ControlSurface` | `BORDER_RADIUS_CORNERS`/`_ICONS`/`_LABELS` (`25-39`) |
| `GridChildSection.tsx` | `readAxis`/`readGridChildAlignment` (`38-40,167-168`); commits via `gridChildModel` (`181-187`) | `ControlSurface`, `FieldRow`, `SegmentedControl`, `TextInput` | 2 alignment option arrays (`115-127`) |
| `GridSection.tsx` | **none** — pure composition; no style read/write at all | `GridPicker`, `GapField`, `LayoutDropdown`, `GridValueField`, `GridChildSection`, `InspectorPopover` | 3 grid option arrays (`17-28`) |
| `ColorPicker.tsx` | `getStateStyleValue` (`56,62`); `setStyle` (`85`); `isEmptyColorValue` (`36-47`) | `TokenField`, `IconButton`, `ControlSurface` | `colorSectionTitle` map (`26-30`) |
| `GridValueField.tsx` | `getLayoutValue` + `DEFAULT_GRID_VALUES` (`12-19,46-47`); `setStyle` (`75`) | `FieldRow`, `TextInput` | `DEFAULT_GRID_VALUES` (`12-19`) |
| `LayoutDropdown.tsx` | `getStateStyleValue(el, property, options[0])` (`30,35`); `setStyle` (`44`) | `FieldRow`, `Select` | — |
| `GapField.tsx` | inline `tokenRows.find(...)` (`33`); `meaningfulLayoutValue`; `inlineAuthoredValue` | `TokenField`, `LayoutBlockedIndicator` | `GAP_PRESETS` (`11`) |
| `PositionInsets.tsx` | projection preamble (`31-33`) | `SpacingField` | `OFFSET_PRESETS` (`10`) |
| `AspectRatioField.tsx` | `meaningfulLayoutValue` (`41`) | `FieldRow`, `ControlSurface`, `TokenField` | `ASPECT_RATIO_PRESETS` (`12`) |
| `BoxShadowEditor.tsx` | inline `tokenRows.find(...)` (`25`) | `FieldRow`, `ControlSurface`, `TokenField` | — |

---

## (b) Ranked merge opportunities

Ranges are LOC **saved**. Overlaps are called out: M3/M4/M6 touch the same files, so the
consolidated total is deliberately lower than the naive sum.

### M1 — Delete `InsetSection.tsx` (dead code). **Save 129. Risk: none.**
`grep -rn "InsetSection" packages examples landing tools docs` returns only the file itself, its
own test, and stale `dist/` build output — **no importer anywhere in the repo**. It is a 40-line
wrapper around the already-exported `SpacingField` (`InsetSection.tsx:31-38`), duplicating the
projection preamble (`:33`) and the same `position` role check that `SpacingBox` already performs
(`SpacingBox.tsx:47-52`). Its own doc comment claims callers "that render it outside SpacingBox" —
none exist. Delete `InsetSection.tsx` (40) + `InsetSection.test.tsx` (89).

### M2 — Unify the draft-text-input commit machine. **Save 45–60. Risk: low–medium.**
`GridValueField.tsx:45-108` and `GridChildSection.tsx:49-105` are the same machine: `useState(draft)`
+ `draftRef` + `updateDraft` + commit-on-blur + Escape→revert+blur + Enter→blur. The tell is that
both carry the *same* ref rationale (`GridValueField.tsx:51-53` vs `GridChildSection.tsx:51-67`) and
the same keydown ladder (`GridValueField.tsx:98-107` vs `GridChildSection.tsx:91-100`). Extract:

```ts
// useDraftCommit: owns draft + ref + commit/cancel, so blur-before-rerender stays correct
function useDraftCommit(opts: { value: string; normalize?: (d: string) => string;
  onCommit: (next: string) => void; }): { draft, setDraft, cancel, handlers }
```
combined ~115 LOC → ~55. Differences to preserve: `AxisPlacementRow` normalizes empty→`"auto"`
(`:64`) and resets draft on `state.placement.start` change (`:53-56`); `GridValueField` has a
`mixed` placeholder and `DEFAULT_GRID_VALUES` (`:47,91`). Both are expressible as options.

### M3 — One `PropertyTokenField` for the 4 single-property `TokenField` wrappers. **Save 90–110. Risk: medium.**
Four copies of the same 15-line JSX block — `ControlSurface` + `TokenField` with a `tokenRow`, a
defaulted `initialValue`, `suggestions`, and an optional leading icon:

- `BoxShadowEditor.tsx:27-45` (47 LOC)
- `AspectRatioField.tsx:34-50` (52 LOC)
- `GapField.tsx:36-58` (60 LOC) — adds the inline-blocked path
- `LayoutSection.tsx:313-334` `renderTokenField` (~22 LOC) — the same block a fourth time

Combined ~181 LOC → one component ~70 + 4 thin configurations ~10. Sketch:

```tsx
<PropertyTokenField property={property} element={el} selection={selection} entries={entries}
  tokenRow={findTokenRow(tokenRows, property)} presets={…}
  defaultFrom={meaningfulLayoutValue} blockedAs={inlineAuthoredValue}
  leading={…} title="Box Shadow" data-test="box-shadow-editor" className={…} />
```
Risk: each site's tests assert a distinct wrapper class/test id (`data-test="box-shadow-editor"`,
`layout-combo--blocked`, `layout-size-aspect-ratio`, `token-field--color`). The primitive must pass
`className` + `data-test` through unchanged, otherwise behavior-preservation is not claimable.

### M4 — `EditorSection` shell + add/remove toggle. **Save 40–70. Risk: low.**
The `<div class="editor"><div class="editor__title-row"><div class="editor__title">…</div>{action}</div>`
shell is hand-written at `BorderEditor.tsx:346-370`, `BoxShadowEditor.tsx:28-31`,
`ColorPicker.tsx:92-116`, `SpacingBox.tsx:56-57`, `LayoutSection.tsx:127-128`,
`GridSection.tsx:56-60`, `GridChildSection.tsx:190-191`, `PositionInsets.tsx:36-37`,
`Typography.tsx:47-50`, `BorderRadiusEditor.tsx:209-225`. The add/remove pair
(`show ? <IconButton …remove> : <IconButton …add>`) is duplicated verbatim at
`BorderEditor.tsx:349-369` and `ColorPicker.tsx:95-115`. Class names differ (`editor`,
`editor appearance`, `appearance__field`), so the primitive needs a `className` escape hatch.

### M5 — Extract the linked/expanded state machine. **Save 20–25. Risk: low.**
`BorderEditor.tsx:212-237` (`useBorderLinkedState`) and `BorderRadiusEditor.tsx:87-105` are the same
`{userUnlinked, userLinked}` + reset-on-`el` + reconcile-on-`dataLinked` machine, differing only in
the reset key expression. Extract `useLinkedState(dataLinked, resetKey)`.

> **Explicitly NOT recommended: collapsing `BorderEditor` + `BorderRadiusEditor` into one
> schema-driven editor.** The shared part is only that 20-line hook. `BorderEditor.tsx:32-197`
> is 166 lines of border-presence heuristics with **no analogue** in the radius editor
> (`sidePaints` `:155-159`, `hasBorderPresence` `:172-197`, structured `width|style|color`
> decomposition `:71-104`), each backed by a dedicated test (`BorderEditor.test.tsx:187-257,
> 259-295, 412-483`). `BorderRadiusEditor` conversely owns the `mixed`/"Mix" display and the
> `embedded` layout variant (`:142-207`). A single schema would have to re-encode both dialects
> as flags — that is a new abstraction over 166 lines of edge cases, not a deduplication. I could
> not verify a behavior-preserving merge here, so I do not recommend one.
>
> `BoxShadowEditor` is *not* a "multi-value composite editor" at all — it is a single
> `box-shadow` `TokenField` (`:33-41`). It belongs to M3, not to a border merge.

### M6 — `SettingsMenu` over `PopoverListbox`. **Save 25–40. Risk: low.**
Three sites repeat `query=""` + `onQueryChange={() => undefined}` + `items.map(… leading: current ? <IconCheck/> : undefined)` + `onOpenChange={setOpen}`: `BorderEditor.tsx:529-556`,
`LayoutSection.tsx:654-681`, `LayoutSection.tsx:702-740`. A `<SettingsMenu items current onSelect
trigger …/>` owns the inert query plumbing and check-mark logic.

### M7 — One "read current value → local state → resync on `el`/`revision`" hook. **Save 25–40. Risk: medium.**
Three independent implementations of the same idea with three *different* read functions:
`LayoutDropdown.tsx:29-39` (`getStateStyleValue`), `GridValueField.tsx:45-60` (`getLayoutValue` +
per-property defaults), `LayoutComboField.tsx:61-102` (`meaningfulLayoutValue` + projection ack).
Sketch `useFieldValue({ el, property, revision, read, mixed })` → `{ value, draft, setDraft, commit }`.
Risk: `LayoutComboField.tsx:80-102` and `:119-129` implement a canvas-projection acknowledgement
round-trip (`getCanvasProjectionStatus`, `pendingProjectionRef`) that the other two do not have.
That part must stay in `LayoutComboField`; only the 3-4 line read/resync skeleton is common.

### M8 — Table-drive the 12 inline SVG side/axis indicators. **Save 45–55 (in scope). Risk: low functional, high test churn.**
`SpacingBox.tsx:214-294` is `PaddingSideIndicator` (4 SVGs, 35 LOC) + `SpacingAxisIndicator`
(4 SVGs, 45 LOC); `../ui/SideValuesField.tsx:228-262` is `MarginSideIndicator` (4 SVGs, 34 LOC).
Every one is `<rect …/><line …/>` with identical attributes and only coordinates differing, e.g.
padding-left `rect(3,3,18,18)` + `line(6.75,7→6.75,17)` (`:217-220`) vs margin-left
`rect(7,5,14,14)` + `line(3,5→3,19)` (`:231-234`). A coordinate table collapses ~80 in-scope LOC
to ~30. Caveat: the tests assert the raw coordinates (`SpacingBox.test.tsx:75-131`,
`InsetSection.test.tsx:54-64`, `LayoutSection.test.tsx:543-545`), so those assertions become
table lookups and lose their value — expect to delete them, which is a test-side win, not a loss.

### M9 — Merge the 6 hard-coded CSS property tables. **Save 30–50. Risk: medium (commit path).**
The same property space is re-listed six times with different keys and purposes:
`valuePolicy.ts:63-92` (3 sets), `layoutValue.ts:7-19` (`DEFAULT_LAYOUT_VALUES`),
`layoutValue.ts:57-72` (`INLINE_SHORTHAND_SOURCES`), `GridValueField.tsx:12-19`
(`DEFAULT_GRID_VALUES`), `BorderEditor.tsx:35` (`BORDER_SIDES`),
`BorderRadiusEditor.tsx:25-30` (`BORDER_RADIUS_CORNERS`). `margin-*` appears in three of them;
`inset/top/right/bottom/left` in three. A `cssPropertyModel.ts` registry
(`property → { sides, shorthand, defaultValue, policy }`) is derivable, but `valuePolicy` is on the
commit path and covered by tests (`valuePolicy.test.ts:5-30`, `completeCssValue.test.ts:6-26`), so
this is the highest-regression-risk merge in the list. Recommend only if `valuePolicy` behavior is
frozen by the existing table tests first.

### M10 — `useSpacingProjection` for the 3× projection preamble. **Save 8–12. Risk: low.**
Byte-identical at `SpacingBox.tsx:44-46`, `PositionInsets.tsx:31-33`, `InsetSection.tsx:33`
(the last one dies with M1).

### M11 — Adopt `findTokenRow` at the 5 inline re-implementations. **Save 5–8. Risk: none.**
`BoxShadowEditor.tsx:25`, `GapField.tsx:33`, `OpacityEditor.tsx:34`, `LayoutSection.tsx:319`,
`LayoutSection.tsx:378` all write `tokenRows.find((row) => row.property === X) ?? null`, which is
exactly `rowLookup.ts:4-9`. `findTokenRow` is already imported at 27 call sites — this is
under-use, not absence.

### M12 — Spread a shared props object into `GridSection`'s 8 field calls. **Save 20–30. Risk: low.**
`GridSection.tsx:83-137` passes `domElement/editTarget/selection/revision/onAfterEdit` eight times
(~5 lines each). All targets take a compatible props shape.

### M13 — Trim `useComputedLayoutValue`. **Save 10–15. Risk: low.**
`LayoutSection.tsx:831-848`: the setter is returned but discarded at 9 of 11 call sites (only
`FlexAlignmentGrid` at `:746-747` uses it), and `readLayoutValue` (`:846-848`) is a one-line alias
for `getStateStyleValue`. Collapsing to `useComputedLayoutValue(el, property, fallback, revision)`
returning a plain string (plus a separate pair-returning variant only where needed) removes ~12 LOC.

### M14 — Shared top-level CSS tokenizer. **Save 12–18. Risk: HIGH — flagged, not recommended.**
`SpacingBox.tsx:388-410` (`splitAxisValue`, comma) and `GridPicker.tsx:31-60` (`splitTrackList`,
whitespace) are structurally the same quote/paren-depth scanner, but their escape handling
genuinely diverges: `GridPicker` tracks an `escaped` flag (`:36,41-43`) while `SpacingBox` tests
`value[index - 1] !== "\\"` (`:395`), and `GridPicker` also skips runs of whitespace (`:54`). A
shared primitive would need both semantics preserved; I cannot verify equivalence by reading, so I
list this as an opportunity with an explicit correctness caveat rather than a recommendation.

### M15 — Delete dead preset data. **Save 4–6. Risk: none.**
`LayoutSection.tsx:35-37` defines `FLEX_GROW_PRESETS`/`FLEX_SHRINK_PRESETS`/`FLEX_BASIS_PRESETS`
and passes them at `:220,231,242`, but those three calls also pass `inputOnly` (`:224,235,246`), and
`LayoutComboField.tsx:201-219` renders `presets` **only** in the non-`inputOnly` `Select` branch.
The arrays are provably unreachable data.

### Consolidated source savings

Naive sum of M1–M15 ≈ 590–800, but M3/M4/M6/M7 overlap heavily on the same files and M14 should not
be taken. **Realistic source-directory saving: ~350–600 LOC of 4562 (8–13%).**

---

## (c) Test-side opportunity

4333 test LOC across 20 files, 193 `it` blocks.

### T1 — Shared setup/teardown harness. **Save ~130–150. Certain.**
14 `.test.tsx` files each hand-write the same 12-13 line `beforeEach`/`afterEach`
(`resetPendingRules()` → remove `#nudge-ui-styles` → `innerHTML = ""`), e.g.
`AspectRatioField.test.tsx:11-22`, `BorderEditor.test.tsx:37-49`, `LayoutSection.test.tsx:22-34`
(measured: 11–13 LOC per file, 14 files ≈ 168 LOC). `_testUtils.ts` is already imported by all 14
but provides no lifecycle helper. Add `useStyleEditorTestEnv()` (or a `setupStyleEditorTest()`
returning the reset functions) → ~15 LOC helper + 1 call per file.

### T2 — `ResolvedProperty` fixture factories. **Save ~120–160. Certain.**
281 lines in the test suite are raw `ResolvedProperty` field literals. `BorderEditor.test.tsx`
alone has **126** (`:25-32, 99-107, 129-148, 207-252, 274-283, 335-377, 427-472, 502-529, 555-568,
622-637`); `SpacingBox.test.tsx` has 39; `Typography.test.tsx` 28; `ColorPicker.test.tsx` 28;
`GapField.test.tsx` 23. `evidence: { reason: "test fixture" }` is repeated 16 times in
`BorderEditor.test.tsx` alone. `GapField.test.tsx:29-40` already demonstrates the fix (a local
`row(overrides)` factory) — it just is not shared. Generalizing it into `_testUtils.ts` as
`resolvedProperty(property, overrides?)` plus 2-3 domain builders (`borderFaceRows`,
`structuredBorder`, `radiusRows`) removes roughly half of those 281 lines.

### T3 — Generalize `mockComputedStyle` to absorb the ad-hoc stubs. **Save ~70–85. Certain.**
`LayoutSection.test.tsx` contains **6** independent `window.getComputedStyle` monkeypatches
(`:293-307, 345-360, 409-418, 437-450, 470-479, 555-571`) totalling ~95 LOC, because
`_testUtils.ts:77-93` `mockComputedStyle` only supports a flat `Record<string,string>`. Three
capabilities are missing and each is needed by real tests: (i) per-element values
(`:350` `target === selected.domElement`), (ii) mutable values read at call time (`:290-292`),
(iii) parent-element answers (`:411-416`). Adding
`mockComputedStyleWhere((el) => Partial<CSSStyleDeclaration> | null)` (composing with the existing
proxy at `_testUtils.ts:83-91`) collapses all six.

### T4 — `typeInput()` without blur. **Save ~25–35. Certain.**
`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!` + change event is
hand-rolled 6 times: `LayoutComboField.test.tsx:125-131, 190-201`,
`GridValueField.test.tsx:77-85, 102-113`. `_testUtils.ts:101-109` `setInputValue` already does this
but always blurs (`:108`), and these tests specifically assert pre-blur state. A
`typeInput(input, value)`: act + setter + change event, no blur, is strictly additive.

### T5 — Cross-field "shared-shape" contract suite. **Save only ~60–100. Partially viable — do not overclaim.**
There *is* a repeated mechanical shape: `makeSelected()` → `mockComputedStyle({...})` →
`mount(createElement(F, …))` → `querySelector('[data-test=…]')` → `setInputValue` →
`expect(sheetText()).toContain("prop: value;")`. But the **value semantics are genuinely
per-property**, so only a fraction is table-drivable:

- Table-drivable (uniform): "renders its label/title" and "respects an inline-authored block".
  The blocked path is identical across three files (`LayoutComboField.test.tsx:249-283`,
  `GapField.test.tsx:123-141`, plus `LayoutSection.test.tsx` indirectly).
- **Not** table-drivable: `line-height` `"1.6"` → `"160%"` (`Typography.test.tsx:126-139`),
  `aspect-ratio` must not gain `px` (`AspectRatioField.test.tsx:36-44`), opacity `"0.6"`→`"60%"`
  (`OpacityEditor.test.tsx:35-45`), border preflight `"0 solid"` suppression
  (`BorderEditor.test.tsx:187-257`), grid raw round-trip (`GridValueField.test.tsx:34-65`).
  A generic "writes on change" test would assert nothing about the behavior these tests exist for.

**Test-side total: ~350–550 LOC of 4333 (8–13%)**, of which ~250–290 is mechanical and certain
(T1+T3+T4) and ~120–260 is fixture/table consolidation (T2+T5).

---

## (d) Irreducible core

These are genuinely hard, behavior-dense, or accumulate CSS edge-case knowledge. I could not
identify a behavior-preserving simplification for any of them.

1. **`gridChildModel.ts:52-71` — line/span math.** Span derivation from `span N` vs a definite
   `end - start` pair, refusing to derive from negative lines (because `-1` means "last line"),
   preserving named lines. Backed by 8 focused tests (`gridChildModel.test.ts:48-115`).
2. **`gridChildModel.ts:81-112` — `commitGridAxisPlacement`.** Per-element recomposition of
   start+span, with `span: "keep"` re-reading each element individually so a multi-select keeps
   each item's own span (`:95-105`; tested `gridChildModel.test.ts:187-202`).
3. **`GridPicker.tsx:31-79` — track-list tokenizer + counter.** Quote/paren-aware splitting plus
   `repeat(N, …)` expansion and `[line-name]` skipping, correctly *refusing* to count
   `auto-fit`/`subgrid` (`:65,74`). This is the sole reason raw authored values are safe to display.
4. **`BorderEditor.tsx:32-197` (166 LOC) — border-presence heuristics.** Tailwind `border: 0 solid`
   preflight suppression, structured `width|style|color` decomposition, per-face painted detection,
   computed-width fallback when no cascade rows exist. Five distinct tests exist purely for these
   branches. This is the clearest example of accumulated domain knowledge in the directory.
5. **`SpacingBox.tsx:320-341` — `PairedTokenField` value reconciliation.** Mixed vs shared vs
   expression vs authored `auto` (the browser reports used px for `auto` margins, `:326-334`), with
   `resolvedValue` computed separately. Tested at `SpacingBox.test.tsx:458-517`.
6. **`SpacingBox.tsx:388-418` — axis split/format.** Comma splitting at depth 0 with quote tracking,
   then per-part unit completion.
7. **`layoutValue.ts:25-50` — authored-value recovery.** CSSOM path wrapped in try/catch for
   cross-origin stylesheets (`:36-46`) with inline `style` attribute fallback. The `?`-chained
   precedence encodes real cascade semantics.
8. **`layoutValue.ts:57-89` — inline shorthand blocking.** Longhand→shorthand map plus the
   "managed previews lose the cascade to inline styles, so present as blocked" rule. Tested
   `layoutValue.test.ts:112-164`.
9. **`valuePolicy.ts` + `completeCssValue.ts` + `nudgeValue.ts` (235 LOC) — the CSS value grammar.**
   `CSS_NUMBER_SOURCE` (`completeCssValue.ts:8`), line-height multiplier→percentage conversion
   (`:23-32`), per-property default units, nudge steps and clamps (`nudgeValue.ts:69-84`). Shared
   outward with `../tokens/TokenField.tsx`. Irreducible; if anything it should own *more*.
10. **`LayoutComboField.tsx:80-131` — canvas-projection acknowledgement.** Waits for
    `appliedRevision >= sentRevision` before re-reading, so a commit does not visually snap back.
11. **`Typography.tsx:221-296` — `FontStyleField`.** Weight×style composition, bidirectional
    provenance metadata when one shorthand authors two longhands (`:249-252`), custom-value
    round-tripping (`:236-243`), `normalizeFontWeight` (`:286-290`).
12. **`OpacityEditor.tsx:15-20` + `ColorPicker.tsx:36-47` — property-semantic emptiness.**
    `propertyOpacity` precedence and the `rgba(0,0,0,0)`-component analysis differ deliberately
    between background (empty ⇒ remove action) and text color (declared `transparent` stays
    editable) — documented at `ColorPicker.tsx:58-61`.

---

## Overall realistic total

| Slice | LOC | Realistic saving | % |
|---|---|---|---|
| Source (4562) | 4562 | **350–600** | 8–13% |
| Tests (4333) | 4333 | **350–550** | 8–13% |
| `_testUtils`/helpers | 140 | absorbed into T1–T4 | — |
| **Total of 9035** | 9035 | **~700–1150** | **~8–13%** |

### Skeptical conclusion on "cut ~half its lines"

**A ~50% reduction is not achievable in this directory without deleting features or replacing
hand-written CSS semantics with a DSL that the code does not currently need.** The reasons, all
verified rather than assumed:

1. **The three "duplicate" hypotheses in the brief are largely already resolved.** The 4-side box
   models are *not* three implementations: `InsetSection.tsx:31-38` and `PositionInsets.tsx:38-50`
   both render the single exported `SpacingField` (`SpacingBox.tsx:108`). The residual duplication
   is a 6-line projection preamble (M10). Similarly, `BoxShadowEditor` is a single-property field,
   not a multi-value composite (M3), so the "composite editors" family is really only
   `BorderEditor` + `BorderRadiusEditor`, whose shared surface is a 20-line hook (M5).
2. **30% of source LOC is two files of irreducible behavior.** `LayoutSection.tsx` (848) and
   `BorderEditor.tsx` (558) are 1406 LOC; after M4/M6/M7/M12/M13 (~85–130) and M5 (~20), the
   remainder is CSS cascade logic, alignment-axis transposition (`LayoutSection.tsx:744-818`), and
   border heuristics — none of which a schema removes.
3. **The real shared abstraction already exists, one directory up.** `TokenField`,
   `SideValuesField`, `ControlSurface`, `FieldRow`, and the store contract in `../tokens` and
   `../spacing/projection.ts` are the consolidation that a "table-driven components" rewrite would
   re-invent. The highest-value remaining work is making the existing primitives *absorb* the four
   single-property wrappers (M3) and the editor shell (M4), plus deleting the one dead file (M1).
4. **The test suite is where the shallow duplication actually is** (~250–290 LOC of pure
   lifecycle/stub boilerplate), but that is ~6% of the test suite, and the remaining assertions are
   property-specific behavior that must be preserved individually.

Practical sequencing: **M1 (delete dead) → T1/T3/T4 (test harness, no behavior risk) → M3 + M4
(absorb wrappers) → M5/M6/M7/M10/M11/M13 (hook + plumbing extraction) → M2**, then re-measure. M8
and M9 only after the above, and only with the existing coordinate/table tests left as the oracle.
