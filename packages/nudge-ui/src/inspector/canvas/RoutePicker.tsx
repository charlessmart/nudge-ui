import { useEffect, useState } from "react";
import { Button } from "../ui/Button.tsx";
import { isRouteCatalog, NUDGE_UI_ROUTES_PATH, type RouteCatalog } from "../../transport/routeCatalog.ts";
import { fitCanvasCards, setCanvasPresentation } from "./canvasStore.ts";
import { addPages } from "../workspace/commands.ts";
import { canWriteWorkspace } from "./workspaceLease.ts";

export function RoutePicker({ viewport }: { viewport: () => { width: number; height: number } }) {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<RouteCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    setCatalog(null); setError(null); setSelected(new Set());
    void fetch(NUDGE_UI_ROUTES_PATH, { signal: abort.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Could not discover pages. Try again.");
      const value: unknown = await response.json();
      if (!isRouteCatalog(value)) throw new Error("The host returned an invalid page list.");
      if (!abort.signal.aborted) setCatalog(value);
    }).catch((reason: unknown) => {
      if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not discover pages.");
    });
    return () => abort.abort();
  }, [open]);
  function addSelected(): void {
    if (!canWriteWorkspace() || !catalog) return;
    const created = addPages(catalog.routes.filter((route) => selected.has(route.path) && !route.dynamic).map((route) => ({ url: new URL(route.path, window.location.origin).href, title: route.path })));
    if (!created.length) return;
    setCanvasPresentation("canvas");
    fitCanvasCards(created.map((card) => card.id), viewport());
    setOpen(false);
  }
  return <div className="canvas-route-picker" data-test="canvas-route-picker" onPointerDown={(event) => event.stopPropagation()}>
    <Button variant="secondary" onClick={() => setOpen(!open)} aria-expanded={open}>Add pages</Button>
    {open ? <section className="canvas-route-picker__panel" aria-label="Add pages to canvas" onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
      <div className="canvas-route-picker__heading"><strong>Add pages</strong><Button variant="quiet" size="compact" aria-label="Close page picker" onClick={() => setOpen(false)}>×</Button></div>
      <input aria-label="Search pages" placeholder="Search pages" value={query} onChange={(event) => setQuery(event.target.value)} autoFocus />
      {error ? <p role="alert">{error}</p> : !catalog ? <p role="status">Discovering pages…</p> : <>
        {catalog.message ? <p>{catalog.message}</p> : null}
        <div className="canvas-route-picker__routes">{catalog.routes.filter((route) => route.path.toLowerCase().includes(query.toLowerCase())).map((route) => <label key={route.path}>
          <input type="checkbox" checked={selected.has(route.path)} disabled={route.dynamic || (!selected.has(route.path) && selected.size >= 64)} onChange={(event) => { const next = new Set(selected); if (event.target.checked) next.add(route.path); else next.delete(route.path); setSelected(next); }} />
          <span>{route.path}{route.dynamic ? <small>Requires route parameters</small> : null}</span>
        </label>)}</div>
        {!catalog.routes.length ? <p>No framework pages were found.</p> : null}
        <Button variant="primary" disabled={!selected.size} onClick={addSelected}>Add selected pages as a grid ({selected.size})</Button>
      </>}
    </section> : null}
  </div>;
}
export const ROUTE_PICKER_STYLES = `
.canvas-route-picker{position:absolute;bottom:20px;right:20px;z-index:20;pointer-events:auto;font:13px system-ui}
.canvas-route-picker__panel{position:absolute;right:0;bottom:44px;width:min(360px,calc(100vw - 40px));padding:16px;background:var(--panel-bg,#fff);color:var(--text-primary,#222);border:1px solid #8884;border-radius:12px;box-shadow:0 12px 40px #0002}
.canvas-route-picker__heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
.canvas-route-picker__panel>input{width:100%;box-sizing:border-box;padding:8px;border:1px solid #8886;border-radius:6px;background:transparent;color:inherit}
.canvas-route-picker__panel p{font-size:12px;line-height:1.5;opacity:.8}
.canvas-route-picker__routes{max-height:300px;overflow:auto;margin:12px 0}
.canvas-route-picker__routes label{display:flex;align-items:center;gap:8px;padding:8px 0;cursor:pointer}
.canvas-route-picker__routes small{display:block;font-size:11px;opacity:.65}
`;
