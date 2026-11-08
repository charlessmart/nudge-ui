import { useMemo, useState } from "react";
import type { ReactElement } from "react";
import { Menu } from "@base-ui/react/menu";
import { IconChevronRight, IconComponents, IconDots, IconSearch } from "@tabler/icons-react";
import { focusCard, getComponentSheetCards, getSelectedCardId, openComponentSheet, useCanvasCards, useSelectedCardId } from "../canvas/canvasStore.ts";
import { setCanvasPresentation } from "../canvas/viewStore.ts";
import { removeFrame } from "../workspace/commands.ts";
import { useNudgeUiRuntimeConfig } from "../runtime/useRuntimeConfig.ts";
import { setSelectedElement } from "../selection/selectionStore.ts";
import { IconButton } from "../ui/IconButton.tsx";
import { InspectorStyle } from "../ui/InspectorStyle.tsx";
import { portalContainer } from "../ui/portalContainer.ts";
import { TextInput } from "../ui/TextInput.tsx";
import {
  buildProjectTree,
  groupLibraryComponents,
  hiddenLibraryComponents,
  type LibraryComponent,
  type LibraryFolder,
} from "./componentLibrary.ts";
import { useLibraryVisibility } from "./libraryVisibilityClient.ts";
import libraryStyles from "./ComponentLibraryPanel.css?inline";

const AUTO_EXPAND_LIMIT = 40;
// Top-level folders open unless they are vast, so their subfolders are visible on first look.
const TOP_LEVEL_EXPAND_LIMIT = 500;
const SEARCH_LIMIT = 200;
const HIDDEN_FOLDER_ID = "hidden:";

/** The navigator's Components view: every discovered component; choosing one opens its sheet beside the app frames. */
export function ComponentLibraryPanel(): ReactElement {
  const config = useNudgeUiRuntimeConfig();
  const cards = useCanvasCards();
  const selectedCardId = useSelectedCardId();
  const [query, setQuery] = useState("");
  const [toggledFolders, setToggledFolders] = useState<ReadonlySet<string>>(() => new Set());
  const searching = query.trim() !== "";
  // Searching by name is deliberate, so a provider the user types for is found among its folder's matches.
  const { file: visibility, error: visibilityError, setVisibility } = useLibraryVisibility();
  const groups = useMemo(
    () => groupLibraryComponents(config.componentContracts, { query, includeWrappers: searching, visibility }),
    [config.componentContracts, query, searching, visibility],
  );
  const hidden = useMemo(() => hiddenLibraryComponents(config.componentContracts, visibility), [config.componentContracts, visibility]);
  const projectTree = useMemo(() => buildProjectTree(groups), [groups]);
  const pageTree = useMemo(() => buildProjectTree(groups, "page"), [groups]);
  const packages = useMemo(() => [...groups.filter((group) => group.kind === "package")]
    .sort((left, right) => right.components.length - left.components.length || left.label.localeCompare(right.label)), [groups]);

  const selectedCard = cards.find((card) => card.id === selectedCardId);
  const activeComponentId = selectedCard?.content.kind === "component" ? selectedCard.content.componentId : null;
  const sheetIds = new Map(getComponentSheetCards().map((card) => [card.content.kind === "component" ? card.content.componentId : "", card.id]));
  const matches = searching ? groups.flatMap((group) => group.components).sort((left, right) => left.name.localeCompare(right.name)) : [];
  // Small folders start open; large ones (copied prototypes, icon sets) and the Hidden folder start closed so the list stays scannable.
  const isExpanded = (folder: LibraryFolder, depth: number): boolean =>
    (!/^(?:package|page|hidden):/.test(folder.id) && folder.count <= (depth === 0 ? TOP_LEVEL_EXPAND_LIMIT : AUTO_EXPAND_LIMIT))
      !== toggledFolders.has(folder.id);
  const toggleFolder = (id: string): void => setToggledFolders((current) => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    return next;
  });

  function renderItem(component: LibraryComponent, depth: number, showSource = false): ReactElement {
    const contract = { componentId: component.componentId, name: component.name };
    const open = (): void => {
      // The sheet activates the shared components draft, so an application element must not stay selected.
      setSelectedElement(null);
      openComponentSheet(contract);
    };
    const openOnCanvas = (): void => {
      // Placed as its own frame and framed by the camera, whichever view the person was in.
      setCanvasPresentation("canvas");
      open();
    };
    const viewInFocus = (): void => {
      // Entering Focus first lets an open sheet be routed to this component rather than adding a frame.
      setCanvasPresentation("focus");
      setSelectedElement(null);
      focusCard(openComponentSheet(contract).id);
    };
    const sheetId = sheetIds.get(component.componentId);
    const removeFromCanvas = (): void => {
      if (!sheetId) return;
      if (getSelectedCardId() === sheetId) setSelectedElement(null);
      removeFrame(sheetId);
    };
    return (
      <li key={component.componentId} className="component-library__row">
        <button
          type="button"
          className="component-library__item"
          style={{ paddingLeft: `calc(var(--space-8) + ${depth * 12}px)` }}
          data-test="component-library-item"
          data-component-id={component.componentId}
          data-active={component.componentId === activeComponentId ? "true" : undefined}
          title={component.source}
          onClick={open}
        >
          <IconComponents className="component-library__item-icon" size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
          <span className="component-library__item-name">
            {component.name}
            {showSource ? <span className="component-library__item-source">{component.source}</span> : null}
          </span>
        </button>
        <Menu.Root modal={false}>
          <Menu.Trigger
            render={
              <IconButton
                variant="quiet"
                size="compact"
                className="component-library__more"
                label={`More actions for ${component.name}`}
                data-test="component-library-more"
              />
            }
          >
            <IconDots size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
          </Menu.Trigger>
          <Menu.Portal container={portalContainer()}>
            <Menu.Positioner className="inspector-popover__positioner" side="bottom" align="end" sideOffset={4}>
              <Menu.Popup className="inspector-popover__popup component-library__menu" data-test="component-library-menu">
                <Menu.Item className="component-library__menu-item" data-test="component-library-view-in-focus" onClick={viewInFocus}>
                  View in focus
                </Menu.Item>
                {sheetId ? (
                  <Menu.Item
                    className="component-library__menu-item"
                    data-test="component-library-remove-from-canvas"
                    disabled={cards.length < 2}
                    onClick={removeFromCanvas}
                  >
                    Remove from canvas
                  </Menu.Item>
                ) : (
                  <Menu.Item className="component-library__menu-item" data-test="component-library-open-on-canvas" onClick={openOnCanvas}>
                    Open on canvas
                  </Menu.Item>
                )}
                <Menu.Separator className="component-library__menu-separator" />
                <Menu.Item
                  className="component-library__menu-item"
                  data-test="component-library-visibility"
                  onClick={() => setVisibility(component.componentId, component.hidden ? "shown" : "hidden")}
                >
                  {component.hidden ? "Show component in list" : "Hide component from list"}
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </li>
    );
  }

  function renderFolder(folder: LibraryFolder, depth: number): ReactElement {
    const expanded = isExpanded(folder, depth);
    return (
      <li key={folder.id.replace(/:$/, ":root") || "project-root"}>
        <button
          type="button"
          className="component-library__group-toggle"
          style={{ paddingLeft: `calc(var(--space-4) + ${depth * 12}px)` }}
          data-test="component-library-group"
          data-folder-id={folder.id}
          aria-expanded={expanded}
          title={folder.id === HIDDEN_FOLDER_ID ? "Providers and wrappers that render no UI of their own, and anything you hid" : folder.id.replace(/^(?:package|page):/, "")}
          onClick={() => toggleFolder(folder.id)}
        >
          <IconChevronRight className="component-library__group-chevron" size={12} stroke={2} aria-hidden="true" />
          <span>{folder.label}</span>
          <span className="component-library__group-count">{folder.count}</span>
        </button>
        {expanded ? (
          <ul>
            {folder.folders.map((child) => renderFolder(child, depth + 1))}
            {folder.components.map((component) => renderItem(component, depth + 1))}
          </ul>
        ) : null}
      </li>
    );
  }

  return (
    <>
      <InspectorStyle testId="component-library-styles" css={libraryStyles} />
      <div className="component-library" data-test="component-library">
        <div className="component-library__search">
          <IconSearch className="component-library__search-icon" size="var(--icon-size-small)" stroke={1.8} aria-hidden="true" />
          <TextInput
            type="search"
            placeholder="Search components"
            value={query}
            data-test="component-library-search"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="component-library__list">
          {searching ? (
            matches.length === 0 ? (
              <p className="component-library__empty" data-test="component-library-empty">No components match.</p>
            ) : (
              <ul>
                {matches.slice(0, SEARCH_LIMIT).map((component) => renderItem(component, 0, true))}
                {matches.length > SEARCH_LIMIT ? (
                  <li className="component-library__empty">{matches.length - SEARCH_LIMIT} more</li>
                ) : null}
              </ul>
            )
          ) : groups.length === 0 && hidden.length === 0 ? (
            <p className="component-library__empty" data-test="component-library-empty">
              No components found.
            </p>
          ) : (
            <>
              {projectTree.length > 0 ? (
                <section className="component-library__section">
                  <h3 className="component-library__section-label">Project</h3>
                  <ul>{projectTree.map((folder) => renderFolder(folder, 0))}</ul>
                </section>
              ) : null}
              {pageTree.length > 0 ? (
                <section className="component-library__section" data-test="component-library-pages">
                  <h3 className="component-library__section-label">Pages</h3>
                  <ul>{pageTree.map((folder) => renderFolder(folder, 0))}</ul>
                </section>
              ) : null}
              {packages.length > 0 ? (
                <section className="component-library__section">
                  <h3 className="component-library__section-label">Packages</h3>
                  <ul>
                    {packages.map((group) => renderFolder({
                      id: `package:${group.id}`,
                      label: group.label,
                      count: group.components.length,
                      folders: [],
                      components: group.components,
                    }, 0))}
                  </ul>
                </section>
              ) : null}
              {hidden.length > 0 ? (
                <section className="component-library__section" data-test="component-library-hidden">
                  <ul>
                    {renderFolder({ id: HIDDEN_FOLDER_ID, label: "Hidden", count: hidden.length, folders: [], components: hidden }, 0)}
                  </ul>
                </section>
              ) : null}
              {visibilityError ? (
                <p className="component-library__empty" role="alert" data-test="component-library-visibility-error">{visibilityError}</p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </>
  );
}
