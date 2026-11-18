// Auth is release-gated; tokens are held in memory, not browser storage.
export function createSessionClient({url,publishableKey,releaseEnabled=false,fetcher=fetch}={}){
 let session=null, generation=0, expirationTimer=null; const listeners=new Set();
 const clear=()=>{session=null;clearTimeout(expirationTimer);expirationTimer=null;};
 const notify=()=>{for(const listener of listeners){try{listener();}catch{}}};
 const expire=()=>{++generation;clear();notify();};
 const ready=()=>{if(releaseEnabled!==true)throw new Error('Account access is unavailable during preview');if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url||'')||!publishableKey)throw new Error('Account access is not configured');};
 async function signIn(email,password){ready();if(typeof email!=='string'||typeof password!=='string'||!email.trim()||!password)throw new Error('Enter your account credentials');clear();const attempt=++generation;const r=await fetcher(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:publishableKey,'Content-Type':'application/json'},body:JSON.stringify({email:email.trim(),password}),cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('Unable to sign in');const d=await r.json();if(typeof d.access_token!=='string'||!d.access_token||typeof d.expires_in!=='number'||d.expires_in<=0||!d.user?.id)throw new Error('Unable to sign in');if(attempt!==generation)throw new Error('Sign-in superseded');session={token:d.access_token,expiresAt:Date.now()+Math.min(d.expires_in*1000,86400000),userId:d.user.id};expirationTimer=setTimeout(expire,Math.max(0,session.expiresAt-Date.now()));return {userId:session.userId};}
 function accessToken(){if(!session)throw new Error('Sign in again');if(Date.now()>=session.expiresAt){expire();throw new Error('Sign in again');}return session.token;}
 async function signOut(){const t=session?.token;++generation;clear();notify();if(!t)return;try{await fetcher(url+'/auth/v1/logout',{method:'POST',headers:{apikey:publishableKey,Authorization:'Bearer '+t},signal:AbortSignal.timeout(5000)});}catch{ /* Local session is cleared regardless. */ }}
 function onSignOut(listener){listeners.add(listener);return ()=>listeners.delete(listener);}
 return {signIn,signOut,accessToken,onSignOut};
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
 const reset=()=>{++generation;onClear();form.hidden=false;logout.hidden=true;submit.disabled=false;password.value='';status.textContent='Signed out.';};
 session.onSignOut(reset);
 logout.addEventListener('click',async()=>{await session.signOut();});
}

// Self-registration is independently gated until confirmed SMTP, CAPTCHA and redirects are configured.
export async function registerCustomer({url,publishableKey,registrationEnabled=false,email,password,confirmation,fetcher=fetch}={}){
 if(registrationEnabled!==true||!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url||'')||!publishableKey)throw new Error('Registration unavailable');
 const normalized=typeof email==='string'?email.trim().toLowerCase():'';
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)||normalized.length>254||typeof password!=='string'||password.length<12||password.length>72||password!==confirmation)throw new Error('Invalid registration details');
 // No client-supplied roles, property IDs, metadata or automatic sign-in. Property assignment remains owner-managed.
 const response=await fetcher(url+'/auth/v1/signup',{method:'POST',headers:{apikey:publishableKey,'Content-Type':'application/json'},body:JSON.stringify({email:normalized,password}),cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error('Registration could not be confirmed');
 const data=await response.json();if(!data||typeof data!=='object'||data.access_token||data.refresh_token||data.session)throw new Error('Email confirmation is not enforced');
 return {submitted:true,emailConfirmed:false,propertyAssigned:false};
}
export function mountRegistration(root,{registrationEnabled=false,config={}}={}){
 const doc=root.ownerDocument,el=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
 const status=el('p');status.setAttribute('role','status');root.replaceChildren(el('h3','Create a customer account'),status);
 if(registrationEnabled!==true){status.textContent='Account creation is not open during preview. Curb & Common will arrange property access before service.';return;}
 const form=el('form'),email=el('input'),password=el('input'),confirmation=el('input'),submit=el('button','Request account');
 email.type='email';email.required=true;email.autocomplete='email';email.maxLength=254;
 for(const p of [password,confirmation]){p.type='password';p.required=true;p.minLength=12;p.maxLength=72;p.autocomplete='new-password';}
 for(const [name,field] of [['Email address',email],['Password (12 characters minimum)',password],['Confirm password',confirmation]]){const label=el('label',name);label.append(field);form.append(label);}
 submit.type='submit';form.append(submit);root.append(form);
 form.addEventListener('submit',async e=>{e.preventDefault();if(submit.disabled)return;submit.disabled=true;form.setAttribute('aria-busy','true');status.textContent='Submitting account request…';
 try{await registerCustomer({...config,registrationEnabled,email:email.value,password:password.value,confirmation:confirmation.value});form.reset();status.textContent='Account request submitted. Check your email for confirmation instructions, if delivered. Property access is arranged separately; no booking is confirmed.';}
 catch{status.textContent='Account request not confirmed. Check your details or contact Curb & Common.';}
 finally{password.value='';confirmation.value='';submit.disabled=false;form.removeAttribute('aria-busy');}
 });
}
