"use client";

import { useEffect, useRef, useState } from "react";
import {
  layoutYarnSwatch,
  yarnSwatchSample,
  repeatedYarnSample,
} from "@/lib/yarn-swatch-prototype";
import { YarnPath, drawFibres } from "./yarn-path";
import { PhotographicComparison } from "./photographic-comparison";

function Swatch({
  action,
  trace,
  detail = false,
  repeated,
  textured,
}: {
  action: "plain" | "m1l" | "m1r";
  trace: boolean;
  detail?: boolean;
  repeated?: "left" | "right";
  textured: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    function draw(texture?: HTMLImageElement) {
      const canvas = ref.current;
      if (!canvas || cancelled) return;
      const g =
          repeated && action !== "plain"
            ? repeatedYarnSample(action, repeated)
            : yarnSwatchSample(action),
        points = layoutYarnSwatch(g);
      const unit = 44,
        margin = 35,
        minX = Math.min(...[...points.values()].map((p) => p.x));
      const width = Math.ceil(
          (Math.max(...[...points.values()].map((p) => p.x)) - minX + 1) *
            unit +
            2 * margin,
        ),
        height = Math.ceil(
          (g.rows.length - 1) * 0.8 * unit + 2 * margin + unit * 0.5,
        );
      canvas.width = width * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(2, 2);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
      const point = (id: string) => {
        const p = points.get(id)!;
        return {
          x: margin + (p.x - minX + 0.5) * unit,
          y: height - margin + p.y * unit,
        };
      };
      if (detail) {
        const increase = g.rows
          .flat()
          .find((loop) => loop.attachment.kind === "lifted-bar")!;
        const focus = point(increase.id);
        // Magnify the very same drawing, rather than maintaining a separate diagram.
        ctx.translate(width / 2, height / 2);
        ctx.scale(2.5, 2.5);
        ctx.translate(-focus.x, -focus.y);
      }
      let pattern: CanvasPattern | null = null;
      if (texture) {
        const tile = document.createElement("canvas");
        tile.width = tile.height = 64;
        const t = tile.getContext("2d")!;
        t.drawImage(
          texture,
          texture.width * 0.25,
          texture.height * 0.25,
          texture.width * 0.15,
          texture.height * 0.15,
          0,
          0,
          64,
          64,
        );
        pattern = ctx.createPattern(tile, "repeat");
      }
      const yarn = (
        fibrePath: YarnPath,
        color: string,
        diameter = unit * 0.36,
      ) => {
        const path = fibrePath.native;
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (textured) {
          ctx.shadowColor = "#392b2040";
          ctx.shadowBlur = 2.5;
          ctx.shadowOffsetY = 1;
          ctx.strokeStyle = color;
          ctx.lineWidth = diameter;
          ctx.stroke(path);
          ctx.shadowColor = "transparent";
          // Narrow, translucent layers give rounded volume without a hard outline.
          ctx.save();
          ctx.translate(0.7, 0.7);
          ctx.strokeStyle = "#20170d22";
          ctx.lineWidth = diameter * 0.88;
          ctx.stroke(path);
          ctx.restore();
          ctx.strokeStyle = color;
          ctx.lineWidth = diameter * 0.7;
          ctx.stroke(path);
          ctx.save();
          ctx.translate(-0.45, -0.45);
          for (const width of [0.7, 0.48, 0.26]) {
            ctx.strokeStyle = "rgba(255,255,255,.055)";
            ctx.lineWidth = diameter * width;
            ctx.stroke(path);
          }
          ctx.restore();
          if (pattern) {
            ctx.globalCompositeOperation = "multiply";
            ctx.globalAlpha = 0.16;
            ctx.strokeStyle = pattern;
            ctx.lineWidth = diameter * 0.95;
            ctx.stroke(path);
            ctx.globalCompositeOperation = "source-over";
            ctx.globalAlpha = 1;
          }
          drawFibres(ctx, fibrePath, diameter, color);
          ctx.restore();
          return;
        }
        ctx.shadowColor = "#34291f33";
        ctx.shadowBlur = 2;
        ctx.shadowOffsetY = 1;
        ctx.strokeStyle = "#aa9676";
        ctx.lineWidth = diameter + 0.8;
        ctx.stroke(path);
        ctx.shadowColor = "transparent";
        ctx.strokeStyle = color;
        ctx.lineWidth = diameter;
        ctx.stroke(path);
        if (pattern) {
          ctx.globalCompositeOperation = "multiply";
          ctx.globalAlpha = 0.3;
          ctx.strokeStyle = pattern;
          ctx.stroke(path);
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = 1;
        }
        ctx.translate(-0.8, -0.8);
        ctx.strokeStyle = "#ffffff55";
        ctx.lineWidth = diameter * 0.3;
        ctx.stroke(path);
        ctx.translate(1.7, 1.5);
        ctx.strokeStyle = "#58493622";
        ctx.lineWidth = 1;
        ctx.stroke(path);
        ctx.restore();
      };
      const bars = new Map(g.bars.map((b) => [b.id, b]));
      for (const row of g.rows) {
        // Sinker arcs connect neighbouring loops behind the visible legs.
        row.slice(1).forEach((loop, i) => {
          const a = point(row[i].id),
            b = point(loop.id);
          const path = new YarnPath();
          path.moveTo(a.x + unit * 0.28, a.y - unit * 0.27);
          path.bezierCurveTo(
            a.x + unit * 0.45,
            a.y - unit * 0.08,
            b.x - unit * 0.45,
            b.y - unit * 0.08,
            b.x - unit * 0.28,
            b.y - unit * 0.27,
          );
          yarn(path, "#cbb994", unit * 0.2);
        });
        for (const [index, loop] of row.entries()) {
          const p = point(loop.id),
            a = loop.attachment;
          let foot = { x: p.x, y: p.y + unit * 0.42 };
          if (a.kind === "through-loop") {
            const parent = point(a.loop);
            foot = { x: parent.x, y: parent.y - unit * 0.32 };
          }
          if (a.kind === "lifted-bar") {
            const bar = bars.get(a.bar)!,
              left = point(bar.left),
              right = point(bar.right),
              mid = (left.x + right.x) / 2;
            foot = { x: mid, y: left.y - unit * 0.27 };
            const sign = a.twist === "left" ? -1 : 1;
            // Lift the existing bar into a tight crossed collar. Its two ends
            // remain attached to the neighbouring loops, not to blank space.
            const under = new YarnPath();
            under.moveTo(left.x + unit * 0.24, left.y + unit * 0.08);
            under.bezierCurveTo(
              mid - unit * 0.2,
              foot.y + unit * 0.3,
              mid + sign * unit * 0.16,
              foot.y - unit * 0.12,
              mid + sign * unit * 0.12,
              foot.y - unit * 0.25,
            );
            under.bezierCurveTo(
              mid - sign * unit * 0.16,
              foot.y - unit * 0.27,
              mid - unit * 0.08,
              foot.y + unit * 0.3,
              right.x - unit * 0.24,
              right.y + unit * 0.08,
            );
            yarn(under, "#cbb994", unit * 0.3);
          }
          const color = trace
            ? loop.family.startsWith("new-")
              ? "#cb83a0"
              : loop.family === "original-3"
                ? "#699b87"
                : loop.family === "original-4"
                  ? "#d4aa60"
                  : "#d9c7a4"
            : "#d9c7a4";
          // Let the body follow the connection, rather than remaining an
          // upright stamp with a sharply displaced tip. Compress only where
          // neighbouring loop centres leave less room; plain knitting is unchanged.
          const room = Math.min(
            index ? p.x - point(row[index - 1].id).x : unit,
            index + 1 < row.length ? point(row[index + 1].id).x - p.x : unit,
          );
          const halfWidth = Math.min(
            unit * 0.28,
            Math.max(unit * 0.19, room * 0.32),
          );
          const bend = p.x + (foot.x - p.x) * 0.4;
          const path = new YarnPath();
          path.moveTo(p.x - halfWidth, p.y - unit * 0.33);
          path.bezierCurveTo(
            bend - halfWidth - unit * 0.01,
            p.y + unit * 0.04,
            foot.x - unit * 0.14,
            foot.y - unit * 0.07,
            foot.x,
            foot.y,
          );
          path.bezierCurveTo(
            foot.x + unit * 0.14,
            foot.y - unit * 0.07,
            bend + halfWidth + unit * 0.01,
            p.y + unit * 0.04,
            p.x + halfWidth,
            p.y - unit * 0.33,
          );
          yarn(path, color);
          if (a.kind === "lifted-bar") {
            const sign = a.twist === "left" ? -1 : 1,
              over = new YarnPath();
            // Foreground strand climbs toward the named lean. Reversing this
            // crossing changes the local ridge, not the positions of later loops.
            over.moveTo(foot.x - sign * unit * 0.22, foot.y + unit * 0.03);
            over.bezierCurveTo(
              foot.x - sign * unit * 0.08,
              foot.y - unit * 0.08,
              p.x + sign * unit * 0.22,
              p.y + unit * 0.1,
              p.x + sign * unit * 0.28,
              p.y - unit * 0.2,
            );
            yarn(over, color, unit * 0.3);
          }
        }
      }
    }
    draw();
    image.onload = () => draw(image);
    image.src = "/textures/merino-relief.png";
    return () => {
      cancelled = true;
      image.onload = null;
    };
  }, [action, trace, detail, repeated, textured]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={`${action} ${repeated ? `repeated increases on ${repeated}` : detail ? "enlarged increase" : "yarn-path prototype"}`}
      style={{ width: "100%", height: "auto", display: "block" }}
    />
  );
}

export function YarnSamples() {
  const [trace, setTrace] = useState(false);
  const [side, setSide] = useState<"left" | "right">("right");
  const [textured, setTextured] = useState(true);
  return (
    <main style={{ maxWidth: 1300, margin: "auto", padding: 24 }}>
      <PhotographicComparison />
      <hr style={{ margin: "36px 0" }} />
      <h2>Connection diagrams</h2>
      <p>
        Single and repeated increases. Experimental yarn paths; the main preview
        is unchanged.
      </p>
      <label
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <input
          type="checkbox"
          style={{ width: "auto" }}
          checked={textured}
          onChange={(e) => setTextured(e.target.checked)}
        />{" "}
        Fibre texture (off to compare smooth yarn)
      </label>
      <label
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <input
          type="checkbox"
          style={{ width: "auto" }}
          checked={trace}
          onChange={(e) => setTrace(e.target.checked)}
        />{" "}
        Highlight columns in the single-increase samples below
      </label>
      <h2>Repeated shaping</h2>
      <p>
        Four increases, every third row, beside the green column. Both samples
        use the same placement; only the twist changes.
      </p>
      <label
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        Increase placement{" "}
        <select
          aria-label="Increase placement"
          value={side}
          onChange={(e) => setSide(e.target.value as "left" | "right")}
          style={{ width: "auto" }}
        >
          <option value="left">Left of green column</option>
          <option value="right">Right of green column</option>
        </select>
      </label>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2,minmax(0,1fr))",
          gap: 12,
          marginBottom: 28,
        }}
      >
        {(["m1l", "m1r"] as const).map((action) => (
          <section
            key={action}
            style={{
              padding: 10,
              border: "1px solid #dcd7cc",
              borderRadius: 12,
              background: "#faf8f2",
            }}
          >
            <h3>{action.toUpperCase()}</h3>
            <Swatch action={action} trace repeated={side} textured={textured} />
          </section>
        ))}
      </div>
      <h2>Increase close-ups</h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2,minmax(0,1fr))",
          gap: 12,
          marginBottom: 28,
        }}
      >
        {(["m1l", "m1r"] as const).map((action) => (
          <section
            key={action}
            style={{
              padding: 10,
              border: "1px solid #dcd7cc",
              borderRadius: 12,
              background: "#faf8f2",
            }}
          >
            <h3>{action.toUpperCase()}</h3>
            <Swatch action={action} trace={trace} detail textured={textured} />
          </section>
        ))}
      </div>
      <h2>Full swatches</h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))",
          gap: 16,
        }}
      >
        {(["plain", "m1l", "m1r"] as const).map((action) => (
          <section
            key={action}
            style={{
              padding: 12,
              border: "1px solid #dcd7cc",
              borderRadius: 12,
              background: "#faf8f2",
            }}
          >
            <h2 style={{ fontSize: 18 }}>
              {action === "plain" ? "Plain · control" : action.toUpperCase()}
            </h2>
            <Swatch action={action} trace={trace} textured={textured} />
          </section>
        ))}
      </div>
    </main>
  );
}
