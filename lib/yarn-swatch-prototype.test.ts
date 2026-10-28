import { strict as assert } from "node:assert";
import { test } from "node:test";
import { layoutYarnSwatch,yarnSwatchSample,repeatedYarnSample,additionalStitchSample } from "./yarn-swatch-prototype";

test("plain swatch preserves nominal stitch spacing and gauge",()=>{
  const g=yarnSwatchSample("plain"),p=layoutYarnSwatch(g,0.75);
  for(const row of g.rows)for(const loop of row){assert.ok(Math.abs(p.get(loop.id)!.x-loop.index)<1e-9);assert.equal(p.get(loop.id)!.y,-loop.row*0.75);}
});

for(const side of ["left","right"] as const)test(`repeated ${side} increases preserve the anchor and valid spacing`,()=>{
  const graph=repeatedYarnSample("m1l",side),points=layoutYarnSwatch(graph);
  const bars=new Map(graph.bars.map(bar=>[bar.id,bar]));
  const loops=new Map(graph.rows.flat().map(loop=>[loop.id,loop]));
  assert.deepEqual(points,layoutYarnSwatch(repeatedYarnSample("m1r",side)));
  assert.equal(graph.rows[0].length,8);assert.equal(graph.rows.at(-1)!.length,12);
  let increases=0;
  for(const row of graph.rows){
    assert.equal(row.filter(loop=>loop.family==="original-3").length,1);
    for(const [index,loop] of row.entries()){
      const p=points.get(loop.id)!;
      assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
      if(index)assert.ok(p.x-points.get(row[index-1].id)!.x>.35);
      if(loop.attachment.kind==="lifted-bar"){
        increases++;
        const bar=bars.get(loop.attachment.bar)!;
        assert.equal(loops.get(side==="left"?bar.right:bar.left)!.family,"original-3");
      }
    }
  }
  assert.equal(increases,4);
  const width=(row:typeof graph.rows[number])=>points.get(row.at(-1)!.id)!.x-points.get(row[0].id)!.x;
  assert.ok(width(graph.rows.at(-1)!)>width(graph.rows[0])+1);
});
test("M1L and M1R share geometry, differing in bar twist only",()=>{
  assert.deepEqual(layoutYarnSwatch(yarnSwatchSample("m1l")),layoutYarnSwatch(yarnSwatchSample("m1r")));
});
test("increased swatch widens without inverted or coincident loops",()=>{
  const g=yarnSwatchSample("m1l"),p=layoutYarnSwatch(g);
  for(const row of g.rows)for(const [i,l] of row.entries()){
    assert.ok(Number.isFinite(p.get(l.id)!.x));
    if(i)assert.ok(p.get(l.id)!.x-p.get(row[i-1].id)!.x>0.4);
  }
  const width=(r:number)=>p.get(g.rows[r].at(-1)!.id)!.x-p.get(g.rows[r][0].id)!.x;
  assert.ok(width(11)>width(0)+0.4);
  assert.equal(g.rows[5][4].attachment.kind,"lifted-bar");
});

test("decrease samples join two parents once and narrow the subsequent rows",()=>{
  for(const action of ["ssk","k2tog"] as const){
    const {graph}=additionalStitchSample(action),points=layoutYarnSwatch(graph);
    assert.deepEqual(graph.rows.map(row=>row.length),[8,8,8,8,8,7,7,7,7,7,7,7]);
    assert.deepEqual(graph.rows[5][3].attachment,{kind:"through-loops",loops:["4:3","4:4"],lean:action==="ssk"?"left":"right"});
    assert.deepEqual(graph.rows[6][3].attachment,{kind:"through-loop",loop:"5:3"});
    for(const row of graph.rows)for(const [i,loop] of row.entries()){
      assert.ok(Number.isFinite(points.get(loop.id)!.x));
      if(i)assert.ok(points.get(loop.id)!.x>points.get(row[i-1].id)!.x);
    }
  }
});

test("purl patch keeps stitch counts and one-to-one connections",()=>{
  const {graph,purls}=additionalStitchSample("purl");
  assert.equal(purls.size,9);
  for(const row of graph.rows){assert.equal(row.length,8);for(const loop of row)if(purls.has(loop.id))assert.equal(loop.attachment.kind,"through-loop");}
});
