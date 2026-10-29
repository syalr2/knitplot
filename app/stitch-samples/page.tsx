import { KnitPreview } from "@/components/knit-preview";
import { notFound } from "next/navigation";
import { defaultDocument, StitchAction } from "@/lib/chart";

const samples: { action: StitchAction; title: string; note: string }[] = [
  {
    action: "knit",
    title: "Plain knit",
    note: "Reference: ordinary V-shaped loops",
  },
  {
    action: "purl",
    title: "Purl",
    note: "Horizontal bumps across the middle row",
  },
  { action: "m1l", title: "M1L", note: "Middle row: new stitch leaning left" },
  { action: "m1r", title: "M1R", note: "Middle row: new stitch leaning right" },
  {
    action: "ssk",
    title: "SSK",
    note: "Middle row: two loops join, leaning left",
  },
  {
    action: "k2tog",
    title: "K2tog",
    note: "Middle row: two loops join, leaning right",
  },
];

export default function StitchSamples() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <main className="stitch-sample-page">
      <style>{`.stitch-sample-page{max-width:1150px;margin:auto}.stitch-sample-page h1{font-size:27px;margin:0 0 8px}.stitch-sample-page>p{margin:0 0 22px;color:#635d52}.stitch-sample-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.stitch-sample-grid section{background:#faf8f2;border:1px solid #ded8ca;border-radius:12px;padding:16px}.stitch-sample-grid h2{margin:0 0 4px;font-size:21px}.stitch-sample-grid p{font-size:12px;margin:0 0 12px;color:#635d52}.stitch-sample-grid .preview-stage{padding:6px;min-height:0;background:white;overflow:hidden}.stitch-sample-grid .preview-canvas{width:100%!important;max-width:none!important;height:auto!important;box-shadow:none}`}</style>
      <h1>KnitPlot · stitch close-ups</h1>
      <p>
        Actual preview rendering, enlarged. Read each swatch from bottom to top;
        the action is in the middle row. These are visual approximations, not
        stitch tutorials.
      </p>
      <div className="stitch-sample-grid">
        {samples.map(({ action, title, note }) => {
          const increase = action === "m1l" || action === "m1r";
          const decrease = action === "ssk" || action === "k2tog";
          const width = decrease ? 4 : 3;
          const stitchActions: StitchAction[][] = Array.from(
            { length: 3 },
            (_, r) =>
              Array.from({ length: width }, (_, c) => {
                if (increase && r === 2 && c === 1) return "no-stitch";
                if (decrease && r < 2 && c === 3) return "no-stitch";
                if (r === 1 && (c === 1 || action === "purl")) return action;
                return "knit";
              }),
          );
          const document = {
            ...defaultDocument,
            width,
            height: 3,
            palette: [{ id: "yarn", hex: "#B98755" }],
            cells: Array.from({ length: 3 }, () => Array(width).fill("yarn")),
            stitchActions,
          };
          return (
            <section key={action}>
              <h2>{title}</h2>
              <p>{note}</p>
              <KnitPreview
                document={document}
                repeatX={1}
                repeatY={1}
                repeatStyle="normal"
              />
            </section>
          );
        })}
      </div>
    </main>
  );
}
