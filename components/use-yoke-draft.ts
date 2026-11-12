"use client";
import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  yokeProjectSchema,
  serializeYokeProject,
  type YokeProject,
} from "@/lib/yoke-project";

const KEY = "knitplot-yoke-draft-v1";
/** Isolated from regular charts; refuses to overwrite a corrupt or concurrently edited draft. */
export function useYokeDraft(initial: YokeProject) {
  const [project, setProject] = useState(initial);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const stored = useRef<string | null>(null);
  const savedContent = useRef<string | null>(null);
  const latest = useRef(project);
  useLayoutEffect(() => {
    latest.current = project;
  }, [project]);
  const save = useCallback(() => {
    try {
      const text = serializeYokeProject(latest.current);
      // A read-only window must never rewrite an equivalent draft merely
      // because JSON fields originally arrived in a different order.
      if (text === savedContent.current) return true;
      if (localStorage.getItem(KEY) !== stored.current) throw new Error();
      if (text !== stored.current) localStorage.setItem(KEY, text);
      stored.current = text;
      savedContent.current = text;
      setError("");
      return true;
    } catch {
      setError(
        "This yoke draft could not be saved, or another window changed it. Download your work before leaving.",
      );
      return false;
    }
  }, []);
  useEffect(() => {
    try {
      const text = localStorage.getItem(KEY);
      const parsed = text ? yokeProjectSchema.parse(JSON.parse(text)) : initial;
      stored.current = text;
      savedContent.current = text ? serializeYokeProject(parsed) : null;
      startTransition(() => {
        setProject(parsed);
        setReady(true);
      });
    } catch {
      startTransition(() => {
        setError(
          "The saved yoke draft could not be read. It has been left untouched. Download your work before leaving.",
        );
        setReady(true);
      });
    }
  }, [initial]);
  useEffect(() => {
    if (!ready) return;
    const timeout = setTimeout(save, 200);
    return () => clearTimeout(timeout);
  }, [project, ready, save]);
  useEffect(() => {
    if (!ready) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!save()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const hide = () => {
      if (document.visibilityState === "hidden") save();
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", hide);
    return () => {
      // App Router navigation does not emit pagehide or beforeunload.
      // Keep this separate from the debounce effect so normal drawing does
      // not synchronously serialize a large draft on every pointer move.
      save();
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [ready, save]);
  return { project, setProject, ready, error, flush: save };
}
