import "./examples.css";
import { exId, ExampleCard, CategorySection } from "./examples-shared";

function Tw4Spacing() {
  return (
    <>
      <ExampleCard id={exId("Spacing", "tw4", 1)} label="all-sides" utilities="p-4">
        <div className="spacing-specimen p-4">padding all sides</div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "tw4", 2)} label="axis" utilities="px-8 py-3">
        <div className="spacing-specimen px-8 py-3">axis padding</div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "tw4", 3)} label="margin" utilities="m-2">
        <div className="spacing-specimen m-2">margin all sides</div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "tw4", 4)} label="directional-margin" utilities="mt-6 ml-4">
        <div className="spacing-specimen mt-6 ml-4">side-specific margin</div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "tw4", 5)} label="gap" utilities="gap-4">
        <div className="flex-row-gap gap-4">
          <span className="spacing-specimen px-3 py-2">A</span>
          <span className="spacing-specimen px-3 py-2">B</span>
          <span className="spacing-specimen px-3 py-2">C</span>
        </div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "tw4", 6)} label="space-y" utilities="space-y-2">
        <div className="space-y-2">
          {["A", "B", "C"].map((ch, i) => (
            <div key={i} className="spacing-specimen w-full px-3 py-2">{ch}</div>
          ))}
        </div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "tw4", 7)} label="negative" utilities="-mt-2">
        <div className="spacing-specimen--negative -mt-2 px-4 py-2">negative margin</div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "tw4", 8)} label="arbitrary" utilities="p-[18px]">
        <div className="spacing-specimen p-[18px]">arbitrary: 18px</div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "tw4", 9)} label="inset" utilities="inset-0">
        <div className="spacing-specimen px-3 py-2">inset shorthand</div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "tw4", 10)} label="fractional" utilities="p-0.5">
        <div className="spacing-specimen p-0.5">fractional: 2px</div>
      </ExampleCard>
    </>
  );
}

function Tw4Typography() {
  return (
    <>
      <ExampleCard id={exId("Typography", "tw4", 1)} label="size+weight" utilities="text-sm font-medium">
        <span className="typography-specimen text-sm font-medium">Measured type keeps a dense interface calm.</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "tw4", 2)} label="large+leading" utilities="text-lg font-bold leading-relaxed">
        <span className="typography-specimen text-lg font-bold leading-relaxed">Bold headline with comfortable spacing.</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "tw4", 3)} label="tracking" utilities="tracking-wide">
        <span className="typography-specimen tracking-wide">Wider letter spacing for small caps.</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "tw4", 4)} label="mono" utilities="font-mono text-[10px]">
        <span className="typography-specimen font-mono text-[10px]">monospace arbitrary sizing.</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "tw4", 5)} label="color" utilities="text-blue-400">
        <span className="typography-specimen text-blue-400">Colored text via default token.</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "tw4", 6)} label="decoration" utilities="underline decoration-dashed">
        <span className="typography-specimen underline decoration-dashed">Dashed underline decoration.</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "tw4", 7)} label="balance" utilities="text-center text-balance">
        <span className="typography-specimen text-center text-balance block">Balanced text that wraps evenly on each line for a pleasing shape.</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "tw4", 8)} label="headline" utilities="text-2xl font-semibold tracking-tight">
        <span className="typography-specimen text-2xl font-semibold tracking-tight">A well-considered headline.</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "tw4", 9)} label="opacity" utilities="text-red-400/75">
        <span className="typography-specimen text-red-400/75">Faded color with alpha channel.</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "tw4", 10)} label="body-large" utilities="text-base leading-7">
        <span className="typography-specimen text-base leading-7">Body text at a readable size and generous line height for long-form content.</span>
      </ExampleCard>
    </>
  );
}

function Tw4Color() {
  return (
    <>
      <ExampleCard id={exId("Color", "tw4", 1)} label="default-token" utilities="bg-blue-300 text-blue-950">
        <div className="color-specimen px-6 py-4 bg-blue-300 text-blue-950">default token</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "tw4", 2)} label="fg+bg" utilities="bg-stone-700 text-stone-100">
        <div className="color-specimen px-6 py-4 bg-stone-700 text-stone-100">fg + bg pair</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "tw4", 3)} label="opacity-pair" utilities="bg-orange-700/30 text-orange-100/80">
        <div className="color-specimen px-6 py-4 bg-orange-700/30 text-orange-100/80">opacity 30% / 80%</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "tw4", 4)} label="multi-role" utilities="bg-stone-950 border border-lime-300 text-lime-300">
        <div className="color-specimen px-6 py-4 bg-stone-950 border border-lime-300 text-lime-300">bg + border + fg</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "tw4", 5)} label="tri-opacity" utilities="bg-red-500/10 text-red-100/80 border border-red-400/30">
        <div className="color-specimen px-6 py-4 bg-red-500/10 text-red-100/80 border border-red-400/30">partial wash</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "tw4", 6)} label="simple-pair" utilities="bg-stone-950 text-white">
        <div className="color-specimen px-6 py-4 bg-stone-950 text-white">simple pair</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "tw4", 7)} label="warm" utilities="bg-amber-200 text-amber-950">
        <div className="color-specimen px-6 py-4 bg-amber-200 text-amber-950">warm amber</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "tw4", 8)} label="cool-opacity" utilities="bg-sky-500/20 text-sky-100 border border-sky-300/40">
        <div className="color-specimen px-6 py-4 bg-sky-500/20 text-sky-100 border border-sky-300/40">cool with opacity</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "tw4", 9)} label="swatches" utilities="bg-green-400 bg-red-400 bg-blue-400">
        <div className="color-swatch">
          <div className="color-swatch__chip bg-green-400" />
          <div className="color-swatch__chip bg-red-400" />
          <div className="color-swatch__chip bg-blue-400" />
          <div className="color-swatch__chip bg-yellow-400" />
          <div className="color-swatch__chip bg-purple-400" />
        </div>
      </ExampleCard>
    </>
  );
}

function Tw4Border() {
  return (
    <>
      <ExampleCard id={exId("Border", "tw4", 1)} label="basic" utilities="border border-stone-600">
        <div className="border-specimen border border-stone-600">basic border</div>
      </ExampleCard>
      <ExampleCard id={exId("Border", "tw4", 2)} label="width+color" utilities="border-2 border-red-500">
        <div className="border-specimen border-2 border-red-500">2px red</div>
      </ExampleCard>
      <ExampleCard id={exId("Border", "tw4", 3)} label="side-accent" utilities="border-l-4 border-l-lime-300 border border-stone-700">
        <div className="border-specimen border-l-4 border-l-lime-300 border border-stone-700 rounded-md">accent left edge</div>
      </ExampleCard>
      <ExampleCard id={exId("Border", "tw4", 4)} label="dashed" utilities="border border-dashed border-blue-400">
        <div className="border-specimen border border-dashed border-blue-400">dashed style</div>
      </ExampleCard>
      <ExampleCard id={exId("Border", "tw4", 5)} label="radius" utilities="rounded-xl">
        <div className="border-specimen border border-stone-600 rounded-xl">rounded-xl</div>
      </ExampleCard>
      <ExampleCard id={exId("Border", "tw4", 6)} label="pill" utilities="rounded-full">
        <div className="border-specimen border border-stone-600 rounded-full">rounded-full</div>
      </ExampleCard>
      <ExampleCard id={exId("Border", "tw4", 7)} label="mixed-sides" utilities="border-t-2 border-t-lime-300 border-r-4 border-r-rose-400 border-b-8 border-b-amber-300 border-l border-l-sky-300 border-dashed">
        <div className="border-specimen border-t-2 border-t-lime-300 border-r-4 border-r-rose-400 border-b-8 border-b-amber-300 border-l border-l-sky-300 border-dashed rounded-md">mixed sides</div>
      </ExampleCard>
      <ExampleCard id={exId("Border", "tw4", 8)} label="override" utilities="border-2 border-stone-700 border-b-4 border-b-lime-300">
        <div className="border-specimen border-2 border-stone-700 border-b-4 border-b-lime-300 rounded-lg">bottom emphasis</div>
      </ExampleCard>
      <ExampleCard id={exId("Border", "tw4", 9)} label="split-sides" utilities="border-x border-stone-600 border-y-2 border-y-amber-400">
        <div className="border-specimen border-x border-stone-600 border-y-2 border-y-amber-400 rounded-md">x + y split</div>
      </ExampleCard>
    </>
  );
}

function Tw4Layout() {
  return (
    <>
      <ExampleCard id={exId("Layout", "tw4", 1)} label="w+h" utilities="w-64 h-32">
        <div className="layout-specimen w-64 h-32">256 × 128</div>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "tw4", 2)} label="fractional-width" utilities="w-1/2">
        <div className="layout-specimen w-1/2 px-3 py-2">w-1/2 → 50%</div>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "tw4", 3)} label="max-w-centered" utilities="max-w-sm mx-auto">
        <div className="layout-specimen max-w-sm mx-auto px-4 py-3 text-center">max-w-sm + mx-auto</div>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "tw4", 4)} label="flex-row" utilities="flex items-center justify-between gap-4">
        <div className="flex items-center justify-between gap-2 w-full">
          <span className="layout-flex-cell flex-1">A</span>
          <span className="layout-flex-cell flex-1">B</span>
          <span className="layout-flex-cell flex-1">C</span>
        </div>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "tw4", 5)} label="grid" utilities="grid grid-cols-3 gap-2">
        <div className="grid grid-cols-3 gap-2 w-full">
          <span className="layout-grid-cell">1</span>
          <span className="layout-grid-cell">2</span>
          <span className="layout-grid-cell">3</span>
          <span className="layout-grid-cell">4</span>
          <span className="layout-grid-cell">5</span>
          <span className="layout-grid-cell">6</span>
        </div>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "tw4", 6)} label="col-span" utilities="grid grid-cols-3 col-span-2">
        <div className="grid grid-cols-3 gap-2 w-full">
          <span className="layout-grid-cell col-span-2">span 2</span>
          <span className="layout-grid-cell">3</span>
        </div>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "tw4", 7)} label="positioning" utilities="relative absolute top-0 right-0">
        <div className="layout-position-context flex items-center justify-center">
          <span className="text-[10px] text-neutral-500">context</span>
          <span className="layout-position-badge top-0 right-0">TR</span>
        </div>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "tw4", 8)} label="sticky" utilities="sticky top-0 z-10">
        <div className="layout-sticky-context">
          <div className="layout-sticky-header sticky top-0">sticky header z-10</div>
          <div className="layout-sticky-body">Scroll content lines up under the fixed header when this region scrolls.</div>
        </div>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "tw4", 9)} label="overflow" utilities="overflow-hidden aspect-video">
        <div className="layout-aspect-box aspect-video overflow-hidden">16:9 container</div>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "tw4", 10)} label="flex-col-fill" utilities="flex flex-col flex-1 min-h-0">
        <div className="flex flex-col flex-1 min-h-0 w-full gap-1" style={{ minHeight: 100 }}>
          <span className="layout-flex-cell">header</span>
          <span className="layout-flex-cell flex-1">body (flex-1)</span>
          <span className="layout-flex-cell">footer</span>
        </div>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "tw4", 11)} label="hidden" utilities="hidden">
        <span className="text-[11px] text-neutral-500 italic">this element is hidden</span>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "tw4", 12)} label="size" utilities="size-16 aspect-square">
        <div className="layout-specimen size-16">64×64</div>
      </ExampleCard>
      <ExampleCard id={exId("Layout", "tw4", 13)} label="min-h" utilities="min-h-screen">
        <div className="layout-specimen min-h-[120px] w-full px-3 py-2">min-h fills viewport</div>
      </ExampleCard>
    </>
  );
}

export function ExamplesTailwindV4Page() {
  return (
    <main className="examples-page">
      <header className="examples-hero">
        <p>Dev-only showroom</p>
        <h1>Tailwind&nbsp;v4<br />examples.</h1>
        <div className="examples-hero__meta">
          <span>5 categories</span>
          <span>·</span>
          <span>Tailwind v4 only</span>
          <span>·</span>
          <span>selectable specimens</span>
        </div>
      </header>

      <CategorySection
        label="Spacing"
        title="Space between things."
        description="margin, padding, gap — shorthand, directional, negative, arbitrary, config-token values. Select any specimen to inspect."
        frameworkName="Tailwind v4"
        frameworkCssClass="tw4"
      >
        <Tw4Spacing />
      </CategorySection>

      <CategorySection
        label="Typography"
        title="Words on the screen."
        description="font-size, weight, line-height, letter-spacing, font-family, text-decoration, alignment. Tokens, arbitrary values, and opacity-modified colors."
        frameworkName="Tailwind v4"
        frameworkCssClass="tw4"
      >
        <Tw4Typography />
      </CategorySection>

      <CategorySection
        label="Color"
        title="Color fills the form."
        description="background, foreground, border — default tokens, alias tokens, custom config colors, opacity modifiers, and multi-role compositions."
        frameworkName="Tailwind v4"
        frameworkCssClass="tw4"
      >
        <Tw4Color />
      </CategorySection>

      <CategorySection
        label="Border"
        title="Edges and outlines."
        description="border-width, border-style, border-color, border-radius — shorthand decomposition, side-specific overrides, dashed/solid styles, token attribution."
        frameworkName="Tailwind v4"
        frameworkCssClass="tw4"
      >
        <Tw4Border />
      </CategorySection>

      <CategorySection
        label="Layout"
        title="Structure and space."
        description="width, height, display, flex, grid, position, z-index, overflow, aspect-ratio — box model decisions that define the page structure."
        frameworkName="Tailwind v4"
        frameworkCssClass="tw4"
      >
        <Tw4Layout />
      </CategorySection>
    </main>
  );
}
