import {identity,rows,getRecord,fail,json,routeError,checkRequest,updateRecord,now,one} from '@/lib/server';
import {checkRevision} from '@/lib/deal-actions';
import {limitRequests} from '@/lib/rate-limit';
import type {Member} from '@/lib/domain';
export const dynamic='force-dynamic';
export async function GET(){try{const u=await identity();const list=await rows<any>("SELECT * FROM records WHERE kind='property' AND (json_extract(data,'$.pendingPrice.ownerEmail')=? OR (json_extract(data,'$.pendingPrice.ownerEmail') IS NULL AND json_extract(data,'$.ownerEmail')=?)) ORDER BY created_at DESC",u.email,u.email);return json({properties:list.map(r=>{const d=JSON.parse(r.data),p=d.pendingPrice||d;return {id:r.id,revision:r.revision,status:r.status,title:d.title,address:d.address,area:d.area,asking:p.asking,net:p.net,priceVersion:p.version||d.priceVersion||1,reason:p.reason||'Initial owner mandate',confirmation:d.ownerConfirmation||null};})});}catch(e){return routeError(e);}}
export async function POST(request:Request){try{checkRequest(request);const u=await identity();await limitRequests('owner',u.id,20);const raw=await request.text();if(raw.length>4000)fail('Request too large.');const b:any=JSON.parse(raw),p=await getRecord(String(b.id||''),'property');checkRevision(p,b);const proposal=p.data.pendingPrice||p.data;
 if(proposal.ownerEmail!==u.email)fail('This confirmation belongs to another owner.',403);if(await one('SELECT id FROM members WHERE email=?',u.email))fail('Owner confirmation requires the owner’s separate account.',403);
 if(!['pending','pending_revision'].includes(p.status))fail('This mandate is already finalized. Ask the listing broker for a revision.',409);
 if(b.consent!==true||!['accepted','rejected'].includes(b.decision)||typeof b.note!=='string'||!b.note.trim()||b.note.length>2000)fail('Record your decision, confirmation note and consent.');
 const confirmation={by:u.id,email:u.email,decision:b.decision,note:b.note.trim(),asking:proposal.asking,net:proposal.net,version:proposal.version||p.data.priceVersion||1,at:now(),method:'Verified email account; ownership documents require admin review'};
 const result=await updateRecord({id:u.id} as Member,p,p.status,{...p.data,ownerConfirmation:confirmation,ownerConfirmationHistory:[...(p.data.ownerConfirmationHistory||[]),confirmation]},'owner.mandate_'+b.decision,b.note);return json(result);
 }catch(e){return routeError(e);}}
