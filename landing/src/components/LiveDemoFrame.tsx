import { useEffect, useRef, useState, type ReactNode } from "react";

// The Nudge panel on the jukebox browse page is captured at this size by scripts/capture-live-demo.mjs; the frame scales it to fit.
const LIVE_DEMO_WIDTH = 1280;
const LIVE_DEMO_HEIGHT = 720;
const LIVE_DEMO_SRC = "/live-demo/editor.html";

/** Plays the captured Nudge demo in place of the showcase video. The loop only runs while `playing` is true. */
export function LiveDemoFrame({ load, playing, title }: { load: boolean; playing: boolean; title: string }): ReactNode {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  // The showcase animates its width while the page scrolls. The scale is written straight to the frame from the
  // observer, which runs before paint, so it never lags the wrapper; a React state update landed a frame late and
  // left a strip of the wrapper showing down the right edge.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const update = () => {
      if (frameRef.current) frameRef.current.style.transform = `scale(${wrapper.getBoundingClientRect().width / LIVE_DEMO_WIDTH})`;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [load]);

  useEffect(() => {
    if (!ready) return;
    frameRef.current?.contentWindow?.postMessage({ type: "live-demo", playing }, window.location.origin);
  }, [playing, ready]);

  return (
    <div className="landing-live-demo" ref={wrapperRef} data-ready={ready}>
      {load ? (
        <iframe
          ref={frameRef}
          className="landing-live-demo-frame"
          src={LIVE_DEMO_SRC}
          title={title}
          tabIndex={-1}
          width={LIVE_DEMO_WIDTH}
          height={LIVE_DEMO_HEIGHT}
          onLoad={() => setReady(true)}
        />
      ) : null}
    </div>
  );
}
