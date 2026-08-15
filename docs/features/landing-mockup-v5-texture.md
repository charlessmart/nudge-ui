# Landing mockup V5 — Texture

Handoff notes for building the 5th landing-page variation in Penpot (file:
"Designtool", page "Page 1"). Built in a session where the Penpot MCP plugin
dropped mid-work, so V5 was never created.

## Task

Iterate on "Landing V4 — Apple" (board at x=4800, y=0, 1440×2209):

- V4 style: warm monochrome (`#F5F5F7` canvas, `#1D1D1F` ink, `#6E6E73`
  secondary, white cards), Inter only, no mono fonts, no code examples, no
  section eyebrows, minimal Apple vibe, slim borderless nav, centered hero,
  dark "zero footprint" band, minimal footer.
- Add subtle color only via placeholder graphics/textures (user will replace
  with photography later).
- Open image slots on the key cards (feature cards) for placeholder images.
- Add a subtle grayscale paint texture behind the hero area.
- Use components from the user's NEW design-system library for any relevant
  UI (buttons, pills, etc.): connect the library via
  `penpot.library.availableLibraries()` / `connectLibrary()`, enumerate
  `library.components`, and instantiate by name with `component.instance()`.

## Placement

New board "Landing V5 — Texture" at x=6400, y=0, width 1440.

Fastest route: clone the V4 board (`v4.clone()`) and rework it — remove the
current hero product card's shadowing if needed, restyle, add textures.

## Unsplash assets (free license, hotlink via `penpot.uploadMediaUrl`)

Direct image URLs (add `?fm=jpg&q=80&w=1600&auto=format&fit=crop`):

1. Hero background texture — white/gray abstract paint (subtle, low opacity):
   `https://images.unsplash.com/photo-1620812097331-ff636155488f`
2. Card placeholder 1 — black/gray abstract painting:
   `https://images.unsplash.com/photo-1604233193955-0785a88e4d9c`
3. Card placeholder 2 — gray painted concrete wall:
   `https://images.unsplash.com/photo-1533035353720-f1c6a75cd8ab`
4. Card placeholder 3 — close-up gray textured surface:
   `https://images.unsplash.com/photo-1667227283849-24396056348f`

Use as `fillImage` fills on rectangles. For the hero texture use a
`fillOpacity` around 0.15–0.25 so it stays a subtle wash behind the headline.
Card placeholders: 16:9 image slot at the top of each feature card, grayscale
photos, plus a tiny caption like "Replace with photography".

## Penpot API quirks learned (V1–V4)

- `lineHeight` is an **em-multiplier string**, values outside ~0.9–1.3 are
  rejected silently; set as e.g. `'1.1'` (px intent: `String((px/size).toFixed(2))`).
- `letterSpacing` is a string; **negative values are not accepted**.
- `alignItems` does not support `'baseline'`.
- Flex `box()` helper in plugin `storage`: for row-direction flex use
  `columnGap`, for column use `rowGap` — V1 initially had zero horizontal
  gaps because only `rowGap` was set.
- `layoutChild` auto sizing (`'auto'`) is unreliable via the plugin; build
  rows with explicit `resize(w, h)` computed from `textBounds`.
- Absolute-positioned children (`layoutChild.absolute = true` +
  `penpotUtils.setParentXY`) drift until layout settles — wait ~400–600ms,
  re-read the anchor shape position, then reposition (do ring/handle math
  from the settled position).
- Shadows: `shape.shadows = [{ style:'drop-shadow', offsetX, offsetY, blur,
  spread, color: { color:'#1D1D1F', opacity: 0.1 } }]`.
- Text stroke not available; dashed strokes via `strokeStyle: 'dashed'`.

## Verify

- No text overflows its fixed box (`textBounds.width <= shape.width + 2`).
- All boards contained in parents (allow the Ticker overflow exception).
- Ring/handle geometry matches the anchor element after layout settles.
- Board height settles (compare two reads 1.2s apart).
