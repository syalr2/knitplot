type Point = { x: number; y: number };
type Relief = { sheet: HTMLCanvasElement; cellWidth: number; cellHeight: number; cellsPerSide: number };

function curve(a: Point, b: Point, c: Point, d: Point): Point[] {
  return Array.from({length:49},(_,i)=>{
    const t=i/48,s=1-t;
    return {x:s*s*s*a.x+3*s*s*t*b.x+3*s*t*t*c.x+t*t*t*d.x,y:s*s*s*a.y+3*s*s*t*b.y+3*s*t*t*c.y+t*t*t*d.y};
  });
}

/** Extract one photographed strand, then bend it into a compact purl bump.
 * Photograph pixels supply fibre detail; the shape supplies the connection. */
export function paintPhotographicPurl(ctx:CanvasRenderingContext2D, source:Relief, hex:string, column:number,row:number,width:number,height:number,margin:number,foot:number){
  const strip=document.createElement("canvas");strip.width=40;strip.height=100;
  const s=strip.getContext("2d",{willReadFrequently:true})!;
  const originX=(source.cellsPerSide+column)*source.cellWidth,originY=(source.cellsPerSide+row)*source.cellHeight;
  for(let y=0;y<100;y++){
    const t=y/99;
    s.drawImage(source.sheet,originX+source.cellWidth*(.12+.29*t)-source.cellWidth*.18,originY+source.cellHeight*(.06+.83*t),source.cellWidth*.36,source.cellHeight*.012,0,y,40,1);
  }
  const colour=hex.length===4?"#"+hex.slice(1).split("").map(c=>c+c).join(""):hex;
  const pixels=s.getImageData(0,0,40,100),rgb=[1,3,5].map(i=>parseInt(colour.slice(i,i+2),16));
  for(let y=0;y<100;y++)for(let x=0;x<40;x++){
    const i=(y*40+x)*4,relief=pixels.data[i]/128,edge=Math.abs((x-19.5)/20);
    const round=.68+.32*Math.sqrt(Math.max(0,1-edge*edge));
    const shade=Math.pow(relief,1.45)*round,sheen=Math.max(0,relief-.97)*320;
    for(let c=0;c<3;c++)pixels.data[i+c]=rgb[c]*shade+sheen;
    pixels.data[i+3]=255*Math.min(1,Math.max(0,(1-edge)*7));
  }
  s.putImageData(pixels,0,0);
  ctx.save();ctx.translate(margin,margin);
  // Keep the bump centred and connected, with slightly slimmer proportions.
  ctx.translate(width*.5,height*.8);
  ctx.scale(.90,1.06);
  ctx.translate(-width*.5,-height*.8);
  const cord=(points:Point[],diameter:number,shadow=false)=>{
    const line=new Path2D();points.forEach((p,i)=>i?line.lineTo(p.x*width,p.y*height):line.moveTo(p.x*width,p.y*height));
    if(shadow){ctx.save();ctx.strokeStyle="rgba(35,23,14,.18)";ctx.lineWidth=diameter;ctx.lineCap="round";ctx.shadowColor="rgba(35,23,14,.18)";ctx.shadowBlur=1.4;ctx.stroke(line);ctx.restore();}
    let distance=0;
    for(let i=0;i<points.length-1;i++){
      const a=points[i],b=points[i+1],dx=(b.x-a.x)*width,dy=(b.y-a.y)*height,length=Math.hypot(dx,dy);
      if(length<.001)continue;
      ctx.save();ctx.translate(a.x*width,a.y*height);ctx.rotate(Math.atan2(dy,dx)-Math.PI/2);
      const sy=(distance/height*85)%96;
      // Overlapping narrow slices carry the same fibre relief around the bend.
      ctx.drawImage(strip,0,sy,40,3,-diameter/2,0,diameter,length+.5);
      ctx.restore();distance+=length;
    }
  };
  // The complete loop is already behind this surface. Only its compact
  // transverse head comes forward; extra long legs create dangling lobes.
  const shift=Math.max(-.08,Math.min(.08,foot*.15));
  // A purl head is a rounded bundle of yarn, not a thin line laid over a V.
  // Its upper edge covers the underlying loop's converging legs while its
  // lower edge overlaps the next row's head.
  cord(curve({x:.10+shift,y:.92},{x:.25+shift,y:.64},{x:.74+shift,y:.64},{x:.90+shift,y:.90}),width*.50,true);
  ctx.restore();
}
