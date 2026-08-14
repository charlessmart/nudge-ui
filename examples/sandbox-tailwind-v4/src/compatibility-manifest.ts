import { CSS_LIBRARY_CORPUS, type CompatibilityManifest } from "@design-tool/compatibility";

export const compatibilityManifest: CompatibilityManifest = {
  name: "real Tailwind v4",
  expectedCaseIds: CSS_LIBRARY_CORPUS,
  scenarios: [
    { id: "spacing", caseId: "spacing-padding", path: "/examples", selector: '[data-test="examples-spacing-tw4-01"] .spacing-specimen', properties: [{ property: "padding-top" }] },
    { id: "typography", caseId: "typography-size", path: "/examples", selector: '[data-test="examples-typography-tw4-01"] .typography-specimen', properties: [{ property: "font-size" }] },
    { id: "color", caseId: "color-background", path: "/examples", selector: '[data-test="examples-color-tw4-01"] .color-specimen', properties: [{ property: "background-color" }] },
    { id: "border", caseId: "border-width", path: "/examples", selector: '[data-test="examples-border-tw4-01"] .border-specimen', properties: [{ property: "border-top-width" }] },
    { id: "layout", caseId: "layout-width", path: "/examples", selector: '[data-test="examples-layout-tw4-01"] .layout-specimen', properties: [{ property: "width" }] },
  ],
};
