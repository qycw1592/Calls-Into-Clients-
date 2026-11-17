// Auth is release-gated; tokens are held in memory, not browser storage.
export function createSessionClient({url,publishableKey,releaseEnabled=false,fetcher=fetch}={}){
 let session=null;
 const ready=()=>{if(releaseEnabled!==true)throw new Error('Account access is unavailable during preview');if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url||'')||!publishableKey)throw new Error('Account access is not configured');};
 async function signIn(email,password){ready();if(typeof email!=='string'||typeof password!=='string'||!email.trim()||!password)throw new Error('Enter your account credentials');session=null;const r=await fetcher(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:publishableKey,'Content-Type':'application/json'},body:JSON.stringify({email:email.trim(),password}),cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('Unable to sign in');const d=await r.json();if(typeof d.access_token!=='string'||!d.access_token||typeof d.expires_in!=='number'||d.expires_in<=0||!d.user?.id)throw new Error('Unable to sign in');session={token:d.access_token,expiresAt:Date.now()+d.expires_in*1000,userId:d.user.id};return {userId:session.userId};}
 function accessToken(){if(!session||Date.now()>=session.expiresAt){session=null;throw new Error('Sign in again');}return session.token;}
 async function signOut(){const t=session?.token;session=null;if(!t)return;try{await fetcher(url+'/auth/v1/logout',{method:'POST',headers:{apikey:publishableKey,Authorization:'Bearer '+t},signal:AbortSignal.timeout(5000)});}catch{ /* Local session is cleared regardless. */ }}
 return {signIn,signOut,accessToken};
}
