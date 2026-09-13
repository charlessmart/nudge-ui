import { parse } from "@babel/parser";
import type { SourceMap } from "magic-string";
import MagicString from "magic-string";
import { posix } from "node:path";
import { injectIdentity } from "@nudge-ui/compiler/react-identity";
import type { HostComponentPolicy } from "@nudge-ui/compiler/component-policy";

/**
 * Pure Next.js identity-loader Module (ADR-0010).
 *
 * Wraps the shared `injectIdentity` Module with Next-specific policy:
 *
 * - client-component detection gates the semantic runtime import (directive
 *   scan, Pages Router rule); server-component modules receive identity
 *   attributes only and fail closed;
 * - `<html>`-rendering App Router root layouts receive a dev-only mount
 *   element that bootstraps the inspector;
 * - excluded paths are rejected before any parse work happens.
 *
 * The transform is deterministic by contract: Turbopack compiles each module
 * once per environment (react-server and client conditions), so identical
 * input must produce identical output across repeated runs.
 */

/** Extensions whose sources can carry JSX and therefore identity targets. */
const APP_SOURCE_EXT = /\.([cm]?[jt]sx?)$/i;

/** Parseable-by-the-shared-Module extensions (must contain JSX). */
const JSX_SOURCE_EXT = /\.(tsx|jsx)$/;

/** Directory segments never instrumented (build output and dependencies). */
const EXCLUDED_SEGMENTS = /(^|\/)(node_modules|\.next)\//i;

const MOUNT_LOCAL_NAME = "__NudgeUiMountElement";

const NEXT_COMPONENT_RUNTIME_MODULE = "@nudge-ui/nextjs/component-runtime";

const MOUNT_IMPORT =
  `import { createElement as __NudgeUiCreateElement } from "react";\n`
  + `import { NudgeUiMount as ${MOUNT_LOCAL_NAME} } from "@nudge-ui/nextjs/mount";\n`;

// The mount renders through an expression container invoking createElement
// rather than through a JSX element: a bare `{Component}` would hand React
// the function itself ("Functions are not valid as a React child"), while an
// element `<Cmp />` would be visible to later identity passes. A
// `createElement(...)` call produces no JSX nodes — nothing to attribute or
// wrap — while still yielding a real element for React to render.
const MOUNT_JSX = `\n    {__NudgeUiCreateElement(${MOUNT_LOCAL_NAME})}\n  `;

export interface NextModuleTransformOptions {
  /**
   * Project root used to compute project-relative `data-src` values. Matches
   * the Vite Adapter's semantics: paths outside the root fall back to the
   * absolute path with its leading slash stripped.
   */
  root?: string;
  /**
   * Directory name of the Pages Router route root. Modules resolved under it
   * are client components even without a `"use client"` directive.
   */
  pagesDir?: string;
  /** Import provenance and slot policy resolved by the Next host Adapter. */
  hostPolicy?: HostComponentPolicy;
  /** Whether this module belongs to the Adapter's explicit semantic source scope. */
  instrumentComponents?: boolean;
  /** Module specifier resolved by the Next host for semantic boundaries. */
  componentRuntimeModule?: string;
}

export interface NextModuleTransformResult {
  code: string;
  map: SourceMap | null;
  /** True when the module qualifies as a client component (directive or Pages Router rule). */
  clientComponent: boolean;
  /** True when a root-layout mount element was appended. */
  layoutInstrumented: boolean;
}

/**
 * Transforms one application module for development rendering, or returns
 * `null` when nothing applies and the caller must serve the original bytes.
 *
 * `moduleId` is an absolute or project-relative path; only path shapes are
 * inspected, never the filesystem.
 */
export function transformNextModuleSource(
  source: string,
  moduleId: string,
  options: NextModuleTransformOptions = {},
): NextModuleTransformResult | null {
  // ADR-0002 phase gate, defense-in-depth beneath the wrapper: Next sets
  // NEXT_PHASE per invocation, so even a misconfigured
  // NODE_ENV=development production build refuses every transform here.
  // Absent phases still transform — exotic dev harnesses keep working.
  if (process.env.NEXT_PHASE === "phase-production-build") return null;

  const normalized = moduleId.split("\\").join("/");
  if (!APP_SOURCE_EXT.test(normalized)) return null;
  if (EXCLUDED_SEGMENTS.test(normalized)) return null;

  const clientComponent =
    hasUseClientDirective(source) || isPagesRouterModule(normalized, options);

  const identity = injectIdentity(source, normalized, options.root, {
    instrumentComponents: clientComponent && options.instrumentComponents !== false,
    hostPolicy: options.hostPolicy,
    componentRuntimeModule: options.componentRuntimeModule ?? NEXT_COMPONENT_RUNTIME_MODULE,
  });

  let code = identity ? identity.code : source;
  let map = identity ? identity.map : null;
  let layoutInstrumented = false;

  if (identity && clientComponent) {
    // The shared Module PREPENDS the runtime import, which is fine under
    // Vite but fatal under SWC: a module starting with an import is no
    // longer a directive prologue, so Next rejects the file ("use client
    // must be placed before other expressions"). Relocate the prepended
    // import to just past the directive prologue.
    code = relocatePrependedRuntimeImport(
      code,
      options.componentRuntimeModule ?? NEXT_COMPONENT_RUNTIME_MODULE,
    );
  }

  if (isAppRootLayoutPath(normalized)) {
    const mounted = instrumentRootLayout(code);
    if (mounted) {
      code = mounted.code;
      map = mounted.map;
      layoutInstrumented = true;
    }
  }

  if (!identity && !layoutInstrumented) return null;

  // When both passes ran, the layout map is composed against the identity
  // pass's output rather than the original source. Dev-only tooling tolerates
  // this v1 simplification; the identity map (the one prompts rely on) is
  // always against the original bytes because the layout pass runs after it.
  return { code, map, clientComponent, layoutInstrumented };
}

/**
 * Moves the shared Module's prepended runtime import past the directive
 * prologue when the source began with one. Sources without a leading
 * directive are returned untouched (the import is already first).
 */
function relocatePrependedRuntimeImport(code: string, runtimeModule: string): string {
  const runtimeImport =
    `import { instrumentReactComponent as __nudgeUiInstrumentComponent } from ${JSON.stringify(runtimeModule)};\n`;
  if (!code.startsWith(runtimeImport)) return code;
  const rest = code.slice(runtimeImport.length);
  const insertAt = directivePrologueEnd(rest);
  return rest.slice(0, insertAt) + runtimeImport + rest.slice(insertAt);
}

/**
 * True when the module resolves inside the Pages Router directory, anchored
 * to the router root: only `pages/**` or `src/pages/**` count. An App Router
 * route nested at `app/pages/Card.tsx` is a server component and MUST NOT
 * match — wrapping it with the client runtime would break the RSC graph.
 *
 * `pagesDir` may itself contain slashes ("src/pages") for exotic layouts.
 */
function isPagesRouterModule(
  normalizedId: string,
  options: { root?: string; pagesDir?: string },
): boolean {
  const pagesDir = (options.pagesDir ?? "pages").split("\\").join("/").replace(/^\/+|\/+$/g, "");
  if (pagesDir.length === 0) return false;

  // Anchor against the project root when known; without a root we cannot
  // distinguish router roots from same-named directories, so fail closed.
  const root = options.root ? options.root.split("\\").join("/").replace(/\/+$/, "") : null;
  const relative = root
    ? normalizedId.startsWith(`${root}/`)
      ? normalizedId.slice(root.length + 1)
      : normalizedId.startsWith("./")
        ? normalizedId.slice(2)
        : normalizedId
    : normalizedId;

  return relative === pagesDir
    || relative.startsWith(`${pagesDir}/`)
    || (relative.startsWith("src/")
      && (relative.slice(4) === pagesDir || relative.slice(4).startsWith(`${pagesDir}/`)));
}

/**
 * True for App Router layout modules. Route groups nest more `app` segments
 * (`app/(marketing)/layout.tsx`), so any `app` ancestor segment counts; the
 * `<html>` guard decides whether a mount actually belongs.
 */
function isAppRootLayoutPath(normalizedId: string): boolean {
  if (!JSX_SOURCE_EXT.test(normalizedId)) return false;
  const parsed = posix.parse(normalizedId);
  if (!/^layout\.[cm]?[jt]sx?$/i.test(parsed.base)) return false;
  return parsed.dir === "app" || parsed.dir.endsWith("/app") || parsed.dir.includes("/app/");
}

/**
 * Detects a module-level `"use client"` directive without a full parse.
 *
 * Only comments, whitespace, a shebang, and other directive prologues may
 * precede it; anything else ends the directive prologue per the ECMAScript
 * spec, which keeps the scan exact rather than a loose substring search.
 */
export function hasUseClientDirective(source: string): boolean {
  let index = 0;
  const length = source.length;

  // A shebang may precede the directive prologue.
  if (source.startsWith("#!")) {
    const lineEnd = source.indexOf("\n", index);
    if (lineEnd === -1) return false;
    index = lineEnd + 1;
  }

  while (index < length) {
    const char = source[index];

    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      index += 1;
      continue;
    }

    if (char === "/" && source[index + 1] === "/") {
      const lineEnd = source.indexOf("\n", index);
      if (lineEnd === -1) return false;
      index = lineEnd + 1;
      continue;
    }

    if (char === "/" && source[index + 1] === "*") {
      const blockEnd = source.indexOf("*/", index + 2);
      if (blockEnd === -1) return false;
      index = blockEnd + 2;
      continue;
    }

    if (char === "\"" || char === "'") {
      const quote = char;
      let cursor = index + 1;
      let literal = "";
      let closed = false;
      while (cursor < length) {
        const current = source[cursor];
        if (current === "\\") {
          literal += source.slice(cursor, cursor + 2);
          cursor += 2;
          continue;
        }
        if (current === quote) {
          closed = true;
          break;
        }
        literal += current;
        cursor += 1;
      }
      if (!closed) return false;

      if (literal === "use client") return true;

      // Another directive prologue ("use strict", "use server", …) may still
      // be followed by the target directive; anything else ends the scan.
      let after = cursor + 1;
      while (after < length && /\s/.test(source.charAt(after))) after += 1;
      if (source.charAt(after) === ";") after += 1;
      // A directive must be its own statement; a string expression used as a
      // value would be followed by other tokens on the same statement.
      if (after < length && !/[\n\r;]/.test(source.charAt(after)) && source[after - 1] !== ";") {
        return false;
      }
      index = after;
      continue;
    }

    return false;
  }

  return false;
}

interface HtmlNode {
  type: string;
  children?: HtmlNode[];
  openingElement?: { name?: { type?: string; name?: unknown } };
  closingElement?: { start?: number };
  [key: string]: unknown;
}

/**
 * Appends the inspector mount as the last child of the rendered `<html>`
 * element, or returns `null` when the layout does not qualify.
 *
 * Idempotence: the aliased mount import doubles as the marker — a module that
 * already carries it is left untouched, so running the loader twice (as
 * Turbopack does across react-server and client conditions) cannot stack
 * duplicates.
 */
export function instrumentRootLayout(source: string): { code: string; map: SourceMap } | null {
  if (source.includes(MOUNT_LOCAL_NAME)) return null;

  let ast: HtmlNode;
  try {
    ast = parse(source, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    }) as unknown as HtmlNode;
  } catch {
    return null;
  }

  const htmlElement = findHtmlElement(ast);
  if (!htmlElement?.closingElement?.start) return null;

  const ms = new MagicString(source);
  // The import must land after any directive prologue: prepending ahead of a
  // `"use client"` directive would strip it of prologue status and silently
  // change the module's compilation environment.
  ms.appendLeft(directivePrologueEnd(source), MOUNT_IMPORT);
  ms.appendLeft(htmlElement.closingElement.start, MOUNT_JSX);
  return { code: ms.toString(), map: ms.generateMap({ hires: true }) };
}

/**
 * Offset just past the directive prologue (shebang, comments, directive
 * statements) — the only legal insertion point for new import statements.
 */
export function directivePrologueEnd(source: string): number {
  let index = 0;
  const length = source.length;

  if (source.startsWith("#!")) {
    const lineEnd = source.indexOf("\n", index);
    if (lineEnd === -1) return length;
    index = lineEnd + 1;
  }

  while (index < length) {
    const char = source[index];

    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      index += 1;
      continue;
    }

    if (char === "/" && source[index + 1] === "/") {
      const lineEnd = source.indexOf("\n", index);
      if (lineEnd === -1) return length;
      index = lineEnd + 1;
      continue;
    }

    if (char === "/" && source[index + 1] === "*") {
      const blockEnd = source.indexOf("*/", index + 2);
      if (blockEnd === -1) return length;
      index = blockEnd + 2;
      continue;
    }

    if (char === "\"" || char === "'") {
      const quote = char;
      let cursor = index + 1;
      while (cursor < length) {
        if (source[cursor] === "\\") {
          cursor += 2;
          continue;
        }
        if (source[cursor] === quote) break;
        cursor += 1;
      }
      // Consume the statement terminator of this directive, then continue.
      let after = cursor + 1;
      while (after < length && /\s/.test(source.charAt(after))) after += 1;
      if (source.charAt(after) === ";") after += 1;
      index = after;
      continue;
    }

    return index;
  }

  return length;
}

function findHtmlElement(node: HtmlNode | undefined | null): HtmlNode | null {
  if (!node || typeof node !== "object") return null;
  if (
    node.type === "JSXElement"
    && node.openingElement?.name?.type === "JSXIdentifier"
    && node.openingElement.name.name === "html"
  ) {
    return node;
  }
  for (const child of Object.values(node)) {
    if (Array.isArray(child)) {
      for (const grandchild of child) {
        // SAFETY: This is an ESTree child of an array-valued parent node, which is always an HtmlNode.
        const found = findHtmlElement(grandchild as HtmlNode);
        if (found) return found;
      }
    } else if (
      // SAFETY: The Object.values child is guarded as a non-null object, matching the HtmlNode contract.
      child && typeof child === "object" && (child as HtmlNode).type
    ) {
      // SAFETY: The indexed template element of an ESTree TemplateLiteral is always an HtmlNode.
      const found = findHtmlElement(child as HtmlNode);
      if (found) return found;
    }
  }
  return null;
}
