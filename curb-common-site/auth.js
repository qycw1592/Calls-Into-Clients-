// Auth is release-gated; tokens are held in memory, not browser storage.
export function createSessionClient({url,publishableKey,releaseEnabled=false,fetcher=fetch}={}){
 let session=null, generation=0;
 const ready=()=>{if(releaseEnabled!==true)throw new Error('Account access is unavailable during preview');if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url||'')||!publishableKey)throw new Error('Account access is not configured');};
 async function signIn(email,password){ready();if(typeof email!=='string'||typeof password!=='string'||!email.trim()||!password)throw new Error('Enter your account credentials');session=null;const attempt=++generation;const r=await fetcher(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:publishableKey,'Content-Type':'application/json'},body:JSON.stringify({email:email.trim(),password}),cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('Unable to sign in');const d=await r.json();if(typeof d.access_token!=='string'||!d.access_token||typeof d.expires_in!=='number'||d.expires_in<=0||!d.user?.id)throw new Error('Unable to sign in');if(attempt!==generation)throw new Error('Sign-in superseded');session={token:d.access_token,expiresAt:Date.now()+d.expires_in*1000,userId:d.user.id};return {userId:session.userId};}
 function accessToken(){if(!session||Date.now()>=session.expiresAt){session=null;throw new Error('Sign in again');}return session.token;}
 async function signOut(){const t=session?.token;++generation;session=null;if(!t)return;try{await fetcher(url+'/auth/v1/logout',{method:'POST',headers:{apikey:publishableKey,Authorization:'Bearer '+t},signal:AbortSignal.timeout(5000)});}catch{ /* Local session is cleared regardless. */ }}
 return {signIn,signOut,accessToken};
}

/* Dedicated sign-in UI. The frontend must clear every mounted account view on session changes. */
export function mountSignIn(root,{session,releaseEnabled=false,onClear=()=>{},onSignedIn=()=>{}}={}){
 const doc=root.ownerDocument;const el=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
 const status=el('p');status.setAttribute('role','status');
 root.replaceChildren(el('h3','Account sign-in'),status);
 if(releaseEnabled!==true){status.textContent='Sign-in is unavailable during preview.';return;}
 const form=el('form'),email=el('input'),password=el('input'),submit=el('button','Sign in'),logout=el('button','Sign out');
 email.type='email';email.autocomplete='username';email.required=true;email.maxLength=254;
 password.type='password';password.autocomplete='current-password';password.required=true;
 const a=el('label','Email'),b=el('label','Password');a.append(email);b.append(password);
 submit.type='submit';logout.type='button';logout.hidden=true;form.append(a,b,submit);root.append(form,logout);
 let generation=0;
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(submit.disabled)return;const attempt=++generation;submit.disabled=true;onClear();status.textContent='Signing in…';
  try{await session.signIn(email.value,password.value);if(attempt!==generation)return;form.hidden=true;logout.hidden=false;status.textContent='Signed in.';await onSignedIn();}
  catch{if(attempt===generation){await session.signOut();onClear();form.hidden=false;logout.hidden=true;status.textContent='Unable to sign in or load your account. Try again.';}}
  finally{password.value='';if(attempt===generation)submit.disabled=false;}
 });
 logout.addEventListener('click',async()=>{++generation;onClear();form.hidden=false;logout.hidden=true;submit.disabled=false;password.value='';status.textContent='Signed out.';await session.signOut();});
}
