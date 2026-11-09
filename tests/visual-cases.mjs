import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {root,readJSON} from '../src/assets.mjs';

export const visualCases={
  'navy-headline':{headline:'Your voice matters',body:'Support informed choices.',cta:'Join the conversation',styleVariant:'navy_poster',emphasis:'voice'},
  'action-bands':{template:'cta',headline:'Deine Stimme zählt',body:'Für klare Informationen und informierte Entscheidungen.',cta:'Mach deine Stimme hörbar',language:'de',styleVariant:'action_bands',emphasis:'Stimme'},
  'teal-emphasis':{headline:'Real people. Real choices.',emphasis:'Real choices.',body:'Clear information. A stronger community.',cta:'Make your voice heard',styleVariant:'teal_statement'},
  'german-compound':{headline:'Verbraucherschutzentscheidungen',emphasis:'Verbraucherschutzentscheidungen',language:'de',styleVariant:'navy_poster'},
  'quote-gradient':{template:'quote',styleVariant:'quote_spotlight',person:'michael',headline:'This is sample wording to demonstrate the quote layout. Replace it with a verified quotation.',emphasis:'verified quotation'},
  'german-punctuation':{headline:'„Verbraucherschutzentscheidungen!“',emphasis:'Verbraucherschutzentscheidungen',language:'de',styleVariant:'navy_poster'},
  'photo-editorial':{template:'photo',styleVariant:'photo_editorial',headline:'A community with a voice.',body:'People. Conversations. Shared experiences.',cta:'Meet the community',useReferenceImage:true,imageAlt:'Supplied WVA reference photograph for layout review.'},
  'photo-overlay':{template:'photo',styleVariant:'photo_overlay',headline:'Our community. Our voice.',emphasis:'Our voice.',body:'Together, we make ourselves heard.',cta:'Join the conversation',useReferenceImage:true,imageAlt:'Supplied WVA reference photograph for layout review.'},
  'statistic-focus':{template:'statistic',styleVariant:'statistic_focus',statisticValue:'1 von 3',headline:'Hier steht die Kernaussage',body:'Beispielzahl zur Gestaltung. Keine geprüfte Statistik.',label:'BEISPIEL',language:'de'},
  'quote-panel':{template:'quote',styleVariant:'quote_panel',person:'liza',headline:'Dies ist ein Beispieltext für die Gestaltung. Hier steht später ein geprüftes Zitat.',emphasis:'geprüftes Zitat',language:'de'},
};

// Real, credited test photograph only: never a runtime subject catalogue.
// Stage it through the same confined inputs path as a normal caller photograph.
export function withVisualCases(run){
  const imageFile=`visual-fixture-${randomUUID()}.jpg`,file=path.join(root,'inputs',imageFile);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.copyFileSync(path.join(root,'tests/fixtures/megaphone.jpg'),file,fs.constants.COPYFILE_EXCL);
  try{
    const cases={...visualCases},photo=readJSON('tests/fixtures/megaphone.json');
    for(const cutoutLayout of ['centered','offset','bands'])for(const imageTreatment of ['color','greyscale']){
      cases[`cutout-${cutoutLayout}-${imageTreatment}`]={...photo,imageFile,cutoutLayout,imageTreatment};
    }
    return run(cases);
  }finally{fs.unlinkSync(file);}
}
