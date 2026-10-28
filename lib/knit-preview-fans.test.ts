import { strict as assert } from "node:assert";
import { test } from "node:test";
import { fanFixtures, shapingFixture } from "./knit-preview-fixtures";
import { fabricSurface, layoutFabric } from "./knit-preview-layout";
import { stitchActionMath } from "./chart";

for(const fixture of fanFixtures) {
  test(`${fixture.name}: valid chart arithmetic and expected three-repeat surface`,()=>{
    const doc=shapingFixture(fixture.start,fixture.end,fixture.rows,fixture.profile);
    for(let r=0;r<doc.height-1;r++) {
      const inputs=doc.stitchActions![r].reduce((s,a)=>s+stitchActionMath(a).consumes,0);
      const outputs=doc.stitchActions![r+1].reduce((s,a)=>s+stitchActionMath(a).produces,0);
      assert.equal(inputs,outputs,`row ${r}: all stitches must be accounted for`);
    }
    const layout=layoutFabric(doc,3);
    assert.equal(layout.rows[0].width,fixture.end*3);
    assert.equal(layout.rows.at(-1)!.width,fixture.start*3);
    assert.equal(fabricSurface(doc,layout.rows,layout.pitch).curved,fixture.expected);
  });
  for(const repeats of [1,2,3]) for(const mirrored of [false,true]) for(const gauge of [[20,24],[28,40]]) {
    test(`${fixture.name}: ${repeats} repeats, ${mirrored?"mirrored":"normal"}, gauge ${gauge.join("/")}`,()=>{
      const doc={...shapingFixture(fixture.start,fixture.end,fixture.rows,fixture.profile),gaugeStitches:gauge[0],gaugeRows:gauge[1]};
      const layout=layoutFabric(doc,repeats,mirrored);
      const surface=fabricSurface(doc,layout.rows,layout.pitch);
      for(const [r,row] of layout.rows.entries()) for(const loop of row.loops) {
        const p=surface.point(r,surface.curved?loop.x+0.5:loop.center);
        assert.ok([p.x,p.y,p.angle,p.scale].every(Number.isFinite));
        assert.ok(p.x>=surface.minX-1e-8&&p.x<=surface.minX+surface.width+1e-8);
        assert.ok(p.y>=surface.minY-1e-8&&p.y<=surface.minY+surface.height+1e-8);
        assert.ok(p.scale>=0.65&&p.scale<=1.35);
        if(r<doc.height-1) assert.ok(loop.parentCenters.length>0,"valid shaping must retain ancestry");
      }
      if(surface.curved && !mirrored && repeats>1) {
        const r1=3,r2=doc.height-4;
        const d=(tile:number)=>{
          const a=surface.point(r1,layout.rows[r1].width/repeats*(tile+0.25));
          const b=surface.point(r2,layout.rows[r2].width/repeats*(tile+0.75));
          return Math.hypot(a.x-b.x,a.y-b.y);
        };
        // Free edges relax differently from internal repeats, but must not
        // progressively squash the motif across the fabric.
        for(let tile=1;tile<repeats;tile++) assert.ok(Math.abs(d(tile)/d(0)-1)<0.05,"repeat dimensions must remain within 5%");
      }
    });
  }
}

test("identical counts with different increase positions produce different geometry",()=>{
  const docs=["left","centre"].map(p=>shapingFixture(16,24,32,"even",p as "left"|"centre"));
  const layouts=docs.map(d=>layoutFabric(d,3));
  assert.deepEqual(layouts[0].rows.map(r=>r.width),layouts[1].rows.map(r=>r.width));
  const surfaces=docs.map((d,i)=>fabricSurface(d,layouts[i].rows,layouts[i].pitch));
  let largestDifference=0;
  for(let r=0;r<31;r++) for(let c=0;c<Math.min(layouts[0].rows[r].width,layouts[0].rows[r+1].width);c++) {
    const distances=surfaces.map(s=>{
      const a=s.point(r,c+0.5),b=s.point(r+1,c+0.5);
      return Math.hypot(a.x-b.x,a.y-b.y);
    });
    largestDifference=Math.max(largestDifference,Math.abs(distances[0]-distances[1]));
  }
  assert.ok(largestDifference>0.1,"not just a translated or rotated copy of the count-only fan");
});

test("200-stitch, 150-row chart with three repeats stays finite",()=>{
  const doc=shapingFixture(140,200,150);
  const start=performance.now();
  const layout=layoutFabric(doc,3);
  const surface=fabricSurface(doc,layout.rows,layout.pitch);
  assert.equal(layout.rows[0].width,600);
  assert.equal(layout.rows.at(-1)!.width,420);
  assert.equal(surface.curved,true);
  assert.ok(Number.isFinite(surface.width)&&Number.isFinite(surface.height));
  console.log(`Large-chart geometry: ${Math.round(performance.now()-start)} ms, ${layout.rows.reduce((s,r)=>s+r.loops.length,0)} loops`);
});
