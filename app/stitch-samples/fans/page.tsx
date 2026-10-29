import { notFound } from "next/navigation";
import { KnitPreview } from "@/components/knit-preview";
import { fabricSurface, layoutFabric } from "@/lib/knit-preview-layout";
import { fanFixtures, shapingFixture } from "@/lib/knit-preview-fixtures";

export default function FanSamples() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <main style={{ maxWidth: 1100, margin: "auto", padding: 20 }}>
      <h1>Fabric shaping · test swatches</h1>
      <p>
        Synthetic charts with real shaping actions and three repeats. Stitch
        connections now influence the laid-out shape; extreme cases retain a
        conservative fallback.
      </p>
      <style>{`.fan-tests{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.fan-tests section{background:#faf8f2;border:1px solid #ded8ca;border-radius:12px;padding:12px}.fan-tests h2{font-size:18px;margin:0}.fan-tests p{font-size:13px}.fan-tests .preview-stage{padding:8px;min-height:0;background:white}.fan-tests canvas{width:100%!important;height:auto!important;box-shadow:none!important}@media(max-width:550px){.fan-tests{grid-template-columns:1fr}}`}</style>
      <div className="fan-tests">
        {(["left", "centre"] as const).map((placement) => (
          <section key={placement}>
            <h2>Increases at the {placement}</h2>
            <p>
              Same counts: 16 → 24 over 32 rows. Only the increase positions
              change.
            </p>
            <KnitPreview
              document={shapingFixture(16, 24, 32, "even", placement)}
              repeatX={3}
              repeatY={1}
              repeatStyle="normal"
            />
          </section>
        ))}
        {fanFixtures.map((f) => {
          const document = shapingFixture(f.start, f.end, f.rows, f.profile);
          const layout = layoutFabric(document, 3);
          const surface = fabricSurface(document, layout.rows, layout.pitch);
          return (
            <section key={f.name}>
              <h2>{f.name}</h2>
              <p>
                {f.start} → {f.end} stitches over {f.rows} rows ·{" "}
                {surface.curved ? "Curved" : "Flat fallback"}
              </p>
              <KnitPreview
                document={document}
                repeatX={3}
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
