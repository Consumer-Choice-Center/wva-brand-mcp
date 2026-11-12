import {z} from 'zod';
import {contentSchema} from './brand.mjs';
import {createQuoteService,runQuoteWorker} from './http-artifacts.mjs';
export const remoteQuoteSchema=contentSchema.pick({person:true,portrait:true,language:true,emphasis:true,mode:true,quoteVerified:true,factsVerified:true,sources:true,approvedWords:true,spellingAcknowledged:true}).extend({
  person:z.enum(['michael','liza']),quote:z.string().trim().min(1).max(2400),styleVariant:z.enum(['quote_spotlight','quote_panel']).default('quote_spotlight')
}).strict();
export const quoteDescription='Render a WVA quote post over HTTP using an approved packaged portrait. Returns an inline PNG preview and expiring PNG, editable SVG, outlined SVG and source JSON download links. Read brand guidelines and list_quote_people first. Use draft for unapproved wording; final requires quoteVerified. Quote wording is never automatically rewritten. Save the downloads before they expire in one hour.';
export function remoteQuoteService(options={}){
  return createQuoteService({...options,render:input=>runQuoteWorker(new URL('./quote-worker.mjs',import.meta.url),remoteQuoteSchema.parse(input))});
}
