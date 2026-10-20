/** Keep fixture menus in the fixture surface, outside the editing inspector. */
export function portalContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".workbench-preview");
}
