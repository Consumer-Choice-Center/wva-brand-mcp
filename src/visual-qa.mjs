import {Resvg} from '@resvg/resvg-js';
import {getFont,parseSVG,serialize,escapeXML,sha256} from './assets.mjs';

const cache=new Map();
const identity=[1,0,0,1,0,0];
const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const point=(m,x,y)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
function transform(value){
  let matrix=identity;
  for(const match of value.matchAll(/(matrix|translate|scale|rotate)\s*\(([^)]+)\)/g)){
    const n=match[2].trim().split(/[ ,]+/).map(Number);let m=identity;
    if(n.some(v=>!Number.isFinite(v)))throw Error('Invalid text transform.');
    if(match[1]==='matrix')m=n;
    if(match[1]==='translate')m=[1,0,0,1,n[0],n[1]||0];
    if(match[1]==='scale')m=[n[0],0,0,n[1]??n[0],0,0];
    if(match[1]==='rotate'){const t=n[0]*Math.PI/180,c=Math.cos(t),s=Math.sin(t),x=n[1]||0,y=n[2]||0;m=[c,s,-s,c,x-c*x+s*y,y-s*x-c*y];}
    if(m.length!==6)throw Error('Invalid matrix.');matrix=multiply(matrix,m);
  }
  return matrix;
}
function ancestors(el){const list=[];for(let p=el.parentNode;p?.nodeType===1;p=p.parentNode)list.unshift(p);return list;}
function geometry(el,index){
  const chain=ancestors(el),decorative=chain.some(p=>p.getAttribute('id')==='wva-background');
  if(decorative)return null;
  const id=[...chain].reverse().find(p=>p.getAttribute('id'))?.getAttribute('id')||`text-${index}`;
  const font=getFont(el.getAttribute('data-font-role')),size=Number(el.getAttribute('font-size')),scale=size/font.unitsPerEm,run=font.layout(el.textContent);
  const width=run.positions.reduce((s,p)=>s+p.xAdvance,0)*scale,anchor=el.getAttribute('text-anchor');
  const x=Number(el.getAttribute('x'))-(anchor==='middle'?width/2:anchor==='end'?width:0),y=Number(el.getAttribute('y'));
  let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity,cursor=0;
  for(let i=0;i<run.glyphs.length;i++){
    const b=run.glyphs[i].bbox,p=run.positions[i];
    if(b.maxX>b.minX&&b.maxY>b.minY){left=Math.min(left,x+(cursor+p.xOffset+b.minX)*scale);right=Math.max(right,x+(cursor+p.xOffset+b.maxX)*scale);top=Math.min(top,y-(p.yOffset+b.maxY)*scale);bottom=Math.max(bottom,y-(p.yOffset+b.minY)*scale);}
    cursor+=p.xAdvance;
  }
  if(!Number.isFinite(left))return null;
  const matrix=[...chain,el].reduce((m,p)=>multiply(m,transform(p.getAttribute('transform')||'')),identity);
  const quad=[[left,top],[right,top],[right,bottom],[left,bottom]].map(([x,y])=>point(matrix,x,y));
  const transforms=chain.map(p=>p.getAttribute('transform')).filter(Boolean);
  // An ideal opaque mask defines where glyph interiors should be visible.
  // Visibility and clipping are evaluated in the finished scene, not this mask.
  const mask=el.cloneNode(true);
  for(const node of [mask,...Array.from(mask.getElementsByTagName('*'))]){
    for(const attr of ['opacity','fill-opacity','stroke','style','visibility','display','clip-path','mask'])node.removeAttribute(attr);
    node.setAttribute('fill','#FFFFFF');
  }
  return {id,index,quad,markup:transforms.map(t=>`<g transform="${escapeXML(t)}">`).join('')+serialize(mask)+'</g>'.repeat(transforms.length)};
}
function overlaps(a,b){
  for(const polygon of [a,b])for(let i=0;i<4;i++){
    const p=polygon[i],q=polygon[(i+1)%4],axis=[q[1]-p[1],p[0]-q[0]],project=v=>v[0]*axis[0]+v[1]*axis[1];
    const aa=a.map(project),bb=b.map(project);
    if(Math.max(...aa)<=Math.min(...bb)||Math.max(...bb)<=Math.min(...aa))return false;
  }
  return true;
}
function contains(quad,x,y){let sign=0;for(let i=0;i<4;i++){const a=quad[i],b=quad[(i+1)%4],cross=(b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]);if(Math.abs(cross)<.001)continue;const s=Math.sign(cross);if(sign&&s!==sign)return false;sign=s;}return true;}
const linear=Array.from({length:256},(_,n)=>{const c=n/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});
const luminance=(p,i)=>.2126*linear[p[i]]+.7152*linear[p[i+1]]+.0722*linear[p[i+2]];
export function contrastRatio(a,b){const parse=h=>Buffer.from(h.replace('#',''),'hex'),x=luminance(parse(a),0),y=luminance(parse(b),0);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}

// Reads finished SVG geometry and rendered pixels. It does not import the
// template renderer, its fit reports, or its canonical source metadata.
export function auditVisualSVG(svg,{outline}={}) {
  const key=sha256(svg);if(cache.has(key))return cache.get(key);
  const violations=[],warnings=[];let report;
  try{
    const doc=parseSVG(svg),root=doc.documentElement;
    if(root.getAttribute('width')!=='1080'||root.getAttribute('height')!=='1350')throw Error('Visual QA requires the 1080×1350 canvas.');
    const elements=Array.from(doc.getElementsByTagName('text')),lines=elements.map(geometry).filter(Boolean);
    if(!lines.length)throw Error('Visual QA needs editable foreground text.');
    for(const line of lines)if(line.quad.some(([x,y])=>x<0||x>1080||y<0||y>1350))violations.push(`Text outside frame: ${line.id}.`);
    for(let i=0;i<lines.length;i++)for(let j=i+1;j<lines.length;j++)if(overlaps(lines[i].quad,lines[j].quad))violations.push(`Text collision: ${lines[i].id} / ${lines[j].id}.`);
    // Compare the final paint result with the same scene minus foreground text.
    // Later covering shapes, ancestor opacity and clips remain in both scenes.
    const raster=(s,opaque=false)=>new Resvg(outline(s),{font:{loadSystemFonts:false},...(opaque?{background:'#FFFFFF'}:{})}).render().pixels;
    const finished=raster(svg,true);
    for(const line of lines)elements[line.index].parentNode.removeChild(elements[line.index]);
    const background=raster(serialize(doc),true);
    const foreground=raster(`<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="1080" height="1350">${lines.map(l=>l.markup).join('')}</svg>`);
    const contrast=[];
    for(const line of lines){
      const xs=line.quad.map(p=>p[0]),ys=line.quad.map(p=>p[1]);let count=0,poor=0,hidden=0,min=21;
      for(let y=Math.max(0,Math.floor(Math.min(...ys)));y<Math.min(1350,Math.ceil(Math.max(...ys)));y++)for(let x=Math.max(0,Math.floor(Math.min(...xs)));x<Math.min(1080,Math.ceil(Math.max(...xs)));x++){
        const i=(y*1080+x)*4;if(foreground[i+3]<250||!contains(line.quad,x+.5,y+.5))continue;
        const a=luminance(finished,i),b=luminance(background,i),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
        if([0,1,2].every(c=>Math.abs(finished[i+c]-background[i+c])<2))hidden++;
        count++;min=Math.min(min,ratio);if(ratio<4.5)poor++;
      }
      if(!count){violations.push(`No measurable glyph samples: ${line.id}.`);continue;}
      const fraction=poor/count;
      contrast.push({id:line.id,line:line.index,minimumRatio:Number(min.toFixed(2)),belowTargetFraction:Number(fraction.toFixed(3)),invisibleFraction:Number((hidden/count).toFixed(3)),samples:count});
      if(hidden/count>.05)violations.push(`Hidden or indistinguishable text: ${line.id} (${Math.round(hidden/count*100)}% of glyph samples).`);
      if(fraction>.05)violations.push(`Low text contrast: ${line.id} (${Math.round(fraction*100)}% of glyph samples below 4.5:1).`);
    }
    report={ok:!violations.length,violations:[...new Set(violations)],warnings:[...new Set(warnings)],foregroundLines:lines.length,contrast,method:'Independent SVG glyph bounds, transformed text collisions, and final composited pixel visibility/contrast against the scene without foreground text. Target 4.5:1 at ≥95% of ideal opaque glyph pixels. Photo relevance, portrait crops and aesthetic balance still need human review.'};
  }catch(e){report={ok:false,violations:[...violations,e.message],warnings};}
  if(cache.size>=8)cache.delete(cache.keys().next().value);cache.set(key,report);return report;
}
