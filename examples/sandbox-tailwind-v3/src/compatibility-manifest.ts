import { CSS_LIBRARY_CORPUS, type CompatibilityManifest } from "@nudge-ui/compatibility";

export const compatibilityManifest: CompatibilityManifest = {
  name: "real Tailwind v3",
  expectedCaseIds: CSS_LIBRARY_CORPUS,
  scenarios: [
    { id: "spacing", caseId: "spacing-padding", path: "/examples", selector: '[data-test="examples-spacing-tw3-01"] .spacing-specimen', properties: [{ property: "padding-top" }] },
    { id: "typography", caseId: "typography-size", path: "/examples", selector: '[data-test="examples-typography-tw3-01"] .typography-specimen', properties: [{ property: "font-size" }] },
    { id: "color", caseId: "color-background", path: "/examples", selector: '[data-test="examples-color-tw3-01"] .color-specimen', properties: [{ property: "background-color" }] },
    { id: "border", caseId: "border-width", path: "/examples", selector: '[data-test="examples-border-tw3-01"] .border-specimen', properties: [{ property: "border-top-width" }] },
    { id: "layout", caseId: "layout-width", path: "/examples", selector: '[data-test="examples-layout-tw3-01"] .layout-specimen', properties: [{ property: "width" }] },
  ],
};
