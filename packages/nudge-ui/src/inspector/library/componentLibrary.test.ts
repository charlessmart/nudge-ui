import { describe, expect, it } from "vitest";
import type { ComponentContract } from "../componentSemantics/types.ts";
import { buildProjectTree, groupLibraryComponents, hiddenLibraryComponents } from "./componentLibrary.ts";

function contract(componentId: string, name: string, file: string, options: string[] = []): ComponentContract {
  return {
    componentId,
    name,
    file,
    props: options.length ? [{ name: "variant", control: "select", options, optional: true }] : [],
    provenance: "typescript",
  };
}

describe("groupLibraryComponents", () => {
  const contracts = [
    contract("src/ds/Button.tsx#Button", "Button", "src/ds/Button.tsx", ["primary", "secondary"]),
    contract("src/ds/Badge.tsx#Badge", "Badge", "src/ds/Badge.tsx"),
    contract("react#Suspense", "Suspense", "react"),
    contract("thinking-orbs#ThinkingOrb", "ThinkingOrb", "thinking-orbs", ["idle", "busy", "done"]),
    contract("src/ds/Button.tsx#Button", "Button", "src/ds/Button.tsx", ["primary", "secondary"]),
  ];

  it("groups project components by folder and packages by module", () => {
    expect(groupLibraryComponents(contracts)).toEqual([
      {
        id: "src/ds",
        label: "src/ds",
        kind: "project",
        components: [
          { componentId: "src/ds/Badge.tsx#Badge", name: "Badge", source: "src/ds/Badge.tsx", variantCount: 1, hidden: false },
          { componentId: "src/ds/Button.tsx#Button", name: "Button", source: "src/ds/Button.tsx", variantCount: 2, hidden: false },
        ],
      },
      {
        id: "thinking-orbs",
        label: "thinking-orbs",
        kind: "package",
        components: [{ componentId: "thinking-orbs#ThinkingOrb", name: "ThinkingOrb", source: "thinking-orbs", variantCount: 3, hidden: false }],
      },
    ]);
  });

  it("lists project folders before packages", () => {
    const groups = groupLibraryComponents([
      contract("lucide-react#XIcon", "XIcon", "lucide-react"),
      contract("src/ui/Card.tsx#Card", "Card", "src/ui/Card.tsx"),
    ]);
    expect(groups.map((group) => group.label)).toEqual(["src/ui", "lucide-react"]);
  });

  it("filters by name case-insensitively", () => {
    expect(groupLibraryComponents(contracts, { query: "  bUT " }).flatMap((group) => group.components.map((component) => component.name)))
      .toEqual(["Button"]);
  });
});

describe("buildProjectTree", () => {
  it("collapses single-child chains and single-component folders", () => {
    const groups = groupLibraryComponents([
      contract("app/components/Navigation/NavItem/NavItem#NavItem", "NavItem", "app/components/Navigation/NavItem/NavItem.tsx"),
      contract("app/components/Navigation/Footer/Footer#Footer", "Footer", "app/components/Navigation/Footer/Footer.tsx"),
      contract("app/components/Navigation/Navigation#Navigation", "Navigation", "app/components/Navigation/Navigation.tsx"),
      contract("app/components/PlayButton/PlayButton#PlayButton", "PlayButton", "app/components/PlayButton/PlayButton.tsx"),
      contract("thinking-orbs#ThinkingOrb", "ThinkingOrb", "thinking-orbs"),
    ]);
    const [top] = buildProjectTree(groups);
    expect(top?.label).toBe("app/components");
    expect(top?.count).toBe(4);
    expect(top?.components.map((component) => component.name)).toEqual(["PlayButton"]);
    expect(top?.folders.map((folder) => [folder.label, folder.components.map((component) => component.name)])).toEqual([
      ["Navigation", ["Footer", "Navigation", "NavItem"]],
    ]);
  });
});

describe("library roles", () => {
  const wrapper = { ...contract("src/theme#ThemeProvider", "ThemeProvider", "src/theme.tsx"), role: "wrapper" as const };
  const contracts = [
    wrapper,
    // Read from the package's types, a provider carries a structural role; a manifest has only its name to go on.
    { ...contract("@liveblocks/react#RoomProvider", "RoomProvider", "@liveblocks/react"), role: "wrapper" as const },
    contract("src/ui/Card#Card", "Card", "src/ui/Card.tsx"),
    contract("app/(shop)/cart/page#CartPage", "CartPage", "app/(shop)/cart/page.tsx"),
    contract("app/layout#RootLayout", "RootLayout", "app/layout.tsx"),
    contract("app/routes/settings#Settings", "Settings", "app/routes/settings.tsx"),
    contract("app/components/Nav#Nav", "Nav", "app/components/Nav.tsx"),
  ];

  it("hides wrappers unless asked and lists them apart", () => {
    const names = (options = {}): string[] =>
      groupLibraryComponents(contracts, options).flatMap((group) => group.components.map((component) => component.name));
    expect(names()).not.toContain("ThemeProvider");
    expect(names()).not.toContain("RoomProvider");
    expect(names({ includeWrappers: true })).toEqual(expect.arrayContaining(["ThemeProvider", "RoomProvider"]));
    expect(hiddenLibraryComponents([...contracts, wrapper])).toHaveLength(2);
  });

  it("separates route pages and layouts from components", () => {
    const groups = groupLibraryComponents(contracts);
    expect(groups.map((group) => [group.kind, group.label])).toEqual([
      ["project", "app/components"],
      ["project", "src/ui"],
      ["page", "app"],
      ["page", "app/(shop)/cart"],
      ["page", "app/routes"],
    ]);
    const pages = buildProjectTree(groups, "page");
    expect(pages.map((folder) => [folder.id, folder.label, folder.count])).toEqual([["page:app", "app", 3]]);
    const projectNames = buildProjectTree(groups).flatMap((folder) => folder.components.map((component) => component.name));
    expect(projectNames).toEqual(["Card", "Nav"]);
  });
});

describe("library visibility", () => {
  const provider: ComponentContract = { ...contract("pkg#SettingsProvider", "SettingsProvider", "pkg", ["a", "b"]), role: "wrapper" };
  const typedLookalike = contract("pkg#ErrorBoundary", "ErrorBoundary", "pkg", ["a", "b"]);
  const manifestLookalike: ComponentContract = { ...contract("pkg#RoomProvider", "RoomProvider", "pkg", ["a", "b"]), provenance: "package-manifest" };
  const card = contract("src/ui/Card#Card", "Card", "src/ui/Card.tsx", ["a", "b"]);
  const all = [provider, typedLookalike, manifestLookalike, card];
  const names = (options = {}): string[] =>
    groupLibraryComponents(all, options).flatMap((group) => group.components.map((component) => component.name)).sort();

  it("trusts a contract's own role, and a name only where no types were read", () => {
    // A typed contract without a role was judged a real component, so its name is not held against it.
    expect(names()).toEqual(["Card", "ErrorBoundary"]);
    expect(hiddenLibraryComponents(all).map((component) => component.name)).toEqual(["RoomProvider", "SettingsProvider"]);
  });

  it("lets the user hide a detected component and restore a detected wrapper", () => {
    const visibility = { hidden: ["src/ui/Card#Card"], shown: ["pkg#SettingsProvider"] };
    expect(names({ visibility })).toEqual(["ErrorBoundary", "SettingsProvider"]);
    expect(hiddenLibraryComponents(all, visibility).map((component) => component.name)).toEqual(["Card", "RoomProvider"]);
  });

  it("marks hidden components when they are listed", () => {
    const listed = groupLibraryComponents(all, { includeWrappers: true, visibility: { hidden: ["src/ui/Card#Card"] } })
      .flatMap((group) => group.components);
    expect(listed.filter((component) => component.hidden).map((component) => component.name).sort())
      .toEqual(["Card", "RoomProvider", "SettingsProvider"]);
  });

  it("prefers hidden when a component is in both lists", () => {
    expect(names({ visibility: { hidden: ["src/ui/Card#Card"], shown: ["src/ui/Card#Card"] } })).toEqual(["ErrorBoundary"]);
  });
});
