import nspell from 'nspell';
import en from 'dictionary-en';
import gb from 'dictionary-en-gb';
import de from 'dictionary-de';

const dictionaries = {en:[nspell(en),nspell(gb)], de:[nspell(de)]};
const terms = ['WVA','MCP','SVG','Inter','Lato','Michael','Landl','Liza','Katsiashvili','vaper','vapers','Vapers','vaping','Vaping','nicotine','Nikotin','Dampfen','E','EU','WHO','COP','THR'];
for(const dictionary of Object.values(dictionaries).flat()) for(const word of terms) dictionary.add(word);
const known = {en:{teh:'the',recieve:'receive',beleive:'believe',goverment:'government',guidleines:'guidelines',definately:'definitely',tamplate:'template',consuemrs:'consumers'},de:{Verbrauhcer:'Verbraucher',Verbrauhcern:'Verbrauchern',Regulierugn:'Regulierung',Regierugn:'Regierung',Gesundhiet:'Gesundheit',nich:'nicht'}};
const matchCase = (word,replacement) => word === word.toUpperCase() ? replacement.toUpperCase() : /^\p{Lu}/u.test(word) ? replacement[0].toUpperCase()+replacement.slice(1) : replacement;
export function reviewSpelling(fields, {language='en',autoCorrect=true,approvedWords=[]}={}) {
  if (!dictionaries[language]) throw Error('Supported languages are en and de.');
  const dicts = dictionaries[language];
  const corrections=[],issues=[],correctedFields={...fields};
  const allowed = new Set([...terms,...approvedWords].map(x=>x.toLowerCase()));
  for(const [field,text] of Object.entries(fields)) {
    if (typeof text !== 'string') continue;
    const replacements=[];
    const masked = text.replace(/https?:\/\/\S+|www\.\S+|\b[\w.+-]+@[\w.-]+\.[a-z]+\b|@[\w_]+/gi, m=>' '.repeat(m.length));
    for(const match of masked.matchAll(/[\p{L}]+(?:['’][\p{L}]+)*/gu)) {
      const word=match[0];
      if(word.length<2 || allowed.has(word.toLowerCase())) continue;
      const correction = known[language][word] || known[language][word.toLowerCase()];
      const forms=language==='en' ? [word,word.toLowerCase()] : word===word.toUpperCase() ? [word,word.toLowerCase(),word[0]+word.slice(1).toLowerCase()] : [word];
      if(!correction && dicts.some(d=>forms.some(f=>d.correct(f)))) continue;
      if(correction && autoCorrect) {
        const corrected=matchCase(word,correction);
        const item={field,original:word,corrected,start:match.index,end:match.index+word.length};
        corrections.push(item);replacements.push(item);
      } else {
        const suggestions=correction ? [matchCase(word,correction)] : dicts[0].suggest(word).slice(0,4);
        issues.push({field,word,start:match.index,end:match.index+word.length,suggestions});
      }
    }
    let corrected=text;
    for(const item of replacements.reverse())corrected=corrected.slice(0,item.start)+item.corrected+corrected.slice(item.end);
    correctedFields[field]=corrected;
  }
  return {ok:issues.length===0,language,hasCorrections:corrections.length>0,corrections,issues,originalFields:fields,correctedFields,highlightedCorrections:corrections.map(c=>`~~${c.original}~~ → **${c.corrected}**`),userNotice:corrections.length?'Spelling corrections were applied. Show the listed changes to the user.':issues.length?'Review flagged words; spelling suggestions are not factual checks.':'No spelling issues found.'};
}
