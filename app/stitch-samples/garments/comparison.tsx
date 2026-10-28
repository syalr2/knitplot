"use client";

import { useState } from "react";
import { ChartDocument, defaultDocument } from "@/lib/chart";
import { readProject } from "@/lib/project-file";
import { KnitPreview } from "@/components/knit-preview";
import { ConnectedKnitPreview } from "@/components/connected-knit-preview";
import { shapingFixture } from "@/lib/knit-preview-fixtures";

const plain:ChartDocument={...defaultDocument,name:"Plain colourwork control",width:18,height:18,
  palette:[{id:"base",hex:"#efd9cb"},{id:"motif",hex:"#446b5c"}],
  cells:Array.from({length:18},(_,r)=>Array.from({length:18},(_,c)=>Math.abs(r-8.5)+Math.abs(c-8.5)<5||r%8===0?"motif":"base")),stitchActions:undefined};
const stressPlain:ChartDocument={...plain,name:"Maximum-size plain test",width:200,height:150,
  cells:Array.from({length:150},(_,r)=>Array.from({length:200},(_,c)=>(c+Math.floor(r/3))%8<2?"motif":"base"))};
const stressShaped={...shapingFixture(140,200,150),name:"Maximum-size shaping test"};

export function GarmentComparison(){
  const [files,setFiles]=useState<{label:string;document:ChartDocument}[]>([]);
  const [selected,setSelected]=useState(0),[repeatX,setRepeatX]=useState(1),[mirrored,setMirrored]=useState(false);
  const [error,setError]=useState("");
  const [testCastOns,setTestCastOns]=useState(false);
  const examples=[{label:plain.name,document:plain},...files,{label:stressPlain.name,document:stressPlain},{label:stressShaped.name,document:stressShaped}],example=examples[selected]??examples[0];
  const [render,setRender]=useState<{document:ChartDocument;repeatX:number;mirrored:boolean;revision:number}>({document:plain,repeatX:1,mirrored:false,revision:0});
  return <main style={{maxWidth:1400,margin:"auto",padding:24}}>
    <h1>Photographic garment comparison</h1>
    <p>Compare a snapshot of a KnitPlot file using the existing layout and the new connections.</p>
    <label>Load comparison charts<input aria-label="Load comparison charts" type="file" accept=".knitplot" multiple onChange={async e=>{
      try{
        setError("");const loaded=await Promise.all(Array.from(e.target.files??[]).map(async file=>({label:file.name,document:readProject(JSON.parse(await file.text()))})));
        setFiles(loaded);setSelected(loaded.length?1:0);
        if(loaded.length){setRepeatX(1);setMirrored(false);setTestCastOns(false);setRender(previous=>({document:loaded[0].document,repeatX:1,mirrored:false,revision:previous.revision+1}));}
      }catch{setError("Could not read one of those KnitPlot files.");}
    }}/></label>
    {error&&<p role="alert">{error}</p>}
    <div style={{display:"flex",flexWrap:"wrap",gap:14,alignItems:"center",margin:"20px 0"}}>
      <label>Chart <select aria-label="Comparison chart" value={selected} onChange={e=>setSelected(Number(e.target.value))} style={{width:"auto"}}>{examples.map((entry,i)=><option value={i} key={i}>{entry.label}</option>)}</select></label>
      <label>Across <select aria-label="Comparison repeats" value={repeatX} onChange={e=>setRepeatX(Number(e.target.value))} style={{width:"auto"}}>{[1,2,3].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
      <label style={{display:"flex",alignItems:"center",gap:8}}><input type="checkbox" style={{width:"auto"}} checked={mirrored} onChange={e=>setMirrored(e.target.checked)}/>Mirrored repeats</label>
      <button onClick={()=>{
        const doc=testCastOns?{...example.document,name:`${example.document.name} · cast-on comparison copy`,stitchActions:example.document.stitchActions?.map(row=>row.map(action=>action==="bind-off"?"cast-on" as const:action))}:example.document;
        setRender(previous=>({document:doc,repeatX,mirrored,revision:previous.revision+1}));
      }}>Render comparison</button>
    </div>
    <label style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}><input type="checkbox" style={{width:"auto"}} checked={testCastOns} onChange={e=>setTestCastOns(e.target.checked)}/>Test top-down joins as cast-ons (comparison copy only)</label>
    <h2>{render.document.name} · {render.document.width} × {render.document.height} · {render.repeatX} across</h2>
    <style>{`.garment-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.garment-pair article{min-width:0;padding:14px;background:#faf8f2;border:1px solid #dcd7cc;border-radius:12px}.garment-pair h3{font-size:17px;margin:0 0 12px}.garment-pair .preview-stage{background:white;min-height:0;max-height:620px;overflow:auto;padding:0}.garment-pair .preview-canvas{max-width:100%;height:auto;box-shadow:none}`}</style>
    <div className="garment-pair"><article><h3>Existing layout</h3><KnitPreview key={render.revision} document={render.document} repeatX={render.repeatX} repeatY={1} repeatStyle={render.mirrored?"mirrored":"normal"}/></article>
      <article><h3>New connections</h3><ConnectedKnitPreview key={render.revision} document={render.document} repeatX={render.repeatX} mirrored={render.mirrored}/></article></div>
  </main>;
}
