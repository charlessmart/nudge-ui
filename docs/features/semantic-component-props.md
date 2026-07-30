# Semantic component prop editing

**Status:** React/Vite v1 slice implemented
**Decision:** ADR-0007

## User outcome

Selecting a host element rendered by a typed React design-system component can
surface presentational component props such as `variant`, `size`, and
`disabled`. Changing a control rerenders the real component with a dev-only
override, records semantic intent, and generates an invocation-oriented coding
prompt.

CSS and token editors remain available independently. A component prop change
does not synthesize CSS declarations.

## V1 contract discovery

The Vite plugin scans project-owned `.tsx`/`.jsx` sources and extracts:

- string, number, or boolean literal unions as select controls; and
- boolean props as boolean controls.

It supports inline annotations, local interfaces/type aliases, intersections,
and `React.FC<Props>` declarations. Arbitrary strings/numbers, callbacks,
objects, children, and imported type graphs are not inferred in v1.

An npm design-system package may publish framework-neutral contracts and pass
them once through `componentMetadata`:

```ts
import { componentMetadata } from "@work/design-system/design-tool";

designTool({
  componentMetadata,
  vanillaExtract: {
    // Existing Sprinkles token/class attribution.
  },
});
```

Package components are identified by module plus export, for example
`@work/design-system#Button`. Their source is not transformed. The consuming
application invocation is instrumented, so the real imported component still
receives the preview props.

Component invocation instrumentation is limited to files contained by Vite's
resolved application root. This includes an internal `/ui` folder without
depending on a particular repository layout, while excluding the inspector,
workspace packages, virtual modules, and `node_modules`.

## Runtime flow

1. The dev Vite transform wraps custom JSX invocation sites with source,
   component, and authored-prop metadata.
2. The React Adapter renders a no-DOM override boundary around the existing
   element.
3. Selection starts from a host DOM node and resolves instrumented component
   ancestry inside the React Adapter.
4. The Inspector joins runtime targets to the build-time contract catalog.
5. A control emits a canonical `component-prop` change.
6. The React Adapter receives the complete semantic projection and rerenders
   matching source-site invocations.
7. History, persistence, Changes, and prompt generation read the same
   canonical delta.

## Canonical change and projection seams

The change ledger owns only canonical state, undo/redo, revert, and
subscriptions. Pure change-model functions own identity, baseline equality,
and merge semantics. Runtime application is a separate projection that sends
element/token changes to the managed stylesheet and component changes to the
framework Adapter.

A component prop change stores only semantic intent:

- a typed component target and source callsite;
- the prop name;
- a structural baseline (`default` or a typed value);
- the typed requested value; and
- how the prop was authored.

CSS selectors, token placeholders, display strings, preview-conflict state, and
fixed scope markers are not part of a component change. UI labels, prompt
values, runtime overrides, and the explicit durable-session schema are derived
at their respective seams.

## Framework seam

The Inspector-facing model contains a closed framework discriminator,
module-qualified component
identity, callsite identity, evaluated props, and a scalar prop contract. React
Fiber traversal, element cloning, and override subscriptions stay private to
the React runtime Adapter.

A future Vue Adapter can supply the same model from Vue SFC contract extraction
and VNode prop projection without changing the Inspector controls or canonical
change record.

## V1 limitations

- React + Vite only.
- Inspect mode only; component overrides are not yet sent through the Canvas
  frame protocol.
- Component changes have source-site semantics only; every rendering of one
  invocation is overridden. No scope field is stored until another scope
  actually exists.
- Project inference does not resolve imported TypeScript type graphs.
- Npm packages need a published `componentMetadata` manifest until `.d.ts`
  discovery is added.
- Display-name fallback is used only when exactly one catalog contract matches;
  module-qualified identity wins.
- Props absent from the invocation are not shown until default-value metadata
  is available.
- No source write-back. Prompts distinguish literals, expressions, spreads,
  and omitted/default props.
