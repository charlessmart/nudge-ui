import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { Alias, Plugin, ResolvedConfig } from "vite";
import { injectIdentity } from "./transform/injectDataCid.ts";
import { parseTokens } from "./tokens/parseTokens.ts";
import type { TokenEntry } from "./virtual/design-tokens.ts";

export interface DesignToolOptions {
  enabled?: boolean;
}

const VIRTUAL_TOKENS_ID = "virtual:design-tokens";
const RESOLVED_TOKENS_ID = "\0" + VIRTUAL_TOKENS_ID;
const VIRTUAL_INSPECTOR_ID = "virtual:design-tool-inspector";
const RESOLVED_INSPECTOR_ID = "\0" + VIRTUAL_INSPECTOR_ID;
const CSS_EXT = /\.css$/;

const MOUNT_DIV = `<div id="design-tool-root"></div>`;
const INSPECTOR_SCRIPT = `<script type="module" src="/@id/__x00__virtual:design-tool-inspector"></script>`;

function relativePath(id: string, root?: string): string {
  if (root) {
    const rootPrefix = root.endsWith("/") ? root : root + "/";
    if (id.startsWith(rootPrefix)) return id.slice(rootPrefix.length);
  }
  return id.replace(/^\//, "");
}

function scanCssFiles(rootDir: string, files: string[] = [], dir = rootDir): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".git" || entry.startsWith("dist")) continue;
    const full = join(dir, entry);
    try {
      const st = statSync(full);
      if (st.isDirectory()) scanCssFiles(rootDir, files, full);
      else if (CSS_EXT.test(entry)) files.push(full);
    } catch {
      // ignore unreadable entries
    }
  }
  return files;
}

function resolveReactAliases(projectRoot: string): Alias[] {
  const req = createRequire(projectRoot + "/package.json");
  const tryResolve = (spec: string): string | null => {
    try {
      return req.resolve(spec);
    } catch {
      return null;
    }
  };
  const aliases: Alias[] = [];
  const reactMain = tryResolve("react");
  if (reactMain) aliases.push({ find: /^react$/, replacement: reactMain });
  const reactDomMain = tryResolve("react-dom");
  if (reactDomMain) aliases.push({ find: /^react-dom$/, replacement: reactDomMain });
  const reactJsx = tryResolve("react/jsx-runtime");
  if (reactJsx) aliases.push({ find: /^react\/jsx-runtime$/, replacement: reactJsx });
  const reactJsxDev = tryResolve("react/jsx-dev-runtime");
  if (reactJsxDev) aliases.push({ find: /^react\/jsx-dev-runtime$/, replacement: reactJsxDev });
  const reactDomClient = tryResolve("react-dom/client");
  if (reactDomClient) aliases.push({ find: /^react-dom\/client$/, replacement: reactDomClient });
  return aliases;
}

export function transformIndexHtmlHtml(
  html: string,
  command: "serve" | "build",
): string | null {
  if (command === "build") return null;
  const inject = `\n${MOUNT_DIV}\n${INSPECTOR_SCRIPT}\n`;
  if (html.includes("</body>")) {
    return html.replace("</body>", `${inject}</body>`);
  }
  return html + inject;
}

export function designTool(options: DesignToolOptions = {}): Plugin {
  const enabled = options.enabled ?? true;
  let root: string | undefined;
  let command: "serve" | "build" = "serve";
  const cssTokens = new Map<string, TokenEntry[]>();

  function cacheTokensForFile(id: string, code: string): void {
    if (!CSS_EXT.test(id)) return;
    const rel = relativePath(id, root);
    cssTokens.set(id, parseTokens(code, rel));
  }

  return {
    name: "design-tool",
    enforce: "pre",
    config(userConfig, env) {
      if (!enabled || env.command !== "serve") return;
      const projectRoot = userConfig.root ?? process.cwd();
      const aliases = resolveReactAliases(projectRoot);
      if (aliases.length === 0) return;
      return { resolve: { alias: aliases } };
    },
    configResolved(config: ResolvedConfig) {
      root = config.root;
      command = config.command;
    },
    buildStart() {
      // Eager scan so the token table is populated before the virtual module
      // is first loaded. The browser imports App -> virtual:design-tokens
      // before styles.css is necessarily transformed, so transform-only
      // collection would yield an empty first load.
      if (!enabled || command !== "serve" || !root) return;
      for (const cssPath of scanCssFiles(root)) {
        try {
          const code = readFileSync(cssPath, "utf8");
          cacheTokensForFile(cssPath, code);
        } catch {
          // skip unreadable files
        }
      }
    },
    resolveId(id) {
      if (id === VIRTUAL_TOKENS_ID || id === RESOLVED_TOKENS_ID) return RESOLVED_TOKENS_ID;
      if (id === VIRTUAL_INSPECTOR_ID || id === RESOLVED_INSPECTOR_ID) return RESOLVED_INSPECTOR_ID;
      return null;
    },
    load(id) {
      if (id === RESOLVED_TOKENS_ID) {
        // ADR-0002: production builds receive an empty token table.
        if (command === "build") {
          return `export const tokens = [];\nexport default tokens;\n`;
        }
        const all: TokenEntry[] = [];
        for (const list of cssTokens.values()) {
          for (const entry of list) all.push(entry);
        }
        const body = JSON.stringify(all);
        return `export const tokens = ${body};\nexport default tokens;\n`;
      }
      if (id === RESOLVED_INSPECTOR_ID) {
        // ADR-0002: no inspector bootstrap in production builds.
        if (command === "build") {
          return `export {};\n`;
        }
        return `import { mountInspector } from "@design-tool/inspector";\nconst __dt_root = document.getElementById("design-tool-root");\nif (__dt_root) mountInspector(__dt_root);\n`;
      }
      return null;
    },
    transform(code, id) {
      if (!enabled) return null;
      if (command === "build") return null; // dev-only per ADR-0002
      if (CSS_EXT.test(id)) {
        cacheTokensForFile(id, code);
        return null; // let Vite's CSS pipeline handle the actual stylesheet
      }
      return injectIdentity(code, id, root);
    },
    transformIndexHtml(html) {
      if (!enabled) return;
      const out = transformIndexHtmlHtml(html, command);
      return out === null ? undefined : out;
    },
    async handleHotUpdate(ctx) {
      if (!enabled || command !== "serve") return;
      if (!CSS_EXT.test(ctx.file)) return;

      // Refresh the token map immediately so the next virtual-module load sees
      // the updated tokens (Vite's own CSS reload happens in parallel).
      try {
        const code = await ctx.read();
        cacheTokensForFile(ctx.file, code);
      } catch {
        cssTokens.set(ctx.file, []);
      }

      // Invalidate the virtual module and let Vite propagate HMR to importers
      // (App.tsx via React Refresh). Returning the virtual module alongside
      // the affected CSS module(s) replaces Vite's default module list so BOTH
      // the stylesheet's visual update and the tokens list refresh fire.
      const virtual = ctx.server.moduleGraph.getModuleById(
        RESOLVED_TOKENS_ID,
      );
      const modules: NonNullable<ReturnType<typeof ctx.server.moduleGraph.getModuleById>>[] = [];
      if (virtual) {
        ctx.server.moduleGraph.invalidateModule(virtual);
        modules.push(virtual);
      }
      for (const m of ctx.modules) {
        if (m) modules.push(m);
      }
      // Deduplicate while preserving order.
      const seen = new Set<string>();
      return modules.filter((m) => {
        if (seen.has(m.id ?? "")) return false;
        seen.add(m.id ?? m.url);
        return true;
      });
    },
  };
}

export { injectIdentity, injectDataCid } from "./transform/injectDataCid.ts";
export type { InjectResult } from "./transform/injectDataCid.ts";
export { parseTokens } from "./tokens/parseTokens.ts";
export type { TokenEntry } from "./virtual/design-tokens.ts";