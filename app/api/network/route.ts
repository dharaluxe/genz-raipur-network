import {propertyAction} from '@/lib/property-actions';
import { z } from 'zod';
import {limitRequests} from '@/lib/rate-limit';
import {agreement,calculateBrokerage,summarizeSettlement} from '@/lib/brokerage';
import {parseAgreement,handleDealAction,requireDealParty,checkRevision,requireNoHold,mandateMatches} from '@/lib/deal-actions';
import { AREAS,TYPES,normalizePhone,publicMember,type Member,type DataRecord } from '@/lib/domain';
import { db,stmt,one,rows,identity,currentMember,requireMember,admin,now,uuid,fail,getRecord,isOwner,isParty,audit,createRecord,updateRecord,checkRequest,json,routeError,hash } from '@/lib/server';
export const dynamic='force-dynamic';
const txt=(v:unknown,label:string,max=200)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)fail(label+' is required (max '+max+' characters).');return v.trim();};
const optional=(v:unknown,max=2000)=>typeof v==='string'?v.trim().slice(0,max):'';
const num=(v:unknown,label:string,min=0,max=100000000000)=>{const n=Number(v);if(v===''||v==null||!Number.isFinite(n)||n<min||n>max)fail('Enter a valid '+label+'.');return Math.round(n*100)/100;};
const choice=(v:unknown,values:string[],label:string)=>{if(typeof v!=='string'||!values.includes(v))fail('Choose '+label+'.');return v;};
const phone=(v:unknown)=>{try{return normalizePhone(String(v??''));}catch(e){return fail((e as Error).message);}};
const email=(v:unknown)=>{const p=z.string().email().safeParse(v);if(!p.success)fail('Enter a valid email address.');return p.data.toLowerCase().trim();};
const date=(v:unknown,label:string)=>{const s=txt(v,label,50);if(!Number.isFinite(Date.parse(s)))fail('Enter a valid '+label+'.');return new Date(s).toISOString();};
const consent=(v:unknown)=>{if(v!==true)fail('Confirm permission to record and share these details.');return true;};
const brokerId=()=> 'GENZ-RPR-'+crypto.randomUUID().replace(/-/g,'').slice(0,10).toUpperCase();
async function relatedDeal(m:Member,id:string){const d=await getRecord(id,'deal');if(!isParty(d,m))fail('You are not a party to this deal.',403);return d;}
async function requireEvidence(id:string){const f=await one('SELECT id FROM files WHERE record_id = ? LIMIT 1',id);if(!f)fail('Upload supporting evidence before verification.');}

export async function GET(){try{
 const {user,member}=await currentMember();
 if(!member){const owner=await one('SELECT value FROM settings WHERE key = ?', 'owner');return json({user,member:null,needsSetup:!owner&&user.email===process.env.GENZ_OWNER_EMAIL?.toLowerCase(),records:[],members:[],files:[],audits:[],invites:[]});}
 if(member.status!=='active')return json({user,member,records:[],members:[],files:[],audits:[],invites:[]});
 const raw=await rows<any>(member.role==='admin'?'SELECT * FROM records ORDER BY created_at DESC LIMIT 2000':"SELECT * FROM records WHERE owner_id = ? OR partner_id = ? OR (kind = 'property' AND status = 'active') ORDER BY created_at DESC LIMIT 2000",...(member.role==='admin'?[]:[member.id,member.id]));
 if(raw.length>=2000)fail('The pilot record limit has been reached. Export and review records before continuing; partial financial totals are not shown.',409);
 const records:DataRecord[]=raw.map(({unique_key,...r})=>({...r,data:JSON.parse(r.data)}));
 for(const r of records)if(r.kind==='deal')r.data.finance=summarizeSettlement(r,records.filter(p=>p.kind==='payment'));
 for(const r of records){if(r.kind==='property'&&!isOwner(r,member)){r.data={title:r.data.title,area:r.data.area,type:r.data.type,size:r.data.size,asking:r.data.asking,facing:r.data.facing,roadWidth:r.data.roadWidth,description:r.data.description,verifiedAt:r.data.verifiedAt};}}
 const [allMembers,allFiles,allAudits,allInvites]=await Promise.all([
 rows<Member>('SELECT * FROM members ORDER BY created_at DESC LIMIT 1000'),
 rows<any>(member.role==='admin'?'SELECT * FROM files ORDER BY created_at DESC LIMIT 2000':'SELECT f.* FROM files f JOIN records r ON r.id = f.record_id WHERE r.owner_id = ? OR (r.partner_id = ? AND r.kind != ?) ORDER BY f.created_at DESC LIMIT 2000',...(member.role==='admin'?[]:[member.id,member.id,'property'])),
 rows<any>(member.role==='admin'?'SELECT * FROM audits ORDER BY created_at DESC LIMIT 150':'SELECT * FROM audits WHERE actor_id = ? ORDER BY created_at DESC LIMIT 100',...(member.role==='admin'?[]:[member.id])),
 member.role==='admin'?rows<any>('SELECT id,email,name,expires,used_by,created_at FROM invites ORDER BY created_at DESC LIMIT 100'):Promise.resolve([]),
 ]);
 return json({user,member,records,members:allMembers.map(m=>member.role==='admin'?m:publicMember(m)),files:allFiles,audits:allAudits,invites:allInvites});
}catch(e){return routeError(e);}}

export async function POST(request:Request){try{
 checkRequest(request);if(Number(request.headers.get('content-length')||0)>50000)fail('Request too large.');
 const rawBody=await request.text();if(rawBody.length>50000)fail('Request too large.');let b:any;try{b=JSON.parse(rawBody);}catch{fail('Invalid request.');}if(!b||typeof b!=='object')fail('Invalid request.');
 const action=txt(b.action,'Action',80);
 const actor=await identity();await limitRequests('write',actor.id,120);
 if(action==='setup'){
  const u=await identity();if(!process.env.GENZ_OWNER_EMAIL||u.email!==process.env.GENZ_OWNER_EMAIL.toLowerCase())fail('Only the configured workspace owner can initialize GENZ.',403);const name=txt(b.name,'Your name');const firm=txt(b.firm,'Firm');const mobile=phone(b.phone);consent(b.consent);
  if(await one('SELECT value FROM settings WHERE key = ?', 'owner'))fail('Workspace already configured.',409);
  await db().batch([stmt('INSERT INTO settings (key,value) VALUES (?,?)','owner',u.id),stmt('INSERT INTO members (id,email,name,firm,phone,area,role,status,broker_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',u.id,u.email,name,firm,mobile,'Raipur','admin','active',brokerId(),now()),audit(u.id,'workspace.setup',u.id,'Private owner workspace initialized; administrator is not independently verified.')]);return json({ok:true});
 }
 if(action==='join'){
  const u=await identity();const invite=await one<any>('SELECT * FROM invites WHERE token_hash = ?',await hash(txt(b.token,'Invite code',150)));
  if(!invite||invite.email!==u.email||invite.used_by||invite.expires<now())fail('This invite is invalid, expired, used or belongs to another email.',403);
  consent(b.consent);const name=txt(b.name,'Name'),mobile=phone(b.phone),firm=txt(b.firm,'Firm');
  await db().batch([stmt('INSERT INTO members (id,email,name,firm,phone,area,role,status,broker_id,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM invites WHERE id = ? AND used_by IS NULL AND expires > ?)',u.id,u.email,name,firm,mobile,choice(b.area,AREAS,'working area'),'broker','pending',brokerId(),now(),invite.id,now()),stmt('UPDATE invites SET used_by = ? WHERE id = ? AND used_by IS NULL',u.id,invite.id),audit(u.id,'invite.accepted',invite.id,'Pending admin verification')]);return json({ok:true});
 }
 const m=await requireMember();
 const propertyHandled=await propertyAction(action,b,m);if(propertyHandled)return json(propertyHandled);
 const handled=await handleDealAction(action,b,m);if(handled)return json(handled);
 if(action==='profile'){const name=txt(b.name,'Name'),firm=txt(b.firm,'Firm'),mobile=phone(b.phone),area=choice(b.area,['Raipur',...AREAS],'working area');const changedIdentity=m.role!=='admin'&&(name!==m.name||mobile!==m.phone);await db().batch([stmt('UPDATE members SET name=?,firm=?,phone=?,area=?,status=?,verified_at=? WHERE id=?',name,firm,mobile,area,changedIdentity?'pending':m.status,changedIdentity?null:m.verified_at||null,m.id),audit(m.id,'profile.updated',m.id,changedIdentity?'Identity changed; verification required again.':'Profile details updated')]);return json({ok:true});}
 if(action==='invite'){admin(m);const mail=email(b.email);if(await one('SELECT id FROM members WHERE email=?',mail))fail('This email is already a member.');const token=uuid()+uuid();const id=uuid();await db().batch([stmt('INSERT INTO invites (id,email,name,token_hash,expires,used_by,created_by,created_at) VALUES (?,?,?,?,?,NULL,?,?)',id,mail,txt(b.name,'Name'),await hash(token),new Date(Date.now()+72*3600000).toISOString(),m.id,now()),audit(m.id,'invite.created',id,mail)]);return json({ok:true,token});}
 if(action==='revokeInvite'){admin(m);await db().batch([stmt('UPDATE invites SET expires=? WHERE id=? AND used_by IS NULL',now(),txt(b.id,'Invite')),audit(m.id,'invite.revoked',b.id,txt(b.reason,'Reason'))]);return json({ok:true});}
 if(action==='memberStatus'){admin(m);const status=choice(b.status,['active','restricted','suspended','blacklisted'],'status');const id=txt(b.id,'Member');const member=await one<Member>('SELECT * FROM members WHERE id=?',id);if(!member)fail('Member not found.');if(member.role==='admin')fail('Admin membership cannot be suspended here.');const reason=txt(b.reason,'Evidence/review reason',2000);await db().batch([stmt('UPDATE members SET status=?,verified_at=CASE WHEN ?=? THEN ? ELSE verified_at END WHERE id=?',status,status,'active',now(),id),audit(m.id,'member.'+status,id,reason)]);return json({ok:true});}
 if(action==='property'){
  consent(b.consent);const asking=num(b.asking,'asking price',1),net=num(b.net,'owner net price',1);if(net>asking)fail('Owner net price cannot exceed asking price.');
  const data={title:txt(b.title,'Property title'),area:choice(b.area,AREAS,'area'),type:choice(b.type,TYPES,'property type'),size:num(b.size,'area in sq ft',1,10000000),asking,net,ownerEmail:email(b.ownerEmail),priceVersion:1,ownerName:txt(b.ownerName,'Owner name'),ownerPhone:phone(b.ownerPhone),address:txt(b.address,'Exact location',1000),maps:optional(b.maps,500),facing:optional(b.facing,60),roadWidth:num(b.roadWidth||0,'road width',0,500),description:optional(b.description),consent:true,consentAt:now()};
  if(data.maps&&!/^https:\/\/(www\.)?(google\.com|maps\.google\.com|maps\.app\.goo\.gl|goo\.gl)\//i.test(data.maps))fail('Use an HTTPS Google Maps link.');
  return json(await createRecord(m,'property','pending',data));
 }
 if(action==='propertyStatus'){
 const r=await getRecord(txt(b.id,'Property'),'property');if(!isOwner(r,m))fail('Permission denied.',403);checkRevision(r,b);const status=choice(b.status,['active','archived'],'status'),reason=txt(b.reason,'Verification or archive note',2000);let data={...r.data};
 if(status==='active'){admin(m);await requireEvidence(r.id);const proposed=data.pendingPrice||data,confirmation=data.ownerConfirmation;if(proposed.ownerEmail&&(!confirmation||confirmation.decision!=='accepted'||confirmation.asking!==proposed.asking||confirmation.net!==proposed.net||confirmation.email!==proposed.ownerEmail))fail('The owner must confirm this exact mandate version from their verified email account before activation.');
 if(data.pendingPrice){const evidence=await one('SELECT id FROM files WHERE record_id=? AND created_at>=? LIMIT 1',r.id,data.pendingPrice.at);if(!evidence)fail('Upload supporting mandate evidence for this price revision.');data={...data,asking:proposed.asking,net:proposed.net,ownerEmail:proposed.ownerEmail,priceVersion:proposed.version,priceHistory:[...(data.priceHistory||[]),{asking:data.asking,net:data.net,ownerEmail:data.ownerEmail,version:data.priceVersion||1,replacedAt:now(),reason:proposed.reason}],pendingPrice:null};}
 data={...data,verifiedAt:now(),verificationNote:reason};}else data.archiveNote=reason;
 return json(await updateRecord(m,r,status,data,'property.'+status,reason));
 }
 if(action==='customer'){
  consent(b.consent);const mobile=phone(b.phone);const data={name:txt(b.name,'Customer name'),phone:mobile,area:choice(b.area,AREAS,'preferred area'),type:choice(b.type,TYPES,'property type'),budget:num(b.budget,'maximum budget',1),minSize:num(b.minSize||0,'minimum area',0,10000000),notes:optional(b.notes),consent:true,consentAt:now()};
  const key='customer:'+m.id+':'+mobile; if(await one('SELECT id FROM records WHERE unique_key=?',key))fail('This customer already exists in your registry. Update their requirement instead.',409);
  return json(await createRecord(m,'customer','active',data,null,key));
 }
 if(action==='customerUpdate'){const r=await getRecord(txt(b.id,'Customer'),'customer');if(!isOwner(r,m))fail('Permission denied.',403);const data={...r.data,area:choice(b.area,AREAS,'area'),type:choice(b.type,TYPES,'type'),budget:num(b.budget,'budget',1),minSize:num(b.minSize||0,'minimum size',0,10000000),notes:optional(b.notes)};return json(await updateRecord(m,r,'active',data,'customer.requirement_updated','Requirement updated; prior introductions retained.'));}
 if(action==='deal'){
  const p=await getRecord(txt(b.propertyId,'Property'),'property'),c=await getRecord(txt(b.customerId,'Customer'),'customer');if(c.owner_id!==m.id)fail('Choose a customer from your registry.',403);if(p.status!=='active')fail('Property must be manually verified and active.');
  const listing=await one<Member>('SELECT * FROM members WHERE id=?',p.owner_id);if(!listing||listing.status!=='active')fail('Listing broker is not active.');
  const key='introduction:'+p.id+':'+c.data.phone;if(await one('SELECT id FROM records WHERE unique_key=?',key))fail('This customer already has an introduction for this property. Admin must review the existing introduction; do not create a duplicate.',409);
  const days=num(b.protectionDays,'agreed protection days',1,365);if(!Number.isInteger(days))fail('Use whole days.');consent(b.consent);
  return json(await createRecord(m,'deal','requested',{propertyId:p.id,propertyTitle:p.data.title,customerId:c.id,customerName:c.data.name,area:p.data.area,asking:p.data.asking,listingShare:num(b.listingShare,'listing broker share',0,100),pool:calculateBrokerage(parseAgreement(b),p.data.asking).pool,agreement:parseAgreement(b),agreementVersion:1,protectionDays:days,terms:txt(b.terms,'Commission/protection terms',2500),acceptedBy:[],offers:[],finalPrice:null},p.owner_id,key));
 }
 if(action==='dealDecision'){
  const r=await relatedDeal(m,txt(b.id,'Deal'));checkRevision(r,b);if(r.partner_id!==m.id)fail('Only the listing broker can accept or decline.',403);if(r.status!=='requested')fail('This request was already decided.');const decision=choice(b.decision,['accepted','declined'],'decision');if(decision==='accepted')await mandateMatches(agreement(r.data),r.data.propertyId);return json(await updateRecord(m,r,decision,{...r.data,acceptedBy:[r.owner_id,m.id],acceptedAt:now()},'cobroke.'+decision,txt(b.reason,'Acceptance/decline note',1000)));
 }
 if(action==='visit'){
  const d=await relatedDeal(m,txt(b.dealId,'Deal'));requireDealParty(d,m);requireNoHold(d);if(!['accepted','negotiation'].includes(d.status))fail('Accept the co-broke request before recording a visit.');
  const when=date(b.when,'visit date');return json(await createRecord(m,'visit','reported',{dealId:d.id,propertyTitle:d.data.propertyTitle,customerName:d.data.customerName,when,notes:txt(b.notes,'Visit and customer confirmation note',2000),customerConfirmed:false,agreementVersion:d.data.agreementVersion??0,protectionDays:agreement(d.data).protectionDays},d.owner_id===m.id?d.partner_id:d.owner_id));
 }
 if(action==='visitVerify'){admin(m);const r=await getRecord(txt(b.id,'Visit'),'visit');if(r.status!=='reported')fail('This visit was already reviewed.');await requireEvidence(r.id);const d=await getRecord(r.data.dealId,'deal');const until=new Date(Date.parse(r.data.when)+(r.data.protectionDays??d.data.protectionDays)*86400000).toISOString();return json(await updateRecord(m,r,'acknowledged',{...r.data,customerConfirmed:true,reviewNote:txt(b.reason,'Customer confirmation/evidence note',2000),protectedUntil:until,reviewedAt:now()},'visit.manually_acknowledged','Protection date recorded from visit date; not a legal guarantee.'));}
 if(action==='offer'){const r=await relatedDeal(m,txt(b.id,'Deal'));requireDealParty(r,m);requireNoHold(r);if(!['accepted','negotiation'].includes(r.status))fail('Offers are available only on accepted, open deals.');if((r.data.offers||[]).length>=100)fail('Offer history limit reached; contact admin.');const offer={id:uuid(),amount:num(b.amount,'offer amount',1),note:txt(b.note,'Offer note',1000),by:m.id,at:now()};return json(await updateRecord(m,r,'negotiation',{...r.data,offers:[...(r.data.offers||[]),offer]},'deal.offer_added',String(offer.amount)));}
 if(action==='payment'){
  const d=await relatedDeal(m,txt(b.dealId,'Deal'));requireDealParty(d,m);if(['requested','declined'].includes(d.status))fail('Accept the co-broke terms first.');
  const mode=choice(b.mode,['UPI','Bank transfer','Cheque','Cash'],'payment mode');const purpose=choice(b.purpose,['Brokerage','Co-broker settlement','Property token','Sale consideration','Refund'],'purpose');
  const reference=optional(b.reference,100);if(mode!=='Cash'&&!reference)fail('Transaction/cheque reference is required.');const recipient=txt(b.recipient,'Recipient');
  const parties=[d.owner_id,d.partner_id];
  const allocation:any={agreementVersion:d.data.agreementVersion??0};
  if(purpose==='Brokerage'){if(!parties.includes(b.beneficiaryId))fail('Select the broker who actually received this brokerage.');allocation.beneficiaryId=b.beneficiaryId;}
  if(purpose==='Co-broker settlement'){if(!parties.includes(b.fromBrokerId)||!parties.includes(b.toBrokerId)||b.fromBrokerId===b.toBrokerId)fail('Select the actual paying and receiving brokers.');allocation.fromBrokerId=b.fromBrokerId;allocation.toBrokerId=b.toBrokerId;}
  if(purpose==='Refund'){const original=await getRecord(txt(b.originalPaymentId,'Original payment'),'payment');if(original.data.dealId!==d.id||!['verified','cash_acknowledged'].includes(original.status)||original.data.purpose==='Refund')fail('Refund must refer to a finalized non-refund payment on this deal.');allocation.originalPaymentId=original.id;}
  const data={...allocation,dealId:d.id,propertyTitle:d.data.propertyTitle,amount:num(b.amount,'amount',.01),mode,purpose,payer:txt(b.payer,'Payer'),recipient,reference,when:date(b.when,'payment date'),note:txt(b.note,'Payment/receipt note',2000),recipientConfirmed:false,payerConfirmed:false};
  return json(await createRecord(m,'payment',mode==='Cash'?'cash_reported':'proof_pending',data,d.owner_id===m.id?d.partner_id:d.owner_id,mode==='Cash'?null:'payment:'+mode+':'+reference.toUpperCase()));
 }
 if(action==='paymentReview'){admin(m);const r=await getRecord(txt(b.id,'Payment'),'payment');if(['verified','cash_acknowledged'].includes(r.status))fail('Finalized payment cannot be edited. Record a separate correction/refund.');const status=choice(b.status,['verified','cash_acknowledged','rejected','disputed'],'review decision');
  if(r.data.mode==='Cash'&&status==='verified'||r.data.mode!=='Cash'&&status==='cash_acknowledged')fail('Cash can only be party-acknowledged, never bank-verified.');
  const deal=await getRecord(r.data.dealId,'deal');
  if(['verified','cash_acknowledged'].includes(status)){requireNoHold(deal);if(r.data.purpose==='Refund'){const original=await getRecord(r.data.originalPaymentId,'payment');const refunds=await rows<any>("SELECT data FROM records WHERE kind='payment' AND status IN ('verified','cash_acknowledged') AND json_extract(data,'$.originalPaymentId')=?",original.id);const total=refunds.reduce((sum,x)=>sum+JSON.parse(x.data).amount,0);if(Math.round((total+r.data.amount)*100)>Math.round(original.data.amount*100))fail('Refund exceeds the remaining amount on the original payment.');}await requireEvidence(r.id);consent(b.recipientConfirmed);consent(b.payerConfirmed);if(r.data.mode==='Cash'&&['Property token','Sale consideration'].includes(r.data.purpose))fail('Property cash records remain on review hold in this pilot. Obtain professional compliance review outside this app.');}
  const note=txt(b.reason,'Evidence/statement review note',2000),time=now();
  const reviewed={...r.data,recipientConfirmed:b.recipientConfirmed===true,payerConfirmed:b.payerConfirmed===true,reviewNote:note,reviewedAt:time,reviewedBy:m.id};
  const result=await db().batch([stmt('UPDATE records SET data=?, status=?, revision=revision+1, updated_at=? WHERE id=? AND revision=? AND EXISTS (SELECT 1 FROM records WHERE id=? AND revision=?)',JSON.stringify(reviewed),status,time,r.id,r.revision,deal.id,deal.revision),stmt('UPDATE records SET revision=revision+1, updated_at=? WHERE id=? AND revision=? AND changes()=1',time,deal.id,deal.revision),stmt('INSERT INTO audits (id,actor_id,action,record_id,detail,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1',uuid(),m.id,'payment.'+status,r.id,note,time)]);if(!result[0].meta.changes)fail('Payment or deal changed during review. Refresh and retry.',409);return json({id:r.id});
 }
 if(action==='review'){
  const d=await relatedDeal(m,txt(b.dealId,'Closed deal'));requireDealParty(d,m);requireNoHold(d);if(d.status!=='closed')fail('Ratings require a closed recorded deal.');const target=txt(b.targetId,'Broker');if(![d.owner_id,d.partner_id].includes(target))fail('Broker is not part of this deal.');if(target===m.id)fail('You cannot rate yourself.');
  const rating=num(b.rating,'rating',1,5);if(!Number.isInteger(rating))fail('Use a whole star rating.');return json(await createRecord(m,'review','pending',{dealId:d.id,targetId:target,rating,comment:txt(b.comment,'Review',1500),source:'Participating broker'},target,'review:'+d.id+':'+m.id+':'+target));
 }
 if(action==='reviewModerate'){admin(m);const r=await getRecord(txt(b.id,'Review'),'review');return json(await updateRecord(m,r,choice(b.status,['published','withheld'],'moderation decision'),{...r.data,moderationNote:txt(b.reason,'Reason',1500)},'review.moderated',b.status));}
 if(action==='complaint'){const target=txt(b.targetId,'Broker');if(!await one('SELECT id FROM members WHERE id=?',target))fail('Broker not found.');return json(await createRecord(m,'complaint','submitted',{targetId:target,category:choice(b.category,['Commission dispute','Misrepresentation','Bypass complaint','Behaviour','Other'],'category'),details:txt(b.details,'Complaint details',4000),responses:[]},target));}
 if(action==='complaintResponse'){const r=await getRecord(txt(b.id,'Complaint'),'complaint');if(!isParty(r,m))fail('Permission denied.',403);return json(await updateRecord(m,r,r.status,{...r.data,responses:[...(r.data.responses||[]),{by:m.id,text:txt(b.response,'Response',2500),at:now()}]},'complaint.response','Response or appeal added'));}
 if(action==='complaintDecision'){admin(m);const r=await getRecord(txt(b.id,'Complaint'),'complaint');const status=choice(b.status,['under_review','awaiting_response','resolved','dismissed','appeal'],'complaint status');return json(await updateRecord(m,r,status,{...r.data,decision:txt(b.reason,'Review/decision reason',3000),reviewedAt:now()},'complaint.'+status,b.reason));}
 fail('Unknown action.');
}catch(e){return routeError(e);}}
