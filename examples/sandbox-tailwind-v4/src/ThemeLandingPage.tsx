import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { currentTheme, setTheme, type Theme } from "./theme";

const features = [
  { title: "Inspect the work", body: "Select anything on the page and see the CSS that is really applied, token by token." },
  { title: "Nudge, don't rebuild", body: "Adjust spacing, color and type in place and watch the page respond as you drag." },
  { title: "Hand off cleanly", body: "Turn what you changed into one precise prompt your coding agent can act on." },
];

const swatches = [
  { name: "background", className: "bg-background" },
  { name: "sunken", className: "bg-sunken" },
  { name: "muted", className: "bg-muted" },
  { name: "brand-subtle", className: "bg-brand-subtle" },
  { name: "brand", className: "bg-brand" },
  { name: "foreground", className: "bg-foreground" },
];

function ThemeToggle() {
  const [theme, setCurrent] = useState<Theme>(currentTheme);
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-card text-foreground transition hover:bg-muted"
      aria-label={`Switch to ${next} mode`}
      data-test="theme-toggle"
      onClick={() => { setTheme(next); setCurrent(next); }}
    >
      {theme === "dark" ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
    </button>
  );
}

/** A small landing page built only from semantic tokens, so light and dark come entirely from `:root` and `.dark` in tailwind.css. */
export function ThemeLandingPage() {
  return (
    <main className="min-h-screen bg-background font-sans text-foreground selection:bg-brand selection:text-brand-foreground">
      <div className="mx-auto max-w-5xl px-6">
        <header className="flex h-20 items-center justify-between border-b border-border">
          <a className="flex items-center gap-2 text-sm font-semibold tracking-tight" href="/theme">
            <span className="grid size-6 place-items-center rounded-md bg-brand text-brand-foreground">✳</span>
            nudge ui
          </a>
          <nav className="hidden items-center gap-7 text-xs font-medium text-muted-foreground md:flex" aria-label="Main navigation">
            <a className="transition hover:text-foreground" href="#why">Why it works</a>
            <a className="transition hover:text-foreground" href="#tokens">Tokens</a>
            <a className="transition hover:text-foreground" href="#handoff">Handoff</a>
          </nav>
          <ThemeToggle />
        </header>

        <section className="py-20 md:py-28" aria-labelledby="theme-title">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full bg-brand-subtle px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">
            <span className="size-1.5 rounded-full bg-brand" /> Vite plugin · React first
          </p>
          <h1 id="theme-title" className="max-w-3xl text-5xl font-semibold leading-[0.98] tracking-[-0.05em] text-balance sm:text-7xl">
            Design where code lives.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground">
            A visual editor for the small decisions that make a product feel finished. Adjust styles, change text and edit tokens directly, then hand off to an agent.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <a className="rounded-full bg-brand px-5 py-3 text-sm font-semibold text-brand-foreground transition hover:-translate-y-0.5 hover:opacity-90" href="#handoff">Save a change</a>
            <a className="rounded-full border border-border px-5 py-3 text-sm font-semibold transition hover:bg-muted" href="#why">See how it works</a>
          </div>
        </section>
      </div>

      <section id="why" className="border-y border-border bg-sunken py-16 md:py-20">
        <div className="mx-auto grid max-w-5xl gap-4 px-6 md:grid-cols-3">
          {features.map((feature, index) => (
            <article key={feature.title} className="rounded-2xl border border-border bg-card p-6 text-card-foreground">
              <span className="font-mono text-[11px] text-brand">0{index + 1}</span>
              <h2 className="mt-8 text-lg font-medium tracking-tight">{feature.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-6">
        <section id="tokens" className="py-16 md:py-20" aria-labelledby="tokens-title">
          <h2 id="tokens-title" className="text-3xl font-medium tracking-tight">One set of tokens, two themes.</h2>
          <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
            Every color on this page is a semantic token. Flip the theme and the same names resolve to different values.
          </p>
          <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
            {swatches.map((swatch) => (
              <li key={swatch.name}>
                <div className={`h-16 rounded-xl border border-border ${swatch.className}`} />
                <code className="mt-2 block font-mono text-[11px] text-muted-foreground">{swatch.name}</code>
              </li>
            ))}
          </ul>
        </section>

        <section id="handoff" className="mb-20 rounded-3xl bg-brand px-8 py-14 text-brand-foreground md:px-14">
          <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight">Ready when you are.</h2>
          <p className="mt-3 max-w-md text-sm leading-6 opacity-85">Open the inspector on this page and try editing a token in either theme.</p>
          <a className="mt-8 inline-block rounded-full bg-background px-5 py-3 text-sm font-semibold text-foreground transition hover:-translate-y-0.5" href="#tokens">Try it</a>
        </section>

        <footer className="flex items-center justify-between border-t border-border py-8 text-xs text-muted-foreground">
          <span>© nudge ui</span>
          <span className="font-mono">Tailwind v4 · light &amp; dark</span>
        </footer>
      </div>
    </main>
  );
}
