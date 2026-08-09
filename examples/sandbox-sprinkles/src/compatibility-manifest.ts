import type { CompatibilityManifest } from "@design-tool/compatibility";

const brandProperty = {
  property: "color",
  authoredPattern: "^var\\(--[A-Za-z0-9_-]+\\)$",
  computed: "rgb(18, 52, 86)",
  token: "theme.color.brand",
  capability: "color" as const,
};

const brandControl = {
  property: "color",
  kind: "token" as const,
  activeToken: "theme.color.brand",
  suggestionsContain: ["theme.color.brand", "theme.color.accent", "theme.color.emphasis"],
};

export const compatibilityManifest: CompatibilityManifest = {
  name: "real vanilla-extract and Sprinkles",
  expectedCaseIds: ["spacing-padding", "typography-size", "color-background", "border-width", "layout-width"],
  scenarios: [
    {
      id: "corpus-spacing",
      caseId: "spacing-padding",
      path: "/examples",
      selector: '[data-test="examples-spacing-spr-01"] .spacing-specimen',
      properties: [{ property: "padding-top" }],
    },
    {
      id: "corpus-typography",
      caseId: "typography-size",
      path: "/examples",
      selector: '[data-test="examples-typography-spr-01"] .typography-specimen',
      properties: [{ property: "font-size" }],
    },
    {
      id: "corpus-color",
      caseId: "color-background",
      path: "/examples",
      selector: '[data-test="examples-color-spr-01"] .color-specimen',
      properties: [{ property: "background-color" }],
    },
    {
      id: "corpus-border",
      caseId: "border-width",
      path: "/examples",
      selector: '[data-test="examples-border-spr-01"] .border-specimen',
      properties: [{ property: "border-top-width" }],
    },
    {
      id: "corpus-layout",
      caseId: "layout-width",
      path: "/examples",
      selector: '[data-test="examples-layout-spr-01"] .layout-specimen',
      properties: [{ property: "width" }],
    },
    {
      id: "compiled-short-hash",
      selector: "#compiled-brand",
      catalog: [{
        name: "theme.color.brand",
        adapter: "vanilla-extract",
        cssNamePattern: "^--[A-Za-z0-9_-]{7,}$",
        declaration: {
          value: "#123456",
          sourcePattern: "theme\\.css\\.ts",
          selectorPattern: "^\\.[a-zA-Z0-9_-]+$",
        },
      }],
      properties: [brandProperty],
      controls: [brandControl],
      edit: {
        property: "color",
        selectToken: "theme.color.accent",
        computedAfter: "rgb(171, 205, 239)",
        promptContains: ["theme.color.brand", "theme.color.accent", "vanilla-extract (sprinkles)"],
        revertTo: "rgb(18, 52, 86)",
      },
    },
    {
      id: "css-order-before",
      selector: "#order-before",
      properties: [brandProperty],
      controls: [brandControl],
    },
    {
      id: "css-order-after",
      selector: "#order-after",
      properties: [brandProperty],
      controls: [brandControl],
    },
    {
      id: "alias-chain",
      selector: "#compiled-alias",
      properties: [{
        property: "color",
        authoredPattern: "^var\\(--[A-Za-z0-9_-]+\\)$",
        computed: "rgb(18, 52, 86)",
        token: "theme.color.emphasis",
        tokens: ["theme.color.emphasis"],
        capability: "color",
      }],
      controls: [{
        property: "color",
        kind: "token",
        activeToken: "theme.color.emphasis",
        suggestionsContain: ["theme.color.brand", "theme.color.accent"],
      }],
    },
    {
      id: "before-rerender",
      selector: "#compiled-brand",
      properties: [brandProperty],
      controls: [brandControl],
    },
    {
      id: "after-rerender",
      selector: "#compiled-brand",
      beforeInspect: { kind: "call-window-hook", name: "__compatRerender" },
      properties: [brandProperty],
      controls: [brandControl],
    },
  ],
  invariants: [
    {
      id: "unrelated-css-order-does-not-change-attribution",
      left: "css-order-before",
      right: "css-order-after",
      property: "color",
      equal: ["authored", "computed", "tokenName", "capability", "confidence"],
      equalSuggestions: true,
    },
    {
      id: "rerender-keeps-semantic-attribution",
      left: "before-rerender",
      right: "after-rerender",
      property: "color",
      equal: ["authored", "computed", "tokenName", "capability", "confidence"],
      equalSuggestions: true,
    },
  ],
};
