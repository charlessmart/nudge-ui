import type { ComponentContract, ComponentPropContract, ComponentPropValue } from "../inspector/componentSemantics/types.ts";

export type SheetProps = Record<string, ComponentPropValue>;

export interface SheetRow {
  label: string;
  props: SheetProps;
}

export interface SheetColumn {
  /** Value of `data-nudge-ui-sheet-state` on the cell. */
  state: string;
  label: string;
  props: SheetProps;
}

export interface DocumentPseudos {
  hover: boolean;
  focus: boolean;
  active: boolean;
  disabled: boolean;
}

export const MAX_SHEET_ROWS = 32;

const TEXT_PLACEHOLDERS: Readonly<Record<string, string>> = {
  children: "Label",
  label: "Label",
  title: "Title",
  text: "Text",
  placeholder: "Placeholder",
};

const STATE_PROPS = [
  "loading",
  "checked",
  "selected",
  "open",
  "invalid",
  "error",
  "indeterminate",
  "pressed",
];

/** A contract default that is one of the options, else the first option. */
function baselineOption(select: ComponentPropContract): ComponentPropValue {
  const preferred = select.defaultValue;
  return preferred !== undefined && select.options.includes(preferred) ? preferred : select.options[0]!;
}

// Design systems name their main axes consistently, so those lead the rows instead of whatever prop is declared first.
const VARIANT_AXES = ["variant", "kind", "type", "appearance", "intent", "tone", "color", "colorscheme", "emphasis", "priority", "level", "status"];
const SIZE_AXES = ["size", "density", "scale"];

function axisRank(name: string): number {
  const key = name.toLowerCase();
  const variant = VARIANT_AXES.indexOf(key);
  if (variant >= 0) return variant;
  if (SIZE_AXES.includes(key)) return VARIANT_AXES.length;
  return VARIANT_AXES.length + 1;
}

/** Select props in sheet order: variant-like axes, then size, then the rest as declared. */
export function rankSelectProps<T extends ComponentPropContract>(props: readonly T[]): T[] {
  return props
    .map((prop, index) => ({ prop, index }))
    .sort((left, right) => axisRank(left.prop.name) - axisRank(right.prop.name) || left.index - right.index)
    .map(({ prop }) => prop);
}

function selectProps(contract: ComponentContract): ComponentPropContract[] {
  return rankSelectProps(contract.props.filter((prop) => prop.control === "select" && prop.options.length > 0));
}

/** Fixed props shared by every cell: placeholder text and required non-select values. */
export function baseSheetProps(contract: ComponentContract): SheetProps {
  const props: SheetProps = {};
  for (const prop of contract.props) {
    if (prop.control === "text") {
      const placeholder = TEXT_PLACEHOLDERS[prop.name];
      if (placeholder !== undefined) props[prop.name] = placeholder;
      else if (!prop.optional) props[prop.name] = prop.name;
    } else if (prop.control === "boolean" && !STATE_PROPS.includes(prop.name)) {
      if (typeof prop.defaultValue === "boolean") props[prop.name] = prop.defaultValue;
      else if (!prop.optional) props[prop.name] = false;
    }
  }
  return props;
}

function combinations(selects: readonly ComponentPropContract[]): SheetProps[] {
  let rows: SheetProps[] = [{}];
  for (const select of selects) {
    rows = rows.flatMap((row) => select.options.map((option) => ({ ...row, [select.name]: option })));
  }
  return rows;
}

/** The leading axes whose full product fits on a sheet; the rest stay at their baseline value. */
// A long select that is not a named variant or size axis is usually a pass-through style token (every colour, every
// spacing step), which would flood the sheet without describing the component's own variants.
const MAX_INCIDENTAL_OPTIONS = 12;

function isSheetAxis(select: ComponentPropContract): boolean {
  return select.options.length > 1
    && (axisRank(select.name) <= VARIANT_AXES.length || select.options.length <= MAX_INCIDENTAL_OPTIONS);
}

function sheetAxes(selects: readonly ComponentPropContract[]): ComponentPropContract[] {
  const axes: ComponentPropContract[] = [];
  let product = 1;
  for (const select of selects.filter(isSheetAxis)) {
    if (product * select.options.length > MAX_SHEET_ROWS) break;
    product *= select.options.length;
    axes.push(select);
  }
  return axes;
}

function rowsFor(selects: readonly ComponentPropContract[]): SheetRow[] {
  if (selects.length === 0) return [{ label: "Default", props: {} }];
  const baseline: SheetProps = {};
  for (const select of selects) baseline[select.name] = baselineOption(select);
  const axes = sheetAxes(selects);
  const first = selects.find(isSheetAxis);
  // A first axis too long for one sheet still shows its leading options.
  const shown = axes.length > 0 ? axes : first ? [{ ...first, options: first.options.slice(0, MAX_SHEET_ROWS) }] : [];
  const combos = combinations(shown).map((props) => ({ ...baseline, ...props }));
  return combos.map((props) => ({
    label: shown.length ? shown.map((select) => String(props[select.name])).join(" · ") : "Default",
    props,
  }));
}

/** How many variant combinations a sheet lays out, for the library's count. */
export function sheetVariantCount(contract: ComponentContract): number {
  return sheetAxes(selectProps(contract)).reduce((count, select) => count * select.options.length, 1);
}

export function planSheetRows(contract: ComponentContract): SheetRow[] {
  return rowsFor(selectProps(contract));
}

/**
 * Rows of variants against columns of states. A component with no styled states would be one long column,
 * so its last multi-value prop becomes the columns instead, as in a Figma variant grid.
 */
export function planSheetLayout(
  contract: ComponentContract,
  pseudos: DocumentPseudos,
): { rows: SheetRow[]; columns: SheetColumn[] } {
  const columns = planSheetColumns(contract, pseudos);
  const selects = selectProps(contract);
  const axes = sheetAxes(selects);
  const pivot = axes.at(-1);
  if (columns.length > 1 || axes.length < 2 || !pivot || pivot.options.length > 8) {
    return { rows: rowsFor(selects), columns };
  }
  return {
    rows: rowsFor(selects.filter((select) => select !== pivot)),
    columns: pivot.options.map((option) => ({ state: "base", label: String(option), props: { [pivot.name]: option } })),
  };
}

export function planSheetColumns(
  contract: ComponentContract,
  pseudos: DocumentPseudos,
): SheetColumn[] {
  const columns: SheetColumn[] = [{ state: "base", label: "default", props: {} }];
  if (pseudos.hover) columns.push({ state: "hover", label: "hover", props: {} });
  if (pseudos.focus) columns.push({ state: "focus-visible", label: "focus", props: {} });
  if (pseudos.active) columns.push({ state: "active", label: "active", props: {} });
  const hasDisabledProp = contract.props.some(
    (prop) => prop.name === "disabled" && prop.control === "boolean",
  );
  if (hasDisabledProp) columns.push({ state: "disabled", label: "disabled", props: { disabled: true } });
  else if (pseudos.disabled) columns.push({ state: "disabled", label: "disabled", props: {} });
  for (const prop of contract.props) {
    if (prop.control === "boolean" && prop.name !== "disabled" && STATE_PROPS.includes(prop.name)) {
      columns.push({ state: prop.name, label: prop.name, props: { [prop.name]: true } });
    }
  }
  return columns;
}

export function cellProps(
  contract: ComponentContract,
  row: SheetRow,
  column: SheetColumn,
): SheetProps {
  return { ...baseSheetProps(contract), ...row.props, ...column.props };
}
