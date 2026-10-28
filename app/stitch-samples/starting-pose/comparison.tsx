"use client";

import { useState } from "react";
import { KnitPreview } from "@/components/knit-preview";
import { edgeShapingFixture } from "@/lib/knit-preview-fixtures";
import { readProject } from "@/lib/project-file";
import { ChartDocument } from "@/lib/chart";

export function StartingPoseComparison() {
  const [documents,setDocuments]=useState<ChartDocument[]>([]);
  const [error,setError]=useState("");
  const [testJoins,setTestJoins]=useState(false);
  const imported=documents.map(d=>testJoins&&d.stitchActions?.some(row=>row.includes("bind-off"))?{
    ...d,name:`${d.name} — diagnostic cast-on copy`,
    stitchActions:d.stitchActions.map(row=>row.map(action=>action==="bind-off"?"cast-on" as const:action)),
  }:d);
  const examples=[...imported,...(["both","left","distributed"] as const).map(edgeShapingFixture)];
  return <main style={{maxWidth:1100,margin:"auto",padding:20}}>
    <h1>Starting-layout experiment</h1>
    <p>Same chart and stitch connections, different starting positions. Imported files stay on this page only; the editor and saved charts are not changed.</p>
    <label>Compare KnitPlot files <input type="file" accept=".knitplot" multiple onChange={async e=>{
      try {setError("");const loaded=await Promise.all(Array.from(e.target.files??[]).map(async f=>readProject(JSON.parse(await f.text()))));setDocuments(loaded);}catch{setError("Could not read that KnitPlot file.");}
    }}/></label>{error&&<p>{error}</p>}
    <p><label><input type="checkbox" checked={testJoins} onChange={e=>setTestJoins(e.target.checked)}/> Test imported bind-offs as cast-ons (comparison copies only)</label></p>
    <style>{`.pose-pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}.pose-pair>div{background:#faf8f2;padding:12px;border:1px solid #ded8ca;border-radius:12px}.pose-pair h3{font-size:16px;margin:0 0 10px}.pose-pair .preview-stage{padding:8px;min-height:0;background:white;display:flex;justify-content:center}.pose-pair canvas{width:auto!important;height:auto!important;max-width:100%;max-height:420px;object-fit:contain;box-shadow:none!important}`}</style>
    {examples.map((d,i)=><section key={i}><h2>{d.name}</h2><div className="pose-pair">{(["automatic","straight"] as const).map(p=><div key={p}><h3>{p==="automatic"?"Current starting layout":"Straight-row starting layout"}</h3><KnitPreview document={d} repeatX={1} repeatY={1} repeatStyle="normal" initialPose={p}/></div>)}</div></section>)}
  </main>;
}
