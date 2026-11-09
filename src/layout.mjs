import {getFont,fonts,escapeXML} from './assets.mjs';
import germanHyphenation from 'hyphen/de-1996/index.js';
const {hyphenateSync}=germanHyphenation;

export function measure(text,role,size) {
  const font=getFont(role);
  for(const c of text) if(!font.hasGlyphForCodePoint(c.codePointAt(0))) throw Error(`Unsupported glyph ${JSON.stringify(c)} in ${role}; no font substitution is allowed.`);
  return font.layout(text).positions.reduce((sum,p)=>sum+p.xAdvance,0)/font.unitsPerEm*size;
}
const hyphenCache=new Map();
function breakpoints(word){
  // Only edge punctuation is detached; URLs, numbers and compound separators
  // remain ineligible. Returned offsets still refer to the original token.
  const match=word.match(/^([\p{Ps}\p{Pi}"'„“‚‘]*)(\p{L}{8,})([\p{Pe}\p{Pf}"'“”’.,!?:;…]*)$/u);
  if(!match)return [];
  const [,prefix,letters]=match;
  if(!hyphenCache.has(letters)){
    const segments=hyphenateSync(letters).split('\u00ad');let n=0;
    hyphenCache.set(letters,segments.slice(0,-1).map(s=>(n+=s.length)).filter(n=>n>=3&&letters.length-n>=3));
    if(hyphenCache.size>500)hyphenCache.delete(hyphenCache.keys().next().value);
  }
  return hyphenCache.get(letters).map(n=>prefix.length+n);
}
function wrap(text,role,size,width,hyphenate=false) {
  const lines=[],maps=[];let line='',map=[],paragraph=0,hyphenated=false;
  const flush=()=>{if(line){lines.push(line);maps.push(map);}line='';map=[];};
  for(const part of text.split('\n')) {
    for(const match of part.matchAll(/\S+/g)) {
      let word=match[0],offset=paragraph+match.index;
      if(measure(word,role,size)>width){
        if(!hyphenate)return null;flush();
        while(measure(word,role,size)>width){
          const index=breakpoints(word).filter(i=>measure(word.slice(0,i)+'-',role,size)<=width).at(-1);
          if(!index)return null;
          line=word.slice(0,index)+'-';map=[...Array(index)].map((_,i)=>offset+i);map.push(offset+index-1);flush();
          offset+=index;word=word.slice(index);hyphenated=true;
        }
      }
      const next=line?`${line} ${word}`:word;
      if(measure(next,role,size)>width)flush();
      if(line){line+=' ';map.push(Math.max(0,offset-1));}
      line+=word;map.push(...Array.from({length:word.length},(_,i)=>offset+i));
    }
    flush();paragraph+=part.length+1;
  }
  return {lines,maps,hyphenated};
}
export function fit(text, {role='body',width,height,maxSize=48,minSize=28,lineHeight=1.16,maxLines=20,language='en'}={}) {
  if(!text)return {lines:[],maps:[],hyphenated:false,size:maxSize,lineHeight:maxSize*lineHeight,width,height,role};
  // Preserve familiar line breaks first. German syllable breaks are a fallback
  // when a compound cannot fit at any permitted size, never arbitrary splitting.
  for(const hyphenate of language==='de'?[false,true]:[false])for(let size=maxSize;size>=minSize;size--) {
    const wrapped=wrap(text,role,size,width,hyphenate);
    if(wrapped && wrapped.lines.length<=maxLines && wrapped.lines.length*size*lineHeight<=height) return {...wrapped,size,lineHeight:size*lineHeight,width,height,role};
  }
  throw Error(`Text overflow: shorten ${JSON.stringify(text.slice(0,90))}. Minimum ${minSize}px; ${width}×${height} slot.`);
}
export function textBlock(text,slot,{id='copy',x,y,color='#FFFFFF',align='left',verticalAlign='top',emphasis='',emphasisColor='#26D4CB',emphasisBackground=''}={}) {
  const fitted=fit(text,slot),font=fonts[fitted.role];
  if(verticalAlign==='center') y+=(fitted.height-fitted.lines.length*fitted.lineHeight)/2;
  const anchor=align==='center'?'middle':align==='right'?'end':'start';
  const start=emphasis?text.toLocaleLowerCase().indexOf(emphasis.toLocaleLowerCase()):-1,end=start<0?-1:start+emphasis.length;
  const fragments=fitted.lines.map((line,i)=>{
    const map=fitted.maps[i],indexes=map.map((n,j)=>n>=start&&n<end?j:-1).filter(j=>j>=0);
    const a=indexes[0],b=indexes.at(-1)+1,baseline=y+fitted.size+i*fitted.lineHeight;
    let value=escapeXML(line),backing='';
    if(start>=0&&indexes.length){
      if(emphasisBackground){
        const f=getFont(fitted.role),scale=fitted.size/f.unitsPerEm,total=measure(line,fitted.role,fitted.size);
        const left=x-(align==='center'?total/2:align==='right'?total:0)+measure(line.slice(0,a),fitted.role,fitted.size);
        const width=measure(line.slice(0,b),fitted.role,fitted.size)-measure(line.slice(0,a),fitted.role,fitted.size);
        backing=`<rect data-emphasis-backing="true" x="${left-4}" y="${baseline-f.ascent*scale-2}" width="${width+8}" height="${(f.ascent-f.descent)*scale+4}" fill="${emphasisBackground}" rx="3"/>`;
      }
      value=escapeXML(line.slice(0,a))+`<tspan data-emphasis="true" fill="${emphasisColor}">${escapeXML(line.slice(a,b))}</tspan>`+escapeXML(line.slice(b));
    }
    return {backing,text:`<text data-font-role="${fitted.role}" x="${x}" y="${baseline.toFixed(2)}" text-anchor="${anchor}" font-family="${font.family}" font-weight="${font.weight}" font-size="${fitted.size}" fill="${color}">${value}</text>`};
  });
  const svg=fragments.map(f=>f.backing).join('')+fragments.map(f=>f.text).join('');
  const {maps,...publicFit}=fitted;
  return {svg:`<g id="${id}">${svg}</g>`,report:{id,x,y,...publicFit,maxLineWidth:Math.max(0,...fitted.lines.map(line=>measure(line,fitted.role,fitted.size)))}};
}
