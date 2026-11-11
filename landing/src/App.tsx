import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { IconArrowUpRight, IconBrandChrome, IconBrandNpm, IconPlayerPlayFilled } from "@tabler/icons-react";
import { FeatureGrid } from "./components/FeatureGrid";
import { HeroDepthReveal } from "./hero-depth/HeroDepthReveal";
import { LandingButton } from "./components/LandingButton";
import { LiveDemoFrame } from "./components/LiveDemoFrame";
import "./page.css";

export const chromeStoreUrl = "https://chromewebstore.google.com/detail/nudge-ui/adhhommjgomlfggojnkkpbaklgplopcm";
export const npmPackageUrl = "https://www.npmjs.com/package/create-nudge-ui";
export const installPrompt = "Run npm create nudge-ui@latest in this project";
export const OPEN_NUDGE_EVENT = "nudge-ui:open";
const githubUrl = "https://github.com/charlessmart/nudge-ui";
const packageUrl = "https://www.npmjs.com/package/nudge-ui";

const manualSetupCode = [
  "Vite + React  nudge-ui/vite",
  "Next.js       nudge-ui/next",
  "Astro         nudge-ui/astro",
  "Static HTML   nudge-ui/static",
].join(String.fromCharCode(10));

export const featuresIntro = {
  title: "Edit the interface directly",
  description: "No more prompting to change padding like a backseat designer. Manipulate the UI directly, on top of your real working code.",
} as const;

export function CopyIcon(): ReactNode {
  return (
    <svg className="landing-install-copy-icon-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="13" height="13" x="9" y="9" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function DoneIcon(): ReactNode {
  return (
    <svg className="landing-install-copy-icon-done" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

export function ChromeIcon(): ReactNode {
  return (
    <svg className="landing-button-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8.00029 0.799805C10.5336 0.799805 12.867 2.13314 14.2003 4.26647H8.00029H7.93363C6.26695 4.33314 4.93363 5.3998 4.46695 6.93316L2.46695 3.3998C3.80029 1.73314 5.80029 0.799805 8.00029 0.799805ZM8.00029 10.5332C6.60029 10.5332 5.53363 9.39982 5.53363 8.06642C5.53363 6.66649 6.66696 5.53314 8.00029 5.53314C9.40029 5.53314 10.467 6.66649 10.467 7.99982C10.5336 9.39982 9.40029 10.5332 8.00029 10.5332ZM6.80029 15.1332C3.40029 14.5332 0.800293 11.5332 0.800293 7.99982C0.800293 6.73316 1.13363 5.53314 1.73363 4.46647L4.60029 9.39982C5.20029 10.7998 6.53363 11.6664 8.00029 11.6664C8.26696 11.6664 8.60029 11.5998 8.86696 11.5332L6.80029 15.1332ZM8.06696 15.1998L10.9336 10.2664C11.467 9.59982 11.7336 8.79982 11.7336 7.99982C11.7336 6.99982 11.3336 6.06647 10.667 5.3998H14.8003C15.1336 6.1998 15.267 7.13316 15.267 7.99982C15.2003 11.9332 12.0003 15.1998 8.06696 15.1998Z" fill="currentColor" />
    </svg>
  );
}

export function ReactMark(): ReactNode {
  return (
    <svg className="landing-stack-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <ellipse cx="12" cy="12" rx="9.5" ry="3.7" stroke="currentColor" strokeWidth="1.35" />
      <ellipse cx="12" cy="12" rx="9.5" ry="3.7" transform="rotate(60 12 12)" stroke="currentColor" strokeWidth="1.35" />
      <ellipse cx="12" cy="12" rx="9.5" ry="3.7" transform="rotate(120 12 12)" stroke="currentColor" strokeWidth="1.35" />
    </svg>
  );
}

export function NextMark(): ReactNode {
  return (
    <svg className="landing-stack-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" fill="currentColor" />
      <path d="M7.5 16V8l8.5 8V8M16 13.5V8" stroke="var(--surface-raised)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HtmlMark(): ReactNode {
  return (
    <svg className="landing-stack-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3.7 3.2h16.6l-1.5 16.1L12 21.4l-6.8-2.1L3.7 3.2Z" fill="currentColor" />
      <path d="M7 7h10l-.3 2H9.2l.2 2h7l-.7 5.6-3.7 1.1-3.7-1.1-.2-2.1 2-.6.1.9 1.8.5 1.8-.5.2-1.8H7.5L7 7Z" fill="var(--surface-raised)" />
    </svg>
  );
}

export function AstroMark(): ReactNode {
  return (
    <svg className="landing-stack-icon" viewBox="0 0 85 107" fill="none" aria-hidden="true">
      <path d="M27.5893 91.1365C22.7555 86.7178 21.3443 77.4335 23.3583 70.7072C26.8503 74.948 31.6888 76.2914 36.7005 77.0497C44.4374 78.2199 52.0358 77.7822 59.2231 74.2459C60.0453 73.841 60.8052 73.3027 61.7036 72.7574C62.378 74.714 62.5535 76.6892 62.3179 78.6996C61.7452 83.5957 59.3086 87.3778 55.4332 90.2448C53.8835 91.3916 52.2437 92.4167 50.6432 93.4979C45.7262 96.8213 44.3959 100.718 46.2435 106.386C46.2874 106.525 46.3267 106.663 46.426 107C43.9155 105.876 42.0817 104.24 40.6844 102.089C39.2086 99.8193 38.5065 97.3081 38.4696 94.5909C38.4511 93.2686 38.4511 91.9345 38.2733 90.6309C37.8391 87.4527 36.3471 86.0297 33.5364 85.9478C30.6518 85.8636 28.37 87.6469 27.7649 90.4554C27.7187 90.6707 27.6517 90.8837 27.5847 91.1341L27.5893 91.1365Z" fill="currentColor" />
      <path d="M0 69.5866C0 69.5866 14.3139 62.6137 28.6678 62.6137L39.4901 29.1204C39.8953 27.5007 41.0783 26.3999 42.4139 26.3999C43.7495 26.3999 44.9325 27.5007 45.3377 29.1204L56.1601 62.6137C73.1601 62.6137 84.8278 69.5866 84.8278 69.5866C84.8278 69.5866 60.5145 3.35233 60.467 3.21944C59.7692 1.2612 58.5911 0 57.0029 0H27.8274C26.2392 0 25.1087 1.2612 24.3634 3.21944C24.3108 3.34983 0 69.5866 0 69.5866Z" fill="currentColor" />
    </svg>
  );
}

export function FrameworkName({ icon, children }: { icon: ReactNode; children: ReactNode }): ReactNode {
  return <span className="landing-framework"><span className="landing-framework-icon">{icon}</span>{children}</span>;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function useInView(
  ref: RefObject<HTMLElement | null>,
  threshold: number,
  { rootMargin = "0px", sticky = false }: { rootMargin?: string; sticky?: boolean } = {},
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
      const inView = entry.isIntersecting && entry.intersectionRatio >= intersectionThreshold;
      if (sticky && !inView) return;
      setIsInView(inView);
      if (sticky && inView) observer.disconnect();
    // The page's own viewport, not the top-level one: when Nudge shows the page in an iframe, the implicit root
    // would be the editor's viewport, the frame would clip every entry, and rootMargin would never apply.
    }, { root: document, rootMargin, threshold: [0, intersectionThreshold] });

    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, rootMargin, sticky, threshold]);

  return isInView;
}

/** The captured Nudge demo in a browser frame. It loads as it nears the viewport and plays while mostly in view. */
function DemoWindow(): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const load = useInView(ref, 0, { rootMargin: "320px 0px", sticky: true });
  const playing = useInView(ref, 0.75);

  return (
    <div className="lp-demo" ref={ref}>
      <div className="lp-demo-bar" aria-hidden="true">
        <span className="lp-demo-dots">
          <span />
          <span />
          <span />
        </span>
        <span className="lp-demo-url">localhost</span>
      </div>
      <div className="lp-demo-body">
        <LiveDemoFrame load={load} playing={playing} title="Nudge editing a music browsing app" />
      </div>
    </div>
  );
}

function openNudge(): void {
  window.dispatchEvent(new Event(OPEN_NUDGE_EVENT));
}

function CopyPromptButton({
  label,
  copiedLabel,
  variant = "secondary",
  className,
  trailingIcon = false,
}: {
  label: string;
  copiedLabel: string;
  variant?: "secondary" | "tertiary";
  className?: string;
  trailingIcon?: boolean;
}): ReactNode {
  const tooltipId = useId();
  const [copied, setCopied] = useState(false);
  const copyTimeout = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeout.current !== null) window.clearTimeout(copyTimeout.current);
    };
  }, []);

  const copyPrompt = async () => {
    if (!navigator.clipboard?.writeText) return;

    try {
      await navigator.clipboard.writeText(installPrompt);
      setCopied(true);
      if (copyTimeout.current !== null) window.clearTimeout(copyTimeout.current);
      copyTimeout.current = window.setTimeout(() => {
        setCopied(false);
        copyTimeout.current = null;
      }, 1600);
    } catch {
      setCopied(false);
    }
  };

  const icon = (
    <span className="landing-install-copy-icon" aria-hidden="true">
      <CopyIcon />
      <DoneIcon />
    </span>
  );

  return (
    <div className="landing-install-copy-wrap">
      <LandingButton
        type="button"
        variant={variant}
        className={`landing-install-copy${className ? ` ${className}` : ""}`}
        data-copied={copied}
        aria-describedby={tooltipId}
        onClick={copyPrompt}
      >
        {trailingIcon ? null : icon}
        {copied ? copiedLabel : label}
        {trailingIcon ? icon : null}
      </LandingButton>
      <span className="landing-install-tooltip" id={tooltipId} role="tooltip">{installPrompt}</span>
    </div>
  );
}

export function InstallCommand(): ReactNode {
  return (
    <div className="landing-install-actions">
      <a className="landing-button landing-button--primary" href={chromeStoreUrl} target="_blank" rel="noreferrer">
        <ChromeIcon />
        Add to Chrome
      </a>
      <CopyPromptButton label="Copy install prompt" copiedLabel="Install prompt copied" />
    </div>
  );
}

export function NudgeMark(): ReactNode {
  return (
    <svg className="lp-logo-mark" viewBox="5 4 35 35" fill="currentColor" aria-hidden="true">
      <path d="M14.7742 6C27.6015 6 38 16.569 38 29.6066V38H30.7742V29.6066C30.7742 20.6251 23.6107 13.3443 14.7742 13.3443H13.2258V38H6V6H14.7742Z" />
      <path d="M39 15.6629C37 11.5 33 7 28.4919 5H39V15.6629Z" />
    </svg>
  );
}

const sections = [
  { id: "top", label: "Overview" },
  { id: "install", label: "Install" },
  { id: "features", label: "Features" },
  { id: "get-started", label: "Get Started" },
] as const;

type SectionId = (typeof sections)[number]["id"];

/** The section nearest the top third of the viewport, for the rail's current link. */
function useCurrentSection(): SectionId {
  const [current, setCurrent] = useState<SectionId>("top");

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const visible = new Map<SectionId, boolean>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) visible.set(entry.target.id as SectionId, entry.isIntersecting);
      const first = sections.find(({ id }) => visible.get(id));
      if (first) setCurrent(first.id);
    }, { root: document, rootMargin: "-30% 0px -60% 0px" });
    for (const { id } of sections) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, []);

  return current;
}

function Rail(): ReactNode {
  const current = useCurrentSection();

  return (
    <header className="lp-rail">
      <a className="lp-logo" href="#top" aria-label="Nudge UI">
        <NudgeMark />
      </a>
      <nav className="lp-nav" aria-label="Page">
        <ul>
          {sections.map(({ id, label }) => (
            <li key={id}>
              <a href={`#${id}`} aria-current={current === id ? "location" : undefined}>{label}</a>
            </li>
          ))}
          <li>
            <a href={githubUrl} target="_blank" rel="noreferrer">
              GitHub
              <IconArrowUpRight className="lp-nav-external" size={14} stroke={1.6} aria-hidden="true" />
            </a>
          </li>
          <li>
            <a href={packageUrl} target="_blank" rel="noreferrer">
              v{__NUDGE_UI_VERSION__}
              <IconArrowUpRight className="lp-nav-external" size={14} stroke={1.6} aria-hidden="true" />
            </a>
          </li>
        </ul>
      </nav>
    </header>
  );
}

/**
 * A hand-drawn arrow that curls back toward the button it annotates. The artwork is drawn pointing up (head top left,
 * tail bottom right), so it is turned a quarter left inside a 36 × 17 box to point at the button; CSS flips it
 * vertically so it curls up from below the note.
 */
function ScribbleArrow(): ReactNode {
  return (
    <svg className="lp-scribble-arrow" viewBox="0 0 36 17" fill="none" aria-hidden="true">
      <g transform="translate(0 17) rotate(-90)">
        <path fill="currentColor" d="M15.8078 35.6027C16.175 34.9366 16.4109 34.3873 16.5155 33.9548C16.62 33.5223 16.7072 33.0644 16.7769 32.581C16.8466 32.0976 16.8989 31.5644 16.9338 30.9816C16.9686 30.3987 16.9895 29.7928 16.9965 29.1637C17.0035 28.5346 17 27.8847 16.986 27.214C16.9721 26.5432 16.9628 25.8713 16.9581 25.1983C16.9535 24.5252 16.943 23.6174 16.9268 22.4748C16.9105 21.3323 16.8768 20.406 16.8257 19.6959C16.7745 18.9859 16.6712 18.2712 16.5155 17.5519C16.3598 16.8326 16.0123 15.8415 15.4731 14.5787C14.934 13.3159 14.4379 12.2913 13.9847 11.5049C13.5315 10.7186 13.0644 9.97607 12.5834 9.27758C12.1023 8.57909 11.6015 7.92806 11.0809 7.3244C10.5604 6.72074 10.0189 6.16216 9.45651 5.6487C8.89412 5.13524 8.38747 4.67615 7.93663 4.27139C7.48578 3.86664 7.08376 3.52319 6.73052 3.24102C6.37728 2.95885 5.99269 2.68474 5.57671 2.41876C5.16072 2.15278 4.69477 1.88454 4.17886 1.61394C3.66295 1.34333 3.17373 1.08081 2.71127 0.826398C2.2488 0.571982 1.86421 0.405476 1.55746 0.326838C1.2507 0.248201 1.0543 0.199573 0.968317 0.18107C0.882332 0.162567 0.813787 0.161407 0.762661 0.177597C0.711535 0.193787 0.645321 0.210025 0.563984 0.226215C0.482645 0.242405 0.422216 0.273636 0.38271 0.319893C0.343203 0.36615 0.292053 0.410054 0.229307 0.451686C0.166561 0.493318 0.127068 0.54882 0.1108 0.618206C0.094532 0.687592 0.0689793 0.750053 0.0341187 0.805562C-0.000740051 0.861071 -0.00889778 0.929331 0.00969505 1.01028C0.028286 1.09123 0.0352783 1.15825 0.0306301 1.21144C0.0259819 1.26464 0.0492039 1.32826 0.10033 1.40227C0.151457 1.47628 0.189831 1.53295 0.215393 1.57227C0.240957 1.61158 0.290897 1.65673 0.365263 1.70762C0.439629 1.7585 0.500057 1.79089 0.546537 1.80477C0.593016 1.81864 0.863739 1.83944 1.35874 1.86719C1.85373 1.89494 2.31507 1.9111 2.74267 1.91572C3.17027 1.92035 3.62228 1.93659 4.09869 1.96434C4.5751 1.99209 4.89347 2.00245 5.05382 1.99551C5.21417 1.98857 5.34315 1.98741 5.44075 1.99204C5.53836 1.99666 5.61735 1.97703 5.67777 1.93309C5.73819 1.88914 5.81023 1.85211 5.89389 1.82204C5.97756 1.79198 6.03798 1.7388 6.07517 1.66247C6.11235 1.58615 6.15767 1.51913 6.21112 1.46131C6.26457 1.40349 6.29362 1.32827 6.29827 1.23575C6.30292 1.14324 6.31336 1.06346 6.32963 0.996391C6.3459 0.929317 6.33545 0.849544 6.29827 0.757029C6.26109 0.664514 6.23204 0.589295 6.21112 0.531473C6.19021 0.473652 6.14489 0.406636 6.07517 0.330311C6.00545 0.253986 5.94502 0.200719 5.89389 0.170652C5.84277 0.140585 5.77073 0.10364 5.67777 0.0596951C5.58481 0.0157506 5.50582 -0.00396639 5.44075 0.000659355C5.37568 0.0052851 5.05847 0.00992439 4.48911 0.0145501C3.91975 0.0191759 3.42591 0.0261348 3.0076 0.0353863C2.58929 0.0446378 2.16051 0.10014 1.72128 0.201906C1.28206 0.303672 0.954403 0.658722 0.738277 1.26701C0.522152 1.87529 0.488441 2.37713 0.637173 2.77263C0.785906 3.16813 0.992744 3.59492 1.25767 4.05287C1.5226 4.51082 1.68295 4.78253 1.73873 4.86811C1.7945 4.95368 1.88049 5.04157 1.99668 5.13178C2.11288 5.22198 2.22325 5.27864 2.32783 5.30177C2.4324 5.3249 2.55443 5.34229 2.69386 5.35386C2.8333 5.36542 2.95528 5.34455 3.05986 5.29135C3.16443 5.23815 3.27252 5.17801 3.38406 5.11094C3.49561 5.04387 3.57926 4.95374 3.63504 4.84041C3.69081 4.72708 3.7408 4.61483 3.78495 4.50381C3.82911 4.39279 3.84072 4.27028 3.8198 4.13613C3.79889 4.00198 3.76984 3.88286 3.73265 3.77878C3.69547 3.6747 3.63038 3.56941 3.53742 3.46302C3.44447 3.35663 3.3492 3.27917 3.2516 3.2306C3.15399 3.18203 3.03896 3.13813 2.9065 3.09881C2.77403 3.05949 2.64968 3.05485 2.53348 3.08492C2.41729 3.11499 2.29997 3.1497 2.18145 3.18902C2.06293 3.22833 1.96067 3.29883 1.87468 3.4006C1.7887 3.50236 1.71549 3.60185 1.65507 3.69899C1.59465 3.79613 1.55744 3.91294 1.5435 4.0494C1.52956 4.18586 1.53189 4.30837 1.55048 4.41708C1.56907 4.52578 1.60973 4.64143 1.67247 4.76401C1.73522 4.88659 1.81192 4.98376 1.90256 5.05546C1.99319 5.12716 2.09661 5.19426 2.21281 5.25671C2.329 5.31916 2.4487 5.35039 2.57186 5.35039C2.69503 5.35039 2.81818 5.34227 2.94135 5.32608C3.06452 5.30989 3.17838 5.2625 3.28296 5.18387C3.38754 5.10523 3.48051 5.02421 3.56185 4.94095C3.64319 4.85768 3.70478 4.75132 3.74661 4.6218C3.78844 4.49228 3.81283 4.37199 3.8198 4.26098C3.82677 4.14996 3.81167 4.02736 3.77448 3.89321C3.7373 3.75906 3.71986 3.69901 3.72219 3.71288C3.72451 3.72676 3.49911 3.47112 3.04594 2.9461C2.59277 2.42107 2.60788 2.15284 3.09126 2.14128C3.57464 2.12971 4.06731 2.1008 4.56928 2.05455C5.07125 2.00829 5.36174 1.98741 5.44075 1.99204C5.51977 1.99666 5.59876 1.97703 5.67777 1.93309C5.75678 1.88914 5.82882 1.85211 5.89389 1.82204C5.95896 1.79198 6.01939 1.7388 6.07517 1.66247C6.13094 1.58615 6.17626 1.51913 6.21112 1.46131C6.24598 1.40349 6.27503 1.32827 6.29827 1.23575C6.32151 1.14324 6.33195 1.06346 6.32963 0.996391C6.32731 0.929317 6.31686 0.849544 6.29827 0.757029C6.27968 0.664514 6.25063 0.589295 6.21112 0.531473C6.17162 0.473652 6.12629 0.406636 6.07517 0.330311C6.02404 0.253986 5.96361 0.200719 5.89389 0.170652C5.82418 0.140585 5.75214 0.10364 5.67777 0.0596951C5.6034 0.0157506 5.52441 -0.00396639 5.44075 0.000659355C5.35709 0.0052851 5.11309 0.00760474 4.70872 0.00760474C4.30436 0.00760474 3.87324 0.0226824 3.41543 0.0527498C2.95761 0.0828171 2.45333 0.110568 1.90256 0.13601C1.35178 0.161451 1.04036 0.176444 0.968317 0.18107C0.896275 0.185696 0.82773 0.184536 0.762661 0.177597C0.69759 0.170659 0.631376 0.186896 0.563984 0.226215C0.49659 0.265534 0.436159 0.296764 0.38271 0.319893C0.32926 0.343022 0.278111 0.386926 0.229307 0.451686C0.180506 0.516446 0.14101 0.571949 0.1108 0.618206C0.0805874 0.664463 0.0550346 0.726924 0.0341187 0.805562C0.0132046 0.8842 0.00504684 0.95246 0.00969505 1.01028C0.0143433 1.0681 0.0213337 1.13512 0.0306301 1.21144C0.0399265 1.28777 0.0631485 1.35139 0.10033 1.40227C0.137514 1.45316 0.175886 1.50982 0.215393 1.57227C0.2549 1.63471 0.30484 1.67986 0.365263 1.70762C0.425686 1.73537 0.486115 1.76776 0.546537 1.80477C0.606958 1.84177 0.760319 1.86256 1.00666 1.86719C1.25299 1.87182 1.59813 1.97354 2.042 2.17245C2.48587 2.37136 2.96577 2.59577 3.48168 2.84556C3.99759 3.09535 4.44261 3.33351 4.81676 3.56017C5.19092 3.78683 5.56161 4.0124 5.92879 4.23675C6.29597 4.4611 6.69916 4.76984 7.13838 5.16303C7.57761 5.55622 8.07028 5.98756 8.6164 6.45707C9.16253 6.92659 9.67263 7.45278 10.1467 8.03563C10.6208 8.61847 11.0972 9.24059 11.5759 9.90207C12.0547 10.5636 12.4985 11.276 12.9075 12.0392C13.3165 12.8025 13.7837 13.7704 14.3089 14.943C14.8341 16.1156 15.1548 17.0419 15.271 17.7219C15.3872 18.4019 15.4731 19.075 15.5289 19.7411C15.5847 20.4072 15.5998 21.3172 15.5742 22.4714C15.5487 23.6255 15.5359 24.5322 15.5359 25.1913C15.5359 25.8505 15.522 26.5189 15.4941 27.1966C15.4662 27.8743 15.4464 28.5068 15.4348 29.0943C15.4232 29.6818 15.3907 30.2577 15.3372 30.822C15.2838 31.3863 15.2175 32.0432 15.1385 32.7925C15.0595 33.5419 14.9352 34.0959 14.7655 34.4544C14.5959 34.8128 14.5087 35.0094 14.5041 35.0441C14.4994 35.0788 14.4867 35.1343 14.4658 35.2106C14.4448 35.287 14.446 35.3436 14.4692 35.3806C14.4925 35.4176 14.5075 35.4732 14.5145 35.5472C14.5215 35.6212 14.5482 35.671 14.5947 35.6964C14.6412 35.7218 14.6807 35.7634 14.7132 35.8212C14.7458 35.8791 14.7923 35.9103 14.8527 35.9149C14.9131 35.9195 14.9677 35.9381 15.0165 35.9705C15.0653 36.0029 15.1211 36.0086 15.1838 35.9878C15.2466 35.9669 15.3035 35.9589 15.3546 35.9635C15.4058 35.9682 15.4581 35.9473 15.5115 35.901C15.565 35.8548 15.6114 35.8213 15.6509 35.8005C15.6904 35.7797 15.7276 35.7368 15.7625 35.6721L15.8078 35.6027Z" />
      </g>
    </svg>
  );
}

function Hero(): ReactNode {
  return (
    <section className="lp-hero" id="top" aria-labelledby="landing-hero-title">
      <div className="lp-hero-content">
        <h1 id="landing-hero-title">Nudge is a design panel for your codebase</h1>
        <p className="lp-hero-intro">
          Nudge works with your <FrameworkName icon={<ReactMark />}>React</FrameworkName>, <FrameworkName icon={<NextMark />}>Next.js</FrameworkName>, <FrameworkName icon={<HtmlMark />}>HTML</FrameworkName> and <FrameworkName icon={<AstroMark />}>Astro</FrameworkName> code.
          <br />
          Adjust styles, move elements, change text and adjust tokens directly, then hand off to an agent.
        </p>
        <div className="lp-hero-actions">
          <button type="button" className="lp-button lp-button--primary" onClick={openNudge}>
            <IconPlayerPlayFilled className="lp-button-icon" size={14} aria-hidden="true" />
            Try it here
          </button>
          <span className="lp-scribble" aria-hidden="true">
            <ScribbleArrow />
            live on this page
          </span>
        </div>
      </div>
      <DemoWindow />
      <HeroDepthReveal />
    </section>
  );
}

function InstallOptions(): ReactNode {
  return (
    <section className="lp-section lp-install" id="install" aria-label="Install options">
      <div className="lp-install-option">
        <IconBrandNpm className="lp-install-icon" size={20} stroke={1.5} aria-hidden="true" />
        <h2 className="lp-install-title">npm package</h2>
        <p className="lp-install-copy">Use your real components, share with collaborators, and iterate on the canvas more deeply.</p>
        <CopyPromptButton label="Copy setup prompt" copiedLabel="Setup prompt copied" className="lp-button lp-button--secondary" trailingIcon />
      </div>
      <span className="lp-install-or lp-hand" aria-hidden="true">or</span>
      <div className="lp-install-option">
        <IconBrandChrome className="lp-install-icon" size={20} stroke={1.5} aria-hidden="true" />
        <h2 className="lp-install-title">Chrome extension</h2>
        <p className="lp-install-copy">
          Edit any page you have open, with no setup.
          <br />
          For quickly adjusting production.
        </p>
        <a className="lp-button lp-button--secondary" href={chromeStoreUrl} target="_blank" rel="noreferrer">
          <ChromeIcon />
          Add to Chrome
        </a>
      </div>
    </section>
  );
}

function Features(): ReactNode {
  return (
    <section className="lp-section lp-features" id="features" aria-labelledby="landing-features-title">
      <div className="lp-section-header">
        <h2 id="landing-features-title">{featuresIntro.title}</h2>
        <p>{featuresIntro.description}</p>
      </div>
      <FeatureGrid />
    </section>
  );
}

function GetStarted(): ReactNode {
  return (
    <section className="lp-section lp-get-started" id="get-started" aria-labelledby="landing-setup-title">
      <div className="lp-section-header">
        <h2 id="landing-setup-title">Get started</h2>
        <p>Run this from your application directory, start your app normally, edit in the browser, then press <strong>Copy prompt</strong> and paste it into your coding agent.</p>
      </div>
      <ol className="lp-steps">
        <li className="lp-step">
          <p>Detect your framework and configure Nudge UI:</p>
          <pre className="lp-code"><code>npm create nudge-ui@latest</code></pre>
        </li>
        <li className="lp-step">
          <p>Or tell your agent to set it up:</p>
          <pre className="lp-code"><code>{installPrompt}</code></pre>
        </li>
        <li className="lp-step">
          <p>Or install the host adapter manually:</p>
          <pre className="lp-code"><code>{manualSetupCode}</code></pre>
        </li>
      </ol>
    </section>
  );
}

function OpenSource(): ReactNode {
  return (
    <section className="lp-section lp-open-source" aria-labelledby="landing-open-source-title">
      <div className="lp-section-header">
        <h2 id="landing-open-source-title">Open source</h2>
        <p>
          Open source because there are more front-end frameworks and libraries than atoms in the universe. If your project setup isn&apos;t supported yet, you can customise and extend to your needs - DIY your own Figma in the browser.
        </p>
      </div>
      <a className="lp-text-link" href={githubUrl} target="_blank" rel="noreferrer">
        View on GitHub
        <IconArrowUpRight size={14} stroke={1.6} aria-hidden="true" />
      </a>
    </section>
  );
}

// Nudge shows the page in its own frame, so a framed page is one being edited rather than read.
const framed = window.self !== window.top;

export function App(): ReactNode {
  return (
    <div className="lp" data-framed={framed || undefined}>
      <Rail />
      <main className="lp-main">
        <Hero />
        <InstallOptions />
        <Features />
        <GetStarted />
        <OpenSource />
        <footer className="lp-footer">
          <span>Nudge UI -</span>
          <a href="https://twitter.com/CharlesMSmart" target="_blank" rel="noreferrer">Made by @Charles</a>
        </footer>
      </main>
    </div>
  );
}
