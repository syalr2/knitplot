import type { ChartDocument } from "./chart";
import type { ConnectedFabric } from "./connected-preview";

export type PreviewLayoutRequest={document:ChartDocument;repeats:number;mirrored:boolean};
export type PreviewLayoutResponse={fabric:ConnectedFabric;error?:never}|{error:string;fabric?:never};

/** One worker per render lets a newer chart/refresh cancel expensive work
 * immediately. Never silently fall back to a blocking main-thread layout. */
export function requestPreviewLayout(document:ChartDocument,repeats:number,mirrored:boolean,signal:AbortSignal):Promise<ConnectedFabric>{
  return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(new DOMException("Preview cancelled","AbortError"));return;}
    let worker:Worker;
    try{worker=new Worker(new URL("./connected-preview.worker.ts",import.meta.url),{type:"module"});}
    catch{reject(new Error("This browser could not start the preview worker. Please refresh or try another browser."));return;}
    const cleanup=()=>{clearTimeout(timeout);signal.removeEventListener("abort",abort);worker.terminate();};
    const abort=()=>{cleanup();reject(new DOMException("Preview cancelled","AbortError"));};
    const timeout=setTimeout(()=>{cleanup();reject(new Error("The preview took too long. Try fewer repeats and refresh again."));},60000);
    signal.addEventListener("abort",abort,{once:true});
    worker.onmessage=({data}:MessageEvent<PreviewLayoutResponse>)=>{
      cleanup();if(data.error!==undefined)reject(new Error(data.error));else resolve(data.fabric);
    };
    worker.onerror=()=>{cleanup();reject(new Error("Could not calculate the preview. Please refresh to try again."));};
    worker.onmessageerror=()=>{cleanup();reject(new Error("Could not read the calculated preview. Please refresh to try again."));};
    try{worker.postMessage({document,repeats,mirrored} satisfies PreviewLayoutRequest);}
    catch(error){cleanup();reject(error);}
  });
}
