import { useLayoutEffect, type ReactElement } from "react";
import { NUDGE_UI_MOUNT_ID } from "../../transport/routes.ts";
import { adoptStylesheet, allowsStyleElements, releaseAdoptedStylesheet } from "../runtime/ownedStylesheets.ts";

const adoptedUsers = new Map<string, number>();

interface InspectorStyleProps {
  readonly css: string;
  readonly testId?: string;
}

/** Inspector UI styles; adopted into the shadow root when the page's CSP blocks `<style>`. */
export function InspectorStyle({ css, testId }: InspectorStyleProps): ReactElement | null {
  const adopted = typeof document !== "undefined" && !allowsStyleElements(document);

  useLayoutEffect(() => {
    const root = adopted ? document.getElementById(NUDGE_UI_MOUNT_ID)?.shadowRoot : null;
    if (!root) return;
    adoptedUsers.set(css, (adoptedUsers.get(css) ?? 0) + 1);
    adoptStylesheet(root, css, css);
    return () => {
      const users = (adoptedUsers.get(css) ?? 1) - 1;
      if (users > 0) {
        adoptedUsers.set(css, users);
        return;
      }
      adoptedUsers.delete(css);
      releaseAdoptedStylesheet(root, css);
    };
  }, [adopted, css]);

  return adopted ? null : <style data-test={testId}>{css}</style>;
}
