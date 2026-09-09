import {getRecord,fail,updateRecord,now,one} from './server';
import {checkRevision} from './deal-actions';
import type {Member} from './domain';
import {z} from 'zod';
const terms=z.object({asking:z.coerce.number().finite().positive().max(1e11),net:z.coerce.number().finite().positive().max(1e11),ownerEmail:z.string().email().transform(x=>x.toLowerCase()),reason:z.string().trim().min(1).max(2000)}).refine(x=>x.net<=x.asking);
export async function propertyAction(action:string,b:any,m:Member){
 if(action!=='propertyRevision')return null;
 const p=await getRecord(String(b.id||''),'property');if(p.owner_id!==m.id)fail('Only the listing broker can propose this change.',403);checkRevision(p,b);
 if(p.data.pendingPrice&&p.data.ownerConfirmation?.decision!=='rejected')fail('An owner review is already pending.',409);const parsed=terms.safeParse(b);if(!parsed.success)fail('Complete the asking price, owner net, owner email and reason. Owner net cannot exceed asking price.');
 const t=parsed.data;const brokerEmail=await one('SELECT id FROM members WHERE email=?',t.ownerEmail);if(brokerEmail)fail('Use the owner’s separate email account, not a broker account.');
 const pendingPrice={...t,asking:Math.round(t.asking*100)/100,net:Math.round(t.net*100)/100,proposedBy:m.id,at:now(),version:(p.data.priceVersion||1)+1};
 return updateRecord(m,p,'pending_revision',{...p.data,pendingPrice,ownerConfirmation:null,proposalHistory:[...(p.data.proposalHistory||[]),...(p.data.pendingPrice?[p.data.pendingPrice]:[])]},'property.price_proposed','Owner and admin confirmation required. Existing deal agreements stay unchanged.');
}
