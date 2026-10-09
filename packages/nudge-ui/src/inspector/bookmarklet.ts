/**
 * Spike entry for loading the inspector into any page without a host Adapter.
 *
 * Everything a host normally supplies is derived from the live document:
 * runtime identity is assigned lazily under the pointer, and tokens come from
 * readable stylesheets plus the root's computed custom properties. Source locations,
 * component semantics, iterations, and the agent bridge are unavailable.
 *
 * When the page allows same-origin framing, the bookmarklet turns the page
 * into the iframe editor and injects itself into each renderer frame, so the
 * full Canvas board is available. Otherwise, or with `?surface=page` on the
 * bundle URL, the page itself becomes the only Canvas card.
 */
import {
  bootstrapNudgeUi,
  configureNudgeUiRuntime,
  createNudgeUiEditorUrl,
  isCanvasRenderer,
  setInspectorOpen,
  toggleInspector,
} from "./index.ts";
import { CANVAS_RENDERER_ATTR } from "./canvas/roleDetection.ts";
import { enablePageSurface } from "./canvas/pageSurface.ts";
import {
  getCanvasLayoutTransitioning,
  getCanvasMode,
  getCanvasPresentation,
  getCanvasPresentationTransitioning,
  getTemporaryAppInteraction,
} from "./canvas/viewStore.ts";
import { getCanvasCards, getSelectedCardId } from "./canvas/canvasStore.ts";
import { getRegisteredFrames } from "./canvas/projection.ts";
import { RENDERER_ELEMENT_ID_ATTR } from "./canvas/rendererCidIndex.ts";
import { getSelectedElements } from "./selection/selectionStore.ts";
import { getInlineTextSession } from "./inline-text/inlineTextEditor.ts";
import { setNudgeUiHostDevFlag } from "./runtime/devFlag.ts";
import { enableInspectionPerformanceDiagnostics } from "./inspection/performanceDiagnostics.ts";
import { installLazyRuntimeIdentity } from "./runtime/staticHtmlRuntimeIdentity.ts";
import { createTokenInventory } from "../css/token-inventory/inventory.ts";
import type { InventoryDiagnostic, StylesheetArtifact } from "../css/token-inventory/types.ts";
import type { TokenCatalogDiagnostic, TokenDeclaration, TokenDefinition } from "../css/model/index.ts";
import type { NudgeUiRuntimeConfig } from "./runtime/runtimeConfig.ts";

const MOUNT_ID = "nudge-ui-root";
const LOADED_FLAG = "__NUDGE_UI_BOOKMARKLET__";
const COMPUTED_ROOT_ID = "computed:root";
// Read synchronously: `document.currentScript` is only set while the bundle first evaluates.
const BUNDLE_URL = document.currentScript instanceof HTMLScriptElement ? document.currentScript.src : null;

interface BookmarkletWindow extends Window {
  [LOADED_FLAG]?: { toggle(): void };
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

function sheetId(sheet: CSSStyleSheet, index: number): string {
  const owner = sheet.ownerNode;
  const viteId = owner instanceof HTMLElement ? owner.dataset.viteDevId : undefined;
  if (viteId) return viteId;
  if (sheet.href) {
    const url = new URL(sheet.href, location.href);
    return url.origin === location.origin ? url.pathname : url.href;
  }
  return `inline-style-${index + 1}`;
}

function serializeRules(sheet: CSSStyleSheet): string {
  return Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n");
}

async function collectSheet(sheet: CSSStyleSheet, index: number): Promise<CollectedSheet> {
  const id = sheetId(sheet, index);
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

/**
 * Custom properties visible on the root element but absent from readable
 * stylesheets: definitions in cross-origin sheets without CORS, scoped theme
 * rules the inventory rejects, or variables set from JavaScript.
 */
function computedRootDeclarations(definedNames: Set<string>): string | null {
  const declarations: string[] = [];
  for (const element of [document.documentElement, document.body]) {
    const style = getComputedStyle(element);
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

async function collectDocumentTokens(): Promise<Pick<
  NudgeUiRuntimeConfig,
  "tokenCatalog" | "tokens" | "tokenDiagnostics" | "tokenGeneration"
>> {
  const sheets = Array.from(document.styleSheets).filter((sheet) => !isNudgeOwnedSheet(sheet));
  const collected = await Promise.all(sheets.map(collectSheet));
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
  const computed = computedRootDeclarations(definedNames);
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

function createMountElement(): HTMLElement {
  const mount = document.createElement("div");
  mount.id = MOUNT_ID;
  document.body.append(mount);
  return mount;
}

function runtimeConfig(
  tokens: Partial<Pick<NudgeUiRuntimeConfig, "tokenCatalog" | "tokens" | "tokenDiagnostics" | "tokenGeneration">>,
): NudgeUiRuntimeConfig {
  return {
    projectId: `bookmarklet:${location.origin}`,
    host: "static-html",
    framework: "HTML",
    stylingSystem: "CSS custom properties",
    capabilities: { canvas: true, componentSemantics: false, domNavigation: true },
    features: { canvasIterations: false },
    componentContracts: [],
    tokenCatalog: [],
    tokens: [],
    tokenDiagnostics: [],
    tokenGeneration: "",
    ...tokens,
  };
}

/** Whether the page's own response headers allow a same-origin frame. */
async function allowsSameOriginFraming(): Promise<boolean> {
  try {
    const response = await fetch(location.href, { method: "HEAD", credentials: "include", cache: "no-store" });
    const frameOptions = response.headers.get("x-frame-options")?.toLowerCase() ?? "";
    if (frameOptions.includes("deny")) return false;
    const frameAncestors = /frame-ancestors([^;]*)/i.exec(response.headers.get("content-security-policy") ?? "")?.[1];
    return frameAncestors === undefined || /'self'|\*/.test(frameAncestors) || frameAncestors.includes(location.origin);
  } catch {
    return true;
  }
}

/** Replaces the visible page with the editor while the application reloads in its frames. */
function enterEditorDocument(): HTMLElement {
  history.replaceState(history.state, "", createNudgeUiEditorUrl(location.href));
  document.documentElement.setAttribute("data-nudge-ui-editor", "");
  const style = document.createElement("style");
  style.setAttribute("data-nudge-ui", "bookmarklet-editor");
  style.textContent = `body > :not(#${MOUNT_ID}) { display: none !important; }`
    + `html, body, #${MOUNT_ID} { width: 100%; height: 100%; margin: 0; overflow: hidden; }`;
  document.head.append(style);
  return createMountElement();
}

/** Loads this bundle into every Canvas renderer frame after each navigation. */
function injectIntoRendererFrames(mount: HTMLElement): void {
  const root = mount.shadowRoot;
  if (!root || !BUNDLE_URL) return;
  const bundleUrl = BUNDLE_URL;
  const watched = new WeakSet<HTMLIFrameElement>();
  const inject = (frame: HTMLIFrameElement): void => {
    const frameDocument = frame.contentDocument;
    if (!frameDocument?.head || frameDocument.location.href === "about:blank") return;
    if (frameDocument.querySelector("script[data-nudge-ui-bookmarklet]")) return;
    const script = frameDocument.createElement("script");
    script.src = bundleUrl;
    script.setAttribute("data-nudge-ui-bookmarklet", "");
    frameDocument.head.append(script);
  };
  const watch = (): void => {
    for (const frame of root.querySelectorAll<HTMLIFrameElement>(`iframe[${CANVAS_RENDERER_ATTR}]`)) {
      if (watched.has(frame)) continue;
      watched.add(frame);
      frame.addEventListener("load", () => inject(frame));
      inject(frame);
    }
  };
  new MutationObserver(watch).observe(root, { childList: true, subtree: true });
  watch();
}

/** The Chrome extension sets the global before injecting; the bookmarklet uses its bundle URL. */
function requestedSurface(): string | null {
  const injected = (window as Window & { __NUDGE_UI_SURFACE__?: unknown }).__NUDGE_UI_SURFACE__;
  if (typeof injected === "string") return injected;
  return BUNDLE_URL ? new URL(BUNDLE_URL).searchParams.get("surface") : null;
}

async function startController(): Promise<void> {
  const tokens = await collectDocumentTokens();
  const editor = requestedSurface() !== "page" && await allowsSameOriginFraming();
  configureNudgeUiRuntime(runtimeConfig(tokens));
  if (editor) {
    const mount = enterEditorDocument();
    bootstrapNudgeUi(mount);
    injectIntoRendererFrames(mount);
  } else {
    installLazyRuntimeIdentity(document);
    enablePageSurface();
    bootstrapNudgeUi(createMountElement());
    setInspectorOpen(true);
  }
  console.info(
    `[nudge-ui] Bookmarklet loaded in ${editor ? "editor" : "page"} mode with ${tokens.tokenCatalog.length} tokens`
      + (tokens.tokenDiagnostics.length > 0 ? ` and ${tokens.tokenDiagnostics.length} stylesheet diagnostics.` : "."),
    tokens.tokenDiagnostics,
  );
}

// Temporary spike diagnostics for hosts that cannot be reproduced locally.
function installDebugHook(): void {
  (window as unknown as Record<string, unknown>).__NUDGE_UI_DEBUG__ = () => {
    const ids = new Map<string, number>();
    for (const el of document.querySelectorAll(`[${RENDERER_ELEMENT_ID_ATTR}]`)) {
      const id = el.getAttribute(RENDERER_ELEMENT_ID_ATTR) ?? "";
      ids.set(id, (ids.get(id) ?? 0) + 1);
    }
    const inline = getInlineTextSession();
    return {
      mode: getCanvasMode(),
      presentation: getCanvasPresentation(),
      presentationTransitioning: getCanvasPresentationTransitioning(),
      layoutTransitioning: getCanvasLayoutTransitioning(),
      temporaryAppInteraction: getTemporaryAppInteraction(),
      inlineTextActive: inline !== null,
      cards: getCanvasCards().map((card) => card.id),
      selectedCardId: getSelectedCardId(),
      registeredFrames: [...getRegisteredFrames().keys()],
      selectedElements: getSelectedElements().length,
      rendererIds: ids.size,
      duplicateRendererIds: [...ids].filter(([, count]) => count > 1).length,
    };
  };
}

async function start(): Promise<void> {
  const target = window as BookmarkletWindow;
  // A rerun evaluates a second bundle copy; only the first copy's stores drive the UI.
  const loaded = target[LOADED_FLAG];
  if (loaded) {
    loaded.toggle();
    return;
  }
  target[LOADED_FLAG] = { toggle: toggleInspector };
  installDebugHook();
  setNudgeUiHostDevFlag(true);
  if (BUNDLE_URL && new URL(BUNDLE_URL).searchParams.get("perf") === "1") {
    enableInspectionPerformanceDiagnostics(document);
  }

  if (isCanvasRenderer()) {
    installLazyRuntimeIdentity(document);
    configureNudgeUiRuntime(runtimeConfig({}));
    bootstrapNudgeUi(createMountElement());
    return;
  }
  await startController();
}

void start().catch((error: unknown) => {
  console.error("[nudge-ui] Bookmarklet failed to start.", error);
});
