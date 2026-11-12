import {Resvg} from '@resvg/resvg-js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createHttpApp} from '../src/http-server.mjs';
import {ArtifactStore,publicOrigin} from '../src/http-artifacts.mjs';
const cp=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url))).name==='cp-brand-mcp';
// Tiny neutral PNG fixture, for transport tests only, not a portrait catalogue.
const fixture='data:image/png;base64,'+new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="100"><rect width="80" height="100" fill="#1d6379"/></svg>').render().asPng().toString('base64');
const baseInput=cp?{quote:'This is sample text for review.',personName:'Sample speaker',personTitle:'Sample role',imageAlt:'Transport test fixture',portraitData:fixture,visualRelevanceConfirmed:true}:{quote:'This is sample text for review.',person:'michael'};
const decode=result=>JSON.parse(result.content.find(c=>c.type==='text').text);

test('HTTP renders both quote layouts with native preview and working private downloads',async()=>{
  const app=createHttpApp(),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}`,client=new Client({name:'quote-http-test',version:'1'});
  try{
    await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp')));
    const tool=(await client.listTools()).tools.find(t=>t.name==='create_quote_post');assert.ok(tool);assert.equal(tool.annotations.readOnlyHint,false);
    assert.doesNotMatch(JSON.stringify(tool.inputSchema),/imageFile|filePath|outputFileName|assetBasePath/);
    const links=[];
    for(const layout of cp?['quote_side','quote_overlay']:['quote_spotlight','quote_panel']){
      const result=await client.callTool({name:'create_quote_post',arguments:{...baseInput,[cp?'template':'styleVariant']:layout}});
      assert.ok(!result.isError,JSON.stringify(result));const report=decode(result);assert.equal(report.ok,true);assert.equal(report.template,layout);
      assert.equal(report.files.length,4);assert.equal(result.content.filter(c=>c.type==='resource_link').length,4);
      const preview=Buffer.from(result.content.find(c=>c.type==='image').data,'base64');assert.equal(preview.readUInt32BE(16),540);assert.equal(preview.readUInt32BE(20),675);
      for(const file of report.files){
        assert.ok(file.url.startsWith(base+'/artifacts/'));const response=await fetch(file.url);assert.equal(response.status,200);
        assert.match(response.headers.get('cache-control'),/no-store/);assert.match(response.headers.get('content-disposition'),/attachment/);assert.match(response.headers.get('content-security-policy'),/sandbox/);
        const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.length,file.bytes);
        if(file.name==='quote.png'){assert.equal(bytes.readUInt32BE(16),1080);assert.equal(bytes.readUInt32BE(20),1350);}
        if(file.name==='quote.svg'){assert.match(bytes.toString(),/sample text for review/);assert.doesNotMatch(bytes.toString(),/\/Users\/|\/home\/|\/app\//);}
        if(file.name==='quote.json'){const source=JSON.parse(bytes);assert.ok(source.content||source.headline);assert.doesNotMatch(bytes.toString(),/"portraitData"\s*:|\/Users\/|\/app\//);}
      }
      links.push(report.files[0].url);
    }
    assert.notEqual(links[0],links[1]);assert.equal((await fetch(base+'/artifacts')).status,404);
    assert.equal((await fetch(base+'/artifacts/'+'0'.repeat(48)+'/quote.png')).status,404);
    assert.equal((await fetch(links[0].replace('quote.png','package.json'))).status,404);
    const finalResult=await client.callTool({name:'create_quote_post',arguments:{...baseInput,mode:'final',quoteVerified:true,factsVerified:true,sources:cp?[{label:'Approved test fixture'}]:[]}});
    assert.ok(!finalResult.isError,JSON.stringify(finalResult));assert.equal(decode(finalResult).mode,'final');
    const rejected=await client.callTool({name:'create_quote_post',arguments:{...baseInput,mode:'final'}});assert.ok(rejected.isError);
    const pathInjection=await client.callTool({name:'create_quote_post',arguments:{...baseInput,imageFile:'/etc/passwd'}});assert.ok(pathInjection.isError);
    if(!cp){const mismatch=await client.callTool({name:'create_quote_post',arguments:{...baseInput,person:'liza',portrait:'michael-2.png'}});assert.ok(mismatch.isError);}
    // Other test files can write concurrently; no HTTP output may use a quote basename.
    assert.equal(fs.existsSync(new URL('../deliverables/quote.png',import.meta.url)),false);
  }finally{await client.close();await new Promise(r=>server.close(r));app.locals.quoteService.store.close();}
});

test('artifact retention is bounded and expiry removes access without disclosing filenames',()=>{
  let now=0;const store=new ArtifactStore({now:()=>now,ttlMs:10,maxBytes:8,maxEntries:1});
  try{
    const a=store.put({'quote.png':{mimeType:'image/png',data:Buffer.alloc(8)}});
    assert.throws(()=>store.put({'quote.png':{data:Buffer.alloc(1)}}),/full/);
    assert.ok(store.get(a.token,'quote.png'));now=10;assert.equal(store.get(a.token,'quote.png'),undefined);assert.equal(store.bytes,0);
    assert.throws(()=>store.put({'quote.png':{data:Buffer.alloc(9)}}),/full/);
  }finally{store.close();}
  assert.equal(publicOrigin('https://quotes.example/'),'https://quotes.example');
  assert.throws(()=>publicOrigin('https://user:pass@quotes.example'));
  assert.throws(()=>publicOrigin('http://quotes.example'));
});

test('renderer rejects concurrent work and releases capacity after failure',async()=>{
  const {createQuoteService}=await import('../src/http-artifacts.mjs');let rejectRender;
  const service=createQuoteService({render:()=>new Promise((_,reject)=>{rejectRender=reject;})});
  try{
    const first=service.create({},'https://quotes.example');
    const second=await service.create({},'https://quotes.example');assert.ok(second.isError);assert.match(second.content[0].text,/busy/);
    rejectRender(Error('ENOENT /app/private/file'));const failed=await first;assert.ok(failed.isError);assert.doesNotMatch(failed.content[0].text,/\/app\/private/);
    const third=service.create({},'https://quotes.example');rejectRender(Error('Expected test failure'));assert.match((await third).content[0].text,/Expected test failure/);
  }finally{service.store.close();}
});
