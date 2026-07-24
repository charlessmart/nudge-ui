const signalBars = [42, 63, 51, 78, 68, 88, 73, 96, 84, 100, 90, 112];

const tailwindBorderFixtureIds = {
  accent: import.meta.env.DEV ? { "data-test": "tailwind-border-accent" } : {},
  mixed: import.meta.env.DEV ? { "data-test": "tailwind-border-mixed" } : {},
  override: import.meta.env.DEV ? { "data-test": "tailwind-border-override" } : {},
};

const tailwindOpacityFixtureId = import.meta.env.DEV ? { "data-test": "tailwind-alpha" } : {};

function TailwindBorderExamples() {
  return (
    <section id="border-lab" className="border-t border-white/10 py-20 md:py-24" aria-labelledby="border-lab-title">
      <div className="grid gap-8 md:grid-cols-12 md:gap-12">
        <div className="md:col-span-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-lime-300">Edges worth inspecting</p>
          <h2 id="border-lab-title" className="mt-5 max-w-sm text-4xl font-medium leading-none tracking-[-0.05em] text-white sm:text-5xl">
            One box, four border decisions.
          </h2>
          <p className="mt-6 max-w-sm text-sm leading-6 text-stone-400">
            The same side-specific CSS idea expressed through Tailwind utilities. Select a fixture to inspect each generated longhand.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3 md:col-span-8">
          <article className="border-fixture flex min-h-60 flex-col rounded-xl border border-stone-700 border-l-4 border-l-lime-300 bg-stone-900/70 p-5 transition hover:-translate-y-1" {...tailwindBorderFixtureIds.accent}>
            <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-lime-300"><span>01</span><span className="text-stone-500">Common</span></div>
            <h3 className="mt-12 text-xl font-medium tracking-[-0.04em] text-white">Accent edge</h3>
            <p className="mt-3 text-sm leading-6 text-stone-400">A shared border with one stronger left edge.</p>
            <code className="mt-auto pt-8 font-mono text-[10px] leading-5 text-lime-300">border-l-4 border-l-lime-300</code>
          </article>
          <article className="border-fixture flex min-h-60 flex-col rounded-xl border-t-2 border-dashed border-t-lime-300 border-r-4 border-r-rose-400 border-b-8 border-b-amber-300 border-l border-l-sky-300 bg-stone-900/70 p-5 transition hover:-translate-y-1" {...tailwindBorderFixtureIds.mixed}>
            <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-lime-300"><span>02</span><span className="text-stone-500">Mixed</span></div>
            <h3 className="mt-12 text-xl font-medium tracking-[-0.04em] text-white">Mixed treatment</h3>
            <p className="mt-3 text-sm leading-6 text-stone-400">Each utility changes a different side value.</p>
            <code className="mt-auto pt-8 font-mono text-[10px] leading-5 text-lime-300">all dashed · top 2 · right 4 · bottom 8</code>
          </article>
          <article className="border-fixture flex min-h-60 flex-col rounded-xl border-2 border-stone-700 border-b-4 border-b-lime-300 bg-stone-900/70 p-5 transition hover:-translate-y-1" {...tailwindBorderFixtureIds.override}>
            <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-lime-300"><span>03</span><span className="text-stone-500">Override</span></div>
            <h3 className="mt-12 text-xl font-medium tracking-[-0.04em] text-white">One-side override</h3>
            <p className="mt-3 text-sm leading-6 text-stone-400">A shared border with a deliberate bottom emphasis.</p>
            <code className="mt-auto pt-8 font-mono text-[10px] leading-5 text-lime-300">border-2 border-b-4</code>
          </article>
        </div>
      </div>
    </section>
  );
}

export function TailwindLandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-stone-950 font-sans text-stone-100 selection:bg-lime-300 selection:text-stone-950">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <header className="flex h-20 items-center justify-between border-b border-white/10">
          <a className="flex items-center gap-2 text-sm font-semibold tracking-tight" href="/" aria-label="Formwork home">
            <span className="grid size-6 place-items-center rounded-sm bg-lime-300 text-sm text-stone-950">ƒ</span>
            formwork
          </a>
          <nav className="hidden items-center gap-7 text-xs font-medium text-stone-400 md:flex" aria-label="Main navigation">
            <a className="transition hover:text-white" href="#method">Method</a>
            <a className="transition hover:text-white" href="#notes">Notes</a>
            <a className="transition hover:text-white" href="#start">Start a project</a>
          </nav>
          <a className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold transition hover:border-lime-300 hover:text-lime-300" href="/">
            CSS demo <span aria-hidden="true">↗</span>
          </a>
        </header>

        <section className="grid min-h-[calc(100svh-5rem)] items-end gap-12 py-16 md:grid-cols-12 md:py-20" aria-labelledby="tailwind-title">
          <div className="md:col-span-7 md:pb-10">
            <p className="mb-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-lime-300">
              <span className="size-1.5 rounded-full bg-lime-300" /> A practical planning system
            </p>
            <h1 id="tailwind-title" className="max-w-3xl text-5xl font-semibold leading-[0.94] tracking-[-0.065em] text-balance sm:text-7xl lg:text-8xl">
              Less ceremony.<br />More finished work.
            </h1>
            <p className="mt-7 max-w-md text-base leading-7 text-stone-400">
              Formwork gives small product teams a shared place to decide what matters, then carry it through to delivery.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <a className="rounded-full bg-lime-300 px-5 py-3 text-sm font-semibold text-stone-950 transition hover:-translate-y-0.5 hover:bg-lime-200" href="#start">Start a workspace <span aria-hidden="true">→</span></a>
              <a className="text-sm font-semibold text-stone-300 transition hover:text-white" href="#method">See the method <span aria-hidden="true">↓</span></a>
            </div>
          </div>

          <div className="relative md:col-span-5" aria-label="Project planning activity preview">
            <div className="pointer-events-none absolute -inset-24 -z-0 rounded-full bg-lime-300/10 blur-3xl" />
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-stone-900/80 p-5 shadow-2xl shadow-black/30 backdrop-blur">
            <div className="flex items-center justify-between border-b border-white/10 pb-4 text-[11px] text-stone-400">
                <span>New Zealand launch</span>
                <span className="font-mono text-lime-300">ON TRACK</span>
              </div>
              <div className="py-8">
                <p className="text-xs text-stone-500">This week</p>
                <p className="mt-2 text-4xl font-medium tracking-[-0.05em]">12 decisions</p>
                <div className="mt-7 flex h-28 items-end gap-1.5 border-b border-white/10 pb-2">
                  {signalBars.map((height, index) => (
                    <span className="flex-1 rounded-sm bg-lime-300/80 transition hover:bg-lime-200" style={{ height }} key={index} />
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg bg-white/5 p-3"><span className="block text-stone-500">Open</span><strong className="mt-1 block text-lg">04</strong></div>
                <div className="rounded-lg bg-white/5 p-3"><span className="block text-stone-500">Resolved</span><strong className="mt-1 block text-lg">28</strong></div>
              </div>
            </div>
            <div {...tailwindOpacityFixtureId} className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-4 text-red-100/80">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-red-200/70">Color opacity utility</p>
              <p className="mt-2 text-sm">A partial red wash, authored as a Tailwind color plus alpha modifier.</p>
              <code className="mt-3 block font-mono text-[10px] text-red-200/60">bg-red-500/10 · text-red-100/80</code>
            </div>
          </div>
        </section>

        <section id="method" className="grid gap-8 border-t border-white/10 py-20 md:grid-cols-12 md:gap-12">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-500 md:col-span-3">The method</p>
          <div className="grid gap-10 sm:grid-cols-3 md:col-span-9">
            {[
              ["01", "Name the decision", "Capture the question before it becomes another meeting."],
              ["02", "Keep the evidence", "Attach the context, trade-offs, and the person accountable."],
              ["03", "Move together", "Turn a decision into work without losing why it was made."],
            ].map(([number, title, copy]) => (
              <article className="border-t border-white/20 pt-4" key={number}>
                <span className="font-mono text-[11px] text-lime-300">{number}</span>
                <h2 className="mt-8 text-xl font-medium tracking-[-0.04em] text-white">{title}</h2>
                <p className="mt-3 text-sm leading-6 text-stone-400">{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="notes" className="border-t border-white/10 py-20 md:grid md:grid-cols-12 md:gap-12">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-500 md:col-span-3">From the field</p>
          <blockquote className="mt-8 max-w-3xl text-3xl font-medium leading-tight tracking-[-0.045em] text-stone-200 md:col-span-8 md:mt-0 sm:text-4xl">
            “The useful part is not another dashboard. It is remembering the decision that shaped the work.”
            <footer className="mt-6 text-sm font-normal tracking-normal text-stone-500">Mara Chen, product lead at Northline</footer>
          </blockquote>
        </section>

        <section id="start" className="flex flex-col gap-8 border-t border-white/10 py-16 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-sm text-stone-400">A focused workspace for teams doing consequential work.</p><p className="mt-2 text-2xl font-medium tracking-[-0.04em]">Start with the next decision.</p></div>
          <a className="w-fit rounded-full border border-lime-300 px-5 py-3 text-sm font-semibold text-lime-300 transition hover:bg-lime-300 hover:text-stone-950" href="mailto:hello@example.com">Request access <span aria-hidden="true">↗</span></a>
        </section>

        <TailwindBorderExamples />
      </div>
    </main>
  );
}
