import { useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode, type RefObject } from "react";
import { IconArrowsMove, IconEdit, IconPalette } from "@tabler/icons-react";
import editDirectlyPoster from "../assets/screen-1.png";
import editDirectlyVideo from "../assets/screen-1.mp4";
import inspectorArrowHead from "../assets/arrow-head.svg";
import inspectorArrowTail from "../assets/arrow-tail.svg";
import exploreCanvasPoster from "../assets/screen-2.png";
import exploreCanvasVideo from "../assets/screen2.mp4";
import syncTokensPoster from "../assets/screen-3.png";
import syncTokensVideo from "../assets/screen3.mp4";
import { HeroDemoGrid } from "./components/HeroDemoGrid";

const installPrompt = "Run npm create nudge-ui@latest in this project";
const OPEN_NUDGE_EVENT = "nudge-ui:open";
const manualSetupCode = [
  "Vite + React  nudge-ui/vite",
  "Next.js       nudge-ui/next",
  "Astro         nudge-ui/astro",
  "Static HTML   nudge-ui/static",
].join(String.fromCharCode(10));
const agentSetupCode = [
  "pnpm add -D @nudge-ui/mcp",
  "pnpm exec nudge-mcp \\",
  "  --project-id my-app \\",
  "  --origin http://localhost:5173 \\",
  "  --workspace-root /path/to/my-app",
].join(String.fromCharCode(10));

const showcaseVideos = [
  {
    id: "edit-directly",
    title: "Edit UI directly",
    description: "Prompting an agent to make UI changes feels like backseat driving. You ask for a tiny visual change, wait for the update, only to realise it looked better before. Editing directly gives you the immediate feedback so that you know if you're making the right decision.",
    bullets: [
      { Icon: IconPalette, label: "Change styles" },
      { Icon: IconArrowsMove, label: "Move and delete elements" },
      { Icon: IconEdit, label: "Edit text" },
    ],
    src: editDirectlyVideo,
    poster: editDirectlyPoster,
  },
  {
    id: "explore-canvas",
    title: "A canvas for exploring variations",
    description: "Open different pages in a canvas view to compare variations, screen sizes or overall flows. Generate 3 different options, pick one, refine the details immediately to get it feeling right.\n\nDesigning in a terminal? No, you can pry canvas UX out of my cold, dead hands.",
    src: exploreCanvasVideo,
    poster: exploreCanvasPoster,
  },
  {
    id: "sync-tokens-components",
    title: "Keep tokens and components in sync",
    description: "It's your real code base, so use the tokens and components that exist already. Avoid agents churning out custom CSS for every button.",
    src: syncTokensVideo,
    poster: syncTokensPoster,
  },
] as const;

function CopyIcon(): ReactNode {
  return (
    <svg className="landing-install-copy-icon-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="13" height="13" x="9" y="9" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function DoneIcon(): ReactNode {
  return (
    <svg className="landing-install-copy-icon-done" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function GitHubIcon(): ReactNode {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.582 2 12.25c0 4.532 2.865 8.375 6.839 9.73.5.095.682-.22.682-.49 0-.24-.009-1.03-.014-1.867-2.782.62-3.369-1.218-3.369-1.218-.455-1.184-1.11-1.5-1.11-1.5-.908-.637.069-.624.069-.624 1.004.073 1.532 1.06 1.532 1.06.892 1.566 2.341 1.114 2.913.852.091-.664.349-1.114.636-1.37-2.222-.26-4.556-1.14-4.556-5.077 0-1.122.39-2.04 1.03-2.758-.103-.26-.446-1.305.098-2.72 0 0 .84-.276 2.75 1.053A9.314 9.314 0 0 1 12 6.986a9.33 9.33 0 0 1 2.5.345c1.909-1.329 2.748-1.053 2.748-1.053.545 1.415.202 2.46.1 2.72.64.718 1.028 1.636 1.028 2.758 0 3.947-2.338 4.813-4.566 5.067.359.318.679.946.679 1.907 0 1.376-.012 2.485-.012 2.824 0 .273.18.59.688.49C19.138 20.62 22 16.779 22 12.25 22 6.582 17.523 2 12 2Z" />
    </svg>
  );
}

function ReactMark(): ReactNode {
  return (
    <svg className="landing-stack-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <ellipse cx="12" cy="12" rx="9.5" ry="3.7" stroke="currentColor" strokeWidth="1.35" />
      <ellipse cx="12" cy="12" rx="9.5" ry="3.7" transform="rotate(60 12 12)" stroke="currentColor" strokeWidth="1.35" />
      <ellipse cx="12" cy="12" rx="9.5" ry="3.7" transform="rotate(120 12 12)" stroke="currentColor" strokeWidth="1.35" />
    </svg>
  );
}

function NextMark(): ReactNode {
  return (
    <svg className="landing-stack-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" fill="currentColor" />
      <path d="M7.5 16V8l8.5 8V8M16 13.5V8" stroke="var(--surface-raised)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HtmlMark(): ReactNode {
  return (
    <svg className="landing-stack-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3.7 3.2h16.6l-1.5 16.1L12 21.4l-6.8-2.1L3.7 3.2Z" fill="currentColor" />
      <path d="M7 7h10l-.3 2H9.2l.2 2h7l-.7 5.6-3.7 1.1-3.7-1.1-.2-2.1 2-.6.1.9 1.8.5 1.8-.5.2-1.8H7.5L7 7Z" fill="var(--surface-raised)" />
    </svg>
  );
}

function AstroMark(): ReactNode {
  return (
    <svg className="landing-stack-icon" viewBox="0 0 85 107" fill="none" aria-hidden="true">
      <path d="M27.5893 91.1365C22.7555 86.7178 21.3443 77.4335 23.3583 70.7072C26.8503 74.948 31.6888 76.2914 36.7005 77.0497C44.4374 78.2199 52.0358 77.7822 59.2231 74.2459C60.0453 73.841 60.8052 73.3027 61.7036 72.7574C62.378 74.714 62.5535 76.6892 62.3179 78.6996C61.7452 83.5957 59.3086 87.3778 55.4332 90.2448C53.8835 91.3916 52.2437 92.4167 50.6432 93.4979C45.7262 96.8213 44.3959 100.718 46.2435 106.386C46.2874 106.525 46.3267 106.663 46.426 107C43.9155 105.876 42.0817 104.24 40.6844 102.089C39.2086 99.8193 38.5065 97.3081 38.4696 94.5909C38.4511 93.2686 38.4511 91.9345 38.2733 90.6309C37.8391 87.4527 36.3471 86.0297 33.5364 85.9478C30.6518 85.8636 28.37 87.6469 27.7649 90.4554C27.7187 90.6707 27.6517 90.8837 27.5847 91.1341L27.5893 91.1365Z" fill="currentColor" />
      <path d="M0 69.5866C0 69.5866 14.3139 62.6137 28.6678 62.6137L39.4901 29.1204C39.8953 27.5007 41.0783 26.3999 42.4139 26.3999C43.7495 26.3999 44.9325 27.5007 45.3377 29.1204L56.1601 62.6137C73.1601 62.6137 84.8278 69.5866 84.8278 69.5866C84.8278 69.5866 60.5145 3.35233 60.467 3.21944C59.7692 1.2612 58.5911 0 57.0029 0H27.8274C26.2392 0 25.1087 1.2612 24.3634 3.21944C24.3108 3.34983 0 69.5866 0 69.5866Z" fill="currentColor" />
    </svg>
  );
}

function FrameworkName({ icon, children }: { icon: ReactNode; children: ReactNode }): ReactNode {
  return <span className="landing-framework"><span className="landing-framework-icon">{icon}</span>{children}</span>;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

type ShowcaseControls = {
  initialWidth: number;
  startViewport: number;
  scrollSpeed: number;
  visibilityThreshold: number;
};

const showcaseControls: ShowcaseControls = {
  initialWidth: 650,
  startViewport: 0.88,
  scrollSpeed: 0.75,
  visibilityThreshold: 1,
};

function useShowcaseWidth(animate: boolean, controls: ShowcaseControls): { ref: RefObject<HTMLDivElement | null>; width: string; opacity: number; isFullWidth: boolean } {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(`${controls.initialWidth}px`);
  const [opacity, setOpacity] = useState(1);
  const [isFullWidth, setIsFullWidth] = useState(!animate);

  useEffect(() => {
    if (!animate) return;

    const element = ref.current;
    if (!element) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;

    const update = () => {
      frame = 0;
      const parent = element.parentElement;
      if (!parent) return;

      const rect = element.getBoundingClientRect();
      const parentWidth = parent.getBoundingClientRect().width;

      if (reducedMotion.matches) {
        setWidth(`${parentWidth}px`);
        setOpacity(1);
        setIsFullWidth(true);
        return;
      }

      const minimumWidth = clamp(controls.initialWidth, 0, parentWidth);
      const widthRange = parentWidth - minimumWidth;
      const scrollSpeed = Math.max(controls.scrollSpeed, 0);
      const entryTop = window.innerHeight * controls.startViewport;
      const expansionProgress = clamp((entryTop - rect.top) * scrollSpeed, 0, widthRange);
      const collapseProgress = clamp(-rect.top * scrollSpeed, 0, widthRange);
      const nextWidth = minimumWidth + expansionProgress - collapseProgress;
      const nextOpacity = widthRange === 0 ? 1 : 1 - (collapseProgress / widthRange) * 0.5;
      setWidth((current) => current === `${nextWidth}px` ? current : `${nextWidth}px`);
      setOpacity((current) => current === nextOpacity ? current : nextOpacity);
      setIsFullWidth(nextWidth >= parentWidth);
    };

    const scheduleUpdate = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };

    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    reducedMotion.addEventListener("change", scheduleUpdate);

    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      reducedMotion.removeEventListener("change", scheduleUpdate);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [animate, controls.initialWidth, controls.scrollSpeed, controls.startViewport]);

  return { ref, width: animate ? width : "100%", opacity: animate ? opacity : 1, isFullWidth: animate ? isFullWidth : true };
}

function useShowcaseInView(
  ref: RefObject<HTMLDivElement | null>,
  threshold: number,
  rootMargin = "0px",
): boolean {
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (!("IntersectionObserver" in window)) {
      setIsInView(true);
      return;
    }

    const intersectionThreshold = clamp(threshold, 0, 1);
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      setIsInView(entry.isIntersecting && entry.intersectionRatio >= intersectionThreshold);
    }, { rootMargin, threshold: [0, intersectionThreshold] });

    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, rootMargin, threshold]);

  return isInView;
}

function ShowcaseVideo({
  animate,
  controls,
  video,
}: {
  animate: boolean;
  controls: ShowcaseControls;
  video: (typeof showcaseVideos)[number];
}): ReactNode {
  const { ref, width, opacity, isFullWidth } = useShowcaseWidth(animate, controls);
  const isInView = useShowcaseInView(ref, controls.visibilityThreshold);
  const shouldLoadVideo = useShowcaseInView(ref, controls.visibilityThreshold, "320px 0px");
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const loopTimeout = useRef<number | null>(null);
  const isVideoVisible = isInView && isFullWidth;

  useEffect(() => {
    if (!shouldLoadVideo) setVideoReady(false);
  }, [shouldLoadVideo]);

  useEffect(() => {
    if (isVideoVisible) {
      void videoRef.current?.play().catch(() => undefined);
      return;
    }

    if (loopTimeout.current !== null) {
      window.clearTimeout(loopTimeout.current);
      loopTimeout.current = null;
    }
    videoRef.current?.pause();
  }, [isVideoVisible]);

  useEffect(() => {
    return () => {
      if (loopTimeout.current !== null) {
        window.clearTimeout(loopTimeout.current);
      }
    };
  }, []);

  const handleVideoEnded = () => {
    if (loopTimeout.current !== null) {
      window.clearTimeout(loopTimeout.current);
    }

    loopTimeout.current = window.setTimeout(() => {
      const element = videoRef.current;
      if (element && isVideoVisible) {
        element.currentTime = 0;
        void element.play().catch(() => undefined);
      }
      loopTimeout.current = null;
    }, 5000);
  };

  return (
    <div
      className="landing-showcase-video"
      ref={ref}
      // SAFETY: Custom property keys are absent from React's CSSProperties, so object literals carrying them require a cast.
      style={{ "--landing-showcase-video-width": width, opacity } as CSSProperties}
    >
      <div className="landing-showcase-browser-bar" aria-hidden="true">
        <div className="landing-showcase-browser-controls">
          <span className="landing-showcase-browser-dot landing-showcase-browser-dot--red" />
          <span className="landing-showcase-browser-dot landing-showcase-browser-dot--yellow" />
          <span className="landing-showcase-browser-dot landing-showcase-browser-dot--green" />
        </div>
        <span className="landing-showcase-browser-url">localhost</span>
      </div>
      <div className="landing-showcase-video-frame">
        <div className="landing-showcase-placeholder" data-visible={!isVideoVisible || !videoReady}>
          <img className="landing-showcase-placeholder-image" src={video.poster} alt="" aria-hidden="true" loading="lazy" />
        </div>
        {shouldLoadVideo ? (
          <video
            className="landing-showcase-video-element"
            ref={videoRef}
            data-ready={isVideoVisible && videoReady}
            aria-label={video.title}
            autoPlay={isVideoVisible}
            muted
            playsInline
            poster={video.poster}
            preload="metadata"
            onError={() => setVideoReady(false)}
            onLoadedData={() => setVideoReady(true)}
            onEnded={handleVideoEnded}
          >
            <source src={video.src} type="video/mp4" />
          </video>
        ) : null}
      </div>
    </div>
  );
}

function DemoShowcase({ controls }: { controls: ShowcaseControls }): ReactNode {
  return (
    <section className="landing-showcase landing-inner" aria-label="Nudge UI demos">
      <div className="landing-showcase-list">
        {showcaseVideos.map((video) => {
          return (
            <article className="landing-showcase-item" key={video.id}>
              <ShowcaseVideo
                animate
                controls={controls}
                video={video}
              />
              <div className="landing-showcase-item-header landing-content-column">
                <h2 className="landing-showcase-item-title">{video.title}</h2>
                <p className="landing-showcase-item-description">{video.description}</p>
                {"bullets" in video ? (
                  <ul className="landing-showcase-item-bullets">
                    {video.bullets.map(({ Icon, label }) => (
                      <li key={label}>
                        <Icon size={18} stroke={1.6} aria-hidden="true" />
                        <span>{label}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function InstallCommand(): ReactNode {
  const [copied, setCopied] = useState(false);
  const copyTimeout = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeout.current !== null) {
        window.clearTimeout(copyTimeout.current);
      }
    };
  }, []);

  const copyPrompt = async () => {
    if (!navigator.clipboard?.writeText) return;

    try {
      await navigator.clipboard.writeText(installPrompt);
      setCopied(true);
      if (copyTimeout.current !== null) {
        window.clearTimeout(copyTimeout.current);
      }
      copyTimeout.current = window.setTimeout(() => {
        setCopied(false);
        copyTimeout.current = null;
      }, 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="landing-install">
      <span className="landing-install-command">{installPrompt}</span>
      <LandingButton
        type="button"
        variant="primary"
        className="landing-install-copy"
        data-copied={copied}
        aria-label={copied ? "Install prompt copied" : "Copy install prompt"}
        onClick={copyPrompt}
      >
        {copied ? "Copied" : "Copy"}
        <span className="landing-install-copy-icon" aria-hidden="true">
          <CopyIcon />
          <DoneIcon />
        </span>
      </LandingButton>
    </div>
  );
}

type LandingButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "tertiary";
};

function LandingButton({ children, className, variant = "primary", ...props }: LandingButtonProps): ReactNode {
  return (
    <button
      {...props}
      className={`landing-button landing-button--${variant}${className ? ` ${className}` : ""}`}
    >
      {children}
    </button>
  );
}

function DemoIntro(): ReactNode {
  const demoRef = useRef<HTMLElement>(null);
  const [isDemoPastTrigger, setIsDemoPastTrigger] = useState(false);

  useEffect(() => {
    const element = demoRef.current;
    if (!element) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const triggerY = element.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.3;
      const nextValue = window.scrollY >= triggerY;
      setIsDemoPastTrigger((current) => current === nextValue ? current : nextValue);
    };
    const scheduleUpdate = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };

    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section
      className="landing-demo landing-inner"
      id="demo"
      ref={demoRef}
      data-arrow-visible={isDemoPastTrigger}
      aria-labelledby="landing-demo-title"
    >
      <span className="landing-demo-arrow" aria-hidden="true">
        <img className="landing-demo-arrow-tail" src={inspectorArrowTail} alt="" />
        <img className="landing-demo-arrow-head" src={inspectorArrowHead} alt="" />
      </span>
      <h2 className="landing-content-column" id="landing-demo-title">Demo</h2>
      <div className="landing-demo-content landing-content-column">
        <p className="landing-demo-description">Open Nudge and try the loop yourself: select any element on this page, make a small change, and see it immediately.</p>
        <LandingButton
          type="button"
          variant="primary"
          aria-controls="nudge-ui-root"
          onClick={() => window.dispatchEvent(new Event(OPEN_NUDGE_EVENT))}
        >
          Open Nudge
          <svg className="landing-button-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 8h9M8 4l4 4-4 4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </LandingButton>

        <div className="landing-demo-examples" aria-label="Editable examples">
          <div className="landing-demo-example">
            <p className="landing-demo-example-text">Edit me</p>
          </div>

          <div className="landing-demo-example">
            <span className="landing-demo-example-badge">Adjust me</span>
          </div>

          <div className="landing-demo-example">
            <div className="landing-demo-example-buttons">
              <LandingButton type="button" variant="primary">Primary</LandingButton>
              <LandingButton type="button" variant="secondary">Secondary</LandingButton>
              <LandingButton type="button" variant="tertiary">Tertiary</LandingButton>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function App(): ReactNode {
  return (
    <>
      <div className="landing" id="top">
        <main>
          <section className="landing-hero landing-inner" aria-labelledby="landing-hero-title">
            <HeroDemoGrid variant="hero" />
            <div className="landing-hero-content landing-content-column">
              <h1 className="landing-content-column" id="landing-hero-title">Nudge, a design panel for your codebase.</h1>
              <div className="landing-hero-side landing-content-column">
                <p className="landing-hero-intro">
                  Nudge works with your <FrameworkName icon={<ReactMark />}>React</FrameworkName>, <FrameworkName icon={<NextMark />}>Next.js</FrameworkName>, <FrameworkName icon={<HtmlMark />}>HTML</FrameworkName> and <FrameworkName icon={<AstroMark />}>Astro</FrameworkName> code. Adjust styles, move elements, change text and adjust tokens directly, then hand off to an agent.
                </p>
                <p className="landing-install-label">Ask your agent to install nudge-ui:</p>
                <InstallCommand />
              </div>
            </div>
          </section>

          <DemoShowcase controls={showcaseControls} />

          <DemoIntro />

          <section className="landing-setup landing-inner" aria-labelledby="landing-setup-title">
            <h2 className="landing-content-column" id="landing-setup-title">Installation</h2>
            <div className="landing-setup-content landing-content-column">
              <div className="landing-setup-step">
                <p className="landing-setup-lead">Detect your framework and configure Nudge UI:</p>
                <pre className="landing-setup-code landing-setup-code--command"><code>npm create nudge-ui@latest</code></pre>
              </div>

              <div className="landing-setup-step">
                <p className="landing-setup-lead">Or just tell your agent to set it up:</p>
                <pre className="landing-setup-code"><code>{installPrompt}</code></pre>
              </div>

              <div className="landing-setup-step">
                <p className="landing-setup-lead">Or install the host adapter manually:</p>
                <pre className="landing-setup-code landing-setup-code--large"><code>{manualSetupCode}</code></pre>
              </div>

              <div className="landing-setup-step">
                <p className="landing-setup-lead">Connect your coding agent:</p>
                <pre className="landing-setup-code"><code>{agentSetupCode}</code></pre>
              </div>

              <p className="landing-setup-note">Configure the agent&apos;s MCP host to run this command, reload it, then ask the agent to call <code>nudge_listen</code> and keep the listener active. That&apos;s it — Nudge can now send the current change directly to your agent.</p>
            </div>
          </section>

          <section className="landing-open-source landing-inner" aria-labelledby="landing-open-source-title">
            <h2 className="landing-content-column" id="landing-open-source-title">Open source</h2>
            <p className="landing-open-source-description landing-content-column">
              Open source because there are more front-end frameworks and libraries than atoms in the universe. If your project setup isn&apos;t supported yet, you can customise and extend to your needs - DIY your own Figma in the browser.
            </p>
            <a className="landing-open-source-link landing-content-column" href="https://github.com/charlessmart/nudge-ui" target="_blank" rel="noreferrer">
              <GitHubIcon />
              <span>View on GitHub</span>
            </a>
          </section>

        </main>

        <footer className="landing-footer">
          <div className="landing-footer-content landing-inner">
            <span>Nudge UI</span>
            <div className="landing-footer-links">
              <a className="landing-footer-social" href="https://github.com/charlessmart/nudge-ui" target="_blank" rel="noreferrer" aria-label="Nudge UI on GitHub">
                <GitHubIcon />
              </a>
              <a href="https://twitter.com/CharlesMSmart" target="_blank" rel="noreferrer">Made by Charles</a>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
