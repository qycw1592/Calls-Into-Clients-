// Protected acceptance only. Never include in public dist. No service-role key required.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const env=k=>{const v=process.env[k];if(!v)throw Error('Missing '+k);return v};
const base='https://zzixmhnmmddilijtqrqs.supabase.co';
const key=env('CC_QA_PUBLISHABLE_KEY'),origin=env('CC_PORTAL_QA_ORIGIN');
const property=env('CC_QA_PROPERTY_ID'),lead=env('CC_QA_LEAD_ID');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
assert.match(property,uuid);assert.match(lead,uuid);
async function login(role){
 const email=env('CC_QA_'+role+'_EMAIL');assert.match(email,/@example\.invalid$/);
 const r=await fetch(base+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email,password:env('CC_QA_'+role+'_PASSWORD')}),signal:AbortSignal.timeout(15000)});
 assert.equal(r.status,200,role+' login');const d=await r.json();assert.ok(d.access_token);assert.match(d.user.id,uuid);return d.access_token;
}
async function action(token,body,status){
 const r=await fetch(base+'/functions/v1/cc-portal-actions',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+token,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 assert.equal(r.status,status,body.action);return r.json();
}
async function leads(token){
 const r=await fetch(base+'/rest/v1/leads?select=id&id=eq.'+lead,{headers:{apikey:key,Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
 if(r.status===403)return [];assert.equal(r.status,200);return r.json();
}
const staff=await login('STAFF'),customer=await login('CUSTOMER'),other=await login('OTHER');
assert.equal((await action(staff,{action:'role'},200)).is_staff,true);
assert.equal((await action(customer,{action:'role'},200)).is_staff,false);
assert.equal((await leads(staff)).filter(x=>x.id===lead).length,1);
assert.equal((await leads(customer)).length,0);
console.log('PASS real password login, staff role, owner HTTP lead retrieval, customer denial');
const request={action:'approve_quote',property_id:property,service:'pet',amount_cents:1234,expires_at:new Date(Date.now()+86400000).toISOString(),request_id:randomUUID()};
await action(customer,request,403);
const a=await action(staff,request,200);assert.match(a.receipt_id,uuid);assert.equal(a.booking_confirmed,false);
const b=await action(staff,request,200);assert.equal(b.receipt_id,a.receipt_id);
const own=await action(customer,{action:'list_approved_quotes'},200);assert.ok(own.quotes.some(q=>q.quote_id===a.receipt_id));
const isolated=await action(other,{action:'list_approved_quotes'},200);assert.ok(!isolated.quotes.some(q=>q.quote_id===a.receipt_id));
await action(customer,{action:'request_service',property_id:property,message:'Synthetic QA'},403);
console.log('PASS approval, replay, discovery, cross-account isolation, QA mutation denial; receipt='+a.receipt_id+' request='+request.request_id);
// Backend lane must verify exact DB rows and clean up fixture IDs and users even if this runner fails.

if(process.env.CC_QA_BOOKING_RUN==='1'){
 const propertyB=env('CC_QA_PROPERTY_B_ID');assert.match(propertyB,uuid);assert.notEqual(propertyB,property);
 const second={...request,property_id:propertyB,amount_cents:2345,request_id:randomUUID()};
 const secondQuote=await action(staff,second,200);assert.match(secondQuote.receipt_id,uuid);
 const discovered=await action(other,{action:'list_approved_quotes'},200);assert.ok(discovered.quotes.some(q=>q.quote_id===secondQuote.receipt_id));
 console.log('PASS second authorized quote; receipt='+secondQuote.receipt_id+' request='+second.request_id);
 Object.assign(process.env,{CC_QA_QUOTE_A:a.receipt_id,CC_QA_QUOTE_B:secondQuote.receipt_id,CC_QA_AMOUNT_CENTS:'1234',CC_QA_AMOUNT_B_CENTS:'2345'});
 await import('./booking-protected-http.mjs');
}
