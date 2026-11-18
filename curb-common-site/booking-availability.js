// Owner-confirmed slots only; empty or unknown availability never implies availability.
export function availableSlots(slots,{now=Date.now(),approved=false}={}){if(!approved||!Array.isArray(slots))return [];return slots.filter(s=>s&&s.status==='available'&&s.ownerConfirmed===true&&Number.isFinite(Date.parse(s.start))&&Number.isFinite(Date.parse(s.end))&&Date.parse(s.start)>now&&Date.parse(s.end)>Date.parse(s.start)).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));}
export function slotMessage(slots){return slots.length?'Select an available appointment to request. Confirmation is pending.':'No confirmed appointments are available. Request a custom quote after release.';}

// Only consume rows returned by the protected approved-quote endpoint.
export function normalizeApprovedSlots(rows,now=Date.now()){
 if(!Array.isArray(rows))throw new Error('Invalid availability response');
 const seen=new Set();
 return rows.filter(r=>r&&typeof r.slot_id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r.slot_id)&&Number.isFinite(Date.parse(r.starts_at))&&Number.isFinite(Date.parse(r.ends_at))&&Date.parse(r.starts_at)>now+900000&&Date.parse(r.ends_at)>Date.parse(r.starts_at)&&!seen.has(r.slot_id)&&seen.add(r.slot_id)).sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at));
}
// api must be an authenticated server adapter; no direct database calls.
export function mountApprovedBooking(root,{api,releaseEnabled=false,stripeTestEnabled=false}={}){
 const doc=root.ownerDocument;
 const el=(tag,text)=>{const n=doc.createElement(tag);n.textContent=text;return n;};
 const status=el('p','Booking is not open yet.');status.setAttribute('role','status');
 const choices=el('div','');root.replaceChildren(status,choices);
 let generation=0, busy=false, pending=null;
 const pendingByQuote=new Map();
 function clear(){generation++;busy=false;pending=null;pendingByQuote.clear();choices.replaceChildren();status.textContent='Select an approved quote to view appointments.';}
 async function load(quoteId){
  generation++;busy=false;pending=pendingByQuote.get(quoteId)||null;choices.replaceChildren();const g=generation;
  if(!releaseEnabled||!api){status.textContent='Booking is not open yet.';return;}
  status.textContent='Checking confirmed appointments…';
  try{
   const slots=pending?[pending.slotData]:normalizeApprovedSlots(await api.listSlots(quoteId));
   if(g!==generation)return;
   status.textContent=pending?'A previous hold request exists. Retry it to verify its current status.':slots.length?'Choose an appointment to request a temporary hold.':'No confirmed appointments are available.';
   for(const slot of slots){
    const button=el('button',(pending?'Retry previous hold — ':'')+new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Los_Angeles'}).format(new Date(slot.starts_at))+' Pacific');button.type='button';
    button.addEventListener('click',async()=>{
     if(g!==generation||busy)return;
     if(pending&&pending.slot!==slot.slot_id){status.textContent='Resolve the previous hold request before selecting another appointment.';return;}
     busy=true;pending??={slot:slot.slot_id,id:crypto.randomUUID(),slotData:slot};pendingByQuote.set(quoteId,pending);
     status.textContent='Requesting temporary hold…';
     try{
      const result=await api.hold(quoteId,slot.slot_id,pending.id);
      if(g!==generation)return;
      if(!result||result.quote_id!==quoteId||result.slot_id!==slot.slot_id||!Number.isFinite(Date.parse(result.held_until))||Date.parse(result.held_until)<=Date.now())throw new Error('Unverified hold');
      choices.replaceChildren();status.textContent='Temporary hold until '+new Intl.DateTimeFormat('en-US',{timeStyle:'short',timeZone:'America/Los_Angeles'}).format(new Date(result.held_until))+' Pacific. Appointment and payment are not confirmed.';
      if(stripeTestEnabled===true&&typeof api.checkout==='function'){const pay=el('button','Open sandbox checkout');pay.type='button';pay.addEventListener('click',async()=>{if(g!==generation||busy)return;busy=true;pay.disabled=true;try{const payment=await api.checkout(quoteId,pending.id);if(g!==generation)return;const u=verifiedTestCheckoutUrl(payment,result.amount_cents);const link=el('a','Continue to Stripe test checkout — '+new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(payment.amount_cents/100));link.href=u;link.rel='noopener noreferrer';choices.replaceChildren(link);status.textContent='Sandbox checkout ready. No payment or appointment is confirmed. Use test card details only.';}catch{if(g===generation)status.textContent='Checkout not verified. Retry the same hold; do not submit payment elsewhere.';}finally{if(g===generation){busy=false;pay.disabled=false;}}});choices.append(pay);}
     }catch{if(g===generation)status.textContent='Hold not verified. Retry the same appointment to check its status.';}
     finally{if(g===generation)busy=false;}
    });choices.append(button);
   }
  }catch{if(g===generation)status.textContent='Availability could not be verified. Please try again.';}
 }
 return {load,clear};
}

// Never expose service credentials; endpoint validates JWT and synthetic actor allowlist.
export function createApprovedBookingApi({url,publishableKey,session,releaseEnabled=false,stripeTestEnabled=false,fetcher=fetch}){
 async function call(payload,endpoint='cc-booking-actions'){
  if(endpoint==='cc-stripe-test-checkout'&&stripeTestEnabled!==true)throw new Error('Test checkout disabled');
  if(!releaseEnabled||!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url||'')||!publishableKey)throw new Error('Booking unavailable');
  const r=await fetcher(url+'/functions/v1/'+endpoint,{method:'POST',headers:{apikey:publishableKey,Authorization:'Bearer '+session.accessToken(),'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store',signal:AbortSignal.timeout(endpoint==='cc-stripe-test-checkout'?35000:15000)});
  if(!r.ok)throw new Error('Booking request not verified');return r.json();
 }
 return {listSlots:quote_id=>call({action:'list_slots',quote_id}),hold:(quote_id,slot_id,request_id)=>call({action:'hold',quote_id,slot_id,request_id}),checkout:(quote_id,request_id)=>call({quote_id,request_id},'cc-stripe-test-checkout')};
}

// Validate the exact held amount and a genuine Stripe sandbox checkout destination.
export function verifiedTestCheckoutUrl(data,expectedCents){
 if(!data||data.test_mode!==true||data.payment_confirmed!==false||data.booking_confirmed!==false||data.amount_cents!==expectedCents||!Number.isSafeInteger(expectedCents)||expectedCents<=0||typeof data.checkout_url!=='string')throw new Error('Unverified test checkout');
 const u=new URL(data.checkout_url);if(u.protocol!=='https:'||u.hostname!=='checkout.stripe.com'||u.port||u.username||u.password||!/^\/(c|g)\/pay\/cs_test_[A-Za-z0-9_]+$/.test(u.pathname))throw new Error('Unverified test checkout destination');return u.href;
}
