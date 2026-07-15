import { Combobox } from "@base-ui/react/combobox";
import type { FocusEventHandler, KeyboardEventHandler, ReactElement, ReactNode, Ref } from "react";

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
  placeholder?: string;
  inputRef?: Ref<HTMLInputElement>;
  inputClassName?: string;
  inputDataTest?: string;
  inputOnBlur?: FocusEventHandler<HTMLInputElement>;
  inputOnKeyDown?: KeyboardEventHandler<HTMLInputElement>;
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
  placeholder,
  inputRef,
  inputClassName,
  inputDataTest,
  inputOnBlur,
  inputOnKeyDown,
  className,
  onQueryChange,
  onOpenChange,
  onSelect,
}: PopoverListboxProps): ReactElement {
  const portalContainer = typeof document !== "undefined"
    ? document.getElementById("design-tool-root")?.shadowRoot ?? document.body
    : null;

  return (
    <div className={`dt-popover-listbox${className ? ` ${className}` : ""}`}>
      <Combobox.Root
        value={value}
        inputValue={query}
        open={open}
        items={items.map((item) => item.value)}
        autoHighlight
        onInputValueChange={(next) => onQueryChange(next)}
        onOpenChange={(next) => onOpenChange(next)}
        onValueChange={(next) => {
          if (typeof next === "string") onSelect(next);
        }}
      >
        <Combobox.Input
          ref={inputRef}
          className={`dt-text-input${inputClassName ? ` ${inputClassName}` : ""}`}
          placeholder={placeholder}
          data-test={inputDataTest}
          onFocus={() => onOpenChange(true)}
          onBlur={inputOnBlur}
          onKeyDown={inputOnKeyDown}
        />
        <Combobox.Portal container={portalContainer}>
          <Combobox.Positioner className="dt-popover-listbox__positioner">
            <Combobox.Popup className="dt-popover-listbox__popup">
              <Combobox.List className="dt-popover-listbox__list">
                {items.map((item) => (
                  <Combobox.Item
                    key={item.value}
                    value={item.value}
                    className="dt-popover-listbox__item"
                    data-test={item["data-test"]}
                  >
                    {item.leading ? <span className="dt-popover-listbox__leading">{item.leading}</span> : null}
                    <span className="dt-popover-listbox__label">{item.label}</span>
                    {item.trailing ? <span className="dt-popover-listbox__trailing">{item.trailing}</span> : null}
                  </Combobox.Item>
                ))}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    </div>
  );
}
