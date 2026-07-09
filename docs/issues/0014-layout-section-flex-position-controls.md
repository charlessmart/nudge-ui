# 0014 — Layout section: flex + position controls

**Status:** needs-triage

**Blocked by:** none

---

## User story

As a designer using the inspector, I want to see and edit flex and positioning
properties on any selected element — switch from `flex-row` to `flex-col`,
change wrapping, adjust `justify-content` — directly in the right-hand panel
so I can iterate on layout without switching to code.

---

## Scope

Add a **Layout** section to the right-hand inspector panel. It sits at the top
of the style editors (above ColorPicker). Edits write to the managed
`<style id="design-tool-styles">` sheet, same as every other editor.

### Properties covered (v1, no grid)

| Category | Properties |
|---|---|
| Display | `display` |
| Position | `position`, `top`, `right`, `bottom`, `left` (inset) |
| Flex container | `flex-direction`, `justify-content`, `align-items`, `flex-wrap`, `align-content`, `gap` (row-gap + col-gap) |
| Flex child | `align-self`, `flex-grow`, `flex-shrink`, `flex-basis`, `order` |

Add all of these to the `HANDLED_PROPERTIES` set in `InspectorShell.tsx` so
they don't leak into the "Other tokens" section.

### Sub-section visibility

| Sub-section | When visible |
|---|---|
| Display + Position | Always (when an element is selected) |
| Flex container props | When `display` computed value is `flex` or `inline-flex` |
| Flex child props | When **parent** element's computed `display` is `flex` or `inline-flex` |
| Inset (4-side) | When `position` computed value is `absolute`, `fixed`, `relative`, or `sticky` |
| Gap inputs | Always |
| align-content | Always (when flex container is shown — no conditional hiding based on wrap) |

---

## Value detection

- Use **`getComputedStyle()` only**. No Tailwind class parsing. No token-source
  detection for v1.
- For `flex-basis`: detect `auto` keyword vs. the computed pixel value.
  The computed value of `auto` resolves to a pixel; the editor must
  distinguish `auto` from an explicit pixel value.
- For `inset`: detect `auto` keyword per side (common for centering with
  `position: absolute`).

---

## Edit controls

### Enum properties (`<select>` dropdown)

For: `display`, `position`, `flex-direction`, `justify-content`, `align-items`,
`flex-wrap`, `align-content`, `align-self`.

Each dropdown shows the valid CSS keyword values for the property. The current
computed value is pre-selected.

Display options: `block`, `inline`, `inline-block`, `flex`, `inline-flex`,
`none`, `contents`.

Position options: `static`, `relative`, `absolute`, `fixed`, `sticky`.

### Numeric / unit properties (presets dropdown + free-text input)

For: `flex-grow`, `flex-shrink`, `flex-basis`, `order`, `gap` (row-gap,
column-gap), `inset` (per side).

A combo component: a `<select>` of common preset values **plus** a free-text
`<input>` at the bottom for custom values. The user can type any CSS value
(`1.5`, `100%`, `2rem`, `auto`, etc.).

Presets per property:

| Property | Presets |
|---|---|
| `flex-grow` | `0`, `1`, `2`, `3` |
| `flex-shrink` | `0`, `1` |
| `flex-basis` | `auto`, `0`, `100%`, `50%`, `fit-content` |
| `order` | `-1`, `0`, `1`, `2`, `3` |
| `gap` (row/col) | `0`, `0.25rem`, `0.5rem`, `0.75rem`, `1rem`, `1.5rem`, `2rem`, `3rem` |
| `inset` (per side) | `auto`, `0`, `50%`, `100%` |

### Inset 4-side editor

Reuse the `SpacingBox` 4-side grid pattern but adapted for `top`/`right`/
`bottom`/`left`. Each side uses the combo component above (with `auto` as
a preset). The shorthand `inset` property is **not** supported — we always
write per-side longhands (`top`, `right`, `bottom`, `left`).

### Gap editor

Two combo inputs (row-gap, column-gap) side by side. Write `row-gap` and
`column-gap` longhands to the managed stylesheet.

---

## Implementation outline

1. **Add layout properties to `HANDLED_PROPERTIES`** in `InspectorShell.tsx`
   so the Layout section gets these instead of "Other tokens".

2. **Create `packages/inspector/src/styleEditors/LayoutSection.tsx`** —
   the main Layout editor component.

   - Receives: `SelectedElement`, `tokenEntries`, `onAfterEdit`.
   - Reads all layout-relevant computed values and parent context.
   - Renders sub-sections conditionally.
   - Uses `setStyle()` from `editActions.ts` for each edit.

3. **Create `packages/inspector/src/styleEditors/LayoutDropdown.tsx`** —
   the `<select>` for enum properties.

4. **Create `packages/inspector/src/styleEditors/LayoutComboField.tsx`** —
   the presets dropdown + free-text input for numeric/unit properties.

5. **Wire into `InspectorShell.tsx`** — add `<LayoutSection>` as the first
   style editor in the render tree, passing the selected element and token
   entries.

6. **CSS** — add styles for the Layout section, dropdowns, 4-side grid,
   and combo inputs in the embedded `<style>` block of `InspectorShell.tsx`.

---

## Tests

### Unit (Vitest)

- Layout section renders all sub-sections correctly for:
  - A flex container element
  - A flex child element (parent is flex)
  - Both container + child
  - A positioned element
  - A plain block element (only display + position shown)
- Enum dropdowns emit `setStyle()` calls with the correct value
- Combo field with preset + free-text: selecting a preset and typing a
  custom value both work
- Inset editor reads/writes per-side values correctly
- `flex-basis: auto` is detected and editable as a keyword

### E2E (Playwright)

- Select a flex container element → Layout section appears at top of panel
  with flex-direction, justify-content, align-items, gap controls
- Change flex-direction from `row` to `column` via dropdown → element
  reflows, ChangeLog records the edit
- Select a flex child → align-self, flex-grow, flex-shrink, order controls
  appear
- Change flex-grow to `2` via free-text input → computed style updates
- Select a positioned element → inset 4-side editor appears
- Edit `left` → managed stylesheet rule written, element moves
- Revert a layout change from the ChangesLog → element returns to original

---

## Acceptance criteria

- [ ] Layout section renders at the top of the style editors (above ColorPicker)
      when an element is selected
- [ ] Display and Position dropdowns are always visible
- [ ] Flex container properties appear when display is flex/inline-flex
- [ ] Flex child properties appear when parent is a flex container
- [ ] Inset 4-side editor appears when position is not static
- [ ] All enum properties use dropdowns with correct CSS keyword values
- [ ] Numeric properties use combo component (presets + free-text)
- [ ] `auto` is supported as a preset for `flex-basis` and `inset`
- [ ] Gap editor shows row-gap + column-gap inputs
- [ ] All edits write to the managed stylesheet via `setStyle()`
- [ ] All edits appear in the ChangesLog with property name, old→new value
- [ ] Layout properties do NOT appear in the "Other tokens" section
- [ ] Production build: no layout editor code leaks (gated by `import.meta.env.DEV`)
- [ ] `pnpm lint` and `pnpm typecheck` pass
