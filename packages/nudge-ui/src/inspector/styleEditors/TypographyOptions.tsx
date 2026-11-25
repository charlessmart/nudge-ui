import { useEffect, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { IconAdjustments, IconItalic, IconLetterCase, IconLetterCaseLower, IconLetterCaseUpper, IconOverline, IconStrikethrough, IconUnderline, IconX } from "@tabler/icons-react";
import type { ResolvedProperty } from "../../css/model/index.ts";
import { setStyles, type StyleDeclaration, type StyleEditMetadata } from "../tokens/editActions.ts";
import { getStateStyleValue } from "../shell/stateValue.ts";
import { AtRuleIndicator, useFieldAtRules } from "../ui/AtRuleContext.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { InspectorPopover } from "../ui/InspectorPopover.tsx";
import { InlineStyleBlockedTooltip } from "../ui/InlineStyleWarning.tsx";
import { Select, type SelectOption } from "../ui/Select.tsx";
import type { EditTarget } from "../selection/editTarget.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";
import { TextSegmentedField, type TextSegmentOption } from "./TextSegmentedField.tsx";
import { inlineBlockedBy } from "./inlineAuthored.ts";
import { findTokenRow, metadataFor } from "./rowLookup.ts";
import {
  readTextTruncation,
  TEXT_TRUNCATIONS,
  truncationDeclarations,
  truncationLabel,
  type TextTruncation,
} from "./textTruncation.ts";
import { IconTextBoxNormal, IconTextBoxTrim, IconUpright } from "./TypographyIcons.tsx";
import { readTextWrap, TEXT_WRAP_CHOICES, textWrapDeclarations, type StyleReader, type TextWrap } from "./textWrap.ts";

const SEGMENT_ICON = { size: 16, stroke: 1.8, "aria-hidden": true } as const;
// `oblique` has no segment of its own; a page that sets it shows neither selected.
const FONT_STYLE_OPTIONS: TextSegmentOption[] = [
  { value: "normal", label: "Regular", icon: <IconUpright /> },
  { value: "italic", label: "Italic", icon: <IconItalic {...SEGMENT_ICON} /> },
];
const TEXT_DECORATION_OPTIONS: TextSegmentOption[] = [
  { value: "none", label: "No decoration", icon: <IconX {...SEGMENT_ICON} /> },
  { value: "underline", label: "Underline", icon: <IconUnderline {...SEGMENT_ICON} /> },
  { value: "line-through", label: "Strikethrough", icon: <IconStrikethrough {...SEGMENT_ICON} /> },
  { value: "overline", label: "Overline", icon: <IconOverline {...SEGMENT_ICON} /> },
];
const TEXT_TRANSFORM_OPTIONS: TextSegmentOption[] = [
  { value: "none", label: "No transform", icon: <IconX {...SEGMENT_ICON} /> },
  { value: "uppercase", label: "Uppercase", icon: <IconLetterCaseUpper {...SEGMENT_ICON} /> },
  { value: "lowercase", label: "Lowercase", icon: <IconLetterCaseLower {...SEGMENT_ICON} /> },
  { value: "capitalize", label: "Capitalize", icon: <IconLetterCase {...SEGMENT_ICON} /> },
];

const TEXT_BOX_TRIM = "trim-both cap alphabetic";
const TEXT_BOX_OPTIONS: TextSegmentOption[] = [
  { value: "none", label: "Standard", icon: <IconTextBoxNormal /> },
  { value: "trim-both", label: "Cap height to baseline", icon: <IconTextBoxTrim /> },
];
const WRAP_PROPERTIES = ["text-wrap", "text-wrap-mode", "text-wrap-style", "white-space"];
const TRUNCATION_PROPERTIES = ["overflow", "text-overflow", "white-space", "display", "-webkit-line-clamp", "-webkit-box-orient"];

export interface TypographyOptionsProps {
  domElement: HTMLElement;
  editTarget: EditTarget;
  selection?: StyleSelection | null;
  tokenRows: readonly ResolvedProperty[];
  /** Advances when the element's styles are resolved again, so an open menu follows an undo or another field's write. */
  revision: number;
}

/** `text-box` is new; a browser without it gets a disabled control rather than an edit that paints nothing. */
function supportsTextBox(): boolean {
  return typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("text-box", TEXT_BOX_TRIM);
}

/** The text settings used less often than the fields in the section: style, decoration, case, trim, wrapping and truncation. */
export function TypographyOptions(props: TypographyOptionsProps): ReactElement {
  const { domElement, editTarget, selection, tokenRows, revision } = props;
  const [open, setOpen] = useState(false);
  const fieldTarget = { domElement, editTarget, selection, revision };
  const segmented = {
    element: domElement,
    elements: selection?.domElements ?? [domElement],
    editTarget,
    revision,
    testIdPrefix: "typography",
  };

  return (
    <InspectorPopover
      data-test="typography-options"
      side="left"
      align="end"
      triggerTooltip="Text options"
      popupClassName="typography__options-popup"
      triggerElement={(
        <IconButton variant="quiet" size="default" label="Text options" data-active={open} data-test="typography-options">
          <IconAdjustments size={16} stroke={1.8} aria-hidden="true" />
        </IconButton>
      )}
      open={open}
      onOpenChange={setOpen}
    >
      <div className="typography__options" data-test="typography-options-content">
        <div className="editor__title">Text options</div>
        <OptionRow label="Style">
          <TextSegmentedField
            property="font-style"
            label="Style"
            defaultValue="normal"
            options={FONT_STYLE_OPTIONS}
            editMetadata={metadataFor(findTokenRow(tokenRows, "font-style"))}
            {...segmented}
          />
        </OptionRow>
        <OptionRow label="Decoration">
          <TextSegmentedField
            property="text-decoration-line"
            label="Decoration"
            defaultValue="none"
            options={TEXT_DECORATION_OPTIONS}
            editMetadata={metadataFor(findTokenRow(tokenRows, "text-decoration-line"))}
            {...segmented}
          />
        </OptionRow>
        <OptionRow label="Case">
          <TextSegmentedField
            property="text-transform"
            label="Case"
            defaultValue="none"
            options={TEXT_TRANSFORM_OPTIONS}
            editMetadata={metadataFor(findTokenRow(tokenRows, "text-transform"))}
            {...segmented}
          />
        </OptionRow>
        <OptionRow label="Vertical trim">
          <TextSegmentedField
            property="text-box-trim"
            label="Vertical trim"
            defaultValue="none"
            options={TEXT_BOX_OPTIONS}
            write={(value) => [{ property: "text-box", value: value === "none" ? "normal" : TEXT_BOX_TRIM }]}
            disabledReason={supportsTextBox() ? undefined : "This browser does not support text-box trim"}
            {...segmented}
          />
        </OptionRow>
        <OptionRow label="Wrap">
          <StyleSelectField
            label="Wrap"
            dataTest="typography-select-wrap"
            properties={WRAP_PROPERTIES}
            atRuleProperty="text-wrap"
            read={readTextWrap}
            options={() => TEXT_WRAP_CHOICES.map((choice) => ({
              value: choice.value,
              label: choice.label,
              description: choice.description,
              dividerAfter: choice.value === "nowrap",
            }))}
            // SAFETY: the select lists only wrap choices.
            declarations={(_, next) => textWrapDeclarations(next as TextWrap)}
            editMetadata={metadataFor(findTokenRow(tokenRows, "text-wrap"))}
            {...fieldTarget}
          />
        </OptionRow>
        <OptionRow label="Truncate">
          <StyleSelectField
            label="Truncate"
            dataTest="typography-select-truncate"
            properties={TRUNCATION_PROPERTIES}
            read={readTextTruncation}
            options={(current) => (TEXT_TRUNCATIONS.includes(current as TextTruncation) ? TEXT_TRUNCATIONS : [...TEXT_TRUNCATIONS, current])
              .map((option) => ({ value: option, label: truncationLabel(option as TextTruncation) }))}
            // SAFETY: the select lists only truncation values.
            declarations={(current, next) => truncationDeclarations(current as TextTruncation, next as TextTruncation)}
            {...fieldTarget}
          />
        </OptionRow>
      </div>
    </InspectorPopover>
  );
}

interface StyleSelectFieldProps {
  label: string;
  dataTest: string;
  /** The properties the field writes; an inline style on any of them blocks it. */
  properties: readonly string[];
  /** The property whose @media or @supports context the field shows, when it has one. */
  atRuleProperty?: string;
  /** Reads the current choice from the element's styles. */
  read: (style: StyleReader) => string;
  options: (current: string) => SelectOption[];
  /** The declarations that move from the current choice to the next; none means nothing to write. */
  declarations: (current: string, next: string) => StyleDeclaration[];
  editMetadata?: StyleEditMetadata;
  domElement: HTMLElement;
  editTarget: EditTarget;
  selection?: StyleSelection | null;
  revision: number;
}

/** A choice read from several style properties and written as the declarations that reach it, such as wrapping or truncation. */
function StyleSelectField(props: StyleSelectFieldProps): ReactElement {
  const { label, dataTest, properties, atRuleProperty, read, options, declarations, editMetadata, domElement: el, editTarget, selection, revision } = props;
  const blockedBy = inlineBlockedBy(selection?.domElements ?? [el], ...properties);
  const atRules = useFieldAtRules(atRuleProperty ?? "");
  const readCurrent = () => read((property) => getStateStyleValue(el, property));
  const [value, setValue] = useState(readCurrent);

  useEffect(() => {
    setValue(readCurrent());
  }, [el, revision]);

  function handleChange(next: string): void {
    if (blockedBy || next === value) return;
    const changes = declarations(value, next);
    if (changes.length === 0) return;
    setStyles(editTarget, changes, editMetadata);
    setValue(next);
  }

  return (
    <span className="typography__option-select">
      <InlineStyleBlockedTooltip blockedBy={blockedBy}>
        <Select
          data-test={dataTest}
          aria-label={label}
          value={value}
          options={options(value)}
          popupWidth="fit"
          onValueChange={handleChange}
          disabled={blockedBy !== null}
        />
      </InlineStyleBlockedTooltip>
      <AtRuleIndicator atRules={atRules} />
    </span>
  );
}

/** A label on the left and its control on the right; not a `<label>`, which would press the first segment when its text is clicked. */
function OptionRow({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className="typography__option-row" role="group" aria-label={label}>
      <span className="typography__option-label">{label}</span>
      <div className="typography__option-control">{children}</div>
    </div>
  );
}
