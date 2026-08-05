import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { IconBorderSides, IconCheck, IconMinus, IconPlus, IconSettings } from "@tabler/icons-react";
import type { TokenEntry } from "virtual:design-tokens";
import { tokens } from "virtual:design-tokens";
import type { ResolvedProperty } from "@design-tool/css/model";
import { TokenField } from "../tokens/TokenField.tsx";
import type { SelectedElement } from "../selectionStore.ts";
import { setStyle } from "./styleActions.ts";
import { FieldRow } from "../ui/FieldRow.tsx";
import { Select } from "../ui/Select.tsx";
import { SideControls, SIDE_NAMES } from "../ui/SideValuesField.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { formatInspectorLabel } from "../ui/labels.ts";
import { getStateStyleValue } from "../stateValue.ts";
import { PopoverListbox } from "../ui/PopoverListbox.tsx";

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
function useBorderLinkedState(dataLinked: boolean, resetKey: unknown): [boolean, (next: boolean) => void] {
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
  const allEntries = entries ?? tokens;
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

  const styleSides = borderStyleProperties.map((property, index) => ({
    side: SIDE_NAMES[index]!,
    control: (
      <BorderStyleControl
        property={property}
        tokenRow={findTokenRow(tokenRows, property)}
        domElement={el}
        onAfterEdit={onAfterEdit}
      />
    ),
  }));

  const widthSides = borderWidthProperties.map((property, index) => ({
    side: SIDE_NAMES[index]!,
    control: (
      <TokenField
        property={property}
        tokenRow={findTokenRow(tokenRows, property)}
        domElement={el}
        entries={allEntries}
        onAfterEdit={onAfterEdit}
      />
    ),
  }));

  const colorSides = borderColorProperties.map((property, index) => ({
    side: SIDE_NAMES[index]!,
    control: (
      <TokenField
        property={property}
        tokenRow={findTokenRow(tokenRows, property)}
        domElement={el}
        entries={allEntries}
        onAfterEdit={onAfterEdit}
      />
    ),
  }));

  return (
    <div className={`dt-editor`} data-test="border-editor">
      <div className="dt-editor__title-row">
        <div className="dt-editor__title">Border</div>
        {showBorderControls ? (
          <IconButton
            variant="quiet"
            label="Remove Border"
            data-test="remove-border"
            className="dt-border__remove"
            onClick={handleRemoveBorder}
          >
            <IconMinus size={16} stroke={1.8} aria-hidden="true" />
          </IconButton>
        ) : (
          <IconButton
            variant="quiet"
            label="Add Border"
            data-test="add-border"
            className="dt-border__add"
            onClick={handleAddBorder}
          >
            <IconPlus size={16} stroke={1.8} aria-hidden="true" />
          </IconButton>
        )}
      </div>
      {showBorderControls && (
        <div className="dt-border" data-expanded={borderLinked ? "false" : "true"}>
          {rawBorderFallback ? (
            <FieldRow label="Border">
              <TokenField
                property="border"
                tokenRow={borderRow}
                domElement={el}
                entries={allEntries}
                onAfterEdit={onAfterEdit}
              />
            </FieldRow>
          ) : borderLinked ? (
            <div className="dt-border__linked-row">
              {showWidthAndColor ? (
                <>
                  <div className="dt-border__linked-control dt-border__linked-control--color">
                    <TokenField
                      property="border-color"
                      tokenRow={linkedTokenRow(tokenRows, "border-color", borderColorProperties)}
                      domElement={el}
                      entries={allEntries}
                      onAfterEdit={onAfterEdit}
                    />
                  </div>
                  <div className="dt-border__linked-control dt-border__linked-control--width">
                    <TokenField
                      property="border-width"
                      tokenRow={linkedTokenRow(tokenRows, "border-width", borderWidthProperties)}
                      domElement={el}
                      entries={allEntries}
                      onAfterEdit={onAfterEdit}
                    />
                  </div>
                </>
              ) : null}
              <BorderStyleSettingsMenu
                property="border-style"
                tokenRow={linkedTokenRow(tokenRows, "border-style", borderStyleProperties)}
                domElement={el}
                onAfterEdit={onAfterEdit}
              />
              <IconButton
                variant="quiet"
                size="default"
                data-test="border-expand"
                label="Edit Individual Border Sides"
                title="Edit Individual Border Sides"
                aria-pressed={!borderLinked}
                data-active={!borderLinked}
                onClick={handleExpand}
              >
                <IconBorderSides size={16} stroke={1.8} aria-hidden="true" />
              </IconButton>
            </div>
          ) : (
            <div className="dt-border__expanded">
              <div className="dt-border__expanded-header">
                <span className="dt-side-values__label">{formatInspectorLabel("Individual Sides")}</span>
                <IconButton
                  variant="quiet"
                  size="default"
                  data-test="border-collapse"
                  label="Link All Border Sides"
                  title="Link All Border Sides"
                  aria-pressed={!borderLinked}
                  data-active={!borderLinked}
                  onClick={handleCollapse}
                >
                  <IconBorderSides size={16} stroke={1.8} aria-hidden="true" />
                </IconButton>
              </div>
              <div className="dt-border__side-group" data-test="border-style-sides" data-property="border-style">
                <span className="dt-side-values__label">{formatInspectorLabel("Border Style")}</span>
                <SideControls label="Border Style" sides={styleSides} />
              </div>
              {showWidthAndColor ? (
                <>
                  <div className="dt-border__side-group" data-test="border-sides" data-property="border-width">
                    <span className="dt-side-values__label">{formatInspectorLabel("Border Width")}</span>
                    <SideControls label="Border Width" sides={widthSides} />
                  </div>
                  <div className="dt-border__side-group" data-test="border-color-sides" data-property="border-color">
                    <span className="dt-side-values__label">{formatInspectorLabel("Border Color")}</span>
                    <SideControls label="Border Color" sides={colorSides} />
                  </div>
                </>
              ) : null}
            </div>
          )
        }
      </div>
      )}
    </div>
  );
}

interface BorderStyleSettingsMenuProps {
  property: string;
  tokenRow?: ResolvedProperty | null;
  domElement: HTMLElement;
  onAfterEdit?: () => void;
}

function BorderStyleSettingsMenu({ property, tokenRow, domElement: el, onAfterEdit }: BorderStyleSettingsMenuProps): ReactElement {
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
          size="compact"
          label={`Border style: ${formatInspectorLabel(value)}`}
          data-test="border-style-settings"
          data-current-style={value}
        >
          <IconSettings size={16} stroke={1.8} aria-hidden="true" />
        </IconButton>
      )}
      triggerDataTest="border-style-settings"
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

interface BorderStyleControlProps {
  property: string;
  tokenRow?: ResolvedProperty | null;
  domElement: HTMLElement;
  onAfterEdit?: () => void;
}

function BorderStyleControl({ property, tokenRow, domElement: el, onAfterEdit }: BorderStyleControlProps): ReactElement {
  const structured = tokenRow?.structure?.style?.trim().toLowerCase() ?? "";
  const initial = structured || getStateStyleValue(el, property, "none") || "none";
  const [value, setValue] = useState(initial);

  useEffect(() => {
    setValue(structured || getStateStyleValue(el, property, "none") || "none");
  }, [el, property, structured]);

  function handleChange(next: string): void {
    setValue(next);
    setStyle(el, property, next);
    onAfterEdit?.();
  }

  return (
    <Select
      data-test={property === "border-style" ? "border-style" : `border-style-${property.slice("border-".length, -"-style".length)}`}
      value={value}
      options={BORDER_STYLES.map((style) => ({ value: style, label: formatInspectorLabel(style) }))}
      onValueChange={handleChange}
    />
  );
}
