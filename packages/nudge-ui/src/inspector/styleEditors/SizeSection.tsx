import { useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { IconAspectRatio, IconChevronDown, IconLetterH, IconLetterW, IconMinus } from "@tabler/icons-react";
import type { ResolvedProperty, TokenEntry } from "../../css/model/index.ts";
import { TokenField } from "../tokens/TokenField.tsx";
import { setStyle } from "../tokens/editActions.ts";
import { measureAspectRatio } from "./aspectRatioLock.ts";
import { SIZE_LIMIT_RESET_VALUES, type SizeLimitProperty } from "./cssValue.ts";
import { meaningfulLayoutValue } from "./layoutValue.ts";
import { IconMaxHeight, IconMaxWidth, IconMinHeight, IconMinWidth } from "./SizeLimitIcons.tsx";
import { hasChildPlacementOverrides, hasSizeOverride } from "./hiddenSizeOverrides.ts";
import { inlineBlockedBy } from "./inlineAuthored.ts";
import { useFieldVisibility } from "./useFieldVisibility.ts";
import { IconButton } from "../ui/IconButton.tsx";
import { FieldRow } from "../ui/FieldRow.tsx";
import { ControlSurface } from "../ui/ControlSurface.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import { inlineStyleWarningContent } from "../ui/InlineStyleWarning.tsx";
import { PopoverListbox, type PopoverListboxItem } from "../ui/PopoverListbox.tsx";
import type { EditTarget } from "../selection/editTarget.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";

const SIZE_PRESETS = ["auto", "0", "100%", "fit-content"];
const MIN_SIZE_PRESETS = ["0", "min-content", "fit-content"];
const MAX_WIDTH_PRESETS = ["none", "100%", "100vw", "fit-content"];
const MAX_HEIGHT_PRESETS = ["none", "100%", "100vh", "fit-content"];

type SizeLimit = SizeLimitProperty;
type SizeSetting = SizeLimit | "child-placement";

const LIMIT_PRESETS = {
  "min-width": MIN_SIZE_PRESETS,
  "min-height": MIN_SIZE_PRESETS,
  "max-width": MAX_WIDTH_PRESETS,
  "max-height": MAX_HEIGHT_PRESETS,
} satisfies Record<SizeLimit, string[]>;

type SizeField = "width" | "height" | SizeLimit;

/** The icon at the start of each size field. */
const SIZE_FIELD_ICONS = {
  width: <IconLetterW size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />,
  height: <IconLetterH size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />,
  "min-width": <IconMinWidth />,
  "max-width": <IconMaxWidth />,
  "min-height": <IconMinHeight />,
  "max-height": <IconMaxHeight />,
} satisfies Record<SizeField, ReactElement>;

function settingLabel(setting: SizeLimit): string {
  return setting.replace("-", " ");
}

export interface SizeSectionProps {
  /** The flex or grid item controls, offered with the height options and shown once an item property is set. */
  childPlacement?: { kind: "flex" | "grid"; controls: ReactNode } | null;
  domElement: HTMLElement;
  editTarget: EditTarget;
  selection?: StyleSelection | null;
  entries: TokenEntry[];
  tokenRows: ResolvedProperty[];
  onAfterEdit?: () => void;
}

interface SizeOptionsMenuProps {
  label: string;
  dataTest: string;
  items: PopoverListboxItem[];
  onAdd: (setting: SizeLimit) => void;
}

/** The chevron inside a width or height field; each item reveals one more size field. */
function SizeOptionsMenu({ label, dataTest, items, onAdd }: SizeOptionsMenuProps): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <PopoverListbox
      query=""
      open={open}
      triggerElement={(
        <IconButton variant="quiet" size="compact" label={label} data-test={dataTest}>
          <IconChevronDown size={16} stroke={1.8} aria-hidden="true" />
        </IconButton>
      )}
      triggerDataTest={dataTest}
      triggerAriaLabel={label}
      items={items}
      popupWidth="fit"
      onQueryChange={() => undefined}
      onOpenChange={setOpen}
      onSelect={(value) => {
        // SAFETY: the menu is built only from size limits, and each item reports its own value back.
        onAdd(value as SizeLimit);
        setOpen(false);
      }}
    />
  );
}

export function SizeSection({ domElement: el, editTarget, selection, entries, tokenRows, onAfterEdit, childPlacement = null }: SizeSectionProps): ReactElement {
  const elements = selection?.domElements ?? [el];
  const aspectRatioSet = hasSizeOverride(el, "aspect-ratio");
  // A setting shows when the element already has a value for it or when it was added, and stays while it is edited.
  const visibility = {
    "min-width": useFieldVisibility(elements, "min-width", hasSizeOverride(el, "min-width")),
    "max-width": useFieldVisibility(elements, "max-width", hasSizeOverride(el, "max-width")),
    "min-height": useFieldVisibility(elements, "min-height", hasSizeOverride(el, "min-height")),
    "max-height": useFieldVisibility(elements, "max-height", hasSizeOverride(el, "max-height")),
    "child-placement": useFieldVisibility(
      elements,
      "child-placement",
      childPlacement !== null && hasChildPlacementOverrides(el, { flexChild: childPlacement.kind === "flex", gridChild: childPlacement.kind === "grid" }),
    ),
  };
  const shown = (setting: SizeSetting): boolean => visibility[setting].visible;

  // The browser may not report a ratio just written until it recalculates, so a click keeps its own state until the CSS it read changes.
  const [lockState, setLockState] = useState({ element: el, observed: aspectRatioSet, active: aspectRatioSet });
  if (lockState.element !== el || lockState.observed !== aspectRatioSet) {
    // Follow the CSS again: the selection changed, or an edit or undo happened elsewhere.
    setLockState({ element: el, observed: aspectRatioSet, active: aspectRatioSet });
  }
  const locked = lockState.element === el && lockState.observed === aspectRatioSet ? lockState.active : aspectRatioSet;
  const multipleSelected = elements.length > 1;
  const lockBlockedBy = inlineBlockedBy(elements, "aspect-ratio");
  const measuredRatio = measureAspectRatio(el);
  const lockDisabled = multipleSelected || lockBlockedBy !== null || (!locked && measuredRatio === null);
  const lockExplanation = multipleSelected
    ? "Select a single element to lock its aspect ratio"
    : lockBlockedBy === null && measuredRatio === null && !locked
      ? "The element has no measurable size"
      : undefined;

  // The inspector may not have re-read a value just written, so edits made here are remembered for removal.
  const edited = useRef({ element: el, properties: new Set<string>() });
  if (edited.current.element !== el) edited.current = { element: el, properties: new Set() };
  function afterEdit(property: string): void {
    edited.current.properties.add(property);
    onAfterEdit?.();
  }

  /** The limits stay in the menu, dimmed once shown. The child controls leave it instead. */
  function limitItems(limits: readonly SizeLimit[]): PopoverListboxItem[] {
    return limits.map((setting) => ({
      value: setting,
      label: `Add ${settingLabel(setting)}`,
      "data-test": `layout-size-add-${setting}`,
      disabled: shown(setting),
    }));
  }

  const widthItems = limitItems(["min-width", "max-width"]);
  const heightItems = limitItems(["min-height", "max-height"]);

  function removeLimit(property: SizeLimit): void {
    // Only a value that is set needs writing; removing an untouched, just-added field changes nothing.
    if (hasSizeOverride(el, property) || edited.current.properties.has(property)) {
      setStyle(editTarget, property, SIZE_LIMIT_RESET_VALUES[property]);
      edited.current.properties.delete(property);
      onAfterEdit?.();
    }
    visibility[property].hide();
  }

  /** Locks the size to the element's own proportions, or gives the ratio back to the element's own sizing. */
  function toggleAspectRatioLock(): void {
    if (locked) {
      setStyle(editTarget, "aspect-ratio", "auto");
    } else {
      if (measuredRatio === null) return;
      setStyle(editTarget, "aspect-ratio", measuredRatio);
    }
    setLockState({ element: el, observed: aspectRatioSet, active: !locked });
    onAfterEdit?.();
  }

  function renderTokenField(property: SizeField, presets: readonly string[], trailing?: ReactElement): ReactElement {
    return (
      <ControlSurface className="layout__size-field">
        <TokenField
          property={property}
          selection={selection}
          tokenRow={tokenRows.find((row) => row.property === property) ?? null}
          initialValue={meaningfulLayoutValue(el, property)}
          domElement={el}
          editTarget={editTarget}
          entries={entries}
          suggestions={presets}
          leading={SIZE_FIELD_ICONS[property]}
          trailing={trailing}
          onAfterEdit={() => afterEdit(property)}
        />
      </ControlSurface>
    );
  }

  function renderLimit(property: SizeLimit): ReactElement {
    const blockedBy = inlineBlockedBy(elements, property);
    return (
      <FieldRow
        key={property}
        label={property}
        data-test={`layout-size-${property}`}
        className={`layout__size-cell layout__size-cell--${property}`}
      >
        {renderTokenField(property, LIMIT_PRESETS[property], (
          <Tooltip content={inlineStyleWarningContent(blockedBy)}>
            <IconButton
              variant="quiet"
              size="compact"
              label={`Remove ${settingLabel(property)}`}
              data-test={`layout-size-remove-${property}`}
              disabled={blockedBy !== null}
              onClick={() => removeLimit(property)}
            >
              <IconMinus size={16} stroke={1.8} aria-hidden="true" />
            </IconButton>
          </Tooltip>
        ))}
      </FieldRow>
    );
  }

  return (
    <div className="layout__size" data-test="layout-size">
      <div className="layout__size-grid">
        <FieldRow label="Width" hideLabel data-test="layout-size-width" className="layout__size-cell layout__size-cell--width">
          {renderTokenField("width", SIZE_PRESETS, (
            <SizeOptionsMenu label="Width options" dataTest="layout-size-width-options" items={widthItems} onAdd={(setting) => visibility[setting].show()} />
          ))}
        </FieldRow>
        <FieldRow label="Height" hideLabel data-test="layout-size-height" className="layout__size-cell layout__size-cell--height">
          {renderTokenField("height", SIZE_PRESETS, (
            <SizeOptionsMenu label="Height options" dataTest="layout-size-height-options" items={heightItems} onAdd={(setting) => visibility[setting].show()} />
          ))}
        </FieldRow>
        <div className="layout__size-cell layout__size-cell--lock">
          <Tooltip content={lockBlockedBy !== null ? inlineStyleWarningContent(lockBlockedBy) : lockExplanation}>
            <IconButton
              variant="quiet"
              label={locked ? "Unlock aspect ratio" : "Lock aspect ratio"}
              data-test="layout-size-lock"
              data-active={locked ? "true" : "false"}
              aria-pressed={locked}
              disabled={lockDisabled}
              onClick={toggleAspectRatioLock}
            >
              <IconAspectRatio size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
            </IconButton>
          </Tooltip>
        </div>
      </div>
      {shown("min-width") || shown("min-height") ? (
        <div className="layout__size-grid">
          {shown("min-width") ? renderLimit("min-width") : null}
          {shown("min-height") ? renderLimit("min-height") : null}
        </div>
      ) : null}
      {shown("max-width") || shown("max-height") ? (
        <div className="layout__size-grid">
          {shown("max-width") ? renderLimit("max-width") : null}
          {shown("max-height") ? renderLimit("max-height") : null}
        </div>
      ) : null}
      {childPlacement && shown("child-placement") ? childPlacement.controls : null}
    </div>
  );
}
