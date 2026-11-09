import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {root,fonts,getFont,auditAssets,readRaster,parseSVG} from '../src/assets.mjs';
import {render,prepare,selectVariant,contentSchema,validateSVG,validateIllustratorSVG,createPost,validateFile,pngPreview,outlineSVG,validateSpec} from '../src/brand.mjs';
import {reviewSpelling} from '../src/spelling.mjs';
import {fit} from '../src/layout.mjs';

const basic={headline:'Your voice matters',body:'Support informed choices.',cta:'Join the conversation',styleVariant:'navy_poster'};
test('official assets and exact fonts are intact, including German glyphs',()=>{
  assert.equal(auditAssets().ok,true);
  for(const role of Object.keys(fonts))for(const c of 'ÄÖÜäöüß')assert.ok(getFont(role).hasGlyphForCodePoint(c.codePointAt(0)));
});
test('eight layouts render and validate at 1080×1350',()=>{
  for(const [variant,extra] of Object.entries({navy_poster:{},action_bands:{template:'cta'},teal_statement:{},statistic_focus:{template:'statistic',statisticValue:'42%'},photo_overlay:{template:'photo',useReferenceImage:true},photo_editorial:{template:'photo',useReferenceImage:true},quote_spotlight:{template:'quote',person:'michael',body:'',cta:''},quote_panel:{template:'quote',person:'liza',body:'',cta:''}})){
    const out=render({...basic,...extra,styleVariant:variant});
    assert.equal(out.status,'ready');assert.equal(validateSVG(out.svg).ok,true,variant);assert.match(out.svg,/width="1080" height="1350"/);
  }
});
test('quote portraits reach the frame bottom and the fade is layered below text',()=>{
  for(const [person,portrait] of [['michael','michael-1.png'],['michael','michael-2.png'],['michael','michael-3.png'],['liza','liza.png']])for(const styleVariant of ['quote_spotlight','quote_panel']){
    const out=render({template:'quote',person,portrait,styleVariant,headline:'A sample quote for a draft.'});
    const doc=parseSVG(out.svg),image=Array.from(doc.getElementsByTagName('image')).find(n=>n.getAttribute('id')==='hero-image');
    assert.equal(Number(image.getAttribute('y'))+Number(image.getAttribute('height')),1350);
    assert.ok(Number(image.getAttribute('y'))>0,'head retains breathing room');
    assert.equal(image.getAttribute('preserveAspectRatio'),'xMidYMax slice');
    assert.ok(out.svg.indexOf('id="hero-image"')<out.svg.indexOf('id="portrait-fade-overlay"'));
    assert.ok(out.svg.indexOf('id="portrait-fade-overlay"')<out.svg.indexOf('id="quote"'));
    const last=Array.from(doc.getElementsByTagName('linearGradient')).find(n=>n.getAttribute('id')==='portrait-fade').lastChild;
    assert.ok(Number(last.getAttribute('stop-opacity'))<1,'portrait remains visible through the fade');
    if(styleVariant==='quote_spotlight'){
      const bg=out.layout.find(r=>r.id==='wva-background');
      assert.ok(bg.x-bg.maxLineWidth/2<0&&bg.x+bg.maxLineWidth/2>1080,'letters extend beyond both frame edges');
    }
  }
});
test('social headlines occupy the center and sit above the background illustration',()=>{
  for(const styleVariant of ['navy_poster','teal_statement','photo_overlay','photo_editorial']){
    const out=render({...basic,styleVariant,...(styleVariant.startsWith('photo_')?{template:'photo',useReferenceImage:true}:{})});
    const headline=out.layout.find(r=>r.id==='headline');
    const center=headline.y+headline.lines.length*headline.lineHeight/2;
    assert.ok(center>=500&&center<=800,`${styleVariant} headline center=${center}`);
    const background=styleVariant.startsWith('photo_')?'id="hero-image"':'id="background-fist"';
    assert.ok(out.svg.indexOf(background)<out.svg.indexOf('id="headline"'));
  }
});
test('new routing preserves statistic values and photo requirements',()=>{
  const data=prepare({template:'statistic',statisticValue:'42%',headline:'A sample statistic'});
  assert.equal(data.selection.variant,'statistic_focus');
  assert.throws(()=>render({template:'statistic',styleVariant:'statistic_focus',headline:'A statistic'}),/statisticValue/);
  assert.throws(()=>render({template:'statistic',statisticValue:'42%',styleVariant:'navy_poster',headline:'A statistic'}),/statistic_focus/);
  assert.equal(render({template:'photo',styleVariant:'photo_overlay',headline:'A photo'}).status,'needs_image');
});
test('PNG preview dimensions and outlined companion',()=>{
  const out=render(basic),png=pngPreview(out.svg),outlined=outlineSVG(out.svg);
  assert.equal(png.readUInt32BE(16),1080);assert.equal(png.readUInt32BE(20),1350);
  assert.ok(outlined.includes('data-wva-outlined="true"'));assert.doesNotMatch(outlined,/<text\b/);
  assert.equal(validateIllustratorSVG(outlined).ok,true);
});
test('real font fitting rejects overflow and unsupported glyphs',()=>{
  assert.throws(()=>fit('A'.repeat(1000),{role:'headline',width:900,height:300,minSize:40,maxSize:60}),/overflow/);
  assert.throws(()=>render({...basic,headline:'Text 🛸'}),/Unsupported glyph/);
});
test('escaped copy cannot inject markup',()=>{
  const out=render({...basic,headline:'Choice <script> & trust'});
  assert.match(out.svg,/&lt;SCRIPT&gt;/);assert.equal(validateSVG(out.svg).ok,true);
});
test('canonical validation catches palette, geometry, text and portrait tampering',()=>{
  const out=render(basic);
  for(const modified of [out.svg.replace('fill="#041A2C"','fill="#FF0000"'),out.svg.replace('id="headline"','id="moved-headline"'),out.svg.replace('YOUR ','FALSE '),out.svg.replace('width="1080"','width="1000"')])assert.equal(validateSVG(modified).ok,false);
  const quote=render({template:'quote',person:'michael',headline:'A sample quote for a draft.'});
  assert.equal(validateSVG(quote.svg.replace('data:image/png;base64,','https://invalid.example/')).ok,false);
});
test('reject active SVG and remote asset links',()=>{
  const out=render(basic);
  for(const injected of ['<script>alert(1)</script>','<foreignObject/>','<image href="file:///etc/passwd"/>','<image xlink:href="https://example.com/x.png"/>'])assert.equal(validateIllustratorSVG(out.svg.replace('</svg>',injected+'</svg>')).ok,false);
  assert.equal(validateIllustratorSVG('<!DOCTYPE svg><svg/>').ok,false);
});
test('English and German spelling reviews are explicit; ambiguous words are not rewritten',()=>{
  assert.equal(reviewSpelling({headline:'teh goverment'}).correctedFields.headline,'the government');
  assert.equal(reviewSpelling({headline:'Die Gesundhiet zählt'},{language:'de'}).correctedFields.headline,'Die Gesundheit zählt');
  assert.equal(reviewSpelling({headline:'Deine Stimme zählt'},{language:'de'}).ok,true);
  const r=reviewSpelling({headline:'Xylorandium'},{language:'en'});assert.equal(r.correctedFields.headline,'Xylorandium');assert.ok(r.issues.length);
  assert.equal(reviewSpelling({headline:'Xylorandium'},{approvedWords:['Xylorandium']}).ok,true);
});
test('quotes retain exact wording and cannot use the wrong portrait',()=>{
  const result=prepare({template:'quote',person:'michael',headline:'teh sample quote'});
  assert.equal(result.content.headline,'teh sample quote');assert.equal(result.spelling.corrections.length,0);
  assert.throws(()=>render({template:'quote',person:'michael',portrait:'liza.png',headline:'Test'}),/does not belong/);
});
test('final attributed quotes and statistics require caller verification',()=>{
  assert.throws(()=>render({template:'quote',person:'liza',headline:'Test',mode:'final'}),/quoteVerified/);
  assert.throws(()=>render({template:'statistic',headline:'Test',mode:'final'}),/factsVerified/);
  assert.equal(render({...basic,mode:'final'}).status,'ready');
});
test('photo generation waits for a supplied image; references are opt-in',()=>{
  assert.equal(render({template:'photo',headline:'A community with a voice.'}).status,'needs_image');
  assert.equal(render({...basic}).metadata.imageSha256,null);
});
test('template selection is reproducible, semantically constrained and penalizes repetition',()=>{
  const c=contentSchema.parse({...basic,styleVariant:'auto'}),a=selectVariant(c),b=selectVariant(c);
  assert.deepEqual(a,b);assert.equal(selectVariant({...c,recentVariants:[a.variant]}).weights[a.variant],a.weights[a.variant]*.15);
  assert.ok(selectVariant({...c,template:'quote'}).variant.startsWith('quote_'));
  assert.throws(()=>selectVariant({...c,styleVariant:'quote_panel'}),/Quote styles/);
});
test('filesystem boundaries and overwrite protection',()=>{
  assert.throws(()=>readRaster('/etc/passwd'),/inputs folder/);
  const link=path.join(root,'inputs','test-escape.png');fs.symlinkSync('/etc/passwd',link);
  try{assert.throws(()=>readRaster('test-escape.png'),/inputs folder/);}finally{fs.unlinkSync(link);}
  assert.throws(()=>createPost(basic,'../escape.svg'),/plain .svg/);
  const name=`test-${Date.now()}.svg`,result=createPost(basic,name);
  try {
    assert.equal(validateFile(result.files.svg).ok,true);
    assert.throws(()=>createPost(basic,name),/Output exists/);
  }finally{for(const file of Object.values(result.files))fs.unlinkSync(file);}
});
test('image modifications invalidate generated source',()=>{
  const name='test-image-hash.png',p=path.join(root,'inputs',name);
  fs.copyFileSync(path.join(root,'assets/images/reference-science.png'),p);
  try {
    const out=render({...basic,imageFile:name});
    fs.copyFileSync(path.join(root,'assets/images/reference-lifestyle.png'),p);
    assert.equal(validateSVG(out.svg).ok,false);
  } finally {fs.unlinkSync(p);}
});
test('brand specification rejects CCC palette and typography',()=>{
  assert.equal(validateSpec({widthPx:1080,heightPx:1350,colors:['#E95C1F'],fonts:['Anton']}).ok,false);
  assert.equal(validateSpec({widthPx:1080,heightPx:1350,colors:['#26D4CB'],fonts:['Inter','Lato']}).ok,true);
});
