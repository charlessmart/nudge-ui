import "./showroom.css";
import { sprinkles } from "./sprinkles.css.ts";
import { exId, ExampleCard, CategorySection } from "./examples-shared";

const join = (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(" ");

function SprinklesSpacing() {
  return <>
    <ExampleCard id={exId("Spacing", "spr", 1)} label="token-padding" utilities="padding: md">
      <div className={join("spacing-specimen", sprinkles({ padding: "md" }))}>contract padding</div>
    </ExampleCard>
    <ExampleCard id={exId("Spacing", "spr", 2)} label="axis-padding" utilities="paddingInline: lg; paddingBlock: sm">
      <div className={join("spacing-specimen", sprinkles({ paddingInline: "lg", paddingBlock: "sm" }))}>logical axis padding</div>
    </ExampleCard>
    <ExampleCard id={exId("Spacing", "spr", 3)} label="margin+gap" utilities="marginTop: lg; gap: sm">
      <div className={join("flex-row-gap", sprinkles({ marginTop: "lg", gap: "sm" }))}>
        <span className={join("spacing-specimen", sprinkles({ padding: "sm" }))}>A</span>
        <span className={join("spacing-specimen", sprinkles({ padding: "sm" }))}>B</span>
      </div>
    </ExampleCard>
  </>;
}

function SprinklesTypography() {
  return <>
    <ExampleCard id={exId("Typography", "spr", 1)} label="type-token" utilities="fontSize: lg; fontWeight: semibold">
      <span className={join("typography-specimen", sprinkles({ fontSize: "lg", fontWeight: "semibold" }))}>Contract typography.</span>
    </ExampleCard>
    <ExampleCard id={exId("Typography", "spr", 2)} label="leading" utilities="fontSize: md; lineHeight: relaxed">
      <span className={join("typography-specimen", sprinkles({ fontSize: "md", lineHeight: "relaxed" }))}>Readable line-height from a real Sprinkles class.</span>
    </ExampleCard>
    <ExampleCard id={exId("Typography", "spr", 3)} label="color+alignment" utilities="color: accent; textAlign: center">
      <span className={join("typography-specimen", sprinkles({ color: "accent", textAlign: "center" }))}>Token color and alignment.</span>
    </ExampleCard>
  </>;
}

function SprinklesColor() {
  return <>
    <ExampleCard id={exId("Color", "spr", 1)} label="background-token" utilities="backgroundColor: brand; color: surface">
      <div className={join("color-specimen", sprinkles({ backgroundColor: "brand", color: "surface", padding: "md" }))}>Contract background</div>
    </ExampleCard>
    <ExampleCard id={exId("Color", "spr", 2)} label="alias-token" utilities="backgroundColor: surface; color: emphasis">
      <div className={join("color-specimen", sprinkles({ backgroundColor: "surface", color: "emphasis", padding: "md" }))}>Alias resolves through theme contract</div>
    </ExampleCard>
  </>;
}

function SprinklesBorder() {
  return <>
    <ExampleCard id={exId("Border", "spr", 1)} label="structured-border" utilities="borderWidth: thin; borderColor: accent">
      <div className={join("border-specimen", sprinkles({ borderWidth: "thin", borderStyle: "solid", borderColor: "accent", padding: "md" }))}>Token border</div>
    </ExampleCard>
    <ExampleCard id={exId("Border", "spr", 2)} label="rounded" utilities="borderWidth: thick; borderRadius: full">
      <div className={join("border-specimen", sprinkles({ borderWidth: "thick", borderStyle: "dashed", borderColor: "brand", borderRadius: "full", padding: "md" }))}>Generated radius and sides</div>
    </ExampleCard>
  </>;
}

function SprinklesLayout() {
  return <>
    <ExampleCard id={exId("Layout", "spr", 1)} label="width" utilities="width: narrow">
      <div className={join("layout-specimen", sprinkles({ width: "narrow", height: "narrow" }))}>contract width</div>
    </ExampleCard>
    <ExampleCard id={exId("Layout", "spr", 2)} label="grid" utilities="display: grid; gridTemplateColumns: three">
      <div className={join("layout-specimen", sprinkles({ display: "grid", gridTemplateColumns: "three", gap: "sm", padding: "sm" }))}>
        <span className="layout-grid-cell">1</span><span className="layout-grid-cell">2</span><span className="layout-grid-cell">3</span>
      </div>
    </ExampleCard>
  </>;
}

export function ExamplesSprinklesPage() {
  return (
    <main className="examples-page">
      <header className="examples-hero">
        <p>Dev-only showroom</p>
        <h1>Sprinkles<br />examples.</h1>
        <div className="examples-hero__meta"><span>5 categories</span><span>·</span><span>real vanilla-extract output</span><span>·</span><span>selectable specimens</span></div>
      </header>
      <CategorySection label="Spacing" title="Space between things." description="Logical spacing and gaps resolve through a real vanilla-extract contract." frameworkName="Sprinkles" frameworkCssClass="spr"><SprinklesSpacing /></CategorySection>
      <CategorySection label="Typography" title="Words on the screen." description="Type scale, weight, leading, color, and alignment are generated from the property set." frameworkName="Sprinkles" frameworkCssClass="spr"><SprinklesTypography /></CategorySection>
      <CategorySection label="Color" title="Color fills the form." description="Theme-contract aliases stay human-readable while compiler identifiers remain opaque." frameworkName="Sprinkles" frameworkCssClass="spr"><SprinklesColor /></CategorySection>
      <CategorySection label="Border" title="Edges and outlines." description="Structured border properties use generated classes and contract-backed colors." frameworkName="Sprinkles" frameworkCssClass="spr"><SprinklesBorder /></CategorySection>
      <CategorySection label="Layout" title="Structure and space." description="Width, display, grid, and gap are represented by the same real Sprinkles compiler." frameworkName="Sprinkles" frameworkCssClass="spr"><SprinklesLayout /></CategorySection>
    </main>
  );
}
