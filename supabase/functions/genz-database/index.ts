import postgres from 'npm:postgres@3.4.9';
import {translate} from './postgres-adapter.ts';

// Deployment replaces this with the SHA-256 of a random server-only key.
// The plaintext key is stored only in encrypted hosting configuration.
const keyHash='__GENZ_KEY_SHA256__';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function digest(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');}

Deno.serve(async(request:Request)=>{
 if(request.method!=='POST')return reply({error:'Method not allowed'},405);
 const authorization=request.headers.get('authorization')||'';
 if(!authorization.startsWith('Bearer ')||await digest(authorization.slice(7))!==keyHash)return reply({error:'Unauthorized'},401);
 let client:ReturnType<typeof postgres>|undefined;
 try{
  const raw=await request.text();if(raw.length>2_000_000)return reply({error:'Request too large'},413);
  const {operation,statements}=JSON.parse(raw);
  if(!['query','batch'].includes(operation)||!Array.isArray(statements)||statements.length<1||statements.length>200||(operation==='query'&&statements.length!==1))return reply({error:'Invalid request'},400);
  // Only the app's audited, parameterized SQL templates are accepted.
  const allowed=new Set((await import('./queries.json',{with:{type:'json'}})).default);
  for(const s of statements)if(typeof s.sql!=='string'||!allowed.has(s.sql)||!Array.isArray(s.args)||s.args.some((v:unknown)=>v!==null&&!['string','number','boolean'].includes(typeof v)))return reply({error:'Unknown statement'},400);
  client=postgres(Deno.env.get('SUPABASE_DB_URL')!,{prepare:false,max:1,connect_timeout:10,idle_timeout:5});
  const result=await client.begin('isolation level serializable',async tx=>{
   await tx.unsafe('SET LOCAL ROLE genz_app');
   await tx.unsafe('SET LOCAL search_path = genz, pg_catalog');
   await tx.unsafe("SET LOCAL statement_timeout = '15s'");
   const results=[];let previous=0;
   for(const s of statements){
    const translated=translate(s.sql,s.args,previous),r=await tx.unsafe(translated.text,translated.args);
    if(previous===1&&/changes\(\)\s*=\s*1/.test(s.sql)&&r.count!==1)throw Object.assign(new Error('Concurrent update'),{code:'40001'});
    previous=r.count;
    results.push({rows:Array.from(r),rowCount:r.count});
   }
   return operation==='query'?results[0]:results.map(r=>({success:true,meta:{changes:r.rowCount}}));
  });
  return reply(result);
 }catch(e){
  const code=String((e as {code?:string}).code||'DATABASE_ERROR');
  console.error('GENZ database failure',{code});
  return reply({error:'Database operation failed',code},['40001','40P01','23505'].includes(code)?409:503);
 }finally{if(client)await client.end({timeout:1});}
});
