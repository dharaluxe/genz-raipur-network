"use client";
import {useState} from 'react';
export default function Logout(){const [error,setError]=useState('');async function logout(){const res=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json','X-GenZ-Action':'1'},body:JSON.stringify({action:'signout'})});if(res.ok)location.assign('/login');else setError('Sign-out failed. Please retry.');}return <main className="workspace-content"><h1>Sign out?</h1><button className="primary-btn" onClick={()=>void logout()}>Sign out of GENZ</button>{error?<p role="alert">{error}</p>:null}</main>;}
