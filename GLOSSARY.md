# Design Tool Styling Pipeline Glossary

This glossary starts with the CSS vocabulary the user already reports knowing. New runtime and adapter terms will be added only after they are demonstrated in a lesson.

## CSS foundations

**CSS declaration**:
A property/value pair such as `color: var(--text-primary)` inside a CSS rule.
_Avoid_: style value, CSS instruction

**CSS shorthand**:
A CSS property that represents several related longhands, such as `padding: 8px 16px` representing four physical sides.
_Avoid_: CSS shortcut

**CSS custom property**:
A CSS property whose name begins with `--` and whose value can be consumed through `var()`, such as `--space-4`.
_Avoid_: CSS variable, except when explaining informal terminology

**Cascade**:
The browser's process for choosing which applicable declarations win when multiple rules affect the same property.
_Avoid_: rule priority, CSS ordering
