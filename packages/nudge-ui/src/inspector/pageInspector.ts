/** Loads the inspector into a page without a host Adapter; everything a host normally supplies is derived from the live document. */
import {
  bootstrapNudgeUi,
  configureNudgeUiRuntime,
  setInspectorOpen,
  unmountInspector,
} from "./index.ts";
import { releaseLease } from "./canvas/workspaceLease.ts";
import { enablePageSurface } from "./canvas/pageSurface.ts";
import { setNudgeUiHostDevFlag } from "./runtime/devFlag.ts";
import { configureInspectorStorage, type InspectorStorage } from "./runtime/inspectorStorage.ts";
import { configureSketchStorage, type SketchStorage } from "./sketch/persistence.ts";
import { configureSystemFontSource, type SystemFontSource } from "./runtime/systemFonts.ts";
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
export type { SystemFontAccess, SystemFontSource } from "./runtime/systemFonts.ts";
export type { SketchDocument, SketchHandoffRecord } from "./sketch/model.ts";

const MOUNT_ID = "nudge-ui-root";
const LOADED_FLAG = "__NUDGE_UI_PAGE_INSPECTOR__";
const COMPUTED_ROOT_ID = "computed:root";

export interface PageInspectorOptions {
  /** Replaces `localStorage` for comments, drafts, and Canvas state. */
  storage?: InspectorStorage;
  /** Replaces the page origin's IndexedDB for sketch documents and handoffs. */
  sketchStorage?: SketchStorage;
  /** Replaces the Local Font Access API for the font family list. */
  systemFonts?: SystemFontSource;
  /** Skips the `<style>` policy probe and always uses constructable stylesheets. */
  adoptStylesheets?: boolean;
}

/** Published on `window` so a second injection toggles the first instance. */
export interface PageInspectorHandle {
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

/** `canvas` stays on because the page surface reuses the Canvas renderer and overlays; the page is the only card. */
function runtimeConfig(tokens: DocumentTokens): NudgeUiRuntimeConfig {
  return {
    projectId: `page:${location.origin}`,
    host: "static-html",
    framework: "HTML",
    stylingSystem: "CSS custom properties",
    capabilities: { canvas: true, componentSemantics: false, domNavigation: true },
    features: { canvasIterations: false, mcp: false },
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

/** A second bundle copy in the same window toggles the first instance, whose stores own the UI. */
export async function startPageInspector(options: PageInspectorOptions = {}): Promise<void> {
  const target = window as PageInspectorWindow;
  const loaded = target[LOADED_FLAG];
  if (loaded) {
    loaded.toggle();
    return;
  }
  let toggle: (() => void) | null = null;
  target[LOADED_FLAG] = {
    toggle: () => toggle?.(),
    enablePerformanceDiagnostics: () => enableInspectionPerformanceDiagnostics(document),
  };
  if (options.storage) configureInspectorStorage(options.storage);
  if (options.sketchStorage) configureSketchStorage(options.sketchStorage);
  if (options.systemFonts) configureSystemFontSource(options.systemFonts);
  if (options.adoptStylesheets) preferAdoptedStylesheets();

  // Tokens can wait on cross-origin stylesheet fetches, so the panel mounts first.
  configureNudgeUiRuntime(runtimeConfig(NO_TOKENS));
  enablePageSurface();
  toggle = mountPageInspector();
  let tokens: DocumentTokens;
  try {
    tokens = await collectDocumentTokens(document);
  } catch (error) {
    // The panel is already running; it keeps working without the token list.
    console.warn("[nudge-ui] Could not read this page's design tokens.", error);
    return;
  }
  configureNudgeUiRuntime(runtimeConfig(tokens));
  console.info(
    `[nudge-ui] Inspector loaded with ${tokens.tokenCatalog.length} tokens`
      + (tokens.tokenDiagnostics.length > 0 ? ` and ${tokens.tokenDiagnostics.length} stylesheet diagnostics.` : "."),
    tokens.tokenDiagnostics,
  );
}
