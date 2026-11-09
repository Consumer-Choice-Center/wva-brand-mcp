import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Resvg} from '@resvg/resvg-js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {root,readJSON} from '../src/assets.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wva-mcp-smoke-'));
const cutoutFile=path.join(root,'inputs',`smoke-cutout-${process.pid}.png`);
fs.writeFileSync(cutoutFile,new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="70" fill="#26D4CB"/></svg>').render().asPng());
const client=new Client({name:'wva-smoke',version:'1.0.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(root,'src/server.mjs')],env:{...process.env,WVA_BRAND_OUTPUT_DIR:dir},stderr:'pipe'});
const decode=r=>JSON.parse(r.content.find(c=>c.type==='text').text);
try {
  await client.connect(transport);
  const names=(await client.listTools()).tools.map(t=>t.name);
  assert.ok(names.includes('validate_visual_svg'));assert.ok(names.includes('create_social_svg'));assert.ok(names.includes('create_quote_post'));assert.ok(!names.some(n=>n.includes('one_pager')));
  const status=decode(await client.callTool({name:'get_mcp_status',arguments:{}}));
  assert.equal(status.assetHealth.ok,true);assert.equal(status.version,readJSON('package.json').version);
  assert.equal(decode(await client.callTool({name:'list_social_templates',arguments:{}})).templates.length,9);
  const blocked=await client.callTool({name:'create_social_svg',arguments:{headline:'A sample post'}});assert.equal(blocked.isError,true);
  await client.callTool({name:'get_brand_guidelines',arguments:{}});
  const resource=await client.readResource({uri:'brand://wva/quote-people'});assert.ok(resource.contents[0].text.includes('Michael Landl'));
  const spelling=decode(await client.callTool({name:'review_spelling',arguments:{fields:{headline:'Deine Stimme zählt'},language:'de'}}));assert.equal(spelling.ok,true);
  for(const content of [{headline:'Your voice matters',styleVariant:'navy_poster',language:'en'},{headline:'Deine Stimme zählt',template:'cta',styleVariant:'action_bands',language:'de'},{headline:'Real people. Real choices.',styleVariant:'teal_statement'},{headline:'A sample statistic',template:'statistic',statisticValue:'42%',styleVariant:'statistic_focus'},{headline:'A community with a voice.',template:'photo',styleVariant:'photo_overlay',useReferenceImage:true}]){
    const response=await client.callTool({name:'create_social_svg',arguments:content});assert.ok(!response.isError,JSON.stringify(response));
    const result=decode(response);assert.equal(result.validation.ok,true);
    assert.equal(decode(await client.callTool({name:'validate_svg_file',arguments:{filePath:result.files.svg}})).ok,true);
    assert.equal(decode(await client.callTool({name:'validate_visual_svg',arguments:{svg:fs.readFileSync(result.files.svg,'utf8')}})).ok,true);
  }
  const quote=decode(await client.callTool({name:'create_quote_post',arguments:{person:'liza',quote:'A sample quote for a draft.',emphasis:'sample quote'}}));assert.equal(quote.validation.ok,true);
  const missing=decode(await client.callTool({name:'create_social_svg',arguments:{template:'photo',headline:'A photo post'}}));assert.equal(missing.status,'needs_image');
  const prompt=decode(await client.callTool({name:'create_cutout_photo_brief',arguments:{headline:'Your voice matters',topic:'Public consultation'}}));assert.ok(prompt.brief.includes('Public consultation'));
  const noCutout=decode(await client.callTool({name:'create_cutout_post',arguments:{headline:'Your voice matters'}}));assert.equal(noCutout.status,'needs_source_photo');
  const pair=decode(await client.callTool({name:'create_cutout_post',arguments:{headline:'Your voice matters',imageFile:cutoutFile,imageAlt:'Synthetic circle for protocol testing',visualConcept:'Test fixture only',imageProvenance:'provided_photo',imageCredit:'Test fixture',imageLicense:'Testing only',cutoutLayout:'centered'}}));assert.equal(pair.status,'created_pair');
  for(const variant of Object.values(pair.variants))assert.equal(decode(await client.callTool({name:'validate_svg_file',arguments:{filePath:variant.files.svg}})).ok,true);
  console.log(JSON.stringify({ok:true,tools:names.length,resources:(await client.listResources()).resources.length,checked:['guideline gate','asset audit','English and German creation','quote creation','file validation','missing-image workflow','real-photo sourcing brief','color/greyscale paired export','independent visual QA']},null,2));
} finally {fs.rmSync(cutoutFile,{force:true});await client.close();fs.rmSync(dir,{recursive:true,force:true});}
