import { strict as assert } from "node:assert";
import { test } from "node:test";
import { stitchActionMath } from "./chart";
import { edgeShapingFixture } from "./knit-preview-fixtures";
import { layoutFabric, fabricSurface } from "./knit-preview-layout";

for(const placement of ["both","left","distributed","plain"] as const) {
  test(`${placement}: valid counts, ancestry and persistent stripes`,()=>{
    const doc=edgeShapingFixture(placement), layout=layoutFabric(doc);
    for(let r=0;r<doc.height-1;r++) {
      assert.equal(doc.stitchActions![r].reduce((s,a)=>s+stitchActionMath(a).consumes,0),layout.rows[r+1].loops.length);
      assert.ok(layout.rows[r].loops.every(l=>l.sources?.length));
    }
    assert.equal(layout.rows[0].loops.length,placement==="plain"?24:40);
    for(const row of doc.cells) assert.equal(row.filter(c=>c==="accent").length,4);
    const surface=fabricSurface(doc,layout.rows,layout.pitch);
    // Report, rather than bless, the current geometry: this experiment is
    // intended to expose whether a fan assumption distorts edge-shaped fabric.
    const row=layout.rows[0];
    const points=row.loops.map(l=>surface.point(0,surface.curved?l.x+0.5:l.center));
    const mid=points[Math.floor(points.length/2)];
    const chordY=(points[0].y+points.at(-1)!.y)/2;
    console.log(`${placement}: top-row bow ${Math.abs(mid.y-chordY).toFixed(2)} stitch-widths`);
    for(const p of points) assert.ok([p.x,p.y,p.angle,p.scale].every(Number.isFinite));
  });
}

test("comparison override leaves the default layout unchanged",()=>{
  const doc=edgeShapingFixture("both"),layout=layoutFabric(doc);
  const defaultSurface=fabricSurface(doc,layout.rows,layout.pitch);
  const explicit=fabricSurface(doc,layout.rows,layout.pitch,"automatic");
  const straight=fabricSurface(doc,layout.rows,layout.pitch,"straight");
  for(const [r,row] of layout.rows.entries()) for(const loop of row.loops) {
    const position=loop.x+0.5;
    assert.deepEqual(defaultSurface.point(r,position),explicit.point(r,position));
    const p=straight.point(r,straight.curved?position:loop.center);
    assert.ok([p.x,p.y,p.angle,p.scale].every(Number.isFinite));
  }
});
