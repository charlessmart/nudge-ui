import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import type { TokenEntry } from "virtual:design-tokens";
import type { ResolvedProperty } from "./resolution.ts";
import { TokenDropdown, classifyToken, groupOfProperty } from "./TokenDropdown.tsx";
import { promoteToToken } from "./editActions.ts";
import { setStyle } from "../styleEditors/styleActions.ts";
import { IconButton } from "../ui/IconButton.tsx";
import { PopoverListbox } from "../ui/PopoverListbox.tsx";
import { ColorSwatch } from "../ui/ColorSwatch.tsx";

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
  const selectedFromPopover = useRef(false);
  const cancelOnBlur = useRef(false);

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
      return entry.name.toLowerCase().includes(target) || entry.value.toLowerCase().includes(target);
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
    cancelOnBlur.current = false;
    promoteToToken(el, property, chosen);
    setMode("token");
    onAfterEdit?.();
  }

  function handleRawChange(value: string): void {
    setRawValue(value);
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

  function handleRawKeyDown(e: React.KeyboardEvent): void {
    if (e.key === "Escape") {
      setRawValue(tokenRow?.resolvedValue ?? computedRaw(el, property));
      cancelOnBlur.current = true;
      setIsFocused(false);
      inputRef.current?.blur();
    } else if (e.key === "Enter") {
      setIsFocused(false);
      inputRef.current?.blur();
    }
  }

  function commitRawValue(): void {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      setRawValue(tokenRow?.resolvedValue ?? computedRaw(el, property));
      return;
    }
    if (setStyle(el, property, trimmed)) onAfterEdit?.();
  }

  const rawTokenRow: ResolvedProperty = {
    property,
    tokenName: null,
    declaredValue: rawValue,
    resolvedValue: rawValue,
    confidence: "unknown",
    evidence: tokenRow?.evidence ?? { reason: "raw value editor" },
  };

  if (mode === "token" && tokenRow) {
    return (
      <span className="dt-token-field" data-test="token-field" data-property={property}>
        <TokenDropdown
          row={tokenRow}
          domElement={el}
          entries={entries}
          onAfterEdit={onAfterEdit}
        />
        <IconButton
          label="Replace with raw value"
          className="dt-token-field__delink"
          data-test="delink-btn"
          onClick={handleDelink}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
            <path d="M4.5 3.5 L7 1 L9 3 L6.5 5.5 M3 7 L1 9" />
            <path d="M1 3.5 L3.5 1 L5.5 3 L3 5.5" />
            <path d="M4.5 6.5 L7 9 L9 7" />
          </svg>
        </IconButton>
      </span>
    );
  }

  const showPopover = isFocused && filteredTokens.length > 0;

  return (
    <span className="dt-token-field dt-token-field--raw" data-test="token-field" data-property={property}>
      <PopoverListbox
        query={rawValue}
        value={null}
        open={showPopover}
        placeholder={property}
        inputRef={inputRef}
        inputDataTest="raw-input"
        inputOnBlur={handleRawBlur}
        inputOnKeyDown={handleRawKeyDown}
        items={filteredTokens.slice(0, 30).map((entry) => ({
          value: entry.name,
          label: entry.name,
          "data-test": "suggestion-item",
          leading: classifyToken(entry.name) === "color" ? <ColorSwatch color={entry.value} size="small" /> : undefined,
          trailing: <span>{entry.value}</span>,
        }))}
        onQueryChange={handleRawChange}
        onOpenChange={setIsFocused}
        onSelect={(value) => {
          const chosen = entries.find((entry) => entry.name === value);
          if (chosen) handleSuggestionSelect(chosen);
        }}
      />
      <TokenDropdown
        row={rawTokenRow}
        domElement={el}
        entries={entries}
        onAfterEdit={onAfterEdit}
      />
    </span>
  );
}
