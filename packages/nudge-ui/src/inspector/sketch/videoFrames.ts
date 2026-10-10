import { SKETCH_LIMITS } from "./model.ts";

const FRAME_ATTRIBUTE = "data-nudge-ui-video-frame";
const EMPTY_FRAME = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

function* videoElements(root: Document | ShadowRoot): Generator<HTMLVideoElement> {
  yield* root.querySelectorAll("video");
  for (const element of root.querySelectorAll("*")) {
    if (element.shadowRoot) yield* videoElements(element.shadowRoot);
  }
}

function videoFrame(video: HTMLVideoElement): HTMLImageElement {
  const image = video.ownerDocument.createElement("img");
  image.src = video.poster || EMPTY_FRAME;
  image.width = video.videoWidth || video.clientWidth || 300;
  image.height = video.videoHeight || video.clientHeight || 150;
  const style = video.ownerDocument.defaultView?.getComputedStyle(video);
  if (style) {
    for (const property of style) {
      image.style.setProperty(property, style.getPropertyValue(property), style.getPropertyPriority(property));
    }
  }
  // Preserve the replaced element's layout even when its CSS size is auto.
  image.style.width = style?.width && style.width !== "auto" ? style.width : `${video.clientWidth}px`;
  image.style.height = style?.height && style.height !== "auto" ? style.height : `${video.clientHeight}px`;

  if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
    const canvas = video.ownerDocument.createElement("canvas");
    const scale = Math.min(1, SKETCH_LIMITS.imageEdge / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    try {
      const context = canvas.getContext("2d");
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        image.src = canvas.toDataURL("image/png");
      }
    } catch {
      // Cross-origin frames can taint a canvas. Keep the poster or empty frame.
    }
  }
  return image;
}

/** Supplies still images to the DOM renderer while live videos stay mounted. */
export function prepareSketchVideoFrames(targetDocument: Document): {
  readonly filter: (node: Node) => boolean;
  readonly prepareClone: (node: Node) => void;
  readonly restore: () => void;
} {
  const frames = new Map<string, HTMLImageElement>();
  const placeholders: HTMLImageElement[] = [];
  for (const video of videoElements(targetDocument)) {
    const id = String(frames.size);
    frames.set(id, videoFrame(video));
    const placeholder = targetDocument.createElement("img");
    placeholder.hidden = true;
    placeholder.src = EMPTY_FRAME;
    placeholder.setAttribute(FRAME_ATTRIBUTE, id);
    // The hidden sibling preserves capture order without detaching or seeking
    // the application's video. Only its clone receives the video's styles.
    video.before(placeholder);
    placeholders.push(placeholder);
  }
  return {
    filter: (node) => node.nodeType !== 1 || (node as Element).localName !== "video",
    prepareClone: (node) => {
      if (node.nodeType !== 1) return;
      const element = node as HTMLElement;
      const id = element.getAttribute(FRAME_ATTRIBUTE);
      const frame = id === null ? undefined : frames.get(id);
      if (!frame) return;
      element.removeAttribute(FRAME_ATTRIBUTE);
      element.removeAttribute("hidden");
      element.style.cssText = frame.style.cssText;
      element.setAttribute("src", frame.src);
      element.setAttribute("width", String(frame.width));
      element.setAttribute("height", String(frame.height));
    },
    restore: () => {
      for (const placeholder of placeholders) placeholder.remove();
    },
  };
}
