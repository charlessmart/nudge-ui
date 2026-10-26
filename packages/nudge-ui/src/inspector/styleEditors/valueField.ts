import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { nudgeCssValue } from "./nudgeValue.ts";
import type { EditTarget } from "../selection/editTarget.ts";

export interface ValueDraftOptions {
  /** The value the document currently holds, which the draft returns to when cancelled. */
  readonly value: string;
  /** A mixed selection shows an empty draft with a placeholder. */
  readonly mixed: boolean;
  readonly blocked: boolean;
  readonly property: string;
  /** Re-read the draft when the element or its projection changes. */
  readonly reseedKey?: unknown;
  /**
   * Reset the draft when the edit target changes; a background value change on the same target keeps it. An element
   * list compares by its members, so a selection rebuilt for the same elements is the same target.
   */
  readonly resetKey?: EditTarget;
  /** Applies the field's completion rules, such as adding a default unit, before committing. */
  readonly complete?: (value: string) => string;
  /** What an empty draft commits; without it, an empty draft reverts. */
  readonly emptyValue?: string;
  readonly onCommit: (value: string) => void;
  /** Commit a nudged value as the arrow is pressed instead of waiting for the blur. */
  readonly commitOnNudge?: boolean;
}

export interface ValueDraft {
  readonly draft: string;
  /** True while the current draft has not been committed. */
  readonly isDirty: () => boolean;
  /** Marks the draft edited, so a projection arriving mid-edit cannot overwrite it. */
  readonly setDraft: (value: string) => void;
  /** Commits an edited draft; an empty draft reverts instead. */
  readonly commit: () => void;
  readonly cancel: () => void;
  readonly handleKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  readonly handleBlur: () => void;
}

/** Whether two edit targets name the same elements; lists match by their members, in order. */
export function sameEditTarget(a: EditTarget | undefined, b: EditTarget | undefined): boolean {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}

/**
 * The draft, commit, revert and arrow-step behaviour every labelled value field shares. Fields differ in how they
 * complete a value and what committing means; they do not differ in when the draft is dirty or what Escape does.
 */
export function useValueDraft(options: ValueDraftOptions): ValueDraft {
  const { value, mixed, blocked, property, reseedKey, resetKey, complete, emptyValue, onCommit, commitOnNudge = false } = options;
  const [draft, setDraftState] = useState(mixed ? "" : value);
  const draftRef = useRef(draft);
  const dirtyRef = useRef(false);
  const targetRef = useRef({ resetKey, property });

  const applyDraft = useCallback((next: string): void => {
    draftRef.current = next;
    setDraftState(next);
  }, []);

  const setDraft = useCallback((next: string): void => {
    dirtyRef.current = true;
    applyDraft(next);
  }, [applyDraft]);

  // A projection may change the value under the field; an uncommitted draft wins. A new target
  // always starts from the new value, because a draft typed for one element must not follow it.
  useEffect(() => {
    const targetChanged = !sameEditTarget(targetRef.current.resetKey, resetKey) || targetRef.current.property !== property;
    targetRef.current = { resetKey, property };
    if (targetChanged) dirtyRef.current = false;
    if (dirtyRef.current) return;
    applyDraft(mixed ? "" : value);
  }, [applyDraft, mixed, property, reseedKey, resetKey, value]);

  const cancel = useCallback((): void => {
    dirtyRef.current = false;
    applyDraft(mixed ? "" : value);
  }, [applyDraft, mixed, value]);

  const commitValue = useCallback((raw: string): void => {
    if (blocked) return;
    const trimmed = raw.trim() || emptyValue;
    if (!trimmed) {
      cancel();
      return;
    }
    const next = complete ? complete(trimmed) : trimmed;
    dirtyRef.current = false;
    applyDraft(next);
    onCommit(next);
  }, [applyDraft, blocked, cancel, complete, emptyValue, onCommit]);

  const commit = useCallback((): void => {
    if (!dirtyRef.current) return;
    commitValue(draftRef.current);
  }, [commitValue]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
      event.currentTarget.blur();
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    // Horizontal arrows keep moving the caret; only the vertical pair steps the value.
    const direction = event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : null;
    if (direction === null) return;
    const next = nudgeCssValue(property, draftRef.current, direction, event.shiftKey);
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    dirtyRef.current = true;
    if (commitOnNudge) commitValue(next);
    else applyDraft(next);
  }, [applyDraft, cancel, commit, commitOnNudge, commitValue, property]);

  const handleBlur = useCallback((): void => commit(), [commit]);

  return {
    draft,
    isDirty: () => dirtyRef.current,
    setDraft,
    commit,
    cancel,
    handleKeyDown,
    handleBlur,
  };
}
