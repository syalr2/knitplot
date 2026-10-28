import { ChartDocument, StitchAction, stitchActionAt, stitchActionMath } from "./chart";
import { layoutPreviewRows } from "./knit-preview-layout";
import { adaptInputCountDecreases } from "./preview-decrease-convention";

export type FabricConnection = "start"|"loop"|"bar"|"merge"|"split"|"cast-on"|"bind-off"|"unresolved";
export type ConnectedLoop = {
  id:number; row:number; column:number; packed:number; action:StitchAction;
  kind:FabricConnection; parents:number[]; x:number; y:number; span:number;
  left?:number; right?:number; boundary:boolean; inferred?:boolean; angle:number;
};
export type ConnectedFabric = {
  document:ChartDocument; rows:ConnectedLoop[][]; loops:ConnectedLoop[];
  minX:number; minY:number; width:number; height:number; unresolvedRows:number[]; inferredRows:number[]; inputCountDecreaseRows:number[];
};

export function expandPreviewDocument(document:ChartDocument,repeats=1,mirrored=false):ChartDocument {
  const count=Math.max(1,Math.min(3,Math.floor(repeats)||1));
  if(count===1)return document;
  const original=(col:number)=>mirrored&&Math.floor(col/document.width)%2?document.width-1-col%document.width:col%document.width;
  return {...document,width:document.width*count,
    cells:document.cells.map(row=>Array.from({length:document.width*count},(_,col)=>row[original(col)])),
    stitchActions:Array.from({length:document.height},(_,row)=>Array.from({length:document.width*count},(_,col)=>{
      const action=stitchActionAt(document,row,original(col));
      if(!mirrored||Math.floor(col/document.width)%2===0)return action;
      return action==="m1l"?"m1r":action==="m1r"?"m1l":action==="ssk"?"k2tog":action==="k2tog"?"ssk":action;
    }))};
}

/** Chart adapter for the connection experiment.
 * Placeholder compaction/opening history comes from the existing packing
 * pass; the constraints below distinguish bar births from consumed parents. */
export function connectedFabric(input:ChartDocument,repeats=1,mirrored=false):ConnectedFabric {
  const adapted=adaptInputCountDecreases(expandPreviewDocument(input,repeats,mirrored));
  const document=adapted.document,packed=layoutPreviewRows(document);
  const rowHeight=document.gaugeStitches/document.gaugeRows;
  // A count mismatch must not erase every otherwise identifiable connection.
  // Recover only births at newly occupied chart columns, with an exact count
  // match. This is preview-only inference, never an edit to the chart symbols.
  const inferred=new Set<string>();
  for(let r=document.height-2;r>=0;r--){
    const row=packed[r].loops,below=packed[r+1].loops;
    if(!row.length||row.some(n=>n.sources!==undefined)||row.some((n,i)=>i>0&&n.x>row[i-1].x+1))continue;
    const parents=below.filter(n=>stitchActionAt(document,r+1,n.column)!=="bind-off");
    const columns=[...new Set(row.map(n=>n.column))];
    const required=columns.reduce((s,c)=>s+stitchActionMath(stitchActionAt(document,r,c)).consumes,0);
    const births=columns.filter(c=>(stitchActionAt(document,r,c)==="knit"||stitchActionAt(document,r,c)==="purl")&&stitchActionAt(document,r+1,c)==="no-stitch");
    if(required-parents.length!==births.length||!births.length)continue;
    let cursor=0;
    for(const c of columns){
      const birth=births.includes(c),action=stitchActionAt(document,r,c);
      const consumes=birth?0:stitchActionMath(action).consumes;
      const sources=consumes?parents.slice(cursor,cursor+consumes):[parents[cursor-1],parents[cursor]].filter(Boolean);
      for(const n of row.filter(n=>n.column===c))n.sources=sources.map(p=>p.x);
      if(birth)inferred.add(`${r}:${c}`);
      cursor+=consumes;
    }
  }
  const all:ConnectedLoop[]=[],unresolved=new Set<number>();
  const rows=packed.map((row,r)=>row.loops.map((loop,i):ConnectedLoop=>{
    const action=stitchActionAt(document,r,loop.column);
    const node:ConnectedLoop={id:all.length,row:r,column:loop.column,packed:loop.x,action,
      kind:r===document.height-1?"start":"unresolved",parents:[],x:loop.x+.5,y:r*rowHeight,span:1,angle:0,inferred:inferred.has(`${r}:${loop.column}`),
      boundary:(i>0&&loop.x>row.loops[i-1].x+1)||(i+1<row.loops.length&&row.loops[i+1].x>loop.x+1)};
    all.push(node);return node;
  }));
  const maps=rows.map(row=>new Map(row.map(loop=>[loop.packed,loop])));
  rows.forEach((row,r)=>row.forEach((node,i)=>{
    if(i&&node.packed===row[i-1].packed+1){node.left=row[i-1].id;row[i-1].right=node.id;}
    const raw=packed[r].loops[i];
    node.parents=(raw.sources??[]).flatMap(x=>{const p=maps[r+1]?.get(x);return p?[p.id]:[];});
    node.kind=node.action==="cast-on"?"cast-on":node.action==="bind-off"?"bind-off"
      :r===document.height-1?"start"
        :node.action==="m1l"||node.action==="m1r"||node.inferred?node.parents.length>=1?"bar":"unresolved"
          :node.action==="ssk"||node.action==="k2tog"||node.action==="cdd"||node.action==="dec"?node.parents.length>=2?"merge":"unresolved"
            :node.action==="kfb"||node.action==="inc"?node.parents.length===1?"split":"unresolved"
              :node.parents.length===1?"loop":"unresolved";
    if(node.kind==="unresolved")unresolved.add(r);
  }));
  const hasOpenings=all.some(n=>n.action==="cast-on"||n.action==="bind-off");
  if(hasOpenings)for(const row of rows){
    // Chart columns locate garment edges. Packing removes placeholder space,
    // so recover the left edge's chart offset before anchoring an opening.
    const origin=row.length?row[0].column-row[0].packed:0;
    for(const n of row)n.x+=origin;
  }
  const pitch=Math.max(1,...packed.map(r=>r.width));
  if(!hasOpenings)for(const row of rows)for(const n of row)n.x+=(pitch-row.length)/2;
  // A flat seed traps a widening sheet in a compressed, almost-flat local
  // minimum. For monotone growth only, initialize an arc-length-preserving
  // pose. This is not a constraint: the connection solver below can change
  // every point. Garment openings and non-monotone shaping start straight.
  const meanRow=(rows.length-1)/2,meanWidth=rows.reduce((s,r)=>s+r.length,0)/Math.max(1,rows.length);
  let numerator=0,denominator=0;
  rows.forEach((row,r)=>{numerator+=(r-meanRow)*(row.length-meanWidth);denominator+=(r-meanRow)**2;});
  const slope=denominator?numerator/denominator:0,turn=slope/rowHeight;
  const monotone=rows.every((row,r)=>!r||(row.length-rows[r-1].length)*slope>=0);
  if(!hasOpenings&&monotone&&Math.abs(turn)>.035&&Math.abs(turn)<2){
    const radius0=meanWidth/Math.abs(turn),sign=Math.sign(turn);
    for(let r=0;r<rows.length;r++){
      const radius=(meanWidth+slope*(r-meanRow))/Math.abs(turn);
      if(radius<=0)continue;
      for(let i=0;i<rows[r].length;i++){
        const n=rows[r][i],theta=(i+.5-rows[r].length/2)/radius;
        n.x=radius*Math.sin(theta);
        n.y=meanRow*rowHeight+sign*(radius*Math.cos(theta)-radius0);
      }
    }
  }
  const rest=all.map(n=>({x:n.x,y:n.y}));
  const children=all.map(()=>[] as number[]);
  for(const n of all)if(n.kind!=="bar")for(const p of n.parents)children[p].push(n.id);
  const tx=new Float64Array(all.length),ty=new Float64Array(all.length);
  const nextX=new Float64Array(all.length),nextY=new Float64Array(all.length);
  const parentX=new Float64Array(all.length),parentY=new Float64Array(all.length),splitOffset=new Float64Array(all.length);
  for(const row of rows){
    const siblings=new Map<number,ConnectedLoop[]>();
    for(const n of row)if(n.kind==="split"){
      const group=siblings.get(n.column)??[];group.push(n);siblings.set(n.column,group);
    }
    for(const group of siblings.values())group.forEach((n,i)=>{splitOffset[n.id]=(i-(group.length-1)/2)*.5;});
  }
  // A rectangular, already aligned sheet is an exact equilibrium. Running
  // hundreds of relaxation passes cannot improve it (including purl texture).
  const needsRelaxation=hasOpenings||rows.some(row=>row.length!==rows[0].length)||all.some(n=>
    n.kind==="bar"||n.kind==="merge"||n.kind==="split"||n.parents.some(id=>Math.abs(all[id].x-n.x)>1e-9));
  const pinned=(n:ConnectedLoop)=>hasOpenings&&(n.boundary||n.kind==="cast-on"||n.kind==="bind-off");
  // Neighbour and through-loop constraints act in the local fabric frame.
  // Unlike a rigid row, adjacent loops can rotate around one another. A bar
  // birth is supported between parents but does not consume either parent.
  for(let iteration=0;iteration<(needsRelaxation?(all.length<6000?2400:700):0);iteration++){
    for(const n of all){
      const a=n.left===undefined?n:all[n.left],b=n.right===undefined?n:all[n.right];
      const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
      tx[n.id]=dx/len;ty[n.id]=dy/len;
      let px=0,py=0;
      for(const id of n.parents){px+=all[id].x;py+=all[id].y;}
      if(n.parents.length){parentX[n.id]=px/n.parents.length;parentY[n.id]=py/n.parents.length;}
    }
    for(const n of all){
      if(pinned(n)){nextX[n.id]=rest[n.id].x;nextY[n.id]=rest[n.id].y;continue;}
      let x=rest[n.id].x*.002,y=rest[n.id].y*.002,w=.002;
      for(let side=0;side<2;side++){
        const id=side===0?n.left:n.right,sign=side===0?1:-1;
        if(id===undefined)continue;
        const other=all[id],dx=tx[n.id]+tx[id],dy=ty[n.id]+ty[id],len=Math.hypot(dx,dy)||1;
        x+=(other.x+sign*dx/len)*6;y+=(other.y+sign*dy/len)*6;w+=6;
      }
      if(n.parents.length){
        const weight=n.kind==="bar"?1:8,offset=splitOffset[n.id];
        x+=(parentX[n.id]+ty[n.id]*rowHeight+tx[n.id]*offset)*weight;
        y+=(parentY[n.id]-tx[n.id]*rowHeight+ty[n.id]*offset)*weight;w+=weight;
      }
      for(const id of children[n.id]){
        const c=all[id],weight=8/c.parents.length;
        x+=(c.x-ty[id]*rowHeight+n.x-parentX[id])*weight;
        y+=(c.y+tx[id]*rowHeight+n.y-parentY[id])*weight;w+=weight;
      }
      nextX[n.id]=n.x*.35+x/w*.65;nextY[n.id]=n.y*.35+y/w*.65;
    }
    for(const n of all){n.x=nextX[n.id];n.y=nextY[n.id];}
  }
  const decreases=rows.map(row=>row.filter(n=>n.kind==="merge"));
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const n of all){
    const a=n.left===undefined?n:all[n.left],b=n.right===undefined?n:all[n.right];
    n.angle=Math.atan2(b.y-a.y,b.x-a.x);
    const left=n.left===undefined?1:Math.hypot(n.x-a.x,n.y-a.y),right=n.right===undefined?1:Math.hypot(b.x-n.x,b.y-n.y);
    const nearDecrease=decreases[n.row].some(other=>Math.abs(other.x-n.x)<2.5);
    const spacing=Math.max(left,right);
    n.span=nearDecrease?Math.max(1,Math.min(1.4,spacing+(spacing>1.01?.08:0))):Math.max(.85,Math.min(1.2,(left+right)/2));
    minX=Math.min(minX,n.x-n.span*.8);maxX=Math.max(maxX,n.x+n.span*.8);
    minY=Math.min(minY,n.y-rowHeight);maxY=Math.max(maxY,n.y+rowHeight);
  }
  if(!all.length){minX=0;maxX=1;minY=0;maxY=rowHeight;}
  return {document,rows,loops:all,minX,minY,width:maxX-minX,height:maxY-minY,
    unresolvedRows:[...unresolved].sort((a,b)=>a-b),inferredRows:[...new Set(all.filter(n=>n.inferred).map(n=>n.row))],inputCountDecreaseRows:adapted.rows};
}
