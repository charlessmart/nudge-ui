import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { ChevronDown, Unlink2 } from "lucide-react";
import type { TokenEntry } from "virtual:design-tokens";
import type { ResolvedProperty } from "./resolution.ts";
import { classifyToken, getAlternativeTokens, groupOfProperty } from "./TokenDropdown.tsx";
import { promoteToToken, swapToken } from "./editActions.ts";
import { setStyle } from "../styleEditors/styleActions.ts";
import { completeCssValue } from "../styleEditors/completeCssValue.ts";
import { nudgeCssValue } from "../styleEditors/nudgeValue.ts";
import { valuePolicyFor } from "../styleEditors/valuePolicy.ts";
import { IconButton } from "../ui/IconButton.tsx";
import { PopoverListbox } from "../ui/PopoverListbox.tsx";
import { ColorSwatch } from "../ui/ColorSwatch.tsx";
import { getStateStyleValue } from "../stateValue.ts";

export interface TokenValueFieldProps {
  property: string;
  committedValue: string;
  resolvedValue?: string;
  activeTokenName?: string | null;
  entries: TokenEntry[];
  allowedTokenNames?: ReadonlySet<string>;
  isColor?: boolean;
  disabled?: boolean;
  formatRawValue?: (value: string) => string;
  onCommitRaw(value: string): void;
  onSelectToken(token: TokenEntry): void;
  onUnlink(value: string): void;
  attributionTokens?: string[];
}

export interface TokenFieldProps {
  property: string;
  tokenRow?: ResolvedProperty | null;
  domElement: HTMLElement;
  entries: TokenEntry[];
  onAfterEdit?: () => void;
}

function computedRaw(el: HTMLElement, property: string): string {
  const value = getStateStyleValue(el, property);
  if (property !== "line-height") return value;
  return lineHeightPercentage(value, getStateStyleValue(el, "font-size")) ?? value;
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

function rgbToHex(value: string): string | null {
  const match = value.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  return `#${[match[1], match[2], match[3]]
    .map((part) => Math.max(0, Math.min(255, Math.round(Number(part)))).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function colorValueToHex(value: string): string | null {
  const trimmed = value.trim();
  const short = trimmed.match(/^#([\da-f])([\da-f])([\da-f])$/i);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  if (/^#[\da-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
  const directRgb = rgbToHex(trimmed);
  if (directRgb) return directRgb;
  if (typeof document === "undefined") return null;

  const probe = document.createElement("span");
  probe.style.color = "";
  probe.style.color = trimmed;
  if (!probe.style.color) return null;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return rgbToHex(resolved);
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
  const hex = colorValueToHex(value) ?? "#000000";
  return (
    <label className="dt-token-color-control" data-resolved={colorValueToHex(value) ? "true" : "false"}>
      <ColorSwatch color={colorValueToHex(value) ? value : "transparent"} size="small" data-test="token-color-swatch" />
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
    committedValue,
    resolvedValue = committedValue,
    activeTokenName: controlledTokenName = null,
    entries,
    allowedTokenNames,
    isColor = false,
    disabled = false,
    formatRawValue = (value) => value.trim(),
    onCommitRaw,
    onSelectToken,
    onUnlink,
    attributionTokens = [],
  } = props;
  const [rawValue, setRawValue] = useState(committedValue);
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
  }, [committedValue, controlledTokenName, property]);

  const activeToken = activeTokenName
    ? entries.find((entry) => entry.name === activeTokenName) ?? { name: activeTokenName, value: resolvedValue, source: "runtime" }
    : null;
  const relevantTokens = useMemo(() => {
    const candidates = allowedTokenNames
      ? entries.filter((entry) => allowedTokenNames.has(entry.name))
      : getAlternativeTokens(entries, { property, currentToken: activeTokenName });
    return candidates.filter((entry) => entry.name !== property);
  }, [activeTokenName, allowedTokenNames, entries, property]);
  const filteredTokens = useMemo(() => {
    const target = rawValue.toLowerCase();
    return relevantTokens.filter((entry) => !target
      || entry.name.toLowerCase().includes(target)
      || entry.value.toLowerCase().includes(target));
  }, [rawValue, relevantTokens]);

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
    const value = activeToken?.value || resolvedValue || committedValue;
    setActiveTokenName(null);
    setRawValue(value);
    onUnlink(value);
  }

  function handleSuggestionSelect(chosen: TokenEntry): void {
    selectedFromPopover.current = true;
    cancelOnBlur.current = false;
    setActiveTokenName(chosen.name);
    setRawValue(chosen.value);
    onSelectToken(chosen);
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

  const colorPreview = activeToken ? resolvedValue || activeToken.value : rawValue || resolvedValue;
  const colorControl = isColor ? (
    <NativeColorSwatch
      value={colorPreview}
      disabled={disabled}
      onChange={(value) => commitRawValue(value)}
    />
  ) : null;

  if (activeToken) {
    return (
      <span className="dt-token-field" data-test="token-field" data-property={property}>
        {colorControl}
        <PopoverListbox
          query=""
          value={activeToken.name}
          open={isTokenPickerOpen}
          trigger={(
            <span className="dt-token-chip" data-group={classifyToken(activeToken.name)}>
              <span className="dt-token-chip__name">{activeToken.name}</span>
              <ChevronDown size={13} strokeWidth={1.75} aria-hidden="true" />
            </span>
          )}
          triggerClassName="dt-token-chip__trigger"
          triggerDataTest="token-chip"
          triggerAriaLabel={`Change ${property} token`}
          items={relevantTokens.map(tokenSuggestion)}
          onQueryChange={() => undefined}
          onOpenChange={setTokenPickerOpen}
          onSelect={(value) => {
            const chosen = relevantTokens.find((entry) => entry.name === value);
            if (chosen) handleSuggestionSelect(chosen);
          }}
        />
        <IconButton
          label="Replace with raw value"
          className="dt-token-field__delink"
          data-test="delink-btn"
          disabled={disabled}
          onClick={handleDelink}
        >
          <Unlink2 size={14} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
      </span>
    );
  }

  const showPopover = isFocused && filteredTokens.length > 0;
  return (
    <span className="dt-token-field dt-token-field--raw" data-test="token-field" data-property={property}>
      {attributionTokens.length > 0 ? (
        <span className="dt-token-field__attribution" data-test="token-attribution" title="Referenced tokens">
          {attributionTokens.join(" · ")}
        </span>
      ) : null}
      {colorControl}
      <PopoverListbox
        query={rawValue}
        value={null}
        open={showPopover}
        placeholder={property}
        inputRef={inputRef}
        inputDataTest="raw-input"
        inputOnBlur={handleRawBlur}
        inputOnKeyDown={handleRawKeyDown}
        items={filteredTokens.slice(0, 30).map(tokenSuggestion)}
        onQueryChange={(value) => {
          isNavigatingSuggestions.current = false;
          setRawValue(value);
        }}
        onOpenChange={setIsFocused}
        onSelect={(value) => {
          const chosen = relevantTokens.find((entry) => entry.name === value);
          if (chosen) handleSuggestionSelect(chosen);
        }}
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
  const { property, tokenRow, domElement: el, entries, onAfterEdit } = props;
  const expression = Boolean(tokenRow && ((tokenRow.modifiers?.length ?? 0) > 0 || tokenRow.capability === "raw" || tokenRow.capability === "composite"));
  const activeTokenName = expression ? null : tokenRow?.tokenName ?? null;
  const committedValue = expression ? tokenRow?.authored ?? tokenRow?.declaredValue ?? computedRaw(el, property) : tokenRow?.resolvedValue ?? computedRaw(el, property);
  const currentToken = activeTokenName
    ? entries.find((entry) => entry.name === activeTokenName) ?? null
    : null;

  return (
    <TokenValueField
      property={property}
      committedValue={committedValue}
      resolvedValue={tokenRow?.resolvedValue ?? committedValue}
      activeTokenName={activeTokenName}
      attributionTokens={expression ? tokenRow?.tokens?.map((token) => token.name) : undefined}
      entries={entries}
      isColor={groupOfProperty(property) === "color"}
      formatRawValue={(value) => completeCssValue(value.trim(), valuePolicyFor(property))}
      onCommitRaw={(value) => {
        if (setStyle(el, property, value)) onAfterEdit?.();
      }}
      onSelectToken={(chosen) => {
        if (activeTokenName) swapToken(el, tokenRow?.property ?? property, chosen, currentToken);
        else promoteToToken(el, property, chosen);
        onAfterEdit?.();
      }}
      onUnlink={(value) => {
        setStyle(el, property, value);
        onAfterEdit?.();
      }}
    />
  );
}

function tokenSuggestion(entry: TokenEntry) {
  return {
    value: entry.name,
    label: entry.name,
    "data-test": "suggestion-item",
    leading: classifyToken(entry.name) === "color" ? <ColorSwatch color={entry.value} size="small" /> : undefined,
    trailing: <span>{entry.value}</span>,
  };
}
