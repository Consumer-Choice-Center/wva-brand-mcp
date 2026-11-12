import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createHttpApp} from '../src/http-server.mjs';

test('loopback HTTP health, protocol and restricted tool discovery',async()=>{
  const server=createHttpApp().listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const base=`http://127.0.0.1:${server.address().port}`,client=new Client({name:'wva-http-test',version:'1.0.0'});
  try {
    assert.equal((await fetch(base+'/healthz')).status,200);
    assert.equal((await fetch(base+'/mcp')).status,405);
    // Fetch may normalize Host; use a raw HTTP request to exercise rebinding protection.
    const wrongHost=await new Promise((resolve,reject)=>{
      const request=http.get(base+'/healthz',{headers:{Host:'untrusted.example'}},res=>{res.resume();res.once('end',()=>resolve(res.statusCode));});
      request.once('error',reject);
    });
    assert.equal(wrongHost,403);
    assert.equal((await fetch(base+'/mcp',{method:'POST',headers:{'content-type':'application/json'},body:'{'})).status,400);
    await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp')));
    const tools=(await client.listTools()).tools;
    assert.ok(tools.some(t=>t.name==='review_spelling'));
    assert.ok(!tools.some(t=>/create_social|validate_svg_file|qa_social/.test(t.name)));
    for(const tool of tools)assert.equal(tool.annotations.readOnlyHint,tool.name!=='create_quote_post');
  }finally{await client.close();await new Promise(resolve=>server.close(resolve));}
});

test('trusted Caddy hop gives clients separate rate limits and enforces body limits',async()=>{
  const server=createHttpApp({trustProxyHops:1,rateLimitMax:2,bodyLimit:'1kb'}).listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const base=`http://127.0.0.1:${server.address().port}`;
  const request=(ip,body='{')=>fetch(base+'/mcp',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':ip},body});
  try{
    assert.equal((await request('192.0.2.10')).status,400);
    assert.equal((await request('192.0.2.10')).status,400);
    assert.equal((await request('192.0.2.10')).status,429);
    assert.equal((await request('192.0.2.11')).status,400);
    assert.equal((await request('192.0.2.12',JSON.stringify({data:'x'.repeat(2048)}))).status,413);
    assert.equal((await fetch(base+'/healthz')).status,200);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

test('concurrency limit includes incomplete request bodies and releases disconnected clients',async()=>{
  const server=createHttpApp({maxConcurrency:1}).listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const base=`http://127.0.0.1:${server.address().port}`;
  let resolveClosed;
  const closed=new Promise(resolve=>{resolveClosed=resolve;});
  const started=new Promise(resolve=>server.once('request',(_req,res)=>{res.once('close',resolveClosed);resolve();}));
  const slow=http.request(base+'/mcp',{method:'POST',headers:{'content-type':'application/json','content-length':'500'}});
  slow.on('error',()=>{});slow.write('{');
  try{
    await started;
    assert.equal((await fetch(base+'/mcp',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,503);
    assert.equal((await fetch(base+'/healthz')).status,200);
    slow.destroy();await closed;
    assert.equal((await fetch(base+'/mcp',{method:'POST',headers:{'content-type':'application/json'},body:'{'})).status,400);
  }finally{slow.destroy();await new Promise(resolve=>server.close(resolve));}
});
