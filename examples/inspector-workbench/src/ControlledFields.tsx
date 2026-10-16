import { useState, type ReactElement } from "react";
import { TokenValueField } from "@inspector/tokens/TokenField.tsx";
import { FieldRow } from "@inspector/ui/FieldRow.tsx";
import { ControlSurface } from "@inspector/ui/ControlSurface.tsx";

const initialFields = [
  { property: "opacity", label: "Opacity", value: "80%", token: null as string | null, mixed: false },
  { property: "border-radius", label: "Radius", value: "12px", token: "--fixture-radius" as string | null, mixed: false },
  { property: "font-size", label: "Font size", value: "16px", token: null as string | null, mixed: true },
  { property: "color", label: "Color", value: "#315bce", token: null as string | null, mixed: false },
];
const entries = [
  { name: "--fixture-radius", value: "12px", source: "workbench" },
  { name: "--fixture-radius-large", value: "24px", source: "workbench" },
  { name: "--fixture-accent", value: "#315bce", source: "workbench" },
];

/** Interactive fixtures use the same value controls as production TokenField. */
export function ControlledFields(): ReactElement {
  const [fields, setFields] = useState(initialFields);
  function update(property: string, value: string, token: string | null): void {
    setFields((current) => current.map((field) => field.property === property ? { ...field, value, token, mixed: false } : field));
  }
  return <section className="editor" data-test="controlled-fields">
    <div className="editor__title">Controlled fields</div>
    {fields.map((field) => <FieldRow key={field.property} label={field.label}>
      <ControlSurface>
        <TokenValueField
          property={field.property} label={field.label} committedValue={field.mixed ? "Mixed" : field.value}
          activeTokenName={field.token} entries={entries} mixed={field.mixed}
          isColor={field.property === "color"}
          onCommitRaw={(value) => update(field.property, value, null)}
          onSelectToken={(token) => update(field.property, token.value, token.name)}
          onUnlink={(value) => update(field.property, value, null)}
        />
      </ControlSurface>
    </FieldRow>)}
  </section>;
}
