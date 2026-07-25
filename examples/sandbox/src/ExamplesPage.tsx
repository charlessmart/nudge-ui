import "./examples.css";

// ============================================================
// Identity helpers — inspector data-cid / data-src attributes
// ============================================================

type ExampleId = {
  cid: string;
  src: string;
  test: string;
};

function exId(category: string, framework: string, index: number): ExampleId {
  const cid = `Examples:${category}:${framework}:${String(index).padStart(2, "0")}`;
  return {
    cid,
    src: `src/ExamplesPage.tsx:${cid}`,
    test: `examples-${category.toLowerCase()}-${framework}-${String(index).padStart(2, "0")}`,
  };
}

function devAttrs(id: ExampleId) {
  return import.meta.env.DEV
    ? { "data-cid": id.cid, "data-src": id.src, "data-test": id.test }
    : {};
}

// ============================================================
// Example card component
// ============================================================

function ExampleCard({
  id,
  label,
  utilities,
  children,
}: {
  id: ExampleId;
  label: string;
  utilities: string;
  children: React.ReactNode;
}) {
  return (
    <article className="example-card">
      <div className="example-card__label">
        <span>{label}</span>
        <code>{utilities}</code>
      </div>
      <div className="example-card__stage" {...devAttrs(id)}>
        {children}
      </div>
    </article>
  );
}

// ============================================================
// Spacing examples
// ============================================================

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
    </>
  );
}

// ============================================================
// Typography examples
// ============================================================

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
    </>
  );
}

// ============================================================
// Color examples
// ============================================================

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
        {/* accent = #abcdef via CSS var, simulate text on accent bg */}
        <div className="color-specimen px-6 py-4" style={{ backgroundColor: "#abcdef", color: "#0a1929" }}>accent bg</div>
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
      <ExampleCard id={exId("Color", "spr", 4)} label="accent-bg" utilities="spr-bg-accent spr-text-stone-900">
        <div className="color-specimen px-6 py-4 spr-bg-accent" style={{ color: "#0a1929" }}>accent token bg</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "spr", 5)} label="brand-opacity" utilities="spr-bg-brand/10 spr-text-brand">
        <div className="color-specimen px-6 py-4 spr-bg-brand/10 spr-text-brand">brand 10% wash</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "spr", 6)} label="accent-opacity" utilities="spr-bg-accent/20 spr-text-accent">
        <div className="color-specimen px-6 py-4 spr-bg-accent/20 spr-text-accent">accent 20% wash</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "spr", 7)} label="unmapped" utilities="spr-bg-unknown">
        <div className="color-specimen px-6 py-4 spr-bg-unknown text-purple-100">unmapped (raw)</div>
      </ExampleCard>
    </>
  );
}

// ============================================================
// Border examples
// ============================================================

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
    </>
  );
}

// ============================================================
// Layout examples
// ============================================================

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

// ============================================================
// Category section component
// ============================================================

function CategorySection({
  label,
  title,
  description,
  frameworks,
}: {
  label: string;
  title: string;
  description: string;
  frameworks: { name: string; cssClass: string; children: React.ReactNode }[];
}) {
  return (
    <section className="examples-category" id={`examples-${label.toLowerCase()}`}>
      <div className="examples-category__header">
        <span className="examples-category__label">{label}</span>
        <div>
          <h2>{title}</h2>
          <p className="examples-category__desc">{description}</p>
        </div>
      </div>
      {frameworks.map((fw) => (
        <div className="examples-framework" key={fw.name}>
          <span className={`examples-framework__label examples-framework__label--${fw.cssClass}`}>
            {fw.name}
          </span>
          <div className="examples-grid">{fw.children}</div>
        </div>
      ))}
    </section>
  );
}

// ============================================================
// Page export
// ============================================================

export function ExamplesPage() {
  return (
    <main className="examples-page">
      <header className="examples-hero">
        <p>Dev-only showroom</p>
        <h1>Detailed<br />examples.</h1>
        <div className="examples-hero__meta">
          <span>5 categories</span>
          <span>·</span>
          <span>3 frameworks</span>
          <span>·</span>
          <span>Tailwind v4 · Tailwind v3 · Sprinkles</span>
          <span>·</span>
          <span>selectable specimens</span>
        </div>
      </header>

      <CategorySection
        label="Spacing"
        title="Space between things."
        description="margin, padding, gap — shorthand, directional, negative, arbitrary, config-token values. Select any specimen to inspect."
        frameworks={[
          { name: "Tailwind v4", cssClass: "tw4", children: <Tw4Spacing /> },
          { name: "Tailwind v3", cssClass: "tw3", children: <Tw3Spacing /> },
          { name: "Sprinkles", cssClass: "spr", children: <SprSpacing /> },
        ]}
      />

      <CategorySection
        label="Typography"
        title="Words on the screen."
        description="font-size, weight, line-height, letter-spacing, font-family, text-decoration, alignment. Tokens, arbitrary values, and opacity-modified colors."
        frameworks={[
          { name: "Tailwind v4", cssClass: "tw4", children: <Tw4Typography /> },
          { name: "Tailwind v3", cssClass: "tw3", children: <Tw3Typography /> },
          { name: "Sprinkles", cssClass: "spr", children: <SprTypography /> },
        ]}
      />

      <CategorySection
        label="Color"
        title="Color fills the form."
        description="background, foreground, border — default tokens, alias tokens, custom config colors, opacity modifiers, and multi-role compositions."
        frameworks={[
          { name: "Tailwind v4", cssClass: "tw4", children: <Tw4Color /> },
          { name: "Tailwind v3", cssClass: "tw3", children: <Tw3Color /> },
          { name: "Sprinkles", cssClass: "spr", children: <SprColor /> },
        ]}
      />

      <CategorySection
        label="Border"
        title="Edges and outlines."
        description="border-width, border-style, border-color, border-radius — shorthand decomposition, side-specific overrides, dashed/solid styles, token attribution."
        frameworks={[
          { name: "Tailwind v4", cssClass: "tw4", children: <Tw4Border /> },
          { name: "Tailwind v3", cssClass: "tw3", children: <Tw3Border /> },
          { name: "Sprinkles", cssClass: "spr", children: <SprBorder /> },
        ]}
      />

      <CategorySection
        label="Layout"
        title="Structure and space."
        description="width, height, display, flex, grid, position, z-index, overflow, aspect-ratio — box model decisions that define the page structure."
        frameworks={[
          { name: "Tailwind v4", cssClass: "tw4", children: <Tw4Layout /> },
          { name: "Tailwind v3", cssClass: "tw3", children: <Tw3Layout /> },
          { name: "Sprinkles", cssClass: "spr", children: <SprLayout /> },
        ]}
      />
    </main>
  );
}
