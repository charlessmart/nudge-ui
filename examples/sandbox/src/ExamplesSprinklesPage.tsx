import "./examples.css";
import { exId, ExampleCard, CategorySection } from "./examples-shared";

function SprSpacing() {
  return (
    <>
      <ExampleCard id={exId("Spacing", "spr", 1)} label="padding" utilities="spr-p-4">
        <div className="spacing-specimen spr-p-4">sprinkles padding</div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "spr", 2)} label="axis-padding" utilities="spr-px-6 spr-py-3">
        <div className="spacing-specimen spr-px-6 spr-py-3">sprinkles axis</div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "spr", 3)} label="directional" utilities="spr-pt-8 spr-pb-2">
        <div className="spacing-specimen spr-pt-8 spr-pb-2">top + bottom</div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "spr", 4)} label="margin" utilities="spr-mt-6 spr-ml-4">
        <div className="spacing-specimen spr-mt-6 spr-ml-4">sprinkles margin</div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "spr", 5)} label="gap" utilities="spr-gap-3">
        <div className="flex-row-gap spr-gap-3">
          <span className="spacing-specimen px-2 py-1">A</span>
          <span className="spacing-specimen px-2 py-1">B</span>
          <span className="spacing-specimen px-2 py-1">C</span>
        </div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "spr", 6)} label="auto-margin" utilities="spr-mx-auto">
        <div className="spacing-specimen spr-mx-auto w-3/4">auto margin</div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "spr", 7)} label="unmapped" utilities="spr-p-unknown">
        <div className="spacing-specimen spr-p-unknown">unmapped (raw)</div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "spr", 8)} label="token padding" utilities="spr-p-token">
        <div className="spacing-specimen spr-p-token">var(--space-4)</div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "spr", 9)} label="token gap" utilities="spr-gap-token">
        <div className="flex-row-gap spr-gap-token">
          <span className="spacing-specimen px-2 py-1">A</span>
          <span className="spacing-specimen px-2 py-1">B</span>
          <span className="spacing-specimen px-2 py-1">C</span>
        </div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "spr", 10)} label="token margin" utilities="spr-mt-token">
        <div className="spacing-specimen spr-mt-token" style={{ padding: "4px" }}>var(--space-6)</div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "spr", 11)} label="token width" utilities="spr-w-token">
        <div className="spacing-specimen spr-w-token" style={{ padding: "4px" }}>var(--space-10)</div>
      </ExampleCard>
    </>
  );
}

function SprTypography() {
  return (
    <>
      <ExampleCard id={exId("Typography", "spr", 1)} label="size" utilities="spr-text-lg">
        <span className="typography-specimen spr-text-lg">Large sprinkles font size.</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "spr", 2)} label="weight" utilities="spr-font-bold spr-text-sm">
        <span className="typography-specimen spr-font-bold spr-text-sm">Bold small text.</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "spr", 3)} label="brand" utilities="spr-text-brand spr-font-semibold">
        <span className="typography-specimen spr-text-brand spr-font-semibold">Token-mapped color + weight.</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "spr", 4)} label="leading" utilities="spr-leading-relaxed">
        <span className="typography-specimen spr-leading-relaxed">Relaxed line height for body copy that runs across multiple lines.</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "spr", 5)} label="mono" utilities="spr-font-mono spr-text-xs spr-tracking-wide">
        <span className="typography-specimen spr-font-mono spr-text-xs spr-tracking-wide">monospace x tracking x size.</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "spr", 6)} label="center" utilities="spr-text-center spr-text-lg">
        <span className="typography-specimen spr-text-center spr-text-lg block">Centered text alignment.</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "spr", 7)} label="accent" utilities="spr-text-accent spr-font-semibold">
        <span className="typography-specimen spr-text-accent spr-font-semibold">Accent token color.</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "spr", 8)} label="token size" utilities="spr-text-xl">
        <span className="typography-specimen spr-text-xl">var(--font-size-xl)</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "spr", 9)} label="token leading" utilities="spr-leading-normal">
        <span className="typography-specimen spr-leading-normal">var(--leading-normal) for body copy that wraps naturally across a few lines of readable text.</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "spr", 10)} label="token font" utilities="spr-font-sans spr-text-base">
        <span className="typography-specimen spr-font-sans spr-text-base">var(--font-sans) base size token</span>
      </ExampleCard>
    </>
  );
}

function SprColor() {
  return (
    <>
      <ExampleCard id={exId("Color", "spr", 1)} label="brand-fg" utilities="spr-text-brand">
        <div className="color-specimen px-6 py-4 spr-text-brand bg-stone-800">brand token color</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "spr", 2)} label="brand-bg" utilities="spr-bg-brand spr-text-white">
        <div className="color-specimen px-6 py-4 spr-bg-brand text-white">brand token bg</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "spr", 3)} label="accent" utilities="spr-text-accent spr-font-semibold">
        <div className="color-specimen px-6 py-4 spr-text-accent bg-stone-800">accent token fg</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "spr", 4)} label="bg-token-text-raw" utilities="spr-bg-accent spr-text-stone-900">
        <div className="color-specimen px-6 py-4 spr-bg-accent spr-text-stone-900">bg: token · text: raw class</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "spr", 5)} label="brand-opacity" utilities="spr-bg-brand/10 spr-text-brand">
        <div className="color-specimen px-6 py-4 spr-bg-brand/10 spr-text-brand">brand 10% wash</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "spr", 6)} label="accent-opacity" utilities="spr-bg-accent/20 spr-text-accent">
        <div className="color-specimen px-6 py-4 spr-bg-accent/20 spr-text-accent">accent 20% wash</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "spr", 7)} label="raw-no-token" utilities="spr-bg-unknown">
        <div className="color-specimen px-6 py-4 spr-bg-unknown text-purple-100">CSS applies but no token</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "spr", 8)} label="primary" utilities="spr-bg-primary spr-text-primary">
        <div className="color-specimen px-6 py-4 spr-bg-primary spr-text-primary">var(--color-primary)</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "spr", 9)} label="success" utilities="spr-bg-success spr-text-success">
        <div className="color-specimen px-6 py-4 spr-bg-success spr-text-success">var(--color-success)</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "spr", 10)} label="warning" utilities="spr-bg-warning spr-text-warning">
        <div className="color-specimen px-6 py-4 spr-bg-warning spr-text-warning">var(--color-warning)</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "spr", 11)} label="danger" utilities="spr-bg-danger spr-text-danger">
        <div className="color-specimen px-6 py-4 spr-bg-danger spr-text-danger">var(--color-danger)</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "spr", 12)} label="info" utilities="spr-bg-info spr-text-info">
        <div className="color-specimen px-6 py-4 spr-bg-info spr-text-info">var(--color-info)</div>
      </ExampleCard>
    </>
  );
}

function SprBorder() {
  return (
    <>
      <ExampleCard id={exId("Border", "spr", 1)} label="basic" utilities="spr-border">
        <div className="border-specimen spr-border">sprinkles border</div>
      </ExampleCard>
      <ExampleCard id={exId("Border", "spr", 2)} label="width" utilities="spr-border-2 spr-border-brand">
        <div className="border-specimen spr-border-2 spr-border-brand">2px brand</div>
      </ExampleCard>
      <ExampleCard id={exId("Border", "spr", 3)} label="brand-opacity" utilities="spr-border spr-border-brand/30 spr-bg-brand/5">
        <div className="border-specimen spr-border spr-border-brand/30 spr-bg-brand/5">brand 30%</div>
      </ExampleCard>
      <ExampleCard id={exId("Border", "spr", 4)} label="dashed" utilities="spr-border spr-border-dashed spr-border-accent">
        <div className="border-specimen spr-border spr-border-dashed spr-border-accent">dashed accent</div>
      </ExampleCard>
      <ExampleCard id={exId("Border", "spr", 5)} label="bottom" utilities="spr-border spr-border-b-4 spr-border-brand">
        <div className="border-specimen spr-border spr-border-b-4 spr-border-brand">bottom emphasis</div>
      </ExampleCard>
      <ExampleCard id={exId("Border", "spr", 6)} label="radius" utilities="spr-border spr-rounded-md">
        <div className="border-specimen spr-border spr-rounded-md">rounded-md</div>
      </ExampleCard>
      <ExampleCard id={exId("Border", "spr", 7)} label="radius-xl" utilities="spr-border spr-rounded-xl">
        <div className="border-specimen spr-border spr-rounded-xl">rounded-xl</div>
      </ExampleCard>
      <ExampleCard id={exId("Border", "spr", 8)} label="unmapped" utilities="spr-border-unknown spr-rounded-unknown">
        <div className="border-specimen spr-border-unknown spr-rounded-unknown">unmapped</div>
      </ExampleCard>
      <ExampleCard id={exId("Border", "spr", 9)} label="thick primary" utilities="spr-border-thick spr-border-primary">
        <div className="border-specimen spr-border-thick spr-border-primary" style={{ borderStyle: "solid", color: "#a1a1aa" }}>var(--border-width-thick) var(--color-primary)</div>
      </ExampleCard>
      <ExampleCard id={exId("Border", "spr", 10)} label="radius-lg" utilities="spr-rounded-lg">
        <div className="border-specimen border border-stone-700 spr-rounded-lg">var(--radius-lg)</div>
      </ExampleCard>
    </>
  );
}

function SprLayout() {
  return (
    <>
      <ExampleCard id={exId("Layout", "spr", 1)} label="width+height" utilities="spr-w-64 spr-h-32">
        <div className="layout-specimen spr-w-64 spr-h-32">256 × 128</div>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "spr", 2)} label="fractional" utilities="spr-w-1/2">
        <div className="layout-specimen spr-w-1/2 px-3 py-2">w-1/2 → 50%</div>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "spr", 3)} label="max-w" utilities="spr-max-w-sm spr-mx-auto">
        <div className="layout-specimen spr-max-w-sm mx-auto px-4 py-3 text-center">max-w-sm + auto margin</div>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "spr", 4)} label="flex" utilities="spr-flex spr-items-center spr-justify-between spr-gap-3">
        <div className="spr-flex spr-items-center spr-justify-between spr-gap-3">
          <span className="layout-flex-cell spr-flex-1">A</span>
          <span className="layout-flex-cell spr-flex-1">B</span>
          <span className="layout-flex-cell spr-flex-1">C</span>
        </div>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "spr", 5)} label="flex-col" utilities="spr-flex spr-flex-col spr-flex-1">
        <div className="spr-flex spr-flex-col spr-flex-1 w-full" style={{ minHeight: 100, gap: 4 }}>
          <span className="layout-flex-cell">header</span>
          <span className="layout-flex-cell spr-flex-1">fill</span>
          <span className="layout-flex-cell">footer</span>
        </div>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "spr", 6)} label="grid" utilities="spr-grid spr-grid-cols-3 spr-gap-3">
        <div className="spr-grid spr-grid-cols-3 w-full" style={{ gap: 8 }}>
          <span className="layout-grid-cell">1</span>
          <span className="layout-grid-cell">2</span>
          <span className="layout-grid-cell">3</span>
          <span className="layout-grid-cell">4</span>
          <span className="layout-grid-cell">5</span>
          <span className="layout-grid-cell">6</span>
        </div>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "spr", 7)} label="span" utilities="spr-grid spr-grid-cols-3 spr-col-span-2">
        <div className="spr-grid spr-grid-cols-3 w-full" style={{ gap: 8 }}>
          <span className="layout-grid-cell spr-col-span-2">span 2</span>
          <span className="layout-grid-cell">3</span>
        </div>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "spr", 8)} label="position" utilities="spr-relative spr-absolute spr-top-0 spr-right-0">
        <div className="layout-position-context spr-flex spr-items-center spr-justify-center">
          <span className="text-[10px] text-neutral-500">context</span>
          <span className="layout-position-badge spr-top-0 spr-right-0">TR</span>
        </div>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "spr", 9)} label="sticky" utilities="spr-sticky spr-top-0 spr-z-10">
        <div className="layout-sticky-context">
          <div className="layout-sticky-header spr-sticky spr-top-0 spr-z-10">sticky top z-10</div>
          <div className="layout-sticky-body">Content scrolls beneath this sticky header line inside the small region.</div>
        </div>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "spr", 10)} label="overflow" utilities="spr-overflow-hidden">
        <div className="layout-overflow-box spr-overflow-hidden">
          <p>Line one overflows.</p>
          <p>Line two hidden.</p>
          <p>Line three clipped.</p>
        </div>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "spr", 11)} label="aspect" utilities="spr-aspect-video">
        <div className="layout-aspect-box spr-aspect-video">16:9</div>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "spr", 12)} label="size" utilities="spr-size-16 spr-aspect-square">
        <div className="layout-specimen spr-size-16 spr-aspect-square">64×64</div>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "spr", 13)} label="hidden" utilities="spr-hidden">
        <span className="text-[11px] text-neutral-500 italic">hidden via sprinkles</span>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "spr", 14)} label="unmapped" utilities="spr-w-unknown spr-h-unknown">
        <div className="layout-specimen spr-w-unknown spr-h-unknown">unmapped (raw)</div>
      </ExampleCard>
    </>
  );
}

export function ExamplesSprinklesPage() {
  return (
    <main className="examples-page">
      <header className="examples-hero">
        <p>Dev-only showroom</p>
        <h1>Sprinkles<br />examples.</h1>
        <div className="examples-hero__meta">
          <span>5 categories</span>
          <span>·</span>
          <span>Sprinkles only</span>
          <span>·</span>
          <span>selectable specimens</span>
        </div>
      </header>

      <CategorySection
        label="Spacing"
        title="Space between things."
        description="margin, padding, gap — shorthand, directional, negative, arbitrary, config-token values. Select any specimen to inspect."
        frameworkName="Sprinkles"
        frameworkCssClass="spr"
      >
        <SprSpacing />
      </CategorySection>

      <CategorySection
        label="Typography"
        title="Words on the screen."
        description="font-size, weight, line-height, letter-spacing, font-family, text-decoration, alignment. Tokens, arbitrary values, and opacity-modified colors."
        frameworkName="Sprinkles"
        frameworkCssClass="spr"
      >
        <SprTypography />
      </CategorySection>

      <CategorySection
        label="Color"
        title="Color fills the form."
        description="background, foreground, border — default tokens, alias tokens, custom config colors, opacity modifiers, and multi-role compositions."
        frameworkName="Sprinkles"
        frameworkCssClass="spr"
      >
        <SprColor />
      </CategorySection>

      <CategorySection
        label="Border"
        title="Edges and outlines."
        description="border-width, border-style, border-color, border-radius — shorthand decomposition, side-specific overrides, dashed/solid styles, token attribution."
        frameworkName="Sprinkles"
        frameworkCssClass="spr"
      >
        <SprBorder />
      </CategorySection>

      <CategorySection
        label="Layout"
        title="Structure and space."
        description="width, height, display, flex, grid, position, z-index, overflow, aspect-ratio — box model decisions that define the page structure."
        frameworkName="Sprinkles"
        frameworkCssClass="spr"
      >
        <SprLayout />
      </CategorySection>
    </main>
  );
}
