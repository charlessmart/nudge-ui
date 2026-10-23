import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { IconDeviceDesktop, IconLinkOff } from "@tabler/icons-react";
import type { TokenEntry } from "../../css/model/index.ts";
import {
  applyValueEdit,
  isCalcExpression,
  normalizeOpacityPercent,
  selectTokens,
} from "../../css/value-semantics/index.ts";
import type { AtRuleContext, ColorOpacity, ColorValueFacts, ResolvedProperty } from "../../css/model/index.ts";
import type { TokenSemanticSlot } from "../../css/value-semantics/index.ts";
import { promoteToToken, swapToken } from "./editActions.ts";
import { setStyle } from "./editActions.ts";
import { completeCssValue } from "../styleEditors/completeCssValue.ts";
import { deriveActiveTokenName, isExpressionRow } from "../styleEditors/fieldValue.ts";
import {
  canNudgeCssValueByDrag,
  nudgeCssValue,
  nudgeCssValueByDrag,
  nudgeOpacityValue,
  supportsDragNudge,
} from "../styleEditors/nudgeValue.ts";
import { valuePolicyFor } from "../styleEditors/valuePolicy.ts";
import { IconButton } from "../ui/IconButton.tsx";
import { PopoverListbox, type PopoverListboxItem } from "../ui/PopoverListbox.tsx";
import { ColorSwatch } from "../ui/ColorSwatch.tsx";
import { getStateStyleValue } from "../shell/stateValue.ts";
import type { StyleEditMetadata } from "./editActions.ts";
import { AtRuleIndicator, useFieldAtRules } from "../ui/AtRuleContext.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import { cx } from "../ui/classNames.ts";
import { TokenChip } from "./TokenChip.tsx";
import { startDragPointerLock } from "./dragPointerLock.ts";
import { createChangeHistoryGroup } from "../workspace/timeline.ts";
import { isMultiTarget, targetElements, type EditTarget } from "../selection/editTarget.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";
import { inlineBlockedBy } from "../styleEditors/inlineAuthored.ts";
import { InlineStyleWarning } from "../ui/InlineStyleWarning.tsx";
import { isMacPlatform } from "../shell/shortcuts.ts";
import { cssFontFamilyName, requestSystemFonts, useSystemFonts, type SystemFontsState } from "../runtime/systemFonts.ts";
import { startValuePreview } from "../styleEditors/valuePreview.ts";

export interface TokenValueFieldProps {
  property: string;
  /** Supplies the numeric nudge policy instead of `property` for composite slots. */
  nudgeProperty?: string;
  domElement?: HTMLElement;
  semanticSlot?: TokenSemanticSlot;
  committedValue: string;
  resolvedValue?: string;
  activeTokenName?: string | null;
  entries: TokenEntry[];
  suggestions?: ReadonlyArray<string>;
  inputDataTest?: string;
  allowedTokenNames?: ReadonlySet<string>;
  isColor?: boolean;
  disabled?: boolean;
  mixed?: boolean;
  formatRawValue?: (value: string) => string;
  onCommitRaw(value: string): void;
  onSelectToken(token: TokenEntry): boolean | void;
  onUnlink(value: string): void;
  /** Shows a highlighted choice on the page until the highlight moves or the list closes; null ends it. */
  onPreviewValue?(value: string | null): void;
  /** Referenced tokens used for raw color-field behavior; not rendered inline. */
  attributionTokens?: string[];
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  label?: string;
  opacity?: ColorOpacity;
  color?: ColorValueFacts;
  onCommitOpacity?(value: string): boolean | void;
  atRules?: readonly AtRuleContext[];
  blockedBy?: string | null;
  inlineWarningDataTest?: string;
  inlineWarningTooltipDataTest?: string;
}

export interface TokenFieldProps {
  property: string;
  semanticSlot?: TokenSemanticSlot;
  tokenRow?: ResolvedProperty | null;
  selection?: StyleSelection | null;
  initialValue?: string;
  /** Normalized value shown when an authored row is not token-backed. */
  displayValue?: string;
  domElement: HTMLElement;
  /** Optional group target. `domElement` remains the primary inspection node. */
  editTarget?: EditTarget;
  entries: TokenEntry[];
  suggestions?: ReadonlyArray<string>;
  inputDataTest?: string;
  onAfterEdit?: () => void;
  editMetadata?: StyleEditMetadata;
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  label?: string;
  formatRawValue?: (value: string) => string;
  disabled?: boolean;
  /** Shows a mixed value without accidentally committing the placeholder. */
  mixed?: boolean;
  attributionTokens?: string[];
  inlineWarningDataTest?: string;
  inlineWarningTooltipDataTest?: string;
  /** Sees each committed raw value first; returning true means the caller handled it and nothing is written. */
  interceptRaw?: (value: string) => boolean;
}

const NON_COLOR_FACTS: ColorValueFacts = { hasEmbeddedAlpha: false, isExpression: false, opacityEditable: false };

function colorFacts(value: string): ColorValueFacts {
  return selectTokens({
    entries: [{ name: "--nudge-ui-preview", value, source: "runtime" }],
  }).candidates[0]?.color ?? NON_COLOR_FACTS;
}

function tokenGroup(entry: TokenEntry) {
  return selectTokens({ entries: [entry] }).candidates[0]?.group ?? "generic";
}

function computedRaw(el: HTMLElement, property: string): string {
  const value = getStateStyleValue(el, property);
  if (property !== "line-height") return value;
  return lineHeightPercentage(value, getStateStyleValue(el, "font-size")) ?? value;
}

function structuredBorderValue(property: string, row: ResolvedProperty | null | undefined): string | null {
  const structure = row?.structure;
  if (!structure) return null;
  if (property.endsWith("-width")) return structure.width;
  if (property.endsWith("-style")) return structure.style;
  if (property.endsWith("-color")) return structure.color;
  return null;
}

function lineHeightPercentage(lineHeight: string, fontSize: string): string | null {
  const lineHeightPx = parsePixels(lineHeight);
  const fontSizePx = parsePixels(fontSize);
  if (lineHeightPx === null || fontSizePx === null || fontSizePx === 0) return null;
  return `${formatNumber((lineHeightPx / fontSizePx) * 100)}%`;
}

function parsePixels(value: string): number | null {
  const match = /^([+-]?(?:(?:\d+\.?\d*)|(?:\.\d+)))px$/i.exec(value.trim());
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isFinite(number) ? number : null;
}

function formatNumber(value: number): string {
  return String(Number(value.toFixed(12)));
}

const NUMERIC_VALUE = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|vh|vw|vmin|vmax|%|ch|ex|cm|mm|in|pt|pc)?$/i;

/** A token that is a plain number or length reads best as its value; others, such as colors and fonts, read as their name. */
function isNumericTokenValue(value: string): boolean {
  return NUMERIC_VALUE.test(value.trim());
}

function stripCssUnit(value: string): string {
  return value.replace(/^(-?\d+(?:\.\d+)?)(px|rem|em|vh|vw|vmin|vmax|%|ch|ex|cm|mm|in|pt|pc)$/i, "$1");
}

interface DragNudgeState {
  commit: ReturnType<typeof createChangeHistoryGroup>;
  pointerLock?: ReturnType<typeof startDragPointerLock>;
  handle: HTMLSpanElement;
  pointerId: number;
  lastClientX: number;
  deltaX: number;
  startValue: string;
  lastValue: string;
  shiftActive: boolean;
  shiftSnapPending: boolean;
}

function releasePointerCapture(state: DragNudgeState): void {
  try {
    if (state.handle.hasPointerCapture?.(state.pointerId)) {
      state.handle.releasePointerCapture(state.pointerId);
    }
  } catch {
    // The browser may release capture before pointerup/pointercancel arrives.
  }
}

/** First family in a CSS family list; commas inside var() fallbacks are ignored. */
function primaryFontFamily(value: string): string {
  let depth = 0;
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < value.length; index++) {
    const char = value[index]!;
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "(") depth++;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (char === "," && depth === 0) return value.slice(0, index).trim();
  }
  return value.trim();
}

function rgbToHex(value: string): string | null {
  const rgb = value.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)/i);
  const srgb = rgb ? null : value.match(/^color\(\s*srgb\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)/i);
  const channels = rgb ? [rgb[1], rgb[2], rgb[3]].map(Number) : srgb ? [srgb[1], srgb[2], srgb[3]].map((part) => Number(part) * 255) : null;
  if (!channels || channels.some((channel) => !Number.isFinite(channel))) return null;
  return `#${channels
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function colorValueToHex(value: string): string | null {
  const trimmed = value.trim();
  const hex = trimmed.match(/^#([\da-f]{4}|[\da-f]{8})$/i);
  if (hex) {
    const raw = hex[1]!;
    const rgb = raw.length === 4 ? raw.slice(0, 3).split("").map((part) => part + part).join("") : raw.slice(0, 6);
    return `#${rgb}`.toLowerCase();
  }
  if (/^#([\da-f]{3}|[\da-f]{6})$/i.test(trimmed)) {
    const short = trimmed.match(/^#([\da-f])([\da-f])([\da-f])$/i);
    if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
    return trimmed.toLowerCase();
  }
  const directRgb = rgbToHex(trimmed);
  if (directRgb) return directRgb;
  if (typeof document === "undefined") return null;

  const probe = document.createElement("span");
  probe.setAttribute("data-nudge-ui", "value-probe");
  probe.style.color = "";
  probe.style.color = trimmed;
  if (!probe.style.color) return null;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return rgbToHex(resolved);
}

function browserRecognizesColor(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || /var\(/i.test(trimmed) || typeof document === "undefined") return false;
  const probe = document.createElement("span");
  probe.setAttribute("data-nudge-ui", "value-probe");
  probe.style.color = "";
  probe.style.color = trimmed;
  return probe.style.color !== "";
}

function NativeColorSwatch({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange(value: string): void;
  disabled?: boolean;
}): ReactElement {
  const resolvedHex = colorValueToHex(value);
  const hex = resolvedHex ?? "#000000";
  const cssColor = browserRecognizesColor(value) ? value.trim() : resolvedHex;
  const hasRenderableColor = cssColor !== null;
  return (
    <label className="token-color-control" data-resolved={hasRenderableColor ? "true" : "false"}>
      {/* The native picker holds six-digit hex only, so the swatch keeps the alpha-bearing color. */}
      <ColorSwatch color={cssColor ?? "transparent"} data-test="token-color-swatch" />
      <input
        className="token-color-control__input"
        data-test="token-color-input"
        type="color"
        value={hex}
        disabled={disabled}
        aria-label="Choose color"
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function TokenValueField(props: TokenValueFieldProps): ReactElement {
  const {
    property,
    nudgeProperty = property,
    domElement,
    semanticSlot,
    committedValue,
    resolvedValue = committedValue,
    activeTokenName: controlledTokenName = null,
    entries,
    suggestions = [],
    inputDataTest = "raw-input",
    allowedTokenNames,
    isColor = false,
    disabled = false,
    mixed = false,
    formatRawValue = (value) => value.trim(),
    onCommitRaw,
    onSelectToken,
    onUnlink,
    onPreviewValue,
    attributionTokens = [],
    leading,
    trailing,
    className,
    label,
    opacity,
    color,
    onCommitOpacity,
    atRules,
    blockedBy = null,
    inlineWarningDataTest,
    inlineWarningTooltipDataTest,
  } = props;
  const fieldDisabled = disabled || blockedBy !== null;
  const inheritedAtRules = useFieldAtRules(property);
  const fieldAtRules = atRules ?? inheritedAtRules;
  const controlledToken = controlledTokenName ? entries.find((entry) => entry.name === controlledTokenName) : null;
  const authoredColor = isColor
    ? color ?? colorFacts(committedValue)
    : NON_COLOR_FACTS;
  const controlledTokenColor = isColor && controlledToken
    ? colorFacts(controlledToken.value)
    : null;
  const controlledTokenHasEmbeddedAlpha = Boolean(isColor && controlledTokenName
    && (controlledTokenColor?.hasEmbeddedAlpha || (!opacity && authoredColor.hasEmbeddedAlpha)));
  const defaultOpacityValue = isColor && !controlledTokenHasEmbeddedAlpha ? "100%" : "";
  const [rawValue, setRawValue] = useState(committedValue);
  const [opacityValue, setOpacityValue] = useState(opacity?.value ?? defaultOpacityValue);
  const [activeTokenName, setActiveTokenName] = useState<string | null>(controlledTokenName);
  const [isFocused, setIsFocused] = useState(false);
  const [isTokenPickerOpen, setTokenPickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedFromPopover = useRef(false);
  const cancelOnBlur = useRef(false);
  const isNavigatingSuggestions = useRef(false);
  const dragNudgeRef = useRef<DragNudgeState | null>(null);
  /** A drag that changed the value ends in a click on the handle, which must not also open the token picker. */
  const dragNudgedRef = useRef(false);
  const [isDraggingNudge, setIsDraggingNudge] = useState(false);
  const listsSystemFonts = property === "font-family";
  const systemFonts = useSystemFonts(listsSystemFonts && (isFocused || isTokenPickerOpen));
  const listOpen = isFocused || isTokenPickerOpen;
  const previewValueRef = useRef(onPreviewValue);
  previewValueRef.current = onPreviewValue;

  // A closed or unmounted list leaves nothing previewed.
  useEffect(() => {
    if (!listOpen) previewValueRef.current?.(null);
  }, [listOpen]);
  useEffect(() => () => previewValueRef.current?.(null), []);

  useEffect(() => {
    setRawValue(committedValue);
    setActiveTokenName(controlledTokenName);
    setOpacityValue(opacity?.value ?? defaultOpacityValue);
  }, [committedValue, controlledTokenName, defaultOpacityValue, mixed, opacity?.value, property]);

  const activeToken = activeTokenName
    ? entries.find((entry) => entry.name === activeTokenName) ?? { name: activeTokenName, value: resolvedValue, source: "runtime" }
    : null;
  const activeTokenColor = isColor && activeToken
    ? colorFacts(activeToken.value)
    : null;
  const activeTokenHasEmbeddedAlpha = Boolean(isColor && activeToken
    && (activeTokenColor?.hasEmbeddedAlpha || (!opacity && activeTokenName === controlledTokenName && authoredColor.hasEmbeddedAlpha)));
  const showOpacity = isColor && !activeTokenHasEmbeddedAlpha
    && authoredColor.opacityEditable
    && (Boolean(activeTokenName) || attributionTokens.length === 0 || Boolean(opacity));
  // Classification costs up to three CSS.supports calls per token, so it runs once per entries change.
  const groupByTokenName = useMemo(() => {
    const groups = new Map<string, string>();
    for (const entry of entries) groups.set(entry.name, tokenGroup(entry));
    return groups;
  }, [entries]);
  const relevantTokens = useMemo(() => {
    const candidates = allowedTokenNames
      ? entries.filter((entry) => allowedTokenNames.has(entry.name))
      : selectTokens({
        element: domElement,
        property,
        slot: semanticSlot,
        entries,
        currentToken: activeTokenName,
      }).candidates.map(({ entry }) => entry);
    return candidates.filter((entry) => entry.name !== property);
  }, [activeTokenName, allowedTokenNames, domElement, entries, property, semanticSlot]);
  const filteredTokens = useMemo(() => {
    const target = rawValue.toLowerCase();
    return relevantTokens.filter((entry) => !target
      || entry.name.toLowerCase().includes(target)
      || entry.value.toLowerCase().includes(target));
  }, [rawValue, relevantTokens]);
  const availableSuggestions = useMemo(() => {
    return Array.from(new Set(suggestions));
  }, [suggestions]);
  // An untouched field browses every family; typing filters them.
  const fontQuery = rawValue === committedValue ? "" : rawValue;
  const fontItems = useMemo(
    () => listsSystemFonts ? systemFontItems(systemFonts, fontQuery) : [],
    [fontQuery, listsSystemFonts, systemFonts],
  );
  // The token picker's search filters these itself.
  const pickerFontItems = useMemo(
    () => listsSystemFonts ? systemFontItems(systemFonts, "") : [],
    [listsSystemFonts, systemFonts],
  );

  function handleSuggestionSelect(value: string): void {
    if (value === SYSTEM_FONTS_REQUEST_VALUE) {
      requestSystemFonts();
      return;
    }
    onPreviewValue?.(null);
    if (value === DETACH_VALUE) {
      handleDelink();
      return;
    }
    const rawSuggestion = decodeRawSuggestion(value);
    if (rawSuggestion !== null) {
      selectedFromPopover.current = true;
      cancelOnBlur.current = false;
      const formatted = formatRawValue(rawSuggestion);
      setActiveTokenName(null);
      setRawValue(formatted);
      onCommitRaw(formatted);
      return;
    }
    const chosen = relevantTokens.find((entry) => entry.name === value);
    if (chosen) handleTokenSelect(chosen);
  }

  function commitRawValue(value = rawValue): void {
    if (fieldDisabled) return;
    if (mixed && value.trim().toLowerCase() === "mixed") return;
    const formatted = formatRawValue(value);
    if (!formatted) {
      setRawValue(committedValue);
      return;
    }
    setRawValue(formatted);
    setActiveTokenName(null);
    onCommitRaw(formatted);
  }

  function handleDelink(): void {
    // Unlinking must preserve the complete authored color expression and its alpha.
    const value = opacity ? committedValue : activeToken?.value || resolvedValue || committedValue;
    setActiveTokenName(null);
    setRawValue(value);
    onUnlink(value);
  }

  function handleTokenSelect(chosen: TokenEntry): void {
    selectedFromPopover.current = true;
    cancelOnBlur.current = false;
    if (onSelectToken(chosen) === false) return;
    setActiveTokenName(chosen.name);
    setRawValue(chosen.value);
  }

  function handleRawBlur(): void {
    if (selectedFromPopover.current) {
      selectedFromPopover.current = false;
      setIsFocused(false);
      return;
    }
    if (!cancelOnBlur.current) commitRawValue();
    cancelOnBlur.current = false;
    setIsFocused(false);
  }

  function handleRawKeyDown(event: React.KeyboardEvent): void {
    const direction = arrowDirection(event.key);
    if (direction && !event.altKey && !event.ctrlKey && !event.metaKey) {
      const next = property === "opacity"
        ? nudgeOpacityValue(rawValue, direction, event.shiftKey)
        : nudgeCssValue(nudgeProperty, rawValue, direction, event.shiftKey);
      if (next) {
        event.preventDefault();
        event.stopPropagation();
        isNavigatingSuggestions.current = false;
        setRawValue(next);
        setActiveTokenName(null);
        onCommitRaw(next);
        return;
      }
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      isNavigatingSuggestions.current = true;
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setRawValue(committedValue);
      cancelOnBlur.current = true;
      setIsFocused(false);
      inputRef.current?.blur();
    } else if (event.key === "Enter" && !isNavigatingSuggestions.current) {
      event.preventDefault();
      event.stopPropagation();
      setIsFocused(false);
      inputRef.current?.blur();
    }
  }

  const stopDragNudge = useCallback(() => {
    const drag = dragNudgeRef.current;
    if (!drag) return;
    dragNudgeRef.current = null;
    drag.pointerLock?.stop();
    releasePointerCapture(drag);
    setIsDraggingNudge(false);
  }, []);

  useEffect(() => {
    const stopOnWindowBlur = (): void => stopDragNudge();
    window.addEventListener("blur", stopOnWindowBlur);
    return () => {
      window.removeEventListener("blur", stopOnWindowBlur);
      stopDragNudge();
    };
  }, [stopDragNudge]);

  function handleDragNudgePointerDown(event: React.PointerEvent<HTMLSpanElement>): void {
    if (event.button !== 0) return;
    if (fieldDisabled || !supportsDragNudge(nudgeProperty)) return;
    if (!canNudgeCssValueByDrag(nudgeProperty, rawValue)) return;

    stopDragNudge();
    dragNudgedRef.current = false;
    const handle = event.currentTarget;
    const drag: DragNudgeState = {
      commit: createChangeHistoryGroup(),
      handle,
      pointerId: event.pointerId,
      lastClientX: event.clientX,
      deltaX: 0,
      startValue: rawValue,
      lastValue: rawValue,
      shiftActive: event.shiftKey,
      shiftSnapPending: event.shiftKey,
    };
    dragNudgeRef.current = drag;
    if (typeof handle.setPointerCapture === "function") handle.setPointerCapture(event.pointerId);
    if (event.pointerType === "mouse") {
      drag.pointerLock = startDragPointerLock(handle, { x: event.clientX, y: event.clientY }, (mouseEvent) => {
        updateDragNudge(mouseEvent, mouseEvent.movementX);
      }, stopDragNudge);
    }
    setIsDraggingNudge(true);
    event.preventDefault();
    event.stopPropagation();
  }

  function handleDragNudgePointerMove(event: React.PointerEvent<HTMLSpanElement>): void {
    const drag = dragNudgeRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.pointerLock?.isLocked()) return;

    const movementX = event.clientX - drag.lastClientX;
    drag.lastClientX = event.clientX;
    updateDragNudge(event, movementX);
  }

  function updateDragNudge(event: MouseEvent | React.PointerEvent<HTMLSpanElement>, movementX: number): void {
    const drag = dragNudgeRef.current;
    if (!drag) return;
    if (event.shiftKey !== drag.shiftActive) {
      drag.shiftActive = event.shiftKey;
      drag.startValue = drag.lastValue;
      drag.deltaX = 0;
      drag.shiftSnapPending = event.shiftKey;
    }
    drag.deltaX += movementX;
    const next = nudgeCssValueByDrag(
      nudgeProperty,
      drag.startValue,
      drag.deltaX,
      drag.shiftActive,
      drag.shiftActive && drag.shiftSnapPending,
    );
    if (next === null || next === drag.lastValue) return;
    drag.lastValue = next;
    if (drag.shiftActive && drag.shiftSnapPending) {
      drag.startValue = next;
      drag.deltaX = 0;
      drag.shiftSnapPending = false;
    }
    event.preventDefault();
    event.stopPropagation();
    dragNudgedRef.current = true;
    setRawValue(next);
    setActiveTokenName(null);
    drag.commit(() => onCommitRaw(next));
  }

  function handleDragNudgePointerEnd(event: React.PointerEvent<HTMLSpanElement>): void {
    if (dragNudgeRef.current?.pointerId !== event.pointerId) return;
    stopDragNudge();
  }

  /** `onActivate` makes the icon a larger target for whatever the field's main control opens. */
  function renderLeading(onActivate?: () => void): ReactElement | null {
    if (!leading) return null;
    const canDrag = !fieldDisabled
      && supportsDragNudge(nudgeProperty)
      && canNudgeCssValueByDrag(nudgeProperty, rawValue);
    const activate = onActivate && !fieldDisabled ? onActivate : undefined;
    if (!canDrag) {
      return (
        <span className={cx("token-field__leading", activate && "token-field__leading--activate")} onClick={activate}>
          {leading}
        </span>
      );
    }
    return (
      <span
        className="token-field__leading token-field__leading--nudge"
        data-test="nudge-handle"
        data-dragging={isDraggingNudge ? "true" : undefined}
        onPointerDown={handleDragNudgePointerDown}
        onPointerMove={handleDragNudgePointerMove}
        onPointerUp={handleDragNudgePointerEnd}
        onPointerCancel={handleDragNudgePointerEnd}
        onBlur={stopDragNudge}
        onClick={activate && (() => {
          if (dragNudgedRef.current) {
            dragNudgedRef.current = false;
            return;
          }
          activate();
        })}
      >
        {leading}
      </span>
    );
  }

  function commitOpacityValue(value = opacityValue): void {
    if (fieldDisabled || !showOpacity || !onCommitOpacity) return;
    const normalized = normalizeOpacityPercent(value);
    if (normalized === null) {
      setOpacityValue(opacity?.value ?? "100%");
      return;
    }
    if (onCommitOpacity(normalized) === false) {
      setOpacityValue(opacity?.value ?? defaultOpacityValue);
      return;
    }
    setOpacityValue(normalized);
  }

  const opacityControl = showOpacity ? (
    <input
      className="token-opacity-input"
      data-test="color-opacity-input"
      type="text"
      inputMode="decimal"
      value={opacityValue}
      disabled={fieldDisabled || !onCommitOpacity}
      aria-label={`Opacity for ${property}`}
      onChange={(event) => setOpacityValue(event.target.value)}
      onBlur={() => commitOpacityValue()}
      onKeyDown={(event) => {
        const direction = arrowDirection(event.key);
        if (direction && !event.altKey && !event.ctrlKey && !event.metaKey) {
          const next = nudgeOpacityValue(opacityValue, direction, event.shiftKey);
          if (next) {
            event.preventDefault();
            event.stopPropagation();
            setOpacityValue(next);
            commitOpacityValue(next);
            return;
          }
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setOpacityValue(opacity?.value ?? "100%");
          event.currentTarget.blur();
        } else if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  ) : null;

  const colorPreview = activeToken ? resolvedValue || activeToken.value : resolvedValue || rawValue;
  const colorControlEl = isColor ? (
    <NativeColorSwatch
      value={colorPreview}
      disabled={fieldDisabled}
      onChange={(value) => commitRawValue(value)}
    />
  ) : null;

  const rawSuggestionItems = availableSuggestions.map(rawSuggestion);
  const handleHighlight = onPreviewValue
    ? (value: string | null) => onPreviewValue(value === null ? null : previewValueFor(value))
    : undefined;

  if (activeToken) {
    const numericToken = isNumericTokenValue(activeToken.value);
    const chipValue = numericToken ? stripCssUnit(activeToken.value) : activeToken.name;
    return (
      <span
        className={cx(
          "token-field",
          isColor && "token-field--color",
          isColor && "token-field--color-chip",
          blockedBy !== null && "token-field--blocked",
          className,
        )}
        data-test="token-field"
        data-property={property}
        aria-disabled={fieldDisabled || undefined}
        aria-label={label}
      >
        <TokenChip data-group={groupByTokenName.get(activeToken.name) ?? tokenGroup(activeToken)}>
          {renderLeading(() => setTokenPickerOpen(true))}
          <PopoverListbox
            query=""
            value={activeToken.name}
            open={isTokenPickerOpen}
            trigger={(
              <TokenChip.Picker>
                {colorControlEl}
                <TokenChip.Label title={numericToken ? activeToken.name : undefined}>
                  {chipValue}
                </TokenChip.Label>
              </TokenChip.Picker>
            )}
            triggerClassName="token-chip__trigger"
            triggerDataTest="token-chip"
            triggerAriaLabel={`Change ${property} token`}
            searchable
            searchPlaceholder="Search tokens…"
            searchAriaLabel="Search tokens"
            searchOnKeyDown={(event) => {
              if (fieldDisabled || !isDetachKey(event)) return;
              event.preventDefault();
              event.stopPropagation();
              setTokenPickerOpen(false);
              handleDelink();
            }}
            items={[
              detachItem(),
              ...rawSuggestionItems,
              ...relevantTokens.map((entry) => tokenSuggestion(entry, groupByTokenName)),
              ...pickerFontItems,
            ]}
            onQueryChange={() => undefined}
            onOpenChange={setTokenPickerOpen}
            disabled={fieldDisabled}
            onSelect={(value) => {
              handleSuggestionSelect(value);
            }}
            onHighlight={handleHighlight}
          />
          <TokenChip.Action>
            <Tooltip stableTrigger>
              <IconButton
                variant="quiet"
                size="compact"
                style={{ borderRadius: "var(--radius-4)" }}
                label="Detach token"
                data-test="delink-btn"
                disabled={fieldDisabled}
                onClick={handleDelink}
              >
                <IconLinkOff size={14} stroke={1.75} aria-hidden="true" />
              </IconButton>
            </Tooltip>
          </TokenChip.Action>
        </TokenChip>
        {opacityControl}
        <AtRuleIndicator atRules={fieldAtRules} />
        {trailing ? <span className="token-field__trailing">{trailing}</span> : null}
        <InlineStyleWarning
          blockedBy={blockedBy}
          dataTest={inlineWarningDataTest}
          tooltipDataTest={inlineWarningTooltipDataTest}
        />
      </span>
    );
  }

  const showPopover = isFocused && (filteredTokens.length > 0 || availableSuggestions.length > 0 || fontItems.length > 0);
  return (
    <span
      className={cx(
        "token-field",
        "token-field--raw",
        isColor && "token-field--color",
        blockedBy !== null && "token-field--blocked",
        className,
      )}
      data-test="token-field"
      data-property={property}
      aria-disabled={fieldDisabled || undefined}
      aria-label={label}
    >
      {renderLeading()}
      {colorControlEl}
      <PopoverListbox
        query={rawValue}
        value={null}
        open={showPopover}
        placeholder={property}
        inputRef={inputRef}
        inputAppearance="embedded"
        inputDataTest={inputDataTest}
        inputOnFocus={() => {
          setIsFocused(true);
          if (mixed && rawValue.trim().toLowerCase() === "mixed") setRawValue("");
        }}
        inputOnBlur={handleRawBlur}
        inputOnKeyDown={handleRawKeyDown}
        items={[
          ...availableSuggestions.map(rawSuggestion),
          ...filteredTokens.slice(0, 30).map((entry) => tokenSuggestion(entry, groupByTokenName)),
          ...fontItems,
        ]}
        onQueryChange={(value) => {
          isNavigatingSuggestions.current = false;
          setRawValue(value);
        }}
        onOpenChange={setIsFocused}
        disabled={fieldDisabled}
        onSelect={(value) => {
          handleSuggestionSelect(value);
        }}
        onHighlight={handleHighlight}
      />
      {opacityControl}
      <AtRuleIndicator atRules={fieldAtRules} />
      {trailing ? (
        <span
          className="token-field__trailing"
          data-test="token-field-trailing"
          // The suggestions open on input focus, so the trailing affordance hands focus to the input.
          onMouseDown={(event) => {
            if (fieldDisabled || event.button !== 0) return;
            if (event.target instanceof Element && event.target.closest("button, a, input, [role='button']")) return;
            event.preventDefault();
            inputRef.current?.focus();
          }}
        >
          {trailing}
        </span>
      ) : null}
      <InlineStyleWarning
        blockedBy={blockedBy}
        dataTest={inlineWarningDataTest}
        tooltipDataTest={inlineWarningTooltipDataTest}
      />
    </span>
  );
}

function arrowDirection(key: string): -1 | 1 | null {
  if (key === "ArrowUp") return 1;
  if (key === "ArrowDown") return -1;
  return null;
}

export function TokenField(props: TokenFieldProps): ReactElement {
  const {
    property,
    semanticSlot,
    tokenRow,
    selection,
    initialValue,
    displayValue,
    domElement: el,
    editTarget,
    entries,
    suggestions,
    inputDataTest,
    onAfterEdit,
    editMetadata,
    leading,
    trailing,
    className,
    label,
    formatRawValue: formatRawValueProp,
    disabled = false,
    mixed = false,
    attributionTokens,
    inlineWarningDataTest,
    inlineWarningTooltipDataTest,
    interceptRaw,
  } = props;
  const stopPreview = useRef<(() => void) | null>(null);
  const selectedProperty = selection && selection.elements.length > 1
    ? selection.getProperty(property)
    : null;
  const selectionMixed = selectedProperty?.value.kind === "mixed";
  const effectiveMixed = mixed || selectionMixed;
  const selectionDisplayValue = selectedProperty?.value.kind === "common"
    ? selectedProperty.value.value
    : undefined;
  const effectiveMetadata = editTarget && isMultiTarget(editTarget) ? undefined : editMetadata;
  const blockedBy = inlineBlockedBy(selection?.domElements ?? [el], property);
  const tokenBackedOpacityName = tokenRow?.tokenName
    && tokenRow.opacity
    && tokenRow.opacity.tokenName !== tokenRow.tokenName
    ? tokenRow.tokenName
    : null;
  const expression = isExpressionRow(tokenRow ?? null);
  const authored = tokenRow?.authored ?? tokenRow?.declaredValue ?? "";
  const isCalcAuthored = isCalcExpression(authored);
  const activeTokenName = deriveActiveTokenName({
    row: tokenRow ?? null,
    selectedProperty,
    mixed: effectiveMixed,
    authored,
    override: tokenBackedOpacityName,
  });
  const fallbackValue = initialValue ?? structuredBorderValue(property, tokenRow) ?? computedRaw(el, property);
  // Suppress the chip for calc()-derived values so the UI shows the resolved pixel value, not the internal multiplier token.
  const authoredOrComputed = tokenBackedOpacityName
    ? authored
    : expression || (!activeTokenName && !isCalcAuthored)
    ? structuredBorderValue(property, tokenRow) ?? tokenRow?.authored ?? tokenRow?.declaredValue ?? fallbackValue
    : tokenRow?.resolvedValue ?? fallbackValue;
  const committedValue = effectiveMixed
    ? displayValue ?? "Mixed"
    : displayValue ?? selectionDisplayValue ?? (property === "font-family" && !activeTokenName
      ? primaryFontFamily(authoredOrComputed)
      : authoredOrComputed);
  const currentToken = activeTokenName
    ? entries.find((entry) => entry.name === activeTokenName) ?? null
    : null;
  let resolvedValue = tokenRow?.propertyOpacity?.value ?? tokenRow?.resolvedValue ?? committedValue;
  if (property === "background-color") {
    // Background rows can carry the full computed shorthand; the color control needs its color part.
    const style = el.ownerDocument.createElement("span").style;
    style.background = resolvedValue;
    resolvedValue = style.backgroundColor || resolvedValue;
  }

  return (
    <TokenValueField
      property={property}
      domElement={el}
      semanticSlot={semanticSlot}
      committedValue={committedValue}
      resolvedValue={resolvedValue}
      activeTokenName={activeTokenName}
      attributionTokens={attributionTokens
        ?? (selectedProperty?.token.kind === "mixed" ? ["Mixed tokens"] : undefined)
        ?? (expression
          ? tokenRow?.tokens?.filter((token) => token.name !== tokenRow.opacity?.tokenName).map((token) => token.name)
          : undefined)}
      opacity={tokenRow?.opacity}
      color={tokenRow?.color}
      entries={entries}
      suggestions={suggestions}
      inputDataTest={inputDataTest}
      disabled={disabled}
      blockedBy={blockedBy}
      mixed={effectiveMixed}
      isColor={selectTokens({ property, slot: semanticSlot, entries: [] }).preferredGroup === "color"}
      formatRawValue={(value) => {
        if (formatRawValueProp) return formatRawValueProp(value);
        return completeCssValue(value.trim(), valuePolicyFor(property));
      }}
      onCommitRaw={(value) => {
        if (interceptRaw?.(value)) return;
        if (setStyle(editTarget ?? el, property, value, effectiveMetadata)) onAfterEdit?.();
      }}
      onCommitOpacity={(value) => {
        const authored = tokenRow?.authored ?? tokenRow?.declaredValue ?? committedValue;
        const result = applyValueEdit({ kind: "color-opacity", authored, opacity: value });
        if (!result.ok || !setStyle(editTarget ?? el, property, result.value, effectiveMetadata)) return false;
        onAfterEdit?.();
        return true;
      }}
      onSelectToken={(chosen) => {
        const targetProperty = tokenRow?.property ?? property;
        if (activeTokenName && tokenBackedOpacityName && currentToken) {
          const result = applyValueEdit({
            kind: "color-token",
            authored,
            currentToken,
            nextToken: chosen,
          });
          if (!result.ok || !setStyle(editTarget ?? el, targetProperty, result.value, effectiveMetadata)) return false;
          onAfterEdit?.();
          return true;
        }
        const change = activeTokenName
          ? swapToken(editTarget ?? el, targetProperty, chosen, currentToken, effectiveMetadata)
          : promoteToToken(editTarget ?? el, property, chosen, effectiveMetadata);
        if (!change) return false;
        onAfterEdit?.();
        return true;
      }}
      onUnlink={(value) => {
        setStyle(editTarget ?? el, property, value, effectiveMetadata);
        onAfterEdit?.();
      }}
      onPreviewValue={property === "font-family" && !disabled && !blockedBy ? (value) => {
        // Stops only this field's preview; another field may own the active one.
        stopPreview.current?.();
        stopPreview.current = value === null ? null : startValuePreview(targetElements(editTarget ?? el), property, value);
      } : undefined}
      leading={leading}
      trailing={trailing}
      className={className}
      label={label}
      inlineWarningDataTest={inlineWarningDataTest}
      inlineWarningTooltipDataTest={inlineWarningTooltipDataTest}
    />
  );
}

function tokenSuggestion(entry: TokenEntry, groups: ReadonlyMap<string, string>) {
  return {
    value: entry.name,
    label: entry.name,
    "data-test": "suggestion-item",
    leading: (groups.get(entry.name) ?? tokenGroup(entry)) === "color"
      ? <ColorSwatch color={entry.value} />
      : undefined,
    trailing: <span>{entry.value}</span>,
  };
}

const RAW_SUGGESTION_PREFIX = "\u0000raw:";
const DETACH_VALUE = "\u0000detach";
const SYSTEM_FONTS_REQUEST_VALUE = "\u0000system-fonts";

/** The CSS a list item would commit; actions have none. */
function previewValueFor(itemValue: string): string | null {
  if (itemValue === DETACH_VALUE || itemValue === SYSTEM_FONTS_REQUEST_VALUE) return null;
  return decodeRawSuggestion(itemValue) ?? `var(${itemValue})`;
}

/** Families commit as raw values; until they load, one row asks for them. */
function systemFontItems(state: SystemFontsState, query: string): PopoverListboxItem[] {
  if (state.status === "prompt" || state.status === "loading") {
    return [{
      value: SYSTEM_FONTS_REQUEST_VALUE,
      label: state.status === "loading" ? "Loading system fonts…" : "Show system fonts",
      leading: <IconDeviceDesktop size={14} stroke={1.75} aria-hidden="true" />,
      keepOpen: true,
      "data-test": "system-fonts-request",
    }];
  }
  if (state.status !== "ready") return [];
  const needle = query.replace(/["']/g, "").trim().toLowerCase();
  return state.families
    .filter((family) => !needle || family.toLowerCase().includes(needle))
    .map((family) => {
      const value = cssFontFamilyName(family);
      return {
        value: `${RAW_SUGGESTION_PREFIX}${value}`,
        label: family,
        group: "System fonts",
        "data-test": "system-font-item",
        trailing: <span className="system-font-sample" style={{ fontFamily: `${value}, var(--font-family)` }}>Ag</span>,
      };
    });
}

function detachItem() {
  return {
    value: DETACH_VALUE,
    label: "Detach token",
    "data-test": "detach-token-item",
    leading: <IconLinkOff size={14} stroke={1.75} aria-hidden="true" />,
    trailing: <kbd className="token-shortcut">{isMacPlatform() ? "⌫" : "Del"}</kbd>,
  };
}

function isDetachKey(event: React.KeyboardEvent<HTMLInputElement>): boolean {
  return (event.key === "Backspace" || event.key === "Delete")
    && event.currentTarget.value === ""
    && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

function rawSuggestion(value: string) {
  return {
    value: `${RAW_SUGGESTION_PREFIX}${value}`,
    label: value,
    "data-test": "raw-suggestion-item",
  };
}

function decodeRawSuggestion(value: string): string | null {
  return value.startsWith(RAW_SUGGESTION_PREFIX) ? value.slice(RAW_SUGGESTION_PREFIX.length) : null;
}
