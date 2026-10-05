import foundationStyles from "./Foundation.css?inline";

export type RendererCursor = "design" | "drag" | "comment";

/** Custom property the renderer sets on its root to drive the interaction cursor. */
export const INTERACTION_CURSOR_PROPERTY = "--nudge-ui-interaction-cursor";

const DESIGN_SELECT_CURSOR_SVG = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
<g clip-path="url(#clip0_1681_15)">
<g filter="url(#filter0_d_1681_15)">
<path d="M17.3586 9.11501L12.9167 10.8333L12.6544 10.95C12.457 11.0271 12.2776 11.1443 12.1278 11.2942C11.9779 11.444 11.8607 11.6234 11.7836 11.8208L9.94861 16.5242C9.42111 17.8783 7.47944 17.8058 7.05444 16.4158L3.40277 4.48418C3.04277 3.30918 4.14277 2.21001 5.31777 2.56918L17.2503 6.22085C18.6403 6.64668 18.7128 8.58668 17.3586 9.11501Z" fill="black"/>
<path d="M17.3586 9.11501L12.9167 10.8333L12.6544 10.95C12.457 11.0271 12.2776 11.1443 12.1278 11.2942C11.9779 11.444 11.8607 11.6234 11.7836 11.8208L9.94861 16.5242C9.42111 17.8783 7.47944 17.8058 7.05444 16.4158L3.40277 4.48418C3.04277 3.30918 4.14277 2.21001 5.31777 2.56918L17.2503 6.22085C18.6403 6.64668 18.7128 8.58668 17.3586 9.11501Z" stroke="white" stroke-linecap="round" stroke-linejoin="round"/>
</g>
</g>
<defs>
<filter id="filter0_d_1681_15" x="0.332611" y="0.332662" width="21.002" height="21.0009" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset dy="0.833333"/>
<feGaussianBlur stdDeviation="1.25"/>
<feComposite in2="hardAlpha" operator="out"/>
<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"/>
<feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_1681_15"/>
<feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_1681_15" result="shape"/>
</filter>
<clipPath id="clip0_1681_15">
<rect width="20" height="20" fill="white"/>
</clipPath>
</defs>
</svg>`;

/** Rendered size and hotspot of the drag cursor, shared with the pointer-lock stand-in. */
export const DRAG_CURSOR_SIZE = { width: 28.8, height: 24 } as const;
export const DRAG_CURSOR_HOTSPOT = { x: 14.4, y: 12 } as const;

const DRAG_CURSOR_SVG = `<svg width="${DRAG_CURSOR_SIZE.width}" height="${DRAG_CURSOR_SIZE.height}" viewBox="0 0 24 20" fill="none" xmlns="http://www.w3.org/2000/svg">
<g filter="url(#filter0_d_1681_26)">
<path d="M13.2767 13.6586V7.616C13.2767 7.17654 13.736 6.88812 14.1318 7.07897L20.3982 10.1003C20.8478 10.3171 20.8478 10.9575 20.3982 11.1743L14.1318 14.1956C13.736 14.3864 13.2767 14.098 13.2767 13.6586Z" fill="black"/>
<path d="M13.2767 13.6586V7.616C13.2767 7.17654 13.736 6.88812 14.1318 7.07897L20.3982 10.1003C20.8478 10.3171 20.8478 10.9575 20.3982 11.1743L14.1318 14.1956C13.736 14.3864 13.2767 14.098 13.2767 13.6586Z" stroke="white"/>
</g>
<g filter="url(#filter1_d_1681_26)">
<path d="M9.74729 13.6586V7.616C9.74729 7.17654 9.28803 6.88812 8.89218 7.07897L2.62582 10.1003C2.17614 10.3171 2.17614 10.9575 2.62582 11.1743L8.89218 14.1956C9.28803 14.3864 9.74729 14.098 9.74729 13.6586Z" fill="black"/>
<path d="M9.74729 13.6586V7.616C9.74729 7.17654 9.28803 6.88812 8.89218 7.07897L2.62582 10.1003C2.17614 10.3171 2.17614 10.9575 2.62582 11.1743L8.89218 14.1956C9.28803 14.3864 9.74729 14.098 9.74729 13.6586Z" stroke="white"/>
</g>
<defs>
<filter id="filter0_d_1681_26" x="10.9881" y="5.32606" width="12.0358" height="11.8148" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset dy="0.596185"/>
<feGaussianBlur stdDeviation="0.894277"/>
<feComposite in2="hardAlpha" operator="out"/>
<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"/>
<feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_1681_26"/>
<feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_1681_26" result="shape"/>
</filter>
<filter id="filter1_d_1681_26" x="4.76837e-06" y="5.32606" width="12.0358" height="11.8148" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset dy="0.596185"/>
<feGaussianBlur stdDeviation="0.894277"/>
<feComposite in2="hardAlpha" operator="out"/>
<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"/>
<feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_1681_26"/>
<feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_1681_26" result="shape"/>
</filter>
</defs>
</svg>`;

const SKETCH_CURSOR_SVG = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
<g clip-path="url(#clip0_1681_8)">
<g filter="url(#filter0_d_1681_8)">
<path d="M11.6667 5L17.5 10.8333L14.1667 14.1667" stroke="black" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M5.62132 15.6544C5.33535 15.5359 5.07552 15.3622 4.85667 15.1433C4.63776 14.9245 4.46411 14.6647 4.34563 14.3787C4.22715 14.0927 4.16617 13.7862 4.16617 13.4767C4.16617 13.1671 4.22715 12.8606 4.34563 12.5746C4.46411 12.2887 4.63776 12.0288 4.85667 11.81L13.6783 2.98833C13.8331 2.8335 14.0169 2.71067 14.2191 2.62687C14.4214 2.54307 14.6382 2.49994 14.8571 2.49994C15.076 2.49994 15.2928 2.54307 15.495 2.62687C15.6973 2.71067 15.8811 2.8335 16.0358 2.98833L17.0117 3.96417C17.1665 4.11894 17.2893 4.3027 17.3731 4.50495C17.4569 4.70721 17.5001 4.92399 17.5001 5.14292C17.5001 5.36184 17.4569 5.57862 17.3731 5.78088C17.2893 5.98313 17.1665 6.16689 17.0117 6.32167L8.19 15.1433C7.97116 15.3622 7.71133 15.5359 7.42536 15.6544C7.13939 15.7729 6.83288 15.8338 6.52334 15.8338C6.2138 15.8338 5.90729 15.7729 5.62132 15.6544Z" fill="white" stroke="black" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M3.33334 16.6667L4.80668 15.1934" stroke="black" stroke-linecap="round" stroke-linejoin="round"/>
</g>
</g>
<defs>
<filter id="filter0_d_1681_8" x="0.333344" y="0.333272" width="20.1667" height="20.1667" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset dy="0.833333"/>
<feGaussianBlur stdDeviation="1.25"/>
<feComposite in2="hardAlpha" operator="out"/>
<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"/>
<feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_1681_8"/>
<feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_1681_8" result="shape"/>
</filter>
<clipPath id="clip0_1681_8">
<rect width="20" height="20" fill="white"/>
</clipPath>
</defs>
</svg>`;

function cursorDataUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const DESIGN_SELECT_CURSOR_URL = cursorDataUrl(DESIGN_SELECT_CURSOR_SVG);
export const DRAG_CURSOR_URL = cursorDataUrl(DRAG_CURSOR_SVG);
export const SKETCH_CURSOR_URL = cursorDataUrl(SKETCH_CURSOR_SVG);

export const DESIGN_SELECT_CURSOR = `url("${DESIGN_SELECT_CURSOR_URL}") 3 4, default`;
/** Cursor SVGs are separate images, so resolve CSS tokens before encoding them. */
export function createCommentCursor(tokenSource?: Element | null): string {
  const styles = tokenSource?.ownerDocument.defaultView?.getComputedStyle(tokenSource);
  const token = (name: string): string => styles?.getPropertyValue(name).trim()
    || foundationStyles.match(new RegExp(`${name}:\\s*([^;]+);`))![1]!.trim();
  const svg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<g clip-path="url(#comment-clip)"><g filter="url(#comment-shadow)">
<path d="M4.3 16.1L3 20L7.7 19C11.659 20.922 16.608 19.942 19.274 16.707C21.94 13.472 21.5 8.983 18.245 6.206C14.99 3.43 9.926 3.225 6.4 5.726C2.874 8.228 1.976 12.663 4.3 16.1Z" fill="${token("--text-primary")}" stroke="${token("--surface-raised-2x")}" stroke-width="${token("--icon-stroke-width")}" stroke-linecap="round" stroke-linejoin="round"/>
</g></g>
<defs>
<filter id="comment-shadow" x="-0.0000152588" y="1.81214" width="24.0141" height="22.0212" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset dy="0.833333"/><feGaussianBlur stdDeviation="1.25"/>
<feComposite in2="hardAlpha" operator="out"/>
<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"/>
<feBlend mode="normal" in2="BackgroundImageFix" result="dropShadow"/>
<feBlend mode="normal" in="SourceGraphic" in2="dropShadow" result="shape"/>
</filter>
<clipPath id="comment-clip"><rect width="24" height="24" fill="white"/></clipPath>
</defs></svg>`;
  return `url("${cursorDataUrl(svg)}") 3 20, crosshair`;
}

export const COMMENT_CURSOR = createCommentCursor();
export const PAN_CURSOR = "grab";
export const DRAG_CURSOR = `url("${DRAG_CURSOR_URL}") ${DRAG_CURSOR_HOTSPOT.x} ${DRAG_CURSOR_HOTSPOT.y}, grab`;
export const SKETCH_CURSOR = `url("${SKETCH_CURSOR_URL}") 3 17, crosshair`;

export function rendererCursorValue(cursor: RendererCursor, commentCursor = COMMENT_CURSOR): string {
  return cursor === "comment" ? commentCursor : cursor === "drag" ? PAN_CURSOR : DESIGN_SELECT_CURSOR;
}
