import {authClient} from '@/lib/auth';
import {checkRequest,fail,hash,json,routeError} from '@/lib/server';
import {z} from 'zod';

export const dynamic='force-dynamic';

const form=z.object({
 action:z.enum(['signin','signup','signout']),
 email:z.string().email().optional(),
 password:z.string().min(12).max(128).optional(),
 invite:z.string().max(150).optional(),
});

async function enforceLoginRateLimit(client:Awaited<ReturnType<typeof authClient>>,email:string){
 const {error}=await client.rpc('genz_check_login_rate_limit',{p_identity_hash:await hash(email)});
 if(!error)return;
 if(error.message.includes('GENZ_LOGIN_RATE_LIMIT'))fail('Too many requests. Wait one minute and try again.',429);
 throw error;
}

export async function POST(request:Request){try{
 if(process.env.GENZ_AUTH_PROVIDER==='sites')return json({error:'Use Sign in with ChatGPT.'},400);
 checkRequest(request);
 const raw=await request.text();
 if(raw.length>4000)fail('Request too large.');
 const parsed=form.safeParse(JSON.parse(raw));
 if(!parsed.success)fail('Enter a valid email and password of at least 12 characters.');
 const b=parsed.data,client=await authClient();

 if(b.action==='signout'){
  const {error}=await client.auth.signOut();
  if(error)throw error;
  return json({ok:true});
 }

 const email=b.email?.toLowerCase();
 if(!email||!b.password)fail('Email and password required.');
 await enforceLoginRateLimit(client,email);

 if(b.action==='signin'){
  const {data,error}=await client.auth.signInWithPassword({email,password:b.password});
  if(error||!data.user?.email_confirmed_at)fail('Sign-in failed. Check your password and confirm your email.',401);

  if(b.invite){
   const {error:redeemError}=await client.rpc('genz_redeem_invite',{
    p_token:b.invite,
    p_display_name:email.split('@')[0],
    p_firm:'Independent',
   });
   if(redeemError)throw redeemError;
  }

  return json({ok:true});
 }

 if(!b.invite)fail('A valid invitation is required to create an account.',403);
 const {data:inviteData,error:inviteError}=await client.rpc('genz_validate_invite',{p_token:b.invite});
 if(inviteError)throw inviteError;
 const inviteRow=Array.isArray(inviteData)?inviteData[0]:inviteData;
 if(!inviteRow?.valid)fail('A valid invitation is required to create an account.',403);

 const {data,error}=await client.auth.signUp({email,password:b.password});
 if(error)fail('Account creation failed. Retry later or contact the administrator.');

 if(data.session){
  const {error:redeemError}=await client.rpc('genz_redeem_invite',{
   p_token:b.invite,
   p_display_name:email.split('@')[0],
   p_firm:'Independent',
  });
  if(redeemError)throw redeemError;
  return json({ok:true,message:'Account activated. You can sign in now.'});
 }

 return json({ok:true,message:'Check your email to confirm the account, then return to this invite link and sign in.'});
 }catch(e){return routeError(e);}}
