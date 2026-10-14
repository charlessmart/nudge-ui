import { parse } from "@babel/parser";
import type { SourceMap } from "magic-string";
import MagicString from "magic-string";
import { posix } from "node:path";
import { injectIdentity } from "../../compiler/reactIdentity.ts";
import type { HostComponentPolicy } from "../../compiler/componentPolicyResolution.ts";

const APP_SOURCE_EXT = /\.([cm]?[jt]sx?)$/i;

const JSX_SOURCE_EXT = /\.(tsx|jsx)$/;

const EXCLUDED_SEGMENTS = /(^|\/)(node_modules|\.next)\//i;

const MOUNT_LOCAL_NAME = "__NudgeUiMountElement";

const NEXT_COMPONENT_RUNTIME_MODULE = "nudge-ui/internal/component-runtime";

const MOUNT_IMPORT =
  `import { createElement as __NudgeUiCreateElement } from "react";\n`
  + `import { NudgeUiMount as ${MOUNT_LOCAL_NAME} } from "nudge-ui/internal/next/mount";\n`;

// Rendered through createElement rather than as a JSX element: a bare `{Component}` is not
// a valid React child, and a `<Cmp />` element would be visible to later identity passes.
const MOUNT_JSX = `\n    {__NudgeUiCreateElement(${MOUNT_LOCAL_NAME})}\n  `;

export interface NextModuleTransformOptions {
  /** Paths outside the project root fall back to the absolute path with its leading slash stripped (matches Vite). */
  root?: string;
  /** Pages Router route root; modules under it are client components even without a `"use client"` directive. */
  pagesDir?: string;
  hostPolicy?: HostComponentPolicy;
  instrumentComponents?: boolean;
  componentRuntimeModule?: string;
}

export interface NextModuleTransformResult {
  code: string;
  map: SourceMap | null;
  clientComponent: boolean;
  layoutInstrumented: boolean;
}

/** Returns `null` when nothing applies and the caller must serve the original bytes; `moduleId` is inspected as a path only, never as the filesystem. */
export function transformNextModuleSource(
  source: string,
  moduleId: string,
  options: NextModuleTransformOptions = {},
): NextModuleTransformResult | null {
  // Defense-in-depth beneath the wrapper: Next sets NEXT_PHASE per invocation, so even a
  // misconfigured production build refuses every transform here; absent phases still transform.
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
    // The shared module prepends the runtime import, which SWC rejects ahead of a
    // `"use client"` directive; relocate it past the directive prologue.
    code = relocatePrependedRuntimePrelude(code, identity.prelude);
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

  // When both passes ran, the layout map is composed against the identity pass's output
  // rather than the original source; the identity map prompts rely on stays against original bytes.
  return { code, map, clientComponent, layoutInstrumented };
}

function relocatePrependedRuntimePrelude(code: string, prelude: string | null): string {
  if (!prelude || !code.startsWith(prelude)) return code;
  const rest = code.slice(prelude.length);
  const insertAt = directivePrologueEnd(rest);
  return rest.slice(0, insertAt) + prelude + rest.slice(insertAt);
}

/** Only `pages/**` and `src/pages/**` count: an App Router route at `app/pages/Card.tsx` must not match, or wrapping it breaks the RSC graph. */
function isPagesRouterModule(
  normalizedId: string,
  options: { root?: string; pagesDir?: string },
): boolean {
  const pagesDir = (options.pagesDir ?? "pages").split("\\").join("/").replace(/^\/+|\/+$/g, "");
  if (pagesDir.length === 0) return false;

  // Anchor against the project root when known; without a root, same-named directories cannot be ruled out, so fail closed.
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

/** Any `app` ancestor segment counts because route groups nest (`app/(marketing)/layout.tsx`); the `<html>` guard decides whether a mount belongs. */
function isAppRootLayoutPath(normalizedId: string): boolean {
  if (!JSX_SOURCE_EXT.test(normalizedId)) return false;
  const parsed = posix.parse(normalizedId);
  if (!/^layout\.[cm]?[jt]sx?$/i.test(parsed.base)) return false;
  return parsed.dir === "app" || parsed.dir.endsWith("/app") || parsed.dir.includes("/app/");
}

export function hasUseClientDirective(source: string): boolean {
  let index = 0;
  const length = source.length;

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

      // Other directive prologues may still be followed by `"use client"`; anything else ends the scan.
      let after = cursor + 1;
      while (after < length && /\s/.test(source.charAt(after))) after += 1;
      if (source.charAt(after) === ";") after += 1;
      // A directive must be its own statement — a string used as a value continues with other tokens.
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

/** Appends the mount as the last child of a literal `<body>` so the script ships in the initial document; a module that already carries the aliased import is left untouched. */
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

  const htmlElement = findElement(ast, "html");
  if (!htmlElement) return null;
  const bodyElement = findElement(htmlElement, "body");
  if (!bodyElement?.closingElement?.start) return null;

  const ms = new MagicString(source);
  // Must land after any directive prologue, or a leading `"use client"` loses prologue status.
  ms.appendLeft(directivePrologueEnd(source), MOUNT_IMPORT);
  ms.appendLeft(bodyElement.closingElement.start, MOUNT_JSX);
  return { code: ms.toString(), map: ms.generateMap({ hires: true }) };
}

/** Offset just past the directive prologue — the only legal insertion point for new imports. */
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

function findElement(node: HtmlNode | undefined | null, name: string): HtmlNode | null {
  if (!node || typeof node !== "object") return null;
  if (
    node.type === "JSXElement"
    && node.openingElement?.name?.type === "JSXIdentifier"
    && node.openingElement.name.name === name
  ) {
    return node;
  }
  for (const child of Object.values(node)) {
    if (Array.isArray(child)) {
      for (const grandchild of child) {
        // SAFETY: This is an ESTree child of an array-valued parent node, which is always an HtmlNode.
        const found = findElement(grandchild as HtmlNode, name);
        if (found) return found;
      }
    } else if (
      // SAFETY: The Object.values child is guarded as a non-null object, matching the HtmlNode contract.
      child && typeof child === "object" && (child as HtmlNode).type
    ) {
      // SAFETY: The indexed template element of an ESTree TemplateLiteral is always an HtmlNode.
      const found = findElement(child as HtmlNode, name);
      if (found) return found;
    }
  }
  return null;
}
