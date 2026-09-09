export const AREAS = ['Kamal Vihar','Sejbahar','New Rajendra Nagar','Pachpedi Naka','Tikrapara','Shankar Nagar','Saddu','Mowa','Kachna','Avanti Vihar','Telibandha','Amlidih','Bhatagaon','Dunda','Santoshi Nagar','Tatibandh','Sarona','Hirapur','Daldal Seoni','Vidhan Sabha Road','Naya Raipur','Other Raipur area'];
export const TYPES = ['Residential plot','Independent house','Apartment','Commercial','Agricultural land'];
export type Member={id:string;name:string;email?:string;phone?:string;firm:string;area:string;role:string;status:string;broker_id:string;created_at:string;verified_at?:string;rating?:number;review_count?:number};
export type DataRecord={id:string;kind:string;owner_id:string;partner_id:string|null;status:string;data:Record<string,any>;revision:number;created_at:string;updated_at:string};
export const money=(v:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:0,maximumFractionDigits:2}).format(v||0);
export const shortMoney=(v:number)=>v>=10000000?'₹'+(v/10000000).toFixed(2).replace(/\.00$/,'')+' Cr':v>=100000?'₹'+(v/100000).toFixed(2).replace(/\.00$/,'')+' L':money(v);
export const dateLabel=(v:string)=>v?new Date(v).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kolkata'}):'—';
export function normalizePhone(v:string){const n=v.replace(/\D/g,'');const p=n.length===12&&n.startsWith('91')?n.slice(2):n;if(!/^[6-9]\d{9}$/.test(p))throw new Error('Enter a valid 10-digit Indian mobile number.');return p;}
export function matchProperty(p:DataRecord,c:DataRecord){return p.kind==='property'&&p.status==='active'&&p.data.type===c.data.type&&p.data.area===c.data.area&&p.data.asking<=c.data.budget&&p.data.size>=c.data.minSize;}
export function splitCommission(pool:number,share:number){const listing=Math.round(pool*share)/100;return {listing,buyer:Math.round((pool-listing)*100)/100};}
export const publicMember=(m:Member)=>({id:m.id,name:m.name,firm:m.firm,area:m.area,role:m.role,status:m.status,broker_id:m.broker_id,created_at:m.created_at,verified_at:m.verified_at});
