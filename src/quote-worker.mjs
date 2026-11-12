import {parentPort,workerData} from 'node:worker_threads';
import {render,validateSVG,outlineSVG,pngPreview} from './brand.mjs';
try{
  const {quote,...input}=workerData;
  const r=render({...input,headline:quote,template:'quote',autoCorrect:false}),validation=validateSVG(r.svg);
  if(!validation.ok)throw Error(validation.violations.join('; '));
  parentPort.postMessage({preview:pngPreview(r.svg,540),files:{'quote.png':{mimeType:'image/png',data:pngPreview(r.svg)},'quote.svg':{mimeType:'image/svg+xml',data:r.svg},'quote.outlined.svg':{mimeType:'image/svg+xml',data:outlineSVG(r.svg)},'quote.json':{mimeType:'application/json',data:JSON.stringify(r.content,null,2)}},report:{brand:'WVA',template:r.selection.variant,language:r.content.language,width:1080,height:1350,validation,spelling:r.spelling}});
}catch(e){parentPort.postMessage({error:e.message});}
