import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { IconLinkOff } from "@tabler/icons-react";
import type { TokenEntry } from "virtual:design-tokens";
import {
  applyValueEdit,
  normalizeOpacityPercent,
  selectTokens,
} from "@design-tool/css/value-semantics";
import type { AtRuleContext, ColorOpacity, ColorValueFacts, ResolvedProperty } from "@design-tool/css/model";
import type { TokenSemanticSlot } from "@design-tool/css/value-semantics";
import { promoteToToken, swapToken } from "./editActions.ts";
import { setStyle } from "../styleEditors/styleActions.ts";
import { completeCssValue } from "../styleEditors/completeCssValue.ts";
import { nudgeCssValue, nudgeOpacityValue } from "../styleEditors/nudgeValue.ts";
import { valuePolicyFor } from "../styleEditors/valuePolicy.ts";
import { IconButton } from "../ui/IconButton.tsx";
import { PopoverListbox } from "../ui/PopoverListbox.tsx";
import { ColorSwatch } from "../ui/ColorSwatch.tsx";
import { getStateStyleValue } from "../stateValue.ts";
import type { StyleEditMetadata } from "./editActions.ts";
import { AtRuleIndicator, useFieldAtRules } from "../ui/AtRuleContext.tsx";

export interface TokenValueFieldProps {
  property: string;
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
  formatRawValue?: (value: string) => string;
  onCommitRaw(value: string): void;
  onSelectToken(token: TokenEntry): unknown;
  onUnlink(value: string): void;
  attributionTokens?: string[];
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  label?: string;
  opacity?: ColorOpacity;
  color?: ColorValueFacts;
  onCommitOpacity?(value: string): unknown;
  atRules?: readonly AtRuleContext[];
  chipVariant?: "default" | "small";
}

export interface TokenFieldProps {
  property: string;
  semanticSlot?: TokenSemanticSlot;
  tokenRow?: ResolvedProperty | null;
  initialValue?: string;
  domElement: HTMLElement;
  entries: TokenEntry[];
  suggestions?: ReadonlyArray<string>;
  inputDataTest?: string;
  onAfterEdit?: () => void;
  editMetadata?: StyleEditMetadata;
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  label?: string;
  chipVariant?: "default" | "small";
}

const NON_COLOR_FACTS: ColorValueFacts = { hasEmbeddedAlpha: false, isExpression: false, opacityEditable: false };

function colorFacts(value: string): ColorValueFacts {
  return selectTokens({
    entries: [{ name: "--design-tool-preview", value, source: "runtime" }],
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

function stripCssUnit(value: string): string {
  return value.replace(/^(-?\d+(?:\.\d+)?)(px|rem|em|vh|vw|vmin|vmax|%|ch|ex|cm|mm|in|pt|pc)$/i, "$1");
}

/** Returns the first family in a CSS family list without splitting var() fallbacks. */
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
  const match = value.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  return `#${[match[1], match[2], match[3]]
    .map((part) => Math.max(0, Math.min(255, Math.round(Number(part)))).toString(16).padStart(2, "0"))
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
  probe.setAttribute("data-design-tool", "value-probe");
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
  probe.setAttribute("data-design-tool", "value-probe");
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
  const hasRenderableColor = resolvedHex !== null || browserRecognizesColor(value);
  return (
    <label className="dt-token-color-control" data-resolved={hasRenderableColor ? "true" : "false"}>
      {/* Use the concrete color for aliases; an authored var() may not inherit
          the selected element's local custom properties inside the inspector's
          shadow root. Preserve other valid CSS color syntaxes as-authored. */}
      <ColorSwatch color={resolvedHex ?? (value.trim() || "transparent")} size="small" data-test="token-color-swatch" />
      <input
        className="dt-token-color-control__input"
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
    formatRawValue = (value) => value.trim(),
    onCommitRaw,
    onSelectToken,
    onUnlink,
    attributionTokens = [],
    leading,
    trailing,
    className,
    label,
    opacity,
    color,
    onCommitOpacity,
    atRules,
    chipVariant = "default",
  } = props;
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

  useEffect(() => {
    setRawValue(committedValue);
    setActiveTokenName(controlledTokenName);
    setOpacityValue(opacity?.value ?? defaultOpacityValue);
  }, [committedValue, controlledTokenName, defaultOpacityValue, opacity?.value, property]);

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

  function handleSuggestionSelect(value: string): void {
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
    // A token-backed alpha expression is represented by a chip, but unlinking
    // it should preserve the complete authored color expression and its alpha.
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
      const next = nudgeCssValue(property, rawValue, direction, event.shiftKey);
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

  function commitOpacityValue(value = opacityValue): void {
    if (!showOpacity || !onCommitOpacity) return;
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
      className="dt-token-opacity-input"
      data-test="color-opacity-input"
      type="text"
      inputMode="decimal"
      value={opacityValue}
      disabled={disabled || !onCommitOpacity}
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
      disabled={disabled}
      onChange={(value) => commitRawValue(value)}
    />
  ) : null;

  const rawSuggestionItems = availableSuggestions.map(rawSuggestion);

  if (activeToken) {
    const chipValue = chipVariant === "small" ? stripCssUnit(activeToken.value) : activeToken.name;
    const embedColorSwatch = isColor && chipVariant !== "small";
    return (
      <span className={`dt-token-field${isColor ? " dt-token-field--color" : ""}${embedColorSwatch ? " dt-token-field--color-chip" : ""}${className ? ` ${className}` : ""}`} data-test="token-field" data-property={property} aria-label={label} title={label}>
        {leading ? <span className="dt-token-field__leading">{leading}</span> : null}
        {embedColorSwatch ? null : colorControlEl}
        <span className={`dt-token-field__chip-wrap${chipVariant === "small" ? " dt-token-field__chip-wrap--small" : ""}`}>
          <PopoverListbox
            query=""
            value={activeToken.name}
            open={isTokenPickerOpen}
            trigger={(
              <span className={`dt-token-chip${chipVariant === "small" ? " dt-token-chip--small" : ""}${embedColorSwatch ? " dt-token-chip--with-swatch" : ""}`} data-group={tokenGroup(activeToken)}>
                {embedColorSwatch ? colorControlEl : null}
                <span className="dt-token-chip__name">{chipValue}</span>
              </span>
            )}
            triggerClassName={`dt-token-chip__trigger${chipVariant === "small" ? " dt-token-chip__trigger--small" : ""}`}
            triggerDataTest="token-chip"
            triggerAriaLabel={`Change ${property} token`}
            items={[...rawSuggestionItems, ...relevantTokens.map(tokenSuggestion)]}
            onQueryChange={() => undefined}
            onOpenChange={setTokenPickerOpen}
            onSelect={(value) => {
              handleSuggestionSelect(value);
            }}
          />
          <IconButton
            variant="quiet"
            size="default"
            label="Replace with raw value"
            className={`dt-token-field__delink${chipVariant === "small" ? " dt-token-field__delink--small" : ""}`}
            data-test="delink-btn"
            disabled={disabled}
            onClick={handleDelink}
          >
            <IconLinkOff size={chipVariant === "small" ? 12 : 14} stroke={1.75} aria-hidden="true" />
          </IconButton>
        </span>
        {opacityControl}
        <AtRuleIndicator atRules={fieldAtRules} />
        {trailing ? <span className="dt-token-field__trailing">{trailing}</span> : null}
      </span>
    );
  }

  const showPopover = isFocused && (filteredTokens.length > 0 || availableSuggestions.length > 0);
  return (
    <span className={`dt-token-field dt-token-field--raw${isColor ? " dt-token-field--color" : ""}${className ? ` ${className}` : ""}`} data-test="token-field" data-property={property} aria-label={label} title={label}>
      {leading ? <span className="dt-token-field__leading">{leading}</span> : null}
      {colorControlEl}
      <PopoverListbox
        query={rawValue}
        value={null}
        open={showPopover}
        placeholder={property}
        inputRef={inputRef}
        inputDataTest={inputDataTest}
        inputOnFocus={() => setIsFocused(true)}
        inputOnBlur={handleRawBlur}
        inputOnKeyDown={handleRawKeyDown}
        items={[
          ...availableSuggestions.map(rawSuggestion),
          ...filteredTokens.slice(0, 30).map(tokenSuggestion),
        ]}
        onQueryChange={(value) => {
          isNavigatingSuggestions.current = false;
          setRawValue(value);
        }}
        onOpenChange={setIsFocused}
        onSelect={(value) => {
          handleSuggestionSelect(value);
        }}
      />
      {opacityControl}
      {attributionTokens.length > 0 ? (
        <span className="dt-token-field__attribution" data-test="token-attribution" title="Referenced tokens">
          {attributionTokens.join(" · ")}
        </span>
      ) : null}
      <AtRuleIndicator atRules={fieldAtRules} />
      {trailing ? <span className="dt-token-field__trailing">{trailing}</span> : null}
    </span>
  );
}

function arrowDirection(key: string): -1 | 1 | null {
  if (key === "ArrowUp") return 1;
  if (key === "ArrowDown") return -1;
  return null;
}

export function TokenField(props: TokenFieldProps): ReactElement {
  const { property, semanticSlot, tokenRow, initialValue, domElement: el, entries, suggestions, inputDataTest, onAfterEdit, editMetadata, leading, trailing, className, label, chipVariant } = props;
  const tokenBackedOpacityName = tokenRow?.tokenName
    && tokenRow.opacity
    && tokenRow.opacity.tokenName !== tokenRow.tokenName
    ? tokenRow.tokenName
    : null;
  const expression = Boolean(tokenRow && (tokenRow.capability === "raw" || tokenRow.capability === "composite"
    || tokenRow.modifiers?.some((modifier) => modifier.kind === "alpha")
    || tokenRow.color?.isExpression));
  const authored = tokenRow?.authored ?? tokenRow?.declaredValue ?? "";
  const isCalcAuthored = /\bcalc\s*\(/i.test(authored);
  const activeTokenName = tokenBackedOpacityName ?? (expression || isCalcAuthored ? null : tokenRow?.tokenName ?? null);
  const fallbackValue = initialValue ?? structuredBorderValue(property, tokenRow) ?? computedRaw(el, property);
  // When a calc() was simplified to a numeric value we suppress the token
  // chip so the UI shows the resolved pixel value, not the internal
  // multiplier token (e.g. --spacing).  The authored expression stays
  // accessible via the row for diagnostics.
  const authoredOrComputed = tokenBackedOpacityName
    ? authored
    : expression || (!activeTokenName && !isCalcAuthored)
    ? structuredBorderValue(property, tokenRow) ?? tokenRow?.authored ?? tokenRow?.declaredValue ?? fallbackValue
    : tokenRow?.resolvedValue ?? fallbackValue;
  const committedValue = property === "font-family" && !activeTokenName
    ? primaryFontFamily(authoredOrComputed)
    : authoredOrComputed;
  const currentToken = activeTokenName
    ? entries.find((entry) => entry.name === activeTokenName) ?? null
    : null;

  return (
    <TokenValueField
      property={property}
      domElement={el}
      semanticSlot={semanticSlot}
      committedValue={committedValue}
      resolvedValue={tokenRow?.resolvedValue ?? committedValue}
      activeTokenName={activeTokenName}
      attributionTokens={expression
        ? tokenRow?.tokens?.filter((token) => token.name !== tokenRow.opacity?.tokenName).map((token) => token.name)
        : undefined}
      opacity={tokenRow?.opacity}
      color={tokenRow?.color}
      entries={entries}
      suggestions={suggestions}
      inputDataTest={inputDataTest}
      isColor={selectTokens({ property, slot: semanticSlot, entries: [] }).preferredGroup === "color"}
      formatRawValue={(value) => completeCssValue(value.trim(), valuePolicyFor(property))}
      onCommitRaw={(value) => {
        if (setStyle(el, property, value, editMetadata)) onAfterEdit?.();
      }}
      onCommitOpacity={(value) => {
        const authored = tokenRow?.authored ?? tokenRow?.declaredValue ?? committedValue;
        const result = applyValueEdit({ kind: "color-opacity", authored, opacity: value });
        if (!result.ok || !setStyle(el, property, result.value, editMetadata)) return false;
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
          if (!result.ok || !setStyle(el, targetProperty, result.value, editMetadata)) return false;
          onAfterEdit?.();
          return true;
        }
        const change = activeTokenName
          ? swapToken(el, targetProperty, chosen, currentToken, editMetadata)
          : promoteToToken(el, property, chosen, editMetadata);
        if (!change) return false;
        onAfterEdit?.();
        return true;
      }}
      onUnlink={(value) => {
        setStyle(el, property, value, editMetadata);
        onAfterEdit?.();
      }}
      leading={leading}
      trailing={trailing}
      className={className}
      label={label}
      chipVariant={chipVariant}
    />
  );
}

function tokenSuggestion(entry: TokenEntry) {
  return {
    value: entry.name,
    label: entry.name,
    "data-test": "suggestion-item",
    leading: tokenGroup(entry) === "color" ? <ColorSwatch color={entry.value} size="small" /> : undefined,
    trailing: <span>{entry.value}</span>,
  };
}

const RAW_SUGGESTION_PREFIX = "\u0000raw:";

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
