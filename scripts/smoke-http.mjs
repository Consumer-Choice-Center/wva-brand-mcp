import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const endpoint=new URL(process.argv[2]||'http://127.0.0.1:8082/mcp');
const health=await fetch(new URL('/healthz',endpoint),{signal:AbortSignal.timeout(10_000)});
assert.equal(health.status,200);assert.equal((await health.json()).server,'wva-brand-mcp');
const client=new Client({name:'wva-http-smoke',version:'1.0.0'});
const decode=r=>{assert.ok(!r.isError,JSON.stringify(r));return JSON.parse(r.content.find(c=>c.type==='text').text);};
try{
  await client.connect(new StreamableHTTPClientTransport(endpoint));
  const tools=(await client.listTools()).tools;
  assert.equal(tools.length,11);
  assert.ok(tools.every(t=>t.annotations?.readOnlyHint===(t.name!=='create_quote_post')));
  assert.ok(!tools.some(t=>/create_social_svg|create_cutout_post|validate_svg_file|qa_social_layout/.test(t.name)));
  const status=decode(await client.callTool({name:'get_mcp_status',arguments:{}}));
  assert.equal(status.name,'wva-brand-mcp');assert.equal(status.assetHealth.ok,true);
  assert.equal(status.workspace,undefined);assert.equal(status.outputDirectory,undefined);
  assert.equal(decode(await client.callTool({name:'get_brand_guidelines',arguments:{}})).shortName,'WVA');
  const resources=(await client.listResources()).resources;assert.equal(resources.length,5);
  const quoteInput={quote:'Sample wording for a transport check.',person:'michael',mode:'draft'};
  const quoteResult=await client.callTool({name:'create_quote_post',arguments:quoteInput});
  const quote=decode(quoteResult);assert.equal(quote.ok,true);assert.ok(quoteResult.content.some(c=>c.type==='image'));
  const imageUrl=quote.files.find(f=>f.mimeType==='image/png').url;
  // In-container checks use loopback, while returned URLs may use the configured public host.
  const downloadUrl=new URL(imageUrl);downloadUrl.protocol=endpoint.protocol;downloadUrl.host=endpoint.host;
  const download=await fetch(downloadUrl,{signal:AbortSignal.timeout(10_000)});assert.equal(download.status,200);
  const bytes=Buffer.from(await download.arrayBuffer());assert.equal(bytes.readUInt32BE(16),1080);assert.equal(bytes.readUInt32BE(20),1350);
  console.log(JSON.stringify({ok:true,endpoint:endpoint.href,version:status.version,tools:tools.length,resources:resources.length,assetHealth:status.assetHealth,quoteRendering:true},null,2));
}finally{await client.close();}
