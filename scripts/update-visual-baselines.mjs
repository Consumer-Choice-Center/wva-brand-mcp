import fs from 'node:fs';
import path from 'node:path';
import {Resvg} from '@resvg/resvg-js';
import {root} from '../src/assets.mjs';
import {render,validateSVG,pngPreview} from '../src/brand.mjs';
import {withVisualCases} from '../tests/visual-cases.mjs';
// Explicit maintenance command. Tests never update expectations automatically.
const dir=path.join(root,'tests/visual-baselines');fs.mkdirSync(dir,{recursive:true});
withVisualCases(visualCases=>{
for(const [name,input] of Object.entries(visualCases)){
  const result=render(input),validation=validateSVG(result.svg);if(!validation.ok)throw Error(JSON.stringify(validation.violations));
  fs.writeFileSync(path.join(dir,name+'.png'),pngPreview(result.svg,270));
}
const columns=4,width=columns*280,height=Math.ceil(Object.keys(visualCases).length/columns)*348;
const items=Object.keys(visualCases).map((name,i)=>`<image x="${(i%columns)*280+5}" y="${Math.floor(i/columns)*348+5}" width="270" height="338" xlink:href="data:image/png;base64,${fs.readFileSync(path.join(dir,name+'.png')).toString('base64')}"/>`).join('');
fs.writeFileSync(path.join(dir,'review-sheet.png'),new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#dddddd"/>${items}</svg>`).render().asPng());
});
console.log('Baseline images written. Visually inspect tests/visual-baselines/review-sheet.png before accepting.');
