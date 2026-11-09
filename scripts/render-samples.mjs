import fs from 'node:fs';
import path from 'node:path';
import {root} from '../src/assets.mjs';
import {createPost} from '../src/brand.mjs';

const samples=[
  {name:'01-navy-poster-en',content:{styleVariant:'navy_poster',headline:'Informed choices. Stronger voices.',emphasis:'Stronger voices.',body:'Clear information helps people make decisions.',cta:'Join the conversation',language:'en'}},
  {name:'02-action-bands-de',content:{template:'cta',styleVariant:'action_bands',headline:'Deine Stimme zählt',body:'Für klare Informationen und informierte Entscheidungen.',cta:'Mach deine Stimme hörbar',language:'de'}},
  {name:'03-photo-editorial-en',content:{template:'photo',styleVariant:'photo_editorial',headline:'A community with a voice.',body:'People. Conversations. Shared experiences.',cta:'Meet the community',language:'en',useReferenceImage:true,imageAlt:'Supplied WVA reference photograph: a person carrying a WVA tote bag.'}},
  // These are explicit draft layout demonstrations, not attributed real statements.
  {name:'04-quote-michael-en',content:{template:'quote',styleVariant:'quote_spotlight',person:'michael',headline:'This is sample wording to demonstrate the quote layout. Replace it with a verified quotation.',emphasis:'verified quotation',language:'en'}},
  {name:'05-quote-liza-de',content:{template:'quote',styleVariant:'quote_panel',person:'liza',headline:'Dies ist ein Beispieltext für die Gestaltung. Hier steht später ein geprüftes Zitat.',emphasis:'geprüftes Zitat',language:'de'}},
  {name:'06-teal-statement-en',content:{styleVariant:'teal_statement',headline:'Real people. Real choices.',emphasis:'Real choices.',body:'Clear information. A stronger community.',cta:'Make your voice heard',language:'en'}},
  {name:'07-statistic-focus-de',content:{template:'statistic',styleVariant:'statistic_focus',statisticValue:'1 von 3',headline:'Hier steht die Kernaussage',body:'Beispielzahl zur Gestaltung. Keine geprüfte Statistik.',label:'BEISPIEL',language:'de'}},
  {name:'08-photo-overlay-en',content:{template:'photo',styleVariant:'photo_overlay',headline:'Our community. Our voice.',emphasis:'Our voice.',body:'Together, we make ourselves heard.',cta:'Join the conversation',language:'en',useReferenceImage:true,imageAlt:'User-supplied WVA reference photograph used for a layout demonstration.'}},
];
const dir=path.join(root,'deliverables');fs.mkdirSync(dir,{recursive:true});
const results=[];
for(const sample of samples){
  const name=sample.name+'-v05';
  const file=path.join(dir,name+'.svg');
  if(fs.existsSync(file)){console.log(`Preserved existing sample ${sample.name}`);continue;}
  const content={...sample.content,mode:'draft'};
  fs.writeFileSync(path.join(root,'examples',name+'.json'),JSON.stringify(content,null,2)+'\n');
  const result=createPost(content,name+'.svg');results.push({name,...result});
  console.log(`${sample.name}: ${result.validation?.ok?'validated':'incomplete'}`);
}
if(results.length)fs.writeFileSync(path.join(dir,'sample-validation-v05.json'),JSON.stringify(results,null,2)+'\n');
