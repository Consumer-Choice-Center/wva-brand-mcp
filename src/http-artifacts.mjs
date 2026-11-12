import {randomBytes,createHash} from 'node:crypto';
import {Worker} from 'node:worker_threads';

// Each deployment owns a bounded, process-local store. Tokens are bearer links,
// never filenames or caller-selected filesystem paths.
export class ArtifactStore {
  constructor({ttlMs=3_600_000,maxBytes=64*1024*1024,maxEntries=64,now=Date.now}={}) {
    this.ttlMs=ttlMs;this.maxBytes=maxBytes;this.maxEntries=maxEntries;this.now=now;this.entries=new Map();this.bytes=0;
    this.timer=setInterval(()=>this.prune(),60_000);this.timer.unref();
  }
  prune(){for(const [token,entry] of this.entries)if(entry.expiresAt<=this.now()){this.bytes-=entry.bytes;this.entries.delete(token);}}
  put(files){
    this.prune();const buffers=Object.fromEntries(Object.entries(files).map(([name,f])=>[name,{...f,data:Buffer.from(f.data)}]));
    const bytes=Object.values(buffers).reduce((sum,f)=>sum+f.data.length,0);
    if(bytes>this.maxBytes||this.bytes+bytes>this.maxBytes||this.entries.size>=this.maxEntries)throw Error('Download storage is full. Retry after existing links expire.');
    const token=randomBytes(24).toString('hex'),expiresAt=this.now()+this.ttlMs;
    this.entries.set(token,{files:buffers,bytes,expiresAt});this.bytes+=bytes;return {token,expiresAt,files:buffers};
  }
  get(token,name){this.prune();return this.entries.get(token)?.files[name];}
  close(){clearInterval(this.timer);this.entries.clear();this.bytes=0;}
}
export function publicOrigin(value){
  const u=new URL(value);
  if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||!['https:','http:'].includes(u.protocol))throw Error('Public base URL must be an HTTP(S) origin.');
  if(u.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(u.hostname))throw Error('Public base URL requires HTTPS outside loopback.');
  return u.origin;
}
export function createQuoteService({render,store=new ArtifactStore(),maxConcurrent=1}={}){
  let running=0;
  return {store,async create(input,base){
    if(running>=maxConcurrent)return {isError:true,content:[{type:'text',text:JSON.stringify({ok:false,error:'Quote renderer is busy. Retry shortly.'})}]};
    running++;
    try{
      const origin=publicOrigin(base),result=await render(input),entry=store.put(result.files);
      const files=Object.entries(entry.files).map(([name,f])=>({name,mimeType:f.mimeType,bytes:f.data.length,sha256:createHash('sha256').update(f.data).digest('hex'),url:`${origin}/artifacts/${entry.token}/${name}`}));
      const description={ok:true,status:'created',mode:input.mode||'draft',...result.report,expiresAt:new Date(entry.expiresAt).toISOString(),files,notice:'Download links are private bearer links, expire after one hour, and are lost on server restart. Download and save the files now. Share links only with intended recipients.'};
      return {content:[{type:'text',text:JSON.stringify(description)}, {type:'image',mimeType:'image/png',data:Buffer.from(result.preview).toString('base64')},...files.map(f=>({type:'resource_link',uri:f.url,name:f.name,mimeType:f.mimeType,size:f.bytes,description:'Download generated quote artwork before the expiry time.'}))]};
    }catch(e){
      // Font/filesystem/native failures must not leak server paths through MCP.
      const message=String(e.message||'Quote rendering failed.');
      const safe=/ENOENT|EACCES|\/Users\/|\/home\/|\/app\/|at file:|font configuration/i.test(message)?'Quote rendering failed. Ask the operator to check server assets and fonts.':message.slice(0,1200);
      return {isError:true,content:[{type:'text',text:JSON.stringify({ok:false,error:safe})}]};
    }finally{running--;}
  }};
}
export function runQuoteWorker(workerUrl,input,{timeoutMs=25_000}={}){
  return new Promise((resolve,reject)=>{
    const worker=new Worker(workerUrl,{workerData:input,resourceLimits:{maxOldGenerationSizeMb:192}});
    let settled=false;
    const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);void worker.terminate();error?reject(error):resolve(result);};
    const timer=setTimeout(()=>finish(Error('Quote rendering timed out. Shorten the quote or use a smaller portrait.')),timeoutMs);
    worker.once('message',message=>message.error?finish(Error(message.error)):finish(null,message));
    worker.once('error',error=>finish(error));
    worker.once('exit',code=>{if(!settled)finish(Error(`Quote renderer stopped before completion (${code}).`));});
  });
}
export function artifactRoutes(app,store){
  app.get('/artifacts/:token/:name',(req,res)=>{
    if(!/^[a-f0-9]{48}$/.test(req.params.token)||!/^quote\.(png|svg|outlined\.svg|json)$/.test(req.params.name))return res.status(404).end();
    const file=store.get(req.params.token,req.params.name);if(!file)return res.status(404).end();
    res.set({'Content-Type':file.mimeType,'Content-Disposition':`attachment; filename="${req.params.name}"`,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}).send(file.data);
  });
}
