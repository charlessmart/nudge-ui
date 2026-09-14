/**
 * The token catalog must follow only stylesheets the application imports. This
 * small graph walker deliberately has no filesystem traversal: callers supply
 * the host CSS entry files, a Vite-backed resolver, and a reader.
 */
export interface CssImportGraph {
  files: Map<string, string>;
  /** CSS cascade order: imported sheets precede the sheet that imports them. */
  order: string[];
  unresolved: Array<{ importer: string; specifier: string }>;
  unreadable: string[];
}

export interface CssImportGraphDependencies {
  read(id: string): string;
  resolve(specifier: string, importer: string): Promise<string | null>;
}

export function stripCssQuery(id: string): string {
  return id.split(/[?#]/, 1)[0] ?? id;
}

export function isCssStylesheet(id: string): boolean {
  return /\.css(?:$|[?#])/i.test(id);
}

/** Extract quoted and url(...) @import targets while ignoring CSS comments. */
export function cssImportSpecifiers(css: string): string[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const imports: string[] = [];
  const expression = /@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^\s)'";]+))\s*\)?/gi;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(withoutComments))) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (specifier) imports.push(specifier);
  }
  return imports;
}

/**
 * Resolve every CSS file reached from the supplied host stylesheets. Missing
 * and unreadable imports are reported but never make the catalog unavailable.
 */
export async function discoverCssImportGraph(
  entryFiles: readonly string[],
  dependencies: CssImportGraphDependencies,
): Promise<CssImportGraph> {
  const files = new Map<string, string>();
  const order: string[] = [];
  const visiting = new Set<string>();
  const unresolved: CssImportGraph["unresolved"] = [];
  const unreadable: string[] = [];

  async function visit(id: string): Promise<void> {
    const fileId = stripCssQuery(id);
    if (files.has(fileId) || visiting.has(fileId) || unreadable.includes(fileId)) return;
    visiting.add(fileId);

    let css: string;
    try {
      css = dependencies.read(fileId);
    } catch {
      unreadable.push(fileId);
      visiting.delete(fileId);
      return;
    }
    files.set(fileId, css);

    for (const specifier of cssImportSpecifiers(css)) {
      let resolved: string | null = null;
      try {
        resolved = await dependencies.resolve(specifier, fileId);
      } catch {
        // An unresolved package must not prevent the host token catalog loading.
      }
      if (!resolved) {
        unresolved.push({ importer: fileId, specifier });
        continue;
      }
      // A processor-owned import such as Tailwind's package entry may resolve
      // to JavaScript and later emit CSS during transform. It is outside this
      // ordinary-CSS graph, but it is not an unresolved stylesheet failure.
      if (!isCssStylesheet(resolved)) continue;
      await visit(resolved);
    }
    visiting.delete(fileId);
    order.push(fileId);
  }

  for (const entry of entryFiles) await visit(entry);
  return { files, order, unresolved, unreadable };
}
