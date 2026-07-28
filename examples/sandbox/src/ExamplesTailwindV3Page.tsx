import "./examples.css";
import { exId, ExampleCard, CategorySection } from "./examples-shared";

function Tw3Spacing() {
  return (
    <>
      <ExampleCard id={exId("Spacing", "tw3", 1)} label="config-spacing" utilities="p-3">
        <div className="spacing-specimen p-3">config p-3 = 0.75rem</div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "tw3", 2)} label="config-axis" utilities="px-3 py-2">
        <div className="spacing-specimen px-3 py-2">axis with config 3</div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "tw3", 3)} label="config-margin" utilities="m-3">
        <div className="spacing-specimen m-3">margin config 3</div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "tw3", 4)} label="config-gap" utilities="gap-3">
        <div className="flex-row-gap gap-3">
          <span className="spacing-specimen px-2 py-1">A</span>
          <span className="spacing-specimen px-2 py-1">B</span>
          <span className="spacing-specimen px-2 py-1">C</span>
        </div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "tw3", 5)} label="standard-margin" utilities="mt-4 mb-2">
        <div className="spacing-specimen mt-4 mb-2">standard margins</div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "tw3", 6)} label="directional" utilities="pl-4 pr-8 pt-2 pb-2">
        <div className="spacing-specimen pl-4 pr-8 pt-2 pb-2">all directions</div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "tw3", 7)} label="negative-margin" utilities="-ml-1 -mt-1">
        <div className="spacing-specimen--negative -ml-1 -mt-1 px-4 py-2">negative</div>
      </ExampleCard>
    </>
  );
}

function Tw3Typography() {
  return (
    <>
      <ExampleCard id={exId("Typography", "tw3", 1)} label="size+weight" utilities="text-lg font-semibold">
        <span className="typography-specimen text-lg font-semibold">Config-driven typography.</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "tw3", 2)} label="brand-color" utilities="text-brand">
        <span className="typography-specimen text-brand">Brand token foreground color.</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "tw3", 3)} label="size+tracking" utilities="text-sm tracking-wider">
        <span className="typography-specimen text-sm tracking-wider">Small with wider letter spacing.</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "tw3", 4)} label="brand-opacity" utilities="text-2xl font-bold text-brand/80">
        <span className="typography-specimen text-2xl font-bold text-brand/80">Headline with brand + opacity.</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "tw3", 5)} label="mono-xs" utilities="font-mono text-xs">
        <span className="typography-specimen font-mono text-xs">Monospace tiny label token.</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "tw3", 6)} label="right+underline" utilities="text-right underline">
        <span className="typography-specimen text-right underline block">Aligned right with a line.</span>
      </ExampleCard>
    </>
  );
}

function Tw3Color() {
  return (
    <>
      <ExampleCard id={exId("Color", "tw3", 1)} label="brand-fg" utilities="text-brand">
        <div className="color-specimen px-6 py-4 text-brand bg-stone-800">brand foreground</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "tw3", 2)} label="brand-opacity" utilities="bg-brand/10 text-brand">
        <div className="color-specimen px-6 py-4 bg-brand/10 text-brand">brand 10% wash</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "tw3", 3)} label="brand-border" utilities="border border-brand/30 bg-brand/5 text-brand">
        <div className="color-specimen px-6 py-4 border border-brand/30 bg-brand/5 text-brand">brand border + wash</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "tw3", 4)} label="brand-bg" utilities="bg-brand text-white">
        <div className="color-specimen px-6 py-4 bg-brand text-white">solid brand bg</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "tw3", 5)} label="multi-opacity" utilities="bg-brand/30 text-brand/50 border border-brand/20">
        <div className="color-specimen px-6 py-4 bg-brand/30 text-brand/50 border border-brand/20">multi-level opacity</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "tw3", 6)} label="accent" utilities="bg-accent text-accent-foreground">
        <div className="color-specimen px-6 py-4" style={{ backgroundColor: "#abcdef", color: "#0a1929" }}>accent bg</div>
      </ExampleCard>
    </>
  );
}

function Tw3Border() {
  return (
    <>
      <ExampleCard id={exId("Border", "tw3", 1)} label="brand" utilities="border border-brand">
        <div className="border-specimen border border-brand">brand border</div>
      </ExampleCard>
      <ExampleCard id={exId("Border", "tw3", 2)} label="brand-opacity" utilities="border-2 border-brand/20">
        <div className="border-specimen border-2 border-brand/20">brand 20%</div>
      </ExampleCard>
      <ExampleCard id={exId("Border", "tw3", 3)} label="side" utilities="border-b-2 border-brand">
        <div className="border-specimen border-b-2 border-brand">brand bottom</div>
      </ExampleCard>
      <ExampleCard id={exId("Border", "tw3", 4)} label="radius" utilities="rounded-lg border-brand/50 border">
        <div className="border-specimen rounded-lg border border-brand/50">rounded + brand</div>
      </ExampleCard>
      <ExampleCard id={exId("Border", "tw3", 5)} label="thick" utilities="border-b-4 border-brand/50">
        <div className="border-specimen border-b-4 border-brand/50">thick bottom</div>
      </ExampleCard>
      <ExampleCard id={exId("Border", "tw3", 6)} label="dashed" utilities="border-2 border-dashed border-brand/30">
        <div className="border-specimen border-2 border-dashed border-brand/30">dashed brand</div>
      </ExampleCard>
    </>
  );
}

function Tw3Layout() {
  return (
    <>
      <ExampleCard id={exId("Layout", "tw3", 1)} label="config-size" utilities="w-64 h-64">
        <div className="layout-specimen w-64 h-32">config w-64 = 16rem</div>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "tw3", 2)} label="flex" utilities="flex items-center justify-between gap-3">
        <div className="flex items-center justify-between gap-2 w-full">
          <span className="layout-flex-cell flex-1">Left</span>
          <span className="layout-flex-cell flex-1">Mid</span>
          <span className="layout-flex-cell flex-1">Right</span>
        </div>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "tw3", 3)} label="grid" utilities="grid grid-cols-3 gap-2">
        <div className="grid grid-cols-3 gap-2 w-full">
          <span className="layout-grid-cell">1</span>
          <span className="layout-grid-cell">2</span>
          <span className="layout-grid-cell">3</span>
          <span className="layout-grid-cell">4</span>
          <span className="layout-grid-cell">5</span>
          <span className="layout-grid-cell">6</span>
        </div>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "tw3", 4)} label="position" utilities="relative absolute inset-0">
        <div className="layout-position-context flex items-center justify-center">
          <span className="text-[10px] text-neutral-500">context</span>
          <span className="layout-position-badge inset-x-0 bottom-0 text-center rounded-t-none">bottom</span>
        </div>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "tw3", 5)} label="max-w-center" utilities="max-w-md mx-auto">
        <div className="layout-specimen max-w-md mx-auto px-4 py-3 text-center">max-w-md centered</div>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "tw3", 6)} label="overflow" utilities="overflow-hidden aspect-square">
        <div className="layout-aspect-box aspect-square overflow-hidden">1:1 square</div>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "tw3", 7)} label="sticky" utilities="sticky top-0">
        <div className="layout-sticky-context">
          <div className="layout-sticky-header sticky top-0">sticky top</div>
          <div className="layout-sticky-body">Lines scroll beneath the sticky header in this small scrolling region.</div>
        </div>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "tw3", 8)} label="hidden" utilities="hidden">
        <span className="text-[11px] text-neutral-500 italic">not visible on screen</span>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "tw3", 9)} label="flex-col" utilities="flex flex-col flex-1">
        <div className="flex flex-col flex-1 w-full gap-1" style={{ minHeight: 100 }}>
          <span className="layout-flex-cell">top</span>
          <span className="layout-flex-cell flex-1">fill</span>
          <span className="layout-flex-cell">bottom</span>
        </div>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "tw3", 10)} label="fixed" utilities="fixed bottom-0 right-0">
        <div className="layout-position-context flex items-center justify-center h-20">
          <span className="text-[10px] text-neutral-500">context</span>
          <span className="layout-position-badge bottom-0 right-0">BR</span>
        </div>
      </ExampleCard>
    </>
  );
}

export function ExamplesTailwindV3Page() {
  return (
    <main className="examples-page">
      <header className="examples-hero">
        <p>Dev-only showroom</p>
        <h1>Tailwind&nbsp;v3<br />examples.</h1>
        <div className="examples-hero__meta">
          <span>5 categories</span>
          <span>·</span>
          <span>Tailwind v3 only</span>
          <span>·</span>
          <span>selectable specimens</span>
        </div>
      </header>

      <CategorySection
        label="Spacing"
        title="Space between things."
        description="margin, padding, gap — shorthand, directional, negative, arbitrary, config-token values. Select any specimen to inspect."
        frameworkName="Tailwind v3"
        frameworkCssClass="tw3"
      >
        <Tw3Spacing />
      </CategorySection>

      <CategorySection
        label="Typography"
        title="Words on the screen."
        description="font-size, weight, line-height, letter-spacing, font-family, text-decoration, alignment. Tokens, arbitrary values, and opacity-modified colors."
        frameworkName="Tailwind v3"
        frameworkCssClass="tw3"
      >
        <Tw3Typography />
      </CategorySection>

      <CategorySection
        label="Color"
        title="Color fills the form."
        description="background, foreground, border — default tokens, alias tokens, custom config colors, opacity modifiers, and multi-role compositions."
        frameworkName="Tailwind v3"
        frameworkCssClass="tw3"
      >
        <Tw3Color />
      </CategorySection>

      <CategorySection
        label="Border"
        title="Edges and outlines."
        description="border-width, border-style, border-color, border-radius — shorthand decomposition, side-specific overrides, dashed/solid styles, token attribution."
        frameworkName="Tailwind v3"
        frameworkCssClass="tw3"
      >
        <Tw3Border />
      </CategorySection>

      <CategorySection
        label="Layout"
        title="Structure and space."
        description="width, height, display, flex, grid, position, z-index, overflow, aspect-ratio — box model decisions that define the page structure."
        frameworkName="Tailwind v3"
        frameworkCssClass="tw3"
      >
        <Tw3Layout />
      </CategorySection>
    </main>
  );
}
