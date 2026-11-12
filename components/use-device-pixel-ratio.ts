"use client";
import { useSyncExternalStore } from "react";

const snapshot = () => window.devicePixelRatio || 1;
const serverSnapshot = () => 1;
function subscribe(changed: () => void) {
  let query = window.matchMedia(`(resolution: ${snapshot()}dppx)`);
  const update = () => {
    query.removeEventListener("change", update);
    query = window.matchMedia(`(resolution: ${snapshot()}dppx)`);
    query.addEventListener("change", update);
    changed();
  };
  query.addEventListener("change", update);
  window.addEventListener("resize", update);
  return () => {
    query.removeEventListener("change", update);
    window.removeEventListener("resize", update);
  };
}
/** Match Retina screens, browser zoom, and moves between different monitors. */
export function useDevicePixelRatio() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
