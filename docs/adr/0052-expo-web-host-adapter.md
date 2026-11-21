# ADR-0052: Expo web host Adapter

Date: 2026-11-15
Status: Accepted

## Context

Nudge inspects a browser document. An Expo app reaches one through react-native-web, bundled by Metro and served
by the Expo CLI development server. None of the existing hosts fit:

- **Metro is not Vite, Webpack or Turbopack.** It takes one Babel transformer module (`transformer.babelTransformerPath`),
  which it `require`s inside worker threads, plus `resolver.resolveRequest`, `serializer.getPolyfills` and the
  deprecated `server.enhanceMiddleware`. It has no virtual modules and no loader chain.
- **Expo serves the web document before Metro's middleware.** Its manifest middleware is prepended to the stack and
  answers `/` with the single-page template; static and server output render pages through middleware that runs
  after Metro's. A Metro config cannot rewrite the HTML of every page, so the bootstrap cannot be injected the way
  the static, Astro or Vite hosts inject it.
- **React Native has no lowercase host elements.** `<View>` and `<Text>` are components imported from
  `react-native`. react-native-web drops unknown props, including `data-*` props, so the identity attributes the
  compiler writes on JSX never reach the DOM. It does forward a `dataSet` prop as `data-*` attributes.
- **Styles are not CSS in source.** react-native-web turns `StyleSheet` objects into atomic classes. The inspector can
  read and preview the CSS, but an agent must write React Native styles: camelCase keys, unitless numbers, no cascade.

## Decision

Add an Expo host at `nudge-ui/expo`, exported as `withNudgeUi(metroConfig, options)` for `metro.config.js`. It instruments
only when `NODE_ENV` is `development` (which the Expo CLI sets for `expo start` and replaces for `expo export`) and
Nudge UI is enabled, and otherwise returns the config untouched.

### Metro hooks

- **Transform.** `babelTransformerPath` becomes `dist/hosts/expo/babel-transformer.cjs`, a CommonJS bundle like the
  Next.js loaders. It instruments project `.tsx`/`.jsx` files when Metro's options say `dev` and platform `web`, then
  hands the result to the project's own transformer, or to `@expo/metro-config/babel-transformer` resolved from the
  project. iOS and Android bundles are never instrumented. Server renders (`environment: node` or `react-server`) get
  identity without the browser component runtime, so server HTML and the hydrated DOM carry the same attributes.
  Settings travel to workers in `NUDGE_UI_EXPO_TRANSFORM`, because Metro passes no custom transformer options; they are
  part of the transformer's cache key.
- **Bootstrap.** `withNudgeUi` writes `.nudge/expo/bootstrap.js` (with a `.gitignore` of `*`) and appends it to
  `getPolyfills` for the web platform only. Metro runs polyfills before any module, so the React renderer capture
  (ADR-0034) and the document head script run before React DOM loads, as they do in other hosts' `<head>`. The
  polyfill then adds the client `<script>`. When Expo has answered an `?nudge-ui=editor` request with the app's own
  document, the polyfill moves to `/__nudge_ui__/editor?url=…`.
- **Routes.** `enhanceMiddleware` puts the shared reserved routes (`createReservedRoutes`) ahead of Metro's middleware,
  so the client, manifest, reload stream, flows, artifacts and the editor document are served in-process. No sidecar is
  needed: Metro's middleware already runs in the CLI's Node process.
- **Resolution.** `resolveRequest` resolves `react` and `react-dom` (and their subpaths) imported from inside Nudge UI
  as if from the project, so the component runtime uses the application's React. `watchFolders` gains Nudge UI's
  package directory when a workspace link puts it outside the project.

### React Native framework Adapter

`createReactNativeComponentFramework(primitiveModules)` in `hosts/componentFramework` extends the React Adapter. Its id
stays `react`, because the runtime Adapter (fibers, the DevTools seam) is React's. It differs in three ways:

- elements whose binding is imported from a **primitive module** (`react-native` and `react-native-web` by default) are
  host elements: they carry `cid`, `src` and `cprops` in `dataSet`, merged under any authored `dataSet` so the author's
  keys win, they take their `cid` from the enclosing component like a `<div>` does, and they are neither wrapped nor
  registered as component callsites;
- package contracts are not read for primitive modules, whose prop types describe the platform rather than the app;
- it has no sheet runtime yet, so the library lists components but opens no sheets.

The compiler gains the `primitiveModules` option; it still knows no framework or package by name.

### Runtime and prompt

The runtime host is `expo` and the framework label `React Native`. When the framework is React Native and the prompt
contains element style changes, it adds one paragraph asking for React Native styles on the element's `style` prop or
`StyleSheet` entry, valid on iOS and Android, instead of CSS.

## Consequences

- An Expo project gets the inspector, Canvas, component semantics with live prop preview, flows and the prompt on
  `expo start --web`. Native platforms are not inspected; edits made on the web are handed to the agent as React Native
  styles and apply to every platform the source targets.
- Metro receives no input source map from a Babel transformer. Identity attributes are inserted on the lines they
  annotate and the runtime binding joins the first line after any directive prologue, so line numbers in stack traces
  stay exact while columns on instrumented lines shift in the web development bundle.
- The transformer resolves no imports, so it supplies no host component policy (ADR-0021). Imported project components
  are registered rather than wrapped, which ADR-0034 already names at runtime; wrapping-only behaviour is unavailable
  until the Metro host can resolve imports.
- Components from libraries outside the primitive list keep the `data-*` path. If they render a react-native-web
  primitive and drop unknown props, their DOM output has no identity of its own; the runtime still names the callsite
  from its fiber. Libraries that forward `dataSet` can be listed in `primitiveModules`.
- Tokens come from the shared project stylesheet scan, so an app styled with `StyleSheet` alone has no tokens, while
  one using NativeWind's Tailwind stylesheet gets the Tailwind dialect.
- Expo answers `/` before Metro in single-page output, so the editor at the root route takes one extra redirect.
- `metro.config.js` is CommonJS and the subpath is ESM, so the host needs `require(esm)`: Node.js 20.19+ or 22.12+.
- The initializer does not detect Expo yet.

## Verification

- Compiler tests cover `dataSet` identity, merging with an authored `dataSet`, namespaced primitives, callsite
  registration of non-primitives, and the unchanged path for other modules.
- Expo host tests cover the transform's platform, development and server gates, line preservation, directive prologues,
  source-root scope, the config's development gate, transformer and polyfill wiring, React resolution, watch folders,
  and the reserved routes served ahead of Metro.
- A smoke test `require`s the built `babel-transformer.cjs` with a stand-in upstream transformer and checks web output
  and an untouched iOS module.
- No example app runs Expo yet; the first end-to-end check is the `rider` app.
