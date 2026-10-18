/** Loads the inspector into a page without a host Adapter; everything a host normally supplies is derived from the live document. */
import {
  bootstrapNudgeUi,
  configureNudgeUiRuntime,
  getNudgeUiRuntimeConfig,
  isCanvasRenderer,
  readNudgeUiEditorTarget,
  setInspectorOpen,
  unmountInspector,
} from "./index.ts";
import { CANVAS_RENDERER_ATTR } from "./canvas/roleDetection.ts";
import { releaseLease } from "./canvas/workspaceLease.ts";
import { enablePageSurface } from "./canvas/pageSurface.ts";
import { setNudgeUiHostDevFlag } from "./runtime/devFlag.ts";
import { configureInspectorStorage, type InspectorStorage } from "./runtime/inspectorStorage.ts";
import { configureSketchStorage, type SketchStorage } from "./sketch/persistence.ts";
import { preferAdoptedStylesheets } from "./runtime/ownedStylesheets.ts";
import { enableInspectionPerformanceDiagnostics } from "./inspection/performanceDiagnostics.ts";
import { installLazyRuntimeIdentity } from "./runtime/staticHtmlRuntimeIdentity.ts";
import { createTokenInventory } from "../css/token-inventory/inventory.ts";
import type { InventoryDiagnostic, StylesheetArtifact } from "../css/token-inventory/types.ts";
import type { TokenCatalogDiagnostic, TokenDeclaration, TokenDefinition } from "../css/model/index.ts";
import type { NudgeUiRuntimeConfig } from "./runtime/runtimeConfig.ts";

export type { InspectorStorage } from "./runtime/inspectorStorage.ts";
export { createMirroredStorage } from "./runtime/inspectorStorage.ts";
export type { SketchPersistenceSnapshot, SketchStorage, SketchStorageChange } from "./sketch/persistence.ts";
export { isSketchDocument, isSketchHandoffRecord } from "./sketch/model.ts";
export type { SketchDocument, SketchHandoffRecord } from "./sketch/model.ts";

const MOUNT_ID = "nudge-ui-root";
const LOADED_FLAG = "__NUDGE_UI_PAGE_INSPECTOR__";
const COMPUTED_ROOT_ID = "computed:root";

export interface PageInspectorOptions {
  /** Replaces `localStorage` for comments, drafts, and Canvas state. */
  storage?: InspectorStorage;
  /** Replaces the page origin's IndexedDB for sketch documents and handoffs. */
  sketchStorage?: SketchStorage;
  /** Skips the `<style>` policy probe and always uses constructable stylesheets. */
  adoptStylesheets?: boolean;
  /** `"editor"` requires the editor URL marker; otherwise the page itself is the only Canvas card. */
  surface?: "editor" | "page";
  /** Shows a short error instead of enabling inspection on an unsupported page. */
  unavailableReason?: string;
  /** Called whenever an editor renderer frame's document finishes parsing. */
  onRendererFrameLoad?: () => void;
}

/** Published on `window` so a second injection toggles the first instance. */
export interface PageInspectorHandle {
  readonly surface: "editor" | "page" | "renderer";
  /** Toggles the page inspector, or leaves the editor. */
  toggle(): void;
  /** Starts the `window.__nudgeUiPerformance` counters for this document. */
  enablePerformanceDiagnostics(): void;
}

interface PageInspectorWindow extends Window {
  [LOADED_FLAG]?: PageInspectorHandle;
}

interface CollectedSheet {
  id: string;
  content?: string;
  readError?: string;
}

function isNudgeOwnedSheet(sheet: CSSStyleSheet): boolean {
  const owner = sheet.ownerNode;
  return owner instanceof Element && owner.hasAttribute("data-nudge-ui");
}

function sheetId(sheet: CSSStyleSheet, index: number, base: string): string {
  const owner = sheet.ownerNode;
  const viteId = owner instanceof HTMLElement ? owner.dataset.viteDevId : undefined;
  if (viteId) return viteId;
  if (sheet.href) {
    const url = new URL(sheet.href, base);
    return url.origin === new URL(base).origin ? url.pathname : url.href;
  }
  return `inline-style-${index + 1}`;
}

function serializeRules(sheet: CSSStyleSheet): string {
  return Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n");
}

async function collectSheet(sheet: CSSStyleSheet, index: number, base: string): Promise<CollectedSheet> {
  const id = sheetId(sheet, index, base);
  try {
    return { id, content: serializeRules(sheet) };
  } catch {
    if (!sheet.href) return { id, readError: "stylesheet rules are not readable" };
  }
  try {
    const response = await fetch(sheet.href, { mode: "cors", credentials: "omit" });
    if (!response.ok) return { id, readError: `HTTP ${response.status}` };
    return { id, content: await response.text() };
  } catch {
    return { id, readError: "cross-origin stylesheet without CORS access" };
  }
}

/** Root custom properties missing from readable stylesheets: CORS-blocked sheets, rejected scoped rules, or JS-set variables. */
function computedRootDeclarations(doc: Document, definedNames: Set<string>): string | null {
  const declarations: string[] = [];
  const view = doc.defaultView ?? window;
  for (const element of [doc.documentElement, doc.body]) {
    if (!element) continue;
    const style = view.getComputedStyle(element);
    for (let index = 0; index < style.length; index += 1) {
      const name = style.item(index);
      if (!name.startsWith("--") || definedNames.has(name)) continue;
      const value = style.getPropertyValue(name).trim();
      if (!value) continue;
      definedNames.add(name);
      declarations.push(`  ${name}: ${value};`);
    }
  }
  return declarations.length > 0 ? `:root {\n${declarations.join("\n")}\n}` : null;
}

function mapDiagnostic(diagnostic: InventoryDiagnostic): TokenCatalogDiagnostic {
  return {
    code: diagnostic.code,
    message: diagnostic.message,
    module: diagnostic.module ?? diagnostic.artifact ?? "document",
    ...(diagnostic.exportName !== undefined ? { exportName: diagnostic.exportName } : {}),
  };
}

type DocumentTokens = Pick<NudgeUiRuntimeConfig, "tokenCatalog" | "tokens" | "tokenDiagnostics" | "tokenGeneration">;

async function collectDocumentTokens(doc: Document): Promise<DocumentTokens> {
  const sheets = Array.from(doc.styleSheets).filter((sheet) => !isNudgeOwnedSheet(sheet));
  const collected = await Promise.all(sheets.map((sheet, index) => collectSheet(sheet, index, doc.location.href)));
  const inventory = createTokenInventory();
  for (const [order, sheet] of collected.entries()) {
    const artifact: StylesheetArtifact = {
      buildTool: "browser",
      id: sheet.id,
      stage: "authored",
      provenance: "project",
      order,
      ...(sheet.content !== undefined ? { content: sheet.content } : {}),
      ...(sheet.readError ? {
        diagnostics: [{
          code: "stylesheet-unreadable",
          message: `Stylesheet "${sheet.id}" could not be read: ${sheet.readError}`,
          module: sheet.id,
        }],
      } : {}),
    };
    inventory.apply(artifact);
  }
  const definedNames = new Set(inventory.snapshot().definitions.map((definition) => definition.cssName));
  const computed = computedRootDeclarations(doc, definedNames);
  if (computed) {
    inventory.apply({
      buildTool: "browser",
      id: COMPUTED_ROOT_ID,
      stage: "authored",
      provenance: "project",
      order: -1,
      content: computed,
    });
  }
  const snapshot = inventory.snapshot();
  return {
    tokenCatalog: snapshot.definitions.map((definition): TokenDefinition => ({
      ...definition,
      declarations: definition.declarations.map((declaration): TokenDeclaration => ({
        id: declaration.id,
        order: declaration.order,
        value: declaration.value,
        source: declaration.source,
        important: declaration.important,
        context: declaration.context,
      })),
    })),
    tokens: snapshot.tokens,
    tokenDiagnostics: snapshot.diagnostics.map(mapDiagnostic),
    tokenGeneration: `browser:${snapshot.generation}`,
  };
}

const NO_TOKENS: DocumentTokens = { tokenCatalog: [], tokens: [], tokenDiagnostics: [], tokenGeneration: "" };

function runtimeConfig(tokens: DocumentTokens, unavailableReason?: string): NudgeUiRuntimeConfig {
  return {
    projectId: `page:${location.origin}`,
    host: "static-html",
    framework: "HTML",
    stylingSystem: "CSS custom properties",
    capabilities: { canvas: !unavailableReason, componentSemantics: false, domNavigation: !unavailableReason },
    features: { canvasIterations: false, mcp: false, ...(unavailableReason ? { sketch: false } : {}) },
    ...(unavailableReason ? { inspectionUnavailableReason: unavailableReason } : {}),
    componentContracts: [],
    ...tokens,
  };
}

function createMount(): HTMLElement {
  const mount = document.createElement("div");
  mount.id = MOUNT_ID;
  document.body.append(mount);
  return mount;
}

/** Mounts the inspector and returns a toggle that fully unmounts and remounts it. */
function mountPageInspector(): () => void {
  let mount: HTMLElement | null = null;
  let removeIdentityListeners: (() => void) | null = null;
  const enable = (): void => {
    setNudgeUiHostDevFlag(true);
    removeIdentityListeners = installLazyRuntimeIdentity(document);
    mount = createMount();
    bootstrapNudgeUi(mount);
    setInspectorOpen(true);
  };
  const disable = (target: HTMLElement): void => {
    unmountInspector();
    removeIdentityListeners?.();
    removeIdentityListeners = null;
    releaseLease();
    setInspectorOpen(false);
    setNudgeUiHostDevFlag(false);
    target.remove();
    mount = null;
  };
  enable();
  return () => {
    if (mount) disable(mount);
    else enable();
  };
}

/** Replaces the page content with the iframe editor; the caller loads the inspector into its renderer frames. */
function mountEditor(onRendererFrameLoad: (() => void) | undefined): void {
  // The editor never owns the tab title; it shows the application's own title.
  const pageTitle = document.title;
  document.head.replaceChildren();
  document.body.replaceChildren();
  for (const element of [document.documentElement, document.body]) {
    element.removeAttribute("style");
    element.removeAttribute("hidden");
    element.removeAttribute("inert");
  }
  document.title = pageTitle;
  const layout = new CSSStyleSheet();
  layout.replaceSync(`html, body, #${MOUNT_ID} { display: block; width: 100%; height: 100%; margin: 0; overflow: hidden; }`);
  document.adoptedStyleSheets = [layout];
  // A parsed meta policy remains active even after the original head is removed.
  document.addEventListener("securitypolicyviolation", (event) => {
    if (event.disposition !== "enforce" || event.effectiveDirective !== "frame-src") return;
    if (getNudgeUiRuntimeConfig().inspectionUnavailableReason) return;
    configureNudgeUiRuntime(runtimeConfig(NO_TOKENS, "its security policy"));
  });
  setNudgeUiHostDevFlag(true);
  const mount = createMount();
  bootstrapNudgeUi(mount);
  setInspectorOpen(true);

  // Storage hydration can delay the controller mount; watch its host now.
  const root = mount.shadowRoot ?? mount.attachShadow({ mode: "open" });
  const frames = (): NodeListOf<HTMLIFrameElement> =>
    root.querySelectorAll<HTMLIFrameElement>(`iframe[${CANVAS_RENDERER_ATTR}]`);
  const applicationDocument = (frame: HTMLIFrameElement): Document | null => {
    const frameDocument = frame.contentDocument;
    return frameDocument && frameDocument.location.href !== "about:blank" ? frameDocument : null;
  };
  // A frame's `load` waits for every image, so renderers start once the DOM is ready.
  const announced = new WeakSet<Document>();
  const announceReadyDocuments = (): void => {
    for (const frame of frames()) {
      const frameDocument = applicationDocument(frame);
      if (!frameDocument || frameDocument.readyState === "loading" || announced.has(frameDocument)) continue;
      announced.add(frameDocument);
      onRendererFrameLoad?.();
    }
  };
  // Mirrors the primary application frame's title, which follows its navigation.
  const syncApplicationTitle = (): void => {
    for (const frame of frames()) {
      const frameTitle = applicationDocument(frame)?.title;
      if (frameTitle) {
        if (document.title !== frameTitle) document.title = frameTitle;
        return;
      }
    }
  };
  window.setInterval(() => {
    announceReadyDocuments();
    syncApplicationTitle();
  }, 100);
  // Script-built styles exist only in the application frames, not in this document.
  const collectFrameTokens = (frame: HTMLIFrameElement): void => {
    const frameDocument = applicationDocument(frame);
    if (!frameDocument) return;
    void collectDocumentTokens(frameDocument).then((tokens) => {
      if (getNudgeUiRuntimeConfig().inspectionUnavailableReason) return;
      if (tokens.tokenGeneration !== getNudgeUiRuntimeConfig().tokenGeneration) {
        configureNudgeUiRuntime(runtimeConfig(tokens));
      }
    });
  };
  const watched = new WeakSet<HTMLIFrameElement>();
  const watch = (): void => {
    for (const frame of frames()) {
      if (watched.has(frame)) continue;
      watched.add(frame);
      frame.addEventListener("load", () => collectFrameTokens(frame));
      collectFrameTokens(frame);
    }
  };
  new MutationObserver(watch).observe(root, { childList: true, subtree: true });
  watch();
}

function exitEditor(): void {
  location.replace(readNudgeUiEditorTarget(location.href) ?? location.href);
}

/** A second bundle copy in the same window toggles the first instance, whose stores own the UI. */
export async function startPageInspector(options: PageInspectorOptions = {}): Promise<void> {
  const target = window as PageInspectorWindow;
  const loaded = target[LOADED_FLAG];
  if (loaded) {
    loaded.toggle();
    return;
  }
  const editor = options.surface === "editor" && readNudgeUiEditorTarget(location.href) !== null;
  let toggle: (() => void) | null = editor ? exitEditor : null;
  target[LOADED_FLAG] = {
    surface: editor ? "editor" : "page",
    toggle: () => toggle?.(),
    enablePerformanceDiagnostics: () => enableInspectionPerformanceDiagnostics(document),
  };
  if (options.storage) configureInspectorStorage(options.storage);
  if (options.sketchStorage) configureSketchStorage(options.sketchStorage);
  if (options.adoptStylesheets) preferAdoptedStylesheets();

  const tokens = options.unavailableReason ? NO_TOKENS : await collectDocumentTokens(document);
  configureNudgeUiRuntime(runtimeConfig(tokens, options.unavailableReason));
  if (editor) {
    mountEditor(options.onRendererFrameLoad);
  } else {
    if (!options.unavailableReason) enablePageSurface();
    toggle = mountPageInspector();
  }
  console.info(
    `[nudge-ui] Inspector loaded in ${editor ? "editor" : "page"} mode with ${tokens.tokenCatalog.length} tokens`
      + (tokens.tokenDiagnostics.length > 0 ? ` and ${tokens.tokenDiagnostics.length} stylesheet diagnostics.` : "."),
    tokens.tokenDiagnostics,
  );
}

/** Only acts inside an editor Canvas frame that has no renderer yet. */
export function startCanvasRenderer(options: Pick<PageInspectorOptions, "adoptStylesheets"> = {}): void {
  const target = window as PageInspectorWindow;
  if (!isCanvasRenderer() || target[LOADED_FLAG]) return;
  target[LOADED_FLAG] = {
    surface: "renderer",
    toggle: () => undefined,
    enablePerformanceDiagnostics: () => enableInspectionPerformanceDiagnostics(document),
  };
  if (options.adoptStylesheets) preferAdoptedStylesheets();
  setNudgeUiHostDevFlag(true);
  installLazyRuntimeIdentity(document);
  configureNudgeUiRuntime(runtimeConfig(NO_TOKENS));
  bootstrapNudgeUi(createMount());
  // Renderers inspect their own elements, so they need this document's tokens.
  const collectTokens = (): void => {
    void collectDocumentTokens(document).then((tokens) => {
      if (tokens.tokenGeneration !== getNudgeUiRuntimeConfig().tokenGeneration) {
        configureNudgeUiRuntime(runtimeConfig(tokens));
      }
    });
  };
  collectTokens();
  if (document.readyState !== "complete") window.addEventListener("load", collectTokens, { once: true });
}
