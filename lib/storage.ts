import {createClient} from '@supabase/supabase-js';
import {env} from 'cloudflare:workers';
function store(){
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
 if(!url||!key)throw new Error('Private document storage is not configured');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}).storage.from('genz-evidence');
}
export const documentBucket={
 async put(id:string,bytes:ArrayBuffer,options?:{httpMetadata:{contentType:string}}){if(process.env.GENZ_STORAGE_PROVIDER==='sites')return (env as any).BUCKET.put(id,bytes,options);const {error}=await store().upload(id,bytes,{contentType:options?.httpMetadata.contentType||'application/octet-stream',upsert:false});if(error)throw error;},
 async get(id:string){if(process.env.GENZ_STORAGE_PROVIDER==='sites')return (env as any).BUCKET.get(id);const {data,error}=await store().download(id);if(error){if(String(error.statusCode)==='404')return null;throw error;}return data?{body:await data.arrayBuffer()}:null;},
 async delete(id:string){if(process.env.GENZ_STORAGE_PROVIDER==='sites')return (env as any).BUCKET.delete(id);const {error}=await store().remove([id]);if(error)throw error;}
};
