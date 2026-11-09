import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Resvg} from '@resvg/resvg-js';
import {root,outputRoot,readRaster,parseSVG,brand} from '../src/assets.mjs';
import {prepare,render,createPost,validateSVG,validateFile} from '../src/brand.mjs';
import {prepareCutout,cutoutPhotoBrief} from '../src/cutout.mjs';

const fixture=`test-cutout-${randomUUID()}.png`,fixturePath=path.join(root,'inputs',fixture);
const png=svg=>new Resvg(svg).render().asPng();
fs.writeFileSync(fixturePath,png('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="100"><rect x="20" y="20" width="80" height="60" rx="10" fill="#2ac7bd"/><circle cx="60" cy="50" r="20" fill="#e26541" opacity=".8"/></svg>'));
process.on('exit',()=>{fs.rmSync(fixturePath,{force:true});});
const content={template:'cutout',headline:'Your money. Clear answers.',body:'Public spending should be easy to follow.',topic:'Transparent public spending',imageFile:fixture,imageAlt:'Synthetic colored test shapes',visualConcept:'Test fixture only',cutoutLayout:'centered',imageProvenance:'provided_photo',imageCredit:'Synthetic fixture for tests only',imageLicense:'Test fixture'};

test('missing cutouts request a dynamic prompt without writes; context changes prompt',()=>{
  const before=fs.readdirSync(outputRoot);
  const a=createPost({template:'cutout',headline:'Follow public spending',topic:'Public spending',recentVisualConcepts:['A receipt']});
  const b=cutoutPhotoBrief({headline:'Have your say',topic:'Public consultations',visualConcept:'A ballot box'});
  assert.equal(a.status,'needs_source_photo');assert.match(a.brief,/Public spending/);assert.match(a.brief,/A receipt/);assert.match(b.brief,/ballot box/);assert.notEqual(a.brief,b.brief);
  assert.deepEqual(fs.readdirSync(outputRoot),before);
  assert.throws(()=>prepare({...content,useReferenceImage:true}),/reference screenshots/);
  assert.throws(()=>prepare({...content,visualConcept:''}),/visualConcept/);
  assert.throws(()=>prepare({...content,mode:'final'}),/visualRelevanceConfirmed/);
  assert.throws(()=>prepare({...content,imageProvenance:'generated'}));
  assert.throws(()=>prepare({...content,imageProvenance:'sourced_photo'}),/imageSourceUrl/);
});

test('transparent PNG normalization preserves alpha and makes only the image greyscale',()=>{
  const source=readRaster(fixture),color=prepareCutout(source),grey=prepareCutout(source,'greyscale');
  const pixels=image=>new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="120" height="100"><image width="120" height="100" xlink:href="${image.href}"/></svg>`).render().pixels;
  const a=pixels(color),b=pixels(grey);
  let colorful=0;
  for(let i=0;i<a.length;i+=4){if(a[i+3]>0&&a[i]!==a[i+1])colorful++;assert.equal(b[i],b[i+1]);assert.equal(b[i+1],b[i+2]);assert.equal(a[i+3],b[i+3]);}
  assert.ok(colorful>0);assert.equal(color.sha256,grey.sha256);assert.notEqual(color.renderedSha256,grey.renderedSha256);
  assert.ok(color.cutout.width<120);assert.equal(color.cutout.width,grey.cutout.width);
  assert.throws(()=>prepareCutout({...source,sha256:'invalid',data:Buffer.from('not a PNG')}),/valid photograph/);
  const opaquePath=path.join(root,'inputs',`opaque-${randomUUID()}.png`);
  fs.writeFileSync(opaquePath,png('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>'));
  try{assert.throws(()=>prepareCutout(readRaster(opaquePath)),/subject cropPolygon/);}finally{fs.unlinkSync(opaquePath);}
});

test('all three cutout compositions validate, with editable text and no live filters',()=>{
  for(const cutoutLayout of ['centered','offset','bands'])for(const imageTreatment of ['color','greyscale']){
    const out=render({...content,cutoutLayout,imageTreatment,cta:'Have your say',emphasis:'money'});
    assert.equal(validateSVG(out.svg).ok,true,cutoutLayout);assert.doesNotMatch(out.svg,/<filter/);
    assert.match(out.svg,/<text/);assert.match(out.svg,/data-emphasis="true"/);
    if(cutoutLayout==='bands')assert.match(out.svg,/data-emphasis-backing="true"/);assert.ok(out.svg.includes(`fill="${cutoutLayout==='bands'?brand.colors.ultramarine:brand.colors.teal}"`));
    assert.equal(validateSVG(out.svg.replace(out.metadata.renderedImageSha256,'0'.repeat(64))).ok,false);
  }
});

test('pair exports match copy, crop and original source; all files validate and collisions leave no half-pair',()=>{
  const name=`test-cutout-pair-${randomUUID()}`,result=createPost(content,name+'.svg');
  const files=[result.source,...Object.values(result.variants).flatMap(v=>Object.values(v.files))];
  try{
    assert.equal(result.status,'created_pair');
    const variants=Object.values(result.variants);
    for(const v of variants)assert.equal(validateFile(v.files.svg).ok,true);
    const metadata=variants.map(v=>JSON.parse(Array.from(parseSVG(fs.readFileSync(v.files.svg,'utf8')).getElementsByTagName('metadata'))[0].textContent));
    assert.equal(metadata[0].imageSha256,metadata[1].imageSha256);
    assert.equal(metadata[0].cutout.width,metadata[1].cutout.width);
    assert.deepEqual(variants[0].layout,variants[1].layout);
    assert.equal(metadata[0].content.headline,metadata[1].content.headline);
    const colorFiles=Object.values(result.variants.color.files);for(const file of colorFiles)fs.unlinkSync(file);
    assert.throws(()=>createPost(content,name+'.svg'),/Output exists/);
    for(const file of colorFiles)assert.equal(fs.existsSync(file),false);
  }finally{for(const file of files)fs.rmSync(file,{force:true});}
});

test('photo masks, grain and outline are reproducible and preserve real source hashes',()=>{
  const image=readRaster(fixture),mask=[[.15,.15],[.85,.15],[.85,.85],[.15,.85]];
  const plain=prepareCutout(image,'color',{cropPolygon:mask,grainAmount:0,outlineWidth:0});
  const treated=prepareCutout(image,'color',{cropPolygon:mask,grainAmount:.12,outlineWidth:8});
  assert.equal(plain.sha256,treated.sha256);assert.notEqual(plain.renderedSha256,treated.renderedSha256);
  assert.equal(treated.renderedSha256,prepareCutout(image,'color',{cropPolygon:mask,grainAmount:.12,outlineWidth:8}).renderedSha256);
  assert.equal(treated.cutout.cropMethod,'photograph-polygon');assert.equal(treated.cutout.grainAmount,.12);assert.equal(treated.cutout.outlineWidth,8);
  assert.ok(treated.cutout.width>plain.cutout.width);
  assert.throws(()=>prepare({...content,cropPolygon:[[-1,0],[1,0],[1,1]]}));
  assert.throws(()=>prepare({...content,cropHoles:[mask]}),/outer cropPolygon/);
});
