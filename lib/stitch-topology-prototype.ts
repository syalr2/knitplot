/** Isolated topology experiment. Rows are supplied in knitting order, but
 * operations within each row are in visual left-to-right order. No inference
 * from chart width, no fan projection, and no garment geometry here. */
export type TopologyAction = "knit" | "m1l" | "m1r" | "ssk" | "k2tog";
export type Attachment =
  | { kind: "seed" }
  | { kind: "through-loop"; loop: string }
  | { kind: "lifted-bar"; bar: string; twist: "left" | "right" }
  | { kind: "through-loops"; loops: [string,string]; lean: "left" | "right" };
export type TopologyLoop = { id: string; row: number; index: number; family: string; attachment: Attachment };
export type TopologyBar = { id: string; row: number; left: string; right: string };
export type StitchTopology = { rows: TopologyLoop[][]; bars: TopologyBar[] };

export function buildStitchTopology(startCount: number, operations: TopologyAction[][]): StitchTopology {
  if(!Number.isInteger(startCount)||startCount<1)throw new Error("A sample needs at least one starting loop.");
  const rows:TopologyLoop[][]=[Array.from({length:startCount},(_,i)=>({id:`0:${i}`,row:0,index:i,family:`original-${i}`,attachment:{kind:"seed"}}))];
  const bars:TopologyBar[]=[];
  for(const [offset,actions] of operations.entries()) {
    const row=offset+1, previous=rows[row-1];
    const previousBars=previous.slice(1).map((right,i)=>({id:`bar-${row-1}:${i}`,row:row-1,left:previous[i].id,right:right.id}));
    bars.push(...previousBars);
    let cursor=0;
    const usedBars=new Set<string>();
    const current=actions.map((action,index):TopologyLoop=>{
      const id=`${row}:${index}`;
      if(action==="m1l"||action==="m1r") {
        const bar=previousBars[cursor-1];
        if(!bar)throw new Error(`Row ${row}: M1 needs a bar between two existing loops.`);
        if(usedBars.has(bar.id))throw new Error(`Row ${row}: repeated M1 on the same bar is outside this prototype.`);
        usedBars.add(bar.id);
        return {id,row,index,family:`new-${id}`,attachment:{kind:"lifted-bar",bar:bar.id,twist:action==="m1l"?"left":"right"}};
      }
      if(action==="knit") {
        const parent=previous[cursor++];
        if(!parent)throw new Error(`Row ${row}: too many stitches consumed.`);
        return {id,row,index,family:parent.family,attachment:{kind:"through-loop",loop:parent.id}};
      }
      const first=previous[cursor++],second=previous[cursor++];
      if(!first||!second)throw new Error(`Row ${row}: decrease needs two existing loops.`);
      return {id,row,index,family:`merged-${id}`,attachment:{kind:"through-loops",loops:[first.id,second.id],lean:action==="ssk"?"left":"right"}};
    });
    if(cursor!==previous.length)throw new Error(`Row ${row}: ${previous.length-cursor} loops were not worked.`);
    rows.push(current);
  }
  return {rows,bars};
}

/** Diagram coordinates only: original tracks are deliberately spread out so
 * new tracks fit between them. Do not use these as physical fabric widths. */
export function topologyDiagramPositions(graph: StitchTopology): Map<string,number> {
  const positions=new Map<string,number>();
  graph.rows[0].forEach((loop,i)=>positions.set(loop.id,i*2));
  const bars=new Map(graph.bars.map(bar=>[bar.id,bar]));
  for(const row of graph.rows.slice(1))for(const loop of row) {
    const a=loop.attachment;
    if(a.kind==="through-loop")positions.set(loop.id,positions.get(a.loop)!);
    else if(a.kind==="lifted-bar") {
      const bar=bars.get(a.bar)!;
      positions.set(loop.id,(positions.get(bar.left)!+positions.get(bar.right)!)/2);
    } else if(a.kind==="through-loops")positions.set(loop.id,(positions.get(a.loops[0])!+positions.get(a.loops[1])!)/2);
  }
  return positions;
}
