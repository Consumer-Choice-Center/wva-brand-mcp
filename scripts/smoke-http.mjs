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
  assert.equal(tools.length,10);
  assert.ok(tools.every(t=>t.annotations?.readOnlyHint));
  assert.ok(!tools.some(t=>/create_social_svg|create_quote_post|create_cutout_post|validate_svg_file|qa_social_layout/.test(t.name)));
  const status=decode(await client.callTool({name:'get_mcp_status',arguments:{}}));
  assert.equal(status.name,'wva-brand-mcp');assert.equal(status.assetHealth.ok,true);
  assert.equal(status.workspace,undefined);assert.equal(status.outputDirectory,undefined);
  assert.equal(decode(await client.callTool({name:'get_brand_guidelines',arguments:{}})).shortName,'WVA');
  const resources=(await client.listResources()).resources;assert.equal(resources.length,5);
  console.log(JSON.stringify({ok:true,endpoint:endpoint.href,version:status.version,tools:tools.length,resources:resources.length,assetHealth:status.assetHealth},null,2));
}finally{await client.close();}
