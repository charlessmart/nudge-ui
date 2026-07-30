import "./examples.css";
import { exId, ExampleCard, CategorySection } from "./examples-shared";

function CssUnitsSpacing() {
  return (
    <>
      <ExampleCard id={exId("Spacing", "raw", 1)} label="padding rem" utilities="padding: 1rem">
        <div className="spacing-specimen" style={{ padding: "1rem" }}>1rem</div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "raw", 2)} label="padding em" utilities="padding: 1.5em">
        <div className="spacing-specimen" style={{ padding: "1.5em" }}>1.5em</div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "raw", 3)} label="padding %" utilities="padding: 12%">
        <div className="spacing-specimen" style={{ padding: "12%" }}>12%</div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "raw", 4)} label="padding vw vh" utilities="padding: 2vw 3vh">
        <div className="spacing-specimen" style={{ padding: "2vw 3vh" }}>2vw 3vh</div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "raw", 5)} label="padding vmin" utilities="padding: 3vmin">
        <div className="spacing-specimen" style={{ padding: "3vmin" }}>3vmin</div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "raw", 6)} label="padding px" utilities="padding: 20px">
        <div className="spacing-specimen" style={{ padding: "20px" }}>20px</div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "raw", 7)} label="padding ch" utilities="padding: 2ch">
        <div className="spacing-specimen" style={{ padding: "2ch" }}>2ch</div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "raw", 8)} label="mixed shorthand" utilities="padding: 1rem 2em 10% 4px">
        <div className="spacing-specimen" style={{ padding: "1rem 2em 10% 4px" }}>mixed</div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "raw", 9)} label="padding var(token)" utilities="padding: var(--space-5)">
        <div className="spacing-specimen" style={{ padding: "var(--space-5)" }}>var(--space-5)</div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "raw", 10)} label="axis var(token)" utilities="padding: var(--space-2) var(--space-6)">
        <div className="spacing-specimen" style={{ padding: "var(--space-2) var(--space-6)" }}>--space-2 --space-6</div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "raw", 11)} label="width var(token)" utilities="width: var(--space-10)">
        <div className="spacing-specimen" style={{ width: "var(--space-10)", padding: "4px" }}>width: var(--space-10)</div>
      </ExampleCard>
      <ExampleCard id={exId("Spacing", "raw", 12)} label="gap var(token)" utilities="gap: var(--space-4)">
        <div className="flex-row-gap" style={{ gap: "var(--space-4)" }}>
          <span className="spacing-specimen px-3 py-1">A</span>
          <span className="spacing-specimen px-3 py-1">B</span>
          <span className="spacing-specimen px-3 py-1">C</span>
        </div>
      </ExampleCard>
    </>
  );
}

function CssUnitsTypography() {
  return (
    <>
      <ExampleCard id={exId("Typography", "raw", 1)} label="font-size rem" utilities="font-size: 2rem">
        <span className="typography-specimen" style={{ fontSize: "2rem" }}>2rem heading</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "raw", 2)} label="font-size em" utilities="font-size: 1.4em">
        <span className="typography-specimen" style={{ fontSize: "1.4em" }}>1.4em body text</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "raw", 3)} label="font-size vw" utilities="font-size: 3vw">
        <span className="typography-specimen" style={{ fontSize: "3vw" }}>3vw responsive</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "raw", 4)} label="font-size %" utilities="font-size: 130%">
        <span className="typography-specimen" style={{ fontSize: "130%" }}>130% of parent</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "raw", 5)} label="font-size px" utilities="font-size: 24px">
        <span className="typography-specimen" style={{ fontSize: "24px" }}>24px fixed</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "raw", 6)} label="font-size ch" utilities="font-size: 2ch">
        <span className="typography-specimen" style={{ fontSize: "2ch" }}>2ch width-based</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "raw", 7)} label="line-height unitless" utilities="line-height: 1.6">
        <span className="typography-specimen" style={{ fontSize: "1rem", lineHeight: 1.6, display: "block" }}>Unitless line-height 1.6 for comfortable body reading across multiple lines of demo content.</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "raw", 8)} label="line-height em" utilities="line-height: 1.8em">
        <span className="typography-specimen" style={{ fontSize: "1rem", lineHeight: "1.8em", display: "block" }}>Em line-height 1.8em gives extra generous spacing between these wrapped lines of text.</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "raw", 9)} label="line-height px" utilities="line-height: 32px">
        <span className="typography-specimen" style={{ fontSize: "1rem", lineHeight: "32px", display: "block" }}>Pixel line-height 32px stays rigidly fixed regardless of the font-size value here.</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "raw", 10)} label="letter-spacing em" utilities="letter-spacing: 0.1em">
        <span className="typography-specimen" style={{ fontSize: "1.2rem", letterSpacing: "0.1em" }}>0.1em letter spacing</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "raw", 11)} label="letter-spacing px" utilities="letter-spacing: 3px">
        <span className="typography-specimen" style={{ fontSize: "1.2rem", letterSpacing: "3px" }}>3px letter spacing</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "raw", 12)} label="font-size token" utilities="font-size: var(--font-size-xl)">
        <span className="typography-specimen" style={{ fontSize: "var(--font-size-xl)" }}>var(--font-size-xl)</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "raw", 13)} label="multi-token" utilities="font-size: var(--font-size-2xl); line-height: var(--leading-tight)">
        <span className="typography-specimen" style={{ fontSize: "var(--font-size-2xl)", lineHeight: "var(--leading-tight)", display: "block" }}>var(--font-size-2xl) + var(--leading-tight)</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "raw", 14)} label="base + relaxed" utilities="font-size: var(--font-size-base); line-height: var(--leading-relaxed)">
        <span className="typography-specimen" style={{ fontSize: "var(--font-size-base)", lineHeight: "var(--leading-relaxed)", display: "block" }}>Base size with relaxed leading for comfortable long-form reading across multiple lines of text.</span>
      </ExampleCard>
      <ExampleCard id={exId("Typography", "raw", 15)} label="font-mono token" utilities="font-family: var(--font-mono)">
        <span className="typography-specimen" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--font-size-sm)" }}>var(--font-mono) monospace token</span>
      </ExampleCard>
    </>
  );
}

function CssUnitsColor() {
  return (
    <>
      <ExampleCard id={exId("Color", "raw", 1)} label="rgb" utilities="rgb(96, 165, 250)">
        <div className="color-specimen px-4 py-4" style={{ background: "rgb(96, 165, 250)", color: "#fff" }}>rgb(96, 165, 250)</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "raw", 2)} label="rgba" utilities="rgba(96, 165, 250, 0.5)">
        <div className="color-specimen px-4 py-4" style={{ background: "rgba(96, 165, 250, 0.5)", color: "#000" }}>rgba with 0.5 alpha</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "raw", 3)} label="hsl" utilities="hsl(210, 80%, 60%)">
        <div className="color-specimen px-4 py-4" style={{ background: "hsl(210, 80%, 60%)", color: "#fff" }}>hsl(210, 80%, 60%)</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "raw", 4)} label="hsla" utilities="hsla(210, 80%, 60%, 0.5)">
        <div className="color-specimen px-4 py-4" style={{ background: "hsla(210, 80%, 60%, 0.5)", color: "#000" }}>hsla 50% opaque</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "raw", 5)} label="oklch" utilities="oklch(0.7 0.2 200)">
        <div className="color-specimen px-4 py-4" style={{ background: "oklch(0.7 0.2 200)", color: "#fff" }}>oklch(0.7 0.2 200)</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "raw", 6)} label="oklch alpha" utilities="oklch(0.7 0.2 200 / 0.5)">
        <div className="color-specimen px-4 py-4" style={{ background: "oklch(0.7 0.2 200 / 0.5)", color: "#000" }}>oklch with / alpha</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "raw", 7)} label="oklab" utilities="oklab(0.7 0.05 -0.1)">
        <div className="color-specimen px-4 py-4" style={{ background: "oklab(0.7 0.05 -0.1)", color: "#fff" }}>oklab(0.7 0.05 -0.1)</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "raw", 8)} label="hwb" utilities="hwb(200 20% 10%)">
        <div className="color-specimen px-4 py-4" style={{ background: "hwb(200 20% 10%)", color: "#fff" }}>hwb(200 20% 10%)</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "raw", 9)} label="lab" utilities="lab(65 10 -25)">
        <div className="color-specimen px-4 py-4" style={{ background: "lab(65 10 -25)", color: "#fff" }}>lab(65 10 -25)</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "raw", 10)} label="lch" utilities="lch(65 27 290)">
        <div className="color-specimen px-4 py-4" style={{ background: "lch(65 27 290)", color: "#fff" }}>lch(65 27 290)</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "raw", 11)} label="color-mix srgb" utilities="color-mix(in srgb, #ff4444 50%, #4444ff)">
        <div className="color-specimen px-4 py-4" style={{ background: "color-mix(in srgb, #ff4444 50%, #4444ff)", color: "#fff" }}>color-mix srgb</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "raw", 12)} label="color-mix oklch" utilities="color-mix(in oklch, #ff6600 60%, #0066ff)">
        <div className="color-specimen px-4 py-4" style={{ background: "color-mix(in oklch, #ff6600 60%, #0066ff)", color: "#fff" }}>color-mix oklch</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "raw", 13)} label="8-digit hex" utilities="bg: #ff6600cc">
        <div className="color-specimen px-4 py-4" style={{ background: "#ff6600cc", color: "#fff" }}>#ff6600cc</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "raw", 14)} label="4-digit hex" utilities="bg: #0c8a">
        <div className="color-specimen px-4 py-4" style={{ background: "#0c8a", color: "#000" }}>#0c8a</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "raw", 15)} label="color-primary token" utilities="bg: var(--color-primary)">
        <div className="color-specimen px-4 py-4" style={{ background: "var(--color-primary)", color: "var(--color-primary-text)" }}>var(--color-primary)</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "raw", 16)} label="color-danger token" utilities="bg: var(--color-danger)">
        <div className="color-specimen px-4 py-4" style={{ background: "var(--color-danger)", color: "var(--color-danger-text)" }}>var(--color-danger)</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "raw", 17)} label="color-success token" utilities="bg: var(--color-success)">
        <div className="color-specimen px-4 py-4" style={{ background: "var(--color-success)", color: "var(--color-success-text)" }}>var(--color-success)</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "raw", 18)} label="color-warning token" utilities="bg: var(--color-warning)">
        <div className="color-specimen px-4 py-4" style={{ background: "var(--color-warning)", color: "var(--color-warning-text)" }}>var(--color-warning)</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "raw", 19)} label="color-info token" utilities="bg: var(--color-info)">
        <div className="color-specimen px-4 py-4" style={{ background: "var(--color-info)", color: "var(--color-info-text)" }}>var(--color-info)</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "raw", 20)} label="token + alpha srgb" utilities="color-mix(in srgb, var(--color-primary) 58%, transparent)">
        <div className="color-specimen px-4 py-4" style={{ background: "color-mix(in srgb, var(--color-primary) 58%, transparent)", color: "#fff" }}>--color-primary · 58%</div>
      </ExampleCard>
      <ExampleCard id={exId("Color", "raw", 21)} label="token + alpha oklab" utilities="color-mix(in oklab, var(--color-accent) 34%, transparent)">
        <div className="color-specimen px-4 py-4" style={{ background: "color-mix(in oklab, var(--color-accent) 34%, transparent)", color: "#fff" }}>--color-accent · 34%</div>
      </ExampleCard>
    </>
  );
}

function CssUnitsBorder() {
  return (
    <>
      <ExampleCard id={exId("Border", "raw", 1)} label="border-width token" utilities="border-width: var(--border-width-thick)">
        <div className="border-specimen" style={{ border: "var(--border-width-thick) solid var(--color-primary)", color: "#a1a1aa" }}>var(--border-width-thick)</div>
      </ExampleCard>
      <ExampleCard id={exId("Border", "raw", 2)} label="border shorthand token" utilities="border: var(--border-default)">
        <div className="border-specimen" style={{ border: "var(--border-default)", borderRadius: "8px" }}>var(--border-default)</div>
      </ExampleCard>
      <ExampleCard id={exId("Border", "raw", 3)} label="shorthand accent" utilities="border: var(--border-thick-primary)">
        <div className="border-specimen" style={{ border: "var(--border-thick-primary)" }}>var(--border-thick-primary)</div>
      </ExampleCard>
      <ExampleCard id={exId("Border", "raw", 4)} label="radius token" utilities="border-radius: var(--radius-lg)">
        <div className="border-specimen" style={{ border: "var(--border-default)", borderRadius: "var(--radius-lg)" }}>var(--radius-lg)</div>
      </ExampleCard>
      <ExampleCard id={exId("Border", "raw", 5)} label="radius-full token" utilities="border-radius: var(--radius-full)">
        <div className="border-specimen" style={{ border: "var(--border-default)", borderRadius: "var(--radius-full)" }}>var(--radius-full)</div>
      </ExampleCard>
    </>
  );
}

export function ExamplesRawCssPage() {
  return (
    <main className="examples-page">
      <header className="examples-hero">
        <p>Dev-only showroom</p>
        <h1>Raw&nbsp;CSS<br />examples.</h1>
        <div className="examples-hero__meta">
          <span>4 categories</span>
          <span>·</span>
          <span>Raw CSS only</span>
          <span>·</span>
          <span>selectable specimens</span>
        </div>
      </header>

      <CategorySection
        label="Spacing"
        title="Space between things."
        description="margin, padding, gap — shorthand, directional, negative, arbitrary, config-token values. Select any specimen to inspect."
        frameworkName="Raw CSS"
        frameworkCssClass="raw"
      >
        <CssUnitsSpacing />
      </CategorySection>

      <CategorySection
        label="Typography"
        title="Words on the screen."
        description="font-size, weight, line-height, letter-spacing, font-family, text-decoration, alignment. Tokens, arbitrary values, and opacity-modified colors."
        frameworkName="Raw CSS"
        frameworkCssClass="raw"
      >
        <CssUnitsTypography />
      </CategorySection>

      <CategorySection
        label="Color"
        title="Color fills the form."
        description="background, foreground, border — default tokens, alias tokens, custom config colors, opacity modifiers, and multi-role compositions."
        frameworkName="Raw CSS"
        frameworkCssClass="raw"
      >
        <CssUnitsColor />
      </CategorySection>

      <CategorySection
        label="Border"
        title="Edges and outlines."
        description="border-width, border-style, border-color, border-radius — shorthand decomposition, side-specific overrides, dashed/solid styles, token attribution."
        frameworkName="Raw CSS"
        frameworkCssClass="raw"
      >
        <CssUnitsBorder />
      </CategorySection>
    </main>
  );
}
