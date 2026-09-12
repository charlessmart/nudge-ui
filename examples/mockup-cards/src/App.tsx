import type { ReactNode } from "react";
import { BorderedGrid } from "./variations/BorderedGrid";
import { DividedList } from "./variations/DividedList";
import { EmphasisSplit } from "./variations/EmphasisSplit";
import { InstitutionGrid } from "./variations/InstitutionGrid";
import { PhotographicCards } from "./variations/PhotographicCards";

const VARIATIONS = [
  { id: "bordered-grid", label: "01 · Bordered grid", render: BorderedGrid },
  { id: "divided-list", label: "02 · Divided list", render: DividedList },
  { id: "institution-grid", label: "03 · Institution grid", render: InstitutionGrid },
  { id: "photographic-cards", label: "04 · Photographic cards", render: PhotographicCards },
  { id: "emphasis-split", label: "05 · Emphasis split", render: EmphasisSplit },
] as const;

export function App(): ReactNode {
  return (
    <div className="page page--stack">
      {VARIATIONS.map(({ id, label, render: Render }) => (
        <div className="variation-block" key={id}>
          <p className="variation-label">{label}</p>
          <Render />
        </div>
      ))}
    </div>
  );
}
