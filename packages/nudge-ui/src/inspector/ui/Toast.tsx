import { Toast as BaseToast } from "@base-ui/react/toast";
import type { ReactElement } from "react";
import { IconAlertTriangleFilled, IconCircleCheckFilled } from "@tabler/icons-react";
import { portalContainer } from "./portalContainer.ts";
import { useInspectorOpen } from "../shell/openStore.ts";

export type ToastTone = "success" | "error";

export interface ShowToastOptions {
  readonly title: string;
  readonly description?: string;
  readonly tone?: ToastTone;
  readonly timeout?: number;
}

/** Module-level manager so stores and async flows can raise toasts outside React. */
const toastManager = BaseToast.createToastManager();

export function showToast({ title, description, tone = "success", timeout }: ShowToastOptions): string {
  return toastManager.add({
    title,
    description,
    type: tone,
    priority: tone === "error" ? "high" : "low",
    timeout: timeout ?? (tone === "error" ? 5000 : 2000),
  });
}

function ToastList(): ReactElement {
  const { toasts } = BaseToast.useToastManager();
  return (
    <>
      {toasts.map((toast) => (
        <BaseToast.Root key={toast.id} toast={toast} className="toast" data-test="toast" data-tone={toast.type}>
          {toast.type === "error"
            ? <IconAlertTriangleFilled className="toast__icon" size="var(--icon-size-small)" aria-hidden="true" />
            : <IconCircleCheckFilled className="toast__icon" size="var(--icon-size-small)" aria-hidden="true" />}
          <BaseToast.Content className="toast__content">
            <BaseToast.Title className="toast__title" />
            {toast.description ? <BaseToast.Description className="toast__description" /> : null}
          </BaseToast.Content>
        </BaseToast.Root>
      ))}
    </>
  );
}

/**
 * Renders inspector toasts inside the inspector's shadow root, centered above
 * the canvas toolbar in the space the inspector panel leaves free.
 */
export function ToastRegion(): ReactElement {
  const inspectorOpen = useInspectorOpen();
  return (
    <BaseToast.Provider toastManager={toastManager} limit={3}>
      <BaseToast.Portal container={portalContainer()}>
        <BaseToast.Viewport
          className="toast__viewport"
          data-inspector-open={inspectorOpen ? "true" : "false"}
          data-test="toast-viewport"
        >
          <ToastList />
        </BaseToast.Viewport>
      </BaseToast.Portal>
    </BaseToast.Provider>
  );
}
