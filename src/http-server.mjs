import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import {pathToFileURL} from 'node:url';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {hostHeaderValidation} from '@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js';
import {createBrandMcpServer} from './mcp-factory.mjs';

const positiveInteger=(value,fallback)=>Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):fallback;
export function createHttpApp(options={}) {
  const app=express();
  // Only enable this behind the single trusted Caddy hop; never publish the
  // container port when trusting proxy headers.
  app.set('trust proxy',options.trustProxyHops??(process.env.WVA_MCP_TRUST_PROXY_HOPS==='1'?1:false));
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(hostHeaderValidation(options.allowedHosts??(process.env.WVA_MCP_ALLOWED_HOSTS||'localhost,127.0.0.1,[::1]').split(',').map(s=>s.trim()).filter(Boolean)));
  app.get('/healthz',(_req,res)=>res.json({ok:true,server:'wva-brand-mcp',transport:'read-only-http'}));
  app.use('/mcp',rateLimit({windowMs:60_000,limit:options.rateLimitMax??positiveInteger(process.env.WVA_MCP_RATE_LIMIT_MAX,120),standardHeaders:'draft-8',legacyHeaders:false}));
  let inFlight=0;
  const maxConcurrency=options.maxConcurrency??positiveInteger(process.env.WVA_MCP_MAX_CONCURRENCY,8);
  // Bound parsed request bodies as well as protocol requests.
  app.use('/mcp',(_req,res,next)=>{
    if(inFlight>=maxConcurrency){res.set('Retry-After','1').status(503).json({error:'Server is busy. Try again shortly.'});return;}
    inFlight++;let released=false;
    const release=()=>{if(!released){released=true;inFlight--;}};
    res.once('finish',release);res.once('close',release);next();
  });
  app.use('/mcp',express.json({limit:options.bodyLimit??process.env.WVA_MCP_HTTP_BODY_LIMIT??'32mb',type:['application/json','application/*+json']}));
  app.post('/mcp',async(req,res)=>{
    const server=createBrandMcpServer('remote'),transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined});
    let closed=false;
    const close=async()=>{if(closed)return;closed=true;await Promise.allSettled([transport.close(),server.close()]);};
    res.once('close',()=>void close());
    try{await server.connect(transport);await transport.handleRequest(req,res,req.body);}
    catch{if(!res.headersSent)res.status(500).json({error:'MCP request failed.'});await close();}
  });
  app.all('/mcp',(_req,res)=>res.set('Allow','POST').status(405).json({error:'Use POST for stateless MCP.'}));
  app.use((error,_req,res,_next)=>res.status(error.status===413?413:400).json({error:'Invalid or oversized JSON body.'}));
  return app;
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  const server=createHttpApp().listen(positiveInteger(process.env.PORT,8082),process.env.HOST||'127.0.0.1',()=>console.log('WVA read-only HTTP MCP listening.'));
  server.requestTimeout=positiveInteger(process.env.WVA_MCP_REQUEST_TIMEOUT_MS,30_000);
  server.headersTimeout=positiveInteger(process.env.WVA_MCP_HEADERS_TIMEOUT_MS,15_000);
  server.keepAliveTimeout=positiveInteger(process.env.WVA_MCP_KEEP_ALIVE_TIMEOUT_MS,5_000);
  const close=()=>{server.close();setTimeout(()=>{server.closeAllConnections();process.exit(0);},5000).unref();};
  process.once('SIGINT',close);process.once('SIGTERM',close);
}
