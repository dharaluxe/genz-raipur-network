import { database } from '@/lib/database';
import { documentBucket } from '@/lib/storage';
import { authenticatedUser } from '@/lib/auth';
import type { Member, DataRecord } from './domain';
export const db=()=>database;
export const bucket=()=>documentBucket;
export class AppError extends Error{constructor(message:string,public status=400){super(message);}}
export function fail(message:string,status=400):never{throw new AppError(message,status);}
export const now=()=>new Date().toISOString();
export const uuid=()=>crypto.randomUUID();
export const stmt=(sql:string,...args:any[])=>db().prepare(sql).bind(...args);
export const one=async<T=any>(sql:string,...args:any[])=>stmt(sql,...args).first<T>();
export const rows=async<T=any>(sql:string,...args:any[]):Promise<T[]> =>(await stmt(sql,...args).all<T>()).results;
export async function identity(){const user=await authenticatedUser();if(!user)fail('Sign in with your verified email to continue.',401);if(process.env.GENZ_LAUNCH_ENABLED!=='true'&&user.email!==process.env.GENZ_OWNER_EMAIL?.toLowerCase())fail('This migration is private until the owner enables broker access.',403);const existing=await one<{id:string}>('SELECT id FROM members WHERE email=?',user.email);return {...user,id:existing?.id||user.id};}
export async function currentMember(){const u=await identity();return {user:u,member:await one<Member>('SELECT * FROM members WHERE id = ?',u.id)};}
export async function requireMember(){const {member}=await currentMember();if(!member)fail('An invitation is required.',403);if(member.status!=='active')fail('Your membership is '+member.status+'. Contact the admin.',403);return member;}
export function admin(m:Member){if(m.role!=='admin')fail('Admin access required.',403);}
export const isOwner=(r:DataRecord,m:Member)=>m.role==='admin'||r.owner_id===m.id;
export const isParty=(r:DataRecord,m:Member)=>isOwner(r,m)||r.partner_id===m.id;
export async function getRecord(id:string,kind?:string){const r=await one<any>('SELECT * FROM records WHERE id = ?',id);if(!r||kind&&r.kind!==kind)fail('Record not found.',404);return {...r,data:JSON.parse(r.data)} as DataRecord;}
export function audit(actor:string,action:string,recordId:string,detail:string){return stmt('INSERT INTO audits (id, actor_id, action, record_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',uuid(),actor,action,recordId,detail.slice(0,3000),now());}
export async function createRecord(m:Member,kind:string,status:string,data:any,partner:string|null=null,key:string|null=null){const id=uuid(),time=now();await db().batch([stmt('INSERT INTO records (id, kind, owner_id, partner_id, status, unique_key, data, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',id,kind,m.id,partner,status,key,JSON.stringify(data),time,time),audit(m.id,kind+'.created',id,status)]);return {id};}
export async function updateRecord(m:Member,r:DataRecord,status:string,data:any,action:string,detail:string){const time=now();const out=await db().batch([stmt('UPDATE records SET status = ?, data = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?',status,JSON.stringify(data),time,r.id,r.revision),stmt('INSERT INTO audits (id, actor_id, action, record_id, detail, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE changes() = 1',uuid(),m.id,action,r.id,detail.slice(0,3000),time)]);if(!out[0].meta.changes)fail('This record changed. Refresh and try again.',409);return {id:r.id};}
export function checkRequest(request:Request){if(request.headers.get('x-genz-action')!=='1')fail('Invalid request.',403);const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)fail('Cross-site request blocked.',403);if(request.headers.get('sec-fetch-site')==='cross-site')fail('Cross-site request blocked.',403);}
export function json(data:any,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
export function routeError(e:unknown){if(e instanceof AppError)return json({error:e.message},e.status);if((e as any)?.code==='40001'||(e as any)?.code==='40P01')return json({error:'A concurrent update was detected. Refresh and retry.'},409);if(e instanceof Error&&(/UNIQUE constraint/i.test(e.message)||(e as any).code==='23505'))return json({error:'This record already exists. Check for a duplicate before continuing.'},409);console.error('GENZ request failed',{name:(e as any)?.name,code:(e as any)?.code});return json({error:'Could not complete this request. Your input has been kept. Please retry.'},503);}
export async function hash(s:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function canReadRecord(r:DataRecord,m:Member){if(isParty(r,m))return true;if(r.kind==='property'&&r.status==='active')return true;return false;}
