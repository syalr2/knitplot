"use client";
import { useState, type Dispatch, type SetStateAction } from "react";

/** Preserve incomplete input while typing; reset before paint when its chart source changes. */
export function useSyncedDraft<T>(
  sourceKey: string,
  source: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState({ key: sourceKey, value: source });
  if (state.key !== sourceKey) setState({ key: sourceKey, value: source });
  const value = state.key === sourceKey ? state.value : source;
  const setValue: Dispatch<SetStateAction<T>> = (update) =>
    setState((previous) => {
      const current = previous.key === sourceKey ? previous.value : source;
      return {
        key: sourceKey,
        value:
          typeof update === "function"
            ? (update as (value: T) => T)(current)
            : update,
      };
    });
  return [value, setValue];
}
