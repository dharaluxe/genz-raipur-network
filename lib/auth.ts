import {createServerClient} from '@supabase/ssr';
import {cookies,headers} from 'next/headers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
export async function authClient(){
 const jar=await cookies();
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)throw new Error('Supabase authentication is not configured');
 return createServerClient(url,key,{cookies:{getAll:()=>jar.getAll(),setAll:items=>{for(const {name,value,options} of items)jar.set(name,value,{...options,sameSite:'lax',secure:process.env.NODE_ENV==='production'});}}});
}
export async function authenticatedUser(){
 if(process.env.GENZ_AUTH_PROVIDER==='sites'){
  // Enable only behind Sites dispatch, which owns these authenticated headers.
  const user=await getChatGPTUser(),id=(await headers()).get('oai-authenticated-user-id');
  return user&&id?{id,email:user.email.toLowerCase(),name:user.displayName}:null;
 }
 const client=await authClient();const {data,error}=await client.auth.getUser();
 if(error||!data.user?.email||!data.user.email_confirmed_at)return null;
 return {id:data.user.id,email:data.user.email.toLowerCase(),name:data.user.email};
}
