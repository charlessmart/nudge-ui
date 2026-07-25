# Design Tool Styling Pipeline Resources

## Knowledge

- [CSSStyleSheet.cssRules — MDN](https://developer.mozilla.org/en-US/docs/Web/API/CSSStyleSheet/cssRules)
  Use for the browser API that exposes a stylesheet's live `CSSRuleList`, which is the starting point for the runtime rule walk.
- [CSSStyleSheet — MDN](https://developer.mozilla.org/en-US/docs/Web/API/CSSStyleSheet)
  Use for how stylesheets, rules, owner nodes, linked stylesheets, and cross-origin access fit together.
- [CSSStyleRule — MDN](https://developer.mozilla.org/en-US/docs/Web/API/CSSStyleRule)
  Use for the relationship between `selectorText`, `style`, and a concrete CSS style rule.
- [Window.getComputedStyle() — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/getComputedStyle)
  Use for the browser's resolved style output after active stylesheets and computation have been applied.
- [Tailwind CSS functions and directives](https://tailwindcss.com/docs/functions-and-directives)
  Use for Tailwind v4's CSS-first configuration and its relationship to legacy JavaScript configuration.
- [Sprinkles — vanilla-extract](https://vanilla-extract.style/documentation/sprinkles-api/)
  Use for the zero-runtime atomic CSS model and generated utility classes.
- [Theming — vanilla-extract](https://vanilla-extract.style/documentation/theming/)
  Use for the distinction between a human-readable theme contract and emitted hashed CSS custom properties.
- [Token inventory and CSS-value conformance harness](./docs/features/token-inventory-conformance-harness.md)
  Repository source of truth for the authored/token/computed/capability contract.
- [Conformance harness implementation notes](./docs/features/token-conformance-harness-notes.md)
  Repository notes on fixture design, adapter seams, and known evidence gaps.

## Wisdom (Communities)

No community resource selected yet. The current mission is repository fluency; revisit this when practical debugging experience raises questions that documentation cannot answer.

## Gaps

- A primary source explaining the exact browser cascade attribution problem from the perspective of a tooling author would be useful for a later lesson.
