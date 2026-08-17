import type { ReactElement } from "react";
import type { TokenEntry } from "virtual:design-tokens";
import type { ResolvedProperty } from "@design-tool/css/model";
import type { SelectedElement } from "../selectionStore.ts";
import { BorderRadiusEditor } from "./BorderRadiusEditor.tsx";
import { OpacityEditor } from "./OpacityEditor.tsx";

export interface AppearanceSectionProps {
  element: SelectedElement;
  entries?: TokenEntry[];
  tokenRows?: ResolvedProperty[];
  onAfterEdit?: () => void;
}

export function AppearanceSection(props: AppearanceSectionProps): ReactElement {
  return (
    <section className="dt-editor dt-appearance" data-test="appearance-section">
      <div className="dt-editor__title">Appearance</div>
      <div className="dt-appearance__fields">
        <OpacityEditor {...props} />
        <BorderRadiusEditor {...props} embedded />
      </div>
    </section>
  );
}
