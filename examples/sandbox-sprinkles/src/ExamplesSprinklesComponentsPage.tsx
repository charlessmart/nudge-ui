import type { ReactNode } from "react";
import "./showroom.css";
import "./sprinkles-components.css";
import { sprinkles } from "./sprinkles.css.ts";
import { themeClass } from "./theme.css.ts";
import { CategorySection, exId, ExampleCard } from "./examples-shared";

interface SprinklesButtonProps {
  children: ReactNode;
  tone: "brand" | "accent";
  size: "sm" | "lg";
}

function SprinklesButton({ children, tone, size }: SprinklesButtonProps) {
  const backgroundColor = tone === "brand" ? "brand" : "accent";
  const color = tone === "brand" ? "surface" : "brand";
  const padding = size === "sm" ? "sm" : "md";
  return <button type="button" className={`sprinkles-ui-button ${sprinkles({ backgroundColor, color, padding, fontWeight: "semibold" })}`}>{children}</button>;
}

interface SprinklesBadgeProps {
  children: ReactNode;
  tone: "brand" | "accent" | "surface";
}

function SprinklesBadge({ children, tone }: SprinklesBadgeProps) {
  const color = tone === "surface" ? "emphasis" : "brand";
  return <span className={`sprinkles-ui-badge ${sprinkles({ backgroundColor: tone, color, padding: "sm", fontSize: "sm", fontWeight: "semibold" })}`}>{children}</span>;
}

interface SprinklesCardProps {
  children: ReactNode;
  padding: "sm" | "md" | "lg";
  bordered: boolean;
}

function SprinklesCard({ children, padding, bordered }: SprinklesCardProps) {
  return <article className={`sprinkles-ui-card ${sprinkles({ backgroundColor: "surface", color: "emphasis", padding, borderWidth: bordered ? "thin" : undefined, borderStyle: bordered ? "solid" : undefined, borderColor: bordered ? "accent" : undefined })}`}>{children}</article>;
}

interface SprinklesAlertProps {
  children: ReactNode;
  tone: "info" | "success";
}

function SprinklesAlert({ children, tone }: SprinklesAlertProps) {
  const backgroundColor = tone === "info" ? "accent" : "surface";
  return <div role="alert" className={`sprinkles-ui-alert ${sprinkles({ backgroundColor, color: "emphasis", padding: "md" })}`}>{children}</div>;
}

interface SprinklesAvatarProps {
  initials: string;
  size: "sm" | "lg";
}

function SprinklesAvatar({ initials, size }: SprinklesAvatarProps) {
  const padding = size === "sm" ? "sm" : "md";
  return <span className={`sprinkles-ui-avatar ${sprinkles({ backgroundColor: "brand", color: "surface", padding, fontWeight: "bold", textAlign: "center" })}`} role="img" aria-label="Avatar">{initials}</span>;
}

interface SprinklesFieldProps {
  label: string;
  hint: string;
}

function SprinklesField({ label, hint }: SprinklesFieldProps) {
  return <label className="sprinkles-ui-field"><span className={sprinkles({ color: "emphasis", fontSize: "sm", fontWeight: "semibold" })}>{label}</span><input placeholder={hint} className={sprinkles({ padding: "sm", color: "emphasis" })} /></label>;
}

export function ExamplesSprinklesComponentsPage() {
  return (
    <main className={`${themeClass} examples-page sprinkles-components-page`}>
      <header className="examples-hero">
        <p>Dev-only component fixture</p>
        <h1>Sprinkles<br />UI components.</h1>
        <div className="examples-hero__meta"><span>6 local components</span><span>·</span><span>typed props</span><span>·</span><span>vanilla-extract contracts</span></div>
      </header>

      <CategorySection
        label="Components"
        title="The prop is semantic; the class is generated."
        description="A small component set built directly from Sprinkles properties and theme contracts. Select a component to inspect the prop contract and emitted class names."
        frameworkName="Sprinkles"
        frameworkCssClass="spr"
      >
        <ExampleCard id={exId("Components", "spr", 1, "ExamplesSprinklesComponentsPage")} label="button" utilities="tone · size · token props">
          <div className="sprinkles-ui-row"><SprinklesButton tone="brand" size="lg">Publish</SprinklesButton><SprinklesButton tone="accent" size="sm">Save draft</SprinklesButton></div>
        </ExampleCard>
        <ExampleCard id={exId("Components", "spr", 2, "ExamplesSprinklesComponentsPage")} label="badge" utilities="tone · type props">
          <div className="sprinkles-ui-row"><SprinklesBadge tone="brand">In review</SprinklesBadge><SprinklesBadge tone="accent">Design</SprinklesBadge><SprinklesBadge tone="surface">Archived</SprinklesBadge></div>
        </ExampleCard>
        <ExampleCard id={exId("Components", "spr", 3, "ExamplesSprinklesComponentsPage")} label="card" utilities="padding · bordered">
          <div className="sprinkles-ui-wide"><SprinklesCard padding="md" bordered><strong>Token-backed card</strong><p>Spacing, color, and border resolve through the Sprinkles contract.</p></SprinklesCard></div>
        </ExampleCard>
        <ExampleCard id={exId("Components", "spr", 4, "ExamplesSprinklesComponentsPage")} label="alert" utilities="tone · semantic color">
          <div className="sprinkles-ui-wide"><SprinklesAlert tone="info">The theme alias keeps this alert readable.</SprinklesAlert></div>
        </ExampleCard>
        <ExampleCard id={exId("Components", "spr", 5, "ExamplesSprinklesComponentsPage")} label="avatar" utilities="size · theme tokens">
          <div className="sprinkles-ui-row"><SprinklesAvatar initials="MC" size="sm" /><SprinklesAvatar initials="AL" size="lg" /></div>
        </ExampleCard>
        <ExampleCard id={exId("Components", "spr", 6, "ExamplesSprinklesComponentsPage")} label="field" utilities="label · hint">
          <SprinklesField label="Workspace name" hint="Northline" />
        </ExampleCard>
      </CategorySection>
    </main>
  );
}
