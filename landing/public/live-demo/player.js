// Plays a short loop over the frozen Nudge editor in editor.html, open on the jukebox browse page: scrub the grid's
// column gap, swap the cover radius for a token, measure to the neighbouring covers, delete the "Browse" eyebrow,
// rewrite the heading, sketch over the filters, copy the prompt, then ⌘⇥ to Claude Code to send it. The panel states are real
// captures (see scripts/capture-live-demo.mjs); this script only swaps them, changes values, and adds a cursor.
// The landing page sends {type: "live-demo", playing} so the loop only runs while the demo is on screen.
(() => {
  const root = document.querySelector("#nudge-ui-root")?.shadowRoot;
  if (!root) return;
  // The panel and the page scroll a little; their scrollbars would flash as the landing page scales the frame.
  const NO_SCROLLBARS = "*{scrollbar-width:none!important}*::-webkit-scrollbar{display:none!important}";
  // The toolbar sits a little lower than Nudge's 20px, nearer the frame's bottom edge.
  root.append(Object.assign(document.createElement("style"), { textContent: `${NO_SCROLLBARS}.canvas-toolbar{bottom:8px!important}` }));
  document.head.append(Object.assign(document.createElement("style"), { textContent: NO_SCROLLBARS }));
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- clock: virtual time that stops while paused, so the loop resumes where it left off
  let playing = window.top === window && !reduceMotion;
  let clock = 0;
  let last = performance.now();
  const waiting = new Set();
  const tick = (now) => {
    if (playing) clock += Math.min(now - last, 64);
    last = now;
    for (const entry of [...waiting]) if (entry.check()) waiting.delete(entry);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const until = (check) => new Promise((done) => waiting.add({ check: () => (check() ? (done(), true) : false) }));
  const sleep = (ms) => { const end = clock + ms; return until(() => clock >= end); };
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const tween = (ms, step) => {
    const start = clock;
    return until(() => { const t = Math.min(1, (clock - start) / ms); step(ease(t)); return t >= 1; });
  };
  addEventListener("message", (event) => {
    if (event.data?.type === "live-demo") playing = Boolean(event.data.playing) && !reduceMotion;
  });

  // ---------- the page lives in the editor's frame (a srcdoc copy), so wait for it before touching anything
  const frame = [...root.querySelectorAll("iframe.canvas-card__iframe")].find((element) => element.getAttribute("srcdoc")?.includes("album-grid"));
  if (!frame) return;
  const start = () => {
    const doc = frame.contentDocument;
    if (!doc?.querySelector(".album-grid")) return;
    // The demo leaves out the player's progress row, which would show through behind the toolbar.
    doc.head.append(Object.assign(doc.createElement("style"), { textContent: `${NO_SCROLLBARS}.player-bar .tabular-nums{display:none!important}` }));
    // ---------- the captured page and panel states
    const grid = doc.querySelector(".album-grid");
    const covers = [...doc.querySelectorAll(".album-cover")];
    const cover = covers[1];
    const heading = doc.querySelector("h1");
    const headingText = heading?.firstChild;
    const outline = root.querySelector(".canvas-selected-outline");
    const gridPanel = root.querySelector(".panel");
    const template = (id) => document.getElementById(id)?.content.firstElementChild;
    const coverPanel = template("live-demo-panel-cover");
    const headingPanel = template("live-demo-panel-heading");
    const tokenMenu = template("live-demo-token-menu");
    const eyebrowPanel = template("live-demo-panel-eyebrow");
    const emptyPanel = template("live-demo-panel-empty");
    const sketchToolbar = document.getElementById("live-demo-toolbar-sketch")?.content;
    const toolbarPortal = root.querySelector(".canvas-toolbar__portal");
    const chips = doc.querySelector('[role="tablist"]');
    if (!grid || !cover || !headingText || !outline || !gridPanel || !coverPanel || !headingPanel || !tokenMenu) return;
    if (!eyebrowPanel || !emptyPanel || !sketchToolbar || !toolbarPortal || !chips) return;
    root.querySelectorAll(".canvas-element-overlay, .canvas-spacing-fill, .canvas-spacing-guide").forEach((element) => element.remove());

    let panel = gridPanel;
    let selected = grid;
    let changes = 0;
    const original = {
      gridPanel: gridPanel.cloneNode(true),
      heading: headingText.textContent,
      columnGap: parseFloat(getComputedStyle(grid).columnGap),
      toolbar: [...toolbarPortal.childNodes].map((node) => node.cloneNode(true)),
    };
    // The "Browse" eyebrow the demo deletes, and where it goes back on reset.
    const eyebrow = heading?.previousElementSibling;
    const eyebrowParent = eyebrow?.parentNode;
    const query = (selector) => panel.querySelector(selector);
    // Page elements sit inside the editor's frame, so their boxes are offset by the frame's position.
    const rectOf = (element) => {
      const box = element.getBoundingClientRect();
      if (element.ownerDocument === document) return box;
      const offset = frame.getBoundingClientRect();
      return { left: offset.left + box.left, top: offset.top + box.top, width: box.width, height: box.height };
    };
    // Nudge's tag and size chip under the selection: 8px below, centred, and kept inside the page frame.
    const sizeLabel = root.querySelector(".selection-label");
    const syncLabel = (box) => {
      if (!sizeLabel) return;
      // When the selection runs off the bottom of the page the label would sit pinned under the toolbar, so it hides.
      const shown = box && box.top + box.height + 8 < frame.getBoundingClientRect().bottom - 30;
      sizeLabel.style.display = shown ? "" : "none";
      if (!shown) return;
      sizeLabel.querySelector(".selection-label__tag").textContent = selected.localName;
      sizeLabel.querySelector(".selection-label__size").textContent = `${Math.round(box.width)} × ${Math.round(box.height)}`;
      const bounds = frame.getBoundingClientRect(), { offsetWidth: width, offsetHeight: height } = sizeLabel;
      const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
      sizeLabel.style.left = `${Math.round(clamp(box.left + box.width / 2 - width / 2, bounds.left + 4, bounds.right - width - 4))}px`;
      sizeLabel.style.top = `${Math.round(clamp(box.top + box.height + 8, bounds.top + 4, bounds.bottom - height - 4))}px`;
    };
    const syncOutline = () => {
      outline.style.display = selected ? "" : "none";
      if (!selected) return syncLabel(null);
      const box = rectOf(selected);
      Object.assign(outline.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
      syncLabel(box);
    };
    const setChanges = (count) => {
      changes = count;
      const label = query('[data-test="changes-count"]');
      if (label) label.textContent = count === 0 ? "No changes" : `${count} change${count === 1 ? "" : "s"}`;
      const trigger = label?.closest("button");
      trigger?.toggleAttribute("data-disabled", count === 0);
      trigger?.toggleAttribute("disabled", count === 0);
    };
    const select = (element, nextPanel) => {
      const fresh = nextPanel.cloneNode(true);
      panel.replaceWith(fresh);
      panel = fresh;
      selected = element;
      setChanges(changes);
      syncOutline();
    };

    // ---------- cursor: Nudge's pointer, plus a resize cursor while scrubbing
    const POINTER = "M19.8289 10.9379L14.499 12.9999L14.1844 13.1399C13.9474 13.2324 13.7322 13.373 13.5524 13.5529C13.3725 13.7327 13.2319 13.9479 13.1395 14.1849L10.9376 19.8288C10.3047 21.4538 7.97489 21.3668 7.46494 19.6988L3.08331 5.38099C2.65134 3.97101 3.97123 2.65202 5.38111 3.08302L19.6989 7.46496C21.3668 7.97595 21.4537 10.3039 19.8289 10.9379Z";
    const cursor = document.createElement("div");
    cursor.className = "ld-cursor";
    cursor.setAttribute("aria-hidden", "true");
    cursor.innerHTML = `<style>
      .ld-cursor { position: fixed; z-index: 2147483647; left: 0; top: 0; width: 22px; height: 22px; pointer-events: none; opacity: 0; transition: opacity .25s ease; will-change: transform; }
      .ld-cursor svg { position: absolute; inset: 0; width: 22px; height: 22px; filter: drop-shadow(0 1px 1.5px rgb(0 0 0 / .35)); transition: scale .12s ease-out, opacity .12s ease; }
      .ld-cursor .ld-scrub { opacity: 0; translate: -11px -11px; }
      .ld-cursor[data-mode="scrub"] .ld-arrow { opacity: 0; }
      .ld-cursor[data-mode="scrub"] .ld-scrub { opacity: 1; }
      .ld-cursor[data-down] svg { scale: .86; }
      .ld-cursor .ld-key { position: absolute; left: 22px; top: 20px; display: grid; place-items: center; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 5px; background: #111; box-shadow: 0 0 0 1px rgb(255 255 255 / .18), 0 2px 6px rgb(0 0 0 / .35); color: #fff; font: 600 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; opacity: 0; scale: .8; transition: opacity .15s ease, scale .15s ease; }
      .ld-cursor[data-key] .ld-key { opacity: 1; scale: 1; }
    </style>
    <svg class="ld-arrow" viewBox="0 0 24 24"><path d="${POINTER}" fill="#111" stroke="#fff" stroke-width="1.5"/></svg>
    <svg class="ld-scrub" viewBox="0 0 24 24"><path d="M8 7 3 12l5 5M16 7l5 5-5 5M3 12h18" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 7 3 12l5 5M16 7l5 5-5 5M3 12h18" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    cursor.insertAdjacentHTML("beforeend", '<span class="ld-key">⌥</span>');
    const showKey = (label) => { cursor.querySelector(".ld-key").textContent = label; cursor.setAttribute("data-key", ""); };
    const hideKey = () => cursor.removeAttribute("data-key");
    document.body.append(cursor);
    const at = { x: 700, y: 520 };
    const place = (x, y) => { at.x = x; at.y = y; cursor.style.transform = `translate(${x - 3}px, ${y - 3}px)`; };
    const moveTo = (x, y, ms = 650) => { const sx = at.x, sy = at.y; return tween(ms, (k) => place(sx + (x - sx) * k, sy + (y - sy) * k)); };
    const point = (element, fx = 0.5, fy = 0.5) => { const box = rectOf(element); return [box.left + box.width * fx, box.top + box.height * fy]; };
    // Holding option while hovering draws Nudge's measurement overlay: alignment guides along the selected element's
    // edges, plus a ruler and label for the gap to the hovered element. Same markup and classes as the real overlay.
    let measure = null;
    let hoverBox = null;
    const chipWidth = (label) => label.length * 7 + 10;
    const drawMeasure = (from, to) => {
      const a = rectOf(from), b = rectOf(to), page = frame.getBoundingClientRect();
      const right = a.left + a.width, bottom = a.top + a.height;
      const guides = [
        [page.left, a.top, page.right, a.top], [page.left, bottom, page.right, bottom],
        [a.left, 0, a.left, innerHeight], [right, 0, right, innerHeight],
      ].map(([x1, y1, x2, y2]) => `<line class="alignment-guide" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line>`).join("");
      let ruler = "";
      if (b.left >= right) {
        const gap = Math.round(b.left - right), label = `${gap}px`, y = Math.max(a.top, b.top) + (Math.min(bottom, b.top + b.height) - Math.max(a.top, b.top)) / 2;
        const mid = right + gap / 2, w = chipWidth(label);
        ruler = `<g><line class="measurement-ruler" data-axis="horizontal" x1="${right}" y1="${y}" x2="${b.left}" y2="${y}"></line><rect class="measurement-label-chip" x="${mid - w / 2}" y="${y - 18}" width="${w}" height="16" rx="2"></rect><text class="measurement-label" x="${mid}" y="${y - 6}" text-anchor="middle">${label}</text></g>`;
      } else if (b.top >= bottom) {
        const gap = Math.round(b.top - bottom), label = `${gap}px`, x = Math.max(a.left, b.left) + (Math.min(right, b.left + b.width) - Math.max(a.left, b.left)) / 2;
        const mid = bottom + gap / 2;
        ruler = `<g><line class="measurement-ruler" data-axis="vertical" x1="${x}" y1="${bottom}" x2="${x}" y2="${b.top}"></line><rect class="measurement-label-chip" x="${x + 2}" y="${mid - 8}" width="${chipWidth(label)}" height="16" rx="2"></rect><text class="measurement-label" x="${x + 6}" y="${mid + 4}" text-anchor="start">${label}</text></g>`;
      }
      measure?.remove();
      const holder = document.createElement("div");
      holder.innerHTML = `<svg class="measurement-overlay" width="${innerWidth}" height="${innerHeight}" viewBox="0 0 ${innerWidth} ${innerHeight}" aria-hidden="true">${guides}${ruler}</svg>`;
      measure = holder.firstElementChild;
      root.append(measure);
      hoverBox ??= Object.assign(document.createElement("div"), { className: "canvas-element-overlay" });
      Object.assign(hoverBox.style, { position: "fixed", left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px`, pointerEvents: "none" });
      root.append(hoverBox);
    };
    const clearMeasure = () => { measure?.remove(); measure = null; hoverBox?.remove(); };

    const press = async () => { cursor.setAttribute("data-down", ""); await sleep(110); cursor.removeAttribute("data-down"); };

    // Sketch marks: Nudge draws them as red ink over the page and frames the last mark with blue handles.
    let sketch = null;
    const clearSketch = () => { sketch?.remove(); sketch = null; };
    const sketchAround = async (target) => {
      const page = frame.getBoundingClientRect();
      const box = rectOf(target);
      const cx = box.left + box.width / 2, cy = box.top + box.height / 2, rx = box.width / 2 + 22, ry = box.height / 2 + 16;
      // A loose hand-drawn loop: starts top left, goes round once, and overshoots its own start.
      const points = [];
      for (let i = 0; i <= 64; i += 1) {
        const t = i / 64, angle = -2.5 + t * (Math.PI * 2 + 0.55), wobble = 1 + Math.sin(t * 9) * 0.035 + t * 0.06;
        points.push([cx + Math.cos(angle) * rx * wobble, cy + Math.sin(angle) * ry * wobble]);
      }
      const d = points.map(([x, y], i) => `${i ? "L" : "M"} ${(x - page.left).toFixed(1)} ${(y - page.top).toFixed(1)}`).join(" ");
      const holder = document.createElement("div");
      holder.innerHTML = `<svg class="ld-sketch" width="${page.width}" height="${page.height}" viewBox="0 0 ${page.width} ${page.height}" style="position:fixed;left:${page.left}px;top:${page.top}px;pointer-events:none;overflow:visible" aria-hidden="true"><path d="${d}" pathLength="1" fill="none" stroke="#ff2600" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1" stroke-dashoffset="1"></path></svg>`;
      sketch = holder.firstElementChild;
      root.append(sketch);
      const path = sketch.querySelector("path");
      await moveTo(...points[0], 700);
      cursor.setAttribute("data-down", "");
      await tween(1100, (k) => {
        path.setAttribute("stroke-dashoffset", String(1 - k));
        const [x, y] = points[Math.min(points.length - 1, Math.round(k * (points.length - 1)))];
        place(x, y);
      });
      cursor.removeAttribute("data-down");
      // The selection frame Nudge puts round a finished mark: a box, four corner handles and a rotate handle.
      const xs = points.map(([x]) => x - page.left), ys = points.map(([, y]) => y - page.top);
      const left = Math.min(...xs) - 4, top = Math.min(...ys) - 4, right = Math.max(...xs) + 4, bottom = Math.max(...ys) + 4, mid = (left + right) / 2;
      const handle = (x, y) => `<rect x="${x - 4}" y="${y - 4}" width="8" height="8" fill="#ffffff" stroke="#0096ff" stroke-width="1"></rect>`;
      sketch.insertAdjacentHTML("beforeend", `<g class="ld-sketch-frame"><rect x="${left}" y="${top}" width="${right - left}" height="${bottom - top}" fill="none" stroke="#0096ff" stroke-width="1"></rect><line x1="${mid}" y1="${top}" x2="${mid}" y2="${top - 24}" stroke="#0096ff" stroke-width="1"></line>${handle(left, top)}${handle(right, top)}${handle(left, bottom)}${handle(right, bottom)}${handle(mid, top - 28)}</g>`);
    };
    const setToolbar = (nodes) => toolbarPortal.replaceChildren(...nodes.map((node) => node.cloneNode(true)));

    // ---------- the agent: a Claude Code window that comes forward with a ⌘⇥ switch and takes the pasted prompt
    const PROMPT = [
      "Please make these UI changes for me.",
      "",
      "The list in src/components/browse/album-grid.tsx:6:5:",
      "- Change column-gap from 20px to 40px.",
      "",
      "Every image rendered from src/components/browse/album-grid.tsx:13:17 (currently 24 on the page):",
      "- Change border-radius from var(--radius-4) to var(--radius-20).",
      "",
      "The paragraph in src/App.tsx:44:13 that says \"Browse\":",
      "- Remove it.",
      "",
      "The h1 heading in src/App.tsx:45:13:",
      "- Change the text from \"Late night rotation\" to \"Sunday morning\".",
      "",
      "Sketch: a mark circles the filter tabs in src/App.tsx:47:11 (see the attached screenshot).",
      "",
      "Please keep using the project's existing design tokens and logical properties, and preserve the intent of the existing CSS as you apply these changes.",
    ].join("\n");
    const icon = {
      laptop: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M4.5 5.5h11v7h-11z"/><path d="M2.5 14.5h15"/></svg>',
      chevron: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6.5 8.5 3.5 3.5 3.5-3.5"/></svg>',
      check: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m4.5 10.5 3.5 3.5 7.5-8"/></svg>',
      plus: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M10 4v12M4 10h12"/></svg>',
      mic: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="7.5" y="3" width="5" height="9" rx="2.5"/><path d="M5 9.5a5 5 0 0 0 10 0M10 14.5V17"/></svg>',
      stop: '<svg viewBox="0 0 10 10"><rect width="10" height="10" rx="2" fill="currentColor"/></svg>',
      spark: '<svg viewBox="0 0 20 20" fill="none" stroke="#d97757" stroke-width="2" stroke-linecap="round"><path d="M10 2v5M10 13v5M2 10h5M13 10h5M4.3 4.3l3.5 3.5M12.2 12.2l3.5 3.5M15.7 4.3l-3.5 3.5M7.8 12.2l-3.5 3.5"/></svg>',
      send: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15.5v-11M5.5 9 10 4.5 14.5 9"/></svg>',
      critter: '<svg viewBox="0 0 14 8" shape-rendering="crispEdges"><path fill="#d97757" d="M2 0h10v2h2v2h-2v1H2V4H0V2h2zM3 5h1v3H3zM5 5h1v3H5zM8 5h1v3H8zM10 5h1v3h-1z"/><path fill="#111" d="M4 1h1v1H4zM9 1h1v1H9z"/></svg>',
    };
    const agentHost = document.createElement("div");
    agentHost.setAttribute("aria-hidden", "true");
    agentHost.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none";
    const agent = agentHost.attachShadow({ mode: "open" });
    agent.innerHTML = `<style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      .switcher { position: fixed; left: 50%; top: 50%; translate: -50% -50%; display: none; gap: 6px; padding: 14px 14px 36px; border-radius: 30px; background: rgb(48 48 48 / .62); backdrop-filter: blur(30px) saturate(1.6); box-shadow: 0 0 0 .5px rgb(255 255 255 / .22) inset, 0 0 0 .5px rgb(0 0 0 / .4), 0 24px 60px rgb(0 0 0 / .35); }
      .switcher[data-open] { display: flex; }
      .switcher .app { position: relative; display: grid; place-items: center; width: 128px; height: 128px; border-radius: 20px; }
      .switcher .app[data-on] { background: rgb(255 255 255 / .2); }
      .switcher img { width: 112px; height: 112px; }
      .switcher .label { position: absolute; bottom: -24px; color: #fff; font: 500 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; text-shadow: 0 1px 2px rgb(0 0 0 / .4); visibility: hidden; }
      .switcher .app[data-on] .label { visibility: visible; }
      .window { position: fixed; left: 250px; top: 56px; width: 780px; height: 608px; display: flex; flex-direction: column; overflow: hidden; border-radius: 12px; background: #fff; color: #1f1f1e; font: 15px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; box-shadow: 0 0 0 .5px rgb(0 0 0 / .25), 0 30px 80px rgb(0 0 0 / .32), 0 8px 24px rgb(0 0 0 / .14); opacity: 0; }
      .bar { position: relative; flex: none; display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 14px; border-bottom: 1px solid #efefed; }
      .bar i { width: 12px; height: 12px; border-radius: 50%; background: #ff5f57; box-shadow: inset 0 0 0 .5px rgb(0 0 0 / .15); }
      .bar i:nth-child(2) { background: #febc2e; } .bar i:nth-child(3) { background: #28c840; }
      .bar b { position: absolute; left: 0; right: 0; text-align: center; font-weight: 600; font-size: 13px; color: #6f6f6c; }
      .body { position: relative; flex: 1; display: flex; flex-direction: column; min-height: 0; padding: 0 36px 16px; }
      .empty { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 12px; min-height: 0; transition: opacity .3s ease, translate .4s ease; }
      .empty-inner { position: relative; width: 340px; }
      .empty .critter { position: absolute; right: 8px; top: -26px; width: 36px; }
      .card { width: 340px; border: 1px solid #e7e7e4; border-radius: 12px; background: #fff; }
      .row { display: flex; align-items: center; gap: 12px; height: 44px; padding: 0 14px; font-size: 15px; }
      .row svg { width: 18px; height: 18px; flex: none; }
      .row .grow { flex: 1; }
      .row + .row { border-top: 1px solid #efefed; }
      .row.muted { height: 42px; gap: 4px; }
      .row.muted svg { width: 15px; color: #6f6f6c; }
      .composer { flex: none; border: 1px solid #dededa; border-radius: 16px; background: #fff; box-shadow: 0 2px 10px rgb(0 0 0 / .05); }
      .composer .field { display: flex; align-items: flex-end; gap: 14px; padding: 13px 16px; }
      .composer svg { width: 20px; height: 20px; flex: none; color: #2b2b2a; }
      .composer .text { flex: 1; height: 21px; overflow: hidden; font-size: 14.5px; line-height: 21px; white-space: pre-wrap; color: #1f1f1e; }
      .composer .text[data-empty] { color: #8b8b87; }
      .caret { display: inline-block; width: 1.5px; height: 17px; margin-left: 1px; vertical-align: -3px; background: #1f1f1e; animation: blink 1s steps(1) infinite; }
      @keyframes blink { 50% { opacity: 0; } }
      .composer .action { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; }
      .composer .action[data-send] { background: #d97757; }
      .composer .action[data-send] svg { color: #fff; width: 16px; }
      .thread { display: none; flex: 1; min-height: 0; flex-direction: column; gap: 18px; padding: 30px 0 22px; overflow: hidden; font-size: 14.5px; line-height: 1.55; }
      .thread[data-on] { display: flex; }
      .msg-user { align-self: flex-end; max-width: 80%; max-height: 176px; overflow: hidden; padding: 12px 16px; border-radius: 16px; background: #f3f2ee; white-space: pre-wrap; -webkit-mask-image: linear-gradient(#000 72%, transparent); mask-image: linear-gradient(#000 72%, transparent); }
      .msg-agent { display: flex; flex-direction: column; gap: 9px; }
      .msg-agent p { margin: 0; }
      .msg-agent p + .tool, .tool + p { margin-top: 4px; }
      .tool { display: flex; align-items: center; gap: 9px; font-size: 13.5px; color: #6f6f6c; }
      .tool i { width: 7px; height: 7px; border-radius: 50%; background: #2e9d5a; }
      .tool b { font-weight: 600; color: #2b2b2a; }
      .tool code { font: 12.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace; color: #4b4b48; }
      .tool .add { color: #2e9d5a; } .tool .del { color: #c2410c; }
      .working { display: flex; align-items: center; gap: 8px; color: #8b8b87; font-size: 13.5px; }
      .working svg { width: 16px; animation: spin 1.2s linear infinite; }
      @keyframes spin { to { rotate: 1turn; } }
      .composer .action[data-stop] { background: #1f1f1e; }
      .composer .action[data-stop] svg { width: 10px; color: #fff; }
      .meta { flex: none; display: flex; align-items: center; gap: 22px; padding: 10px 16px 0; font-size: 14px; color: #2b2b2a; }
      .meta span { display: flex; align-items: center; gap: 8px; }
      .meta svg { width: 17px; height: 17px; }
      .meta .box { width: 14px; height: 14px; border: 1px solid #c9c9c5; border-radius: 3px; }
      .meta .soft { color: #6f6f6c; }
      .meta .spacer { flex: 1; }
      .meta .ring { width: 15px; height: 15px; border-radius: 50%; border: 2px solid #3b82f6; border-right-color: #d6e4fb; }
    </style>
    <div class="window">
      <div class="bar"><i></i><i></i><i></i><b>Claude Code</b></div>
      <div class="body">
        <div class="empty">
          <div class="empty-inner">
            <span class="critter">${icon.critter}</span>
            <div class="card">
              <div class="row">${icon.laptop}<span class="grow">music-player</span>${icon.check}</div>
              <div class="row muted">Choose environment ${icon.chevron}</div>
            </div>
          </div>
        </div>
        <div class="thread"></div>
        <div class="composer"><div class="field">${icon.plus}<div class="text" data-empty>Describe a task or ask a question</div><span class="action">${icon.mic}</span></div></div>
        <div class="meta"><span>${icon.laptop}music-player ${icon.chevron}</span><span class="soft"><i class="box"></i>Worktree</span><i class="spacer"></i><span>Opus 5.5 <span class="soft">High</span></span><span>Auto</span><i class="ring"></i></div>
      </div>
    </div>
    <div class="switcher"></div>`;
    // Same z-index as the Nudge root, so DOM order decides: after the editor, before the cursor.
    document.body.append(agentHost);
    document.body.append(cursor);
    const win = agent.querySelector(".window");
    const switcher = agent.querySelector(".switcher");
    // The real app icons, in most-recently-used order like the macOS app switcher.
    const APPS = { safari: ["Safari", "icons/safari.png"], claude: ["Claude", "icons/claude.png"] };
    switcher.innerHTML = Object.entries(APPS).map(([id, [name, src]]) => `<div class="app" data-app="${id}"><img src="${new URL(src, document.baseURI)}" alt=""><span class="label">${name}</span></div>`).join("");
    const empty = agent.querySelector(".empty");
    const field = agent.querySelector(".composer .text");
    const action = agent.querySelector(".composer .action");
    const thread = agent.querySelector(".thread");
    const resetAgent = () => {
      win.style.opacity = "0";
      switcher.removeAttribute("data-open");
      thread.removeAttribute("data-on");
      thread.replaceChildren();
      empty.style.display = "";
      action.removeAttribute("data-stop");
      empty.style.opacity = "";
      empty.style.translate = "";
      field.setAttribute("data-empty", "");
      field.textContent = "Describe a task or ask a question";
      field.style.height = "";
      action.removeAttribute("data-send");
      action.innerHTML = icon.mic;
    };
    // ⌘⇥ as macOS does it: the switcher appears at once with the next app already highlighted, and letting go of ⌘
    // brings that app's window straight to the front. No fades.
    const commandTab = async (from, to) => {
      const apps = [...switcher.children];
      apps.sort((a, b) => (a.dataset.app === from ? -1 : b.dataset.app === from ? 1 : 0)).forEach((app) => switcher.append(app));
      apps.forEach((app) => app.toggleAttribute("data-on", app.dataset.app === to));
      switcher.setAttribute("data-open", "");
      await sleep(900);
      switcher.removeAttribute("data-open");
      win.style.opacity = to === "claude" ? "1" : "0";
    };
    // Sending: the prompt leaves the composer for the thread, and Claude works through it.
    const REPLY = [
      ["text", "I'll apply the changes from Nudge to the jukebox browse page."],
      ["tool", "Read", "src/components/browse/album-grid.tsx"],
      ["tool", "Edit", "src/components/browse/album-grid.tsx", "+2", "−2"],
      ["tool", "Read", "src/App.tsx"],
      ["tool", "Edit", "src/App.tsx", "+1", "−2"],
      ["text", "Done. The grid gap is 40px, every cover uses --radius-20, the Browse eyebrow is gone, and the heading reads \u201cSunday morning\u201d. Your sketch circles the filter tabs: what would you like changed there?"],
    ];
    const sendPrompt = async () => {
      empty.style.display = "none";
      thread.setAttribute("data-on", "");
      const bubble = Object.assign(document.createElement("div"), { className: "msg-user", textContent: PROMPT });
      thread.append(bubble);
      field.setAttribute("data-empty", "");
      field.textContent = "Reply to Claude";
      field.style.height = "";
      action.removeAttribute("data-send");
      action.setAttribute("data-stop", "");
      action.innerHTML = icon.stop;
      bubble.animate([{ opacity: 0, translate: "0 24px" }, { opacity: 1, translate: "0 0" }], { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" });
      const reply = Object.assign(document.createElement("div"), { className: "msg-agent" });
      thread.append(reply);
      const working = Object.assign(document.createElement("div"), { className: "working", innerHTML: `${icon.spark}Working\u2026` });
      reply.append(working);
      await sleep(900);
      for (const [kind, ...parts] of REPLY) {
        if (kind === "text") {
          const line = document.createElement("p");
          reply.insertBefore(line, working);
          for (const word of parts[0].split(" ")) { line.textContent += (line.textContent ? " " : "") + word; await sleep(28); }
          await sleep(350);
        } else {
          const [verb, file, add = "", del = ""] = parts;
          const row = Object.assign(document.createElement("div"), { className: "tool" });
          row.innerHTML = `<i></i><b>${verb}</b><code>${file}</code>${add ? `<span class="add">${add}</span>` : ""}${del ? `<span class="del">${del}</span>` : ""}`;
          reply.insertBefore(row, working);
          row.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
          await sleep(520);
        }
      }
      working.remove();
      action.removeAttribute("data-stop");
      action.innerHTML = icon.mic;
    };
    const pastePrompt = async () => {
      field.removeAttribute("data-empty");
      field.innerHTML = '<span class="caret"></span>';
      await sleep(500);
      showKey("⌘V");
      await sleep(300);
      field.textContent = PROMPT;
      action.setAttribute("data-send", "");
      action.innerHTML = icon.send;
      const height = Math.min(field.scrollHeight, 400);
      empty.style.opacity = "0";
      empty.style.translate = "0 -12px";
      await tween(520, (k) => { field.style.height = `${21 + (height - 21) * k}px`; });
      hideKey();
    };

    let eyebrowExit = [];
    const reset = () => {
      resetAgent();
      clearSketch();
      setToolbar(original.toolbar);
      // A removed element hides its animations from getAnimations(), so the fade is cancelled through its handle.
      eyebrowExit.forEach((animation) => animation.cancel());
      eyebrowExit = [];
      if (eyebrow && !eyebrow.isConnected) eyebrowParent.insertBefore(eyebrow, heading);
      hideKey();
      grid.style.columnGap = "";
      covers.forEach((element) => { element.style.borderRadius = ""; });
      headingText.textContent = original.heading;
      doc.querySelector(".ld-text")?.remove();
      clearMeasure();
      select(grid, original.gridPanel);
      setChanges(0);
    };

    // Highlights the old heading, then types the new one behind a caret.
    const retype = async (next) => {
      const style = doc.createElement("style");
      style.className = "ld-text";
      style.textContent = ".ld-sel{background:color-mix(in srgb,#0d99ff 45%,transparent);border-radius:2px}.ld-caret{display:inline-block;width:2px;height:.95em;margin-left:2px;vertical-align:-.08em;background:currentColor;animation:ld-blink 1s steps(1) infinite}@keyframes ld-blink{50%{opacity:0}}";
      doc.head.append(style);
      const host = doc.createElement("span");
      headingText.replaceWith(host);
      host.innerHTML = '<span class="ld-sel"></span>';
      host.firstChild.textContent = original.heading;
      syncOutline();
      await sleep(560);
      host.innerHTML = '<span class="ld-typed"></span><span class="ld-caret"></span>';
      const typed = host.firstChild;
      for (const char of next) {
        typed.textContent += char;
        syncOutline();
        await sleep(55 + Math.random() * 60);
      }
      await sleep(450);
      headingText.textContent = next;
      host.replaceWith(headingText);
      style.remove();
      syncOutline();
    };

    const play = async () => {
      for (;;) {
        reset();
        await sleep(900);
        cursor.style.opacity = "1";

        // 1. Scrub the grid's column gap from the field's icon.
        const gapInput = query('input[aria-label="Column Gap"]');
        const gapField = gapInput?.closest(".control-surface") ?? gapInput;
        if (gapInput && gapField) {
          const [gx, gy] = point(gapField, 0, 0.5);
          await moveTo(gx + 14, gy, 950);
          cursor.dataset.mode = "scrub";
          await sleep(180);
          const to = 40;
          await tween(1200, (k) => {
            const value = Math.round(original.columnGap + (to - original.columnGap) * k);
            place(gx + 14 + k * 70, gy);
            gapInput.value = `${value}px`;
            grid.style.columnGap = `${value}px`;
            syncOutline();
          });
          setChanges(1);
          await sleep(260);
          delete cursor.dataset.mode;
          await sleep(450);
        }

        // 2. Select a cover and swap its radius for a token from the real token menu.
        await moveTo(...point(cover, 0.55, 0.45), 900);
        await press();
        select(cover, coverPanel);
        await sleep(550);
        const chip = query('[aria-label="Change border-radius token"]');
        if (chip) {
          await moveTo(...point(chip, 0.3, 0.5), 800);
          await press();
          const menu = tokenMenu.cloneNode(true);
          root.append(menu);
          // The positioner places itself with an inline transform, so the entrance animates `translate` instead.
          menu.animate([{ opacity: 0, translate: "0 -4px" }, { opacity: 1, translate: "0 0" }], { duration: 160, easing: "ease-out" });
          // Each row is the token name, then its value; hovering a row previews that value on every cover.
          const rows = [...menu.querySelectorAll(".popover-listbox__item")]
            .map((item) => ({ item, spans: [...item.querySelectorAll("span")].map((span) => span.textContent.trim()).filter(Boolean) }))
            .filter(({ spans }) => spans[0]?.startsWith("--radius"));
          const targetIndex = rows.findIndex(({ spans }) => spans[0] === "--radius-20");
          await sleep(350);
          for (const { item, spans } of rows.slice(0, targetIndex + 1)) {
            await moveTo(...point(item, 0.3, 0.5), 200);
            rows.forEach((row) => row.item.toggleAttribute("data-highlighted", row.item === item));
            const value = spans.find((text) => /^[\d.]+(px|rem)$/.test(text)) ?? "";
            covers.forEach((element) => { element.style.borderRadius = value; });
            await sleep(220);
          }
          await press();
          menu.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: "forwards" }).finished.then(() => menu.remove());
          const label = chip.querySelector(".token-label__content");
          if (label) label.textContent = label.textContent.replace(/\d+/, "20");
          setChanges(2);
          await sleep(800);
        }

        // 3. Hold option and hover the neighbours to measure the distance from the selected cover.
        const coverBox = rectOf(cover);
        const beside = covers.find((element) => Math.abs(rectOf(element).top - coverBox.top) < 2 && rectOf(element).left > coverBox.left);
        const below = covers.find((element) => Math.abs(rectOf(element).left - coverBox.left) < 2 && rectOf(element).top > coverBox.top);
        showKey("⌥");
        await sleep(300);
        for (const neighbour of [beside, below]) {
          if (!neighbour) continue;
          clearMeasure();
          await moveTo(...point(neighbour, 0.45, 0.4), 750);
          drawMeasure(cover, neighbour);
          await sleep(1300);
        }
        clearMeasure();
        hideKey();
        await sleep(350);

        // 4. Select the "Browse" eyebrow and delete it; the heading and everything under it close up.
        if (eyebrow) {
          await moveTo(...point(eyebrow, 0.3, 0.5), 850);
          await press();
          select(eyebrow, eyebrowPanel);
          await sleep(650);
          showKey("⌫");
          await sleep(380);
          select(null, emptyPanel);
          setChanges(3);
          // A removed element hides its animations from getAnimations(), so reset cancels them through these handles.
          const height = eyebrow.getBoundingClientRect().height;
          eyebrowExit = [eyebrow.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: "ease-in", fill: "forwards" })];
          await eyebrowExit[0].finished;
          eyebrowExit.push(eyebrow.animate([{ height: `${height}px` }, { height: "0px" }], { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" }));
          await eyebrowExit[1].finished;
          eyebrow.remove();
        }
        hideKey();
        await sleep(900);

        // 5. Double-click the heading and rewrite it.
        await moveTo(...point(heading, 0.3, 0.55), 900);
        await press();
        select(heading, headingPanel);
        await sleep(80);
        await press();
        await retype("Sunday morning");
        setChanges(4);
        await sleep(600);

        // 6. Sketch: switch to the pencil and circle the filters, then back to the select tool. Marks stay on the page.
        const pencil = toolbarPortal.querySelector('button[aria-label="Pencil"]');
        if (pencil) {
          await moveTo(...point(pencil), 900);
          await press();
          setToolbar([...sketchToolbar.childNodes]);
          select(null, emptyPanel);
          await sleep(450);
          await sketchAround(chips);
          await sleep(900);
          const selectTool = toolbarPortal.querySelector('[aria-label="Interaction tools"] button');
          if (selectTool) {
            await moveTo(...point(selectTool), 800);
            await press();
          }
          setToolbar(original.toolbar);
          sketch?.querySelector(".ld-sketch-frame")?.remove();
          await sleep(400);
        }

        // 7. Hand off: copy the prompt for the agent.
        const copy = query(".copy-prompt__main");
        if (copy) {
          await moveTo(...point(copy, 0.55, 0.55), 900);
          await press();
          const text = [...copy.childNodes].find((node) => node.nodeType === 3 && node.textContent.trim());
          if (text) text.textContent = " Copied";
        }
        await sleep(1100);

        // 8. Switch to Claude Code and paste the prompt in.
        cursor.style.opacity = "0";
        await sleep(300);
        await commandTab("safari", "claude");
        const composer = agent.querySelector(".composer");
        place(...point(composer, 0.6, 1.4));
        cursor.style.opacity = "1";
        await moveTo(...point(composer, 0.35, 0.5), 700);
        await press();
        await pastePrompt();
        await sleep(1800);
        await moveTo(...point(action, 0.5, 0.5), 650);
        await press();
        void moveTo(...point(composer, 1.04, 1.4), 700);
        await sendPrompt();
        await sleep(2600);
        cursor.style.opacity = "0";
        await sleep(300);
        await commandTab("claude", "safari");
        await sleep(1400);
      }
    };

    place(at.x, at.y);
    if (!reduceMotion) void play();
  };
  if (frame.contentDocument?.readyState === "complete" && frame.contentDocument.querySelector(".album-grid")) start();
  else frame.addEventListener("load", start, { once: true });
})();
