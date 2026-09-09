import {readFile,readdir,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import postgres from 'postgres';
import {createClient} from '@supabase/supabase-js';
import {randomUUID,createHash} from 'node:crypto';

// Input is the admin JSON export (or complete native-table snapshot) plus an
// evidence directory containing files named by their original file UUID.
// Run only after stopping source writes and approving the dedicated target.
const [snapshotPath,evidencePath]=process.argv.slice(2);
if(!snapshotPath||!evidencePath)throw new Error('Usage: node scripts/import-genz.mjs SNAPSHOT_JSON EVIDENCE_DIRECTORY');
for(const name of ['DATABASE_URL','SUPABASE_URL','SUPABASE_SECRET_KEY','GENZ_OWNER_EMAIL'])if(!process.env[name])throw new Error(name+' is required');
if(process.env.GENZ_IMPORT_CONFIRMED!=='true')throw new Error('Set GENZ_IMPORT_CONFIRMED=true only after verifying the empty, dedicated GENZ target and freezing source writes.');
const snapshot=JSON.parse(await readFile(snapshotPath,'utf8'));
const tables=['members','records','files','audits'];for(const t of tables)if(!Array.isArray(snapshot[t]))throw new Error('Missing complete table '+t);
const owner=snapshot.members.find(x=>x.role==='admin'&&x.email.toLowerCase()===process.env.GENZ_OWNER_EMAIL.toLowerCase());if(!owner)throw new Error('Configured owner does not match the source administrator');
const files=[];for(const f of snapshot.files){if(!/^[0-9a-f-]{36}$/i.test(f.id))throw new Error('Unexpected file identifier');const path=join(resolve(evidencePath),f.id);const bytes=await readFile(path);if(bytes.length!==f.size)throw new Error('Evidence size mismatch for '+f.id);files.push({metadata:f,bytes,sha256:createHash('sha256').update(bytes).digest('hex')});}
const sql=postgres(process.env.DATABASE_URL,{ssl:'require',prepare:false,max:1,connection:{search_path:'genz,public'}});
const storage=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}}).storage.from('genz-evidence');
try{
 for(const t of ['members','records','files','audits','settings','invites']){const [{n}]=await sql.unsafe('SELECT COUNT(*) AS n FROM genz.'+t);if(Number(n)!==0)throw new Error('Target is not empty: '+t);}
 // Upsert is deliberately false. A failed attempt leaves private orphan objects
 // for operator inspection; it must not overwrite an existing evidence object.
 for(const {metadata:f,bytes,sha256} of files){const {error}=await storage.upload(f.id,bytes,{contentType:f.mime,upsert:false});if(error)throw error;const {data,error:downloadError}=await storage.download(f.id);if(downloadError||!data)throw new Error('Evidence verification failed');const check=createHash('sha256').update(Buffer.from(await data.arrayBuffer())).digest('hex');if(check!==sha256)throw new Error('Uploaded evidence checksum mismatch');}
 const columns={members:['id','email','name','firm','phone','area','role','status','broker_id','created_at','verified_at'],records:['id','kind','owner_id','partner_id','status','unique_key','data','revision','created_at','updated_at'],files:['id','record_id','owner_id','name','mime','size','created_at'],audits:['id','actor_id','action','record_id','detail','created_at']};
 await sql.begin('isolation level serializable',async tx=>{
  for(const t of tables)for(const row of snapshot[t]){const cols=columns[t],values=cols.map(c=>c==='data'&&typeof row[c]!=='string'?JSON.stringify(row[c]):row[c]??null);await tx.unsafe('INSERT INTO genz.'+t+' ('+cols.join(',')+') VALUES ('+cols.map((_,i)=>'$'+(i+1)).join(',')+')',values);}
  await tx`INSERT INTO genz.settings (key,value) VALUES ('owner',${owner.id})`;
  // The new authentication system uses fresh invitations. Preserve old invite
  // metadata, but deliberately expire their bearer codes during cutover.
  for(const i of snapshot.invites||[])await tx`INSERT INTO genz.invites (id,email,name,token_hash,expires,used_by,created_by,created_at) VALUES (${i.id},${i.email},${i.name},${createHash('sha256').update(randomUUID()).digest('hex')},${new Date().toISOString()},${i.used_by||null},${i.created_by||owner.id},${i.created_at})`;
  await tx`INSERT INTO genz.audits (id,actor_id,action,record_id,detail,created_at) VALUES (${randomUUID()},${owner.id},'migration.import',${owner.id},'Imported source IDs, versions and evidence. Existing invite codes expired; verified-email login is now required.',${new Date().toISOString()})`;
 });
 for(const t of tables){const [{n}]=await sql.unsafe('SELECT COUNT(*) AS n FROM genz.'+t);const expected=snapshot[t].length+(t==='audits'?1:0);if(Number(n)!==expected)throw new Error('Imported count mismatch: '+t);}
 console.log(JSON.stringify({imported:true,records:snapshot.records.length,members:snapshot.members.length,evidence:files.length,checksumsVerified:true,launchEnabled:false}));
}finally{await sql.end();}
