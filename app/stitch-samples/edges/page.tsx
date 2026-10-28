import { notFound } from "next/navigation";
import { KnitPreview } from "@/components/knit-preview";
import { edgeShapingFixture } from "@/lib/knit-preview-fixtures";

export default function EdgeSamples() {
  if(process.env.NODE_ENV!=="development") notFound();
  const cases=[
    {id:"both" as const,title:"Both edges · armhole-style shaping",note:"One increase just inside each edge every fourth row. The centre stripes follow unchanged stitches."},
    {id:"left" as const,title:"Left edge only",note:"Two increases near the left edge every fourth row. The opposite edge has no increases."},
    {id:"distributed" as const,title:"Distributed increases",note:"Two increases near the thirds of each increase row. Same row counts as the edge-shaped samples."},
    {id:"plain" as const,title:"Plain rectangle · control",note:"No increases. Same starting stitches, stripes and gauge."},
  ];
  return <main style={{maxWidth:1100,margin:"auto",padding:24}}>
    <h1>Edge shaping · diagnostic comparison</h1>
    <p>One piece, no repeats. Three samples grow from 24 to 40 stitches over 33 rows. Knitting starts at the bottom; these are schematic swatches, not garment patterns.</p>
    <style>{`.edge-tests{display:grid;grid-template-columns:1fr 1fr;gap:20px}.edge-tests section{padding:16px;background:#faf8f2;border:1px solid #ded8ca;border-radius:12px}.edge-tests h2{font-size:18px;margin:0}.edge-tests p{font-size:13px}.edge-tests .preview-stage{padding:8px;min-height:0;background:white}.edge-tests canvas{width:100%!important;height:auto!important;box-shadow:none!important}`}</style>
    <div className="edge-tests">{cases.map(c=><section key={c.id}><h2>{c.title}</h2><p>{c.note}</p><KnitPreview document={edgeShapingFixture(c.id)} repeatX={1} repeatY={1} repeatStyle="normal"/></section>)}</div>
  </main>;
}
