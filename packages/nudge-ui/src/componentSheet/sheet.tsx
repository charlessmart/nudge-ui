import {
  Component,
  createElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import type { ComponentContract } from "../inspector/componentSemantics/types.ts";
import {
  VARIANT_ATTRIBUTE,
  variantAttributeValue,
  variantTokensForProps,
} from "../inspector/componentSemantics/variantMarkers.ts";
import {
  cellProps,
  planSheetLayout,
  type DocumentPseudos,
} from "./model.ts";
import { buildSheetSetupPrompt } from "./setupPrompt.ts";
import { headingRule } from "../inspector/ui/headingStyle.ts";
import {
  buildStateStyles,
  emptyStateSelectors,
  statesUsedWithin,
  type RuleLike,
  type StateSelectors,
} from "./stateStyles.ts";

const NO_PSEUDOS: DocumentPseudos = { hover: false, focus: false, active: false, disabled: false };

export type SheetComponentLoader = () => Promise<unknown>;

/** What every cell is rendered inside: the project's providers, from its sheet wrapper file. */
export type SheetWrapperComponent = ComponentType<{
  children?: ReactNode;
  component: { id: string; name: string };
}>;

export interface SheetWrapperOptions {
  /** Project-relative path: the existing wrapper, else where the setup prompt asks for one. */
  file: string;
  /** Imports the wrapper's component, or null when the project has no wrapper file. */
  load: (() => Promise<unknown>) | null;
}

export interface MountComponentSheetOptions {
  contracts: readonly ComponentContract[];
  loaders: Readonly<Record<string, SheetComponentLoader>>;
  componentId: string | null;
  sheetWrapper?: SheetWrapperOptions;
  container?: HTMLElement;
}

const STATES_ATTRIBUTE = "sheet-states";
const CHROME_ATTRIBUTE = "sheet-chrome";

const CHROME_CSS = `
.nudge-sheet { --sheet-bg: #f5f5f5; --sheet-text: #1f1f1f; --sheet-muted: #8a8a8a; --sheet-line: #e2e2e2; --sheet-set: #9747ff; --sheet-control: #ffffff; }
.nudge-sheet[data-theme="dark"] { --sheet-bg: #1e1e1e; --sheet-text: #f2f2f2; --sheet-muted: #9a9a9a; --sheet-line: #333333; --sheet-set: #a97cff; --sheet-control: #2c2c2c; }
html, body { margin: 0; }
.nudge-sheet { box-sizing: border-box; min-height: 100vh; padding: 56px 48px 72px; background: var(--sheet-bg); color: var(--sheet-text); font: 13px/1.4 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.nudge-sheet *, .nudge-sheet *::before, .nudge-sheet *::after { box-sizing: border-box; }
.nudge-sheet-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 40px; user-select: none; }
.nudge-sheet-title { margin: 0; color: var(--sheet-text); }
${headingRule(".nudge-sheet-title")}
.nudge-sheet-meta { margin: 10px 0 0; font-size: 12px; color: var(--sheet-muted); }
.nudge-sheet-theme { display: inline-flex; padding: 2px; border-radius: 8px; background: var(--sheet-line); }
.nudge-sheet-theme button { padding: 4px 10px; border: 0; border-radius: 6px; background: transparent; color: var(--sheet-muted); font: 500 12px/1.2 inherit; font-family: inherit; cursor: pointer; }
.nudge-sheet-theme button[aria-pressed="true"] { background: var(--sheet-control); color: var(--sheet-text); box-shadow: 0 1px 2px rgb(0 0 0 / 12%); }
.nudge-sheet-grid { display: grid; column-gap: 8px; row-gap: 4px; align-items: center; width: max-content; }
.nudge-sheet-set { position: relative; grid-row: 2 / -1; grid-column: 2 / -1; align-self: stretch; margin: -8px -12px; border: 1px dashed var(--sheet-set); border-radius: 6px; pointer-events: none; }
.nudge-sheet-set-label { position: absolute; bottom: 100%; left: -1px; display: flex; align-items: center; gap: 4px; padding-bottom: 2px; color: var(--sheet-set); font-size: 12px; font-weight: 500; white-space: nowrap; user-select: none; }
.nudge-sheet-colhead { padding: 0 8px 28px; font-size: 12px; font-weight: 500; color: var(--sheet-muted); text-align: center; user-select: none; }
.nudge-sheet-rowlabel { padding-right: 40px; font-size: 13px; color: var(--sheet-muted); white-space: nowrap; user-select: none; }
.nudge-sheet-cell { display: flex; align-items: center; justify-content: center; min-width: 140px; min-height: 72px; padding: 16px 20px; }
.nudge-sheet-needs { padding: 3px 8px; border: 1px dashed var(--sheet-muted); border-radius: 4px; font-size: 11px; color: var(--sheet-muted); cursor: help; }
.nudge-sheet-setup { display: flex; align-items: center; gap: 12px; width: max-content; max-width: 100%; margin: -16px 0 32px; padding: 8px 8px 8px 12px; border: 1px solid var(--sheet-line); border-radius: 8px; background: var(--sheet-control); color: var(--sheet-text); font-size: 12px; }
.nudge-sheet-setup button { padding: 4px 10px; border: 0; border-radius: 6px; background: var(--sheet-set); color: #ffffff; font: 500 12px/1.2 inherit; font-family: inherit; cursor: pointer; }
.nudge-sheet-message { max-width: 520px; padding: 24px 0; font-size: 14px; color: var(--sheet-muted); }
.nudge-sheet-message a { color: var(--sheet-text); }
.nudge-sheet-list { margin: 12px 0 0; padding: 0; list-style: none; }
.nudge-sheet-list li { margin: 4px 0; }
`;

export function mountComponentSheet(options: MountComponentSheetOptions): void {
  installChrome();
  const container = options.container ?? document.getElementById("root") ?? document.body;
  createRoot(container).render(createElement(ComponentSheet, options));
}

function installChrome(): void {
  if (document.querySelector(`style[data-nudge-ui="${CHROME_ATTRIBUTE}"]`)) return;
  const style = document.createElement("style");
  style.setAttribute("data-nudge-ui", CHROME_ATTRIBUTE);
  style.textContent = CHROME_CSS;
  document.head.insertBefore(style, document.head.firstChild);
}

function ownStateSheet(): HTMLStyleElement | null {
  return document.head.querySelector<HTMLStyleElement>(`style[data-nudge-ui="${STATES_ATTRIBUTE}"]`);
}

function isOwnSheet(sheet: CSSStyleSheet): boolean {
  const owner = sheet.ownerNode;
  return owner instanceof Element && (
    owner.getAttribute("data-nudge-ui") === STATES_ATTRIBUTE
    || owner.getAttribute("data-nudge-ui") === CHROME_ATTRIBUTE
  );
}

function readableRules(sheet: CSSStyleSheet): ArrayLike<RuleLike> | null {
  try {
    return sheet.cssRules as unknown as ArrayLike<RuleLike>;
  } catch {
    return null;
  }
}

function documentRuleLists(): Array<ArrayLike<RuleLike>> {
  const lists: Array<ArrayLike<RuleLike>> = [];
  for (const sheet of [...document.styleSheets, ...document.adoptedStyleSheets]) {
    if (isOwnSheet(sheet)) continue;
    const rules = readableRules(sheet);
    if (rules) lists.push(rules);
  }
  return lists;
}

/** Keeps a forced-state copy of the document's CSS current while Nudge edits stylesheets. */
function useStateSelectors(): StateSelectors {
  const [selectors, setSelectors] = useState<StateSelectors>(emptyStateSelectors);
  useEffect(() => {
    // A timer, not requestAnimationFrame: browsers pause frames in hidden or off-screen iframes, and a sheet often is one.
    let frame: ReturnType<typeof setTimeout> | null = null;
    let lastCss = "";
    function rebuild(): void {
      frame = null;
      const { css, selectors: next } = buildStateStyles(documentRuleLists());
      let style = ownStateSheet();
      if (!style) {
        style = document.createElement("style");
        style.setAttribute("data-nudge-ui", STATES_ATTRIBUTE);
        document.head.append(style);
      }
      // Sits just before Nudge's managed sheet, as the authored CSS does; that sheet keeps itself last, so chasing it would loop.
      const managed = document.head.querySelector(`style[data-nudge-ui="managed"]`);
      if (managed && style.nextElementSibling !== managed) document.head.insertBefore(style, managed);
      if (css !== lastCss) {
        style.textContent = css;
        lastCss = css;
        setSelectors(next);
      }
    }
    function schedule(): void {
      if (frame === null) frame = setTimeout(rebuild, 16);
    }
    const observer = new MutationObserver((records) => {
      const own = ownStateSheet();
      const foreign = records.some((record) => {
        if (own && (record.target === own || own.contains(record.target))) return false;
        const touched = [...record.addedNodes, ...record.removedNodes];
        return !(touched.length > 0 && touched.every((node) => node === own));
      });
      if (foreign) schedule();
    });
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    schedule();
    return () => {
      observer.disconnect();
      if (frame !== null) clearTimeout(frame);
    };
  }, []);
  return selectors;
}

class CellBoundary extends Component<
  { children?: ReactNode; cellKey: string; onFailure(cellKey: string, message: string): void },
  { message: string | null }
> {
  override state: { message: string | null } = { message: null };

  static getDerivedStateFromError(error: unknown): { message: string } {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo): void {
    this.props.onFailure(this.props.cellKey, error instanceof Error ? error.message : String(error));
  }

  override render(): ReactNode {
    if (this.state.message === null) return this.props.children;
    return createElement(
      "span",
      { className: "nudge-sheet-needs", "data-nudge-ui-sheet-chrome": "", title: this.state.message },
      "Can't render",
    );
  }
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; component: ComponentType<Record<string, unknown>> }
  | { status: "error"; message: string };

function useLoadedComponent(loader: SheetComponentLoader | undefined): LoadState {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    if (!loader) {
      setState({ status: "error", message: "This component cannot be imported." });
      return;
    }
    loader().then((component) => {
      if (cancelled) return;
      if (component === undefined || component === null) {
        setState({ status: "error", message: "The module does not export this component." });
      } else {
        setState({ status: "ready", component: component as ComponentType<Record<string, unknown>> });
      }
    }, (error: unknown) => {
      if (!cancelled) {
        setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loader]);
  return state;
}

type WrapperState =
  | { status: "none" }
  | { status: "loading" }
  | { status: "ready"; component: SheetWrapperComponent | null }
  | { status: "error"; message: string };

/** The project's wrapper, loaded beside the component so a wrapper that fails to import is reported, not fatal. */
function useSheetWrapper(options: SheetWrapperOptions | undefined): WrapperState {
  const load = options?.load ?? null;
  const [state, setState] = useState<WrapperState>(load ? { status: "loading" } : { status: "none" });
  useEffect(() => {
    let cancelled = false;
    if (!load) {
      setState({ status: "none" });
      return;
    }
    setState({ status: "loading" });
    load().then((component) => {
      if (!cancelled) {
        setState({ status: "ready", component: typeof component === "function" || (typeof component === "object" && component !== null) ? component as SheetWrapperComponent : null });
      }
    }, (error: unknown) => {
      if (!cancelled) setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
    });
    return () => {
      cancelled = true;
    };
  }, [load]);
  return state;
}

/** Writes through the async clipboard when the frame may, else through a selected textarea. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      field.remove();
    }
  }
}

type SheetTheme = "auto" | "light" | "dark";
const THEME_STORAGE_KEY = "nudge-ui:component-sheet-theme";

function readStoredTheme(): SheetTheme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "auto";
  } catch {
    return "auto";
  }
}

function useSheetTheme(): [SheetTheme, (theme: SheetTheme) => void] {
  const [theme, setTheme] = useState<SheetTheme>(readStoredTheme);
  return [theme, (next) => {
    setTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // The choice still applies until the frame reloads.
    }
  }];
}

function luminance(color: string): number | null {
  const channels = color.match(/[\d.]+/g)?.map(Number);
  if (!channels || channels.length < 3) return null;
  if (channels.length > 3 && channels[3] === 0) return null;
  const [red, green, blue] = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** Design systems often paint a control's fill on a pseudo-element so it can animate separately from the label. */
function paintsSurface(element: Element): boolean {
  return luminance(getComputedStyle(element).backgroundColor) !== null
    || luminance(getComputedStyle(element, "::before").backgroundColor) !== null
    || luminance(getComputedStyle(element, "::after").backgroundColor) !== null;
}

/** Picks the backdrop the components were designed for: text drawn straight on the canvas votes by its own lightness. */
export function prefersDarkBackdrop(cells: readonly Element[], pageIsDark?: boolean): boolean {
  let lightText = 0;
  let darkText = 0;
  const surfaces: number[] = [];
  for (const cell of cells) {
    for (const element of cell.querySelectorAll("*")) {
      if (element.closest("[data-nudge-ui-sheet-chrome]")) continue;
      const style = getComputedStyle(element);
      const surface = luminance(style.backgroundColor);
      if (surface !== null) {
        surfaces.push(surface);
        continue;
      }
      const hasText = [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
      if (!hasText) continue;
      let painted = paintsSurface(element);
      for (let parent = element.parentElement; !painted && parent && parent !== cell; parent = parent.parentElement) {
        painted = paintsSurface(parent);
      }
      if (painted) continue;
      const text = luminance(style.color);
      if (text === null) continue;
      // Above this luminance, text contrasts more with black than with white.
      if (text > 0.179) lightText++;
      else darkText++;
    }
  }
  if (lightText !== darkText) return lightText > darkText;
  if (pageIsDark !== undefined) return pageIsDark;
  if (surfaces.length === 0) return false;
  return surfaces.reduce((sum, value) => sum + value, 0) / surfaces.length < 0.2;
}

function chrome(tag: string, className: string, children: ReactNode, extra: Record<string, unknown> = {}) {
  return createElement(tag, { className, "data-nudge-ui-sheet-chrome": "", ...extra }, children);
}

function message(text: ReactNode, extra?: ReactNode) {
  return createElement(
    "main",
    { className: "nudge-sheet" },
    createElement("div", { className: "nudge-sheet-message", "data-nudge-ui-sheet-chrome": "" }, text, extra),
  );
}

function ComponentSheet(options: MountComponentSheetOptions): ReactNode {
  const { contracts, loaders, componentId } = options;
  const contract = contracts.find((candidate) => candidate.componentId === componentId);
  const stateSelectors = useStateSelectors();
  const [pseudos, setPseudos] = useState<DocumentPseudos>(NO_PSEUDOS);
  const loaded = useLoadedComponent(contract ? loaders[contract.componentId] : undefined);
  const wrapper = useSheetWrapper(options.sheetWrapper);
  const [failures, setFailures] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [copied, setCopied] = useState(false);
  const reportFailure = useCallback((cellKey: string, failure: string) => {
    setFailures((current) => new Map(current).set(cellKey, failure));
  }, []);
  // A new component, or a wrapper that finished loading, renders every cell afresh. Resetting while rendering, not in
  // an effect, keeps the reset ahead of the failures those new cells report as they mount.
  const generation = `${contract?.componentId ?? ""}|${wrapper.status}`;
  const [seenGeneration, setSeenGeneration] = useState(generation);
  if (seenGeneration !== generation) {
    setSeenGeneration(generation);
    setFailures(new Map());
    setCopied(false);
  }
  const [theme, setTheme] = useSheetTheme();
  const [autoDark, setAutoDark] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  // The editor copies the application's root theme attributes in after mount, which repaints every cell.
  const [rootRevision, setRootRevision] = useState(0);
  useEffect(() => {
    const observer = new MutationObserver(() => setRootRevision((revision) => revision + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "data-mode", "data-color-scheme"] });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class", "data-theme", "data-mode", "data-color-scheme"] });
    // A frame that is hidden or unsized has no layout, so container-query styles only apply once it gets a size.
    const resize = new ResizeObserver(() => setRootRevision((revision) => revision + 1));
    resize.observe(document.documentElement);
    return () => {
      observer.disconnect();
      resize.disconnect();
    };
  }, []);
  // The application's own page colour is the most faithful backdrop; rendered text is the fallback signal.
  const [appBackdrop, setAppBackdrop] = useState<string | null>(null);
  useLayoutEffect(() => {
    const page = [document.body, document.documentElement]
      .map((element) => getComputedStyle(element).backgroundColor)
      .find((color) => luminance(color) !== null) ?? null;
    const pageIsDark = page ? luminance(page)! < 0.4 : undefined;
    const grid = gridRef.current;
    if (theme !== "auto" || !grid) return;
    const nextDark = prefersDarkBackdrop([...grid.querySelectorAll('[data-nudge-ui-sheet-state="base"]')], pageIsDark);
    setAutoDark(nextDark);
    // The page colour is only the backdrop when it agrees with what the components need.
    setAppBackdrop(page && pageIsDark === nextDark ? page : null);
    // Stylesheet changes (the app's CSS arriving, Nudge edits) can change the page colour and text colours.
  }, [theme, loaded.status, contract?.componentId, rootRevision, stateSelectors]);
  const dark = theme === "dark" || (theme === "auto" && autoDark);
  // Columns follow the states this component's own elements are styled for, not every state the page's CSS uses.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const next = statesUsedWithin([...grid.querySelectorAll('[data-nudge-ui-sheet-state="base"]')], stateSelectors);
    setPseudos((current) => (["hover", "focus", "active", "disabled"] as const).every((state) => current[state] === next[state]) ? current : next);
  }, [stateSelectors, loaded.status, contract?.componentId]);

  if (!contract) {
    return message(
      componentId ? `No component named "${componentId}" was found.` : "Choose a component to preview.",
      contracts.length > 0
        ? createElement(
          "ul",
          { className: "nudge-sheet-list" },
          contracts.slice(0, 50).map((candidate) =>
            createElement(
              "li",
              { key: candidate.componentId },
              createElement(
                "a",
                { href: `?component=${encodeURIComponent(candidate.componentId)}` },
                candidate.name,
              ),
            )),
        )
        : null,
    );
  }

  const header = createElement(
    "header",
    { className: "nudge-sheet-header", "data-nudge-ui-sheet-chrome": "" },
    createElement(
      "div",
      null,
      chrome("div", "nudge-sheet-title", contract.name, { role: "heading", "aria-level": 1 }),
      chrome("p", "nudge-sheet-meta", contract.file),
    ),
    chrome("div", "nudge-sheet-theme", (["auto", "light", "dark"] as const).map((option) => createElement(
      "button",
      {
        key: option,
        type: "button",
        "aria-pressed": theme === option,
        "data-nudge-ui-sheet-chrome": "",
        onClick: () => setTheme(option),
      },
      option[0]!.toUpperCase() + option.slice(1),
    )), { role: "group", "aria-label": "Sheet background" }),
  );

  let body: ReactNode;
  let totalCells = 0;
  if (loaded.status === "loading" || wrapper.status === "loading") {
    body = chrome("div", "nudge-sheet-message", "Loading component…");
  } else if (loaded.status === "error") {
    body = chrome("div", "nudge-sheet-message", `Could not load ${contract.name}: ${loaded.message}`);
  } else {
    const { rows, columns } = planSheetLayout(contract, pseudos);
    totalCells = rows.length * columns.length;
    const cells: ReactNode[] = [
      chrome("div", "nudge-sheet-set", chrome("span", "nudge-sheet-set-label", `\u2756 ${contract.name}`), { key: "set", "aria-hidden": true }),
      ...columns.map((column, columnIndex) => chrome("div", "nudge-sheet-colhead", column.label, {
        key: `h-${column.state}-${column.label}`,
        style: { gridRow: 1, gridColumn: columnIndex + 2 },
      })),
    ];
    for (const [rowIndex, row] of rows.entries()) {
      cells.push(chrome("div", "nudge-sheet-rowlabel", row.label, { key: `l-${row.label}`, style: { gridRow: rowIndex + 2, gridColumn: 1 } }));
      for (const [columnIndex, column] of columns.entries()) {
        const props = cellProps(contract, row, column);
        cells.push(createElement(
          "div",
          {
            key: `c-${row.label}-${column.state}-${column.label}`,
            className: "nudge-sheet-cell",
            style: { gridRow: rowIndex + 2, gridColumn: columnIndex + 2 },
            "data-nudge-ui-sheet-cell": "",
            "data-nudge-ui-sheet-state": column.state,
            [VARIANT_ATTRIBUTE]: variantAttributeValue(variantTokensForProps(contract, props)),
          },
          createElement(
            CellBoundary,
            { cellKey: `${row.label}|${column.state}|${column.label}`, onFailure: reportFailure },
            wrapper.status === "ready" && wrapper.component
              ? createElement(
                wrapper.component,
                { component: { id: contract.componentId, name: contract.name } },
                createElement(loaded.component, props),
              )
              : createElement(loaded.component, props),
          ),
        ));
      }
    }
    body = createElement(
      "div",
      {
        ref: gridRef,
        className: "nudge-sheet-grid",
        style: {
          gridTemplateColumns: `auto repeat(${columns.length}, auto)`,
          gridTemplateRows: `auto repeat(${rows.length}, auto)`,
        },
      },
      cells,
    );
  }

  // Cells that fail are usually missing the providers the application's root supplies; a wrapper file supplies them.
  const wrapperError = wrapper.status === "error" ? wrapper.message : null;
  const setup = options.sheetWrapper;
  const banner = setup && (failures.size > 0 || wrapperError !== null)
    ? createElement(
      "div",
      { className: "nudge-sheet-setup", role: "status", "data-nudge-ui-sheet-chrome": "", "data-test": "sheet-setup" },
      createElement(
        "span",
        null,
        wrapperError !== null
          ? `${setup.file} did not load.`
          : `${failures.size} of ${totalCells} cells can't render.`,
      ),
      createElement(
        "button",
        {
          type: "button",
          "data-nudge-ui-sheet-chrome": "",
          "data-test": "sheet-setup-copy",
          onClick: () => {
            const prompt = buildSheetSetupPrompt({
              component: { name: contract.name, file: contract.file },
              errors: [...failures.values()],
              failedCells: failures.size,
              totalCells,
              wrapperFile: setup.file,
              wrapperExists: setup.load !== null,
              wrapperError,
            });
            void copyText(prompt).then((ok) => setCopied(ok));
          },
        },
        copied ? "Copied" : "Copy setup prompt",
      ),
    )
    : null;

  return createElement(
    "main",
    {
      className: "nudge-sheet",
      "data-theme": dark ? "dark" : "light",
      "data-nudge-ui-component-sheet": contract.componentId,
      style: theme === "auto" && appBackdrop ? { "--sheet-bg": appBackdrop } : undefined,
    },
    header,
    banner,
    body,
  );
}
