"use client";

import { RefObject, useEffect, useRef, useState } from "react";
import { ChartDocument, StitchAction } from "@/lib/chart";
import { requestPreviewLayout } from "@/lib/preview-layout-request";
import { makeReliefSource, makeStitchSprite } from "./knit-preview";

type Props={
  document:ChartDocument;repeatX?:number;repeatY?:number;mirrored?:boolean;repeatStyle?:"normal"|"mirrored";
  canvasRef?:RefObject<HTMLCanvasElement|null>;showDiagnostics?:boolean;
  /** Diagnostic sample scale; editor uses its normal automatic size. */
  stitchSize?:number;
};

export function ConnectedKnitPreview({document,repeatX=1,repeatY=1,mirrored=false,repeatStyle,canvasRef,showDiagnostics=true,stitchSize}:Props){
  const internalRef=useRef<HTMLCanvasElement>(null),ref=canvasRef??internalRef;
  const [status,setStatus]=useState("Rendering…");
  const [failed,setFailed]=useState(false);
  const reflect=repeatStyle===undefined?mirrored:repeatStyle==="mirrored";
  const down=Math.max(1,Math.min(3,Math.round(repeatY)||1));
  useEffect(()=>{
    const controller=new AbortController();
    let cancelled=false;
    setStatus("Rendering…");
    setFailed(false);
    if(ref.current)ref.current.dataset.previewState="rendering";
    const image=new Image();
    image.onload=async()=>{
      if(cancelled||!ref.current)return;
      try{
        const fabric=await requestPreviewLayout(document,repeatX,reflect,controller.signal);
        if(cancelled||!ref.current)return;
        const source=makeReliefSource(image);
        const unit=stitchSize===undefined?Math.max(12,Math.min(30,Math.floor(1100/fabric.document.width))):Math.max(12,Math.min(56,stitchSize));
        const rowHeight=unit*document.gaugeStitches/document.gaugeRows,bleed=unit;
        // Adjacent plain repeats have the same row pitch as the chart itself.
        // Shaped swatches remain separate laid-out pieces, not fake joins
        // between unrelated necklines/edges.
        const shaped=fabric.loops.some(n=>n.action!=="knit"&&n.action!=="purl")||fabric.rows.some(row=>row.length!==fabric.rows[0].length);
        const verticalPitch=shaped?fabric.height:document.height*document.gaugeStitches/document.gaugeRows;
        const width=Math.ceil(fabric.width*unit+bleed*2),height=Math.ceil((fabric.height+(down-1)*verticalPitch)*unit+bleed*2);
        const scale=Math.min(2,window.devicePixelRatio||1,3600/width,3600/height);
        // Paint a staging canvas, then commit atomically. Cancelling a refresh
        // must not leave half a swatch in the visible preview or PNG export.
        const canvas=window.document.createElement("canvas"),ctx=canvas.getContext("2d")!;
        canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
        ctx.scale(scale,scale);ctx.fillStyle="white";ctx.fillRect(0,0,width,height);
        const palette=new Map(document.palette.map(c=>[c.id,c.hex]));
        const sprites=new Map(),masks=new Map();
        let lastYield=performance.now();
        for(let tile=down-1;tile>=0;tile--)for(let r=fabric.rows.length-1;r>=0;r--){
          const verticalMirror=reflect&&tile%2===1;
          const row=fabric.rows[r],special=row.filter(n=>n.kind==="bar"||n.kind==="merge");
          for(const node of [...row.filter(n=>!special.includes(n)),...special]){
            if(performance.now()-lastYield>10){
              // Yield between short drawing batches, including on browsers
              // where sprite generation is expensive. A chart switch/refresh
              // can abort here without committing the unfinished canvas.
              await new Promise<void>(resolve=>setTimeout(resolve,0));
              if(cancelled)return;
              lastYield=performance.now();
            }
            const hex=palette.get(fabric.document.cells[r]?.[node.column])??document.palette[0]?.hex??"#f2eadf";
            const nearby=special.reduce<typeof node|undefined>((best,n)=>Math.abs(n.x-node.x)<2.1&&(!best||Math.abs(n.x-node.x)<Math.abs(best.x-node.x))?n:best,undefined);
            const mirror=nearby?.action==="m1r"||nearby?.action==="k2tog";
            let action:StitchAction=node.action;
            if(mirror)action=action==="m1r"?"m1l":action==="k2tog"?"ssk":action;
            const widthScale=node.action==="cast-on"?.86:node.action==="bind-off"?1.08:1;
            const hScale=node.action==="cast-on"?.72:node.action==="bind-off"?.5:1;
            const span=Math.round(node.span*widthScale*16)/16,renderWidth=unit*span;
            const offsets=node.parents.map(id=>{
              const parent=fabric.loops[id];
              return Math.round(((parent.x-node.x)*Math.cos(node.angle)+(parent.y-node.y)*Math.sin(node.angle))/span*16)/16;
            });
            // Reflected vertical tiles are decorative pattern repeats, not
            // another working sequence with reversed stitch ancestry.
            const sources=verticalMirror?[]:mirror?offsets.map(x=>-x).reverse():offsets;
            // Sample the photo in knitting order, using actual loop positions
            // rather than placeholder chart columns. Inserting an unworked
            // chart cell must not introduce a new photographic fibre seam.
            const photoRow=document.height-1-r;
            const col=node.packed%document.width,tileCol=mirror?document.width-1-col:col;
            const sprite=makeStitchSprite(source,hex,(tileCol+photoRow*2)%source.cellsPerSide,photoRow%source.cellsPerSide,
              renderWidth,rowHeight*hScale,sprites,masks,action,sources);
            const verticalOffset=node.action==="cast-on"?rowHeight*.28:node.action==="bind-off"?rowHeight*.08:0;
            const localY=node.y-fabric.minY;
            ctx.save();ctx.translate(bleed+(node.x-fabric.minX)*unit,bleed+(tile*verticalPitch+(verticalMirror?fabric.height-localY:localY))*unit);
            ctx.rotate(verticalMirror?-node.angle:node.angle);
            if(mirror)ctx.scale(-1,1);
            ctx.drawImage(sprite.canvas,-renderWidth/2-sprite.margin,-rowHeight/2+verticalOffset-sprite.margin);
            ctx.restore();
          }
        }
        if(cancelled||!ref.current)return;
        const target=ref.current;
        target.width=canvas.width;target.height=canvas.height;
        target.style.width=`${Math.min(width,1400)}px`;target.style.height="auto";target.style.aspectRatio=`${width}/${height}`;
        const targetContext=target.getContext("2d");
        if(!targetContext)throw new Error("Canvas is unavailable.");
        targetContext.drawImage(canvas,0,0);
        target.dataset.previewState="ready";
        setStatus([
          fabric.unresolvedRows.length?`${fabric.unresolvedRows.length} row transitions have incomplete connections.`:"",
          fabric.inferredRows.length?`${fabric.inferredRows.length} rows contain inferred stitch births at newly occupied chart cells (missing increase symbols).`:"",
          fabric.inputCountDecreaseRows.length?`${fabric.inputCountDecreaseRows.length} decrease rows use the input-count chart convention; consumed companion cells are combined in this preview only.`:"",
        ].filter(Boolean).join(" "));
      }catch(error){if(cancelled)return;if(ref.current)ref.current.dataset.previewState="error";setFailed(true);setStatus(error instanceof Error?error.message:"Could not render the knitted preview.");}
    };
    image.onerror=()=>{if(!cancelled){if(ref.current)ref.current.dataset.previewState="error";setFailed(true);setStatus("Could not load the photographic yarn texture.");}};
    image.src="/textures/merino-relief.png";
    return()=>{cancelled=true;controller.abort();image.onload=null;image.onerror=null;};
  },[document,repeatX,down,reflect,stitchSize,ref]);
  return <div><div className="preview-stage" style={{overflow:"auto",maxHeight:showDiagnostics?620:undefined,background:"white",textAlign:"center"}}><canvas ref={ref} className="preview-canvas" role="img" aria-label={showDiagnostics?"Connected photographic garment preview":"Photographic knitted fabric preview"} style={{display:"inline-block",maxWidth:"100%",height:"auto",verticalAlign:"top"}}/></div>{status&&(showDiagnostics||failed||status==="Rendering…")?<p role={failed?"alert":"status"} style={{fontSize:13}}>{status}</p>:null}</div>;
}
