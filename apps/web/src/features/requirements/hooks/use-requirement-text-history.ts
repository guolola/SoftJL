// Keeps source-editor undo local to text edits, including paste and IME composition.
import { useCallback, useLayoutEffect, useRef, type KeyboardEvent } from "react";

type Edit = { text: string; start: number; end: number };
const edit = (text: string): Edit => ({ text, start: text.length, end: text.length });
const HISTORY_LIMIT = 100;

export function useRequirementTextHistory(text: string, restore: (text: string) => void, disabled: boolean) {
  const input = useRef<HTMLTextAreaElement>(null);
  const history = useRef({ past: [] as Edit[], current: edit(text), future: [] as Edit[] });
  const selection = useRef<Edit | null>(null);
  const composing = useRef(false);
  const compositionRecorded = useRef(false);
  const reset = useCallback((value: string) => {
    history.current = { past: [], current: edit(value), future: [] };
    selection.current = null;
    composing.current = false;
    compositionRecorded.current = false;
  }, []);
  const rememberSelection = useCallback(() => {
    const element = input.current;
    if (element?.value === history.current.current.text) {
      history.current.current = { text: element.value, start: element.selectionStart, end: element.selectionEnd };
    }
  }, []);
  const record = useCallback((value: string) => {
    const state = history.current;
    if (value === state.current.text) return;
    if (!composing.current || !compositionRecorded.current) {
      state.past = [...state.past, state.current].slice(-HISTORY_LIMIT);
    }
    if (composing.current) compositionRecorded.current = true;
    const element = input.current;
    state.current = element?.value === value
      ? { text: value, start: element.selectionStart, end: element.selectionEnd } : edit(value);
    state.future = [];
  }, []);
  useLayoutEffect(() => {
    // Loading another saved source establishes a new baseline; ordinary typing is already recorded.
    if (text !== history.current.current.text) reset(text);
    if (selection.current?.text === text && input.current?.value === text) {
      input.current.setSelectionRange(selection.current.start, selection.current.end);
      selection.current = null;
    }
  }, [text, reset]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (disabled || event.nativeEvent.isComposing || composing.current || event.altKey || !(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key !== "z" && key !== "y") return;
    event.preventDefault();
    event.stopPropagation();
    rememberSelection();
    const state = history.current;
    const redo = key === "y" || event.shiftKey;
    const target = (redo ? state.future : state.past).pop();
    if (!target) return;
    (redo ? state.past : state.future).push(state.current);
    state.current = target;
    selection.current = target;
    restore(target.text);
  };
  return {
    record, reset,
    inputProps: {
      ref: input, onKeyDown, onBeforeInput: rememberSelection, onSelect: rememberSelection,
      onCompositionStart: () => { rememberSelection(); composing.current = true; compositionRecorded.current = false; },
      onCompositionEnd: () => { composing.current = false; },
    },
  };
}
