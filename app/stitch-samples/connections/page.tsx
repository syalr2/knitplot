import { notFound } from "next/navigation";
import { buildStitchTopology, topologyDiagramPositions, TopologyAction } from "@/lib/stitch-topology-prototype";

const colours=["#38665b","#bd8631","#556d9a"];
function Sample({action}:{action:"m1l"|"m1r"|"ssk"|"k2tog"}) {
  const increase=action==="m1l"||action==="m1r";
  const start=increase?2:3, end=increase?3:2;
  const plain=(n:number):TopologyAction[]=>Array(n).fill("knit");
  const graph=buildStitchTopology(start,[plain(start),increase?["knit",action,"knit"]:[action,"knit"],plain(end),plain(end)]);
  const positions=topologyDiagramPositions(graph);
  const x=(id:string)=>70+positions.get(id)!*66;
  const y=(r:number)=>330-r*68;
  const loops=new Map(graph.rows.flat().map(l=>[l.id,l]));
  const bars=new Map(graph.bars.map(b=>[b.id,b]));
  return <section><h2>{action.toUpperCase()} · {increase?"new loop from a bar":"two loops joined"}</h2>
    <svg role="img" aria-label={`${action} stitch connection diagram`} viewBox={`0 0 ${start===2?280:410} 380`}>
      {graph.rows.flat().map(loop=>{
        const a=loop.attachment,xx=x(loop.id),yy=y(loop.row);
        const color=loop.family.startsWith("original-")?colours[Number(loop.family.split("-")[1])%3]:"#c36588";
        const label=loop.family.startsWith("original-")?String.fromCharCode(65+Number(loop.family.split("-")[1])):increase?"N":"AB";
        return <g key={loop.id}>
          {a.kind==="through-loop"&&<path d={`M${xx} ${yy+19} L${x(a.loop)} ${y(loops.get(a.loop)!.row)-22}`} stroke={color} strokeWidth="2" strokeDasharray="4 4"/>}
          {a.kind==="through-loops"&&a.loops.map(id=><path key={id} d={`M${xx} ${yy+19} Q${xx} ${yy+38} ${x(id)} ${y(loop.row-1)-22}`} stroke={color} strokeWidth="3" fill="none"/>)}
          {a.kind==="lifted-bar"&&(()=>{
            const b=bars.get(a.bar)!,by=y(b.row)-18,mid=(x(b.left)+x(b.right))/2;
            const lean=a.twist==="left"?-7:7;
            return <g><path d={`M${x(b.left)} ${by} Q${mid-16} ${by} ${mid+lean} ${yy+22} Q${mid+16} ${by} ${x(b.right)} ${by}`} fill="none" stroke="#8c8580" strokeWidth="4"/><path d={`M${mid-lean} ${yy+29} L${mid+lean} ${yy+19}`} stroke={color} strokeWidth="5"/><text x={xx+24} y={yy+39} fontSize="11" fill="#70665e">lifted bar</text></g>;
          })()}
          <path d={`M${xx-17} ${yy-19} Q${xx-15} ${yy+4} ${xx} ${yy+19} Q${xx+15} ${yy+4} ${xx+17} ${yy-19}`} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"/>
          <text x={xx} y={yy-28} textAnchor="middle" fontSize="12" fill={color}>{label}</text>
        </g>;
      })}
      <text x="12" y="373" fontSize="12" fill="#726a60">Start at bottom · read upwards</text>
    </svg>
    <p>{increase?"A and B continue separately. N begins on their connecting bar, then continues as its own stitch column.":"A and B are consumed by one new stitch. The untouched C column continues separately."}</p>
  </section>;
}

export default function Page() {
  if(process.env.NODE_ENV!=="development")notFound();
  return <main style={{maxWidth:1000,margin:"auto",padding:24}}><h1>Stitch connections · new prototype</h1>
    <p>This is a connection diagram, not fabric geometry. Tracks are spread out deliberately to show which loops continue. Dashed lines show continuity; pink marks a new or merged column.</p>
    <style>{`.connection-samples{display:grid;grid-template-columns:1fr 1fr;gap:20px}.connection-samples section{background:#faf8f2;border:1px solid #ded8ca;border-radius:12px;padding:18px}.connection-samples h2{font-size:18px;margin:0}.connection-samples svg{width:100%;height:370px}.connection-samples p{font-size:14px;line-height:1.5}@media(max-width:600px){.connection-samples{grid-template-columns:1fr}}`}</style>
    <div className="connection-samples">{(["m1l","m1r","ssk","k2tog"] as const).map(action=><Sample key={action} action={action}/>)}</div>
  </main>;
}
