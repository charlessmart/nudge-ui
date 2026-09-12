# `@nudge-ui/compiler`

`@nudge-ui/compiler` contains development-only source compilers that are
independent of a particular host build tool. Host adapters own when and where
these compilers run; this package owns the source-to-source transformation.

The React identity compiler adds stable `data-cid`, `data-src`, and
`data-cprops` attributes and can optionally add semantic component callsite
metadata. It does not write application files or run in production builds.

Host adapters should import the public package entry point or the documented
`./react-identity` subpath. The Vite adapter continues to expose its legacy
`@nudge-ui/vite-react/identity` subpath as a compatibility re-export.
