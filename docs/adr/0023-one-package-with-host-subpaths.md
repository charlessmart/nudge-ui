# ADR-0023: One package with host subpaths

## Status

Accepted.

## Context

Nudge UI published one npm package per host: `@nudge-ui/vite-react`,
`@nudge-ui/nextjs`, `@nudge-ui/astro`, and `@nudge-ui/standalone`. Each depended
on `@nudge-ui/compiler`, `@nudge-ui/css`, `@nudge-ui/inspector`, and `nudge-ui`,
so a single release staged eleven packages that all had to move in lockstep.

The split imposed costs without buying isolation:

- **Version lockstep.** Every package shares one version, so a change anywhere
  republished everything. The package boundary recorded no independent release
  cadence, because there was none.
- **Sideways dependencies.** Astro depends on the Vite integration because Astro
  runs on Vite. Across a package boundary that reads as a host adapter taking a
  dependency on another host adapter, which is what ADR-0007's role separation
  forbids. It is unremarkable as an internal composition.
- **Reuse blocked by layout.** Behaviour needed by two hosts could only be
  shared by publishing it, so it either got duplicated or pushed into a package
  that had no business owning it. The Tailwind opacity grammar was duplicated
  byte-for-byte in the inspector for exactly this reason.

Nobody installs a host adapter on its own merits. They install the one that
matches their build tool.

## Decision

Publish the hosts as subpaths of the primary `nudge-ui` package:

| Subpath | Host |
| --- | --- |
| `nudge-ui/vite` | Vite with React |
| `nudge-ui/next` | Next.js |
| `nudge-ui/astro` | Astro |
| `nudge-ui/static` | Static HTML, plus the `nudge-ui` command |

Every peer dependency is optional. A consumer installing `nudge-ui` for a
static-HTML prototype has no Vite, no Next.js, no Astro, and no React, and must
not be asked to install any of them:

```json
"peerDependenciesMeta": {
  "astro": { "optional": true },
  "next": { "optional": true },
  "react": { "optional": true },
  "react-dom": { "optional": true },
  "vite": { "optional": true }
}
```

This is load-bearing, not cosmetic. Declaring these as required peers would
produce install warnings for every consumer and resolution failures for unused
subpaths, which would make the consolidation worse than the split it replaces.

The hosts remain independent modules under `packages/nudge-ui/src/hosts/`. A
host must not import a sibling host. `scripts/check-package-boundaries.mjs`
enforces this on imports rather than on manifests, which is a finer grain than
the package boundary it replaces: an import is an edge whether or not a manifest
records it. Astro's dependency on Vite is the one documented exception, and it
is permanent, because Astro is a Vite host.

`@nudge-ui/compiler`, `@nudge-ui/css`, and `@nudge-ui/inspector` remain separate
packages for now and are folded in separately. A façade that re-exported them
while they stayed published would leave the release count unchanged.

## Consequences

- A release stages seven packages instead of eleven, heading for four.
- Consumers install one package and import one subpath. The initializer no
  longer maps a framework to a package, only to a subpath.
- Shared behaviour needs no publishing decision, so the pressure that produced
  duplicate implementations is gone.
- The published surface is narrower: the five internal subpaths that existed
  only so hosts could reach shared code (`nudge-ui/transport`,
  `nudge-ui/project-files`, `nudge-ui/project-tokens`,
  `nudge-ui/project-identity`, `nudge-ui/html-identity`) are now private
  modules.
- `@nudge-ui/vite-react`, `@nudge-ui/nextjs`, `@nudge-ui/astro`, and
  `@nudge-ui/standalone` stop receiving releases at 0.1.3 and should be
  deprecated on npm pointing at `nudge-ui`.
- One package means one dependency set, so a dependency needed by one host is
  installed for all of them. This is acceptable while the hosts share most of
  their dependencies; it would need revisiting if a host took on something
  large and exclusive.
