import type { ReactElement } from "react";

/** A capital A: cap height at y 5.86, baseline at y 18.16. */
const CAPITAL_A = "M7.79346 18.1577C7.01318 18.1577 6.52344 17.7012 6.52344 16.979C6.52344 16.7715 6.58154 16.4893 6.68945 16.1821L9.95996 7.27539C10.3086 6.3042 10.8979 5.85596 11.8442 5.85596C12.8237 5.85596 13.4048 6.2876 13.7617 7.26709L17.0488 16.1821C17.165 16.5059 17.2065 16.73 17.2065 16.979C17.2065 17.668 16.6836 18.1577 15.9531 18.1577C15.2476 18.1577 14.874 17.834 14.6499 17.0537L14.019 15.1611H9.69434L9.06348 17.0288C8.83105 17.8257 8.45752 18.1577 7.79346 18.1577ZM10.2422 13.2188H13.438L11.8525 8.31299H11.7944L10.2422 13.2188Z";

/** Line height: a letter between two rules, on the icon grid with the shared stroke width; the colour follows the field's leading style. */
export function IconLineHeight(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      width="var(--icon-size-small)"
      height="var(--icon-size-small)"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="var(--icon-stroke-width)"
      aria-hidden="true"
    >
      <path d="M20 20.5L4 20.5" />
      <path d="M20 3.5L4 3.5" />
      <path
        fill="currentColor"
        stroke="none"
        d={CAPITAL_A}
      />
    </svg>
  );
}

/** Letter spacing: a letter between two uprights, drawn like the line height icon. */
export function IconLetterSpacing(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      width="var(--icon-size-small)"
      height="var(--icon-size-small)"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="var(--icon-stroke-width)"
      aria-hidden="true"
    >
      <path d="M3.5 20L3.5 4" />
      <path d="M20.5 20L20.5 4" />
      <path
        fill="currentColor"
        stroke="none"
        d="M10.98 17.1411C9.28662 17.1411 8 16.0454 8 14.4434C8 12.8247 9.24512 11.8867 11.4697 11.7539L13.7109 11.6211V11.0317C13.7109 10.2017 13.1299 9.72021 12.2168 9.72021C11.478 9.72021 11.0298 9.96094 10.4902 10.6582C10.2246 10.957 9.91748 11.1064 9.52734 11.1064C8.93799 11.1064 8.51465 10.7246 8.51465 10.1768C8.51465 9.98584 8.55615 9.81152 8.63916 9.62891C9.0542 8.56641 10.4819 7.91064 12.3247 7.91064C14.6074 7.91064 16.0933 9.08936 16.0933 10.8823V15.9541C16.0933 16.7593 15.6035 17.1743 14.9146 17.1743C14.2588 17.1743 13.8022 16.8091 13.7524 16.0952V15.6387H13.7026C13.2046 16.585 12.0923 17.1411 10.98 17.1411ZM11.7769 15.3896C12.8394 15.3896 13.7109 14.7007 13.7109 13.7378V13.0903L11.835 13.2065C10.9302 13.2729 10.4155 13.6797 10.4155 14.3105C10.4155 14.9746 10.9634 15.3896 11.7769 15.3896Z"
      />
    </svg>
  );
}

/** Regular style: an upright I with the same serifs as Tabler's italic I, so the two read as a pair. */
export function IconUpright(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      <path d="M9 5h6M12 5v14M9 19h6" />
    </svg>
  );
}

function TextBoxIcon({ trimmed }: { trimmed: boolean }): ReactElement {
  // Untrimmed, the box keeps the line's space above and below the letter; trimmed, its edges meet the cap height and baseline.
  const [top, bottom] = trimmed ? [4.25, 19.75] : [2, 22];
  return (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="var(--icon-stroke-width)"
      aria-hidden="true"
    >
      <path d={`M20 ${top}L4 ${top}M20 ${bottom}L4 ${bottom}`} />
      <path
        fill="currentColor"
        stroke="none"
        transform={trimmed ? undefined : "translate(12 12) scale(0.78) translate(-11.86 -12)"}
        d={CAPITAL_A}
      />
    </svg>
  );
}

/** Vertical trim off: the line box keeps its space above and below the text. */
export function IconTextBoxNormal(): ReactElement {
  return <TextBoxIcon trimmed={false} />;
}

/** Vertical trim on: the box edges sit on the cap height and the baseline. */
export function IconTextBoxTrim(): ReactElement {
  return <TextBoxIcon trimmed />;
}
