import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import {
  IconBorderBottom,
  IconBorderLeft,
  IconBorderRight,
  IconBorderSides,
  IconBorderStyle2,
  IconBorderTop,
  IconCheck,
  IconMinus,
  IconPlus,
} from "@tabler/icons-react";
import type { TokenEntry } from "virtual:design-tokens";
import type { ResolvedProperty } from "@nudge-ui/css/model";
import { TokenField } from "../tokens/TokenField.tsx";
import type { SelectedElement } from "../selectionStore.ts";
import { setStyle } from "./styleActions.ts";
import { FieldRow } from "../ui/FieldRow.tsx";
import { SideControls, SIDE_NAMES } from "../ui/SideValuesField.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { ToggleButton } from "../ui/ToggleButton.tsx";
import { formatInspectorLabel } from "../ui/labels.ts";
import { getStateStyleValue } from "../stateValue.ts";
import { PopoverListbox } from "../ui/PopoverListbox.tsx";
import { ControlSurface } from "../ui/ControlSurface.tsx";
import { getNudgeUiTokenEntries } from "../runtimeConfig.ts";

const BORDER_STYLES = ["none", "hidden", "solid", "dashed", "dotted", "double", "groove", "ridge", "inset", "outset"];
const INVISIBLE_BORDER_STYLES = new Set(["none", "hidden"]);
const ZERO_WIDTH = /^(?:0|0px|0rem|0em|0%)$/i;
const BORDER_SIDES = SIDE_NAMES.map((side) => `border-${side}`);

function findTokenRow(rows: ResolvedProperty[], prop: string): ResolvedProperty | null {
  return rows.find((r) => r.property === prop) ?? null;
}

function borderStyleValue(el: HTMLElement, rows: ResolvedProperty[], property: string): string {
  const row = findTokenRow(rows, property);
  const structured = row?.structure?.style?.trim();
  if (structured) return structured.toLowerCase();
  const authored = (row?.authored ?? row?.declaredValue ?? "").trim().toLowerCase();
  if (authored && BORDER_STYLES.includes(authored)) return authored;
  return (getStateStyleValue(el, property, "none") || "none").toLowerCase();
}

function borderWidthValue(el: HTMLElement, rows: ResolvedProperty[], property: string): string {
  const row = findTokenRow(rows, property);
  if (row?.structure?.width) return row.structure.width.trim();
  return (
    row?.authored
    || row?.declaredValue
    || row?.resolvedValue
    || getStateStyleValue(el, property, "0px")
    || "0px"
  ).trim();
}

function borderColorValue(el: HTMLElement, rows: ResolvedProperty[], property: string): string {
  const row = findTokenRow(rows, property);
  if (row?.structure?.color) return row.structure.color.trim();
  return (
    row?.authored
    || row?.declaredValue
    || row?.resolvedValue
    || getStateStyleValue(el, property, "currentcolor")
    || "currentcolor"
  ).trim();
}

/** Effective per-side value used to decide linked vs individual UI. */
function sideComponentSignature(
  el: HTMLElement,
  rows: ResolvedProperty[],
  property: string,
): string {
  const row = findTokenRow(rows, property);
  if (property.endsWith("-width")) {
    return `w:${borderWidthValue(el, rows, property).toLowerCase()}|t:${row?.tokenName ?? ""}`;
  }
  if (property.endsWith("-style")) {
    return `s:${borderStyleValue(el, rows, property)}`;
  }
  if (property.endsWith("-color")) {
    return `c:${borderColorValue(el, rows, property).toLowerCase()}|t:${row?.tokenName ?? ""}`;
  }
  return `${row?.authored ?? ""}|${row?.resolvedValue ?? getStateStyleValue(el, property)}`;
}

function sideValueForLink(el: HTMLElement, rows: ResolvedProperty[], property: string, fallback = ""): string {
  if (property.endsWith("-width")) return borderWidthValue(el, rows, property) || fallback;
  if (property.endsWith("-style")) return borderStyleValue(el, rows, property) || fallback;
  if (property.endsWith("-color")) return borderColorValue(el, rows, property) || fallback;
  return fallback;
}

function linkBorderSides(
  el: HTMLElement,
  rows: ResolvedProperty[],
  shorthand: string,
  sideProperties: readonly string[],
  onAfterEdit?: () => void,
): void {
  const sharedValue = sideValueForLink(el, rows, sideProperties[0]!, shorthand === "border-style" ? "solid" : "");
  if (!sharedValue) return;
  setStyle(el, shorthand, sharedValue);
  onAfterEdit?.();
}

function linkedTokenRow(
  rows: ResolvedProperty[],
  shorthand: string,
  sideProperties: readonly string[],
): ResolvedProperty | null {
  const direct = findTokenRow(rows, shorthand);
  if (direct) return direct;
  const first = findTokenRow(rows, sideProperties[0]!);
  return first ? { ...first, property: shorthand } : null;
}

/**
 * Sides are linked when every face shares the same effective component value.
 * Uses structured width/style/color parts (not the full authored shorthand string)
 * so four different `border-*` shorthands correctly expand the UI.
 */
function valuesAreLinked(
  el: HTMLElement,
  rows: ResolvedProperty[],
  shorthand: string,
  sideProperties: readonly string[],
): boolean {
  const hasDirectRow = Boolean(findTokenRow(rows, shorthand));
  const hasSideRows = sideProperties.some((property) => Boolean(findTokenRow(rows, property)));
  // A lone shorthand with no per-side overrides is inherently linked.
  if (hasDirectRow && !hasSideRows) return true;

  const signatures = sideProperties.map((property) => sideComponentSignature(el, rows, property));
  return new Set(signatures).size === 1;
}

function isBorderFaceProperty(property: string): boolean {
  const p = property.toLowerCase();
  return p === "border"
    || p === "border-width"
    || p === "border-style"
    || p === "border-color"
    || /^border-(top|right|bottom|left)(?:-(?:width|style|color))?$/.test(p);
}

function isZeroWidthValue(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (ZERO_WIDTH.test(trimmed)) return true;
  // Structured/preflight authored forms like `0 solid` / `0px solid currentcolor`.
  const first = trimmed.split(/\s+/)[0] ?? "";
  return ZERO_WIDTH.test(first);
}

/** True when a face paints: drawn style and non-zero width. */
function sidePaints(el: HTMLElement, rows: ResolvedProperty[], side: string): boolean {
  const style = borderStyleValue(el, rows, `border-${side}-style`);
  if (INVISIBLE_BORDER_STYLES.has(style)) return false;
  return !isZeroWidthValue(borderWidthValue(el, rows, `border-${side}-width`));
}

/**
 * Show border controls for intentional / painted borders only.
 *
 * Tailwind preflight authors `border: 0 solid` on `*`. That is cascade
 * evidence but not a visible border — hide controls and show + instead.
 *
 * Counts as presence:
 * - any painted face (drawn style + non-zero width)
 * - explicit `none` / `hidden`
 * - authored non-zero width
 */
function hasBorderPresence(el: HTMLElement, rows: ResolvedProperty[]): boolean {
  if (SIDE_NAMES.some((side) => sidePaints(el, rows, side))) return true;

  for (const row of rows) {
    if (!isBorderFaceProperty(row.property) && !row.structure) continue;
    const property = row.property.toLowerCase();
    const authored = (row.authored ?? row.declaredValue ?? "").trim().toLowerCase();
    const structuredStyle = row.structure?.style?.trim().toLowerCase() ?? "";
    const structuredWidth = row.structure?.width?.trim() ?? "";

    if (INVISIBLE_BORDER_STYLES.has(structuredStyle) || INVISIBLE_BORDER_STYLES.has(authored)) {
      return true;
    }
    if (structuredWidth && !isZeroWidthValue(structuredWidth)) return true;
    if ((property === "border-width" || property.endsWith("-width")) && authored && !isZeroWidthValue(authored)) {
      return true;
    }
  }

  // Computed non-zero width without cascade rows (inline / inaccessible sheets).
  if (!isZeroWidthValue(borderWidthValue(el, rows, "border-width"))) return true;
  if (SIDE_NAMES.some((side) => !isZeroWidthValue(borderWidthValue(el, rows, `border-${side}-width`)))) {
    return true;
  }
  return false;
}

export interface BorderEditorProps {
  element: SelectedElement;
  entries?: TokenEntry[];
  tokenRows?: ResolvedProperty[];
  onAfterEdit?: () => void;
}

/**
 * Linked presentation from cascade data + optional user toggle.
 * Divergent faces always open; equal faces start linked but can expand.
 * Linking divergent faces is optimistic until cascade rows catch up.
 */
function useBorderLinkedState(dataLinked: boolean, resetKey: HTMLElement): [boolean, (next: boolean) => void] {
  const [userUnlinked, setUserUnlinked] = useState(false);
  const [userLinked, setUserLinked] = useState(false);

  useEffect(() => {
    setUserUnlinked(false);
    setUserLinked(false);
  }, [resetKey]);

  useEffect(() => {
    if (dataLinked) setUserLinked(false);
    else setUserUnlinked(false);
  }, [dataLinked]);

  const isLinked = dataLinked ? !userUnlinked : userLinked;
  function setLinked(next: boolean): void {
    if (next) {
      setUserUnlinked(false);
      setUserLinked(true);
    } else {
      setUserLinked(false);
      setUserUnlinked(true);
    }
  }
  return [isLinked, setLinked];
}

export function BorderEditor(props: BorderEditorProps): ReactElement {
  const { element, entries, tokenRows = [], onAfterEdit } = props;
  const el = element.domElement;
  const allEntries = entries ?? getNudgeUiTokenEntries();
  const borderWidthProperties = BORDER_SIDES.map((side) => `${side}-width`);
  const borderStyleProperties = BORDER_SIDES.map((side) => `${side}-style`);
  const borderColorProperties = BORDER_SIDES.map((side) => `${side}-color`);

  const borderWidthDataLinked = valuesAreLinked(el, tokenRows, "border-width", borderWidthProperties);
  const borderStyleDataLinked = valuesAreLinked(el, tokenRows, "border-style", borderStyleProperties);
  const borderColorDataLinked = valuesAreLinked(el, tokenRows, "border-color", borderColorProperties);

  const allDataLinked = borderWidthDataLinked && borderStyleDataLinked && borderColorDataLinked;
  const [borderLinked, setBorderLinked] = useBorderLinkedState(allDataLinked, el);

  const borderRow = findTokenRow(tokenRows, "border");
  const hasStructuredBorderRows = tokenRows.some((row) => Boolean(row.structure));
  const rawBorderFallback = Boolean(borderRow && !borderRow.structure && !hasStructuredBorderRows);
  const linkedBorderStyle = borderStyleValue(el, tokenRows, "border-style");
  const showWidthAndColor = !(borderLinked && INVISIBLE_BORDER_STYLES.has(linkedBorderStyle));

  const hasBorder = hasBorderPresence(el, tokenRows);
  const [borderSessionOpen, setBorderSessionOpen] = useState(false);
  useEffect(() => {
    setBorderSessionOpen(false);
  }, [el]);
  useEffect(() => {
    if (hasBorder || rawBorderFallback) setBorderSessionOpen(true);
  }, [hasBorder, rawBorderFallback]);
  const showBorderControls = hasBorder || borderSessionOpen || rawBorderFallback;

  function handleAddBorder(): void {
    setStyle(el, "border", "1px solid");
    setBorderSessionOpen(true);
    onAfterEdit?.();
  }

  function handleRemoveBorder(): void {
    setStyle(el, "border", "0 solid");
    setBorderSessionOpen(false);
    onAfterEdit?.();
  }

  function handleExpand(): void {
    setBorderLinked(false);
  }

  function handleCollapse(): void {
    setBorderLinked(true);
    linkBorderSides(el, tokenRows, "border-style", borderStyleProperties, onAfterEdit);
    linkBorderSides(el, tokenRows, "border-width", borderWidthProperties, onAfterEdit);
    linkBorderSides(el, tokenRows, "border-color", borderColorProperties, onAfterEdit);
  }

  const sideRows = SIDE_NAMES.map((side, index) => ({
    side,
    color: (
      <ControlSurface>
        <TokenField
          property={borderColorProperties[index]!}
          tokenRow={findTokenRow(tokenRows, borderColorProperties[index]!)}
          domElement={el}
          entries={allEntries}
          onAfterEdit={onAfterEdit}
        />
      </ControlSurface>
    ),
    width: (
      <ControlSurface>
        <TokenField
          property={borderWidthProperties[index]!}
          tokenRow={findTokenRow(tokenRows, borderWidthProperties[index]!)}
          domElement={el}
          entries={allEntries}
          onAfterEdit={onAfterEdit}
          chipVariant="small"
        />
      </ControlSurface>
    ),
    style: (
      <BorderStyleSettingsMenu
        property={borderStyleProperties[index]!}
        tokenRow={findTokenRow(tokenRows, borderStyleProperties[index]!)}
        domElement={el}
        dataTest={`border-style-${side}`}
        onAfterEdit={onAfterEdit}
      />
    ),
  }));

  return (
    <div className={`editor`} data-test="border-editor">
      <div className="editor__title-row">
        <div className="editor__title">Border</div>
        {showBorderControls ? (
          <IconButton
            variant="quiet"
            label="Remove Border"
            data-test="remove-border"
            className="border__remove"
            onClick={handleRemoveBorder}
          >
            <IconMinus size={16} aria-hidden="true" />
          </IconButton>
        ) : (
          <IconButton
            variant="quiet"
            label="Add Border"
            data-test="add-border"
            className="border__add"
            onClick={handleAddBorder}
          >
            <IconPlus size={16} aria-hidden="true" />
          </IconButton>
        )}
      </div>
      {showBorderControls && (
        <div className="border" data-expanded={borderLinked ? "false" : "true"}>
          {rawBorderFallback ? (
            <FieldRow label="Border">
              <ControlSurface>
                <TokenField
                  property="border"
                  tokenRow={borderRow}
                  domElement={el}
                  entries={allEntries}
                  onAfterEdit={onAfterEdit}
                />
              </ControlSurface>
            </FieldRow>
          ) : borderLinked ? (
            <div className="border__linked-row">
              {showWidthAndColor ? (
                <>
                  <div className="border__linked-control border__linked-control--color">
                    <ControlSurface>
                      <TokenField
                        property="border-color"
                        tokenRow={linkedTokenRow(tokenRows, "border-color", borderColorProperties)}
                        domElement={el}
                        entries={allEntries}
                        onAfterEdit={onAfterEdit}
                      />
                    </ControlSurface>
                  </div>
                  <div className="border__linked-control border__linked-control--width">
                    <ControlSurface>
                      <TokenField
                        property="border-width"
                        tokenRow={linkedTokenRow(tokenRows, "border-width", borderWidthProperties)}
                        domElement={el}
                        entries={allEntries}
                        onAfterEdit={onAfterEdit}
                        chipVariant="small"
                      />
                    </ControlSurface>
                  </div>
                </>
              ) : null}
              <BorderStyleSettingsMenu
                property="border-style"
                tokenRow={linkedTokenRow(tokenRows, "border-style", borderStyleProperties)}
                domElement={el}
                onAfterEdit={onAfterEdit}
              />
              <ToggleButton
                variant="quiet"
                size="default"
                data-test="border-expand"
                label="Edit Individual Border Sides"
                title="Edit Individual Border Sides"
                pressed={!borderLinked}
                onPressedChange={(pressed) => {
                  if (pressed) handleExpand();
                }}
              >
                <IconBorderSides size={16} aria-hidden="true" />
              </ToggleButton>
            </div>
          ) : (
            <div className="border__expanded">
              <div className="border__expanded-header">
                <span className="side-values__label">{formatInspectorLabel("Individual Sides")}</span>
                <ToggleButton
                  variant="quiet"
                  size="default"
                  data-test="border-collapse"
                  label="Link All Border Sides"
                  title="Link All Border Sides"
                  pressed={!borderLinked}
                  onPressedChange={(pressed) => {
                    if (!pressed) handleCollapse();
                  }}
                >
                  <IconBorderSides size={16} aria-hidden="true" />
                </ToggleButton>
              </div>
              {showWidthAndColor ? (
                <div className="border__side-rows" data-test="border-side-rows">
                  {sideRows.map(({ side, color, width, style }) => (
                    <div
                      className="border__side-row"
                      data-side={side}
                      aria-label={`Border ${formatInspectorLabel(side)}`}
                      key={side}
                    >
                      <BorderSideIndicator side={side} />
                      <div className="border__side-control border__side-control--color">{color}</div>
                      <div className="border__side-control border__side-control--width">{width}</div>
                      {style}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )
        }
      </div>
      )}
    </div>
  );
}

const BORDER_SIDE_ICONS = {
  top: IconBorderTop,
  right: IconBorderRight,
  bottom: IconBorderBottom,
  left: IconBorderLeft,
} as const;

function BorderSideIndicator({ side }: { side: (typeof SIDE_NAMES)[number] }): ReactElement {
  const Icon = BORDER_SIDE_ICONS[side];
  return <Icon className="side-values__icon side-values__side-icon" size={16} aria-hidden="true" />;
}

interface BorderStyleSettingsMenuProps {
  property: string;
  tokenRow?: ResolvedProperty | null;
  domElement: HTMLElement;
  dataTest?: string;
  onAfterEdit?: () => void;
}

function BorderStyleSettingsMenu({ property, tokenRow, domElement: el, dataTest = "border-style-settings", onAfterEdit }: BorderStyleSettingsMenuProps): ReactElement {
  const structured = tokenRow?.structure?.style?.trim().toLowerCase() ?? "";
  const initial = structured || getStateStyleValue(el, property, "none") || "none";
  const [value, setValue] = useState(initial);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setValue(structured || getStateStyleValue(el, property, "none") || "none");
  }, [el, property, structured]);

  function handleChange(next: string): void {
    if (!BORDER_STYLES.includes(next)) return;
    setValue(next);
    setStyle(el, property, next);
    setOpen(false);
    onAfterEdit?.();
  }

  return (
    <PopoverListbox
      query=""
      value={null}
      open={open}
      triggerElement={(
        <IconButton
          variant="quiet"
          size="default"
          label={`Border style: ${formatInspectorLabel(value)}`}
          data-test={dataTest}
          data-current-style={value}
        >
          <IconBorderStyle2 size={16} aria-hidden="true" />
        </IconButton>
      )}
      triggerDataTest={dataTest}
      triggerAriaLabel="Border style settings"
      items={BORDER_STYLES.map((style) => ({
        value: style,
        label: formatInspectorLabel(style),
        leading: style === value ? <IconCheck size={14} stroke={2} aria-hidden="true" /> : undefined,
        "data-test": `border-style-setting-${style}`,
      }))}
      onQueryChange={() => undefined}
      onOpenChange={setOpen}
      onSelect={handleChange}
    />
  );
}
