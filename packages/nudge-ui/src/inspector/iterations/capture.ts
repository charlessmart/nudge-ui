import { HTML_ARTIFACT_REVISION_ATTRIBUTE } from "../../transport/artifacts.ts";

/** Captures the visible DOM of a same-origin frame as a script-free HTML iteration. */
export async function captureHtmlIteration(frame: HTMLIFrameElement): Promise<string> {
  const source = frame.contentDocument;
  const view = frame.contentWindow;
  if (!source || !view?.document.documentElement) throw new Error("The frame is not ready to capture.");
  await source.fonts?.ready;
  await Promise.all([...source.images].map((image) => image.decode?.().catch(() => undefined)));
  const original = source.documentElement;
  const copy = original.cloneNode(true) as HTMLElement;
  copy.removeAttribute(HTML_ARTIFACT_REVISION_ATTRIBUTE);
  const sourceElements = [original, ...original.querySelectorAll("*")];
  const copiedElements = [copy, ...copy.querySelectorAll("*")];
  const assets = new Map<string, Promise<string>>();
  for (let index = 0; index < sourceElements.length; index += 1) {
    const sourceElement = sourceElements[index]!;
    const copied = copiedElements[index]!;
    if (sourceElement.nodeType !== 1 || copied.nodeType !== 1) continue;
    // Renderer IDs belong to the source iframe's node registry. The iteration's
    // fresh registry can reuse those values for different nodes.
    copied.removeAttribute("data-renderer-id");
    // Preserve authored inline values (percentages, variables, and calc), rather
    // than replacing them with computed dimensions at the capture viewport.
    const inline = copied.getAttribute("style");
    if (inline) copied.setAttribute("style", await resolveCssUrls(inline, source.baseURI, assets));
    if (sourceElement.tagName === "INPUT" && copied.tagName === "INPUT") {
      const input = sourceElement as HTMLInputElement;
      copied.setAttribute("value", input.value);
      if (input.checked) copied.setAttribute("checked", "");
      else copied.removeAttribute("checked");
    }
    if (sourceElement.tagName === "TEXTAREA" && copied.tagName === "TEXTAREA") copied.textContent = (sourceElement as HTMLTextAreaElement).value;
    if (sourceElement.tagName === "CANVAS" && copied.tagName === "CANVAS") {
      try {
        const image = source.createElement("img");
        image.src = (sourceElement as HTMLCanvasElement).toDataURL();
        for (const attribute of [...copied.attributes]) image.setAttribute(attribute.name, attribute.value);
        copied.replaceWith(image);
      } catch { /* Tainted canvases remain empty. */ }
    }
  }
  const base = source.createElement("base");
  base.href = source.querySelector("base")?.href ?? source.location.href;
  copy.querySelectorAll("base").forEach((element) => element.remove());
  (copy.querySelector("head") ?? copy).prepend(base);
  copy.querySelectorAll('script, iframe, object, embed, meta[http-equiv="refresh"], meta[http-equiv="Content-Security-Policy"], link[rel=modulepreload], link[rel=preload]').forEach((element) => element.remove());
  copy.querySelectorAll("[data-nudge-ui-mount], #nudge-ui-root").forEach((element) => element.remove());
  copy.querySelectorAll("a, form").forEach((element) => {
    element.removeAttribute("href");
    element.removeAttribute("action");
  });
  copy.querySelectorAll("*").forEach((element) => {
    for (const attribute of [...element.attributes]) {
      if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
    }
  });
  for (const image of copy.querySelectorAll("img")) {
    const url = image.getAttribute("src");
    if (url) image.src = await inlineAsset(url, base.href, assets);
  }
  await captureStylesheets(source, copy, sourceElements, copiedElements, assets);
  return `<!doctype html>\n${copy.outerHTML}`;
}

/** Copies live CSSOM rules in place so stylesheet order and media stay intact. */
async function captureStylesheets(
  document: Document,
  copy: HTMLElement,
  sourceElements: Element[],
  copiedElements: Element[],
  assets: Map<string, Promise<string>>,
): Promise<void> {
  for (const sheet of [...document.styleSheets]) {
    const owner = sheet.ownerNode;
    // Some DOM implementations do not expose ownerNode.
    const sourceNode = owner ?? sourceElements.find((element) => "sheet" in element && element.sheet === sheet);
    const index = sourceNode ? sourceElements.indexOf(sourceNode as Element) : -1;
    const copiedNode = index >= 0 ? copiedElements[index] : undefined;
    if (!copiedNode?.parentNode) continue;
    if (sheet.disabled) {
      copiedNode.remove();
      continue;
    }
    let css: string;
    try {
      css = [...sheet.cssRules].map((rule) => rule.cssText).join("\n");
    } catch {
      if (!sheet.href) continue;
      try {
        const response = await fetch(sheet.href);
        if (!response.ok) continue;
        css = await response.text();
      } catch {
        // Keep the stylesheet link when CORS prevents embedding it. Its URL
        // still resolves against the original base and retains responsiveness.
        continue;
      }
    }
    const style = document.createElement("style");
    for (const attribute of [...copiedNode.attributes]) {
      if (!["href", "rel", "integrity", "crossorigin"].includes(attribute.name)) {
        style.setAttribute(attribute.name, attribute.value);
      }
    }
    style.textContent = await resolveCssUrls(css, sheet.href ?? document.baseURI, assets);
    // Captured edits become the iteration's base. The renderer must create its own
    // managed stylesheet for new edits instead of clearing these captured rules.
    if (style.id === "nudge-ui-styles") {
      style.removeAttribute("id");
      style.removeAttribute("data-nudge-ui");
      style.setAttribute("data-nudge-capture-overrides", "");
    }
    copiedNode.replaceWith(style);
  }
  for (const sheet of document.adoptedStyleSheets ?? []) {
    if (sheet.disabled) continue;
    const style = document.createElement("style");
    style.textContent = await resolveCssUrls(
      [...sheet.cssRules].map((rule) => rule.cssText).join("\n"), document.baseURI, assets,
    );
    (copy.querySelector("head") ?? copy).append(style);
  }
}

async function resolveCssUrls(css: string, base: string, assets: Map<string, Promise<string>>): Promise<string> {
  const matches = [...css.matchAll(/url\(\s*(["']?)([^)"']+)\1\s*\)/g)];
  const values = await Promise.all(matches.map((match) => inlineAsset(match[2]!, base, assets)));
  let index = 0;
  return css.replace(/url\(\s*(["']?)([^)"']+)\1\s*\)/g, () => `url("${values[index++]}")`);
}

async function inlineAsset(path: string, base: string, assets: Map<string, Promise<string>>): Promise<string> {
  if (path.trim().startsWith("#")) return path;
  let url: string;
  try { url = new URL(path, base).href; }
  catch { return path; }
  if (!/^https?:/.test(url)) return url;
  const existing = assets.get(url);
  if (existing) return existing;
  const value = (async () => {
    try {
      const response = await fetch(url);
      if (!response.ok || Number(response.headers.get("content-length")) > 4_000_000) return url;
      const blob = await response.blob();
      if (blob.size > 4_000_000) return url;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 8192) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      }
      return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
    } catch { return url; }
  })();
  assets.set(url, value);
  return value;
}
