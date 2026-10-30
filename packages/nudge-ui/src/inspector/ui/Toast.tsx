import { Toast as BaseToast } from "@base-ui/react/toast";
import { useEffect, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { IconAlertTriangleFilled, IconCircleCheckFilled } from "@tabler/icons-react";
import { portalContainer } from "./portalContainer.ts";
import { useInspectorOpen } from "../shell/openStore.ts";
import { useSketchInteractionActive } from "../canvas/sketch/interaction.ts";
import { useInspectionBarHeight } from "../canvas/debugViewStore.ts";

/** `info` is a plain note with no icon, for things that are neither done nor wrong; `warning` flags a limit the user can't fix here. */
export type ToastTone = "success" | "error" | "warning" | "info";

export interface ShowToastOptions {
  readonly title: string;
  readonly description?: string;
  readonly tone?: ToastTone;
  readonly timeout?: number;
  /** A small picture at the end of the toast, such as the screenshot that was just copied. */
  readonly image?: Blob;
}

interface ToastData {
  readonly image?: Blob;
}

/** Module-level manager so stores and async flows can raise toasts outside React. */
const toastManager = BaseToast.createToastManager<ToastData>();

export function showToast({ title, description, tone = "success", timeout, image }: ShowToastOptions): string {
  return toastManager.add({
    title,
    description,
    type: tone,
    data: image ? { image } : undefined,
    priority: tone === "error" ? "high" : "low",
    timeout: timeout ?? (tone === "error" || tone === "warning" ? 5000 : 2000),
  });
}

function ToastThumbnail({ image }: { readonly image: Blob }): ReactElement | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const next = URL.createObjectURL(image);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [image]);
  return url ? <img className="toast__thumbnail" src={url} alt="" data-test="toast-thumbnail" /> : null;
}

function ToastList(): ReactElement {
  const { toasts } = BaseToast.useToastManager<ToastData>();
  return (
    <>
      {toasts.map((toast) => (
        <BaseToast.Root key={toast.id} toast={toast} className="toast" data-test="toast" data-tone={toast.type}>
          {toast.type === "error" || toast.type === "warning"
            ? <IconAlertTriangleFilled className="toast__icon" size="var(--icon-size-small)" aria-hidden="true" />
            : toast.type === "info"
              ? null
              : <IconCircleCheckFilled className="toast__icon" size="var(--icon-size-small)" aria-hidden="true" />}
          <BaseToast.Content className="toast__content">
            <BaseToast.Title className="toast__title" />
            {toast.description ? <BaseToast.Description className="toast__description" /> : null}
          </BaseToast.Content>
          {toast.data?.image ? <ToastThumbnail image={toast.data.image} /> : null}
        </BaseToast.Root>
      ))}
    </>
  );
}

export function ToastRegion(): ReactElement {
  const inspectorOpen = useInspectorOpen();
  const sketching = useSketchInteractionActive();
  const inspectionBarHeight = useInspectionBarHeight();
  // SAFETY: React passes custom properties through `style`; CSSProperties only lacks a key for them.
  const raise = inspectorOpen && inspectionBarHeight > 0 ? { "--toast-raise": `${inspectionBarHeight}px` } as CSSProperties : undefined;
  return (
    <BaseToast.Provider toastManager={toastManager} limit={3}>
      <BaseToast.Portal container={portalContainer()}>
        <BaseToast.Viewport
          className="toast__viewport"
          data-inspector-open={inspectorOpen ? "true" : "false"}
          data-sketching={sketching ? "true" : "false"}
          data-test="toast-viewport"
          style={raise}
        >
          <ToastList />
        </BaseToast.Viewport>
      </BaseToast.Portal>
    </BaseToast.Provider>
  );
}
