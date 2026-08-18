import type { ReactNode } from "react";
import "./showroom.css";
import { CategorySection, exId, ExampleCard } from "./examples-shared";

interface V3ButtonProps {
  children: ReactNode;
  tone: "brand" | "neutral";
  size: "sm" | "lg";
}

function V3Button({ children, tone, size }: V3ButtonProps) {
  const toneClass = tone === "brand" ? "bg-brand text-white hover:bg-brand/90" : "border border-brand/30 bg-white text-brand hover:bg-brand/5";
  const sizeClass = size === "sm" ? "px-3 py-2 text-xs" : "px-5 py-3 text-sm";
  return <button type="button" className={`inline-flex items-center justify-center rounded-lg font-semibold transition ${toneClass} ${sizeClass}`}>{children}</button>;
}

interface V3BadgeProps {
  children: ReactNode;
  tone: "brand" | "accent" | "muted";
}

function V3Badge({ children, tone }: V3BadgeProps) {
  const toneClass = tone === "brand" ? "bg-brand/10 text-brand" : tone === "accent" ? "bg-accent text-brand" : "bg-gray-100 text-gray-600";
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${toneClass}`}>{children}</span>;
}

interface V3CardProps {
  children: ReactNode;
  emphasis: "raised" | "outlined";
}

function V3Card({ children, emphasis }: V3CardProps) {
  const emphasisClass = emphasis === "raised" ? "border-transparent bg-white shadow-lg shadow-brand/10" : "border-brand/30 bg-white";
  return <article className={`w-full rounded-xl border p-5 ${emphasisClass}`}>{children}</article>;
}

interface V3AlertProps {
  children: ReactNode;
  tone: "info" | "success" | "warning";
}

function V3Alert({ children, tone }: V3AlertProps) {
  const toneClass = tone === "info" ? "border-brand/20 bg-brand/5 text-brand" : tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800";
  return <div role="alert" className={`w-full rounded-lg border px-4 py-3 text-sm ${toneClass}`}>{children}</div>;
}

interface V3AvatarProps {
  initials: string;
  shape: "circle" | "square";
}

function V3Avatar({ initials, shape }: V3AvatarProps) {
  const shapeClass = shape === "circle" ? "rounded-full" : "rounded-lg";
  return <span className={`grid size-12 place-items-center bg-brand text-sm font-bold text-white ${shapeClass}`} role="img" aria-label="Avatar">{initials}</span>;
}

interface V3StatusProps {
  label: string;
  active: boolean;
}

function V3Status({ label, active }: V3StatusProps) {
  return <div className="flex items-center gap-3 text-sm text-gray-700"><span className={`size-2 rounded-full ${active ? "bg-emerald-500" : "bg-gray-300"}`} />{label}</div>;
}

export function TailwindV3ComponentsPage() {
  return (
    <main className="examples-page">
      <header className="examples-hero">
        <p>Dev-only component fixture</p>
        <h1>Tailwind v3<br />UI components.</h1>
        <div className="examples-hero__meta"><span>6 local components</span><span>·</span><span>typed props</span><span>·</span><span>Tailwind v3 utilities</span></div>
      </header>

      <CategorySection
        label="Components"
        title="The same UI language, one version back."
        description="A small set of local React components authored with Tailwind v3 config values. Select a component to inspect its props and utility output."
        frameworkName="Tailwind v3"
        frameworkCssClass="tw3"
      >
        <ExampleCard id={exId("Components", "tw3", 1, "TailwindV3ComponentsPage")} label="button" utilities="tone · size">
          <div className="flex flex-wrap justify-center gap-3"><V3Button tone="brand" size="lg">Publish</V3Button><V3Button tone="neutral" size="sm">Save draft</V3Button></div>
        </ExampleCard>
        <ExampleCard id={exId("Components", "tw3", 2, "TailwindV3ComponentsPage")} label="badge" utilities="tone">
          <div className="flex flex-wrap justify-center gap-2"><V3Badge tone="brand">In review</V3Badge><V3Badge tone="accent">Design</V3Badge><V3Badge tone="muted">Archived</V3Badge></div>
        </ExampleCard>
        <ExampleCard id={exId("Components", "tw3", 3, "TailwindV3ComponentsPage")} label="card" utilities="emphasis">
          <V3Card emphasis="raised"><p className="text-sm font-semibold text-gray-900">Launch checklist</p><p className="mt-2 text-xs leading-5 text-gray-500">Three decisions remain before the next release.</p></V3Card>
        </ExampleCard>
        <ExampleCard id={exId("Components", "tw3", 4, "TailwindV3ComponentsPage")} label="alert" utilities="tone">
          <V3Alert tone="warning">This change affects three published routes.</V3Alert>
        </ExampleCard>
        <ExampleCard id={exId("Components", "tw3", 5, "TailwindV3ComponentsPage")} label="avatar" utilities="shape">
          <div className="flex items-center gap-3"><V3Avatar initials="MC" shape="circle" /><V3Avatar initials="AL" shape="square" /></div>
        </ExampleCard>
        <ExampleCard id={exId("Components", "tw3", 6, "TailwindV3ComponentsPage")} label="status" utilities="active">
          <div className="grid gap-3"><V3Status label="Inspector connected" active /><V3Status label="No pending changes" active={false} /></div>
        </ExampleCard>
      </CategorySection>
    </main>
  );
}
