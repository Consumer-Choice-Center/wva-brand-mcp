import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Resvg} from '@resvg/resvg-js';
import {root,outputRoot,brand,people,templates,fonts,getFont,readRaster,logo,escapeXML,sha256,parseSVG,serialize,auditAssets,readJSON} from './assets.mjs';
import {reviewSpelling} from './spelling.mjs';
import {textBlock} from './layout.mjs';
import {auditVisualSVG} from './visual-qa.mjs';
import {prepareCutout,cutoutPhotoBrief} from './cutout.mjs';

export const variants=['navy_poster','action_bands','photo_editorial','teal_statement','statistic_focus','photo_overlay','topic_cutout','quote_spotlight','quote_panel'];
const photoVariants=['photo_editorial','photo_overlay'];
const copy=z.string().max(2400).refine(s=>!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(s),'Control characters are not allowed.');
export const contentSchema=z.object({
  template:z.enum(['policy_alert','statistic','cta','photo','cutout','quote']).default('policy_alert'),
  styleVariant:z.enum(['auto',...variants]).default('auto'),
  selectionMode:z.enum(['diverse','auto']).default('diverse'),
  recentVariants:z.array(z.enum(variants)).max(5).default([]),
  diversitySeed:z.string().max(200).default(''),
  language:z.enum(['en','de']).default('en'),
  headline:copy.refine(s=>s.trim().length>0,'Headline/quote is required.'),
  body:copy.default(''),cta:copy.default(''),label:copy.max(100).default(''),emphasis:copy.max(300).default(''),
  statisticValue:copy.max(32).default(''),
  person:z.enum(['michael','liza']).optional(),portrait:z.enum(['michael-1.png','michael-2.png','michael-3.png','liza.png']).optional(),
  imageFile:z.string().max(1000).optional(),imageAlt:copy.max(500).default(''),useReferenceImage:z.boolean().default(false),
  topic:copy.max(1000).optional(),visualConcept:copy.max(1000).optional(),recentVisualConcepts:z.array(copy.max(300)).max(5).optional(),
  visualRelevanceConfirmed:z.boolean().optional(),imageProvenance:z.enum(['provided_photo','sourced_photo']).optional(),
  imageSourceUrl:z.string().url().max(2000).optional(),imageCredit:copy.max(500).optional(),imageLicense:copy.max(500).optional(),
  cropPolygon:z.array(z.tuple([z.number().min(0).max(1),z.number().min(0).max(1)])).min(3).max(256).optional(),
  cropHoles:z.array(z.array(z.tuple([z.number().min(0).max(1),z.number().min(0).max(1)])).min(3).max(256)).max(20).optional(),
  grainAmount:z.number().min(0).max(.3).optional(),outlineWidth:z.number().min(0).max(20).optional(),
  imageTreatment:z.enum(['both','color','greyscale']).optional(),cutoutLayout:z.enum(['auto','centered','offset','bands']).optional(),
  mode:z.enum(['draft','final']).default('draft'),
  autoCorrect:z.boolean().default(true),approvedWords:z.array(z.string().min(1).max(80)).max(100).default([]),
  spellingAcknowledged:z.boolean().default(false),quoteVerified:z.boolean().default(false),factsVerified:z.boolean().default(false),
  sources:z.array(z.string().url().max(2000)).max(20).default([]),
}).strict();
export function selectVariant(c) {
  const quote=c.template==='quote';
  let eligible=quote?['quote_spotlight','quote_panel']:c.statisticValue?['statistic_focus']:c.template==='cutout'?['topic_cutout']:c.template==='photo'?photoVariants:['navy_poster','action_bands','teal_statement'];
  if(c.styleVariant!=='auto') {
    if(quote!==c.styleVariant.startsWith('quote_'))throw Error('Quote styles require template=quote; social styles cannot contain attributed quotes.');
    if(c.template==='photo'&&!photoVariants.includes(c.styleVariant))throw Error('Photo template requires a photo layout.');
    if(c.template==='cutout'&&c.styleVariant!=='topic_cutout')throw Error('Cutout requests require topic_cutout.');
    if(c.statisticValue&&c.styleVariant!=='statistic_focus')throw Error('Use statistic_focus to display statisticValue.');
    return {variant:c.styleVariant,eligible:[c.styleVariant],reason:'Explicit style selected.',weights:{[c.styleVariant]:1}};
  }
  const weights=Object.fromEntries(eligible.map(id=>[id,id==='action_bands'?(c.template==='cta'?4:2):id==='navy_poster'?(c.template==='statistic'?5:3):id==='teal_statement'?2:1]));
  if(c.selectionMode==='auto')return {variant:eligible.reduce((a,b)=>weights[b]>weights[a]?b:a),eligible,weights,reason:'Semantic template routing.'};
  for(const id of eligible) {
    if(c.recentVariants.at(-1)===id)weights[id]*=.15;
    if(c.recentVariants.slice(-3).filter(v=>v===id).length>=2)weights[id]*=.4;
  }
  const value=parseInt(sha256(`${c.headline}|${c.body}|${c.cta}|${c.diversitySeed}`).slice(0,8),16)/0x100000000;
  let target=value*Object.values(weights).reduce((a,b)=>a+b,0),variant=eligible.at(-1);
  for(const id of eligible){target-=weights[id];if(target<0){variant=id;break;}}
  return {variant,eligible,weights,reason:'Reproducible weighted selection with recent-template repetition penalties.'};
}
export function prepare(input) {
  const c=contentSchema.parse(input);
  if(c.statisticValue&&c.template!=='statistic')throw Error('statisticValue requires template=statistic.');
  if(c.template==='quote'&&!c.person)throw Error('Choose an approved person for a quote post.');
  if(c.template!=='quote'&&(c.person||c.portrait))throw Error('People and portraits are only accepted for quote posts.');
  if(c.template==='quote'&&(c.imageFile||c.useReferenceImage))throw Error('Quote posts use the approved portrait library.');
  if(c.mode==='final'&&c.template==='quote'&&!c.quoteVerified)throw Error('Final quote posts require quoteVerified=true after the caller verifies the attribution.');
  if(c.mode==='final'&&c.template==='statistic'&&(!c.factsVerified||!c.sources.length))throw Error('Final statistics require sources and factsVerified=true.');
  const fields=Object.fromEntries(['headline','body','cta','label','emphasis','statisticValue'].map(k=>[k,c[k]]));
  const spelling=reviewSpelling(fields,{language:c.language,autoCorrect:c.template==='quote'?false:c.autoCorrect,approvedWords:c.approvedWords});
  if(c.mode==='final'&&spelling.issues.length&&!c.spellingAcknowledged)throw Error('Review spelling issues with review_spelling, then correct the copy or set spellingAcknowledged=true for intentional wording.');
  Object.assign(c,spelling.correctedFields);
  if(c.emphasis&&!c.headline.toLocaleLowerCase().includes(c.emphasis.toLocaleLowerCase()))throw Error('Emphasis must occur in the headline/quote.');
  const selection=selectVariant(c);
  if(selection.variant==='topic_cutout') {
    if(c.useReferenceImage)throw Error('Topic cutouts must use newly chosen topic-relevant imagery; reference screenshots are composition references only.');
    c.imageTreatment??='both';c.cutoutLayout??='auto';c.grainAmount??=.12;c.outlineWidth??=8;
    if(c.cutoutLayout==='auto')c.cutoutLayout=['centered','offset','bands'][parseInt(sha256(`${c.headline}|${c.diversitySeed}`).slice(0,8),16)%3];
    if(!c.imageFile)return {status:'needs_source_photo',selection,spelling,content:c,...cutoutPhotoBrief(c)};
    if(!c.imageProvenance||!c.imageCredit?.trim()||!c.imageLicense?.trim())throw Error('Use a real photograph and provide imageProvenance, imageCredit and imageLicense. AI-generated subjects are not accepted.');
    if(c.imageProvenance==='sourced_photo'&&!c.imageSourceUrl)throw Error('Sourced photographs require imageSourceUrl.');
    if(c.cropHoles?.length&&!c.cropPolygon)throw Error('cropHoles require an outer cropPolygon.');
    if(!c.visualConcept?.trim()||!c.imageAlt.trim())throw Error('Describe the selected topic-specific subject in visualConcept and imageAlt.');
    if(c.mode==='final'&&!c.visualRelevanceConfirmed)throw Error('Inspect the image for relevance, then set visualRelevanceConfirmed=true for final cutout posts.');
  } else if(c.imageTreatment||c.cutoutLayout||c.visualConcept||c.recentVisualConcepts||c.visualRelevanceConfirmed||c.imageProvenance||c.imageSourceUrl||c.imageCredit||c.imageLicense||c.cropPolygon||c.cropHoles||c.grainAmount!==undefined||c.outlineWidth!==undefined)throw Error('Cutout imagery fields are only supported by topic_cutout.');
  if(selection.variant==='statistic_focus'&&(c.template!=='statistic'||!c.statisticValue))throw Error('statistic_focus requires template=statistic and statisticValue.');
  if(['teal_statement','statistic_focus'].includes(selection.variant)&&(c.imageFile||c.useReferenceImage))throw Error('This typography layout uses official background vectors, not a photograph.');
  if(photoVariants.includes(selection.variant)&&!c.imageFile&&!c.useReferenceImage)return {status:'needs_image',selection,spelling,content:c,prompt:`Supply an authentic brandless photograph relevant to: ${c.headline}. No text or logos baked into generated artwork. Save a PNG/JPEG under this server’s inputs folder and provide imageFile and imageAlt. The MCP does not generate images.`};
  if(c.mode==='final'&&(c.imageFile||c.useReferenceImage)&&!c.imageAlt)throw Error('Final posts with imagery require imageAlt.');
  return {status:'ready',content:contentSchema.parse(c),selection,spelling};
}
const rect=(x,y,w,h,fill,extra='')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
const {navy,teal,blue,ultramarine,phlox,white}=brand.colors;

// This renderer is also the canonical validator. All editable slots use the same measured layout.
export function renderPrepared(c,selection,expectedImageHash) {
  let image=null,person=null;
  if(c.template==='quote'){
    person=people.find(p=>p.id===c.person);
    const portrait=c.portrait||person.defaultPortrait;
    if(!person.portraits.includes(portrait))throw Error('Portrait does not belong to the selected person.');
    image=readRaster(portrait,{portrait:true});
  } else if(c.imageFile)image=readRaster(c.imageFile);
  else if(c.useReferenceImage){
    if(!['navy_poster',...photoVariants].includes(selection.variant))throw Error('This layout has no reusable reference photo.');
    image=readRaster(selection.variant==='navy_poster'?'reference-science.png':'reference-lifestyle.png',{reference:true});
  }
  if(expectedImageHash!==undefined&&(image?.sha256||null)!==expectedImageHash)throw Error('Source image has changed; regenerate the post.');
  if(selection.variant==='topic_cutout') {
    if(!image)throw Error('Supply a relevant real photograph first.');
    image=prepareCutout(image,c.imageTreatment==='greyscale'?'greyscale':'color',c);
  }
  const reports=[];
  const text=(value,slot,opts)=>{const item=textBlock(value,{...slot,language:c.template==='quote'?'en':c.language},opts);reports.push(item.report);return item.svg;};
  const raster=(x,y,w,h,fit='xMidYMid meet')=>`<image id="hero-image" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${fit}" xlink:href="${image.href}"><title>${escapeXML(c.imageAlt||`${person?.fullName||'WVA reference'} portrait`)}</title></image>`;
  const footer=(dark=true)=>text(brand.website,{role:'body',width:850,height:36,maxSize:24,minSize:24,maxLines:1},{id:'website',x:540,y:1280,color:dark?white:navy,align:'center'});
  const draft=c.mode==='draft'?text(c.language==='de'?'ENTWURF':'DRAFT',{role:'cta',width:170,height:28,maxSize:18,minSize:18},{id:'draft-label',x:1016,y:1314,color:['photo_editorial','teal_statement'].includes(selection.variant)?navy:white,align:'right'}):'';
  const croppedLetters=(color=blue,opacity=.13)=>`<g opacity="${opacity}">${text('WVA',{role:'bold',width:2200,height:850,maxSize:720,minSize:720,maxLines:1},{id:'wva-background',x:500,y:150,color,align:'center'})}</g>`;
  const fade=(id,y,height,stops)=>`<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops.map(([offset,opacity])=>`<stop offset="${offset}" stop-color="${navy}" stop-opacity="${opacity}"/>`).join('')}</linearGradient></defs>${rect(0,y,1080,height,`url(#${id})`,`id="${id}-overlay"`)}`;
  let body=rect(0,0,1080,1350,navy);
  if(selection.variant==='topic_cutout') {
    if(c.cutoutLayout==='bands') {
      body+=raster(45,310,990,910,'xMidYMax meet');
      const blocks=[{value:c.headline.toLocaleUpperCase(c.language),y:270,h:220,w:950,color:ultramarine,role:'headline',size:70,min:42,angle:-7},{value:c.body,y:560,h:220,w:890,color:blue,role:'body',size:52,min:42,angle:-3},{value:c.cta,y:830,h:128,w:920,color:phlox,role:'cta',size:48,min:40,angle:0}];
      for(let i=0;i<blocks.length;i++){
        const b=blocks[i];if(!b.value)continue;
        body+=`<g transform="rotate(${b.angle} 540 ${b.y+b.h/2})">${rect((1080-b.w)/2,b.y,b.w,b.h,b.color)}${text(b.value,{role:b.role,width:b.w-64,height:b.h-40,maxSize:b.size,minSize:b.min,maxLines:3},{id:`cutout-band-${i}`,x:540,y:b.y+20,color:i===0?white:navy,align:'center',verticalAlign:'center',emphasis:i===0?c.emphasis.toLocaleUpperCase(c.language):'',emphasisColor:teal,emphasisBackground:navy})}</g>`;
      }
      if(c.label)body+=text(c.label,{role:'cta',width:900,height:42,maxSize:26,minSize:22,maxLines:1},{id:'label',x:540,y:210,color:teal,align:'center'});
    } else {
      const offset=c.cutoutLayout==='offset',align=offset?'left':'center',x=offset?80:540;
      // Compact the upper copy and give the photographic subject a larger field.
      body+=raster(offset?150:45,510,offset?930:990,c.cta?680:740,'xMidYMax meet');
      if(c.label)body+=text(c.label,{role:'cta',width:920,height:38,maxSize:24,minSize:20,maxLines:1},{id:'label',x,y:190,color:white,align});
      body+=text(c.headline.toLocaleUpperCase(c.language),{role:'headline',width:920,height:180,maxSize:80,minSize:46,maxLines:3},{id:'headline',x,y:220,color:teal,align,verticalAlign:'center',emphasis:c.emphasis.toLocaleUpperCase(c.language),emphasisColor:white});
      if(c.body)body+=text(c.body,{role:'body',width:900,height:116,maxSize:50,minSize:42,maxLines:2},{id:'body',x,y:400,color:white,align,verticalAlign:'center'});
      if(c.cta)body+=text(c.cta,{role:'cta',width:940,height:64,maxSize:46,minSize:40,maxLines:1},{id:'cta',x:540,y:1200,color:teal,align:'center'});
    }
    body+=logo('Logo','W',458,54,164,120)+footer();
  } else if(selection.variant==='navy_poster') {
    if(image){body+=raster(0,250,1080,1100,'xMidYMax slice');body+=rect(0,250,1080,1100,navy,'opacity="0.58"');}
    else body+=logo('Fist','G',220,120,1110,1340,'background-fist',.27);
    body+=logo('Logo','W',445,64,190,140);
    if(c.label)body+=text(c.label.toLocaleUpperCase(c.language),{role:'cta',width:952,height:42,maxSize:24,minSize:20,maxLines:1},{id:'label',x:540,y:365,color:teal,align:'center'});
    body+=text(c.headline.toLocaleUpperCase(c.language),{role:'headline',width:952,height:370,maxSize:96,minSize:52,maxLines:4},{id:'headline',x:540,y:425,color:white,align:'center',verticalAlign:'center',emphasis:c.emphasis.toLocaleUpperCase(c.language),emphasisColor:teal});
    if(c.body)body+=text(c.body,{role:'body',width:890,height:185,maxSize:54,minSize:42,maxLines:3},{id:'body',x:540,y:820,color:white,align:'center',verticalAlign:'center'});
    if(c.cta)body+=rect(115,1050,850,104,ultramarine,'rx="12"')+text(c.cta,{role:'cta',width:794,height:76,maxSize:46,minSize:40,maxLines:1},{id:'cta',x:540,y:1064,color:white,align:'center',verticalAlign:'center'});
    body+=footer();
  } else if(selection.variant==='action_bands') {
    body+=image?raster(110,125,860,1030):logo('Fist','W',150,125,850,1030,'background-fist',.24);
    const bands=[{value:c.headline.toLocaleUpperCase(c.language),x:58,y:355,w:964,h:220,color:ultramarine,angle:-9,role:'headline',max:70,min:42},
      {value:c.body,x:82,y:640,w:916,h:220,color:blue,angle:-5,role:'body',max:56,min:44},
      {value:c.cta,x:64,y:925,w:952,h:136,color:phlox,angle:0,role:'cta',max:54,min:44}];
    for(let i=0;i<bands.length;i++){
      const b=bands[i];if(!b.value)continue;
      body+=`<g id="action-band-${i}" transform="rotate(${b.angle} 540 ${b.y+b.h/2})">${rect(b.x,b.y,b.w,b.h,b.color)}${text(b.value,{role:b.role,width:b.w-64,height:b.h-44,maxSize:b.max,minSize:b.min,maxLines:3},{id:`band-copy-${i}`,x:540,y:b.y+22,color:i===0?white:navy,align:'center',verticalAlign:'center',emphasis:i===0?c.emphasis.toLocaleUpperCase(c.language):'',emphasisColor:teal,emphasisBackground:navy})}</g>`;
    }
    if(c.label)body+=text(c.label,{role:'semibold',width:952,height:50,maxSize:28,minSize:24,maxLines:1},{id:'label',x:64,y:70,color:teal});
    body+=logo('Logo','W',64,1110,175,128)+footer();
  } else if(selection.variant==='photo_editorial') {
    if(!image)throw Error('Photo layout requires an image.');
    body=rect(0,0,1080,1350,white);
    body+=`<defs><clipPath id="photo-clip"><rect x="64" y="64" width="952" height="1130" rx="26"/></clipPath></defs><g clip-path="url(#photo-clip)">${raster(64,64,952,1130,'xMidYMid slice')}</g>`;
    body+=rect(88,410,904,640,white,'rx="20" opacity="0.96"');
    body+=text(c.headline,{role:'headline',width:808,height:230,maxSize:64,minSize:38,maxLines:3},{id:'headline',x:540,y:450,color:navy,align:'center',verticalAlign:'center',emphasis:c.emphasis,emphasisColor:ultramarine});
    if(c.label)body+=text(c.label,{role:'cta',width:808,height:38,maxSize:24,minSize:20,maxLines:1},{id:'label',x:540,y:420,color:ultramarine,align:'center'});
    if(c.body)body+=text(c.body,{role:'body',width:808,height:180,maxSize:50,minSize:42,maxLines:3},{id:'body',x:540,y:715,color:navy,align:'center',verticalAlign:'center'});
    if(c.cta)body+=text(c.cta,{role:'cta',width:808,height:82,maxSize:46,minSize:40,maxLines:1},{id:'cta',x:540,y:940,color:ultramarine,align:'center'});
    body+=logo('Logo_Wide','B',810,1210,206,60)+footer(false);
  } else if(selection.variant==='teal_statement') {
    body=rect(0,0,1080,1350,teal);
    body+=logo('Fist','B',250,70,1200,1450,'background-fist',.09);
    body+=logo('Logo','B',445,64,190,140);
    if(c.label)body+=text(c.label.toLocaleUpperCase(c.language),{role:'cta',width:900,height:44,maxSize:26,minSize:22,maxLines:1},{id:'label',x:540,y:340,color:navy,align:'center'});
    body+=text(c.headline.toLocaleUpperCase(c.language),{role:'headline',width:916,height:400,maxSize:98,minSize:54,maxLines:4},{id:'headline',x:540,y:420,color:navy,align:'center',verticalAlign:'center',emphasis:c.emphasis.toLocaleUpperCase(c.language),emphasisColor:white,emphasisBackground:navy});
    if(c.body)body+=text(c.body,{role:'body',width:860,height:180,maxSize:54,minSize:42,maxLines:3},{id:'body',x:540,y:850,color:navy,align:'center',verticalAlign:'center'});
    if(c.cta)body+=rect(115,1080,850,104,navy,'rx="12"')+text(c.cta,{role:'cta',width:794,height:76,maxSize:46,minSize:40,maxLines:1},{id:'cta',x:540,y:1094,color:white,align:'center',verticalAlign:'center'});
    body+=footer(false);
  } else if(selection.variant==='statistic_focus') {
    body+=croppedLetters(blue,.10)+logo('Fist','G',600,830,620,750,'background-fist',.22);
    body+=logo('Logo','W',445,64,190,140);
    if(c.label)body+=text(c.label.toLocaleUpperCase(c.language),{role:'cta',width:900,height:44,maxSize:26,minSize:22,maxLines:1},{id:'label',x:540,y:320,color:white,align:'center'});
    body+=text(c.statisticValue,{role:'bold',width:952,height:280,maxSize:240,minSize:90,maxLines:1},{id:'statistic-value',x:540,y:410,color:teal,align:'center',verticalAlign:'center'});
    body+=text(c.headline.toLocaleUpperCase(c.language),{role:'headline',width:900,height:180,maxSize:64,minSize:40,maxLines:3},{id:'headline',x:540,y:720,color:white,align:'center',verticalAlign:'center',emphasis:c.emphasis.toLocaleUpperCase(c.language),emphasisColor:teal});
    if(c.body)body+=text(c.body,{role:'body',width:860,height:170,maxSize:50,minSize:42,maxLines:3},{id:'body',x:540,y:940,color:white,align:'center',verticalAlign:'center'});
    if(c.cta)body+=text(c.cta,{role:'cta',width:900,height:76,maxSize:46,minSize:40,maxLines:1},{id:'cta',x:540,y:1140,color:teal,align:'center'});
    body+=footer();
  } else if(selection.variant==='photo_overlay') {
    if(!image)throw Error('Photo layout requires an image.');
    body+=raster(0,0,1080,1350,'xMidYMid slice');
    body+=rect(0,0,1080,1350,navy,'opacity="0.32"');
    body+=fade('photo-fade',0,1350,[[0,.05],[.32,.38],[.58,.76],[1,.88]]);
    body+=logo('Logo','W',445,64,190,140);
    if(c.label)body+=text(c.label.toLocaleUpperCase(c.language),{role:'cta',width:900,height:44,maxSize:26,minSize:22,maxLines:1},{id:'label',x:540,y:380,color:teal,align:'center'});
    body+=text(c.headline.toLocaleUpperCase(c.language),{role:'headline',width:916,height:370,maxSize:88,minSize:50,maxLines:4},{id:'headline',x:540,y:450,color:white,align:'center',verticalAlign:'center',emphasis:c.emphasis.toLocaleUpperCase(c.language),emphasisColor:teal});
    if(c.body)body+=text(c.body,{role:'body',width:860,height:185,maxSize:52,minSize:42,maxLines:3},{id:'body',x:540,y:850,color:white,align:'center',verticalAlign:'center'});
    if(c.cta)body+=text(c.cta,{role:'cta',width:900,height:76,maxSize:46,minSize:40,maxLines:1},{id:'cta',x:540,y:1100,color:teal,align:'center'});
    body+=footer();
  } else {
    if(c.body||c.cta||c.label)throw Error('Quote posts accept headline, emphasis, person and portrait; body, CTA and label are not quote slots.');
    if(selection.variant==='quote_spotlight') {
      body+=croppedLetters(blue,.16);
    }else{
      const mark=readJSON('assets/graphics/quote-mark.json');
      body+=`<g id="quote-watermark" transform="scale(${1080/mark.viewBox[2]})" fill="${teal}"><path d="${mark.path}"/></g>`;
    }
    // Fill through the bottom edge; crop sides only, preserving the head and aspect ratio.
    body+=raster(0,40,1080,1310,'xMidYMax slice');
    body+=fade('portrait-fade',560,790,[[0,0],[.30,.60],[.7,.82],[1,.90]]);
    body+=logo('Logo','W',885,50,135,100);
    body+=text('@vapers_alliance',{role:'body',width:450,height:38,maxSize:24,minSize:24,maxLines:1},{id:'handle',x:64,y:60,color:white});
    const quote=c.language==='de'?`„${c.headline}“`:`“${c.headline}”`;
    body+=text(quote,{role:'body',width:900,height:330,maxSize:60,minSize:46,maxLines:6},{id:'quote',x:540,y:800,color:white,align:'center',emphasis:c.emphasis,emphasisColor:teal});
    body+=text(person.fullName,{role:'cta',width:900,height:56,maxSize:44,minSize:40,maxLines:1},{id:'person-name',x:540,y:1152,color:teal,align:'center'});
    body+=text(person.title,{role:'body',width:900,height:46,maxSize:36,minSize:32,maxLines:1},{id:'person-title',x:540,y:1210,color:white,align:'center'});
    body+=footer();
  }
  body+=draft;
  const source=templates.find(t=>t.id===selection.variant).source;
  const metadata={format:'wva-social-v4',content:c,selection,imageSha256:image?.sha256||null,reference:source,...(image?.cutout?{cutout:image.cutout,renderedImageSha256:image.renderedSha256}:{})};
  const svg=`<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="1080" height="1350" viewBox="0 0 1080 1350" data-wva-layout="${selection.variant}" data-wva-contract="wva-social-v4"><title>${escapeXML(c.headline)}</title><desc>${escapeXML(c.imageAlt||'WVA social post')}</desc><metadata id="wva-source">${escapeXML(JSON.stringify(metadata))}</metadata><defs><clipPath id="frame-clip"><rect width="1080" height="1350"/></clipPath></defs><g clip-path="url(#frame-clip)">${body}</g></svg>`;
  return {svg,metadata,layout:reports};
}
export function render(input) {
  const prepared=prepare(input);
  if(prepared.status!=='ready')return prepared;
  const health=auditAssets();if(!health.ok)throw Error(health.violations.join('; '));
  return {...prepared,...renderPrepared(prepared.content,prepared.selection)};
}
export function validateIllustratorSVG(svg) {
  const violations=[];
  let doc;try{doc=parseSVG(svg);}catch(e){return {ok:false,violations:[e.message]};}
  const rootElement=doc.documentElement;
  if(rootElement.getAttribute('version')!=='1.1')violations.push('SVG 1.1 is required.');
  const allowedFamilies=new Set(Object.values(fonts).map(f=>f.family));
  for(const el of [rootElement,...Array.from(rootElement.getElementsByTagName('*'))]){
    if(['script','foreignObject','filter','iframe','animate','animateTransform','set'].includes(el.localName))violations.push(`Unsupported element: ${el.localName}`);
    for(const a of Array.from(el.attributes)) {
      if(/^on/i.test(a.name))violations.push('Event handlers are forbidden.');
      if(a.localName==='href'&&!a.value.startsWith('#')&&!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=\s]+$/.test(a.value))violations.push('External/unsupported linked asset.');
      if(/textLength|lengthAdjust/.test(a.name))violations.push('Text stretching is forbidden.');
    }
    if(el.localName==='image'&&!el.hasAttribute('xlink:href'))violations.push('Raster images need SVG 1.1 xlink:href.');
    if(el.localName==='text'&&!allowedFamilies.has(el.getAttribute('font-family')))violations.push('Unapproved or missing editable font family.');
  }
  if(/@font-face|data:font|<style[\s>]|mix-blend-mode|url\(\s*["']?(?:https?:|file:)/i.test(svg))violations.push('Browser-only or external CSS is forbidden.');
  return {ok:violations.length===0,violations:[...new Set(violations)]};
}
export function inspectVisualSVG(svg) {
  const structure=validateIllustratorSVG(svg);
  if(!structure.ok)return {...structure,warnings:[]};
  return auditVisualSVG(svg,{outline:outlineSVG});
}
export function validateSVG(svg) {
  const compatibility=validateIllustratorSVG(svg),violations=[...compatibility.violations];
  const visual=compatibility.ok?inspectVisualSVG(svg):{ok:false,violations:[],warnings:['Visual inspection skipped: invalid SVG structure.']};
  violations.push(...visual.violations);
  try {
    const doc=parseSVG(svg),el=doc.documentElement;
    if(el.getAttribute('width')!=='1080'||el.getAttribute('height')!=='1350'||el.getAttribute('viewBox')!=='0 0 1080 1350')violations.push('Social dimensions must be 1080×1350.');
    const nodes=Array.from(doc.getElementsByTagName('metadata')).filter(n=>n.getAttribute('id')==='wva-source');
    if(nodes.length!==1)throw Error('Missing unique WVA canonical source metadata.');
    const metadata=JSON.parse(nodes[0].textContent);
    if(metadata.format!=='wva-social-v4')throw Error('Earlier WVA composition: preserve the original and regenerate its source JSON with the current readability checks.');
    const prepared=prepare(metadata.content);
    if(prepared.status!=='ready')throw Error('Incomplete content.');
    const expected=renderPrepared(prepared.content,prepared.selection,metadata.imageSha256);
    if(expected.svg!==svg)violations.push('SVG differs from the canonical WVA composition. Edit source JSON and regenerate; do not patch geometry.');
    const health=auditAssets();violations.push(...health.violations);
  }catch(e){violations.push(e.message);}
  return {ok:violations.length===0,violations:[...new Set(violations)],illustrator:compatibility,visual,dimensions:{width:1080,height:1350}};
}
export function pngPreview(svg,width=1080){
  // Outline with the same fontkit metrics used to fit copy. Rasterizers must never
  // substitute a different face for a platform-specific family alias.
  const exact=svg.includes('<text ')?outlineSVG(svg):svg;
  return new Resvg(exact,{fitTo:{mode:'width',value:width},font:{loadSystemFonts:false}}).render().asPng();
}
export function outlineSVG(svg) {
  const doc=parseSVG(svg);
  for(const element of Array.from(doc.getElementsByTagName('text'))){
    const role=element.getAttribute('data-font-role'),font=getFont(role),size=Number(element.getAttribute('font-size')),scale=size/font.unitsPerEm;
    const run=font.layout(element.textContent),width=run.positions.reduce((s,p)=>s+p.xAdvance,0)*scale;
    const anchor=element.getAttribute('text-anchor'),x=Number(element.getAttribute('x'))-(anchor==='middle'?width/2:anchor==='end'?width:0),y=Number(element.getAttribute('y'));
    const group=doc.createElementNS('http://www.w3.org/2000/svg','g');group.setAttribute('aria-label',element.textContent);
    // Geometry is baked into paths; preserve compositing and visibility on the
    // replacement group so previews and independent QA see the actual artwork.
    const presentation=['id','transform','opacity','fill-opacity','stroke','stroke-opacity','stroke-width','display','visibility','clip-path','mask','style'];
    for(const attr of presentation)if(element.hasAttribute(attr))group.setAttribute(attr,element.getAttribute(attr));
    let cursor=0,textIndex=0;
    const colors=[],spans=[];
    function collect(node,chain=[]){
      if(node.nodeType===1){for(const child of Array.from(node.childNodes))collect(child,[...chain,node]);return;}
      for(const c of Array.from(node.nodeValue||'')){
        colors.push([...chain].reverse().find(n=>n.hasAttribute('fill'))?.getAttribute('fill')||element.getAttribute('fill'));
        spans.push(chain);
      }
    }
    for(const child of Array.from(element.childNodes))collect(child);
    for(let i=0;i<run.glyphs.length;i++){
      const glyph=run.glyphs[i],position=run.positions[i],p=doc.createElementNS('http://www.w3.org/2000/svg','path');
      p.setAttribute('d',glyph.path.toSVG());p.setAttribute('fill',colors[textIndex]||element.getAttribute('fill'));
      p.setAttribute('transform',`translate(${x+(cursor+position.xOffset)*scale} ${y-position.yOffset*scale}) scale(${scale} ${-scale})`);
      let parent=group;
      for(const span of spans[textIndex]||[]){
        const attrs=presentation.filter(a=>a!=='id'&&span.hasAttribute(a));
        if(attrs.length){const wrapper=doc.createElementNS('http://www.w3.org/2000/svg','g');for(const attr of attrs)wrapper.setAttribute(attr,span.getAttribute(attr));parent.appendChild(wrapper);parent=wrapper;}
      }
      parent.appendChild(p);cursor+=position.xAdvance;textIndex+=glyph.codePoints?.length||1;
    }
    element.parentNode.replaceChild(group,element);
  }
  doc.documentElement.setAttribute('data-wva-outlined','true');
  return serialize(doc);
}
export function createPost(input,outputFileName) {
  const result=render(input);if(result.status!=='ready')return result;
  const name=outputFileName||`wva-${result.selection.variant}-${randomUUID().slice(0,8)}.svg`;
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}\.svg$/.test(name))throw Error('Use a plain .svg filename, without directory traversal.');
  fs.mkdirSync(outputRoot,{recursive:true});
  const base=path.join(outputRoot,name.slice(0,-4));
  const paired=result.selection.variant==='topic_cutout'&&result.content.imageTreatment==='both';
  const results=paired?['color','greyscale'].map(treatment=>({treatment,result:render({...input,imageTreatment:treatment}),base:base+'-'+treatment})):[{result,base}];
  const outputs=results.map(item=>{
    const validation=validateSVG(item.result.svg);if(!validation.ok)throw Error(validation.violations.join('; '));
    const files={svg:item.base+'.svg',png:item.base+'.png',source:item.base+'.json',outlined:item.base+'.outlined.svg'};
    return {...item,files,validation};
  });
  const pairSource=paired?base+'.pair.json':null;
  // Preflight every variant before writing any file, so a collision cannot leave half a pair.
  for(const file of [...outputs.flatMap(o=>Object.values(o.files)),...(pairSource?[pairSource]:[])])if(fs.existsSync(file))throw Error('Output exists; choose a new filename.');
  const pending=outputs.flatMap(o=>{
    const buffers={svg:o.result.svg,png:pngPreview(o.result.svg),source:JSON.stringify(o.result.content,null,2)+'\n',outlined:outlineSVG(o.result.svg)};
    return Object.entries(o.files).map(([key,file])=>[file,buffers[key]]);
  });
  if(pairSource)pending.push([pairSource,JSON.stringify(result.content,null,2)+'\n']);
  const written=[];
  try {for(const [file,bytes] of pending){fs.writeFileSync(file,bytes,{flag:'wx'});written.push(file);}}
  catch(e){for(const file of written)fs.unlinkSync(file);throw e;}
  const describe=o=>({files:o.files,validation:o.validation,sha256:sha256(o.result.svg),layout:o.result.layout});
  return {ok:true,status:paired?'created_pair':'created',...(paired?{variants:Object.fromEntries(outputs.map(o=>[o.treatment,describe(o)])),source:pairSource}:describe(outputs[0])),selection:result.selection,spelling:result.spelling};
}
export function validateFile(filePath) {
  const file=fs.realpathSync(path.resolve(outputRoot,filePath)),base=fs.realpathSync(outputRoot)+path.sep;
  if(!file.startsWith(base)||path.extname(file)!=='.svg')throw Error('Validate a generated editable SVG inside the WVA output directory.');
  if(fs.statSync(file).size>32*1024*1024)throw Error('SVG exceeds size limit.');
  const svg=fs.readFileSync(file,'utf8');return {...validateSVG(svg),filePath:file,sha256:sha256(svg)};
}
export function validateSpec(spec) {
  const violations=[];
  if(spec.widthPx!==1080||spec.heightPx!==1350)violations.push('Social posts must be 1080×1350.');
  for(const color of spec.colors||[])if(!Object.values(brand.colors).includes(color.toUpperCase()))violations.push(`Unapproved WVA color: ${color}`);
  for(const family of spec.fonts||[])if(!['Inter','Lato',...Object.values(fonts).map(f=>f.family)].includes(family))violations.push(`Unapproved social font: ${family}`);
  if(spec.officialLogoHref&&!/^assets\/logos\/WVA_RB_(Logo_Wide|Logo|Fist)_[WGB]\.svg$/.test(spec.officialLogoHref))violations.push('Choose an approved packaged SVG logo.');
  return {ok:violations.length===0,violations};
}
