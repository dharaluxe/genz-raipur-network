import LogoutForm from './form';
import {chatGPTSignOutPath} from '@/app/chatgpt-auth';
export const dynamic='force-dynamic';
export default function Logout(){
 if(process.env.GENZ_AUTH_PROVIDER!=='sites')return <LogoutForm/>;
 return <main className="workspace-content"><h1>Sign out?</h1><a className="primary-btn" href={chatGPTSignOutPath('/')} target="_top">Sign out of GENZ</a></main>;
}
