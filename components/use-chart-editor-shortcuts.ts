"use client";

import { useEffect, useEffectEvent } from "react";

const editable = "input, textarea, select, [contenteditable], [role='textbox']";

export function useChartEditorShortcuts(
  enabled: boolean,
  onShortcut: (event: KeyboardEvent) => boolean,
) {
  const dispatch = useEffectEvent(onShortcut);
  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.altKey) return;
      if (event.target instanceof Element && event.target.closest(editable))
        return;
      if (window.document.querySelector("dialog[open], [aria-modal='true']"))
        return;
      if (dispatch(event)) event.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
