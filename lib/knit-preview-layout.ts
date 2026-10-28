import { ChartDocument, stitchActionAt, stitchActionMath } from "./chart";

export type PreviewLoop = { column: number; x: number; sources?: number[] };
export type PreviewRow = { loops: PreviewLoop[]; width: number };

/** Which side of this drawn closing edge contains its supporting fabric?
 * This is a chart-geometry relation, not a conversion from BO to CO. Imported
 * charts can put the terminal BO loop above or below the fabric it closes. */
export function bindOffSupportedFromAbove(document:ChartDocument,row:number,column:number):boolean {
  return stitchActionAt(document,row,column)==="bind-off"&&row>0&&row+1<document.height
    &&stitchActionAt(document,row-1,column)!=="no-stitch"
    &&stitchActionAt(document,row-1,column)!=="bind-off"
    &&stitchActionAt(document,row+1,column)==="no-stitch";
}

/** Flat, approximate fabric layout; chart rows run from top to bottom.
 * Ordinary no-stitch cells take no space. A contiguous unworked region that
 * overlaps a bind-off below retains space, including subsequent edge shaping.
 * A region below a later cast-on also retains space until that join, so
 * independently started shoulders do not collapse into a single strip.
 * Worked cells (including cast-ons) end that opening at their columns.
 * This is not a yarn/garment simulation: chart columns anchor opening history.
 */
export function layoutPreviewRows(document: ChartDocument): PreviewRow[] {
  const rows: PreviewRow[] = Array.from({ length: document.height });
  const beforeCastOn: boolean[][] = [];
  let futureOpening = Array<boolean>(document.width).fill(false);
  // Preserve empty chart regions adjacent to a closing edge on either side.
  // Imported charts can be drawn in top-down working order; a BO beside an
  // empty neckline must not silently collapse that neckline merely because
  // its empty cells are below rather than above the symbol on the page.
  // This concerns the drawn silhouette only, not BO/CO instruction semantics.
  for (let row = 0; row < document.height; row += 1) {
    const actions = Array.from({length:document.width},(_,col)=>stitchActionAt(document,row,col));
    const next = actions.map(action=>action==="cast-on"||action==="bind-off");
    for(let start=0;start<document.width;) {
      if(actions[start]!=="no-stitch"){start++;continue;}
      let end=start+1;
      while(end<document.width&&actions[end]==="no-stitch")end++;
      if(futureOpening.slice(start,end).some(Boolean))next.fill(true,start,end);
      start=end;
    }
    beforeCastOn.push(next);
    futureOpening=next;
  }
  let openings = Array<boolean>(document.width).fill(false);

  for (let row = document.height - 1; row >= 0; row -= 1) {
    const actions = Array.from({ length: document.width }, (_, col) => stitchActionAt(document, row, col));
    const nextOpenings = actions.map((action) => action === "bind-off");
    for (let start = 0; start < document.width;) {
      if (actions[start] !== "no-stitch") { start += 1; continue; }
      let end = start + 1;
      while (end < document.width && actions[end] === "no-stitch") end += 1;
      if (openings.slice(start, end).some(Boolean)) {
        nextOpenings.fill(true, start, end);
      }
      start = end;
    }

    const loops: PreviewLoop[] = [];
    let width = 0;
    actions.forEach((action, column) => {
      if (action === "no-stitch") {
        if (nextOpenings[column] || beforeCastOn[row][column]) width += 1;
        return;
      }
      // Bound-off loops remain visible on the closing edge, but not above it.
      const count = action === "bind-off" ? 1 : stitchActionMath(action).produces;
      for (let loop = 0; loop < count; loop += 1) loops.push({ column, x: width++ });
    });
    rows[row] = { loops, width };
    openings = nextOpenings;
  }
  // Pair each continuous section with the live loops below. Never bridge a
  // preserved opening. Reject inconsistent counts instead of inventing parents.
  for (let row = document.height - 2; row >= 0; row -= 1) {
    const current = rows[row];
    const below = rows[row + 1];
    const sections: PreviewLoop[][] = [];
    for (const loop of current.loops) {
      const section = sections[sections.length - 1];
      if (!section || loop.x > section[section.length - 1].x + 1) sections.push([loop]);
      else section.push(loop);
    }
    for (let index = 0; index < sections.length; index += 1) {
      const section = sections[index];
      // A neckline can widen between courses. Its two shoulder domains are
      // separated by the middle of the empty region, not by the current
      // course's last worked column: that would discard legitimate parent
      // loops just beyond a narrowing shoulder edge.
      const previous=sections[index-1],next=sections[index+1];
      const min=previous?(previous[previous.length-1].column+section[0].column)/2:0;
      const max=next?(section[section.length-1].column+next[0].column)/2:document.width-1;
      const available = below.loops.filter(loop => loop.column >= min && loop.column <= max &&
        (stitchActionAt(document,row+1,loop.column)!=="bind-off"||bindOffSupportedFromAbove(document,row+1,loop.column)));
      const columns = [...new Set(section.map(loop => loop.column))];
      const consumes=(col:number)=>bindOffSupportedFromAbove(document,row,col)?0:stitchActionMath(stitchActionAt(document,row,col)).consumes;
      const required = columns.reduce((sum, col) => sum + consumes(col), 0);
      // Prefer the existing exact chart-column correspondence when it already
      // accounts for this section. Expand to its shoulder domain only when
      // shaping requires the additional parents and the count matches exactly.
      const tightMin=index===0?0:section[0].column;
      const tightMax=index===sections.length-1?document.width-1:section[section.length-1].column;
      const tight=available.filter(loop=>loop.column>=tightMin&&loop.column<=tightMax);
      const parents=tight.length===required?tight:available;
      if (required !== parents.length) continue;
      let cursor = 0;
      for (const column of columns) {
        const action = stitchActionAt(document, row, column);
        const count = consumes(column);
        const sources = count > 0 ? parents.slice(cursor, cursor + count).map(loop => loop.x)
          : action === "m1l" || action === "m1r"
            ? [parents[cursor - 1], parents[cursor]].filter((loop): loop is PreviewLoop => Boolean(loop)).map(loop => loop.x)
            : [];
        for (const loop of section.filter(loop => loop.column === column)) loop.sources = sources;
        cursor += count;
      }
    }
  }
  return rows;
}

export type FabricLoop = PreviewLoop & { center: number; span: number; parentCenters: number[] };
export type FabricRow = { loops: FabricLoop[]; width: number };

/** An illustrative relaxed surface for continuous, predominantly monotone
 * shaping. Fit the growth rate, not a garment type or a full-circle assumption.
 * Small count steps are smoothed like fabric settling between increase rows.
 * This is only a starting pose for the connected layout below. Bound-off
 * fabric starts flat so the pose cannot close a neckline.
 */
function initialFabricSurface(document: ChartDocument, rows: FabricRow[], pitch: number) {
  const height = rows.length;
  const rowHeight = document.gaugeStitches / document.gaugeRows;
  const meanRow = (height - 1) / 2;
  const meanWidth = rows.reduce((sum, row) => sum + row.width, 0) / Math.max(1, height);
  let numerator = 0, denominator = 0;
  rows.forEach((row, i) => { numerator += (i - meanRow) * (row.width - meanWidth); denominator += (i - meanRow) ** 2; });
  const slope = denominator ? numerator / denominator : 0;
  const intercept = meanWidth - slope * meanRow;
  const turn = slope / rowHeight;
  const predicted = (row: number) => intercept + slope * row;
  const irregular = rows.some((row, i) => row.width <= 0 || predicted(i) <= 0);
  const openings = document.stitchActions?.some(row => row.some(action => action === "bind-off" || action === "cast-on"));
  const curved = height > 2 && !openings && !irregular && Math.abs(turn) > 0.035 && Math.abs(turn) < Math.PI * 0.85;
  const sign = Math.sign(turn);
  const radius0 = curved ? intercept / Math.abs(turn) : 0;
  const point = (row: number, position: number) => {
    if (!curved) return { x: position, y: (row + 0.5) * rowHeight, angle: 0, scale: 1 };
    const width = rows[row].width;
    const angle = (position / width - 0.5) * Math.abs(turn);
    const radius = predicted(row) / Math.abs(turn);
    return {
      x: radius * Math.sin(angle),
      y: sign * (radius * Math.cos(angle) - radius0) + rowHeight / 2,
      angle: -sign * angle,
      scale: predicted(row) / width,
    };
  };
  let minX = 0, maxX = pitch, minY = 0, maxY = height * rowHeight;
  if (curved) {
    minX = minY = Infinity; maxX = maxY = -Infinity;
    rows.forEach((row, r) => {
      // Extrema of a shallow fan occur at its ends or centre.
      for (const x of [0, row.width / 2, row.width]) {
        const p = point(r, x);
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
    });
    minY -= rowHeight / 2; maxY += rowHeight / 2;
  }
  return { curved, point, minX, minY, width: maxX - minX, height: maxY - minY,
    unstable: !openings && (irregular || Math.abs(turn) >= Math.PI * 0.85) };
}

/** Local 2D relaxation. Counts supply only a starting pose; the equilibrium
 * depends on the actual parent connections. This approximates a relaxed sheet,
 * not yarn tension, drape, blocking or fit. Gaps have no horizontal links, and
 * their boundary loops are pinned so a neckline cannot be pulled closed.
 */
export function fabricSurface(document: ChartDocument, rows: FabricRow[], pitch: number, initialPose: "automatic" | "straight" = "automatic") {
  const automatic = initialFabricSurface(document, rows, pitch);
  const rowHeight = document.gaugeStitches / document.gaugeRows;
  const seed = initialPose === "straight" ? {
    curved:false, unstable:false, minX:0, minY:0, width:pitch, height:rows.length*rowHeight,
    point: (row:number, position:number) => ({x:position,y:(row+0.5)*rowHeight,angle:0,scale:1}),
  } : automatic;
  const shaped = rows.some((row,r)=>r>0&&row.width!==rows[r-1].width)
    || rows.some(row=>row.loops.some(loop=>(loop.sources?.length??0)>1));
  if (!shaped || seed.unstable) return seed;
  type Node = { x:number; y:number; restX:number; restY:number; tx:number; ty:number; pinned:boolean; left?:Node; right?:Node; parents:Node[]; children:Node[] };
  const nodes = rows.map((row,r)=>row.loops.map((loop,i):Node=>{
    const p=seed.point(r,seed.curved?loop.x+0.5:loop.center);
    const openingLeft=i>0&&loop.x>row.loops[i-1].x+1;
    const openingRight=i+1<row.loops.length&&row.loops[i+1].x>loop.x+1;
    return {x:p.x,y:p.y,restX:p.x,restY:p.y,tx:Math.cos(p.angle),ty:Math.sin(p.angle),pinned:openingLeft||openingRight,parents:[],children:[]};
  }));
  const maps=rows.map((row,r)=>new Map(row.loops.map((loop,i)=>[loop.x,nodes[r][i]])));
  rows.forEach((row,r)=>row.loops.forEach((loop,i)=>{
    const n=nodes[r][i];
    if(i&&loop.x===row.loops[i-1].x+1) {n.left=nodes[r][i-1];n.left.right=n;}
    n.parents=(loop.sources??[]).flatMap(x=>{const p=maps[r+1]?.get(x);return p?[p]:[];});
    n.parents.forEach(p=>p.children.push(n));
  }));
  const all=nodes.flat();
  const nextX=new Float64Array(all.length),nextY=new Float64Array(all.length);
  for(let iteration=0;iteration<160;iteration++) {
    // Estimate each loop's local fabric direction, without assuming straight rows.
    for(const n of all) {
      const a=n.left??n,b=n.right??n;
      const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
      if(len>1e-6){n.tx=dx/len;n.ty=dy/len;}
    }
    all.forEach((n,i)=>{
      if(n.pinned){nextX[i]=n.restX;nextY[i]=n.restY;return;}
      // Weak tether removes free translation/rotation without fixing the outline.
      let x=n.restX*0.12,y=n.restY*0.12,w=0.12;
      const add=(px:number,py:number,weight:number)=>{x+=px*weight;y+=py*weight;w+=weight;};
      for(const [other,sign] of [[n.left,1],[n.right,-1]] as const) if(other) {
        const tx=n.tx+other.tx,ty=n.ty+other.ty,len=Math.hypot(tx,ty)||1;
        add(other.x+sign*tx/len,other.y+sign*ty/len,3);
      }
      // An increase/decrease couples to the centre of its actual parents.
      // Applying equal forces to each parent would collapse their spacing.
      if(n.parents.length) {
        const px=n.parents.reduce((s,p)=>s+p.x,0)/n.parents.length;
        const py=n.parents.reduce((s,p)=>s+p.y,0)/n.parents.length;
        add(px+n.ty*rowHeight,py-n.tx*rowHeight,2);
      }
      for(const child of n.children) {
        const cx=child.parents.reduce((s,p)=>s+p.x,0)/child.parents.length;
        const cy=child.parents.reduce((s,p)=>s+p.y,0)/child.parents.length;
        add(child.x-child.ty*rowHeight+(n.x-cx),child.y+child.tx*rowHeight+(n.y-cy),2/child.parents.length);
      }
      // Damped Jacobi updates keep the result deterministic and bounded in time.
      nextX[i]=n.x*0.35+x/w*0.65;nextY[i]=n.y*0.35+y/w*0.65;
    });
    all.forEach((n,i)=>{n.x=nextX[i];n.y=nextY[i];});
  }
  // Extremely steep growth can fold a planar approximation over itself.
  // Keep the conservative starting layout instead of drawing torn fabric.
  if(all.some(n=>!Number.isFinite(n.x)||!Number.isFinite(n.y)||
    (n.right&&((Math.hypot(n.right.x-n.x,n.right.y-n.y)>1.6)||
      Math.hypot(n.right.x-n.x,n.right.y-n.y)<0.45)))) return seed;
  const point=(row:number,position:number)=>{
    const loops=rows[row].loops;
    if(!loops.length)return {x:position,y:(row+0.5)*rowHeight,angle:0,scale:1};
    // Packed cell coordinates retain holes. Binary search supports source lookup
    // and diagnostic sampling without making every canvas stitch scan its row.
    let lo=0,hi=loops.length-1;
    while(lo<hi){const mid=Math.floor((lo+hi)/2);if(loops[mid].x+0.5<position)lo=mid+1;else hi=mid;}
    let i=lo;
    if(i>0&&Math.abs(loops[i-1].x+0.5-position)<Math.abs(loops[i].x+0.5-position))i--;
    const n=nodes[row][i];
    const a=n.left??n,b=n.right??n;
    const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    const angle=len>1e-6?Math.atan2(dy,dx):0;
    const scale=Math.max(0.65,Math.min(1.35,len/((n.left?1:0)+(n.right?1:0)||1)||1));
    const offset=position-(loops[i].x+0.5);
    return {x:n.x+offset*Math.cos(angle)*scale,y:n.y+offset*Math.sin(angle)*scale,angle,scale};
  };
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const n of all){minX=Math.min(minX,n.x-0.7);maxX=Math.max(maxX,n.x+0.7);minY=Math.min(minY,n.y-rowHeight);maxY=Math.max(maxY,n.y+rowHeight);}
  if(!all.length)return seed;
  return {curved:true,point,minX,minY,width:maxX-minX,height:maxY-minY};
}

/** A bounded spring layout, not a physical yarn simulation. Horizontal springs
 * preserve stitch order/spacing; vertical springs follow actual loop ancestry.
 * All horizontal repeats are expanded before finding connections. Every worked
 * loop has the same nominal width; extra loops widen the fabric rather than
 * changing stitch density. This is a flat laid-out approximation, not drape.
 * Openings are never joined by springs. No action's lean moves an entire row.
 */
export function layoutFabric(document: ChartDocument, repeats = 1, mirrored = false): { rows: FabricRow[]; pitch: number } {
  const count = Math.max(1, Math.min(3, Math.floor(repeats)));
  const width = document.width * count;
  const expanded: ChartDocument = count === 1 ? document : {
    ...document, width,
    stitchActions: Array.from({length: document.height}, (_, row) => Array.from({length: width}, (_, col) => {
      const reflected = mirrored && Math.floor(col / document.width) % 2 === 1;
      const original = reflected ? document.width - 1 - col % document.width : col % document.width;
      const action = stitchActionAt(document, row, original);
      return reflected ? action === "m1l" ? "m1r" : action === "m1r" ? "m1l" : action === "ssk" ? "k2tog" : action === "k2tog" ? "ssk" : action : action;
    })),
  };
  const packed = layoutPreviewRows(expanded);
  const pitch = Math.max(1, ...packed.map(row => row.width));
  type Node = { rest: number; x: number; unit: number; fixed: boolean; links: { node: Node; delta: number; weight: number }[] };
  const nodes = packed.map(row => {
    const unit = 1;
    const origin = (pitch - row.width) / 2;
    return row.loops.map((loop, i): Node => {
      const x = origin + (loop.x + 0.5) * unit;
      return { rest: x, x, unit, fixed: i === 0 || i === row.loops.length - 1, links: [] };
    });
  });
  const maps = packed.map((row, r) => new Map(row.loops.map((loop, i) => [loop.x, nodes[r][i]])));
  function link(a: Node, b: Node, delta: number, weight: number) {
    a.links.push({ node: b, delta, weight });
    b.links.push({ node: a, delta: -delta, weight });
  }
  packed.forEach((row, r) => row.loops.forEach((loop, i) => {
    const node = nodes[r][i];
    if (i && loop.x === row.loops[i - 1].x + 1) link(node, nodes[r][i - 1], node.unit, 3);
    const parents = (loop.sources ?? []).map(x => maps[r + 1]?.get(x)).filter((n): n is Node => Boolean(n));
    // Two-source increases/decreases attach to the centre of their neighbours,
    // not to a direction-selected column. Local yarn artwork supplies the lean.
    for (const parent of parents) link(node, parent, 0, 2 / parents.length);
  }));
  const all = nodes.flat();
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const next = all.map(node => {
      if (node.fixed) return node.rest;
      let sum = node.rest * 0.6, weight = 0.6;
      for (const edge of node.links) { sum += (edge.node.x + edge.delta) * edge.weight; weight += edge.weight; }
      // Bounded displacement guarantees ordered cells and preserves openings.
      return Math.max(node.rest - node.unit * 0.35, Math.min(node.rest + node.unit * 0.35, sum / weight));
    });
    all.forEach((node, i) => { node.x = next[i]; });
  }
  const rows = packed.map((row, r): FabricRow => ({ width: row.width, loops: row.loops.map((loop, i) => {
    const node = nodes[r][i];
    const left = i && loop.x === row.loops[i - 1].x + 1 ? (nodes[r][i - 1].x + node.x) / 2 : node.x - node.unit / 2;
    const right = i + 1 < row.loops.length && row.loops[i + 1].x === loop.x + 1 ? (node.x + nodes[r][i + 1].x) / 2 : node.x + node.unit / 2;
    return { ...loop, center: (left + right) / 2, span: right - left, parentCenters: [] };
  }) }));
  const finalMaps = rows.map(row => new Map(row.loops.map(loop => [loop.x, loop.center])));
  rows.forEach((row, r) => row.loops.forEach(loop => {
    loop.parentCenters = (loop.sources ?? []).flatMap(x => {
      const center = finalMaps[r + 1]?.get(x);
      return center === undefined ? [] : [center];
    });
  }));
  return { rows, pitch };
}
