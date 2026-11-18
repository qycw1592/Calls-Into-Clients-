// No anonymous customer collection or secret keys. Read-only portal adapter for future authorized release.
export async function readPortal({url,publishableKey,accessToken,fetcher=fetch}){if(!url||!publishableKey||!accessToken)throw new Error('Authorized session required');if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url))throw new Error('Invalid project URL');const headers={apikey:publishableKey,Authorization:'Bearer '+accessToken};const tables={properties:'id,address',visits:'id,property_id,service,scheduled_at,completed_at,status,notes',service_requests:'id,property_id,message,status,created_at',invoices:'id,property_id,amount_cents,status,created_at'};const results=await Promise.all(Object.entries(tables).map(async ([table,fields])=>{const r=await fetcher(url+'/rest/v1/'+table+'?select='+fields,{headers,cache:'no-store'});if(!r.ok)throw new Error('Portal could not be loaded');const data=await r.json();if(!Array.isArray(data))throw new Error('Unexpected portal response');return [table,data]}));return Object.fromEntries(results)}
export function portalStatus(state){return ({unavailable:'Client access is not available during the preview.',denied:'This information is not available to your account.',failed:'We could not load your account. Try again later.',pending:'Your existing schedule has not changed.'})[state]||'Client access is unavailable.';}

export async function portalAction({releaseEnabled=false,url,publishableKey,accessToken,action,fetcher=fetch}){if(releaseEnabled!==true)throw new Error('Portal is not available during preview');if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url||'')||!publishableKey||!accessToken)throw new Error('Authorized session required');const r=await fetcher(url+'/functions/v1/cc-portal-actions',{method:'POST',headers:{apikey:publishableKey,Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify(action),signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('Change not confirmed');const d=await r.json();if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(d.receipt_id||'')||d.booking_confirmed!==false)throw new Error('Change not confirmed');return d.receipt_id;}
export async function readPortalRole({releaseEnabled=false,url,publishableKey,accessToken,fetcher=fetch}){
 if(releaseEnabled!==true||!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url||'')||!publishableKey||!accessToken)throw new Error('Authorized session required');
 const r=await fetcher(url+'/functions/v1/cc-portal-actions',{method:'POST',headers:{apikey:publishableKey,Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify({action:'role'}),cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw new Error('Role unavailable');const d=await r.json();if(typeof d?.is_staff!=='boolean')throw new Error('Role unavailable');return d.is_staff;
}
export async function readOwnerLeads({url,publishableKey,accessToken,fetcher=fetch}){if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url||'')||!publishableKey||!accessToken)throw new Error('Authorized session required');const r=await fetcher(url+'/rest/v1/leads?select=id,created_at,contact_name,email,property_address,service,frequency,scope,status&order=created_at.desc&limit=100',{headers:{apikey:publishableKey,Authorization:'Bearer '+accessToken},cache:'no-store'});if(!r.ok)throw new Error('Lead inbox unavailable');const d=await r.json();if(!Array.isArray(d))throw new Error('Invalid inbox response');return d;}


// Release-gated quote discovery; actor is derived from the authenticated session at the server.
export async function readApprovedQuotes({releaseEnabled=false,url,publishableKey,accessToken,fetcher=fetch}){
 if(!releaseEnabled||!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url||'')||!publishableKey||!accessToken)throw new Error('Authorized session required');
 const r=await fetcher(url+'/functions/v1/cc-portal-actions',{method:'POST',headers:{apikey:publishableKey,Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify({action:'list_approved_quotes'}),cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw new Error('Quotes unavailable');const d=await r.json();
 if(d.booking_confirmed!==false||!Array.isArray(d.quotes))throw new Error('Quotes unavailable');
 return d.quotes.filter(q=>q&&/^[a-f0-9-]{36}$/i.test(q.quote_id)&&['pet','litter','windows'].includes(q.service)&&Number.isInteger(q.amount_cents)&&q.amount_cents>0&&Date.parse(q.expires_at)>Date.now());
}
export async function readOwnerProperties({url,publishableKey,accessToken,fetcher=fetch}){
 if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url||'')||!publishableKey||!accessToken)throw new Error('Authorized session required');
 const r=await fetcher(url+'/rest/v1/properties?select=id,address&order=address&limit=100',{headers:{apikey:publishableKey,Authorization:'Bearer '+accessToken},cache:'no-store'});
 if(!r.ok)throw new Error('Properties unavailable');const d=await r.json();if(!Array.isArray(d))throw new Error('Properties unavailable');return d;
}

/* Mount only in the frontend's approved account area. No network calls in preview. */
export function mountPortal(root,{releaseEnabled=false,session,config={},owner=false,onQuoteSelected=()=>{}}={}){
 const doc=root.ownerDocument;let epoch=0,busy=false,pendingApproval=null;
 const el=(tag,value)=>{const n=doc.createElement(tag);if(value!==undefined)n.textContent=String(value);return n;};
 const status=el('p');status.setAttribute('role','status');
 const content=el('div');const controls=el('div');
 root.replaceChildren(el('h2',owner?'Owner lead inbox':'Customer account'),status,controls,content);
 if(releaseEnabled!==true){status.textContent=portalStatus('unavailable');return {clear(){content.replaceChildren();}};}
 const button=(label,fn)=>{const b=el('button',label);b.type='button';b.addEventListener('click',fn);return b;};
 const clear=()=>{epoch++;busy=false;pendingApproval=null;content.replaceChildren();status.textContent='Signed out.';};
 const options=()=>({...config,releaseEnabled:true,accessToken:session.accessToken()});
 async function refresh(){
  if(busy)return;if(owner&&pendingApproval){status.textContent='Approval unconfirmed. Retry the same details before refreshing.';return;}const current=++epoch;busy=true;content.replaceChildren();status.textContent='Loading account…';
  try{
   const opts=options();
   const staff=await readPortalRole(opts);if(current!==epoch)return;session.accessToken();if(owner&&staff!==true){status.textContent=portalStatus('denied');return;}if(!owner&&staff===true){status.textContent='Staff account — use the owner inbox below.';return;}
   const data=owner?await readOwnerLeads(opts):await readPortal(opts);
   const extra=owner?await readOwnerProperties(opts):await readApprovedQuotes(opts);
   if(current!==epoch)return;session.accessToken();
   if(owner){
    const approval=el('form');approval.append(el('h3','Approve a booking quote'));const prop=el('select'),service=el('select'),amount=el('input'),expiry=el('input'),submit=el('button','Approve quote');
    for(const row of extra){const opt=el('option',row.address);opt.value=row.id;prop.append(opt);}
    for(const [key,name] of [['pet','Pet waste'],['litter','Commercial litter'],['windows','Ground-level windows']]){const opt=el('option',name);opt.value=key;service.append(opt);}
    amount.type='number';amount.min='0.01';amount.max='21474836.47';amount.step='0.01';amount.required=true;expiry.type='number';expiry.min='1';expiry.max='30';expiry.value='7';expiry.required=true;
    for(const [label,field] of [['Property',prop],['Service',service],['Approved total (USD)',amount],['Valid for (days)',expiry]]){const l=el('label',label);l.append(field);approval.append(l);}
    submit.type='submit';submit.disabled=!extra.length;approval.append(submit);
    approval.addEventListener('submit',async event=>{event.preventDefault();if(busy||current!==epoch||!prop.value)return;
      const cents=Math.round(Number(amount.value)*100),days=Number(expiry.value);if(!Number.isSafeInteger(cents)||cents<=0||!Number.isInteger(days)||days<1||days>30)return;
      const snapshot=JSON.stringify([prop.value,service.value,cents,days]);
      if(pendingApproval&&pendingApproval.snapshot!==snapshot){status.textContent='Previous approval unconfirmed. Retry unchanged details before making another approval.';return;}
      pendingApproval??={snapshot,request_id:crypto.randomUUID(),expires_at:new Date(Date.now()+days*86400000-1000).toISOString()};
      busy=true;submit.disabled=true;status.textContent='Saving approval…';
      try{const receipt=await portalAction({...options(),action:{action:'approve_quote',property_id:prop.value,service:service.value,amount_cents:cents,expires_at:pendingApproval.expires_at,request_id:pendingApproval.request_id}});if(current!==epoch)return;pendingApproval=null;approval.reset();status.textContent='Quote approved: '+receipt+'. No appointment or payment confirmed.';}
      catch{if(current===epoch)status.textContent='Approval unconfirmed. Retry the same details to check receipt.';}
      finally{if(current===epoch){busy=false;submit.disabled=false;}}
    });content.append(approval);
    if(!data.length)content.append(el('p','No inquiries available.'));
    for(const lead of data){
     const card=el('article');card.append(el('h3',lead.property_address||'Property inquiry'),el('p',lead.contact_name||''),el('p',lead.email||''),el('p',lead.service||''),el('p',lead.scope||''),el('p','Status: '+(lead.status||'Unknown')));
     const next=({new:'reviewing',reviewing:'quoted',quoted:'closed'})[lead.status];
     if(next)card.append(button(next==='quoted'?'Mark quoted (not booking approval)':'Mark '+next,async()=>{
      if(busy||current!==epoch)return;busy=true;status.textContent='Saving status…';
      try{await portalAction({...options(),action:{action:'lead_status',lead_id:lead.id,expected:lead.status,next}});if(current!==epoch)return;busy=false;await refresh();}
      catch{if(current===epoch){busy=false;status.textContent='Status change not confirmed. Refresh before retrying.';}}
     }));
     content.append(card);
    }
   }else{
    const quotes=el('section');quotes.append(el('h3','Approved quotes'));if(!extra.length)quotes.append(el('p','No approved quotes available.'));
    for(const q of extra){const card=el('article');const property=data.properties.find(p=>p.id===q.property_id);card.append(el('p',property?.address||'Property'),el('p',q.service),el('p',new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(q.amount_cents/100)),el('p','Expires: '+new Date(q.expires_at).toLocaleDateString()),button('View appointments',()=>{if(current===epoch){session.accessToken();onQuoteSelected(q.quote_id);}}));quotes.append(card);}content.append(quotes);
    for(const [key,label] of [['properties','Properties'],['visits','Visits'],['service_requests','Service requests'],['invoices','Invoices']]){
     const section=el('section');section.append(el('h3',label));
     if(!data[key].length)section.append(el('p','No records available.'));
     for(const row of data[key]){
      const card=el('article');
      if(key!=='properties'){const property=data.properties.find(p=>p.id===row.property_id);if(property)card.append(el('p','Property: '+property.address));}
      for(const field of ['name','address','property_address','status','service','scheduled_at','completed_at','notes','message','created_at'])if(typeof row[field]==='string')card.append(el('p',field.replaceAll('_',' ')+': '+row[field]));
      if(key==='invoices'&&Number.isSafeInteger(row.amount_cents)&&row.amount_cents>=0)card.append(el('p','Amount: '+new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(row.amount_cents/100)));
      if(key==='properties'&&typeof row.id==='string'){
       const form=el('form'),label=el('label','Service request'),input=el('textarea'),submit=el('button','Request service');
       input.required=true;input.maxLength=3000;label.append(input);submit.type='submit';form.append(label,submit);
       form.addEventListener('submit',async event=>{event.preventDefault();if(busy||current!==epoch||!input.value.trim())return;busy=true;submit.disabled=true;status.textContent='Submitting request…';
        try{const receipt=await portalAction({...options(),action:{action:'request_service',property_id:row.id,message:input.value.trim()}});if(current!==epoch)return;input.value='';status.textContent='Request received: '+receipt+'. No booking confirmed. Email delivery not verified.';}
        catch{if(current===epoch)status.textContent='Request not confirmed. Contact support before retrying.';}
        finally{if(current===epoch){busy=false;submit.disabled=false;}}
       });card.append(form);
      }section.append(card);
     }content.append(section);
    }
   }
   status.textContent='Account loaded.';
  }catch{if(current===epoch){content.replaceChildren();status.textContent=portalStatus('failed');}}
  finally{if(current===epoch)busy=false;}
 }
 controls.append(button('Refresh',refresh),button('Sign out',async()=>{clear();await session.signOut();}));
 return {refresh,clear};
}
