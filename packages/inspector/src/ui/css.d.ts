declare module "*.css?inline" {
  const css: string;
  export default css;
}

declare module "*.svg" {
  const source: string;
  export default source;
}
