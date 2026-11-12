"use client";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type PointerEvent,
} from "react";
import { fitYokeZoom } from "@/lib/yoke-view-transform";

export function useYokeNavigation(
  canvas: RefObject<HTMLCanvasElement | null>,
  options: {
    enabled: boolean;
    width: number;
    height: number;
    scale: number;
    baseScale: number;
    sideways: boolean;
    view: string;
    fitRequest: number;
    zoom: number;
    onZoom?: (zoom: number) => void;
  },
) {
  const {
    enabled,
    width,
    height,
    scale,
    baseScale,
    sideways,
    view,
    fitRequest,
  } = options;
  const space = useRef(false),
    over = useRef(false);
  const pan = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const [cursor, setCursor] = useState<"grab" | "grabbing" | undefined>();
  const anchor = useRef<{
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const previous = useRef({ scale, sideways, view });
  function rememberAnchor(clientX: number, clientY: number) {
    const element = canvas.current,
      parent = element?.parentElement;
    if (!element || !parent) return;
    const box = element.getBoundingClientRect(),
      bounds = parent.getBoundingClientRect();
    anchor.current = {
      x: (clientX - box.left) / box.width,
      y: (clientY - box.top) / box.height,
      offsetX: clientX - bounds.left,
      offsetY: clientY - bounds.top,
    };
  }
  const fit = useEffectEvent(() => {
    const parent = canvas.current?.parentElement;
    if (!enabled || !parent || view === "chart") return;
    anchor.current = null;
    options.onZoom?.(
      fitYokeZoom(
        width,
        height,
        baseScale,
        parent.clientWidth,
        parent.clientHeight,
      ),
    );
    parent.scrollTo({ left: 0, top: 0 });
  });
  useEffect(() => {
    if (fitRequest) fit();
  }, [fitRequest]);
  useLayoutEffect(() => {
    const element = canvas.current,
      parent = element?.parentElement,
      before = previous.current;
    if (
      enabled &&
      element &&
      parent &&
      before.view === view &&
      before.sideways === sideways &&
      before.scale !== scale
    ) {
      const point = anchor.current;
      if (point) {
        const box = element.getBoundingClientRect(),
          bounds = parent.getBoundingClientRect();
        parent.scrollTo({
          left:
            parent.scrollLeft +
            box.left +
            point.x * box.width -
            bounds.left -
            point.offsetX,
          top:
            parent.scrollTop +
            box.top +
            point.y * box.height -
            bounds.top -
            point.offsetY,
        });
      } else {
        const ratio = scale / before.scale;
        parent.scrollTo({
          left:
            (parent.scrollLeft + parent.clientWidth / 2) * ratio -
            parent.clientWidth / 2,
          top:
            (parent.scrollTop + parent.clientHeight / 2) * ratio -
            parent.clientHeight / 2,
        });
      }
    }
    previous.current = { scale, sideways, view };
  }, [enabled, canvas, scale, sideways, view]);
  const wheel = useEffectEvent((event: WheelEvent) => {
    if (!(event.ctrlKey || event.metaKey) || pan.current) return;
    event.preventDefault();
    rememberAnchor(event.clientX, event.clientY);
    const next = Math.max(
      1,
      Math.min(
        400,
        Math.round(options.zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15)),
      ),
    );
    options.onZoom?.(next);
  });
  useEffect(() => {
    const element = canvas.current;
    if (!enabled || !element) return;
    const down = (event: KeyboardEvent) => {
      if (
        event.code !== "Space" ||
        (!over.current && document.activeElement !== element) ||
        (event.target instanceof Element &&
          event.target.closest("input,textarea,[contenteditable=true]"))
      )
        return;
      event.preventDefault();
      space.current = true;
      setCursor("grab");
    };
    const reset = () => {
      space.current = false;
      pan.current = null;
      setCursor(undefined);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space") reset();
    };
    const onWheel = (event: WheelEvent) => wheel(event);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", reset);
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", reset);
      element.removeEventListener("wheel", onWheel);
    };
  }, [enabled, canvas]);
  return {
    cursor,
    enter: () => {
      over.current = true;
    },
    leave: () => {
      over.current = false;
    },
    track: (event: PointerEvent<HTMLCanvasElement>) => {
      if (enabled && !pan.current) rememberAnchor(event.clientX, event.clientY);
    },
    start: (event: PointerEvent<HTMLCanvasElement>) => {
      if (!enabled || (!space.current && event.button !== 1)) return false;
      const parent = canvas.current?.parentElement;
      if (!parent) return false;
      event.preventDefault();
      event.currentTarget.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture(event.pointerId);
      pan.current = {
        x: event.clientX,
        y: event.clientY,
        left: parent.scrollLeft,
        top: parent.scrollTop,
      };
      setCursor("grabbing");
      return true;
    },
    move: (event: PointerEvent<HTMLCanvasElement>) => {
      const start = pan.current,
        parent = canvas.current?.parentElement;
      if (!start || !parent) return false;
      event.preventDefault();
      parent.scrollTo({
        left: start.left + start.x - event.clientX,
        top: start.top + start.y - event.clientY,
      });
      return true;
    },
    stop: () => {
      const wasPanning = !!pan.current;
      pan.current = null;
      setCursor(space.current ? "grab" : undefined);
      return wasPanning;
    },
  };
}
