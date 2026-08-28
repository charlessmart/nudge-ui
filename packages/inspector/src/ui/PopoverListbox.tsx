import { Combobox } from "@base-ui/react/combobox";
import { Autocomplete } from "@base-ui/react/autocomplete";
import type { FocusEventHandler, KeyboardEventHandler, ReactElement, ReactNode, Ref } from "react";
import type { ControlAppearance } from "./ControlSurface.tsx";

export interface PopoverListboxItem {
  value: string;
  label: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  "data-test"?: string;
}

export interface PopoverListboxProps {
  value?: string | null;
  query: string;
  items: PopoverListboxItem[];
  open: boolean;
  trigger?: ReactNode;
  triggerElement?: ReactElement;
  triggerClassName?: string;
  triggerDataTest?: string;
  triggerAriaLabel?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  placeholder?: string;
  inputRef?: Ref<HTMLInputElement>;
  inputClassName?: string;
  inputAppearance?: ControlAppearance;
  inputDataTest?: string;
  inputOnFocus?: FocusEventHandler<HTMLInputElement>;
  inputOnBlur?: FocusEventHandler<HTMLInputElement>;
  inputOnKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  disabled?: boolean;
  className?: string;
  onQueryChange: (query: string) => void;
  onOpenChange: (open: boolean) => void;
  onSelect: (value: string) => void;
}

export function PopoverListbox({
  value = null,
  query,
  items,
  open,
  trigger,
  triggerElement,
  triggerClassName,
  triggerDataTest,
  triggerAriaLabel,
  searchable = false,
  searchPlaceholder = "Search…",
  searchAriaLabel = "Search options",
  placeholder,
  inputRef,
  inputClassName,
  inputAppearance = "default",
  inputDataTest,
  inputOnFocus,
  inputOnBlur,
  inputOnKeyDown,
  disabled = false,
  className,
  onQueryChange,
  onOpenChange,
  onSelect,
}: PopoverListboxProps): ReactElement {
  const portalContainer = typeof document !== "undefined"
    ? document.getElementById("nudge-ui-root")?.shadowRoot ?? document.body
    : null;
  const itemByValue = new Map(items.map((item) => [item.value, item]));

  function renderComboboxItem(item: PopoverListboxItem): ReactElement {
    return (
      <Combobox.Item
        key={item.value}
        value={item.value}
        className="popover-listbox__item"
        data-test={item["data-test"]}
      >
        {item.leading ? <span className="popover-listbox__leading">{item.leading}</span> : null}
        <span className="popover-listbox__label">{item.label}</span>
        {item.trailing ? <span className="popover-listbox__trailing">{item.trailing}</span> : null}
      </Combobox.Item>
    );
  }

  return (
    <div className={`popover-listbox${className ? ` ${className}` : ""}`}>
      {trigger || triggerElement ? (
        <Combobox.Root
          value={value}
          inputValue={searchable ? undefined : query}
          open={open}
          items={items.map((item) => item.value)}
          filteredItems={searchable ? undefined : items.map((item) => item.value)}
          autoHighlight
          itemToStringLabel={(item: string) => itemByValue.get(item)?.label ?? item}
          onInputValueChange={(next) => onQueryChange(next)}
          onOpenChange={(next) => onOpenChange(next)}
          onValueChange={(next) => {
            if (typeof next === "string") onSelect(next);
          }}
        >
          {triggerElement ? (
            <Combobox.Trigger
              render={triggerElement}
              className={`popover-listbox__trigger${triggerClassName ? ` ${triggerClassName}` : ""}`}
              data-test={triggerDataTest}
              aria-label={triggerAriaLabel}
              disabled={disabled}
            />
          ) : (
            <Combobox.Trigger
              className={`popover-listbox__trigger${triggerClassName ? ` ${triggerClassName}` : ""}`}
              data-test={triggerDataTest}
              aria-label={triggerAriaLabel}
              disabled={disabled}
            >
              {trigger}
            </Combobox.Trigger>
          )}
          <Combobox.Portal container={portalContainer}>
            <Combobox.Positioner className="popover-listbox__positioner">
              <Combobox.Popup className={`popover-listbox__popup${searchable ? " popover-listbox__popup--searchable" : ""}`}>
                {searchable ? (
                  <>
                    <Combobox.Input
                      className="popover-listbox__search-input"
                      placeholder={searchPlaceholder}
                      aria-label={searchAriaLabel}
                      data-test={triggerDataTest ? `${triggerDataTest}-search` : "popover-listbox-search"}
                    />
                    <Combobox.Empty className="popover-listbox__empty">
                      No matching options.
                    </Combobox.Empty>
                  </>
                ) : null}
                <Combobox.List className={`popover-listbox__list${searchable ? " popover-listbox__list--searchable" : ""}`}>
                  {searchable
                    ? ((itemValue: string) => {
                      const item = itemByValue.get(itemValue);
                      return item ? renderComboboxItem(item) : null;
                    })
                    : items.map((item) => renderComboboxItem(item))}
                </Combobox.List>
              </Combobox.Popup>
            </Combobox.Positioner>
          </Combobox.Portal>
        </Combobox.Root>
      ) : (
        <Autocomplete.Root
          value={query}
          open={open}
          items={items.map((item) => item.value)}
          filteredItems={items.map((item) => item.value)}
          autoHighlight
          mode="none"
          openOnInputClick
          onValueChange={onQueryChange}
          onOpenChange={(next) => onOpenChange(next)}
        >
          <Autocomplete.Input
            ref={inputRef}
            className={`text-input${inputAppearance === "embedded" ? " text-input--embedded" : ""}${inputClassName ? ` ${inputClassName}` : ""}`}
            placeholder={placeholder}
            data-test={inputDataTest}
            onFocus={inputOnFocus}
            onBlur={inputOnBlur}
            onKeyDownCapture={inputOnKeyDown}
            disabled={disabled}
          />
          <Autocomplete.Portal container={portalContainer}>
            <Autocomplete.Positioner className="popover-listbox__positioner">
              <Autocomplete.Popup className="popover-listbox__popup">
                <Autocomplete.List className="popover-listbox__list">
                  {items.map((item) => (
                    <Autocomplete.Item
                      key={item.value}
                      value={item.value}
                      className="popover-listbox__item"
                      data-test={item["data-test"]}
                      onClick={() => onSelect(item.value)}
                    >
                      {item.leading ? <span className="popover-listbox__leading">{item.leading}</span> : null}
                      <span className="popover-listbox__label">{item.label}</span>
                      {item.trailing ? <span className="popover-listbox__trailing">{item.trailing}</span> : null}
                    </Autocomplete.Item>
                  ))}
                </Autocomplete.List>
              </Autocomplete.Popup>
            </Autocomplete.Positioner>
          </Autocomplete.Portal>
        </Autocomplete.Root>
      )}
    </div>
  );
}
