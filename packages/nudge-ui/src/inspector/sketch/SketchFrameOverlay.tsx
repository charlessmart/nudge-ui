import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { SketchSvgLayer } from "./freehand.tsx";
import { useSketchStore } from "./store.ts";
import type { SketchAnnotation, SketchDocument, SketchPoint, SketchStroke } from "./model.ts";
import { getSketchScrollPosition } from "./capture.ts";

interface SketchFrameOverlayProps {
  readonly iframe: HTMLIFrameElement | null;
  readonly cardUrl: string;
  readonly ready: boolean;
}

function routeKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    // These parameters belong to the inspector host, not to the application
    // route. Removing them lets a sketch follow the same page in Focus mode,
    // the canvas, and a direct editor launch.
    parsed.searchParams.delete("__nudge_ui_direct");
    parsed.searchParams.delete("nudge-ui");
    return `${parsed.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function frameRoute(iframe: HTMLIFrameElement, fallback: string): string | null {
  try {
    return routeKey(iframe.contentWindow?.location.href ?? fallback);
  } catch {
    return routeKey(fallback);
  }
}

function sameFrame(document: SketchDocument, iframe: HTMLIFrameElement, cardUrl: string): boolean {
  const sketchRoute = routeKey(document.capture.url);
  if (!sketchRoute) return false;
  return sketchRoute === frameRoute(iframe, cardUrl);
}

export function projectSketchPoint(
  point: SketchPoint,
  document: SketchDocument,
  frameWindow: Window,
  width: number,
  height: number,
): SketchPoint {
  const capture = document.capture;
  const imageWidth = Math.max(1, document.imageWidth);
  const imageHeight = Math.max(1, document.imageHeight);
  const viewportWidth = Math.max(1, frameWindow.innerWidth || width);
  const viewportHeight = Math.max(1, frameWindow.innerHeight || height);
  const scroll = getSketchScrollPosition(frameWindow);
  // Preserve the point's relative horizontal position when the responsive
  // iframe changes width. Apply the scroll delta separately so horizontal
  // page scrolling still moves the sketch with the content.
  const captureLocalX = (point.x / imageWidth) * capture.viewportWidth;
  const currentLocalX = (captureLocalX / Math.max(1, capture.viewportWidth)) * viewportWidth
    - (scroll.x - capture.scrollX);
  const pageY = capture.scrollY + (point.y / imageHeight) * capture.viewportHeight;
  return {
    x: (currentLocalX / viewportWidth) * width,
    y: ((pageY - scroll.y) / viewportHeight) * height,
  };
}

function visibleStroke(
  stroke: SketchStroke,
  document: SketchDocument,
  frameWindow: Window,
  width: number,
  height: number,
): SketchStroke {
  const captureScale = document.capture.viewportWidth / Math.max(1, document.imageWidth);
  const currentScale = width / Math.max(1, frameWindow.innerWidth || width);
  return {
    ...stroke,
    width: stroke.width * captureScale * currentScale,
    points: stroke.points.map((point) => projectSketchPoint(point, document, frameWindow, width, height)),
  };
}

export function SketchFrameOverlay({ iframe, cardUrl, ready }: SketchFrameOverlayProps): ReactElement | null {
  const { items } = useSketchStore();
  const [revision, setRevision] = useState(0);
  const documents = useMemo(
    () => ready && iframe
      ? items.map((item) => item.document).filter((document) => sameFrame(document, iframe, cardUrl))
      : [],
    [cardUrl, iframe, items, ready],
  );

  useEffect(() => {
    if (!iframe || documents.length === 0) return;
    const frameWindow = iframe.contentWindow;
    if (!frameWindow) return;
    const refresh = (): void => setRevision((value) => value + 1);
    window.addEventListener("resize", refresh);
    frameWindow.addEventListener("resize", refresh);
    frameWindow.addEventListener("scroll", refresh, true);
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(refresh);
    observer?.observe(iframe);
    return () => {
      window.removeEventListener("resize", refresh);
      frameWindow.removeEventListener("resize", refresh);
      frameWindow.removeEventListener("scroll", refresh, true);
      observer?.disconnect();
    };
  }, [documents.length, iframe]);

  const width = iframe
    ? Math.max(1, iframe.clientWidth || iframe.getBoundingClientRect().width)
    : 1;
  const height = iframe
    ? Math.max(1, iframe.clientHeight || iframe.getBoundingClientRect().height)
    : 1;
  const frameWindow = iframe?.contentWindow ?? null;
  const layers = useMemo(() => {
    if (!iframe || !frameWindow || documents.length === 0) {
      return {
        strokes: [] as SketchStroke[],
        annotations: [] as SketchAnnotation[],
      };
    }
    const strokes: SketchStroke[] = [];
    const annotations: SketchAnnotation[] = [];
    for (const document of documents) {
      strokes.push(...document.strokes.map((stroke) => visibleStroke(stroke, document, frameWindow, width, height)));
      annotations.push(...(document.annotations ?? []).map((annotation) => ({
        ...annotation,
        point: projectSketchPoint(annotation.point, document, frameWindow, width, height),
      })));
    }
    return { strokes, annotations };
  }, [documents, frameWindow, height, iframe, revision, width]);

  if (!iframe || documents.length === 0 || !frameWindow) return null;
  return (
    <svg
      className="canvas-card__sketch-overlay"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      data-test="canvas-sketch-overlay"
    >
      <SketchSvgLayer strokes={layers.strokes} annotations={layers.annotations} />
    </svg>
  );
}
