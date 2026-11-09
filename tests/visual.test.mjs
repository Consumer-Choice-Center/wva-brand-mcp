import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {Resvg} from '@resvg/resvg-js';
import {root,parseSVG,serialize} from '../src/assets.mjs';
import {render,validateSVG,inspectVisualSVG,pngPreview} from '../src/brand.mjs';
import {contrastRatio} from '../src/visual-qa.mjs';
import {fit,textBlock} from '../src/layout.mjs';
import {withVisualCases} from './visual-cases.mjs';
const base={headline:'Your voice matters',body:'Support informed choices.',cta:'Join the conversation',styleVariant:'navy_poster'};
function mutateText(svg,id,fn){const doc=parseSVG(svg),g=Array.from(doc.getElementsByTagName('g')).find(n=>n.getAttribute('id')===id);fn(g,doc);return serialize(doc);}

test('independent QA catches low contrast, overlap and off-canvas text without canonical metadata',()=>{
  const original=render(base).svg.replace(/<metadata[\s\S]*?<\/metadata>/,'');
  assert.equal(inspectVisualSVG(original).ok,true);
  const low=mutateText(original,'headline',g=>{for(const t of Array.from(g.getElementsByTagName('text')))t.setAttribute('fill','#041A2C');});
  assert.ok(inspectVisualSVG(low).violations.some(v=>v.includes('Low text contrast')));
  const outside=mutateText(original,'headline',g=>g.setAttribute('transform','translate(0 -900)'));
  assert.ok(inspectVisualSVG(outside).violations.some(v=>v.includes('outside frame')));
  const overlap=mutateText(original,'body',(g,doc)=>{
    const headline=Array.from(doc.getElementsByTagName('g')).find(n=>n.getAttribute('id')==='headline').getElementsByTagName('text')[0];
    g.getElementsByTagName('text')[0].setAttribute('y',headline.getAttribute('y'));
  });
  assert.ok(inspectVisualSVG(overlap).violations.some(v=>v.includes('Text collision')));
});

test('palette contrast and backed emphasis are readable on bands and teal',()=>{
  assert.ok(contrastRatio('#041A2C','#419ED6')>=4.5);
  assert.ok(contrastRatio('#041A2C','#EE13FF')>=4.5);
  assert.ok(contrastRatio('#FFFFFF','#4A4AFF')>=4.5);
  for(const styleVariant of ['action_bands','teal_statement']){
    const r=render({...base,styleVariant,emphasis:'voice'});
    assert.equal(validateSVG(r.svg).ok,true);
    assert.match(r.svg,/data-emphasis="true"/);assert.match(r.svg,/data-emphasis-backing="true"/);
  }
});

test('independent QA rejects hidden, clipped, faint and covered text in the finished scene',()=>{
  const original=render(base).svg.replace(/<metadata[\s\S]*?<\/metadata>/,'');
  const changes={
    'parent opacity':g=>g.setAttribute('opacity','0'),
    'text opacity':g=>g.getElementsByTagName('text')[0].setAttribute('opacity','0'),
    'parent display':g=>g.setAttribute('display','none'),
    'text visibility':g=>g.getElementsByTagName('text')[0].setAttribute('visibility','hidden'),
    'text style':g=>g.getElementsByTagName('text')[0].setAttribute('style','opacity:0'),
    'low opacity':g=>g.setAttribute('opacity','.1'),
    'empty clip':(g,doc)=>{
      const clip=doc.createElementNS('http://www.w3.org/2000/svg','clipPath');clip.setAttribute('id','empty-clip');
      doc.getElementsByTagName('defs')[0].appendChild(clip);g.setAttribute('clip-path','url(#empty-clip)');
    },
    'later covering layer':(g,doc)=>{
      const cover=doc.createElementNS('http://www.w3.org/2000/svg','rect');
      for(const [name,value] of Object.entries({width:1080,height:1350,fill:'#041A2C'}))cover.setAttribute(name,String(value));
      g.parentNode.appendChild(cover);
    },
  };
  for(const [name,change] of Object.entries(changes)){
    const result=inspectVisualSVG(mutateText(original,'headline',change));
    assert.equal(result.ok,false,name);
    assert.ok(result.violations.some(v=>/Hidden or indistinguishable|Low text contrast/.test(v)),name+JSON.stringify(result));
  }
  const emphasized=render({...base,emphasis:'voice'}).svg;
  const hiddenSpan=mutateText(emphasized,'headline',g=>g.getElementsByTagName('tspan')[0].setAttribute('opacity','0'));
  assert.equal(inspectVisualSVG(hiddenSpan).ok,false,'hidden emphasis');
});

test('German compound fallback preserves source and emphasis across syllable breaks',()=>{
  const word='Verbraucherschutzentscheidungen';
  const r=render({headline:word,emphasis:word,styleVariant:'navy_poster',language:'de'});
  assert.equal(r.content.headline,word);assert.equal(validateSVG(r.svg).ok,true);
  const slot=r.layout.find(l=>l.id==='headline');assert.equal(slot.hyphenated,true);
  assert.equal(slot.lines.join('').replaceAll('-',''),word.toUpperCase());assert.ok(slot.size>=52);
  const doc=parseSVG(r.svg),group=Array.from(doc.getElementsByTagName('g')).find(g=>g.getAttribute('id')==='headline');
  assert.equal(group.getElementsByTagName('tspan').length,slot.lines.length);
  assert.throws(()=>fit('X'.repeat(1000),{width:900,height:300,maxSize:60,minSize:40,language:'de'}),/overflow/);
  const simple=fit('Deine Stimme zählt',{role:'headline',width:900,height:300,maxSize:60,minSize:40,language:'de'});assert.equal(simple.hyphenated,false);
});

test('highlight spanning an ordinary wrapped line keeps every highlighted character',()=>{
  const t=textBlock('Make your voice count today',{role:'headline',width:240,height:250,maxSize:44,minSize:44,maxLines:5},{id:'test',x:0,y:0,emphasis:'your voice count',emphasisColor:'#26D4CB'});
  const doc=parseSVG(`<svg xmlns="http://www.w3.org/2000/svg">${t.svg}</svg>`);
  assert.equal(Array.from(doc.getElementsByTagName('tspan')).map(n=>n.textContent).join(' ').replace(/\s+/g,' ').trim(),'your voice count');
});

test('German punctuation stays attached and emphasis retains original character offsets',()=>{
  const word='Verbraucherschutzentscheidungen';
  for(const [prefix,suffix] of [['','.'],['','!'],['',','],['„','“'],['„','!“'],['(','),']]){
    const headline=prefix+word+suffix,r=render({headline,emphasis:word,styleVariant:'navy_poster',language:'de'});
    assert.equal(r.content.headline,headline);
    const slot=r.layout.find(l=>l.id==='headline');assert.equal(slot.hyphenated,true,headline);
    assert.equal(slot.lines.join('').replaceAll('-',''),headline.toUpperCase());
    const group=Array.from(parseSVG(r.svg).getElementsByTagName('g')).find(g=>g.getAttribute('id')==='headline');
    assert.equal(Array.from(group.getElementsByTagName('tspan')).map(n=>n.textContent).join('').replaceAll('-',''),word.toUpperCase());
    assert.equal(inspectVisualSVG(r.svg).ok,true,headline);
  }
  for(const text of ['https://'+word,word+'123',word+'-Test'])assert.throws(()=>fit(text,{width:240,height:500,maxSize:44,minSize:44,language:'de'}),/overflow/);
});

const decode=bytes=>new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="270" height="338"><image width="270" height="338" xlink:href="data:image/png;base64,${bytes.toString('base64')}"/></svg>`).render().pixels;
test('reviewed visual baselines detect changes in composition, fonts and treatments',()=>{
  withVisualCases(visualCases=>{
  assert.equal(new Set(Object.values(visualCases).map(v=>v.styleVariant)).size,9);
  for(const [name,input] of Object.entries(visualCases)){
    const result=render(input),validation=validateSVG(result.svg);assert.equal(validation.ok,true,JSON.stringify(validation.violations));
    const expected=decode(fs.readFileSync(path.join(root,'tests/visual-baselines',name+'.png'))),actual=decode(pngPreview(result.svg,270));
    assert.equal(expected.length,actual.length);let changed=0;
    for(let i=0;i<actual.length;i+=4)if([0,1,2,3].some(c=>Math.abs(actual[i+c]-expected[i+c])>8))changed++;
    assert.ok(changed/(actual.length/4)<=.001,`${name}: ${changed} pixels changed; review before updating baselines.`);
  }
  });
});
