"use client";
import {
  startTransition,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { yokeProjectSchema, type YokeProject } from "@/lib/yoke-project";

const KEY = "knitplot-yoke-draft-v1";
/** Isolated from regular charts; refuses to overwrite a corrupt or concurrently edited draft. */
export function useYokeDraft(initial: YokeProject) {
  const [project, setProject] = useState(initial);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const stored = useRef<string | null>(null);
  const latest = useRef(project);
  useLayoutEffect(() => {
    latest.current = project;
  }, [project]);
  useEffect(() => {
    try {
      const text = localStorage.getItem(KEY);
      const parsed = text ? yokeProjectSchema.parse(JSON.parse(text)) : initial;
      stored.current = text;
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
    function save() {
      try {
        if (localStorage.getItem(KEY) !== stored.current) throw new Error();
        const text = JSON.stringify(latest.current);
        if (text !== stored.current) localStorage.setItem(KEY, text);
        stored.current = text;
        setError("");
        return true;
      } catch {
        setError(
          "This yoke draft could not be saved, or another window changed it. Download your work before leaving.",
        );
        return false;
      }
    }
    const timeout = setTimeout(save, 200);
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
      clearTimeout(timeout);
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [project, ready]);
  return { project, setProject, ready, error };
}
