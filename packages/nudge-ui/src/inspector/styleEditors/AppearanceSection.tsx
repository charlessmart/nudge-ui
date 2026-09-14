import type { ReactElement } from "react";
import type { TokenEntry } from "../../css/model/index.ts";
import type { ResolvedProperty } from "../../css/model/index.ts";
import type { SelectedElement } from "../selection/selectionStore.ts";
import { BorderRadiusEditor } from "./BorderRadiusEditor.tsx";
import { OpacityEditor } from "./OpacityEditor.tsx";
import type { StyleSelection } from "../selection/styleSelection.ts";

export interface AppearanceSectionProps {
  element: SelectedElement;
  selection?: StyleSelection | null;
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
