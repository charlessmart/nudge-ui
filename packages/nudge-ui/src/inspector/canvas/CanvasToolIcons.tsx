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
