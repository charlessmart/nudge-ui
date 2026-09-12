# `@nudge-ui/compiler`

`@nudge-ui/compiler` contains development-only source compilers that are
independent of a particular host build tool. Host adapters own when and where
these compilers run; this package owns the source-to-source transformation.

The React identity compiler adds stable `data-cid`, `data-src`, and
`data-cprops` attributes and can optionally add semantic component callsite
metadata. It does not write application files or run in production builds.

Host adapters should import the public package entry point or the documented
`./react-identity` subpath. For semantic component callsites, adapters resolve
each JSX binding through `resolveHostComponentPolicy`. The Adapter supplies
build-tool resolution, project-source ownership, and stable source paths; the
compiler follows aliases and re-export chains and returns a data-only policy.
Unknown package protocols fail closed and produce diagnostics.

Compatibility knowledge is catalog data, not compiler control flow. The
default React catalog includes React Router's structural elements. Hosts can
merge additional package protocols with `mergeComponentModuleProtocols` and
declare which JSX-valued slots render their contents.

A component that traces to project-owned source — including a definition
authored in the same module — defaults to `wrap: true` with
`children: "rendered"`. Its authored children are traversed, while every named
JSX prop stays opaque until a host protocol declares that slot. A component
that resolves to an unknown package protocol is left untouched and reported
through `ComponentPolicyDiagnostic`; `groupComponentPolicyDiagnostics` and
`formatComponentPolicyWarning` render those for host loggers.

Identity paths (`data-src`, `callsiteId`, `componentId`) are relative to the
identity root a host supplies. A module outside it keeps a `../`-prefixed
relative path rather than a machine path, so workspace packages stay unique
across roots and portable across machines.

The Vite adapter continues to expose its legacy
`@nudge-ui/vite-react/identity` subpath as a compatibility re-export.
