import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { IconArrowsMaximize, IconArrowsMinimize, IconLetterH, IconLetterW } from "@tabler/icons-react";
import type { ResolvedProperty, TokenEntry } from "../../css/model/index.ts";
import { TokenField } from "../tokens/TokenField.tsx";
import { AspectRatioField } from "./AspectRatioField.tsx";
import { meaningfulLayoutValue } from "./layoutValue.ts";
import { IconButton } from "../ui/IconButton.tsx";
import { FieldRow } from "../ui/FieldRow.tsx";
import { ControlSurface } from "../ui/ControlSurface.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import { getElementComputedStyle, getElementWindow } from "../runtime/domRealm.ts";
import type { EditTarget } from "../selection/editTarget.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";

const PLAIN_PIXEL_VALUE = /^-?\d*\.?\d+px$/;

/** The used pixel size of a dimension, kept current as the element resizes. */
function useResolvedDimension(el: HTMLElement, property: "width" | "height", revision: number): number | null {
  const [resolved, setResolved] = useState<number | null>(() => readResolvedDimension(el, property));
  useEffect(() => {
    const update = (): void => setResolved(readResolvedDimension(el, property));
    update();
    // SAFETY: the element's window is a same-realm Window, and the runtime realm exposes the observer constructors as project-wide globals.
    const { ResizeObserver: ResizeObserverCtor } = getElementWindow(el) as typeof window;
    if (!ResizeObserverCtor) return;
    const observer = new ResizeObserverCtor(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, property, revision]);
  return resolved;
}

function readResolvedDimension(el: HTMLElement, property: "width" | "height"): number | null {
  try {
    const pixels = Number.parseFloat(getElementComputedStyle(el)[property]);
    return Number.isFinite(pixels) ? pixels : null;
  } catch {
    return null;
  }
}

/** Shows the used size beside an authored keyword or expression, so `auto` still tells you how big the element is. */
function ResolvedDimension({ el, property, revision }: { el: HTMLElement; property: "width" | "height"; revision: number }): ReactElement | null {
  const resolved = useResolvedDimension(el, property, revision);
  const authored = meaningfulLayoutValue(el, property).trim();
  if (resolved === null || PLAIN_PIXEL_VALUE.test(authored)) return null;
  // Whole pixels keep the label short enough to sit beside the authored value; the title keeps the exact figure.
  return <span className="layout__resolved" data-test={`layout-resolved-${property}`} title={`${Math.round(resolved * 100) / 100}px`}>{Math.round(resolved)}</span>;
}

const SIZE_PRESETS = ["auto", "0", "100%", "fit-content"];
const MIN_SIZE_PRESETS = ["0", "min-content", "fit-content"];
const MAX_WIDTH_PRESETS = ["none", "100%", "100vw", "fit-content"];
const MAX_HEIGHT_PRESETS = ["none", "100%", "100vh", "fit-content"];

export interface SizeSectionProps {
  domElement: HTMLElement;
  editTarget: EditTarget;
  selection?: StyleSelection | null;
  entries: TokenEntry[];
  tokenRows: ResolvedProperty[];
  revision: number;
  onAfterEdit?: () => void;
}

export function SizeSection({ domElement: el, editTarget, selection, entries, tokenRows, revision, onAfterEdit }: SizeSectionProps): ReactElement {
  const [expanded, setExpanded] = useState(false);

  const fields = [
    { property: "width", presets: SIZE_PRESETS },
    { property: "height", presets: SIZE_PRESETS },
    { property: "min-width", presets: MIN_SIZE_PRESETS },
    { property: "min-height", presets: MIN_SIZE_PRESETS },
    { property: "max-width", presets: MAX_WIDTH_PRESETS },
    { property: "max-height", presets: MAX_HEIGHT_PRESETS },
  ];

  const multipleSelected = (selection?.domElements.length ?? 1) > 1;

  function renderTokenField(property: string, presets: string[]): ReactElement {
    const dimension = property === "width" || property === "height" ? property : null;
    return (
      <ControlSurface className={property === "width" || property === "height" ? "layout__size-field--icon" : undefined}>
        <TokenField
          property={property}
          selection={selection}
          tokenRow={tokenRows.find((row) => row.property === property) ?? null}
          initialValue={meaningfulLayoutValue(el, property)}
          domElement={el}
          editTarget={editTarget}
          entries={entries}
          suggestions={presets}
          leading={property === "width"
            ? <IconLetterW size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
            : property === "height"
              ? <IconLetterH size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
              : undefined}
          trailing={dimension && !multipleSelected ? <ResolvedDimension el={el} property={dimension} revision={revision} /> : undefined}
          onAfterEdit={onAfterEdit}
        />
      </ControlSurface>
    );
  }

  return (
    <div className="layout__size" data-test="layout-size" data-expanded={expanded ? "true" : "false"}>
      <div className="layout__size-grid">
        <FieldRow label="Width" hideLabel data-test="layout-size-width" className="layout__size-cell layout__size-cell--width">
          {renderTokenField("width", SIZE_PRESETS)}
        </FieldRow>
        <FieldRow label="Height" hideLabel data-test="layout-size-height" className="layout__size-cell layout__size-cell--height">
          {renderTokenField("height", SIZE_PRESETS)}
        </FieldRow>
        <Tooltip>
          <IconButton
            className="layout__size-cell layout__size-cell--toggle"
            variant="quiet"
            size="default"
            data-test={expanded ? "layout-size-collapse" : "layout-size-expand"}
            aria-label={expanded ? "Collapse Size Fields" : "Expand Size Fields"}
            label={expanded ? "Collapse Size Fields" : "Expand Size Fields"}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <IconArrowsMinimize size={16} stroke={1.8} aria-hidden="true" />
            ) : (
              <IconArrowsMaximize size={16} stroke={1.8} aria-hidden="true" />
            )}
          </IconButton>
        </Tooltip>
        {expanded && fields.slice(2).map(({ property, presets }) => (
          <FieldRow
            key={property}
            label={property}
            data-test={`layout-size-${property}`}
            className={`layout__size-cell layout__size-cell--${property}`}
          >
            {renderTokenField(property, presets)}
          </FieldRow>
        ))}
        {expanded && (
          <AspectRatioField
            className="layout__size-cell layout__size-cell--aspect-ratio"
            domElement={el}
            editTarget={editTarget}
            selection={selection}
            entries={entries}
            tokenRow={tokenRows.find((row) => row.property === "aspect-ratio") ?? null}
            revision={revision}
            onAfterEdit={onAfterEdit}
          />
        )}
      </div>
    </div>
  );
}

