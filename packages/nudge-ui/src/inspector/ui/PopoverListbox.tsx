import { Combobox } from "@base-ui/react/combobox";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { IconCheck } from "@tabler/icons-react";
import { Fragment, useRef } from "react";
import type { FocusEventHandler, KeyboardEventHandler, ReactElement, ReactNode, Ref } from "react";
import type { ControlAppearance } from "./ControlSurface.tsx";
import { cx } from "./classNames.ts";
import { Tooltip } from "./Tooltip.tsx";
import { portalContainer } from "./portalContainer.ts";
import { controlAnchor } from "./controlAnchor.ts";

export interface PopoverListboxItem {
  value: string;
  label: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Marks the row as the current choice; the check sits at the trailing edge, as in `Select`. */
  selected?: boolean;
  "data-test"?: string;
  /** Consecutive items in one group render under its label. */
  group?: string;
  /** Runs `onSelect` without closing the list or filling the input. */
  keepOpen?: boolean;
  /** Stays in the list, dimmed, and cannot be chosen. */
  disabled?: boolean;
}

interface ItemSection {
  key: string;
  label?: string;
  items: string[];
}

function itemSections(items: readonly PopoverListboxItem[]): ItemSection[] {
  const sections: ItemSection[] = [];
  for (const item of items) {
    const last = sections.at(-1);
    if (last && last.label === item.group) last.items.push(item.value);
    else sections.push({ key: `${sections.length}:${item.group ?? ""}`, label: item.group, items: [item.value] });
  }
  return sections;
}

/** `wide` keeps the popup at least 260px for long labels; `fit` sizes it to its items, never narrower than the control. */
export type PopupWidth = "fit" | "wide";

/** The current row's check, matching the trailing indicator that `Select` puts after its item text. */
function SelectedIndicator(): ReactElement {
  return (
    <span className="popover-listbox__indicator" data-test="popover-listbox-indicator">
      <IconCheck size={15} stroke={2.4} aria-hidden="true" />
    </span>
  );
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
  triggerTooltip?: ReactNode;
  searchable?: boolean;
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  searchOnKeyDown?: KeyboardEventHandler<HTMLInputElement>;
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
  /** `wide` keeps the popup at least 260px for long labels; `fit` sizes it to its items, never narrower than the control. */
  popupWidth?: PopupWidth;
  onQueryChange: (query: string) => void;
  onOpenChange: (open: boolean) => void;
  onSelect: (value: string) => void;
  /** The item under the pointer or arrow keys; automatic highlights report null. */
  onHighlight?: (value: string | null) => void;
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
  triggerTooltip,
  searchable = false,
  searchPlaceholder = "Search…",
  searchAriaLabel = "Search options",
  searchOnKeyDown,
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
  popupWidth = "wide",
  onQueryChange,
  onOpenChange,
  onSelect,
  onHighlight,
}: PopoverListboxProps): ReactElement {
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Outside a control surface, the input or trigger stays the anchor as before.
  const anchor = controlAnchor(wrapperRef, (wrapper) => wrapper.querySelector("input, button") ?? wrapper);
  const itemByValue = new Map(items.map((item) => [item.value, item]));
  const sections = itemSections(items);
  const popupClassName = cx("popover-listbox__popup", popupWidth === "fit" && "popover-listbox__popup--fit");
  const resolvedTriggerTooltip = triggerTooltip ?? (triggerElement ? triggerAriaLabel : undefined);
  const handleHighlight = onHighlight
    ? (next: string | undefined, details: { reason: string }) => {
      onHighlight(next !== undefined && details.reason !== "none" ? next : null);
    }
    : undefined;

  function renderComboboxItem(item: PopoverListboxItem): ReactElement {
    return (
      <Combobox.Item
        key={item.value}
        value={item.value}
        className="popover-listbox__item"
        data-test={item["data-test"]}
        disabled={item.disabled}
      >
        {item.leading ? <span className="popover-listbox__leading">{item.leading}</span> : null}
        <span className="popover-listbox__label">{item.label}</span>
        {item.trailing ? <span className="popover-listbox__trailing">{item.trailing}</span> : null}
        {item.selected ? <SelectedIndicator /> : null}
      </Combobox.Item>
    );
  }

  function renderAutocompleteItem(item: PopoverListboxItem): ReactElement {
    return (
      <Autocomplete.Item
        key={item.value}
        value={item.value}
        className="popover-listbox__item"
        data-test={item["data-test"]}
        disabled={item.disabled}
        onClick={(event) => {
          if (item.keepOpen) event.preventBaseUIHandler();
          onSelect(item.value);
        }}
      >
        {item.leading ? <span className="popover-listbox__leading">{item.leading}</span> : null}
        <span className="popover-listbox__label">{item.label}</span>
        {item.trailing ? <span className="popover-listbox__trailing">{item.trailing}</span> : null}
        {item.selected ? <SelectedIndicator /> : null}
      </Autocomplete.Item>
    );
  }

  /** Static lists keep their own order; labelled sections become groups. */
  function renderSections(renderItem: (item: PopoverListboxItem) => ReactElement): ReactNode {
    return sections.map((section) => {
      const rendered = section.items.flatMap((value) => {
        const item = itemByValue.get(value);
        return item ? [renderItem(item)] : [];
      });
      if (!section.label) return <Fragment key={section.key}>{rendered}</Fragment>;
      return (
        <Combobox.Group key={section.key} className="popover-listbox__group">
          <Combobox.GroupLabel className="popover-listbox__group-label">{section.label}</Combobox.GroupLabel>
          {rendered}
        </Combobox.Group>
      );
    });
  }

  return (
    <div ref={wrapperRef} className={cx("popover-listbox", className)}>
      {trigger || triggerElement ? (
        <Combobox.Root
          value={value}
          inputValue={searchable ? undefined : query}
          open={open}
          items={searchable ? sections : items.map((item) => item.value)}
          filteredItems={searchable ? undefined : items.map((item) => item.value)}
          autoHighlight
          itemToStringLabel={(item: string) => itemByValue.get(item)?.label ?? item}
          onInputValueChange={(next) => onQueryChange(next)}
          onOpenChange={(next) => onOpenChange(next)}
          onItemHighlighted={handleHighlight}
          onValueChange={(next, details) => {
            if (typeof next !== "string") return;
            if (itemByValue.get(next)?.keepOpen) details.cancel();
            onSelect(next);
          }}
        >
          <Tooltip content={resolvedTriggerTooltip} disabled={resolvedTriggerTooltip === undefined} stableTrigger>
            <Combobox.Trigger
              render={triggerElement}
              className={cx("popover-listbox__trigger", triggerClassName)}
              data-test={triggerDataTest}
              aria-label={triggerAriaLabel}
              disabled={disabled}
            >
              {triggerElement ? undefined : trigger}
            </Combobox.Trigger>
          </Tooltip>
          <Combobox.Portal container={portalContainer()}>
            <Combobox.Positioner className="popover-listbox__positioner" sideOffset={4} anchor={anchor}>
              <Combobox.Popup className={cx(popupClassName, searchable && "popover-listbox__popup--searchable")}>
                {searchable ? (
                  <>
                    <Combobox.Input
                      className="popover-listbox__search-input"
                      placeholder={searchPlaceholder}
                      aria-label={searchAriaLabel}
                      data-test={triggerDataTest ? `${triggerDataTest}-search` : "popover-listbox-search"}
                      onKeyDown={searchOnKeyDown}
                    />
                    <Combobox.Empty className="popover-listbox__empty">
                      No matching options.
                    </Combobox.Empty>
                  </>
                ) : null}
                <Combobox.List className={cx("popover-listbox__list", searchable && "popover-listbox__list--searchable")}>
                  {searchable
                    ? ((section: ItemSection) => (
                      <Combobox.Group key={section.key} items={section.items} className="popover-listbox__group">
                        {section.label ? (
                          <Combobox.GroupLabel className="popover-listbox__group-label">{section.label}</Combobox.GroupLabel>
                        ) : null}
                        <Combobox.Collection>
                          {(itemValue: string) => {
                            const item = itemByValue.get(itemValue);
                            return item ? renderComboboxItem(item) : null;
                          }}
                        </Combobox.Collection>
                      </Combobox.Group>
                    ))
                    : renderSections(renderComboboxItem)}
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
          // `onSelect` handles a chosen item; filling the input would expose its encoded value.
          onValueChange={(next, details) => {
            if (details.reason !== "item-press") onQueryChange(next);
          }}
          onOpenChange={(next) => onOpenChange(next)}
          onItemHighlighted={handleHighlight}
        >
          <Autocomplete.Input
            ref={inputRef}
            className={cx("text-input", inputAppearance === "embedded" && "text-input--embedded", inputClassName)}
            placeholder={placeholder}
            data-test={inputDataTest}
            onFocus={inputOnFocus}
            onBlur={inputOnBlur}
            onKeyDownCapture={inputOnKeyDown}
            disabled={disabled}
          />
          <Autocomplete.Portal container={portalContainer()}>
            <Autocomplete.Positioner className="popover-listbox__positioner" sideOffset={4} anchor={anchor}>
              <Autocomplete.Popup className={popupClassName}>
                <Autocomplete.List className="popover-listbox__list">
                  {renderSections(renderAutocompleteItem)}
                </Autocomplete.List>
              </Autocomplete.Popup>
            </Autocomplete.Positioner>
          </Autocomplete.Portal>
        </Autocomplete.Root>
      )}
    </div>
  );
}
