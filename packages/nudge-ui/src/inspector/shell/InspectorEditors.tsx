import type { ReactElement } from "react";
import type { ResolvedProperty, TokenEntry } from "../../css/model/index.ts";
import type { SelectedElement } from "../selection/selectionStore.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";
import type { InteractionState } from "./styleState.ts";
import { findTokenRow } from "../styleEditors/rowLookup.ts";
import { Typography } from "../styleEditors/Typography.tsx";
import { BackgroundEditor } from "../styleEditors/BackgroundEditor.tsx";
import { ColorPicker } from "../styleEditors/ColorPicker.tsx";
import { BorderEditor } from "../styleEditors/BorderEditor.tsx";
import { AppearanceSection } from "../styleEditors/AppearanceSection.tsx";
import { BoxShadowEditor } from "../styleEditors/BoxShadowEditor.tsx";
import { LayoutSection } from "../styleEditors/LayoutSection.tsx";
import { AtRuleContextProvider } from "../ui/AtRuleContext.tsx";

export interface InspectorEditorsProps {
  readonly selected: SelectedElement;
  readonly styleSelection: StyleSelection | null;
  readonly tokenEntries: TokenEntry[];
  readonly tokenRows: ResolvedProperty[];
  readonly styleState: InteractionState;
  readonly showText: boolean;
  /** The page carries only inherited and canvas styles; box and structure editors do not apply. */
  readonly pageTarget?: boolean;
  readonly backgroundTokenRow: ResolvedProperty | null;
}

/** Composes the same style editors for the live inspector and fixture hosts. */
export function InspectorEditors({ selected, styleSelection, tokenEntries, tokenRows, styleState, showText, pageTarget = false, backgroundTokenRow }: InspectorEditorsProps): ReactElement {
  if (pageTarget) {
    return (
      <AtRuleContextProvider rows={tokenRows}>
        <div className="style-editors" data-test="style-editors">
          <Typography key={`type-${styleState}`} element={selected} selection={styleSelection} entries={tokenEntries} tokenRows={tokenRows} />
          <ColorPicker key={`color-${styleState}`} element={selected} selection={styleSelection} property="color" entries={tokenEntries} tokenRow={findTokenRow(tokenRows, "color")} />
          <BackgroundEditor key={`background-${styleState}`} element={selected} selection={styleSelection} entries={tokenEntries} tokenRow={backgroundTokenRow} />
        </div>
      </AtRuleContextProvider>
    );
  }
  return (
    <AtRuleContextProvider rows={tokenRows}>
      <div className="style-editors" data-test="style-editors">
        {/* Editors publish changes through the draft store and browser inspection. */}
        <LayoutSection key={`layout-${styleState}`} element={selected} selection={styleSelection} entries={tokenEntries} tokenRows={tokenRows} />
        <AppearanceSection key={`appearance-${styleState}`} element={selected} selection={styleSelection} entries={tokenEntries} tokenRows={tokenRows} />
        {showText ? <>
          <Typography key={`type-${styleState}`} element={selected} selection={styleSelection} entries={tokenEntries} tokenRows={tokenRows} />
          <ColorPicker key={`color-${styleState}`} element={selected} selection={styleSelection} property="color" entries={tokenEntries} tokenRow={findTokenRow(tokenRows, "color")} />
        </> : null}
        <BackgroundEditor key={`background-${styleState}`} element={selected} selection={styleSelection} entries={tokenEntries} tokenRow={backgroundTokenRow} />
        <BorderEditor key={`border-${styleState}`} element={selected} selection={styleSelection} entries={tokenEntries} tokenRows={tokenRows} />
        <BoxShadowEditor key={`box-shadow-${styleState}`} element={selected} selection={styleSelection} entries={tokenEntries} tokenRows={tokenRows} />
      </div>
    </AtRuleContextProvider>
  );
}
