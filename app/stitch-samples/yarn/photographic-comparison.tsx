"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { KnitPreview, makeReliefSource, makeStitchSprite } from "@/components/knit-preview";
import { ConnectedKnitPreview } from "@/components/connected-knit-preview";
import { ChartDocument, defaultDocument, StitchAction } from "@/lib/chart";
import { layoutYarnSwatch, yarnSwatchSample, additionalStitchSample, PurlSamplePattern } from "@/lib/yarn-swatch-prototype";

type Action = "m1l" | "m1r";
type SampleAction = Action | "ssk" | "k2tog" | "purl";
const colourFor = (family: string, hex: string, highlight: boolean) => !highlight ? hex
  : family.startsWith("new-") || family.startsWith("merged-") ? "#cb83a0" : family === "original-3" ? "#699b87"
    : family === "original-4" ? "#d4aa60" : hex;

function comparisonDocument(action: SampleAction, hex: string, highlight: boolean, purlPattern:PurlSamplePattern="single"): ChartDocument {
  const increase=action==="m1l"||action==="m1r";
  const {graph,purls}=increase?{graph:yarnSwatchSample(action),purls:new Set<string>()}:additionalStitchSample(action,purlPattern);
  const palette = [{ id: "yarn", hex }, { id: "new", hex: "#cb83a0" }, { id: "left", hex: "#699b87" }, { id: "right", hex: "#d4aa60" }];
  const cells: string[][] = [], stitchActions: StitchAction[][] = [];
  for (const row of graph.rows) {
    const colours = Array<string>(9).fill("yarn"), actions = Array<StitchAction>(9).fill("no-stitch");
    for (const loop of row) {
      // The unworked placeholder is between original columns 3 and 4.
      const column = increase&&row.length === 8 && loop.index >= 4 ? loop.index + 1 : loop.index;
      actions[column] = loop.attachment.kind === "lifted-bar"||loop.attachment.kind==="through-loops" ? action : purls.has(loop.id)?"purl":"knit";
      if (highlight) colours[column] = loop.family.startsWith("new-") ? "new"
        : loop.family === "original-3" ? "left" : loop.family === "original-4" ? "right" : "yarn";
    }
    cells.unshift(colours); stitchActions.unshift(actions);
  }
  return { ...defaultDocument, name: action.toUpperCase(), width: 9, height: graph.rows.length,
    gaugeStitches: 20, gaugeRows: 25, cells, stitchActions, palette };
}

function ConnectedPhoto({ action, hex, highlight, detail = false, purlPattern="patch" }: { action: SampleAction; hex: string; highlight: boolean; detail?: boolean; purlPattern?:PurlSamplePattern }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setError(false);
    const image = new Image();
    image.onload = () => {
      if (cancelled || !ref.current) return;
      const sample=action==="m1l"||action==="m1r"?{graph:yarnSwatchSample(action),purls:new Set<string>()}:additionalStitchSample(action,purlPattern);
      const source = makeReliefSource(image), {graph,purls}=sample, points = layoutYarnSwatch(graph);
      const bars = new Map(graph.bars.map(bar => [bar.id, bar]));
      const unit = 56, rowHeight = unit * .8, margin = unit;
      const minX = Math.min(...[...points.values()].map(p => p.x)), maxX = Math.max(...[...points.values()].map(p => p.x));
      const width = (maxX - minX + 1) * unit + margin * 2, height = graph.rows.length * rowHeight + margin * 2;
      const canvas = ref.current, ctx = canvas.getContext("2d")!;
      canvas.width = Math.ceil(width * 2); canvas.height = Math.ceil(height * 2);
      ctx.scale(2, 2);
      if(detail){
        const increase=graph.rows.flat().find(loop=>loop.attachment.kind==="lifted-bar"||loop.attachment.kind==="through-loops"||loop.id==="5:3")!;
        const p=points.get(increase.id)!;
        ctx.translate(width/2,height/2);ctx.scale(2.3,2.3);
        ctx.translate(-(margin+(p.x-minX+.5)*unit),-(height-margin+p.y*unit+rowHeight*.15));
      }
      const sprites = new Map(), masks = new Map();
      // The photographic sprite, mask, relief depth and recolouring are shared
      // with the current preview. Only its placement/attachment comes from this graph.
      const mirror = action === "m1r" || action === "k2tog";
      const shaping=(loop:typeof graph.rows[number][number])=>loop.attachment.kind==="lifted-bar"||loop.attachment.kind==="through-loops";
      for (const row of graph.rows) for (const loop of [
        ...(mirror ? [...row].reverse() : row).filter(loop => !shaping(loop)),
        ...row.filter(shaping),
      ]) {
        const p = points.get(loop.id)!, attachment = loop.attachment;
        let sources: number[] = [];
        if (attachment.kind === "through-loop") sources = [points.get(attachment.loop)!.x - p.x];
        if (attachment.kind === "through-loops") sources = attachment.loops.map(id=>points.get(id)!.x-p.x);
        if (attachment.kind === "lifted-bar") {
          const bar = bars.get(attachment.bar)!;
          sources = [points.get(bar.left)!.x - p.x, points.get(bar.right)!.x - p.x];
        }
        // Reflect the texture coordinates and stacking of the surrounding
        // loops as well as the increase itself. Otherwise an identical
        // crossing can be covered by a different photographic neighbour.
        const visualAction = attachment.kind === "lifted-bar" ? "m1l" : attachment.kind==="through-loops"?"ssk":purls.has(loop.id)?"purl":"knit";
        const tileIndex = mirror ? row.length - 1 - loop.index : loop.index;
        // The heads pulled together by a decrease leave larger spans beside
        // them. Let the neighbouring photographic loops follow that space,
        // rather than keeping a fixed-width stamp and exposing the background.
        const leftGap=loop.index?p.x-points.get(row[loop.index-1].id)!.x:1;
        const rightGap=loop.index+1<row.length?points.get(row[loop.index+1].id)!.x-p.x:1;
        const spacing=Math.max(leftGap,rightGap);
        const span=action==="ssk"||action==="k2tog"?Math.max(1,Math.min(1.4,spacing+(spacing>1.01?.08:0))):1;
        const renderedWidth=unit*span;
        const sprite = makeStitchSprite(source, purls.has(loop.id)&&highlight?"#cb83a0":colourFor(loop.family, hex, highlight),
          (tileIndex + loop.row * 2) % source.cellsPerSide, loop.row % source.cellsPerSide,
          renderedWidth, rowHeight, sprites, masks, visualAction, (mirror ? sources.map(x=>-x).reverse() : sources).map(x=>x/span),
          purls.has(loop.id)&&highlight?colourFor(loop.family,hex,true):undefined);
        const x = margin + (p.x - minX + .5) * unit, y = height - margin + p.y * unit;
        ctx.save();ctx.translate(x,y);if(mirror)ctx.scale(-1,1);
        ctx.drawImage(sprite.canvas, -renderedWidth / 2 - sprite.margin, -rowHeight / 2 - sprite.margin);
        ctx.restore();
      }
      ctx.save();ctx.setTransform(2,0,0,2,0,0);ctx.globalCompositeOperation="destination-over";ctx.fillStyle="white";ctx.fillRect(0,0,width,height);ctx.restore();
    };
    image.onerror = () => { if (!cancelled) setError(true); };
    image.src = "/textures/merino-relief.png";
    return () => { cancelled = true; image.onload = null; image.onerror = null; };
  }, [action, hex, highlight, detail,purlPattern]);
  return error ? <p>Could not load the yarn photograph. Refresh to try again.</p>
    : <canvas ref={ref} role="img" aria-label={`${action.toUpperCase()} photographic ${detail?"join close-up":"connection preview"}`} style={{ display: "block", width: "100%", height: "auto" }} />;
}

function IncreaseMirrorDetail({ hex }: { hex: string }) {
  const leftRef = useRef<HTMLCanvasElement>(null), rightRef = useRef<HTMLCanvasElement>(null);
  const [check, setCheck] = useState("Checking mirrored stitches…");
  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const source = makeReliefSource(image), sprites = new Map(), masks = new Map();
      let maxDifference = 0, comparisons = 0;
      // Exercise colour, texture tile, fractional dimensions and asymmetric
      // attachments. Reflecting an attachment must also reverse its offsets.
      for (const colour of [hex, "#334c44", "#c86f52"]) for (const size of [30, 56]) for (const offsets of [[-.5, .5], [-.7, .35]]) {
        const left = makeStitchSprite(source, colour, 2, 1, size, size*.8, sprites, masks, "m1l", offsets);
        const right = makeStitchSprite(source, colour, 2, 1, size, size*.8, sprites, masks, "m1r", offsets.map(x => -x).reverse());
        const a = left.canvas.getContext("2d")!.getImageData(0, 0, left.width, left.height).data;
        const b = right.canvas.getContext("2d")!.getImageData(0, 0, right.width, right.height).data;
        for (let y=0;y<left.height;y++) for(let x=0;x<left.width;x++) for(let c=0;c<4;c++) {
          const i=(y*left.width+x)*4+c,j=(y*left.width+left.width-1-x)*4+c;
          maxDifference=Math.max(maxDifference,Math.abs(a[i]-b[j]));
        }
        comparisons++;
      }
      setCheck(maxDifference <= 1 ? `Isolated stitch check passed · ${comparisons} comparisons` : `Isolated stitch check needs attention · maximum channel difference ${maxDifference}`);
      for(const [action, ref] of [["m1l",leftRef],["m1r",rightRef]] as const){
        if(!ref.current)continue;
        const sprite=makeStitchSprite(source,hex,2,1,92,73.6,sprites,masks,action,[-.5,.5]);
        ref.current.width=sprite.width*2;ref.current.height=sprite.height*2;
        const ctx=ref.current.getContext("2d")!;ctx.scale(2,2);ctx.drawImage(sprite.canvas,0,0);
      }
    };
    image.onerror = () => { if(!cancelled)setCheck("Could not load stitch detail"); };
    image.src="/textures/merino-relief.png";
    return()=>{cancelled=true;image.onload=null;image.onerror=null;};
  },[hex]);
  return <section><h2>Increase detail</h2><div className="photo-pair">
    <article><h3>M1L</h3><canvas ref={leftRef} role="img" aria-label="Isolated photographic M1L" style={{width:"100%",height:"auto",background:"white"}}/></article>
    <article><h3>M1R</h3><canvas ref={rightRef} role="img" aria-label="Isolated photographic M1R" style={{width:"100%",height:"auto",background:"white"}}/></article>
  </div><p role="status" style={{fontSize:12}}>{check}</p></section>;
}

export function PhotographicComparison() {
  const [hex, setHex] = useState("#d9c7a4"), [highlight, setHighlight] = useState(false);
  const [purlPattern,setPurlPattern]=useState<PurlSamplePattern>("single");
  const documents = useMemo(() => ({ m1l: comparisonDocument("m1l", hex, highlight), m1r: comparisonDocument("m1r", hex, highlight) }), [hex, highlight]);
  return <section className="photo-comparison">
    <h1>Photographic yarn · stitch samples</h1>
    <p>The same yarn photograph and stitch rendering as the current preview, with the new stitch connections.</p>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 20, alignItems: "center" }}>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>Yarn colour <select aria-label="Photographic yarn colour" value={hex} onChange={e => setHex(e.target.value)} style={{ width: "auto" }}><option value="#d9c7a4">Cream</option><option value="#334c44">Forest</option><option value="#c86f52">Terracotta</option></select></label>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={highlight} onChange={e => setHighlight(e.target.checked)} style={{ width: "auto" }} />Highlight stitch columns</label>
    </div>
    <style>{`.photo-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:24px}.photo-pair article{min-width:0;padding:12px;background:#faf8f2;border:1px solid #dcd7cc;border-radius:12px}.photo-pair h3{margin-top:0;font-size:15px}.photo-pair .preview-stage{min-height:0;padding:0;background:white;overflow:hidden}.photo-pair .preview-canvas{max-width:100%;height:auto}`}</style>
    <section><h2>Final renderer check</h2>
      {(["m1l","m1r","ssk","k2tog","purl"] as const).map(action=><div key={action}><h3>{action.toUpperCase()}</h3><div className="photo-pair">
        <article><h3>Approved sample</h3><ConnectedPhoto action={action} hex={hex} highlight={highlight} purlPattern={purlPattern}/></article>
        <article><h3>Garment renderer</h3><ConnectedKnitPreview document={comparisonDocument(action,hex,highlight,purlPattern)} stitchSize={56}/></article>
      </div></div>)}
    </section>
    <section><h2>Decreases and purl</h2><p>Two loops join into one for each decrease. Purl shows a patch of front-facing bumps.</p>
      <div className="photo-pair">{(["ssk","k2tog"] as const).map(action=><article key={action}><h3>{action==="ssk"?"SSK":"K2tog"} · join close-up</h3><ConnectedPhoto action={action} hex={hex} highlight detail/></article>)}</div>
      <div className="photo-pair">{(["ssk","k2tog"] as const).map(action=><article key={action}><h3>{action==="ssk"?"SSK":"K2tog"} · full swatch</h3><ConnectedPhoto action={action} hex={hex} highlight={highlight}/></article>)}</div>
      <label style={{display:"flex",gap:8,alignItems:"center",marginBottom:16}}>Purl arrangement<select aria-label="Purl arrangement" style={{width:"auto"}} value={purlPattern} onChange={e=>setPurlPattern(e.target.value as PurlSamplePattern)}><option value="single">Single purl among knits</option><option value="row">One row of purls</option><option value="patch">Purl patch</option></select></label>
      <div className="photo-pair"><article><h3>Purl · join close-up</h3><ConnectedPhoto action="purl" hex={hex} highlight detail purlPattern={purlPattern}/></article><article><h3>Purl · full swatch</h3><ConnectedPhoto action="purl" hex={hex} highlight={highlight} purlPattern={purlPattern}/></article></div>
    </section>
    <IncreaseMirrorDetail hex={hex}/>
    <h2>Join close-ups</h2>
    <div className="photo-pair">{(["m1l","m1r"] as const).map(action=><article key={action}><h3>{action.toUpperCase()}</h3><ConnectedPhoto action={action} hex={hex} highlight detail/></article>)}</div>
    {(["m1l", "m1r"] as const).map(action => <div key={action}>
      <h2>{action.toUpperCase()}</h2>
      <div className="photo-pair">
        <article><h3>Current preview</h3><KnitPreview document={documents[action]} repeatX={1} repeatY={1} repeatStyle="normal" /></article>
        <article><h3>New connections</h3><ConnectedPhoto action={action} hex={hex} highlight={highlight} /></article>
      </div>
    </div>)}
  </section>;
}
