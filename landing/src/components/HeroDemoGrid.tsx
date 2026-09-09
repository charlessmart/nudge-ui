import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import {
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconBaseline,
  IconBuildingBank,
  IconChartLine,
  IconCreditCard,
  IconItalic,
  IconLayoutAlignBottom,
  IconLayoutAlignMiddle,
  IconLayoutAlignTop,
  IconLetterSpacing,
  IconPigMoney,
  IconTextSize,
  IconTypography,
  IconWallet,
} from "@tabler/icons-react";
import healthDataImage from "../../assets/health-data-image.jpg";
import "./HeroDemoGrid.css";

function SearchIcon(): ReactNode {
  return (
    <svg className="landing-hero-demo-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
      <path d="M21 21l-6-6" />
    </svg>
  );
}

function ChevronDownIcon(): ReactNode {
  return (
    <svg className="landing-hero-demo-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ChevronRightIcon(): ReactNode {
  return (
    <svg className="landing-hero-demo-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function CloseIcon(): ReactNode {
  return (
    <svg className="landing-hero-demo-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function PlusIcon(): ReactNode {
  return (
    <svg className="landing-hero-demo-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function UploadIcon(): ReactNode {
  return (
    <svg className="landing-hero-demo-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      <path d="m7 9 5-5 5 5" />
      <path d="M12 4v12" />
    </svg>
  );
}

function ShieldIcon(): ReactNode {
  return (
    <svg className="landing-hero-demo-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3a12 12 0 0 0 8.5 3 12 12 0 0 1-8.5 15A12 12 0 0 1 3.5 6 12 12 0 0 0 12 3Z" />
      <path d="M11 11a1 1 0 1 0 2 0a1 1 0 1 0-2 0Z" />
      <path d="M12 12v2.5" />
    </svg>
  );
}

type TypographyGlyphKind = "font-family" | "font-style" | "font-size" | "line-height" | "letter-spacing";

function TypographyGlyph({ kind }: { kind: TypographyGlyphKind }): ReactNode {
  if (kind === "font-family") {
    return <IconItalic className="landing-hero-demo-type-icon" size={18} stroke={1.35} aria-hidden="true" />;
  }

  if (kind === "font-style") {
    return <IconTypography className="landing-hero-demo-type-icon" size={18} stroke={1.45} aria-hidden="true" />;
  }

  if (kind === "font-size") {
    return <IconTextSize className="landing-hero-demo-type-icon" size={18} stroke={1.55} aria-hidden="true" />;
  }

  if (kind === "line-height") {
    return <IconBaseline className="landing-hero-demo-type-icon" size={18} stroke={1.5} aria-hidden="true" />;
  }

  return <IconLetterSpacing className="landing-hero-demo-type-icon" size={18} stroke={1.5} aria-hidden="true" />;
}

function TypographyField({ kind, value, token = false, trailing = false }: { kind: TypographyGlyphKind; value: string; token?: boolean; trailing?: boolean }): ReactNode {
  return (
    <div className={`landing-hero-demo-type-field${token ? " landing-hero-demo-type-field--token" : ""}`}>
      <span className="landing-hero-demo-type-leading"><TypographyGlyph kind={kind} /></span>
      <span className="landing-hero-demo-type-value">{value}</span>
      {trailing ? <ChevronDownIcon /> : null}
    </div>
  );
}

type AlignmentAxis = "horizontal" | "vertical";
type AlignmentValue = "left" | "center" | "right" | "top" | "middle" | "bottom";

function AlignmentGlyph({ axis, value }: { axis: AlignmentAxis; value: AlignmentValue }): ReactNode {
  const className = `landing-hero-demo-alignment-glyph landing-hero-demo-alignment-glyph--${axis} landing-hero-demo-alignment-glyph--${value}`;

  if (axis === "horizontal" && value === "left") return <IconAlignLeft className={className} size={18} stroke={1.5} aria-hidden="true" />;
  if (axis === "horizontal" && value === "center") return <IconAlignCenter className={className} size={18} stroke={1.5} aria-hidden="true" />;
  if (axis === "horizontal" && value === "right") return <IconAlignRight className={className} size={18} stroke={1.5} aria-hidden="true" />;
  if (axis === "vertical" && value === "top") return <IconLayoutAlignTop className={className} size={18} stroke={1.5} aria-hidden="true" />;
  if (axis === "vertical" && value === "middle") return <IconLayoutAlignMiddle className={className} size={18} stroke={1.5} aria-hidden="true" />;
  return <IconLayoutAlignBottom className={className} size={18} stroke={1.5} aria-hidden="true" />;
}

function TypographyAlignment({ axis, values, selected }: { axis: AlignmentAxis; values: readonly AlignmentValue[]; selected: AlignmentValue }): ReactNode {
  return (
    <div className={`landing-hero-demo-type-alignment landing-hero-demo-type-alignment--${axis}`}>
      {values.map((value) => (
        <span className={`landing-hero-demo-type-alignment-option${value === selected ? " landing-hero-demo-type-alignment-option--selected" : ""}`} key={value}>
          <AlignmentGlyph axis={axis} value={value} />
        </span>
      ))}
    </div>
  );
}

function BankMark({ color, icon, label, large = false, wireframe = false }: { color: string; icon?: ReactNode; label?: string; large?: boolean; wireframe?: boolean }): ReactNode {
  return (
    <span
      className={`landing-hero-demo-bank-mark${large ? " landing-hero-demo-bank-mark--large" : ""}`}
      style={wireframe ? undefined : { backgroundColor: color }}
      aria-hidden="true"
    >
      {icon ?? label}
    </span>
  );
}

function ConnectOption({
  description,
  icon,
  marks,
  title,
  wireframe = false,
}: {
  description: string;
  icon: ReactNode;
  marks?: Array<{ color: string; label: string }>;
  title: string;
  wireframe?: boolean;
}): ReactNode {
  return (
    <div className="landing-hero-demo-connect-option">
      <div className="landing-hero-demo-bank-marks">
        {marks?.map((mark) => <BankMark key={`${mark.color}-${mark.label}`} {...mark} wireframe={wireframe} />)}
        {!marks ? <span className="landing-hero-demo-bank-mark landing-hero-demo-bank-mark--large">{icon}</span> : null}
      </div>
      <div className="landing-hero-demo-row landing-hero-demo-row--between landing-hero-demo-connect-option-footer">
        <div className="landing-hero-demo-column landing-hero-demo-column--tight">
          <div className="landing-hero-demo-heading landing-hero-demo-heading--small">{title}</div>
          <div className="landing-hero-demo-body landing-hero-demo-body--muted">{description}</div>
        </div>
        <ChevronRightIcon />
      </div>
    </div>
  );
}

function ConnectModalDemo({ wireframe = false }: { wireframe?: boolean } = {}): ReactNode {
  return (
    <article className={`landing-hero-demo-board landing-hero-demo-board--connect${wireframe ? " landing-hero-demo-board--wireframe" : ""}`} aria-label="Add accounts">
      {wireframe ? <WireframeMeasure label="24px" /> : null}
      <div className="landing-hero-demo-row landing-hero-demo-row--between">
        <div className="landing-hero-demo-heading landing-hero-demo-heading--medium">Add accounts</div>
        <div className="landing-hero-demo-icon-button"><CloseIcon /></div>
      </div>

      <div className="landing-hero-demo-search">
        <SearchIcon />
        <span>Search 13,000+ institutions</span>
      </div>

      <div className="landing-hero-demo-connect-options">
        <ConnectOption
          description="Choose from supported institutions"
          marks={[
            { color: "#005bb9", label: "01" },
            { color: "#d71e28", label: "02" },
            { color: "#0c76d1", label: "03" },
          ]}
          title="Connect a bank"
          icon={<UploadIcon />}
          wireframe={wireframe}
        />
        <ConnectOption
          description="Brokerage and investment accounts"
          marks={[
            { color: "#368727", label: "04" },
            { color: "#009ddb", label: "05" },
            { color: "#ccff00", label: "06" },
          ]}
          title="Connect an account"
          icon={<UploadIcon />}
          wireframe={wireframe}
        />
        <ConnectOption
          description="Any lender or servicer"
          title="Connect a loan"
          icon={<UploadIcon />}
          wireframe={wireframe}
        />
        <ConnectOption
          description="Something else you own"
          title="Add another asset"
          icon={<PlusIcon />}
          wireframe={wireframe}
        />
      </div>

      <div className="landing-hero-demo-security">
        <ShieldIcon />
        <span>Read-only access · 256-bit encryption · Disconnect anytime</span>
      </div>
    </article>
  );
}

function InstitutionChip({ color, icon, name, wireframe = false }: { color: string; icon: ReactNode; name: string; wireframe?: boolean }): ReactNode {
  return (
    <span className="landing-hero-demo-chip">
      <BankMark color={color} icon={icon} wireframe={wireframe} />
      <span className="landing-hero-demo-body landing-hero-demo-body--strong">{name}</span>
      <ChevronRightIcon />
    </span>
  );
}

function PopularInstitution({ color, icon, name, type, wireframe = false }: { color: string; icon: ReactNode; name: string; type: string; wireframe?: boolean }): ReactNode {
  return (
    <div className="landing-hero-demo-popular-row">
      <BankMark color={color} icon={icon} wireframe={wireframe} />
      <div className="landing-hero-demo-column landing-hero-demo-column--tight landing-hero-demo-popular-copy">
        <div className="landing-hero-demo-body landing-hero-demo-body--strong">{name}</div>
        <div className="landing-hero-demo-popular-type">{type}</div>
      </div>
      <ChevronRightIcon />
    </div>
  );
}

function InstitutionSheetDemo({ wireframe = false }: { wireframe?: boolean } = {}): ReactNode {
  return (
    <article className={`landing-hero-demo-board landing-hero-demo-board--institution${wireframe ? " landing-hero-demo-board--wireframe" : ""}`} aria-label="Link an institution">
      {wireframe ? <WireframeMeasure label="24px" /> : null}
      <div className="landing-hero-demo-column landing-hero-demo-column--tight">
        <div className="landing-hero-demo-row landing-hero-demo-row--between">
          <div className="landing-hero-demo-heading landing-hero-demo-heading--small">Link an institution</div>
          <div className="landing-hero-demo-icon-button"><ChevronDownIcon /></div>
        </div>
        <div className="landing-hero-demo-body landing-hero-demo-body--muted">Pick one to connect — it takes about a minute.</div>
      </div>

      <div className="landing-hero-demo-search">
        <SearchIcon />
        <span>Search institutions</span>
      </div>

      <div className="landing-hero-demo-column landing-hero-demo-column--section">
        <div className="landing-hero-demo-caption">Recent</div>
        <div className="landing-hero-demo-chip-list">
          <InstitutionChip color="#368727" icon={<IconBuildingBank size={14} stroke={2} />} name="Bank account" wireframe={wireframe} />
          <InstitutionChip color="#005bb9" icon={<IconChartLine size={14} stroke={2} />} name="Investment account" wireframe={wireframe} />
          <InstitutionChip color="#0c76d1" icon={<IconCreditCard size={14} stroke={2} />} name="Card account" wireframe={wireframe} />
        </div>
      </div>

      <div className="landing-hero-demo-column landing-hero-demo-column--section">
        <div className="landing-hero-demo-caption">Popular</div>
        <div className="landing-hero-demo-column landing-hero-demo-column--tight">
          <PopularInstitution color="#654ff0" icon={<IconWallet size={16} stroke={2} />} name="Everyday account" type="Banking" wireframe={wireframe} />
          <PopularInstitution color="#00a2c7" icon={<IconChartLine size={16} stroke={2} />} name="Investment account" type="Investing" wireframe={wireframe} />
          <PopularInstitution color="#009ddb" icon={<IconPigMoney size={16} stroke={2} />} name="Savings account" type="Savings" wireframe={wireframe} />
        </div>
      </div>

    </article>
  );
}

function HealthStreamDemo({ wireframe = false }: { wireframe?: boolean } = {}): ReactNode {
  return (
    <article
      className={`landing-hero-demo-board landing-hero-demo-board--health${wireframe ? " landing-hero-demo-board--wireframe" : ""}`}
      style={wireframe ? undefined : ({ "--landing-health-data-image": `url(${healthDataImage})` } as CSSProperties)}
      aria-label="Stream your health data"
    >
      <div className="landing-hero-demo-panel">
        {wireframe ? <WireframeMeasure inset={16} label="16px" placement="right" /> : null}
        <svg className="landing-hero-demo-waveform" viewBox="0 0 448 96" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 60 L52 60 L58 56 L64 60 L68 60 L76 34 L86 78 L94 60 L100 60 L120 60 L172 60 L178 56 L184 60 L188 60" />
          <path className="landing-hero-demo-waveform-active" d="M188 60 L196 34 L206 78 L214 60 L220 60 L240 60 L252 56 L264 60 L276 60 L288 42 L298 72 L308 60 L330 60 L342 56 L354 60 L360 60 L440 60" />
          <circle className="landing-hero-demo-waveform-marker" cx="440" cy="60" r="7" />
          <circle className="landing-hero-demo-waveform-marker-dot" cx="440" cy="60" r="2.5" />
        </svg>
      </div>

      <div className="landing-hero-demo-column landing-hero-demo-column--section">
        <div className="landing-hero-demo-column landing-hero-demo-column--tight">
          <div className="landing-hero-demo-heading landing-hero-demo-heading--medium">Stream your health data</div>
          <div className="landing-hero-demo-body landing-hero-demo-body--muted">A quiet, continuous feed — no manual logging.</div>
        </div>
        <div className="landing-hero-demo-text-button">Learn more</div>
      </div>
    </article>
  );
}

function TypographyDemo({ wireframe = false }: { wireframe?: boolean } = {}): ReactNode {
  return (
    <article className={`landing-hero-demo-board landing-hero-demo-board--typography${wireframe ? " landing-hero-demo-board--wireframe" : ""}`} aria-label="Text inspector controls">
      {wireframe ? <WireframeMeasure label="24px" /> : null}
      <div className="landing-hero-demo-heading landing-hero-demo-heading--small">Text</div>

      <div className="landing-hero-demo-typography">
        <TypographyField kind="font-family" value="--landing-display" token />
        <TypographyField kind="font-style" value="Semibold" trailing />

        <div className="landing-hero-demo-type-metrics">
          <TypographyField kind="font-size" value="24px" />
          <TypographyField kind="line-height" value="1.15" />
          <TypographyField kind="letter-spacing" value="-0.025em" />
        </div>

        <div className="landing-hero-demo-type-alignment-row">
          <TypographyAlignment axis="horizontal" values={["left", "center", "right"]} selected="left" />
          <TypographyAlignment axis="vertical" values={["top", "middle", "bottom"]} selected="middle" />
        </div>
      </div>
    </article>
  );
}

const weeklyBars = [38, 49, 3, 60, 46, 88, 70] as const;
const weeklyDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function WeeklyDistanceDemo({ wireframe = false }: { wireframe?: boolean } = {}): ReactNode {
  return (
    <article className={`landing-hero-demo-board landing-hero-demo-board--weekly${wireframe ? " landing-hero-demo-board--wireframe" : ""}`} aria-label="Weekly distance summary">
      <div className="landing-hero-demo-caption">This week · Aug 31 – Sep 6</div>
      <div className="landing-hero-demo-column landing-hero-demo-weekly-summary">
        <div className="landing-hero-demo-row landing-hero-demo-row--start landing-hero-demo-metric-row">
          <div className="landing-hero-demo-metric">86.3 km</div>
          <span className="landing-hero-demo-positive">+11%</span>
        </div>
        <div className="landing-hero-demo-body landing-hero-demo-body--muted">
          11 km above your 8-week average
          {wireframe ? <WireframeMeasure inset={16} label="16px" placement="between" /> : null}
        </div>
      </div>
      <div className="landing-hero-demo-column landing-hero-demo-column--section">
        <div className="landing-hero-demo-day-bars">
          {weeklyBars.map((height, index) => (
            <span
              className={`landing-hero-demo-day-bar${index === weeklyBars.length - 1 ? " landing-hero-demo-day-bar--current" : ""}`}
              key={`${height}-${index}`}
              style={{ height: `${height}px` }}
            />
          ))}
        </div>
        <div className="landing-hero-demo-day-labels">
          {weeklyDays.map((day) => <span key={day}>{day}</span>)}
        </div>
      </div>
    </article>
  );
}

function WireframeMeasure({
  inset = 24,
  label,
  placement = "left",
}: {
  inset?: number;
  label: string;
  placement?: "between" | "left" | "right";
}): ReactNode {
  return (
    <div
      className={`landing-hero-demo-wireframe-measure landing-hero-demo-wireframe-measure--${placement}`}
      style={{ "--landing-hero-demo-wireframe-measure-inset": `${inset}px` } as CSSProperties}
    >
      <span />
      <strong>{label}</strong>
    </div>
  );
}

function WireframeConnectDemo(): ReactNode {
  return <ConnectModalDemo wireframe />;
}

function WireframeInstitutionDemo(): ReactNode {
  return <InstitutionSheetDemo wireframe />;
}

function WireframeHealthDemo(): ReactNode {
  return <HealthStreamDemo wireframe />;
}

function WireframeTypographyDemo(): ReactNode {
  return <TypographyDemo wireframe />;
}

function WireframeWeeklyDemo(): ReactNode {
  return <WeeklyDistanceDemo wireframe />;
}

const heroDemos = [
  { id: "institution-sheet", render: InstitutionSheetDemo, wireframe: WireframeInstitutionDemo },
  { id: "health-stream", render: HealthStreamDemo, wireframe: WireframeHealthDemo },
  { id: "typography", render: TypographyDemo, wireframe: WireframeTypographyDemo },
  { id: "weekly-distance", render: WeeklyDistanceDemo, wireframe: WireframeWeeklyDemo },
] as const;

export function HeroDemoGrid({ variant = "hero" }: { variant?: "hero" | "review" }): ReactNode {
  const [revealedDemos, setRevealedDemos] = useState<Set<string>>(() => new Set());

  return (
    <div className={`landing-hero-demo-grid landing-hero-demo-grid--${variant}`} aria-hidden="true">
      {heroDemos.map(({ id, render: Demo, wireframe: Wireframe }, index) => (
        <div
          className={`landing-hero-demo landing-hero-demo--${id}${revealedDemos.has(id) ? " landing-hero-demo--revealed" : ""}`}
          key={id}
          style={{ "--landing-hero-demo-reveal-delay": `${900 + index * 520}ms` } as CSSProperties}
        >
          <div className="landing-hero-demo-board-layer landing-hero-demo-board-layer--wireframe">
            <Wireframe />
          </div>
          <div
            className="landing-hero-demo-board-layer landing-hero-demo-board-layer--full"
            onAnimationEnd={() => setRevealedDemos((current) => {
              if (current.has(id)) return current;
              const next = new Set(current);
              next.add(id);
              return next;
            })}
          >
            <Demo />
          </div>
        </div>
      ))}
    </div>
  );
}
