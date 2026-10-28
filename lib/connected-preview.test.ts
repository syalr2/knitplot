import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ChartDocument, defaultDocument, StitchAction } from "./chart";
import { connectedFabric, expandPreviewDocument } from "./connected-preview";
import { edgeShapingFixture } from "./knit-preview-fixtures";

test("plain colourwork preserves stitch spacing, gauge and its input",()=>{
  const snapshot=JSON.stringify(defaultDocument),fabric=connectedFabric(defaultDocument);
  assert.equal(fabric.unresolvedRows.length,0);
  for(const row of fabric.rows)for(const n of row){assert.ok(Math.abs(n.x-(n.column+.5))<1e-9);assert.ok(Math.abs(n.y-n.row*defaultDocument.gaugeStitches/defaultDocument.gaugeRows)<1e-9);}
  assert.equal(JSON.stringify(defaultDocument),snapshot);
});

for(const placement of ["both","left","distributed"] as const)test(`${placement} increases retain separate bar and loop connections across repeats`,()=>{
  const doc=edgeShapingFixture(placement),fabric=connectedFabric(doc,3);
  assert.equal(fabric.unresolvedRows.length,0);
  assert.equal(fabric.rows[0].length,120);assert.equal(fabric.rows.at(-1)!.length,72);
  for(const n of fabric.loops){
    assert.ok(Number.isFinite(n.x)&&Number.isFinite(n.y));
    if(n.kind==="bar")assert.equal(n.parents.length,2);
    if(n.kind==="loop")assert.equal(n.parents.length,1);
    if(n.left!==undefined){
      const p=fabric.loops[n.left],distance=Math.hypot(n.x-p.x,n.y-p.y);
      assert.ok(distance>.45&&distance<1.6,"neighbours stay connected without folding over");
    }
    if(n.kind==="loop"){
      const p=fabric.loops[n.parents[0]],h=doc.gaugeStitches/doc.gaugeRows;
      assert.ok(Math.hypot(n.x-p.x-Math.sin(n.angle)*h,n.y-p.y+Math.cos(n.angle)*h)<.5,"ordinary loops follow their actual parents in the local fabric frame");
    }
  }
  // Width is measured along the bent course, not its horizontal projection.
  const length=(row:typeof fabric.rows[number])=>row.slice(1).reduce((s,n,i)=>s+Math.hypot(n.x-row[i].x,n.y-row[i].y),0);
  for(const row of fabric.rows)assert.ok(length(row)/(row.length-1)>.9&&length(row)/(row.length-1)<1.1);
  assert.ok(length(fabric.rows[0])-length(fabric.rows.at(-1)!)>40,"extra stitches add fabric instead of squeezing into the same width");
});

test("stitch density remains stable along curved rows at one, two and three repeats",()=>{
  const doc=edgeShapingFixture("distributed");
  for(const repeats of [1,2,3])for(const mirrored of [false,true]){
    const fabric=connectedFabric(doc,repeats,mirrored);
    for(const row of fabric.rows){
      const length=row.slice(1).reduce((s,n,i)=>s+Math.hypot(n.x-row[i].x,n.y-row[i].y),0);
      assert.ok(length/(row.length-1)>.9&&length/(row.length-1)<1.1);
    }
  }
});

test("a missing increase symbol does not discard the rest of its row",()=>{
  const doc={...defaultDocument,width:5,height:2,cells:Array.from({length:2},()=>Array<string>(5).fill("background")),
    stitchActions:[["knit","knit","knit","knit","knit"],["knit","knit","no-stitch","knit","knit"]] as StitchAction[][]};
  const snapshot=JSON.stringify(doc),fabric=connectedFabric(doc);
  assert.deepEqual(fabric.unresolvedRows,[]);assert.deepEqual(fabric.inferredRows,[0]);
  assert.equal(fabric.rows[0][2].kind,"bar");assert.equal(fabric.rows[0][2].inferred,true);
  assert.equal(fabric.rows[0][2].action,"knit","inference must not invent an explicit shaping action");
  assert.deepEqual(fabric.rows[0].filter(n=>!n.inferred).flatMap(n=>n.parents),fabric.rows[1].map(n=>n.id));
  assert.equal(JSON.stringify(doc),snapshot);
});

test("an edge M1 retains its one visible supporting neighbour",()=>{
  const doc={...defaultDocument,width:4,height:2,cells:Array.from({length:2},()=>Array<string>(4).fill("background")),
    stitchActions:[["knit","knit","knit","m1l"],["knit","knit","knit","no-stitch"]] as StitchAction[][]};
  const fabric=connectedFabric(doc);
  assert.deepEqual(fabric.unresolvedRows,[]);assert.deepEqual(fabric.inferredRows,[]);
  assert.equal(fabric.rows[0][3].kind,"bar");assert.equal(fabric.rows[0][3].parents.length,1);
});

test("Rosie-style placeholder activation keeps every course connected across repeats",()=>{
  // Structural mask only, without the colourwork artwork. Includes the two
  // newly occupied cells without increase symbols and two repeat-edge M1s
  // that previously caused an entire course to lose its connections.
  const schedule:[number,string][]=[
    [1,"K..KKKK.KKK..KKKLK....KKLKKK.KK.KK.."],
    [1,"K..KKKK.KKK..KKKKK....KKKKKK.KK.KK.."],
    [1,"K.LKKKK.KKK..KKKKK....KKKKKKLKK.KK.."],
    [1,"K.KKKKK.KKK..KKKKK....KKKKKKKKK.KK.."],
    [2,"K.KKKKK.KKK..KKKKK.K..KKKKKKKKK.KK.."],
    [9,"K.KKKKK.KKK..KKKKK.K..KKKKKKKKKKKK.."],
    [1,"K.KKKKK.KKK..KKKKK.K..KKKKKKKKKKKKL."],
    [1,"K.KKKKK.KKK..KKKKK.K..KKKKKKKKKKKKK."],
    [1,"K.KKKKK.KKKL.KKKKK.K.LKKKKKKKKKKKKK."],
    [3,"K.KKKKK.KKKK.KKKKK.K.KKKKKKKKKKKKKK."],
    [1,"KLKKKKK.KKKK.KKKKKLK.KKKKKKKKKKKKKK."],
    [5,"KKKKKKK.KKKK.KKKKKKK.KKKKKKKKKKKKKK."],
    [1,"KKKKKKKLKKKK.KKKKKKK.KKKKKKKKKKKKKKL"],
    [2,"KKKKKKKKKKKK.KKKKKKK.KKKKKKKKKKKKKKK"],
    [1,"KKKKKKKKKKKK.KKKKKKKLKKKKKKKKKKKKKKK"],
    [1,"KKKKKKKKKKKK.KKKKKKKKKKKKKKKKKKKKKKK"],
    [1,"KKKKKKKKKKKKLKKKKKKKKKKKKKKKKKKKKKKK"],
  ];
  const actions=schedule.flatMap(([count,mask])=>Array.from({length:count},()=>[...mask].map((s):StitchAction=>s==="."?"no-stitch":s==="L"?"m1l":"knit"))).reverse();
  const doc={...defaultDocument,width:36,height:33,cells:actions.map(()=>Array<string>(36).fill("background")),stitchActions:actions};
  for(const repeats of [1,3]){
    const f=connectedFabric(doc,repeats);
    assert.deepEqual(f.unresolvedRows,[]);assert.deepEqual(f.inferredRows,[26,28]);
    assert.ok(f.rows.some(row=>Math.max(...row.map(n=>n.y))-Math.min(...row.map(n=>n.y))>.05),"courses bend rather than sliding as rigid strips");
    for(const n of f.loops.filter(n=>n.kind==="loop")){
      const p=f.loops[n.parents[0]],h=doc.gaugeStitches/doc.gaugeRows;
      assert.ok(Math.hypot(n.x-p.x-Math.sin(n.angle)*h,n.y-p.y+Math.cos(n.angle)*h)<.35,"a stitch must stay close to the loop it is knitted through");
    }
  }
});

function openingDocument(castOn=false):ChartDocument{
  const full=Array<StitchAction>(7).fill("knit"),gap=[...full];gap[3]="no-stitch";
  const edge=[...full];edge[3]=castOn?"cast-on":"bind-off";
  return {...defaultDocument,width:7,height:4,cells:Array.from({length:4},()=>Array<string>(7).fill("background")),
    stitchActions:castOn?[full,edge,gap,gap]:[gap,gap,edge,full]};
}
for(const castOn of [false,true])test(`${castOn?"cast-on":"bind-off"} preserves an opening without joining its two sides`,()=>{
  const fabric=connectedFabric(openingDocument(castOn)),row=fabric.rows[castOn?3:0];
  const left=row[2],right=row[3];
  assert.equal(left.right,undefined);assert.equal(right.left,undefined);
  assert.equal(right.packed-left.packed,2);assert.ok(right.x-left.x>1.9);
  assert.ok(left.boundary&&right.boundary);
});

test("top-down bind-off chart retains the neckline below the BO row without converting symbols",()=>{
  const original=openingDocument(),doc={...original,stitchActions:[...original.stitchActions!].reverse()};
  const snapshot=JSON.stringify(doc),f=connectedFabric(doc);
  assert.deepEqual(f.unresolvedRows,[]);
  assert.ok(f.rows[0].every(n=>n.kind==="loop"&&n.parents.length===1));
  assert.ok(f.rows[1].filter(n=>n.action!=="bind-off").every(n=>n.kind==="loop"&&n.parents.length===1));
  for(const row of f.rows.slice(2)){
    const left=row.find(n=>n.column===2)!,right=row.find(n=>n.column===4)!;
    assert.equal(left.right,undefined);assert.equal(right.left,undefined);
    assert.ok(right.x-left.x>1.9);
  }
  assert.equal(f.rows[1].find(n=>n.column===3)!.action,"bind-off");
  assert.equal(JSON.stringify(doc),snapshot);
});

test("garment edges retain their chart offset after placeholder compaction",()=>{
  const doc=openingDocument();
  doc.stitchActions=doc.stitchActions!.map(row=>["no-stitch",...row,"no-stitch"]);
  doc.cells=doc.cells.map(row=>["background",...row,"background"]);doc.width=9;
  const fabric=connectedFabric(doc);
  const boundary=fabric.rows[0].find(n=>n.boundary)!;
  assert.ok(Math.abs(boundary.x-(boundary.column+.5))<1e-9);
});

test("mirrored repeats reflect colours and shaping direction",()=>{
  const doc={...openingDocument(),width:2,height:1,cells:[["ink","background"]],stitchActions:[["m1l","ssk"]] as StitchAction[][]};
  const expanded=expandPreviewDocument(doc,2,true);
  assert.deepEqual(expanded.cells,[["ink","background","background","ink"]]);
  assert.deepEqual(expanded.stitchActions,[["m1l","ssk","k2tog","m1r"]]);
});

test("inconsistent row counts are retained without fabricated parent connections",()=>{
  const doc={...openingDocument(),height:2,cells:Array.from({length:2},()=>Array<string>(7).fill("background")),
    stitchActions:[Array<StitchAction>(7).fill("m1l"),Array<StitchAction>(7).fill("knit")]};
  const fabric=connectedFabric(doc);
  assert.deepEqual(fabric.unresolvedRows,[0]);assert.ok(fabric.rows[0].every(n=>!n.parents.length));
});

test("core stitch actions retain valid topology in normal and mirrored repeats",()=>{
  const K:StitchAction="knit",N:StitchAction="no-stitch";
  for(const action of ["m1l","m1r","ssk","k2tog","purl","bind-off","cast-on"] as StitchAction[]){
    const hole:StitchAction[]=[K,K,N,K,K,N,N],full:StitchAction[]=[K,K,K,K,K,N,N];
    const decrease=action==="ssk"||action==="k2tog";
    const operation:StitchAction[]=decrease?[K,action,K,K,N,N,N]:[K,K,action,K,K,N,N];
    const before=action==="m1l"||action==="m1r"||action==="cast-on"?hole:full;
    const after=decrease?[K,K,K,K,N,N,N]:action==="bind-off"?hole:full;
    const doc={...defaultDocument,width:7,height:5,cells:Array.from({length:5},()=>Array<string>(7).fill("background")),stitchActions:[after,after,operation,before,before]};
    for(const mirrored of [false,true]){
      const f=connectedFabric(doc,3,mirrored);
      assert.deepEqual(f.unresolvedRows,[],`${action}, mirrored=${mirrored}`);
      assert.deepEqual(f.inferredRows,[],"explicit shaping needs no inferred births");
      assert.ok(f.loops.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)&&Number.isFinite(n.angle)));
      assert.equal(f.rows[2].filter(n=>n.action===action||(mirrored&&action==="m1l"&&n.action==="m1r")||(mirrored&&action==="m1r"&&n.action==="m1l")||(mirrored&&action==="ssk"&&n.action==="k2tog")||(mirrored&&action==="k2tog"&&n.action==="ssk")).length,3);
    }
  }
});

test("maximum-size plain and purl charts preserve an exact grid without expensive relaxation",()=>{
  const doc={...defaultDocument,width:200,height:150,cells:Array.from({length:150},()=>Array<string>(200).fill("background"))};
  for(const purl of [false,true]){
    const input=purl?{...doc,stitchActions:Array.from({length:150},()=>Array<StitchAction>(200).fill("purl"))}:doc;
    const start=performance.now(),f=connectedFabric(input,3);
    assert.equal(f.loops.length,90000);assert.deepEqual(f.unresolvedRows,[]);
    for(const n of f.loops){assert.equal(n.x,n.column+.5);assert.equal(n.y,n.row*(20/24));assert.equal(n.span,1);}
    const elapsed=performance.now()-start;
    assert.ok(elapsed<5000,`flat chart layout should not run a multi-second relaxation (${Math.round(elapsed)} ms)`);
  }
});

test("dense invalid increase charts retain diagnostics without overflowing bounds calculations",()=>{
  const doc={...defaultDocument,width:200,height:150,cells:Array.from({length:150},()=>Array<string>(200).fill("background")),
    stitchActions:Array.from({length:150},()=>Array<StitchAction>(200).fill("kfb"))};
  const f=connectedFabric(doc,3);
  assert.equal(f.loops.length,180000);assert.equal(f.unresolvedRows.length,149);
  assert.ok([f.width,f.height,f.minX,f.minY].every(Number.isFinite));
});
