import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as fontkit from 'fontkit';
import {DOMParser, XMLSerializer} from '@xmldom/xmldom';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const outputRoot = path.resolve(process.env.WVA_BRAND_OUTPUT_DIR || path.join(root, 'deliverables'));
export const readJSON = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
export const brand = readJSON('data/brand.json');
export const peopleData = readJSON('data/people.json');
export const people = peopleData.people;
export const templates = readJSON('data/templates.json');
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const escapeXML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export const fonts = {
  headline: {file:'Inter_24pt-SemiBold.ttf', family:'Inter 24pt', weight:600, identity:'Inter24pt-SemiBold'},
  bold: {file:'Inter_24pt-Bold.ttf', family:'Inter 24pt', weight:700, identity:'Inter24pt-Bold'},
  body: {file:'Lato-Medium.ttf', family:'Lato', weight:500, identity:'Lato-Medium'},
  light: {file:'Lato-Light.ttf', family:'Lato', weight:300, identity:'Lato-Light'},
  semibold: {file:'Lato-Semibold.ttf', family:'Lato', weight:600, identity:'Lato-Semibold'},
  cta: {file:'Lato-Bold.ttf', family:'Lato', weight:700, identity:'Lato-Bold'},
};
const fontCache = new Map();
export function getFont(role) {
  if (!fonts[role]) throw Error('Unknown typography role.');
  if (!fontCache.has(role)) fontCache.set(role, fontkit.openSync(path.join(root, 'assets/fonts', fonts[role].file)));
  return fontCache.get(role);
}
export function auditAssets() {
  const violations = [];
  const manifest = readJSON('assets/manifest.json');
  for (const item of manifest.files) {
    const file = path.join(root, item.path);
    if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== item.sha256) violations.push(`Asset missing or changed: ${item.path}`);
  }
  for (const [role, spec] of Object.entries(fonts)) {
    try {
      const font = getFont(role);
      if (font.postscriptName !== spec.identity) violations.push(`Incorrect ${role} font: ${font.postscriptName}`);
      if (![...'ÄÖÜäöüß'].every(c => font.hasGlyphForCodePoint(c.codePointAt(0)))) violations.push(`Missing German glyphs: ${role}`);
    } catch (e) { violations.push(e.message); }
  }
  return {ok:violations.length === 0, filesChecked:manifest.files.length, violations};
}
export function parseSVG(svg) {
  if (typeof svg !== 'string' || Buffer.byteLength(svg) > 32 * 1024 * 1024) throw Error('SVG exceeds the 32 MB limit.');
  if (/<!DOCTYPE|<!ENTITY/i.test(svg)) throw Error('SVG entities and DOCTYPE are not supported.');
  const errors = [];
  const doc = new DOMParser({onError:(level, message) => errors.push(`${level}: ${message}`)}).parseFromString(svg, 'image/svg+xml');
  if (errors.length || doc.documentElement?.localName !== 'svg') throw Error('Malformed SVG.');
  return doc;
}
export const serialize = node => new XMLSerializer().serializeToString(node);
export function logo(kind, color, x, y, width, height, id='official-logo', opacity=1) {
  if (!['Logo_Wide','Logo','Fist'].includes(kind) || !['W','G','B'].includes(color)) throw Error('Unapproved logo.');
  const file = `assets/logos/WVA_RB_${kind}_${color}.svg`;
  const doc = parseSVG(fs.readFileSync(path.join(root,file),'utf8'));
  const svg = doc.documentElement;
  const rules = {};
  for (const el of [...Array.from(doc.getElementsByTagName('style'))]) {
    for (const match of el.textContent.matchAll(/\.([\w-]+)\s*\{([^}]+)\}/g)) rules[match[1]] = match[2];
    el.parentNode.removeChild(el);
  }
  for (const el of [svg,...Array.from(svg.getElementsByTagName('*'))]) {
    const classes = (el.getAttribute('class') || '').split(/\s+/);
    const style = classes.map(c=>rules[c]||'').join(';');
    if (style) el.setAttribute('style',style);
    el.removeAttribute('class');
    if (el.hasAttribute('id')) el.setAttribute('id', `${id}-${el.getAttribute('id')}`);
    for (const attr of Array.from(el.attributes)) {
      attr.value = attr.value.replace(/url\(#([^)]*)\)/g,`url(#${id}-$1)`);
      if (attr.localName === 'href' && attr.value.startsWith('#')) attr.value = `#${id}-${attr.value.slice(1)}`;
    }
  }
  for(const [key,value] of Object.entries({x,y,width,height,id,opacity,'data-official-asset':file,preserveAspectRatio:'xMidYMid meet'})) svg.setAttribute(key,String(value));
  return serialize(svg);
}
export function readRaster(file, {reference=false, portrait=false}={}) {
  const base = portrait ? path.join(root,'assets/portraits') : reference ? path.join(root,'assets/images') : path.join(root,'inputs');
  const requested = path.isAbsolute(file) ? file : path.join(base,file);
  const real = fs.realpathSync(requested);
  const allowed = fs.realpathSync(base) + path.sep;
  if (!real.startsWith(allowed)) throw Error('Image must be inside the WVA inputs folder (symlink escapes are rejected).');
  const info = fs.statSync(real);
  if (!info.isFile() || info.size > 12 * 1024 * 1024) throw Error('Image must be a PNG/JPEG file under 12 MB.');
  const data = fs.readFileSync(real);
  const png = data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg = data[0] === 255 && data[1] === 216 && data[2] === 255;
  if (!png && !jpeg) throw Error('Only genuine PNG and JPEG images are accepted.');
  if (png && (data.readUInt32BE(16)>16000 || data.readUInt32BE(20)>16000 || data.readUInt32BE(16)*data.readUInt32BE(20)>50_000_000)) throw Error('Image exceeds pixel limits.');
  return {data,href:`data:image/${png?'png':'jpeg'};base64,${data.toString('base64')}`,sha256:sha256(data),file:path.relative(base,real)};
}
