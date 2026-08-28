import type { ReactElement } from "react";
import type { TokenEntry } from "virtual:design-tokens";
import type { ResolvedProperty } from "@nudge-ui/css/model";
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
    <section className="editor appearance" data-test="appearance-section">
      <div className="editor__title">Appearance</div>
      <div className="appearance__fields">
        <OpacityEditor {...props} />
        <BorderRadiusEditor {...props} embedded />
      </div>
    </section>
  );
}
