import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { ChevronDown, Unlink2 } from "lucide-react";
import type { TokenEntry } from "virtual:design-tokens";
import type { ResolvedProperty } from "./resolution.ts";
import { classifyToken, getAlternativeTokens } from "./TokenDropdown.tsx";
import { promoteToToken, swapToken } from "./editActions.ts";
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

  const [rawValue, setRawValue] = useState(
    tokenRow?.resolvedValue ?? computedRaw(el, property),
  );
  const [isFocused, setIsFocused] = useState(false);
  const [isTokenPickerOpen, setTokenPickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedFromPopover = useRef(false);
  const cancelOnBlur = useRef(false);
  const isNavigatingSuggestions = useRef(false);

  const rowTokenName = tokenRow?.tokenName ?? null;
  const rowTokenValue = tokenRow?.resolvedValue ?? "";
  const [activeToken, setActiveToken] = useState<TokenEntry | null>(() => tokenForRow(tokenRow, entries));

  useEffect(() => {
    setRawValue(tokenRow?.resolvedValue ?? computedRaw(el, property));
    setActiveToken(tokenForRow(tokenRow, entries));
  }, [el, property, rowTokenName, rowTokenValue]);

  const relevantTokens = useMemo(
    () => getAlternativeTokens(entries, { property, currentToken: activeToken?.name ?? null }),
    [activeToken?.name, entries, property],
  );

  const filteredTokens = useMemo(() => {
    const target = rawValue.toLowerCase();
    return relevantTokens.filter((entry) => {
      if (!target) return true;
      return entry.name.toLowerCase().includes(target) || entry.value.toLowerCase().includes(target);
    });
  }, [rawValue, relevantTokens]);

  function handleDelink(): void {
    const value = activeToken?.value ?? tokenRow?.resolvedValue ?? computedRaw(el, property);
    setStyle(el, property, value);
    setActiveToken(null);
    setRawValue(value);
    onAfterEdit?.();
  }

  function handleSuggestionSelect(chosen: TokenEntry): void {
    selectedFromPopover.current = true;
    cancelOnBlur.current = false;
    promoteToToken(el, property, chosen);
    setActiveToken(chosen);
    setRawValue(chosen.value);
    onAfterEdit?.();
  }

  function handleTokenSelect(chosen: TokenEntry): void {
    swapToken(el, tokenRow?.property ?? property, chosen, activeToken);
    setActiveToken(chosen);
    setTokenPickerOpen(false);
    onAfterEdit?.();
  }

  function handleRawChange(value: string): void {
    isNavigatingSuggestions.current = false;
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
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      isNavigatingSuggestions.current = true;
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setRawValue(tokenRow?.resolvedValue ?? computedRaw(el, property));
      cancelOnBlur.current = true;
      setIsFocused(false);
      inputRef.current?.blur();
    } else if (e.key === "Enter" && !isNavigatingSuggestions.current) {
      e.preventDefault();
      e.stopPropagation();
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

  if (activeToken) {
    return (
      <span className="dt-token-field" data-test="token-field" data-property={property}>
        <PopoverListbox
          query=""
          value={activeToken.name}
          open={isTokenPickerOpen}
          trigger={
            <span className="dt-token-chip" data-group={classifyToken(activeToken.name)}>
              {classifyToken(activeToken.name) === "color" ? <ColorSwatch color={activeToken.value} size="small" /> : null}
              <span className="dt-token-chip__name">{activeToken.name}</span>
              <ChevronDown size={13} strokeWidth={1.75} aria-hidden="true" />
            </span>
          }
          triggerClassName="dt-token-chip__trigger"
          triggerDataTest="token-chip"
          triggerAriaLabel={`Change ${property} token`}
          items={relevantTokens.map((entry) => tokenSuggestion(entry))}
          onQueryChange={() => undefined}
          onOpenChange={setTokenPickerOpen}
          onSelect={(value) => {
            const chosen = relevantTokens.find((entry) => entry.name === value);
            if (chosen) handleTokenSelect(chosen);
          }}
        />
        <IconButton
          label="Replace with raw value"
          className="dt-token-field__delink"
          data-test="delink-btn"
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
        onQueryChange={handleRawChange}
        onOpenChange={setIsFocused}
        onSelect={(value) => {
          const chosen = entries.find((entry) => entry.name === value);
          if (chosen) handleSuggestionSelect(chosen);
        }}
      />
    </span>
  );
}

function tokenForRow(tokenRow: ResolvedProperty | null | undefined, entries: TokenEntry[]): TokenEntry | null {
  if (!tokenRow?.tokenName) return null;
  return entries.find((entry) => entry.name === tokenRow.tokenName) ?? {
    name: tokenRow.tokenName,
    value: tokenRow.resolvedValue,
    source: tokenRow.evidence.reason,
  };
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
