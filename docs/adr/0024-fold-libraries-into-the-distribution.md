# ADR-0024: Fold the compiler, CSS, and inspector into the distribution

## Status

Accepted. Completes the consolidation begun in
[ADR-0023](./0023-one-package-with-host-subpaths.md).

## Context

ADR-0023 folded the four host adapters into `nudge-ui` and deferred
`@nudge-ui/compiler`, `@nudge-ui/css`, and `@nudge-ui/inspector`. Those three
were published packages that no consumer installs directly: hosts depend on
them, and `nudge-ui` depends on the hosts.

Leaving them published would have kept the release count at seven and made
`nudge-ui` a façade over separately versioned internals — the outcome the
consolidation was meant to avoid.

The split also had a concrete cost beyond release mechanics. Because the
inspector and the CSS model compiled as separate TypeScript programs, they
could not share a type vocabulary directly. Three files declared the same
ambient `virtual:design-tokens` module so each program had the words for it,
and the inspector imported CSS model *types* from that ambient declaration
rather than from the model. The virtual module is a runtime transport; it was
serving as a type channel only because no direct one existed.

## Decision

Fold all three into `packages/nudge-ui/src/` as internal directories:
`compiler/`, `css/`, and `inspector/`.

The published surface grows by only what genuinely crosses the boundary:

| Subpath | Why it is public |
| --- | --- |
| `nudge-ui/client` | Served over HTTP to the inspected page. |
| `nudge-ui/inspector` | The bootstrap API, injected into consumer bundles. |
| `nudge-ui/component-runtime` | Injected into consumer source by the compiler. |
| `nudge-ui/host-runtime` | The runtime bridge for host-side component semantics. |
| `nudge-ui/testing` | Conformance fixtures consumers use in their own tests. |
| `nudge-ui/virtual-design-tokens` | Ambient types for the transport module. |

Everything else — the compiler, the token inventory, the CSS dialects, the
inspector's internals — is private. The inspector's seven export subpaths and
the CSS package's six collapse to the six entries above.

The inspector now imports CSS model types from the model. The duplicated
ambient declarations in the Next.js and static hosts are deleted; the
inspector's own declarations cover the whole program.

The browser-safety guard in `src/css/importGraph.test.ts` survives the move and
changes what it forbids: it used to bar imports of the `@nudge-ui/inspector`
and `@nudge-ui/plugin` package names, and now bars relative imports into the
sibling `inspector/` and `hosts/` directories. The rule is the same — the
browser-safe CSS model must not reach into React, Node, or build tooling — but
it is now expressed in the terms the code actually uses.

## Consequences

- Four published packages: `nudge-ui`, `create-nudge-ui`, `@nudge-ui/mcp`, and
  `@nudge-ui/agent-protocol`. Down from eleven.
- `@nudge-ui/css` and `@nudge-ui/inspector` stop receiving releases at 0.1.3 and
  should be deprecated on npm pointing at `nudge-ui`. `@nudge-ui/compiler` was
  never published.
- The inspector's internal organisation is unchanged and remains out of scope,
  as noted when this plan was adopted. Folding it in does not reorganise it.
- One TypeScript program covers the compiler, the CSS model, the inspector, and
  every host, so a change that breaks a consumer breaks the build immediately
  rather than at the next release.
- A consumer can no longer install the inspector without the hosts. Nobody was
  doing that, and the optional peer dependencies from ADR-0023 mean the unused
  hosts cost nothing at install time.
