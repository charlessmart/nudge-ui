import { FULLSCREEN_VERTEX, FluidSim, compileProgram, type Program } from "./fluidSim";
import { paintCodeLayer, paintDesignLayer, type LayerFrame } from "./layerTextures";

// Composites the two under-layers behind the live DOM. Reveal depth comes from
// the fluid dye (the swirling trail) screened with a soft cursor lens; depth
// past the first threshold shows the design layer and past the second shows
// the code layer.
//
// The boundary is not painted with a gradient. It reuses the same three-tap
// refraction as the layer contents: the layers are bent along the contour and
// the red, green and blue channels sample at different offsets, so the edge
// disperses only the detail that is actually there, like light through glass.
// The reveal mask itself is snapped to a 22px block grid for the pixel-dither
// edge, while the refraction stays smooth and per-pixel.
const COMPOSITE = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uDesign;
uniform sampler2D uCode;
uniform sampler2D uDye;
uniform sampler2D uVelocity;
uniform vec2 uResolution;
uniform vec2 uSimTexel;
uniform vec2 uPointer;
uniform float uPresence;
uniform float uLensRadius;
uniform float uRipple;
uniform float uTime;
uniform float uBlockSize;

const float DESIGN_START = 0.18;
const float CODE_START = 0.75;
// How far the per-block threshold jitter can nudge a cell, either way.
const float EDGE_JITTER = 0.08;
// Step used to measure the reveal's slope, in CSS pixels.
const float EDGE_PROBE = 3.0;
// Width of the refraction band on the contour, in CSS pixels.
const float RIM_WIDTH = 28.0;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Flow in UV units: roughly how far the fluid moves this pixel in ~40ms.
vec2 flowAt(vec2 uv) {
  vec2 flow = texture(uVelocity, uv).xy * uSimTexel * 0.04;
  return flow * min(1.0, 0.008 / max(length(flow), 1e-5));
}

// The cursor lens alone, sampled in CSS pixels.
float lensAt(vec2 px) {
  vec2 toPointer = px - uPointer * uResolution;
  return exp(-dot(toPointer, toPointer) / (uLensRadius * uLensRadius)) * uPresence;
}

// Smooth reveal depth, used for the mask and for locating the contour.
float depthAt(vec2 uv) {
  float dye = clamp(texture(uDye, uv).r, 0.0, 1.0);
  return 1.0 - (1.0 - dye) * (1.0 - lensAt(uv * uResolution));
}

// Smooth depth at this pixel, plus the reveal slope (depth per CSS pixel) and
// its unit gradient pointing toward deeper reveal.
float depthGradient(vec2 uv, out vec2 direction, out float slope) {
  float center = depthAt(uv);
  vec2 stepUv = vec2(EDGE_PROBE) / uResolution;
  float dx = depthAt(uv + vec2(stepUv.x, 0.0)) - center;
  float dy = depthAt(uv + vec2(0.0, stepUv.y)) - center;
  vec2 gradient = vec2(dx, dy) / EDGE_PROBE;
  slope = length(gradient);
  direction = slope > 1e-5 ? gradient / slope : vec2(0.0, 1.0);
  return center;
}

// Soft band peaked on the contour and fading out over width pixels.
float rimAt(float distancePx, float width) {
  float t = clamp(distancePx / width, 0.0, 1.0);
  return (1.0 - t) * (1.0 - t);
}

// Three taps along the refraction axis: red bends least, blue most.
vec3 chromaSample(sampler2D layer, vec2 uv, vec2 offsetPx, float spread) {
  vec2 offset = offsetPx / uResolution;
  return vec3(
    texture(layer, uv + offset * (1.0 - spread)).r,
    texture(layer, uv + offset).g,
    texture(layer, uv + offset * (1.0 + spread)).b
  );
}

void main() {
  vec2 uv = vUv;
  vec2 px = uv * uResolution;

  // One depth sample per block: every fragment in a cell reads the same value,
  // so the thresholds below can only land on cell edges and the reveal
  // resolves into hard pixel cells. The layers stay sampled per pixel.
  vec2 cell = floor(px / uBlockSize);
  vec2 blockPx = (cell + 0.5) * uBlockSize;
  vec2 blockUv = blockPx / uResolution;

  vec2 blockFlow = flowAt(blockUv);
  vec2 toPointer = blockPx - uPointer * uResolution;
  // Concentric ripples riding the lens edge while it swells or closes.
  float pointerDistance = length(toPointer);
  float ringOffset = (pointerDistance - uLensRadius * 1.1) / (uLensRadius * 0.55 + 1.0);
  float ring = exp(-ringOffset * ringOffset);
  float ripple = sin(pointerDistance * 0.075 - uTime * 6.0) * ring * uRipple;
  // The ripple only moves the mask's edge, never the layer contents, and stays
  // small so the contour reads as a lens rather than a water surface.
  vec2 maskFlow = blockFlow + toPointer / max(pointerDistance, 1.0) * ripple * 2.4 / uResolution;

  float dye = clamp(texture(uDye, blockUv + maskFlow * 0.3).r, 0.0, 1.0);
  float lens = exp(-dot(toPointer, toPointer) / (uLensRadius * uLensRadius)) * uPresence;
  float depth = 1.0 - (1.0 - dye) * (1.0 - lens);

  // Let the layers shrink into the section's bottom edge rather than clip.
  float bottomGate = smoothstep(0.0, 90.0, blockPx.y);
  depth *= bottomGate;

  // A stable per-block nudge keeps the boundary ragged: neighbouring cells at
  // the same depth still flip in and out, so the edge reads as a dithered
  // field rather than a clean staircase.
  float jitter = (hash(cell) - 0.5) * EDGE_JITTER;
  float designMask = step(DESIGN_START + jitter, depth);
  float codeMask = step(CODE_START + jitter, depth);

  // Locate the contour and bend both layers along its normal. The chromatic
  // split grows toward the rim, so the edge scatters colour exactly like the
  // layer detail does in the middle.
  vec2 edgeDir;
  float edgeSlope;
  float smoothDepth = depthGradient(uv, edgeDir, edgeSlope);
  float designDistance = abs(smoothDepth - DESIGN_START) / max(edgeSlope, 1e-5);
  float codeDistance = abs(smoothDepth - CODE_START) / max(edgeSlope, 1e-5);
  float designRim = rimAt(designDistance, RIM_WIDTH);
  float codeRim = rimAt(codeDistance, RIM_WIDTH * 0.8);
  float rim = max(designRim, codeRim) * bottomGate;

  vec2 bend = edgeDir * rim * 18.0;
  float split = mix(0.3, 0.7, rim);
  vec2 flow = flowAt(uv);
  vec3 design = chromaSample(uDesign, uv + flow * 0.05, bend, split);
  vec3 code = chromaSample(uCode, uv + flow * 0.1, bend * 1.15, split * 1.15);

  vec3 content = mix(design, code, codeMask);
  float alpha = designMask;
  vec3 rgb = content * alpha;

  outColor = vec4(rgb, alpha);
}`;

export type DepthRevealOptions = {
  /** The hero section the canvas covers and whose DOM the layers describe. */
  root: HTMLElement;
  canvas: HTMLCanvasElement;
};

// Side of one reveal block in CSS pixels.
const BLOCK_SIZE = 22;

type Layers = { design: WebGLTexture; code: WebGLTexture };

export function startDepthReveal({ root, canvas }: DepthRevealOptions): () => void {
  const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!gl || !gl.getExtension("EXT_color_buffer_float")) return () => undefined;
  gl.getExtension("OES_texture_float_linear");

  let fluid: FluidSim;
  let composite: Program;
  try {
    fluid = new FluidSim(gl, {
      // A calmer solver: the reveal should track the cursor like a lens, not
      // trail and swirl like liquid. Less curl and quicker velocity decay kill
      // the vortices; the dye life stays long enough to keep the splash open.
      curl: 4,
      velocityDissipation: 0.91,
      dyeDissipation: 0.95,
    });
    composite = compileProgram(gl, FULLSCREEN_VERTEX, COMPOSITE);
  } catch (error) {
    console.warn("[hero-depth] disabled:", error);
    return () => undefined;
  }

  let disposed = false;
  let layers: Layers | null = null;
  let cssWidth = 0;
  let cssHeight = 0;
  let frame = 0;
  let lastTime = 0;
  let activeUntil = 0;
  let visible = true;
  let paintTimer = 0;
  // Set when the canvas's box no longer matches the size the layers were painted at: the drawing buffer would be
  // stretched over the new box and the layers would no longer line up with the DOM, so nothing draws until the
  // repaint lands.
  let stale = false;

  const pointer = {
    clientX: 0,
    clientY: 0,
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    smoothX: 0,
    smoothY: 0,
    known: false,
    inside: false,
    moved: false,
  };

  // The lens behaves like water being pulled open: its depth and size follow
  // how far the cursor has travelled in the last moment, and a slightly
  // underdamped spring lets it swell, then wobble shut once the cursor stops.
  const LENS_WINDOW_MS = 160;
  const lens = { energy: 0, radius: 0, velocity: 0, frameX: 0, frameY: 0, trail: [] as Array<{ time: number; distance: number }> };
  const maxLensRadius = () => Math.min(170, Math.max(110, cssWidth * 0.1));
  function createTexture(source: HTMLCanvasElement): WebGLTexture {
    const texture = gl!.createTexture();
    if (!texture) throw new Error("Could not create texture");
    gl!.bindTexture(gl!.TEXTURE_2D, texture);
    gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, true);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, source);
    gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, false);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    return texture;
  }

  function paintLayers(): void {
    if (disposed) return;
    const origin = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const sizeChanged = Math.round(origin.width) !== cssWidth || Math.round(origin.height) !== cssHeight;
    cssWidth = Math.round(origin.width);
    cssHeight = Math.round(origin.height);
    if (cssWidth === 0 || cssHeight === 0) return;

    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    if (sizeChanged || !layers) fluid.resize(cssWidth, cssHeight);

    const layerFrame: LayerFrame = { origin, width: cssWidth, height: cssHeight, dpr };
    const design = createTexture(paintDesignLayer(root, layerFrame));
    const code = createTexture(paintCodeLayer(root, layerFrame));
    if (layers) {
      gl!.deleteTexture(layers.design);
      gl!.deleteTexture(layers.code);
    }
    layers = { design, code };
    stale = false;
    wake(600);
  }

  function markStale(): void {
    if (stale || !layers) return;
    stale = true;
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
  }

  function schedulePaint(delay = 160): void {
    window.clearTimeout(paintTimer);
    paintTimer = window.setTimeout(paintLayers, delay);
  }

  function updatePointerFromClient(): void {
    const rect = canvas.getBoundingClientRect();
    pointer.x = pointer.clientX - rect.left;
    pointer.y = pointer.clientY - rect.top;
    pointer.inside = pointer.x >= 0 && pointer.y >= 0 && pointer.x <= rect.width && pointer.y <= rect.height;
  }

  function onPointerMove(event: PointerEvent): void {
    pointer.clientX = event.clientX;
    pointer.clientY = event.clientY;
    updatePointerFromClient();
    if (!pointer.known) {
      pointer.prevX = pointer.smoothX = lens.frameX = pointer.x;
      pointer.prevY = pointer.smoothY = lens.frameY = pointer.y;
      pointer.known = true;
    }
    pointer.moved = true;
    if (pointer.inside) wake();
  }

  function onPointerLeave(): void {
    pointer.inside = false;
    wake();
  }

  function onScroll(): void {
    if (!pointer.known) return;
    updatePointerFromClient();
    pointer.moved = true;
    wake();
  }

  function wake(ms = 3000): void {
    activeUntil = Math.max(activeUntil, performance.now() + ms);
    if (frame === 0 && visible && !disposed) {
      lastTime = performance.now();
      frame = requestAnimationFrame(tick);
    }
  }

  function injectStroke(dt: number): void {
    if (!pointer.moved) return;
    pointer.moved = false;
    const dx = pointer.x - pointer.prevX;
    const dy = pointer.y - pointer.prevY;
    const distance = Math.hypot(dx, dy);
    if (pointer.inside && distance > 0.5 && distance < 400) {
      const speed = distance / Math.max(dt, 1 / 240);
      const force = fluid.config.simScale * 0.28 / Math.max(dt, 1 / 240);
      const amount = Math.min(0.4, 0.09 + speed / 6500);
      fluid.splat(
        [pointer.x / cssWidth, 1 - pointer.y / cssHeight],
        [pointer.prevX / cssWidth, 1 - pointer.prevY / cssHeight],
        [dx * force, -dy * force],
        amount,
        (37 + Math.min(speed / 48, 38)) / cssHeight,
      );
    }
    pointer.prevX = pointer.x;
    pointer.prevY = pointer.y;
  }

  function updateLens(dt: number, now: number): void {
    const step = Math.max(dt, 1 / 240);
    const travelled = Math.hypot(pointer.x - lens.frameX, pointer.y - lens.frameY);
    lens.frameX = pointer.x;
    lens.frameY = pointer.y;
    if (pointer.inside && travelled > 0 && travelled < 400) lens.trail.push({ time: now, distance: travelled });
    while (lens.trail.length > 0 && now - (lens.trail[0]?.time ?? now) > LENS_WINDOW_MS) lens.trail.shift();
    if (!pointer.inside) lens.trail.length = 0;

    // Path length over the window: a small nudge opens a small, shallow lens;
    // a long sweep opens a big one that cuts through to the code.
    const recentTravel = lens.trail.reduce((sum, sample) => sum + sample.distance, 0);
    lens.energy = 1 - Math.exp(-recentTravel / 200);

    const target = Math.min(maxLensRadius(), recentTravel * 0.75);
    // Nearly critical damping: the lens opens and closes smoothly instead of
    // wobbling like a water surface.
    const stiffness = 140;
    const damping = 22;
    lens.velocity += ((target - lens.radius) * stiffness - lens.velocity * damping) * step;
    lens.radius = Math.max(0, lens.radius + lens.velocity * step);
  }

  function tick(now: number): void {
    frame = 0;
    if (disposed || !visible) return;
    const dt = Math.min((now - lastTime) / 1000, 1 / 30);
    lastTime = now;

    if (layers) {
      injectStroke(dt);
      fluid.step(Math.max(dt, 1 / 240));

      const follow = 1 - Math.exp(-dt * 16);
      pointer.smoothX += (pointer.x - pointer.smoothX) * follow;
      pointer.smoothY += (pointer.y - pointer.smoothY) * follow;
      updateLens(dt, now);
      render(now);
    }

    if (now < activeUntil) {
      frame = requestAnimationFrame(tick);
    }
  }

  function render(now: number): void {
    if (!layers || stale) return;
    const program = composite;
    gl!.useProgram(program.program);
    gl!.uniform2f(program.uniforms.uResolution ?? null, cssWidth, cssHeight);
    const simWidth = Math.max(16, Math.round(cssWidth * fluid.config.simScale));
    const simHeight = Math.max(16, Math.round(cssHeight * fluid.config.simScale));
    gl!.uniform2f(program.uniforms.uSimTexel ?? null, 1 / simWidth, 1 / simHeight);
    gl!.uniform2f(program.uniforms.uPointer ?? null, pointer.smoothX / cssWidth, 1 - pointer.smoothY / cssHeight);
    // Depth tracks energy too: a slow drift only parts the surface to the
    // design layer; a fast pull cuts through to the code.
    gl!.uniform1f(program.uniforms.uPresence ?? null, Math.min(1, lens.energy * 1.25));
    gl!.uniform1f(program.uniforms.uLensRadius ?? null, Math.max(lens.radius, 1));
    gl!.uniform1f(program.uniforms.uRipple ?? null, Math.min(1, Math.abs(lens.velocity) / 450));
    gl!.uniform1f(program.uniforms.uTime ?? null, now / 1000);
    gl!.uniform1f(program.uniforms.uBlockSize ?? null, BLOCK_SIZE);
    fluid.bindTexture(0, layers.design, program.uniforms.uDesign);
    fluid.bindTexture(1, layers.code, program.uniforms.uCode);
    fluid.bindTexture(2, fluid.dyeTexture, program.uniforms.uDye);
    fluid.bindTexture(3, fluid.velocityTexture, program.uniforms.uVelocity);
    gl!.clearColor(0, 0, 0, 0);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    fluid.draw(null, canvas.width, canvas.height);
  }

  // Wait for the hero cards to land and the web fonts to arrive before taking
  // the DOM snapshot, otherwise outlines and code are measured mid-animation.
  const cardAnimations = root.getAnimations({ subtree: true }).filter((animation) => (
    animation instanceof CSSAnimation && animation.animationName.startsWith("landing-hero-demo-card")
  ));
  void Promise.all([document.fonts.ready, ...cardAnimations.map((animation) => animation.finished.catch(() => undefined))]).then(() => {
    if (disposed) return;
    paintLayers();
  });

  // The canvas spans the viewport while the hero stops at its max-width, so either can change size without the
  // other: a wide frame resizing changes only the canvas, a reflow inside the hero changes only the root.
  const resizeObserver = new ResizeObserver(() => {
    if (!layers) return;
    const box = canvas.getBoundingClientRect();
    if (Math.round(box.width) !== cssWidth || Math.round(box.height) !== cssHeight) markStale();
    schedulePaint();
  });
  resizeObserver.observe(root);
  resizeObserver.observe(canvas);

  const visibilityObserver = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    if (visible) wake(600);
  });
  visibilityObserver.observe(canvas);

  const onFontsLoaded = () => {
    if (layers) schedulePaint();
  };
  const onContextLost = (event: Event) => {
    event.preventDefault();
    disposed = true;
    if (frame !== 0) cancelAnimationFrame(frame);
  };

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", onPointerLeave);
  window.addEventListener("scroll", onScroll, { passive: true });
  document.fonts.addEventListener("loadingdone", onFontsLoaded);
  canvas.addEventListener("webglcontextlost", onContextLost);

  return () => {
    disposed = true;
    if (frame !== 0) cancelAnimationFrame(frame);
    window.clearTimeout(paintTimer);
    resizeObserver.disconnect();
    visibilityObserver.disconnect();
    window.removeEventListener("pointermove", onPointerMove);
    document.documentElement.removeEventListener("pointerleave", onPointerLeave);
    window.removeEventListener("scroll", onScroll);
    document.fonts.removeEventListener("loadingdone", onFontsLoaded);
    canvas.removeEventListener("webglcontextlost", onContextLost);
    if (!gl.isContextLost()) {
      if (layers) {
        gl.deleteTexture(layers.design);
        gl.deleteTexture(layers.code);
      }
      fluid.dispose();
      gl.deleteProgram(composite.program);
    }
  };
}
