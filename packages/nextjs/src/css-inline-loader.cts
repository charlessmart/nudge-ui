/**
 * Turbopack/webpack loader replicating Vite's `*.css?inline` convention
 * (ADR-0010): the queried import must yield the stylesheet TEXT as a
 * default export so the inspector can inject it into its shadow root.
 *
 * Registered by `withNudgeUi` for `*.css` requests whose query carries
 * `?inline`; plain CSS requests never match and flow through Next's normal
 * CSS pipeline.
 *
 * CommonJS `.cts` for the same LoaderRunner reasons as the identity loader.
 */
module.exports = function cssInlineLoader(source: string): string {
  return `export default ${JSON.stringify(source)};`;
};
