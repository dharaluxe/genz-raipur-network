import {authClient} from '@/lib/auth';
import {checkRequest,fail,json,routeError,one,now,hash} from '@/lib/server';
import {limitRequests} from '@/lib/rate-limit';
import {z} from 'zod';
export const dynamic='force-dynamic';
const form=z.object({action:z.enum(['signin','signup','signout']),email:z.string().email().optional(),password:z.string().min(12).max(128).optional(),invite:z.string().max(150).optional()});
export async function POST(request:Request){try{
 if(process.env.GENZ_AUTH_PROVIDER==='sites')return json({error:'Use Sign in with ChatGPT.'},400);
 checkRequest(request);const raw=await request.text();if(raw.length>4000)fail('Request too large.');const parsed=form.safeParse(JSON.parse(raw));if(!parsed.success)fail('Enter a valid email and password of at least 12 characters.');const b=parsed.data,client=await authClient();
 if(b.action==='signout'){const {error}=await client.auth.signOut();if(error)throw error;return json({ok:true});}
 const email=b.email?.toLowerCase();if(!email||!b.password)fail('Email and password required.');await limitRequests('login',email,10);
 if(b.action==='signin'){const {data,error}=await client.auth.signInWithPassword({email,password:b.password});if(error||!data.user?.email_confirmed_at)fail('Sign-in failed. Check your password and confirm your email.',401);return json({ok:true});}
 const owner=email===process.env.GENZ_OWNER_EMAIL?.toLowerCase();
 const existing=await one('SELECT id FROM members WHERE email=?',email);
 const invite=b.invite?await one('SELECT id FROM invites WHERE email=? AND token_hash=? AND used_by IS NULL AND expires>?',email,await hash(b.invite),now()):null;
 const ownerProperty=await one("SELECT id FROM records WHERE kind='property' AND (json_extract(data,'$.ownerEmail')=? OR json_extract(data,'$.pendingPrice.ownerEmail')=?) LIMIT 1",email,email);
 if(!owner&&!existing&&!invite&&!ownerProperty)fail('A valid invitation is required to create an account.',403);
 if(process.env.GENZ_LAUNCH_ENABLED!=='true'&&!owner)fail('Broker onboarding is not enabled yet.',403);
 const {error}=await client.auth.signUp({email,password:b.password});if(error)fail('Account creation failed. Retry later or contact the administrator.');
 return json({ok:true,message:'Check your email to confirm the account, then sign in.'});
 }catch(e){return routeError(e);}}
