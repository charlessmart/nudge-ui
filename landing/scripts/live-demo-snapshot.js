// Evaluated in the page by capture-live-demo.mjs. Freezes the rendered document into one static HTML string,
// following packages/nudge-ui/src/inspector/iterations/capture.ts (live CSSOM, inlined assets, form values,
// no scripts or handlers), and additionally keeps open shadow roots as declarative shadow DOM and inlines
// visible same-origin iframes as srcdoc, so the Nudge editor and the page it edits survive the freeze.
async () => {
  // Each fetched asset becomes a token here; capture-live-demo.mjs writes it once to a file and swaps the token for its path.
  const assets = new Map();
  const files = {};
  const toAsset = (url) => {
    if (!url || /^(data|blob):/.test(url)) return Promise.resolve(url);
    if (!assets.has(url)) {
      const token = `__LIVE_DEMO_ASSET_${assets.size}__`;
      assets.set(url, fetch(url)
        .then((response) => (response.ok ? response.blob() : null))
        .then((blob) => blob ? new Promise((done) => {
          const reader = new FileReader();
          reader.onload = () => { files[token] = reader.result; done(token); };
          reader.onerror = () => done(url);
          reader.readAsDataURL(blob);
        }) : url)
        .catch(() => url));
    }
    return assets.get(url);
  };
  const resolveCss = async (css, base) => {
    let out = css;
    for (const match of new Set(css.match(/url\(\s*(['"]?)[^'")]+\1\s*\)/g) ?? [])) {
      const raw = match.replace(/^url\(\s*['"]?|['"]?\s*\)$/g, "");
      if (/^(data:|#)/.test(raw)) continue;
      let absolute;
      try { absolute = new URL(raw, base).href; } catch { continue; }
      out = out.split(match).join(`url("${await toAsset(absolute)}")`);
    }
    return out;
  };
  const sheetText = (sheet) => {
    try { return [...sheet.cssRules].map((rule) => rule.cssText).join("\n"); } catch { return null; }
  };

  // Pairs each source element with its copy by document order, recursing into shadow roots and iframes.
  const freezeTree = async (sourceRoot, copyRoot, doc, depth) => {
    const sources = [...sourceRoot.querySelectorAll("*")];
    const copies = [...copyRoot.querySelectorAll("*")];
    if (sourceRoot.nodeType === 1) { sources.unshift(sourceRoot); copies.unshift(copyRoot); }
    const jobs = [];
    for (let index = 0; index < sources.length; index += 1) {
      const source = sources[index];
      const copy = copies[index];
      if (!source || !copy || source.tagName !== copy.tagName) continue;
      if (source.scrollTop || source.scrollLeft) copy.setAttribute("data-snap-scroll", `${source.scrollLeft},${source.scrollTop}`);
      if (source.tagName === "INPUT") {
        copy.setAttribute("value", source.value);
        copy.toggleAttribute("checked", source.checked);
      }
      if (source.tagName === "TEXTAREA") copy.textContent = source.value;
      if (source.tagName === "CANVAS") {
        try {
          const image = doc.createElement("img");
          image.src = source.toDataURL();
          for (const attribute of copy.attributes) image.setAttribute(attribute.name, attribute.value);
          copy.replaceWith(image);
        } catch { /* Tainted canvases stay empty. */ }
        continue;
      }
      if (source.tagName === "STYLE") {
        const text = source.sheet ? sheetText(source.sheet) : null;
        jobs.push(resolveCss(text ?? source.textContent, source.baseURI).then((css) => { copy.textContent = css; }));
        continue;
      }
      if (source.tagName === "LINK" && /stylesheet/i.test(source.rel)) {
        const text = source.sheet ? sheetText(source.sheet) : null;
        const style = doc.createElement("style");
        if (source.media) style.media = source.media;
        jobs.push((text !== null ? Promise.resolve(text) : fetch(source.href).then((response) => response.text()))
          .then((css) => resolveCss(css, source.href))
          .then((css) => { style.textContent = css; copy.replaceWith(style); }));
        continue;
      }
      if (source.tagName === "IMG") {
        copy.removeAttribute("srcset");
        copy.removeAttribute("loading");
        jobs.push(toAsset(source.currentSrc || source.src).then((url) => copy.setAttribute("src", url)));
      }
      if (source.tagName === "IFRAME") {
        copy.removeAttribute("src");
        copy.removeAttribute("loading");
        const rect = source.getBoundingClientRect();
        const visible = rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight;
        let inner = null;
        try { inner = source.contentDocument; } catch { /* Cross-origin frames stay blank. */ }
        if (inner && visible && depth < 2) jobs.push(freezeDocument(inner, depth + 1).then((html) => copy.setAttribute("srcdoc", html)));
        else copy.setAttribute("srcdoc", "<!doctype html><html><body></body></html>");
      }
      const inline = copy.getAttribute("style");
      if (inline?.includes("url(")) jobs.push(resolveCss(inline, source.baseURI).then((value) => copy.setAttribute("style", value)));
      if (source.shadowRoot) {
        const template = doc.createElement("template");
        template.setAttribute("shadowrootmode", "open");
        for (const child of source.shadowRoot.childNodes) template.content.append(child.cloneNode(true));
        const adopted = [...(source.shadowRoot.adoptedStyleSheets ?? [])];
        jobs.push(freezeTree(source.shadowRoot, template.content, doc, depth).then(async () => {
          for (const sheet of adopted.reverse()) {
            const style = doc.createElement("style");
            style.textContent = await resolveCss(sheetText(sheet) ?? "", source.baseURI);
            template.content.prepend(style);
          }
        }));
        copy.prepend(template);
      }
    }
    await Promise.all(jobs);
  };

  const freezeDocument = async (doc, depth) => {
    await doc.fonts?.ready;
    const copy = doc.documentElement.cloneNode(true);
    await freezeTree(doc.documentElement, copy, doc, depth);
    const head = copy.querySelector("head") ?? copy;
    for (const sheet of doc.adoptedStyleSheets ?? []) {
      const style = doc.createElement("style");
      style.textContent = await resolveCss(sheetText(sheet) ?? "", doc.baseURI);
      head.append(style);
    }
    copy.querySelectorAll("script, noscript, link[rel=modulepreload], link[rel=preload], meta[http-equiv]").forEach((element) => element.remove());
    copy.querySelectorAll("*").forEach((element) => {
      for (const attribute of [...element.attributes]) if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
      if (element.tagName === "A") element.removeAttribute("href");
      if (element.tagName === "FORM") element.removeAttribute("action");
    });
    // Scroll offsets are layout state, not markup, so a tiny script puts them back.
    const restore = doc.createElement("script");
    const view = doc.defaultView;
    restore.textContent = `(()=>{const walk=(root)=>{root.querySelectorAll("[data-snap-scroll]").forEach((el)=>{const[x,y]=el.dataset.snapScroll.split(",").map(Number);el.scrollLeft=x;el.scrollTop=y;});root.querySelectorAll("*").forEach((el)=>el.shadowRoot&&walk(el.shadowRoot));};walk(document);scrollTo(${view?.scrollX ?? 0},${view?.scrollY ?? 0});})();`;
    (copy.querySelector("body") ?? copy).append(restore);
    return `<!doctype html>\n${copy.outerHTML}`;
  };

  return { html: await freezeDocument(document, 0), files };
}
