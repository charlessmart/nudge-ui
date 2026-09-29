import type { ReactElement, ReactNode, SVGProps } from "react";

type CanvasToolIconProps = Pick<SVGProps<SVGSVGElement>, "aria-hidden" | "className" | "style"> & {
  readonly size?: string | number;
};

function ToolIconSvg({ size = 24, children, ...props }: CanvasToolIconProps & { readonly children: ReactNode }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      {children}
    </svg>
  );
}

export function DesignPointerFilledIcon(props: CanvasToolIconProps): ReactElement {
  return (
    <ToolIconSvg {...props}>
      <path
        d="M19.8289 10.9379L14.499 12.9999L14.1844 13.1399C13.9474 13.2324 13.7322 13.373 13.5524 13.5529C13.3725 13.7327 13.2319 13.9479 13.1395 14.1849L10.9376 19.8288C10.3047 21.4538 7.97489 21.3668 7.46494 19.6988L3.08331 5.38099C2.65134 3.97101 3.97123 2.65202 5.38111 3.08302L19.6989 7.46496C21.3668 7.97595 21.4537 10.3039 19.8289 10.9379Z"
        fill="currentColor"
      />
    </ToolIconSvg>
  );
}

export function SketchThickIcon(props: CanvasToolIconProps): ReactElement {
  return (
    <ToolIconSvg {...props}>
      <path
        d="M4 15C6 10.03 11.356 4 13 4C17.25 4 7.5 15.958 10 17C12.5 18.042 15.65 10.322 17.4 11.098C19.15 11.875 16.35 18.687 17.1 19.728C17.85 20.769 20.25 18.831 21 17"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </ToolIconSvg>
  );
}

export function PanHandFilledIcon(props: CanvasToolIconProps): ReactElement {
  return (
    <ToolIconSvg {...props}>
      <path
        d="M12.5 2.5C12.6312 2.50003 12.7616 2.52599 12.8828 2.57617C13.004 2.6264 13.1143 2.70024 13.207 2.79297C13.2998 2.88575 13.3736 2.99599 13.4238 3.11719C13.4741 3.23849 13.5 3.36871 13.5 3.5V12C13.5 12.2761 13.724 12.4999 14 12.5C14.2761 12.4999 14.5 12.2761 14.5 12V5.5C14.5 5.23483 14.6055 4.98049 14.793 4.79297C14.9805 4.60555 15.2349 4.50006 15.5 4.5C15.7651 4.50006 16.0196 4.60555 16.207 4.79297C16.3945 4.98049 16.5 5.23484 16.5 5.5V12C16.5 12.2761 16.724 12.4999 17 12.5C17.2761 12.4999 17.5 12.2761 17.5 12V7.5C17.5 7.23483 17.6055 6.9805 17.793 6.79297C17.9805 6.60555 18.2349 6.50006 18.5 6.5C18.7651 6.50006 19.0196 6.60555 19.207 6.79297C19.3945 6.98049 19.5 7.23484 19.5 7.5V16C19.5 17.4585 18.9208 18.8573 17.8897 19.8887C16.8583 20.9201 15.4586 21.4999 14 21.5H12.208C11.2973 21.5001 10.4005 21.2737 9.59865 20.8418C8.79689 20.4098 8.11519 19.786 7.61427 19.0254C7.54921 18.9264 7.48351 18.8269 7.41896 18.7275C7.11837 18.266 6.03484 16.376 4.15041 13.0264C4.0228 12.7994 3.98801 12.5319 4.0547 12.2803C4.12142 12.0287 4.28463 11.8126 4.50783 11.6787C4.7689 11.5222 5.07483 11.4571 5.37697 11.4941C5.67933 11.5313 5.96123 11.6685 6.17677 11.8838L7.6465 13.3535C7.68032 13.3873 7.71897 13.4135 7.7588 13.4355C7.80294 13.4601 7.85033 13.48 7.90138 13.4902C7.96605 13.5031 8.03299 13.5031 8.09767 13.4902C8.15175 13.4795 8.20178 13.4583 8.24806 13.4316C8.28533 13.4102 8.32167 13.3854 8.35353 13.3535C8.38754 13.3195 8.41341 13.2803 8.43556 13.2402C8.46003 13.196 8.48011 13.1488 8.49025 13.0977C8.49663 13.0654 8.50002 13.0327 8.50002 13V5.5C8.50002 5.23483 8.60551 4.98049 8.79298 4.79297C8.98046 4.60555 9.23493 4.50006 9.50002 4.5C9.7651 4.50006 10.0196 4.60555 10.207 4.79297C10.3945 4.98049 10.5 5.23484 10.5 5.5V12C10.5 12.2761 10.724 12.4999 11 12.5C11.2761 12.4999 11.5 12.2761 11.5 12V3.5C11.5 3.3687 11.526 3.23849 11.5762 3.11719C11.6264 2.99599 11.7002 2.88575 11.793 2.79297C11.8857 2.70024 11.996 2.6264 12.1172 2.57617C12.2384 2.526 12.3688 2.50003 12.5 2.5Z"
        fill="currentColor"
      />
    </ToolIconSvg>
  );
}

const SELECT_PLAY_PATH =
  "M8.5241 4.93791C7.85783 4.52789 7 5.00724 7 5.78956V18.2104C7 18.9928 7.85783 19.4721 8.5241 19.0621L18.6161 12.8517C19.2506 12.4612 19.2506 11.5388 18.6161 11.1483L8.5241 4.93791Z";

export function SelectPlayOutlineIcon(props: CanvasToolIconProps): ReactElement {
  return (
    <ToolIconSvg {...props}>
      <path d={SELECT_PLAY_PATH} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </ToolIconSvg>
  );
}

export function SelectPlayFilledIcon(props: CanvasToolIconProps): ReactElement {
  return (
    <ToolIconSvg {...props}>
      <path
        d={SELECT_PLAY_PATH}
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </ToolIconSvg>
  );
}
