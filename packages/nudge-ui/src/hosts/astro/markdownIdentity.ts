import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Element, Root, RootContent } from "hast";

const PROSE_TAGS = [
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li",
  "blockquote", "a", "em", "strong", "del", "code", "pre", "hr", "br",
  "table", "thead", "tbody", "tr", "th", "td",
];
const proseTags = new Set(PROSE_TAGS);

interface MarkdownIdentityAttributes {
  "data-cid"?: string;
  "data-src"?: string;
}

function attributesFor(node: Readonly<Element>, file: string, projectRoot: string): MarkdownIdentityAttributes {
  const start = node.position?.start;
  if (!start || start.line < 1 || start.column < 1 || !proseTags.has(node.tagName)) return {};
  const relative = path.relative(projectRoot, file).replaceAll("\\", "/");
  const attributes: MarkdownIdentityAttributes = {};
  const properties = node.properties;
  if (properties["data-cid"] === undefined && properties.dataCid === undefined) {
    attributes["data-cid"] = `astro:${node.tagName.charAt(0).toUpperCase()}${node.tagName.slice(1)}`;
  }
  if (properties["data-src"] === undefined && properties.dataSrc === undefined) {
    attributes["data-src"] = `${relative}:${start.line}:${start.column}`;
  }
  return attributes;
}

/** Adds authored Markdown positions through the remark/rehype pipeline. */
export function createMarkdownIdentityPlugin(projectRoot: string) {
  return function nudgeMarkdownIdentity() {
    return (tree: Root, file: { path?: string }): void => {
      if (!file.path || !/\.mdx?$/.test(file.path)) return;
      const sourceFile = file.path;
      const visit = (node: Root | RootContent): void => {
        if (node.type === "element") {
          Object.assign(node.properties, attributesFor(node, sourceFile, projectRoot));
        }
        if ("children" in node) {
          for (const child of node.children) visit(child);
        }
      };
      visit(tree);
    };
  };
}

/** Adds the same identity through Astro's Sätteri visitor API. */
export function createSatteriIdentityPlugin(projectRoot: string) {
  return {
    name: "nudge-ui-markdown-identity",
    options: { position: true },
    element: {
      filter: PROSE_TAGS,
      visit(node: Readonly<Element>, context: {
        fileURL: URL | undefined;
        setProperty(node: Readonly<Element>, key: string, value: string): void;
      }): void {
        if (!context.fileURL || context.fileURL.protocol !== "file:") return;
        const file = fileURLToPath(context.fileURL);
        if (!/\.mdx?$/.test(file)) return;
        for (const [key, value] of Object.entries(attributesFor(node, file, projectRoot))) {
          context.setProperty(node, key, value);
        }
      },
    },
  };
}

/** Extends supported processors without replacing the consumer's pipeline. */
export function installMarkdownIdentity(
  markdown: { processor?: { name: string; options: object } },
  projectRoot: string,
): { rehypePlugins: ReturnType<typeof createMarkdownIdentityPlugin>[] } | undefined {
  const processor = markdown.processor;
  if (!processor) return { rehypePlugins: [createMarkdownIdentityPlugin(projectRoot)] };
  if (processor.name !== "unified" && processor.name !== "satteri") return undefined;
  // SAFETY: Astro's supported processors expose mutable plugin arrays. This
  // adapter only appends plugins and does not inspect existing entries.
  const options = processor.options as { rehypePlugins?: unknown[]; hastPlugins?: unknown[] };
  if (processor.name === "unified") {
    (options.rehypePlugins ??= []).push(createMarkdownIdentityPlugin(projectRoot));
  } else if (processor.name === "satteri") {
    (options.hastPlugins ??= []).push(createSatteriIdentityPlugin(projectRoot));
  }
  return undefined;
}
