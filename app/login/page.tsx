import LoginForm from './form';
import {chatGPTSignInPath} from '@/app/chatgpt-auth';
export const dynamic='force-dynamic';
export default async function Login({searchParams}:{searchParams:Promise<{invite?:string}>}){
 const {invite}=await searchParams;
 if(process.env.GENZ_AUTH_PROVIDER!=='sites')return <LoginForm/>;
 const path='/'+(invite?'?invite='+encodeURIComponent(invite):'');
 return <main className="workspace-content"><p className="eyebrow">GENZ · RAIPUR</p><h1>Sign in to your broker network</h1><p>Use the ChatGPT account associated with your GENZ invitation.</p><a className="primary-btn" href={chatGPTSignInPath(path)} target="_top">Sign in with ChatGPT</a><p style={{marginTop:20}}><a className="text-link" href="/verify">Verify a broker without login</a></p></main>;
}
