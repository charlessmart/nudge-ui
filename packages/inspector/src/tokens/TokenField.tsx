import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import type { TokenEntry } from "virtual:design-tokens";
import type { ResolvedProperty } from "./resolution.ts";
import { TokenDropdown, classifyToken, groupOfProperty } from "./TokenDropdown.tsx";
import { promoteToToken } from "./editActions.ts";
import { setStyle } from "../styleEditors/styleActions.ts";

export interface TokenFieldProps {
  property: string;
  tokenRow?: ResolvedProperty | null;
  domElement: HTMLElement;
  entries: TokenEntry[];
  onAfterEdit?: () => void;
}

function computedRaw(el: HTMLElement, property: string): string {
  try {
    return getComputedStyle(el).getPropertyValue(property).trim();
  } catch {
    return "";
  }
}

export function TokenField(props: TokenFieldProps): ReactElement {
  const { property, tokenRow, domElement: el, entries, onAfterEdit } = props;

  const [mode, setMode] = useState<"token" | "raw">(
    tokenRow?.tokenName ? "token" : "raw",
  );
  const [rawValue, setRawValue] = useState(
    tokenRow?.resolvedValue ?? computedRaw(el, property),
  );
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const selectedFromPopover = useRef(false);

  useEffect(() => {
    setMode(tokenRow?.tokenName ? "token" : "raw");
    setRawValue(tokenRow?.resolvedValue ?? computedRaw(el, property));
  }, [tokenRow?.tokenName, tokenRow?.resolvedValue, el, property]);

  const filteredTokens = useMemo(() => {
    const group = groupOfProperty(property);
    const target = rawValue.toLowerCase();
    return entries.filter((entry) => {
      if (classifyToken(entry.name) !== group) return false;
      if (!target) return true;
      return entry.name.toLowerCase().includes(target);
    });
  }, [entries, property, rawValue]);

  function handleDelink(): void {
    const value = tokenRow?.resolvedValue ?? computedRaw(el, property);
    setStyle(el, property, value);
    setMode("raw");
    setRawValue(value);
    onAfterEdit?.();
  }

  function handleSuggestionSelect(chosen: TokenEntry): void {
    selectedFromPopover.current = true;
    promoteToToken(el, property, chosen);
    setMode("token");
    onAfterEdit?.();
  }

  function handleRawChange(value: string): void {
    setRawValue(value);
    if (value.trim()) setStyle(el, property, value.trim());
  }

  function handleRawFocus(): void {
    setIsFocused(true);
  }

  function handleRawBlur(): void {
    if (selectedFromPopover.current) {
      selectedFromPopover.current = false;
      setIsFocused(false);
      return;
    }
    setIsFocused(false);
  }

  function handleRawKeyDown(e: React.KeyboardEvent): void {
    if (e.key === "Escape") {
      setRawValue(tokenRow?.resolvedValue ?? computedRaw(el, property));
      setIsFocused(false);
      inputRef.current?.blur();
    } else if (e.key === "Enter") {
      setIsFocused(false);
      inputRef.current?.blur();
    }
  }

  if (mode === "token" && tokenRow) {
    return (
      <span className="dt-token-field" data-test="token-field" data-property={property}>
        <TokenDropdown
          row={tokenRow}
          domElement={el}
          entries={entries}
          onAfterEdit={onAfterEdit}
        />
        <button
          type="button"
          className="dt-delink-btn"
          data-test="delink-btn"
          title="Replace with raw value"
          onClick={handleDelink}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
            <path d="M4.5 3.5 L7 1 L9 3 L6.5 5.5 M3 7 L1 9" />
            <path d="M1 3.5 L3.5 1 L5.5 3 L3 5.5" />
            <path d="M4.5 6.5 L7 9 L9 7" />
          </svg>
        </button>
      </span>
    );
  }

  const showPopover = isFocused && filteredTokens.length > 0;

  return (
    <span className="dt-token-field" data-test="token-field" data-property={property}>
      <input
        ref={inputRef}
        type="text"
        data-test="raw-input"
        className="dt-raw-input"
        value={rawValue}
        onChange={(e) => handleRawChange(e.target.value)}
        onFocus={handleRawFocus}
        onBlur={handleRawBlur}
        onKeyDown={handleRawKeyDown}
        placeholder={property}
      />
      {showPopover ? (
        <div className="dt-suggestion-popover" ref={popoverRef} data-test="suggestion-popover">
          {filteredTokens.slice(0, 30).map((entry) => (
            <div
              key={entry.name}
              className="dt-suggestion-item"
              data-test="suggestion-item"
              data-token={entry.name}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSuggestionSelect(entry);
              }}
            >
              {classifyToken(entry.name) === "color" ? (
                <span
                  className="dt-suggestion-item__swatch"
                  style={{ background: entry.value || "transparent" }}
                />
              ) : null}
              <span className="dt-suggestion-item__name">{entry.name}</span>
              <span className="dt-suggestion-item__value">{entry.value}</span>
            </div>
          ))}
        </div>
      ) : null}
    </span>
  );
}
