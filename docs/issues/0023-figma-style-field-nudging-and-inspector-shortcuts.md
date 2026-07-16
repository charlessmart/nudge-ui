# 0023 — Figma-style field nudging and inspector shortcuts

**Labels:** enhancement, needs-triage
**Type:** AFK
**Milestone:** 2 — Core loop UX

## User story

As a designer editing a selected element or an active global token, I can use
the keyboard to make predictable small and large adjustments to a numeric CSS
value without leaving its field. I can also hide and restore the inspector
quickly, so the running page is easy to inspect without losing my editing
context.

## What to build

Add Figma-style nudging to every existing editable numeric text field, whether
it is rendered through the element inspector or the global Tokens tab. A field
with a single, parseable numeric CSS literal changes immediately when it has
focus:

| Shortcut | Effect |
|---|---|
| `ArrowUp` / `ArrowRight` | increase by the field's small nudge |
| `ArrowDown` / `ArrowLeft` | decrease by the field's small nudge |
| `Shift` + an arrow above | use the field's big nudge |

The user-requested default for pixel values is **1px small** and **8px big**.
This intentionally follows Figma's small/big-nudge interaction while using the
project's 8-point-grid big-nudge preference rather than Figma's default 10.

### Nudge policy

Create one small, pure policy for a CSS property and its current unit. It must
preserve the existing unit and return an exact, cleanly formatted value (no
floating-point artifacts). The initial policy is:

| Field/value kind | Small | Big | Current inspector fields |
|---|---:|---:|---|
| Pixel length (`px`) | `1px` | `8px` | padding, margin, gap, inset, width/height, border width/radius, flex-basis when px |
| Percentage layout length (`%`) | `1%` | `8%` | percentage width/height/inset/flex-basis values |
| Line-height (`%`) | `10%` | `80%` | line-height, whose default authored unit is `%` |
| Unitless number | `1` | `8` | flex grow/shrink, order |
| Font weight | `100` | `800`, clamped to CSS's 1–1000 range | font-weight |
| `rem` / `em` length | `0.125` unit | `1` unit | font-size and letter-spacing when those units are already authored |

The policy must retain a value's current unit. It must not convert an authored
`rem`, `em`, or percentage layout value to pixels. A bare numeric line-height
is first normalised to the existing percentage default (for example, `1.5`
becomes `150%`), then follows the line-height row above; an explicitly entered
pixel line-height remains a pixel value. Negative values remain valid where CSS
permits them. Nudge only a single numeric literal, including signed and decimal
values; leave CSS keywords (`auto`, `normal`), token aliases, functions
(`var()`, `calc()`), shorthands/compound values (`box-shadow`), colors, font
families, search inputs, and disabled fields unchanged.

Use the same commit path as typing in the field so every nudge updates the
managed stylesheet, canonical change set, preview verification, change log,
and prompt state immediately. Holding a key may issue repeated nudges; those
edits must still collapse to one baseline-to-current change.

Apply the behavior in both reusable input paths that exist today:

- `TokenValueField`, which backs raw fields in Spacing, Typography, Color,
  Border, and active global-token editing.
- The custom text input in `LayoutComboField`.

Token chips are not numeric text inputs and must not silently de-link a token
when arrowed. The user can first choose “Replace with raw value”, then nudge
the resulting value. This keeps token edits intentional.

When a nudge is handled, prevent the browser default and stop propagation so it
does not move the inspector hierarchy or navigate the token autocomplete.
Unrecognised/non-numeric fields preserve their present autocomplete behavior.
`Enter`, `Escape`, and normal `Tab` navigation retain their current semantics.

### Inspector visibility shortcut

Add `Shift` + `Backslash` (`event.code === "Backslash"`) as the primary
inspector visibility toggle. It hides and restores both the panel and inspector
overlays without clearing selection, pending changes, token-tab state, or
history. Keep `Alt` + `I` as a backwards-compatible alias and update visible
shortcut help accordingly.

Do not fire the visibility shortcut while a text input, textarea, or
contenteditable field has focus: `Shift` + `Backslash` must still type its
normal character there. Outside an editable target the shortcut must prevent
the browser default. The chosen `Shift` + `Backslash` mapping follows the
requested Figma muscle memory; Figma's current generic keyboard layout
documents `Command`/`Ctrl` + `Backslash` for hide/show UI, so this is a
deliberate product mapping rather than a claim of exact current parity.

### Hotkey-library decision

Do **not** add a hotkey dependency for this slice. The inspector currently has
one global shortcut listener and two field-local key handlers; a small typed
shortcut matcher plus the pure nudge policy is clearer than a global command
registry and avoids duplicate listeners or combobox-event conflicts. Keep the
matcher isolated and platform-neutral so a future command registry or
user-remappable shortcut settings can adopt it without changing editor
components.

Reconsider a library only when the product needs command discovery, shortcut
customisation, chorded sequences, or several independently mounted global
shortcut owners.

## Shortcut inventory

The following Figma-adjacent shortcuts are either delivered here or deliberately
deferred so later work does not accidentally reuse conflicting keys.

| Shortcut | Status | Rationale |
|---|---|---|
| Arrow / Shift + Arrow numeric nudge | In scope | Core field-editing interaction above. |
| `Shift` + `Backslash` inspector visibility | In scope | Requested fast hide/show. |
| `Cmd`/`Ctrl` + `Z`, `Cmd`/`Ctrl` + `Shift` + `Z` | Already supported | Inspector undo/redo, outside editable fields. |
| `Enter`, `Escape`, `Tab` in fields | Already supported/preserved | Commit, restore, and normal field navigation. |
| `Alt` + `A` / `W` / `S` / `D` object alignment | Deferred | Figma aligns a selection relative to a parent/selection; this needs a multi-element alignment model, not only the existing flex alignment controls. |
| `Alt`/`Option` + `Cmd`/`Ctrl` + `C` / `V` copy/paste properties | Deferred | Needs a well-defined cross-element property clipboard, compatibility rules, and edit-scope behavior. |
| `Cmd`/`Ctrl` + `B`, `I`, `U` text formatting | Deferred | Only font weight exists today; font style and decoration fields, plus text-selection semantics, are missing. |
| `Alt`/`Option` drag scrubbing | Deferred | Valuable Figma parity, but requires pointer capture, value-policy integration, and accessible feedback; keep it separate from keyboard nudging. |
| Auto-layout commands such as `Shift` + `A` | Deferred | Creating/removing layout systems is outside the current CSS-preview inspector. |

Reference behavior: [Figma nudge settings](https://help.figma.com/hc/en-us/articles/4404575206295-Set-small-and-big-nudge-values), [Figma value adjustment and scrubbing](https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-and-position), [Figma auto-layout shortcuts](https://help.figma.com/hc/en-us/articles/360040451373-Explore-auto-layout-properties), and [Figma keyboard layouts](https://help.figma.com/hc/en-us/articles/5665442977431-Select-keyboard-layout).

## Tests

### Unit (Vitest)

- The pure nudge policy covers positive, negative, decimal, zero, and
  boundary font-weight values; preserves units; applies the 1/8 pixel and
  10/80 percentage defaults; and never emits floating-point noise.
- The policy rejects non-literal CSS without changing it.
- `TokenValueField` nudges raw numeric values through its existing commit
  callback, including active global-token fields; a token chip is not
  implicitly de-linked.
- `LayoutComboField` nudges its visible custom input through the same style
  action as a typed value.
- A handled arrow does not reach hierarchy stepping or token-autocomplete
  navigation; unhandled fields retain their existing behavior.
- `Shift` + `Backslash` toggles the open store by physical backslash key,
  preserves inspector state, ignores editable targets, and does not regress
  `Alt` + `I`, undo, or redo.

### E2E (Playwright)

- Select a sandbox element, focus a raw padding/radius field, and verify
  small and big nudges update the managed stylesheet, rendered computed style,
  change log, and copied prompt as one current change.
- Verify a line-height field commits percentage values and changes by the
  configured percentage increments.
- Verify `Shift` + `Backslash` hides the panel and overlays, then restores the
  same selected element and existing preview; typing the character in an
  editable inspector field does not hide the UI.
- Verify the production sandbox build contains neither inspector attributes
  nor inspector runtime behavior.

## Acceptance criteria

- [x] Focused numeric CSS literal fields support all four arrows for small
      nudges and `Shift` + arrow for big nudges.
- [x] Pixel values nudge by 1px / 8px; percentage layout values by 1% / 8%;
      line-height by 10% / 80%; and the other initial policy rows above are
      implemented exactly.
- [x] Nudge output preserves the authored unit and has no floating-point
      artifacts.
- [x] Both element-editor fields and active global-token fields use the shared
      behavior; `LayoutComboField` custom input is included.
- [x] Non-numeric CSS, token chips, search, disabled inputs, and text inputs
      do not change on arrows.
- [x] A handled nudge uses the normal managed-stylesheet/change-set pipeline
      and does not trigger hierarchy or autocomplete keyboard behavior.
- [x] `Shift` + `Backslash` toggles inspector UI visibility outside editable
      targets, keeps state intact, and `Alt` + `I` remains available.
- [x] No hotkey package is added; shortcut matching and nudge policy are
      isolated and covered by unit tests.
- [x] Vitest unit tests, relevant Playwright e2e coverage, `pnpm lint`,
      `pnpm typecheck`, and `pnpm --filter sandbox build` pass.

## Out of scope

- Persisted or user-configurable nudge amounts and user-remappable shortcuts.
- Multi-element/object alignment, property clipboard, text-formatting
  commands, scrub dragging, and auto-layout creation/removal shortcuts.
- Changes to project source files: all previews remain managed-stylesheet,
  dev-only changes.

## Blocked by

None — can start immediately.
