import { useRef, type PointerEvent } from "react";

export function useKnitChartPan(enabled: boolean) {
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    left: number;
    top: number;
    moved: boolean;
  } | null>(null);

  function finish(event: PointerEvent<HTMLDivElement>) {
    if (gesture.current?.id !== event.pointerId) return;
    event.currentTarget.removeAttribute("data-dragging");
    gesture.current = null;
  }

  return {
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      if (!enabled || event.button !== 0 || !event.isPrimary) return;
      const frame = event.currentTarget;
      if (
        frame.scrollWidth <= frame.clientWidth &&
        frame.scrollHeight <= frame.clientHeight
      )
        return;
      gesture.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: frame.scrollLeft,
        top: frame.scrollTop,
        moved: false,
      };
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      const drag = gesture.current;
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      const frame = event.currentTarget;
      if (!drag.moved) {
        drag.moved = true;
        // Capture only once it is a drag: a tap should still mark a stitch.
        frame.setPointerCapture(event.pointerId);
        frame.setAttribute("data-dragging", "");
      }
      frame.scrollLeft = drag.left - dx;
      frame.scrollTop = drag.top - dy;
    },
    onPointerUp: finish,
    onPointerCancel: finish,
    onLostPointerCapture(event: PointerEvent<HTMLDivElement>) {
      if (event.target === event.currentTarget) finish(event);
    },
    onPointerLeave(event: PointerEvent<HTMLDivElement>) {
      if (!gesture.current?.moved) finish(event);
    },
  };
}
