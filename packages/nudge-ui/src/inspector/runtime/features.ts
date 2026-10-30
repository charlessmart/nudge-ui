const ADD_PAGE_FEATURE_KEY = "nudge-ui:feature:add-page";

/** Add page is unfinished, so it stays hidden unless this browser opts in by setting the key to "1". Read from the page's localStorage so it works the same in the extension. */
export function isAddPageEnabled(): boolean {
  try {
    return localStorage.getItem(ADD_PAGE_FEATURE_KEY) === "1";
  } catch {
    return false;
  }
}
