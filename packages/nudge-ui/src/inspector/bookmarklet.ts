/**
 * Spike entry for loading the inspector into any page without a host Adapter.
 *
 * Everything a host normally supplies is derived from the live document:
 * runtime identity comes from `installStaticHtmlRuntimeIdentity`, and tokens
 * come from the custom properties in readable stylesheets. Source locations,
 * component semantics, Canvas, and the agent bridge are unavailable.
 */
import { bootstrapNudgeUi, configureNudgeUiRuntime, setInspectorOpen, toggleInspector } from "./index.ts";
import { setNudgeUiHostDevFlag } from "./runtime/devFlag.ts";
import { installStaticHtmlRuntimeIdentity } from "./runtime/staticHtmlRuntimeIdentity.ts";
import { createTokenInventory } from "../css/token-inventory/inventory.ts";
import type { InventoryDiagnostic, StylesheetArtifact } from "../css/token-inventory/types.ts";
import type { TokenCatalogDiagnostic, TokenDeclaration, TokenDefinition } from "../css/model/index.ts";
import type { NudgeUiRuntimeConfig } from "./runtime/runtimeConfig.ts";

const MOUNT_ID = "nudge-ui-root";
const LOADED_FLAG = "__NUDGE_UI_BOOKMARKLET__";

interface BookmarkletWindow extends Window {
  [LOADED_FLAG]?: true;
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

async function start(): Promise<void> {
  const target = window as BookmarkletWindow;
  if (target[LOADED_FLAG]) {
    toggleInspector();
    return;
  }
  target[LOADED_FLAG] = true;

  const tokens = await collectDocumentTokens();
  installStaticHtmlRuntimeIdentity(document);
  setNudgeUiHostDevFlag(true);
  configureNudgeUiRuntime({
    projectId: `bookmarklet:${location.origin}`,
    host: "static-html",
    framework: "HTML",
    stylingSystem: "CSS custom properties",
    capabilities: { canvas: false, componentSemantics: false, domNavigation: true },
    features: { canvasIterations: false },
    componentContracts: [],
    ...tokens,
  });
  bootstrapNudgeUi(createMountElement());
  setInspectorOpen(true);
  console.info(
    `[nudge-ui] Bookmarklet loaded with ${tokens.tokenCatalog.length} tokens`
      + (tokens.tokenDiagnostics.length > 0 ? ` and ${tokens.tokenDiagnostics.length} stylesheet diagnostics.` : "."),
    tokens.tokenDiagnostics,
  );
}

void start().catch((error: unknown) => {
  console.error("[nudge-ui] Bookmarklet failed to start.", error);
});
