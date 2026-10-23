import type { RuntimeElementEvidence } from "../changes/types.ts";
import type { DraftContents } from "../drafts/model.ts";
import {
  boundRuntimeEvidence,
  isRuntimeGeneratedSource,
  normalizeRuntimeTag,
  normalizeRuntimeText,
  RUNTIME_ELEMENT_CID_PREFIX,
  runtimeDomPath,
} from "./staticHtmlRuntimeIdentity.ts";

/** Document-local identity that survives a reload only by re-attaching to the element whose rendered facts match. */
export interface RuntimeIdentityClaim {
  readonly cid: string;
  readonly src: string | null;
  readonly tagName: string;
  readonly text: string | null;
  readonly props: string | null;
  readonly ariaLabel: string | null;
  readonly domPath: string | null;
  readonly elementId: string | null;
}

interface ClaimState {
  claims: Map<string, RuntimeIdentityClaim>;
  observer: MutationObserver | null;
  queued: boolean;
}

const states = new WeakMap<Document, ClaimState>();

function isGeneratedCid(cid: string | null | undefined): cid is string {
  return typeof cid === "string" && cid.startsWith(RUNTIME_ELEMENT_CID_PREFIX);
}

/** Generated values contain no characters that selector escaping rewrites. */
function generatedSourceFromSelector(selector: string): string | null {
  const match = /\[data-src="([^"\\]*)"\]/.exec(selector);
  return match && isRuntimeGeneratedSource(match[1]) ? match[1]! : null;
}

function claimFromEvidence(cid: string, src: string | null, evidence: RuntimeElementEvidence): RuntimeIdentityClaim {
  return {
    cid,
    src,
    tagName: evidence.tagName,
    text: evidence.text,
    props: evidence.props,
    ariaLabel: evidence.ariaLabel,
    domPath: evidence.domPath ?? null,
    elementId: evidence.elementId ?? null,
  };
}

export function collectRuntimeIdentityClaims({ changes, structuralChanges }: DraftContents): RuntimeIdentityClaim[] {
  const claims = new Map<string, RuntimeIdentityClaim>();
  // The page still renders the text from before an inline text edit, so a text edit's original text wins over evidence captured after the preview.
  const originalText = new Map<string, string | null>();
  for (const change of changes) {
    if (change.kind === "text-content") {
      const { sourceSite, beforeText } = change.target;
      if (isGeneratedCid(sourceSite.cid)) originalText.set(sourceSite.cid, normalizeRuntimeText(beforeText));
      if (!isGeneratedCid(sourceSite.cid) || claims.has(sourceSite.cid)) continue;
      claims.set(sourceSite.cid, {
        cid: sourceSite.cid,
        src: sourceSite.src || null,
        tagName: change.target.tagName ?? "",
        text: null,
        props: change.target.props,
        ariaLabel: change.target.ariaLabel,
        domPath: change.target.domPath ?? null,
        elementId: change.target.elementId ?? null,
      });
      continue;
    }
    if (change.kind !== undefined && change.kind !== "element") continue;
    if (!isGeneratedCid(change.cid) || !change.runtimeEvidence || claims.has(change.cid)) continue;
    claims.set(change.cid, claimFromEvidence(change.cid, generatedSourceFromSelector(change.selector), change.runtimeEvidence));
  }
  for (const change of structuralChanges) {
    const targets = change.kind === "move"
      ? [change.target, change.source.parent, change.destination.parent, ...(change.destination.before ? [change.destination.before] : [])]
      : [change.target];
    for (const { sourceSite, locator } of targets) {
      if (!isGeneratedCid(sourceSite.cid) || claims.has(sourceSite.cid)) continue;
      claims.set(sourceSite.cid, {
        cid: sourceSite.cid,
        src: isRuntimeGeneratedSource(sourceSite.src) ? sourceSite.src : null,
        tagName: locator.tagName ?? "",
        text: locator.text,
        props: boundRuntimeEvidence(locator.props),
        ariaLabel: boundRuntimeEvidence(locator.ariaLabel ?? null),
        domPath: locator.domPath ?? null,
        elementId: locator.elementId ?? null,
      });
    }
  }
  return [...claims.values()].map((claim) => (
    originalText.has(claim.cid) ? { ...claim, text: originalText.get(claim.cid)! } : claim
  ));
}

function hasStructuralMatch(element: HTMLElement, claim: RuntimeIdentityClaim): boolean {
  return normalizeRuntimeTag(element.tagName) === claim.tagName
    && boundRuntimeEvidence(element.id || null) === claim.elementId
    && boundRuntimeEvidence(element.getAttribute("aria-label")) === claim.ariaLabel
    && boundRuntimeEvidence(element.getAttribute("data-cprops")) === claim.props
    && (claim.domPath === null || runtimeDomPath(element) === claim.domPath);
}

/** Never takes an element that holds authored identity or another claim's identity. */
function findClaimedElement(doc: Document, claim: RuntimeIdentityClaim, claimed: ReadonlySet<string>): HTMLElement | null {
  if (!claim.tagName) return null;
  let elements: HTMLElement[];
  try {
    elements = Array.from(doc.getElementsByTagName(claim.tagName)) as HTMLElement[];
  } catch {
    return null;
  }
  const candidates = elements.filter((element) => {
    const cid = element.getAttribute("data-cid");
    if (cid !== null && (!isGeneratedCid(cid) || claimed.has(cid))) return false;
    return hasStructuralMatch(element, claim);
  });
  const byText = candidates.filter((element) => normalizeRuntimeText(element.textContent) === claim.text);
  if (byText.length === 1) return byText[0]!;
  return null;
}

function hasIdentity(doc: Document, cid: string): boolean {
  for (const element of Array.from(doc.querySelectorAll("[data-cid]"))) {
    if (element.getAttribute("data-cid") === cid) return true;
  }
  return false;
}

function attachClaims(doc: Document, state: ClaimState): void {
  const claimed = new Set(state.claims.keys());
  for (const claim of state.claims.values()) {
    if (hasIdentity(doc, claim.cid)) continue;
    const element = findClaimedElement(doc, claim, claimed);
    if (!element) continue;
    element.setAttribute("data-cid", claim.cid);
    if (claim.src !== null) element.setAttribute("data-src", claim.src);
  }
}

function observe(doc: Document, state: ClaimState): void {
  if (state.observer || state.claims.size === 0) return;
  const Observer = doc.defaultView?.MutationObserver;
  if (!Observer || !doc.documentElement) return;
  // Attaching only writes to an element that lacks the identity, so hydration and route changes cannot feed the observer its own writes.
  state.observer = new Observer(() => {
    if (state.queued) return;
    state.queued = true;
    queueMicrotask(() => {
      if (states.get(doc) !== state) return;
      state.queued = false;
      attachClaims(doc, state);
    });
  });
  state.observer.observe(doc.documentElement, { childList: true, subtree: true });
}

/** Unmatched claims stay pending; their edits simply do not apply. */
export function applyRuntimeIdentityClaims(doc: Document, claims: readonly RuntimeIdentityClaim[]): void {
  if (claims.length === 0) {
    disposeRuntimeIdentityClaims(doc);
    return;
  }
  let state = states.get(doc);
  if (!state) {
    state = { claims: new Map(), observer: null, queued: false };
    states.set(doc, state);
  }
  state.claims = new Map(claims.map((claim) => [claim.cid, claim]));
  attachClaims(doc, state);
  observe(doc, state);
}

/** Stops reattachment for a document session, including queued work. */
export function disposeRuntimeIdentityClaims(doc: Document): void {
  states.get(doc)?.observer?.disconnect();
  states.delete(doc);
}

/** Runtime validation for claims received from another window. */
export function isRuntimeIdentityClaim(value: unknown): value is RuntimeIdentityClaim {
  if (!value || typeof value !== "object") return false;
  const claim = value as Record<string, unknown>;
  const nullableString = (field: unknown) => field === null || typeof field === "string";
  return typeof claim.cid === "string" && isGeneratedCid(claim.cid)
    && (claim.src === null || (typeof claim.src === "string" && isRuntimeGeneratedSource(claim.src)))
    && typeof claim.tagName === "string"
    && nullableString(claim.text)
    && nullableString(claim.props)
    && nullableString(claim.ariaLabel)
    && nullableString(claim.domPath)
    && nullableString(claim.elementId);
}
